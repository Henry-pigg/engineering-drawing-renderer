/**
 * 图纸 JSON 的数据契约。
 *
 * 约定：
 * 1. 坐标系使用 SVG 用户坐标（y 轴向下），单位与 meta.width / meta.height 一致。
 *    视觉大模型输出的 mm 尺寸，由后端（或数据层）按 scale 归一化到该坐标系后下发，
 *    前端渲染器只做纯渲染，不再关心物理单位。
 * 2. 每个 primitive 必须带稳定 id —— 它同时是 React key 和 SVG mask id 的来源，
 *    保证"上一步/下一步"时只有新增元素挂载并播放动画，已画好的元素不会重播。
 */

/** 图线线型，取值对应 GB/T 4457.4 的四类基本线型 */
export type LineType = 'thick' | 'thin' | 'dashed' | 'center';

export interface Point {
  x: number;
  y: number;
}

interface PrimitiveBase {
  id: string;
  /** 缺省为 thick */
  lineType?: LineType;
  /** 可选：给教学的补充说明，渲染器不消费 */
  note?: string;
}

export interface LinePrimitive extends PrimitiveBase {
  kind: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface CirclePrimitive extends PrimitiveBase {
  kind: 'circle';
  cx: number;
  cy: number;
  r: number;
}

export interface ArcPrimitive extends PrimitiveBase {
  kind: 'arc';
  cx: number;
  cy: number;
  r: number;
  /** 起始角（度），数学系：0° 指向 +x，逆时针为正 */
  startAngle: number;
  /** 终止角（度）；大于起始角表示逆时针绘制 */
  endAngle: number;
}

export interface DimensionPrimitive extends PrimitiveBase {
  kind: 'dimension';
  from: Point;
  to: Point;
  /** 尺寸线相对被测线段的偏移量，正值偏向 from→to 的左手侧；0 表示直接穿过（用于直径标注） */
  offset?: number;
  /** aligned：与被测线段平行（默认）；horizontal / vertical：强制水平、竖直 */
  orientation?: 'aligned' | 'horizontal' | 'vertical';
  /** 覆盖自动测量值，例如 "Ø22"、"4×Ø8"、"R25" */
  text?: string;
  arrow?: 'both' | 'start' | 'end' | 'none';
}

export type Primitive = LinePrimitive | CirclePrimitive | ArcPrimitive | DimensionPrimitive;

export interface Step {
  id: string;
  title: string;
  /** 该步的讲解文案，展示在控制栏 */
  narration?: string;
  primitives: Primitive[];
}

export interface DrawingMeta {
  title: string;
  standard?: string;
  unit?: 'mm';
  /** 图纸画布尺寸（viewBox），不是物理尺寸 */
  width: number;
  height: number;
  /** 一句话说明"AI 看懂了什么"：视图类型与主要特征，≤40 字 */
  summary?: string;
  /** 模型自评置信度 0~1，前端用于提示学生复核 */
  confidence?: number;
}

export interface DrawingDoc {
  version: '1.0';
  meta: DrawingMeta;
  /** 识别过程中的不确定点（尺寸看不清、线型存疑等），前端原样展示给学生 */
  warnings?: string[];
  steps: Step[];
}
