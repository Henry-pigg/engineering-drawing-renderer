import type { LineType } from '../types';

/**
 * 国标线型库（GB/T 4457.4-2002）。
 *
 * 线宽按"线型组别"取：粗线 d ≈ 0.7mm，细线 d/2 ≈ 0.35mm。
 * 这里按 1mm ≈ 4.5px 换算到屏幕，得到 3.2 / 1.5 的组合；
 * 若后续要导出 PDF 或按比例缩放，把 width 换成 mm 单位并让 viewBox 使用 mm 即可，
 * 比例关系保持不变。
 */
export interface LineStyle {
  label: string;
  hint: string;
  /** 线宽（viewBox 用户单位） */
  width: number;
  /** stroke-dasharray；缺省为实线 */
  dash?: string;
  linecap: 'butt' | 'round';
}

export const LINE_STYLES: Record<LineType, LineStyle> = {
  thick: { label: '粗实线', hint: '可见轮廓', width: 3.2, linecap: 'round' },
  thin: { label: '细实线', hint: '尺寸线 / 引出线', width: 1.5, linecap: 'round' },
  dashed: { label: '细虚线', hint: '不可见轮廓', width: 1.5, dash: '10 6', linecap: 'butt' },
  center: { label: '细点画线', hint: '轴线 / 对称线', width: 1.5, dash: '26 5 3 5', linecap: 'butt' },
};

/** 图纸用色：几何线近黑，尺寸层用低饱和蓝，便于教学分层讲解 */
export const INK = {
  geometry: '#121820',
  dimension: '#2f5d9e',
} as const;

/** 把线型翻译成一组可直接展开到 <path> 上的 SVG 属性 */
export function strokeProps(lineType: LineType = 'thick', color: string = INK.geometry) {
  const s = LINE_STYLES[lineType] ?? LINE_STYLES.thick;
  return {
    stroke: color,
    strokeWidth: s.width,
    strokeLinecap: s.linecap,
    strokeLinejoin: 'round' as const,
    strokeDasharray: s.dash,
  };
}
