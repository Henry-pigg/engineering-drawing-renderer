import type { Primitive } from '../types';

/**
 * 动画节奏。用"错峰 + 单位时长"描述整步的时间轴：
 * 第 i 个元素在 delayOf(i) 时刻起笔，durationOf 决定它画多久。
 * 总时长 = 所有元素里最后一个画完的时刻，播放器据此在动画结束后解锁"下一步"。
 */
export const TIMING = {
  /** 相邻元素起笔的间隔 */
  stagger: 150,
  /** 直线：短，因为是"一笔到位" */
  line: 620,
  /** 圆 / 圆弧：长，便于看清起笔方向 */
  curve: 960,
  /** 标注：尺寸界线 → 尺寸线 → 文字，稍长 */
  dimension: 820,
};

export function durationOf(p: Primitive): number {
  switch (p.kind) {
    case 'line':
      return TIMING.line;
    case 'dimension':
      return TIMING.dimension;
    default:
      return TIMING.curve;
  }
}

export function delayOf(order: number): number {
  return order * TIMING.stagger;
}

/** 一步画完的总时长（ms） */
export function stepDuration(primitives: Primitive[]): number {
  return primitives.reduce((max, p, i) => Math.max(max, delayOf(i) + durationOf(p)), 0);
}
