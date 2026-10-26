import type { DiagramNode, Pipe } from "../types";
import { nodeBBox, pathD, pipePolyline, smoothPath } from "../geometry";
import { NodeSymbol } from "../symbols";

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
  /** 卡片缩略图模式：隐藏安全附件/单向阀与泄压口，避免 30+ 元件的模板卡变成线团。 */
  compact?: boolean;
}) {
  // 只隐藏分支附件，保留串联单向阀/流量计，保证卡片上的主链连续可见。
  const accessoryTypes = new Set(["pressureGauge", "safetyValve", "opv"]);
  const visibleNodes = compact
    ? nodes.filter((n) => !accessoryTypes.has(n.type) && !(n.type === "outlet" && /relief|安全排废|泄压/i.test(n.label)))
    : nodes;
  if (!visibleNodes.length) return null;
  const visiblePortIds = new Set(visibleNodes.flatMap((n) => n.ports.map((p) => p.id)));
  const visiblePipes = compact
    ? pipes.filter((p) => (!p.fromPortId || visiblePortIds.has(p.fromPortId)) && (!p.toPortId || visiblePortIds.has(p.toPortId)))
    : pipes;
  const boxes = visibleNodes.map(nodeBBox);
  const pad = 40;
  const x = Math.min(...boxes.map((b) => b.x)) - pad;
  const y = Math.min(...boxes.map((b) => b.y)) - pad;
  const w = Math.max(...boxes.map((b) => b.x + b.w)) - x + pad;
  const h = Math.max(...boxes.map((b) => b.y + b.h)) - y + pad + (showLabels ? 30 : 0);
  const highlight = new Set(highlightNodeIds);
  return (
    <svg className={className} viewBox={`${x} ${y} ${w} ${h}`} role="img" aria-label="preview">
      {visiblePipes.map((p) => {
        const points = pipePolyline(p, visibleNodes);
        if (!points) return null;
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
        <g key={n.id}>
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
