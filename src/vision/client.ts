import type { DrawingDoc } from '../types';
import { normalizeDrawingDoc, type ValidationIssue } from '../core/validate';
import { parseJsonLoose } from '../core/json';
import { CONTRACT_VERSION, PROMPT_VERSION, type UserMessageInput } from './prompt';

/**
 * 识别服务适配层。
 *
 * 接口地址由用户在页面上填写（存在 localStorage），不再有 mock 兜底：
 * 没填地址就明确报错，而不是悄悄返回示例数据。
 *
 * ── 接口约定（后端按这个实现即可） ──────────────────────────────
 * POST {endpoint}   Content-Type: application/json
 * 可选请求头：Authorization: Bearer {token}
 * 请求体：{ image: dataURL, hint?, canvas: {width,height}, promptVersion, contractVersion }
 * 成功： 200 { doc: DrawingDoc }            // doc 也可以被包在 {data}、{result} 里
 * 失败： 4xx/5xx { error: { code, message } }
 */

export type RecognitionErrorCode =
  | 'aborted'
  | 'timeout'
  | 'network'
  | 'http'
  | 'parse'
  | 'invalid'
  | 'unsupported'
  | 'no_endpoint';

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
  /** 可选：随请求发送的 Bearer token */
  token?: string;
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

/** 规整用户填的地址：补协议、去尾部斜杠 */
export function normalizeEndpoint(raw: string): string {
  const value = raw.trim();
  if (!value) return '';
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return withProtocol.replace(/\/+$/, '');
}

export function createHttpRecognizer(endpoint: string): Recognizer {
  return async (file, options = {}) => {
    const started = performance.now();

    if (!file.type.startsWith('image/')) {
      throw new RecognitionError('unsupported', '请上传图片文件（JPG / PNG）');
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
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (options.token?.trim()) {
        headers.Authorization = `Bearer ${options.token.trim()}`;
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
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
      // 典型的跨域/地址写错都会落到这里
      throw new RecognitionError('network', '无法连接识别服务，请检查地址、跨域(CORS)与网络', {
        detail: e.message,
      });
    } finally {
      window.clearTimeout(timer);
      options.signal?.removeEventListener('abort', forwardAbort);
    }
  };
}
