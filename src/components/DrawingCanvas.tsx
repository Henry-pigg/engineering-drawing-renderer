import type { DrawingDoc } from '../types';
import { CanvasSizeContext } from './canvas-context';
import { DrawingPrimitive } from './DrawingPrimitive';

interface Props {
  doc: DrawingDoc;
  /** 当前步序号：<= stepIndex 的元素全部可见，等于 stepIndex 的那一步播放生长动画 */
  stepIndex: number;
  className?: string;
}

/**
 * 画布：负责 viewBox、图框、标题栏，以及把 doc.steps 按"已完成的步"铺开。
 *
 * 一个刻意的设计：不为动画做单独的"当前元素"状态。
 * 靠 React 的挂载/卸载天然实现 ——
 *   · 前进：新一步的组件首次挂载，animate=true，动画自然播放；
 *   · 前进后：上一步的 animate 变 false，只剩静态图形；
 *   · 后退：后续步骤整组卸载，再前进时重新挂载，动画重新播放。
 */
export function DrawingCanvas({ doc, stepIndex, className }: Props) {
  const { width, height } = doc.meta;
  const pad = 26;
  const frame = { x: pad, y: pad, w: width - pad * 2, h: height - pad * 2 };

  // 标题栏固定在右下角
  const tb = { w: 224, h: 70 };
  const tbX = frame.x + frame.w - tb.w;
  const tbY = frame.y + frame.h - tb.h;

  return (
    <CanvasSizeContext.Provider value={{ width, height }}>
      <svg
        className={className}
        viewBox={`0 0 ${width} ${height}`}
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label={doc.meta.title}
      >
        <defs>
          <pattern id="ed-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M20 0H0V20" fill="none" stroke="#e8eef8" strokeWidth="1" />
          </pattern>
        </defs>

        {/* 图纸底色 */}
        <rect width={width} height={height} fill="#ffffff" />

        {/* 图框 + 方格底纹 */}
        <rect x={frame.x} y={frame.y} width={frame.w} height={frame.h} fill="url(#ed-grid)" />
        <rect
          x={frame.x}
          y={frame.y}
          width={frame.w}
          height={frame.h}
          fill="none"
          stroke="#121820"
          strokeWidth={2.5}
        />

        {/* 图形本体 */}
        <g className="ed-scene">
          {doc.steps.map((step, si) =>
            si > stepIndex ? null : (
              <g key={step.id} data-step={si}>
                {step.primitives.map((p, pi) => (
                  <DrawingPrimitive
                    key={p.id}
                    primitive={p}
                    animate={si === stepIndex}
                    order={pi}
                  />
                ))}
              </g>
            ),
          )}
        </g>

        {/* 标题栏 */}
        <g className="ed-titleblock" fontFamily="Segoe UI, PingFang SC, Microsoft YaHei, sans-serif">
          <rect
            x={tbX}
            y={tbY}
            width={tb.w}
            height={tb.h}
            fill="#ffffff"
            stroke="#121820"
            strokeWidth={2.5}
          />
          <line x1={tbX} y1={tbY + 30} x2={tbX + tb.w} y2={tbY + 30} stroke="#121820" strokeWidth={1.5} />
          <line
            x1={tbX + tb.w - 82}
            y1={tbY}
            x2={tbX + tb.w - 82}
            y2={tbY + 30}
            stroke="#121820"
            strokeWidth={1.5}
          />
          <text x={tbX + 12} y={tbY + 20} fontSize="15" fontWeight="600" fill="#121820">
            {doc.meta.title}
          </text>
          <text x={tbX + tb.w - 12} y={tbY + 20} fontSize="12" fill="#5a6a80" textAnchor="end">
            1 : 1
          </text>
          <text x={tbX + 12} y={tbY + 51} fontSize="11.5" fill="#5a6a80">
            {doc.meta.standard ?? 'GB/T 4457.4 — 线型'}
          </text>
          <text x={tbX + tb.w - 12} y={tbY + 51} fontSize="11.5" fill="#5a6a80" textAnchor="end">
            单位 {doc.meta.unit ?? 'mm'}
          </text>
        </g>
      </svg>
    </CanvasSizeContext.Provider>
  );
}
