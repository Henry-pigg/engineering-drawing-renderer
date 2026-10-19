import type { DimensionPrimitive, Point } from '../types';

/**
 * 尺寸标注引擎。
 *
 * 输入：起点、终点、偏移量；输出：尺寸界线、尺寸线、箭头三角形、文字位姿。
 * 关键规则（GB/T 4457.4 / GB/T 16675.2）：
 *   - 尺寸界线从轮廓外约 2mm 处起笔，并超出尺寸线约 2mm；
 *   - 箭头为实心三角形，长约 3mm、宽约 1mm（此处按屏幕比例放大）；
 *   - 数字写在尺寸线上方，字头朝上：水平尺寸横写，竖直尺寸侧写（自下而上）。
 */

export interface DimensionSpec {
  from: Point;
  to: Point;
  /** 尺寸线相对被测线段的偏移，正负决定偏向哪一侧 */
  offset?: number;
  orientation?: 'aligned' | 'horizontal' | 'vertical';
  text?: string;
  arrow?: 'both' | 'start' | 'end' | 'none';
  /** 尺寸界线与被注轮廓的间隙 */
  gap?: number;
  /** 尺寸界线超出尺寸线的长度 */
  extend?: number;
  arrowLength?: number;
  arrowWidth?: number;
  /** 文字相对尺寸线的偏置（沿法向），正值偏向偏移侧 */
  textGap?: number;
}

export type Segment = [Point, Point];

export interface DimensionGeometry {
  /** 尺寸界线 + 尺寸线合并成的单条 path，用于驱动整组标注的生长动画 */
  path: string;
  extension: Segment[];
  line: Segment;
  /** 每个箭头的三个顶点：尖端、两个底角 */
  arrows: Array<[Point, Point, Point]>;
  text: { x: number; y: number; angle: number; value: string };
  measured: number;
}

/** 文字旋转角归一到 (-90, 90]，使字头永远朝上、从图纸右侧可读 */
function normalizeTextAngle(deg: number): number {
  let a = deg;
  while (a > 90) a -= 180;
  while (a < -90) a += 180;
  if (Math.abs(a - 90) < 1e-6) a = -90;
  return a;
}

const round = (v: number) => Math.round(v * 100) / 100;

export function buildDimension(spec: DimensionSpec): DimensionGeometry {
  const {
    from,
    to,
    offset = 20,
    orientation = 'aligned',
    arrow = 'both',
    gap = 6,
    extend = 9,
    arrowLength = 12,
    arrowWidth = 7,
    textGap = 13,
  } = spec;

  /* ---------- 1. 量测方向 ---------- */
  let dir: Point;
  if (orientation === 'horizontal') {
    dir = { x: 1, y: 0 };
  } else if (orientation === 'vertical') {
    dir = { x: 0, y: 1 };
  } else {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    dir = { x: dx / len, y: dy / len };
  }

  /* ---------- 2. 法向：dir 顺时针转 90°，offset 的正负决定偏移侧 ---------- */
  const normal = { x: dir.y, y: -dir.x };
  const sign = offset === 0 ? 1 : offset > 0 ? 1 : -1;
  const dist = Math.abs(offset);
  const n = { x: normal.x * sign, y: normal.y * sign };

  /* ---------- 3. 尺寸线两端 ---------- */
  let d1: Point;
  let d2: Point;
  if (orientation === 'horizontal') {
    const y = from.y + n.y * dist;
    d1 = { x: from.x, y };
    d2 = { x: to.x, y };
  } else if (orientation === 'vertical') {
    const x = from.x + n.x * dist;
    d1 = { x, y: from.y };
    d2 = { x, y: to.y };
  } else {
    d1 = { x: from.x + n.x * dist, y: from.y + n.y * dist };
    d2 = { x: to.x + n.x * dist, y: to.y + n.y * dist };
  }
  // 保证 d1 → d2 与量测方向同向，否则箭头会朝外
  if ((d2.x - d1.x) * dir.x + (d2.y - d1.y) * dir.y < 0) {
    [d1, d2] = [d2, d1];
  }
  const measured = Math.hypot(d2.x - d1.x, d2.y - d1.y);

  /* ---------- 4. 尺寸界线 ---------- */
  const extension: Segment[] = [];
  if (dist > 0.5) {
    for (const p of [from, to]) {
      extension.push([
        { x: p.x + n.x * gap, y: p.y + n.y * gap },
        { x: p.x + n.x * (dist + extend), y: p.y + n.y * (dist + extend) },
      ]);
    }
  }

  /* ---------- 5. 箭头 ---------- */
  const arrows: Array<[Point, Point, Point]> = [];
  const addArrow = (tip: Point, toward: Point) => {
    const vx = toward.x - tip.x;
    const vy = toward.y - tip.y;
    const len = Math.hypot(vx, vy) || 1;
    const ux = vx / len;
    const uy = vy / len;
    const baseX = tip.x + ux * arrowLength;
    const baseY = tip.y + uy * arrowLength;
    const px = -uy;
    const py = ux;
    arrows.push([
      tip,
      { x: baseX + (px * arrowWidth) / 2, y: baseY + (py * arrowWidth) / 2 },
      { x: baseX - (px * arrowWidth) / 2, y: baseY - (py * arrowWidth) / 2 },
    ]);
  };
  if (arrow === 'both' || arrow === 'start') addArrow(d1, d2);
  if (arrow === 'both' || arrow === 'end') addArrow(d2, d1);

  /* ---------- 6. 文字位姿 ---------- */
  const mid = { x: (d1.x + d2.x) / 2, y: (d1.y + d2.y) / 2 };
  const angle = normalizeTextAngle((Math.atan2(d2.y - d1.y, d2.x - d1.x) * 180) / Math.PI);
  const value = spec.text ?? String(Math.round(measured * 10) / 10);
  const text = {
    x: mid.x + n.x * textGap,
    y: mid.y + n.y * textGap,
    angle,
    value,
  };

  /* ---------- 7. 合并路径 ---------- */
  const seg = (a: Point, b: Point) => `M${round(a.x)} ${round(a.y)}L${round(b.x)} ${round(b.y)}`;
  const path = [...extension.map(([a, b]) => seg(a, b)), seg(d1, d2)].join('');

  return { path, extension, line: [d1, d2], arrows, text, measured };
}

/** 把 primitive 直接喂给引擎的便捷重载 */
export function dimensionOf(p: DimensionPrimitive): DimensionGeometry {
  return buildDimension({
    from: p.from,
    to: p.to,
    offset: p.offset,
    orientation: p.orientation,
    text: p.text,
    arrow: p.arrow,
  });
}
