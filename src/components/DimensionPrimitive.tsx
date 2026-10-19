import { useMemo } from 'react';
import type { DimensionPrimitive as DimensionPrimitiveData } from '../types';
import { dimensionOf } from '../core/dimension';
import { INK, LINE_STYLES } from '../core/linetypes';
import { TIMING, delayOf } from '../core/timing';
import { Reveal } from './Reveal';

interface Props {
  primitive: DimensionPrimitiveData;
  animate: boolean;
  /** 在本步中的序号，用于错峰 */
  order: number;
}

/**
 * 尺寸标注 = 尺寸界线 + 尺寸线 + 箭头 + 数字。
 *
 * 动画顺序刻意分两拍：线条先用遮罩"画"出来（走完尺寸界线和尺寸线），
 * 数字再淡入 —— 因为数字盖在尺寸线上，若同时出现会显得很乱。
 */
export function DimensionPrimitive({ primitive, animate, order }: Props) {
  const geo = useMemo(() => dimensionOf(primitive), [primitive]);
  const strokeWidth = LINE_STYLES.thin.width;
  const delay = delayOf(order);
  const textDelay = Math.round(delay + TIMING.dimension * 0.72);

  return (
    <g className="ed-dim">
      <Reveal
        id={primitive.id}
        path={geo.path}
        animate={animate}
        delay={delay}
        duration={TIMING.dimension}
      >
        {geo.extension.map(([a, b], i) => (
          <line
            key={`ext-${i}`}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke={INK.dimension}
            strokeWidth={strokeWidth}
          />
        ))}
        <line
          x1={geo.line[0].x}
          y1={geo.line[0].y}
          x2={geo.line[1].x}
          y2={geo.line[1].y}
          stroke={INK.dimension}
          strokeWidth={strokeWidth}
        />
        {geo.arrows.map((pts, i) => (
          <polygon
            key={`arrow-${i}`}
            points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
            fill={INK.dimension}
          />
        ))}
      </Reveal>

      <g
        className={animate ? 'ed-fade' : undefined}
        style={animate ? { animationDelay: `${textDelay}ms` } : undefined}
      >
        <text
          className="ed-dim__text"
          x={geo.text.x}
          y={geo.text.y}
          textAnchor="middle"
          dominantBaseline="central"
          transform={`rotate(${geo.text.angle} ${geo.text.x} ${geo.text.y})`}
        >
          {geo.text.value}
        </text>
      </g>
    </g>
  );
}
