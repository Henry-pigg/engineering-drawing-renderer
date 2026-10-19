import type { Point, Primitive } from '../types';

/**
 * 几何 → SVG path。
 * 全部输出单条 path，原因：生长动画依赖 pathLength 归一化，
 * 单条 path 才能保证"一笔画完"的连贯感。
 */

/** 极坐标取点。角度为数学系（逆时针为正），因此屏幕 y 需要取反 */
export function polar(cx: number, cy: number, r: number, deg: number): Point {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
}

/** 圆：从左端点起笔，两段半圆弧闭合（起笔点固定，动画起点可预期） */
export function circlePath(cx: number, cy: number, r: number): string {
  return (
    `M${cx - r} ${cy}` +
    `a${r} ${r} 0 1 0 ${2 * r} 0` +
    `a${r} ${r} 0 1 0 ${-2 * r} 0`
  );
}

/** 圆弧：角度按数学系，屏幕 y 向下故逆时针用 sweep-flag = 0 */
export function arcPath(cx: number, cy: number, r: number, a1: number, a2: number): string {
  const p1 = polar(cx, cy, r, a1);
  const p2 = polar(cx, cy, r, a2);
  const delta = a2 - a1;
  const largeArc = Math.abs(delta) > 180 ? 1 : 0;
  const sweep = delta > 0 ? 0 : 1;
  const n = (v: number) => Math.round(v * 1000) / 1000;
  return `M${n(p1.x)} ${n(p1.y)}A${r} ${r} 0 ${largeArc} ${sweep} ${n(p2.x)} ${n(p2.y)}`;
}

/** 标注由尺寸引擎单独处理，这里返回 null */
export function pathOf(p: Primitive): string | null {
  switch (p.kind) {
    case 'line':
      return `M${p.x1} ${p.y1}L${p.x2} ${p.y2}`;
    case 'circle':
      return circlePath(p.cx, p.cy, p.r);
    case 'arc':
      return arcPath(p.cx, p.cy, p.r, p.startAngle, p.endAngle);
    default:
      return null;
  }
}
