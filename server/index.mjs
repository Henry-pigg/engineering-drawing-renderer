/**
 * 参考后端：把"图片 → DrawingDoc JSON"这一步包起来。
 *
 * 为什么必须有这层？API Key 绝不能出现在前端。
 * 前端只上传图片，Key 和提示词留在服务端。
 *
 * 零依赖，Node 20+ 直接跑：
 *   VISION_API_KEY=xxx node server/index.mjs
 *
 * 默认对接智谱 GLM-4V（OpenAI 兼容协议）。换模型只改 BASE_URL / MODEL。
 * ⚠️ 这是骨架，未与真实 Key 联调；上线前请自行加鉴权、限流、用量统计。
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROMPT_PATH = path.resolve(__dirname, '../prompt/system-prompt.md');

const PORT = Number(process.env.PORT ?? 8787);
const API_KEY = process.env.VISION_API_KEY ?? '';
const BASE_URL = process.env.VISION_BASE_URL ?? 'https://open.bigmodel.cn/api/paas/v4';
const MODEL = process.env.VISION_MODEL ?? 'glm-4v-plus';
const MAX_BODY = 15 * 1024 * 1024;

const systemPrompt = await readFile(PROMPT_PATH, 'utf8');

/** 从模型回复里截出括号配平的 JSON（和前端 core/json.ts 同一套逻辑） */
function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < body.length; i += 1) {
    const ch = body[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return body.slice(start, i + 1);
    }
  }
  return null;
}

async function callModel(image, hint, canvas) {
  const userText = [
    '请识别这张图纸，并转换为可分步演示的绘图指令 JSON。',
    '',
    `- 画布：${canvas?.width ?? 920} × ${canvas?.height ?? 660}（输出坐标必须落在此范围内）`,
    hint ? `- 附加要求：${hint}` : '',
    '',
    '直接输出 JSON，不要任何其他内容。',
  ]
    .filter(Boolean)
    .join('\n');

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      // 支持结构化输出的模型可再加 response_format: { type: 'json_object' }
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: image } },
            { type: 'text', text: userText },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    const err = new Error(`上游模型返回 ${res.status}`);
    err.status = 502;
    err.detail = detail.slice(0, 500);
    throw err;
  }

  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    const err = new Error('上游响应里没有 message.content');
    err.status = 502;
    throw err;
  }
  return content;
}

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('请求体超过 15MB'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});

  if (!req.url?.startsWith('/api/recognize')) {
    return send(res, 404, { error: { code: 'not_found', message: '未知路由' } });
  }
  if (req.method !== 'POST') {
    return send(res, 405, { error: { code: 'method', message: '只支持 POST' } });
  }
  if (!API_KEY) {
    return send(res, 500, {
      error: { code: 'no_key', message: '服务端未配置 VISION_API_KEY' },
    });
  }

  try {
    const raw = await readBody(req);
    const { image, hint, canvas } = JSON.parse(raw || '{}');

    if (typeof image !== 'string' || !image.startsWith('data:image/')) {
      return send(res, 400, {
        error: { code: 'bad_image', message: 'image 必须是 data:image/... 开头的 dataURL' },
      });
    }

    const content = await callModel(image, hint, canvas);
    let doc = null;
    try {
      doc = JSON.parse(extractJson(content) ?? content);
    } catch {
      doc = null;
    }

    // 视觉模型偶尔会"忘了输出 JSON"，重试一次并明确要求
    if (!doc || !Array.isArray(doc.steps)) {
      console.warn('[recognize] 首次输出不是合法图纸 JSON，触发一次重试');
      const retry = await callModel(
        image,
        `${hint ?? ''}\n上一次输出不是合法的图纸 JSON 对象。只输出 JSON，不要任何解释、不要代码围栏。`.trim(),
        canvas,
      );
      try {
        doc = JSON.parse(extractJson(retry) ?? retry);
      } catch {
        doc = null;
      }
      if (!doc || !Array.isArray(doc.steps)) {
        return send(res, 502, {
          error: { code: 'bad_output', message: '模型两次都未返回合法图纸 JSON' },
        });
      }
    }

    return send(res, 200, { doc });
  } catch (err) {
    console.error('[recognize]', err);
    return send(res, err.status ?? 500, {
      error: { code: err.code ?? 'internal', message: err.message ?? '识别失败' },
    });
  }
});

server.listen(PORT, () => {
  console.log(`识别服务已启动: http://localhost:${PORT}/api/recognize`);
  console.log(`模型: ${MODEL}  |  提示词: ${PROMPT_PATH}`);
});
