import { createContext } from 'react';

/**
 * 画布尺寸通过 context 传给 Reveal —— 遮罩区域必须显式给出。
 *
 * 踩坑记录：SVG <mask> 默认按被遮罩元素的外接盒（objectBoundingBox）取区域。
 * 一条纯水平线的外接盒高度为 0，默认遮罩区域会被裁成一条零高度的缝，
 * 结果就是"线画不出来"。所以必须 maskUnits="userSpaceOnUse" 并写明画布范围。
 */
export const CanvasSizeContext = createContext({ width: 920, height: 660 });
