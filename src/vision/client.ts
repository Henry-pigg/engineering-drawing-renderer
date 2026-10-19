import type { DrawingDoc } from '../types';
import { normalizeDrawingDoc, type ValidationIssue } from '../core/validate';
import { parseJsonLoose } from '../core/json';
import { sampleDrawing } from '../data/sample-drawing';
import { CONTRACT_VERSION, PROMPT_VERSION, type UserMessageInput } from './prompt';

/**
 * 识别服务适配层。
 *
 * 前端只认一个函数签名 `Recognizer`，背后的实现可以随便换：
 *   · createHttpRecognizer(端点)  —— 接你们自己的后端
 *   · createMockRecognizer()      —— 无后端时演示用
 * 切换只看 VITE_RECOGNIZE_ENDPOINT 是否有值，业务代码不用改。
 *
 * ── 接口约定（后端按这个实现即可） ──────────────────────────────
 * POST {endpoint}   Content-Type: application/json
 * 请求体：{ image: dataURL, hint?, canvas: {width,height}, promptVersion, contractVersion }
 * 成功： 200 { doc: DrawingDoc }            // doc 也可以被包在 {data}、{result} 里
 * 失败： 4xx/5xx { error: { code, message } }
 *
 * 后端职责：拿 image 调视觉模型 → 用 prompt/system-prompt.md 作为 system message
 * → 把模型返回解析成 JSON → 塞进 doc 字段返回。脏数据不用在后端洗，前端会兜。
 */

export type RecognitionErrorCode =
  | 'aborted'
  | 'timeout'
  | 'network'
  | 'http'
  | 'parse'
  | 'invalid'
  | 'unsupported';

export class RecognitionError extends Error {
  readonly code: RecognitionErrorCode;
  readonly status?: number;
  readonly detail?: string;

  constructor(code: RecognitionErrorCode, message: string, extra?: { status?: number; detail?: string }) {
    super(message);
    this.name = 'RecognitionError';
    this.code = code;
    this.status = extra?.status;
    this.detail = extra?.detail;
  }
}

export interface RecognizeOptions extends UserMessageInput {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface RecognizeResult {
  doc: DrawingDoc;
  issues: ValidationIssue[];
  /** 模型原始返回，便于调试与二次分析 */
  raw?: unknown;
  elapsedMs: number;
}

export type Recognizer = (file: File, options?: RecognizeOptions) => Promise<RecognizeResult>;

const MAX_FILE_BYTES = 10 * 1024 * 1024;

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new RecognitionError('unsupported', '图片读取失败'));
    reader.readAsDataURL(file);
  });
}

/** 兼容后端几种常见的包装方式，尽量不因为多包一层就对接失败 */
function unwrapPayload(json: unknown): unknown {
  if (typeof json === 'string') return parseJsonLoose(json);
  if (Array.isArray(json)) return json;
  if (typeof json !== 'object' || json === null) return json;

  const obj = json as Record<string, unknown>;
  if (Array.isArray(obj.steps)) return obj;

  for (const key of ['doc', 'data', 'result', 'drawing', 'output']) {
    const inner = obj[key];
    if (inner && typeof inner === 'object' && Array.isArray((inner as Record<string, unknown>).steps)) {
      return inner;
    }
    if (typeof inner === 'string') {
      const parsed = parseJsonLoose(inner);
      if (parsed) return parsed;
    }
  }

  // 直接把模型响应透传过来的情况
  const choices = obj.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const message = (choices[0] as Record<string, unknown>)?.message as Record<string, unknown> | undefined;
    const content = message?.content;
    if (typeof content === 'string') return parseJsonLoose(content);
  }

  const content = obj.content;
  if (typeof content === 'string') return parseJsonLoose(content);

  return obj;
}

export function createHttpRecognizer(endpoint: string): Recognizer {
  return async (file, options = {}) => {
    const started = performance.now();

    if (!file.type.startsWith('image/')) {
      throw new RecognitionError('unsupported', '请上传图片文件（JPG / PNG / HEIC 转存）');
    }
    if (file.size > MAX_FILE_BYTES) {
      throw new RecognitionError('unsupported', '图片超过 10MB，请压缩后再试');
    }

    const image = await fileToDataUrl(file);

    const controller = new AbortController();
    let timedOut = false;
    const timeoutMs = options.timeoutMs ?? 90_000;
    const timer = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const forwardAbort = () => controller.abort();
    options.signal?.addEventListener('abort', forwardAbort);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image,
          hint: options.hint,
          canvas: { width: options.width ?? 920, height: options.height ?? 660 },
          promptVersion: PROMPT_VERSION,
          contractVersion: CONTRACT_VERSION,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new RecognitionError('http', `识别服务返回 ${res.status}`, {
          status: res.status,
          detail: detail.slice(0, 500),
        });
      }

      let json: unknown;
      try {
        json = await res.json();
      } catch {
        throw new RecognitionError('parse', '识别服务返回的不是合法 JSON');
      }

      const payload = unwrapPayload(json);
      const { doc, issues } = normalizeDrawingDoc(payload, {
        width: options.width,
        height: options.height,
      });

      if (!doc) {
        const firstError = issues.find((i) => i.level === 'error');
        throw new RecognitionError('invalid', firstError?.message ?? '模型输出无法解析为图纸', {
          detail: JSON.stringify(payload).slice(0, 500),
        });
      }

      return { doc, issues, raw: payload, elapsedMs: Math.round(performance.now() - started) };
    } catch (err) {
      if (err instanceof RecognitionError) throw err;
      const e = err as Error;
      if (e.name === 'AbortError') {
        throw new RecognitionError(
          timedOut ? 'timeout' : 'aborted',
          timedOut ? `识别超时（${Math.round(timeoutMs / 1000)}s），可重试或换一张更清晰的图` : '已取消识别',
        );
      }
      throw new RecognitionError('network', '无法连接识别服务，请检查网络或接口地址', {
        detail: e.message,
      });
    } finally {
      window.clearTimeout(timer);
      options.signal?.removeEventListener('abort', forwardAbort);
    }
  };
}

/**
 * Mock 识别器：返回内置示例（深拷贝，避免被下游改动），用于无后端时演示完整闭环。
 * 刻意保留 1.2s 延迟，好让加载态被真正看到。
 */
export function createMockRecognizer(delayMs = 1200): Recognizer {
  return async (file, options = {}) => {
    const started = performance.now();
    if (!file.type.startsWith('image/')) {
      throw new RecognitionError('unsupported', '请上传图片文件（JPG / PNG）');
    }
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(resolve, delayMs);
      options.signal?.addEventListener('abort', () => {
        window.clearTimeout(timer);
        reject(new RecognitionError('aborted', '已取消识别'));
      });
    });

    const doc = JSON.parse(JSON.stringify(sampleDrawing)) as DrawingDoc;
    doc.meta.summary = `演示模式：未接识别服务，返回示例「${doc.meta.title}」`;
    doc.meta.confidence = 0.55;
    doc.warnings = ['当前为 mock 数据，配置 VITE_RECOGNIZE_ENDPOINT 后接入真实识别'];

    return {
      doc,
      issues: [],
      elapsedMs: Math.round(performance.now() - started),
    };
  };
}

const ENDPOINT = (import.meta.env.VITE_RECOGNIZE_ENDPOINT ?? '').trim();

/** 当前生效的识别器：配了端点走真实服务，否则走 mock */
export const defaultRecognizer: Recognizer = ENDPOINT
  ? createHttpRecognizer(ENDPOINT)
  : createMockRecognizer();

export const isMockMode = ENDPOINT === '';
