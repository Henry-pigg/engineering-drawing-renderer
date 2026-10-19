import type { Primitive } from '../types';
import { pathOf } from '../core/geometry';
import { strokeProps } from '../core/linetypes';
import { durationOf, delayOf } from '../core/timing';
import { Reveal } from './Reveal';
import { DimensionPrimitive } from './DimensionPrimitive';

interface Props {
  primitive: Primitive;
  animate: boolean;
  order: number;
}

/**
 * 元素分发器：几何图元与尺寸标注走两条分支。
 * 新增图元类型时只改这里 + types.ts + geometry.ts，其余组件不用动。
 */
export function DrawingPrimitive({ primitive, animate, order }: Props) {
  if (primitive.kind === 'dimension') {
    return <DimensionPrimitive primitive={primitive} animate={animate} order={order} />;
  }

  const d = pathOf(primitive);
  if (!d) return null;

  return (
    <Reveal
      id={primitive.id}
      path={d}
      animate={animate}
      delay={delayOf(order)}
      duration={durationOf(primitive)}
    >
      <path d={d} fill="none" {...strokeProps(primitive.lineType)} />
    </Reveal>
  );
}
