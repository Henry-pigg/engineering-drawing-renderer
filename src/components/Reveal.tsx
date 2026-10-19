import { useContext, type ReactNode } from 'react';
import { CanvasSizeContext } from './canvas-context';

interface RevealProps {
  /** primitive id，用于生成唯一的 mask id */
  id: string;
  /** 遮罩的"笔尖轨迹"：沿这条路径把图形逐步揭示出来 */
  path: string;
  /** 笔尖粗细，需略大于图线本身，尺寸线末端的箭头才能被完整带出 */
  width?: number;
  animate: boolean;
  delay?: number;
  duration?: number;
  children: ReactNode;
}

/**
 * 生长动画的唯一实现。
 *
 * 为什么用 mask 而不是直接给图形设 stroke-dasharray：
 * 细虚线、细点画线本身就占用了 dasharray，再拿它做揭示会互相打架；
 * 而 mask 里放一条"实心白线"沿同一路径描一遍，只是把图形逐渐露出来，
 * 对任何线型都成立，虚线也能正确生长。
 *
 * 归一化技巧：mask 路径加 pathLength={1}，于是 dasharray 恒为 "1 1"，
 * dashoffset 从 1 走到 0 就是"从无到全"，圆、圆弧、折线全都适用，
 * 不需要先量出路径长度。
 */
export function Reveal({
  id,
  path,
  width = 34,
  animate,
  delay = 0,
  duration = 800,
  children,
}: RevealProps) {
  const canvas = useContext(CanvasSizeContext);
  const maskId = `reveal-${id}`;

  return (
    <g>
      {animate && (
        <defs>
          <mask
            id={maskId}
            maskUnits="userSpaceOnUse"
            maskContentUnits="userSpaceOnUse"
            x={-canvas.width}
            y={-canvas.height}
            width={canvas.width * 3}
            height={canvas.height * 3}
          >
            <path
              d={path}
              fill="none"
              stroke="#fff"
              strokeWidth={width}
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              className="ed-reveal"
              style={{ animationDelay: `${delay}ms`, animationDuration: `${duration}ms` }}
            />
          </mask>
        </defs>
      )}
      <g mask={animate ? `url(#${maskId})` : undefined}>{children}</g>
    </g>
  );
}
