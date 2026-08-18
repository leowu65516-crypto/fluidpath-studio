import { memo } from "react";
import type { DiagramNode, Pipe, Pt } from "../types";
import {
  pathD,
  pathDWithHops,
  pipeEffectiveDisabled,
  pipePolyline,
  pointAtLength,
  polylineLength,
  roundedOrthPath,
  smoothPath,
  valve2EffectiveOpen,
} from "../geometry";
import type { HopObstacle } from "../geometry";
import { FLUID_PRESETS } from "../types";
import type { FluidIssue } from "../fluidRules";

interface PipeViewProps {
  pipe: Pipe;
  index: number;
  nodes: DiagramNode[];
  allPipes: Pipe[];
  selected: boolean;
  crossHop: boolean;
  allPolys: Array<{ pts: Pt[]; halfW: number } | null>;
  scenarioActive: boolean;       // 演示模式激活管路
  scenarioDim: boolean;          // 演示模式非激活淡化
  blink: boolean;                // 定位闪烁（回路诊断/场景演示）
  blinkStamp: number;
  chainGlow: boolean;            // 因果链路径点亮（停流根因→该管）
  chainStamp: number;
  lintMsg?: string;              // 结构问题即时 lint 提示
  onLintClick?: (pipe: Pipe) => void;
  funcChain: boolean;            // 元件→整机功能链高亮
  showFluidLabels: boolean;
  showPipeLabels: boolean;
  showFluidColors: boolean;
  flowRefMap: Map<string, SVGPathElement>;
  onPipeBodyMouseDown: (e: React.MouseEvent, pipe: Pipe, pts: Pt[], selected: boolean) => void;
  onVertexMouseDown: (e: React.MouseEvent, pipe: Pipe, pts: Pt[], vIndex: number) => void;
  onContextMenu: (e: React.MouseEvent, kind: "pipe", id: string) => void;
  onRemoveVertex: (pipe: Pipe, vIndex: number) => void;
  onLabelDoubleClick: (pipeId: string, x: number, y: number, label: string) => void;
  issues?: FluidIssue[];
  onFluidIssueClick?: (pipe: Pipe, e: React.MouseEvent) => void;
}

/** 蒸汽锅炉底部排废：阀门打开后，锅炉底部至排出口整段按蒸汽显示。 */
function isSteamDrainPipe(target: Pipe, nodes: DiagramNode[], allPipes: Pipe[]): boolean {
  const portToNode = new Map<string, DiagramNode>();
  for (const n of nodes) for (const p of n.ports) portToNode.set(p.id, n);
  const touching = (nodeId: string) => pipesForNode(nodeId, nodes, allPipes);
  const starts = nodes.filter((n) => n.type === "steamBoiler").flatMap((n) => touching(n.id).filter((p) => {
    const port = n.ports.find((x) => x.id === p.fromPortId || x.id === p.toPortId);
    return port?.position === "bottom";
  }));
  const queue = starts.filter((p) => [p.fromPortId, p.toPortId]
    .map((pid) => pid ? portToNode.get(pid) : undefined)
    .some((n) => n?.type === "solenoid2" && valve2EffectiveOpen(n))).map((p) => p.id);
  const visited = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const current = allPipes.find((p) => p.id === id);
    if (!current) continue;
    const currentNodes = [current.fromPortId, current.toPortId].map((pid) => pid ? portToNode.get(pid) : undefined).filter((n): n is DiagramNode => !!n);
    for (const n of currentNodes) {
      if (n.type === "solenoid2" && valve2EffectiveOpen(n)) {
        for (const p of touching(n.id)) if (!visited.has(p.id)) queue.push(p.id);
      }
    }
  }
  return visited.has(target.id);
}

function pipesForNode(nodeId: string, nodes: DiagramNode[], allPipes: Pipe[]): Pipe[] {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return [];
  const ports = new Set(node.ports.map((p) => p.id));
  return allPipes.filter((p) => ports.has(p.fromPortId ?? "") || ports.has(p.toPortId ?? ""));
}

function PipeViewImpl({
  pipe, index, nodes, allPipes, selected, crossHop, allPolys,
  scenarioActive, scenarioDim, blink, blinkStamp, showFluidLabels, showPipeLabels, showFluidColors,
  chainGlow, chainStamp, lintMsg, onLintClick, funcChain,
  flowRefMap, onPipeBodyMouseDown, onVertexMouseDown, onContextMenu, onRemoveVertex, onLabelDoubleClick,
  issues, onFluidIssueClick,
}: PipeViewProps) {
  const pts = pipePolyline(pipe, nodes);
  if (!pts || pts.length < 2) return null;
  const disabled = pipeEffectiveDisabled(pipe, nodes);
  const steamDrain = isSteamDrainPipe(pipe, nodes, allPipes);
  const displayFluidType = steamDrain ? "steam" : pipe.fluidType;
  const displayFluidColor = steamDrain ? "#ef8aa0" : pipe.fluidColor;
  const visibleFluidColor = showFluidColors ? displayFluidColor : "#aab4bf";
  const wallW = pipe.visualDiameter + 5;
  const lowers: HopObstacle[] = [];
  if (crossHop) {
    for (let i = 0; i < index; i++) {
      const lo = allPolys[i];
      if (lo) lowers.push(lo);
    }
  }
  const useHops = crossHop && lowers.length > 0;
  let d: string;
  if (pipe.routing === "curved") {
    d = smoothPath(pts);
  } else if (useHops) {
    d = pathDWithHops(pts, lowers, wallW / 2 + 1.2);
  } else if ((pipe.cornerRadius ?? 0) > 0) {
    d = roundedOrthPath(pts, pipe.cornerRadius!);
  } else {
    d = pathD(pts);
  }
  const fluidW = Math.max(2, pipe.visualDiameter);
  const dashLen = Math.max(6, pipe.visualDiameter * 1.5);
  const gapMul = pipe.particleDensity === "high" ? 1.1 : pipe.particleDensity === "medium" ? 2.1 : 3.6;
  const dash = `${dashLen} ${Math.round(dashLen * gapMul)}`;
  const len = polylineLength(pts);
  const mid = pointAtLength(pts, len / 2);
  const arrowAngle = pipe.direction === "forward" ? mid.angle : mid.angle + 180;
  const wallOpacity = pipe.wallOpacity ?? 1;
  const dimOpacity = scenarioDim ? 0.12 : disabled ? 0.42 : 1;
  // 停流时保留管材与介质标识，但不再绘制白色流动粒子/箭头，避免静态虚线被误读为仍在流动。
  const fluidOpacity = disabled ? Math.min(pipe.fluidOpacity, 0.16) : pipe.fluidOpacity;
  const labelY = mid.pt.y + (disabled ? 0 : -wallW * 0.7 - 4);

  return (
    <g key={pipe.id}>
      {disabled && <title>已置灰（停止流动）</title>}
      {/* 演示高亮发光层 */}
      {scenarioActive && (
        <path d={d} fill="none" stroke={visibleFluidColor} strokeWidth={wallW + 8} strokeOpacity={0.35} strokeLinejoin="round" strokeLinecap="round" />
      )}
      {/* 定位闪烁发光层（回路诊断/场景演示） */}
      {blink && (
        <path key={`blink-${blinkStamp}`} className="blink-pulse" d={d} fill="none" stroke="#ff6a00" strokeWidth={wallW + 10} strokeLinejoin="round" strokeLinecap="round" pointerEvents="none" />
      )}
      {/* 因果链路径点亮（停流根因 → 该管，橙色发光脉冲） */}
      {chainGlow && (
        <path key={`chain-${chainStamp}`} className="chain-glow" d={d} fill="none" stroke="#ff6a00" strokeWidth={wallW + 12} strokeLinejoin="round" strokeLinecap="round" pointerEvents="none" />
      )}
      {/* 功能链软蓝高亮（元件→整机角色联动） */}
      {funcChain && !chainGlow && (
        <path d={d} fill="none" stroke="#2f7fd6" strokeWidth={wallW + 8} strokeOpacity={0.18} strokeLinejoin="round" strokeLinecap="round" pointerEvents="none" />
      )}
      <g opacity={dimOpacity}>
        <path d={d} fill="none" stroke="#7d8b99" strokeOpacity={0.55} strokeWidth={wallW + 2.4} strokeLinejoin="round" strokeLinecap="round" />
        <path d={d} fill="none" stroke={pipe.wallColor} strokeOpacity={wallOpacity} strokeWidth={wallW} strokeLinejoin="round" strokeLinecap="round" />
        <path d={d} fill="none" stroke={visibleFluidColor} strokeOpacity={fluidOpacity} strokeWidth={fluidW} strokeLinejoin="round" strokeLinecap="round" />
        {!disabled && <path ref={(el) => { if (el) flowRefMap.set(pipe.id, el); else flowRefMap.delete(pipe.id); }} data-flow={pipe.id} d={d} fill="none" stroke="#ffffff" strokeOpacity={0.85} strokeWidth={Math.max(2, fluidW * 0.42)} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dash} />}
        {!disabled && pipe.showArrow && (
          <g transform={`translate(${mid.pt.x} ${mid.pt.y}) rotate(${arrowAngle})`}>
            <path d={`M ${wallW * 0.9 + 4} 0 L ${-wallW * 0.25} ${-wallW * 0.62 - 3} L ${-wallW * 0.25} ${wallW * 0.62 + 3} Z`} fill={visibleFluidColor} stroke="#ffffff" strokeWidth={1.6} strokeLinejoin="round" />
          </g>
        )}
        {/* 管路文字标签（双击就地编辑） */}
        {showPipeLabels && pipe.label && <text x={mid.pt.x} y={labelY} textAnchor="middle" fontSize={11} fill={disabled ? "#8a9ba8" : "var(--text)"} fontFamily="system-ui, sans-serif" fontWeight={500} stroke="#ffffff" strokeWidth={3} paintOrder="stroke" style={{ cursor: "text" }} data-ui="1" onDoubleClick={(e) => { e.stopPropagation(); onLabelDoubleClick(pipe.id, mid.pt.x, labelY, pipe.label); }}>
            {`${pipe.label}${pipe.nominalDiameter ? " · " + pipe.nominalDiameter : ""}`}
          </text>}
        {/* 结构问题即时 lint 红点（标签右侧，编辑时实时提示） */}
        {lintMsg && (
          <g data-ui="1" transform={`translate(${mid.pt.x + 30} ${labelY})`} style={{ cursor: "pointer" }}
            onMouseDown={(e) => { e.stopPropagation(); onLintClick?.(pipe); }}>
            <circle r={9} fill="#d64545" stroke="#ffffff" strokeWidth={1.6} />
            <text y={4} textAnchor="middle" fontSize={12} fontWeight={800} fill="#ffffff" fontFamily="system-ui, sans-serif" pointerEvents="none">!</text>
            <title>{lintMsg}</title>
          </g>
        )}
        {/* 管路标注文字（中段下方） */}
        {pipe.annotation && (
          <g pointerEvents="none">
            <rect x={mid.pt.x - 34} y={mid.pt.y + wallW * 0.7 + 4} width={68} height={16} rx={4} fill="var(--tip-bg)" stroke="#d9a441" strokeWidth={1} />
            <text x={mid.pt.x} y={mid.pt.y + wallW * 0.7 + 15.5} textAnchor="middle" fontSize={10} fill="#c07b1f" fontFamily="system-ui, sans-serif" fontWeight={600}>{pipe.annotation}</text>
          </g>
        )}
        {/* 自动介质标签 */}
        {showFluidLabels && displayFluidType && displayFluidType !== "custom" && (
          <g pointerEvents="none">
            <rect x={mid.pt.x - 30} y={mid.pt.y + wallW * 0.7 + (pipe.annotation ? 21 : 5)} width={60} height={15} rx={4} fill={visibleFluidColor} fillOpacity={0.18} stroke={visibleFluidColor} strokeWidth={1} />
          <text x={mid.pt.x} y={mid.pt.y + wallW * 0.7 + (pipe.annotation ? 31 : 15)} textAnchor="middle" fontSize={9.5} fill={visibleFluidColor} fontFamily="system-ui, sans-serif" fontWeight={650}>
              {FLUID_PRESETS.find((f) => f.key === displayFluidType)?.label ?? displayFluidType}
            </text>
          </g>
        )}
      </g>
      {/* 管路堵塞故障标记（红色，导出时剔除） */}
      {pipe.fault === "pipeBlocked" && (
        <g data-ui="1" pointerEvents="none">
          <circle cx={mid.pt.x} cy={mid.pt.y - (wallW + 34)} r={8} fill="#d64545" stroke="#ffffff" strokeWidth={1.5} />
          <text x={mid.pt.x} y={mid.pt.y - (wallW + 34) + 4} textAnchor="middle" fontSize={11} fontWeight={800} fill="#ffffff" fontFamily="system-ui, sans-serif">堵</text>
          <title>管路堵塞（故障模拟）</title>
        </g>
      )}
      {/* 介质冲突感叹号（点击逐条修复，导出时剔除） */}
      {issues && issues.length > 0 && (
        <g data-ui="1" style={{ cursor: "pointer" }} onMouseDown={(e) => { e.stopPropagation(); onFluidIssueClick?.(pipe, e); }}>
          <circle cx={mid.pt.x} cy={mid.pt.y - (wallW + 18)} r={9} fill="#f59f00" stroke="#ffffff" strokeWidth={1.6} />
          <text x={mid.pt.x} y={mid.pt.y - (wallW + 18) + 4.5} textAnchor="middle" fontSize={13} fontWeight={800} fill="#ffffff" fontFamily="system-ui, sans-serif" pointerEvents="none">!</text>
          <title>{issues.map((i) => i.message).join("\n")}</title>
        </g>
      )}
      {/* 选中高亮 + 命中区域 */}
      {selected && (
        <path data-ui="1" d={d} fill="none" stroke="#2f7fd6" strokeWidth={wallW + 6} strokeOpacity={0.28} strokeLinejoin="round" strokeLinecap="round" />
      )}
      <path data-ui="1" d={d} fill="none" stroke="transparent" strokeWidth={Math.max(wallW + 8, 16)} style={{ cursor: "pointer" }} onMouseDown={(e) => onPipeBodyMouseDown(e, pipe, pts, selected)} onContextMenu={(e) => onContextMenu(e, "pipe", pipe.id)} />
      {/* 折点手柄 */}
      {selected && pts.slice(1, -1).map((p, i) => {
        const vIndex = i + 1;
        return (
          <g key={vIndex}>
            <circle data-ui="1" cx={p.x} cy={p.y} r={6} fill="#ffffff" stroke="#2f7fd6" strokeWidth={1.8} style={{ cursor: "move" }} onMouseDown={(e) => onVertexMouseDown(e, pipe, pts, vIndex)} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onRemoveVertex(pipe, vIndex); }} />
            <circle cx={p.x} cy={p.y} r={1.8} fill="#2f7fd6" pointerEvents="none" />
          </g>
        );
      })}
    </g>
  );
}

/** 管路渲染组件（memo 优化：props 不变时跳过重渲染） */
export const PipeView = memo(PipeViewImpl);
