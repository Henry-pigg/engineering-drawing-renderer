import type {
  ArcPrimitive,
  CirclePrimitive,
  DimensionPrimitive,
  DrawingDoc,
  LinePrimitive,
  LineType,
  Point,
} from '../types';

/**
 * 示例：腰形法兰。
 *
 * 数据层负责把 mm 换算到 viewBox 坐标（真实项目里这一步在后端完成，
 * 前端只接收归一化后的 JSON）。1mm = 4px，图心落在 (420, 330)。
 */
const SCALE = 4;
const ORIGIN: Point = { x: 420, y: 330 };
const pt = (x: number, y: number): Point => ({
  x: ORIGIN.x + x * SCALE,
  y: ORIGIN.y - y * SCALE,
});
const len = (mm: number) => mm * SCALE;

const CENTER = pt(0, 0);
const LEFT = pt(-18, 0);
const RIGHT = pt(18, 0);

const line = (id: string, lineType: LineType, a: Point, b: Point): LinePrimitive => ({
  id,
  kind: 'line',
  lineType,
  x1: a.x,
  y1: a.y,
  x2: b.x,
  y2: b.y,
});

const circle = (id: string, lineType: LineType, c: Point, rMm: number): CirclePrimitive => ({
  id,
  kind: 'circle',
  lineType,
  cx: c.x,
  cy: c.y,
  r: len(rMm),
});

const arc = (
  id: string,
  lineType: LineType,
  c: Point,
  rMm: number,
  startAngle: number,
  endAngle: number,
): ArcPrimitive => ({
  id,
  kind: 'arc',
  lineType,
  cx: c.x,
  cy: c.y,
  r: len(rMm),
  startAngle,
  endAngle,
});

const dim = (id: string, spec: Omit<DimensionPrimitive, 'id' | 'kind' | 'lineType'>): DimensionPrimitive => ({
  id,
  kind: 'dimension',
  lineType: 'thin',
  ...spec,
});

export const sampleDrawing: DrawingDoc = {
  version: '1.0',
  meta: {
    title: '腰形法兰',
    standard: 'GB/T 4457.4 — 线型',
    unit: 'mm',
    width: 920,
    height: 660,
  },
  steps: [
    {
      id: 's1',
      title: '定基准线',
      narration:
        '先画**细点画线**：一条水平回转轴线、一条竖直对称线，交点即零件中心。基准线是所有尺寸的起算点。',
      primitives: [
        line('c-h', 'center', pt(-52, 0), pt(52, 0)),
        line('c-v', 'center', pt(0, -33), pt(0, 33)),
      ],
    },
    {
      id: 's2',
      title: '画两端 R25 圆弧',
      narration:
        '以轴线上相距 36mm 的两点为圆心，各画一段 **R25 半圆弧**（粗实线）。圆弧从基准线起笔，便于检查对称。',
      primitives: [
        arc('a-l', 'thick', LEFT, 25, 90, 270),
        arc('a-r', 'thick', RIGHT, 25, -90, 90),
      ],
    },
    {
      id: 's3',
      title: '连上下轮廓',
      narration: '两条**粗实线**连接圆弧的上、下端点，腰形外轮廓至此闭合。',
      primitives: [
        line('l-t', 'thick', pt(-18, 25), pt(18, 25)),
        line('l-b', 'thick', pt(-18, -25), pt(18, -25)),
      ],
    },
    {
      id: 's4',
      title: '画背面沉孔',
      narration:
        '不可见轮廓改用**细虚线**：背面的 Ø30 沉孔按投影画成整圆。线型一换，可见性就表达清楚了。',
      primitives: [circle('c-cb', 'dashed', CENTER, 15)],
    },
    {
      id: 's5',
      title: '画中心孔',
      narration: 'Ø22 通孔用**粗实线**，圆心正落在两条基准线的交点上。',
      primitives: [circle('c-hole', 'thick', CENTER, 11)],
    },
    {
      id: 's6',
      title: '画安装孔',
      narration:
        '两端圆弧圆心处各画一个 Ø8 安装孔，并补画孔的**短十字中心线**（细点画线，超出轮廓 2～3mm）。',
      primitives: [
        circle('h-l', 'thick', LEFT, 4),
        circle('h-r', 'thick', RIGHT, 4),
        line('h-lc', 'center', pt(-18, -5.5), pt(-18, 5.5)),
        line('h-rc', 'center', pt(18, -5.5), pt(18, 5.5)),
      ],
    },
    {
      id: 's7',
      title: '标注尺寸',
      narration:
        '尺寸界线、尺寸线一律**细实线**：先引界线（离开轮廓约 2mm），再画尺寸线，箭头尖端顶住界线，数字写在尺寸线上方。',
      primitives: [
        dim('d-len', { from: pt(-43, 0), to: pt(43, 0), offset: len(37), text: '86' }),
        dim('d-wid', {
          from: pt(43, -25),
          to: pt(43, 25),
          offset: len(12),
          orientation: 'vertical',
          text: '50',
        }),
        dim('d-dia', { from: pt(-11, 0), to: pt(11, 0), offset: 0, text: 'Ø22' }),
      ],
    },
  ],
};
