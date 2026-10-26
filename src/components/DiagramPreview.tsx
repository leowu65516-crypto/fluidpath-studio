import type { DiagramNode, Pipe } from "../types";
import { nodeBBox, pathD, pipePolyline, smoothPath } from "../geometry";
import { NodeSymbol } from "../symbols";
import { smartViewProjection } from "../smart-draw/view";

export function DiagramPreview({
  nodes,
  pipes,
  className,
  showLabels = false,
  highlightNodeIds = [],
  compact = false,
}: {
  nodes: DiagramNode[];
  pipes: Pipe[];
  className?: string;
  showLabels?: boolean;
  highlightNodeIds?: string[];
  /** 卡片缩略图模式：显示完整模板，二级系统/附件降透明度，不删减元器件。 */
  compact?: boolean;
}) {
  const projection = smartViewProjection(nodes, pipes, "all");
  const visibleNodes = projection.visibleNodes;
  if (!visibleNodes.length) return null;
  const visiblePipes = projection.visiblePipes;
  const boxes = visibleNodes.map(nodeBBox);
  const pad = 40;
  // 走线用完整节点图计算（与画布一致），仅按投影过滤绘制，否则缩略图会重新路由成另一张图。
  const pipePolylines = visiblePipes
    .map((pipe) => ({ pipe, pts: pipePolyline(pipe, nodes) }))
    .filter((x): x is { pipe: Pipe; pts: NonNullable<ReturnType<typeof pipePolyline>> } => !!x.pts);
  const allPoints = [
    ...boxes.flatMap((b) => [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y + b.h }]),
    ...pipePolylines.flatMap((x) => x.pts),
  ];
  const x = Math.min(...allPoints.map((p) => p.x)) - pad;
  const y = Math.min(...allPoints.map((p) => p.y)) - pad;
  const w = Math.max(...allPoints.map((p) => p.x)) - x + pad;
  const h = Math.max(...allPoints.map((p) => p.y)) - y + pad + (showLabels ? 30 : 0);
  const highlight = new Set(highlightNodeIds);
  return (
    <svg className={className} viewBox={`${x} ${y} ${w} ${h}`} role="img" aria-label="preview">
      {pipePolylines.map(({ pipe: p, pts: points }) => {
        return (
          <path
            key={p.id}
            d={p.routing === "curved" ? smoothPath(points) : pathD(points)}
            fill="none"
            stroke={p.fluidColor}
            strokeOpacity={0.55}
            strokeWidth={6}
            strokeLinecap="round"
          />
        );
      })}
      {visibleNodes.map((n) => (
        <g key={n.id} opacity={compact && (n.smartSecondary || n.type === "pressureGauge" || n.type === "safetyValve" || n.type === "opv") ? 0.52 : 1}>
          <g transform={`translate(${n.x} ${n.y}) rotate(${n.rotation} ${n.width / 2} ${n.height / 2})`}>
            <NodeSymbol node={n} />
          </g>
          {highlight.has(n.id) && (
            <rect x={n.x - 4} y={n.y - 4} width={n.width + 8} height={n.height + 8} rx={8} fill="none" stroke="#2f7fd6" strokeWidth={2.5} strokeDasharray="5 4" />
          )}
          {showLabels && (
            <text x={n.x + n.width / 2} y={n.y + n.height + 16} textAnchor="middle" fontSize={12} fill="#475569">
              {n.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
