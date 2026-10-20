import type { DrawingDoc } from '../types';

/**
 * 初始空白图纸：没有任何步骤，画布只显示图框与标题栏。
 * 刻意不内置示例，避免用户把演示数据误当成真实识别结果。
 */
export function createEmptyDoc(): DrawingDoc {
  return {
    version: '1.0',
    meta: {
      title: '未命名零件',
      standard: 'GB/T 4457.4',
      unit: 'mm',
      width: 920,
      height: 660,
    },
    steps: [],
  };
}
