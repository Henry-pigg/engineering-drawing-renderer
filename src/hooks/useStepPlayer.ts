import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Step } from '../types';
import { stepDuration } from '../core/timing';

export type PlayerStatus = 'idle' | 'playing';

/** 尊重系统"减少动态效果"设置：此时不进入 playing 态，按钮立即可用 */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export interface StepPlayer {
  index: number;
  step: Step;
  status: PlayerStatus;
  /** 进度条用：0 ~ 1 */
  progress: number;
  canPrev: boolean;
  canNext: boolean;
  /** 当前步画完需要的毫秒数，已在 reduced-motion 下归零 */
  duration: number;
  next: () => void;
  prev: () => void;
  reset: () => void;
  goTo: (i: number) => void;
}

export interface StepPlayerOptions {
  /** 变化时把播放位置重置到第一步（例如换了新图纸） */
  resetKey?: string | number;
}

/**
 * 分步播放状态机。
 *
 * 三条不变量：
 * 1. 动画进行中不允许"下一步"，避免动画互相打断；
 * 2. "上一步"随时可用（包括动画中），因为它只是减少渲染的元素，无需等待；
 * 3. 最后一步时"下一步"禁用，而不是循环。
 */
export function useStepPlayer(steps: Step[], options: StepPlayerOptions = {}): StepPlayer {
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState<PlayerStatus>('idle');

  const { resetKey } = options;
  useEffect(() => {
    if (resetKey === undefined) return;
    setIndex(0);
    setStatus('idle');
  }, [resetKey]);

  const current = steps[Math.min(index, steps.length - 1)];
  const rawDuration = useMemo(() => stepDuration(current?.primitives ?? []), [current]);
  const duration = prefersReducedMotion() ? 0 : rawDuration;

  useEffect(() => {
    if (status !== 'playing') return;
    const timer = window.setTimeout(() => setStatus('idle'), duration + 60);
    return () => window.clearTimeout(timer);
  }, [status, duration, index]);

  const goTo = useCallback(
    (target: number) => {
      const clamped = Math.max(0, Math.min(steps.length - 1, target));
      if (clamped === index) return;
      // 后退不播动画，直接呈现结果；前进才进入 playing
      const forward = clamped > index;
      setIndex(clamped);
      setStatus(forward && duration > 0 ? 'playing' : 'idle');
    },
    [index, steps.length, duration],
  );

  const next = useCallback(() => {
    if (status === 'playing' || index >= steps.length - 1) return;
    setIndex(index + 1);
    setStatus(duration > 0 ? 'playing' : 'idle');
  }, [status, index, steps.length, duration]);

  const prev = useCallback(() => {
    if (index <= 0) return;
    setStatus('idle');
    setIndex(index - 1);
  }, [index]);

  const reset = useCallback(() => {
    setStatus('idle');
    setIndex(0);
  }, []);

  return {
    index,
    step: current,
    status,
    progress: steps.length > 1 ? index / (steps.length - 1) : 1,
    canPrev: index > 0,
    canNext: index < steps.length - 1 && status !== 'playing',
    duration,
    next,
    prev,
    reset,
    goTo,
  };
}
