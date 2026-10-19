import { useCallback, useEffect, useRef, useState } from 'react';
import type { DrawingDoc } from '../types';
import type { ValidationIssue } from '../core/validate';
import { RecognitionError, defaultRecognizer, type Recognizer } from '../vision/client';

export type RecognitionStatus = 'idle' | 'loading' | 'success' | 'error';

export interface RecognitionState {
  status: RecognitionStatus;
  doc: DrawingDoc | null;
  issues: ValidationIssue[];
  error: { code: string; message: string } | null;
  imageUrl: string | null;
  fileName: string | null;
  elapsedMs: number | null;
  /** 每次识别成功 +1，用来把播放器重置回第一步 */
  revision: number;
}

const initialState = (doc: DrawingDoc): RecognitionState => ({
  status: 'idle',
  doc,
  issues: [],
  error: null,
  imageUrl: null,
  fileName: null,
  elapsedMs: null,
  revision: 0,
});

/**
 * 识别流程状态机：上传 → 请求 → 校验 → 渲染。
 *
 * 三条约束：
 * 1. 只允许一个在途请求，新请求自动取消旧的（避免学生连点两张图后旧结果覆盖新结果）；
 * 2. 失败时保留上一次成功的 doc，画布不闪空；
 * 3. 成功时 revision++，播放器据此回到第一步 —— 换了题目却停在第 7 步很奇怪。
 */
export function useRecognition(initialDoc: DrawingDoc, recognizer: Recognizer = defaultRecognizer) {
  const [state, setState] = useState<RecognitionState>(() => initialState(initialDoc));
  const abortRef = useRef<AbortController | null>(null);
  const urlRef = useRef<string | null>(null);

  const releasePreview = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  const recognize = useCallback(
    async (file: File) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      releasePreview();
      const imageUrl = URL.createObjectURL(file);
      urlRef.current = imageUrl;

      setState((prev) => ({
        ...prev,
        status: 'loading',
        error: null,
        imageUrl,
        fileName: file.name,
      }));

      try {
        const result = await recognizer(file, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setState((prev) => ({
          status: 'success',
          doc: result.doc,
          issues: result.issues,
          error: null,
          imageUrl: prev.imageUrl,
          fileName: prev.fileName,
          elapsedMs: result.elapsedMs,
          revision: prev.revision + 1,
        }));
      } catch (err) {
        if (controller.signal.aborted) return;
        const e =
          err instanceof RecognitionError
            ? { code: err.code, message: err.message }
            : { code: 'unknown', message: (err as Error)?.message ?? '识别失败' };
        setState((prev) => ({ ...prev, status: 'error', error: e }));
      }
    },
    [recognizer, releasePreview],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setState((prev) => ({ ...prev, status: prev.doc ? 'success' : 'idle' }));
  }, []);

  const restoreSample = useCallback(() => {
    abortRef.current?.abort();
    releasePreview();
    setState((prev) => ({
      ...initialState(initialDoc),
      revision: prev.revision + 1,
    }));
  }, [initialDoc, releasePreview]);

  return { state, recognize, cancel, restoreSample };
}
