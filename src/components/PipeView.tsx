import { memo } from "react";
import type { DiagramNode, Pipe, Pt } from "../types";
import {
  pathD,
  pathDWithHops,
  pipeEngineeringDisabled,
  pipeEffectiveDisabled,
  pipeTeachingOverride,
  pipePolyline,
  pointAtLength,
  polylineLength,
  roundedOrthPath,
  smoothPath,
  valve2EffectiveOpen,
} from "../geometry";
import type { HopObstacle } from "../geometry";
import { FLUID_PRESETS } from "../types";
import { flowComet, headColor, trailColor } from "../flow";

/** 流动层引用：拖尾本体、头部高光与原有介质颗粒，画布 rAF 逐帧写同一个 base 偏移 */
export interface FlowRefs {
  body?: SVGPathElement;
  head?: SVGPathElement;
  particle?: SVGPathElement;
}
/** 管路标签显示名：英文界面下默认名「管路 N」显示为 Pipe N（数据保持不变） */
function pipeDisplayLabel(label: string, lang: "zh" | "en"): string {
  if (lang !== "en") return label;
  const m = label.match(/^管路 (\d+)$/);
  return m ? `Pipe ${m[1]}` : label;
}

/** 管路中段标签组合：编号（管路xx）与管径（DNxx）可分别开关；两者都关时不渲染标签 */
export function composePipeMidLabel(label: string | undefined, nominalDiameter: string | undefined, showName: boolean, showDn: boolean, lang: "zh" | "en"): string {
  const parts: string[] = [];
  if (showName && label) parts.push(pipeDisplayLabel(label, lang));
  if (showDn && nominalDiameter) parts.push(nominalDiameter);
  return parts.join(" · ");
}
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
  /** 管路中段标签中的管径（DNxx）显示开关 */
  showPipeDiameters: boolean;
  showFluidColors: boolean;
  animationPlaying?: boolean;
  flowRefMap: Map<string, FlowRefs>;
  /** 深色主题下拖尾要提亮，浅色主题下压深浅色介质 */
  dark?: boolean;
  /** 缩放低于阈值时只留粒子，不画拖尾（那时拖尾只有几像素，纯浪费重绘） */
  flowTrail?: boolean;
  onPipeBodyMouseDown: (e: React.MouseEvent, pipe: Pipe, pts: Pt[], selected: boolean) => void;
  onVertexMouseDown: (e: React.MouseEvent, pipe: Pipe, pts: Pt[], vIndex: number) => void;
  onContextMenu: (e: React.MouseEvent, kind: "pipe", id: string) => void;
  onRemoveVertex: (pipe: Pipe, vIndex: number) => void;
  onLabelDoubleClick: (pipeId: string, x: number, y: number, label: string) => void;
  issues?: FluidIssue[];
  onFluidIssueClick?: (pipe: Pipe, e: React.MouseEvent) => void;
  /** 界面语言（管路默认名显示用） */
  lang?: "zh" | "en";
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
  scenarioActive, scenarioDim, blink, blinkStamp, showFluidLabels, showPipeLabels, showPipeDiameters, showFluidColors,
  animationPlaying = true,
  dark = false, flowTrail = true,
  chainGlow, chainStamp, lintMsg, onLintClick, funcChain,
  flowRefMap, onPipeBodyMouseDown, onVertexMouseDown, onContextMenu, onRemoveVertex, onLabelDoubleClick,
  issues, onFluidIssueClick,
  lang,
}: PipeViewProps) {
  const pts = pipePolyline(pipe, nodes);
  if (!pts || pts.length < 2) return null;
  const disabled = pipeEffectiveDisabled(pipe, nodes);
  const engineeringStopped = pipeTeachingOverride(pipe) ? pipeEngineeringDisabled(pipe, nodes) : disabled;
  const endpointNodes = [pipe.fromPortId, pipe.toPortId]
    .map((pid) => nodes.find((n) => pid && n.ports.some((p) => p.id === pid)))
    .filter((n): n is DiagramNode => !!n);
  const endpointTypes = endpointNodes.map((n) => n.type);
  // 智能绘图视觉分层：主链 > 奶路/蒸汽等二级系统 > 安全附件；只改绘制，不改工程。
  const smartSecondaryPipe = endpointNodes.some((n) => !!n.smartSecondary);
  const smartAccessoryPipe = endpointTypes.some((t) => t === "pressureGauge" || t === "safetyValve" || t === "opv");
  // 压力表是死端仪表：管路工程上必须停流，但这不是“没接好”，用专门的静态标注区分。
  const gaugeDeadEnd = disabled && endpointTypes.includes("pressureGauge");
  const displayDimmed = !!pipe.displayDisabled;
  const steamDrain = isSteamDrainPipe(pipe, nodes, allPipes);
  const displayFluidType = steamDrain ? "steam" : pipe.fluidType;
  const displayFluidColor = steamDrain ? "#ef8aa0" : pipe.fluidColor;
  const visibleFluidColor = showFluidColors ? displayFluidColor : "#aab4bf";
  const wallW = pipe.visualDiameter + (smartAccessoryPipe ? 1 : smartSecondaryPipe ? 3 : 5);
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
  const fluidW = Math.max(2, pipe.visualDiameter * (smartAccessoryPipe ? 0.62 : smartSecondaryPipe ? 0.82 : 1));
  // 流动视觉参数统一来自 src/flow.ts（画布与三条导出链路共用同一套节距）
  const comet = flowComet(pipe);
  const dash = comet.particleDash;
  const trail = trailColor(visibleFluidColor, dark);
  const headTint = headColor(visibleFluidColor, dark);
  const len = polylineLength(pts);
  const mid = pointAtLength(pts, len / 2);
  const arrowAngle = pipe.direction === "forward" ? mid.angle : mid.angle + 180;
  const wallOpacity = (pipe.wallOpacity ?? 1) * (smartAccessoryPipe ? 0.8 : smartSecondaryPipe ? 0.9 : 1);
  const smartOpacity = smartAccessoryPipe ? 0.58 : smartSecondaryPipe ? 0.82 : 1;
  const dimOpacity = scenarioDim ? 0.12 : (displayDimmed || disabled) ? 0.42 : smartOpacity;
  // 停流时保留管材与介质标识，但不再绘制白色流动粒子/箭头，避免静态虚线被误读为仍在流动。
  const fluidOpacity = disabled ? Math.min(pipe.fluidOpacity, 0.16) : pipe.fluidOpacity;
  const labelY = mid.pt.y + (disabled ? 0 : -wallW * 0.7 - 4);
  const en = lang === "en";
  const stateTitle = gaugeDeadEnd
    ? (en ? "Pressure gauge dead end: transmits pressure, no flow" : "压力表死端：只传压，不流过")
    : disabled !== engineeringStopped
      ? disabled
        ? (en ? "Teaching display: stopped (engineering state unchanged)" : "教学显示停流（工程判定不变）")
        : (en ? "Teaching display: flowing (engineering state remains stopped)" : "教学显示流动（工程判定仍为停流）")
      : disabled
        ? (en ? "Engineering flow stopped" : "工程状态停流")
        : displayDimmed ? (en ? "Canvas dimmed only (engineering state unchanged)" : "仅画布淡化（工程状态未改变）") : null;

  return (
    <g key={pipe.id}>
      {stateTitle && <title>{stateTitle}</title>}
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
        <path d={d} fill="none" stroke={gaugeDeadEnd ? "#6f8fa8" : visibleFluidColor} strokeOpacity={fluidOpacity} strokeWidth={fluidW} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={gaugeDeadEnd ? "3 4" : smartAccessoryPipe ? "5 5" : undefined} />
        {gaugeDeadEnd && showPipeLabels && (
          <text x={mid.pt.x} y={mid.pt.y - wallW * 0.7 - 18} textAnchor="middle" fontSize={10} fill="#54758d" fontFamily="system-ui, sans-serif" fontWeight={600} stroke="var(--canvas-label-halo)" strokeWidth={3} paintOrder="stroke">
            {en ? "Pressure only · no flow" : "传压不流过"}
          </text>
        )}
        {!disabled && pipe.animated && animationPlaying && (
          <g pointerEvents="none">
            {/* 拖尾本体：介质色对比派生，形成「一段有厚度的流光」而不是匀散步点 */}
            {flowTrail && (
              <path
                ref={(el) => {
                  const refs = flowRefMap.get(pipe.id) ?? {};
                  if (el) refs.body = el; else delete refs.body;
                  if (refs.body || refs.head || refs.particle) flowRefMap.set(pipe.id, refs); else flowRefMap.delete(pipe.id);
                }}
                data-flow={pipe.id}
                data-flow-layer="body"
                d={d}
                fill="none"
                stroke={trail}
                strokeOpacity={disabled ? 0 : 0.7}
                strokeWidth={Math.max(2, fluidW * 0.74)}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={comet.bodyDash}
              />
            )}
            {/* 头部高光：贴在本体的前端，读作流动方向 */}
            <path
              ref={(el) => {
                const refs = flowRefMap.get(pipe.id) ?? {};
                if (el) refs.head = el; else delete refs.head;
                if (refs.body || refs.head || refs.particle) flowRefMap.set(pipe.id, refs); else flowRefMap.delete(pipe.id);
              }}
              data-flow={pipe.id}
              data-flow-layer="head"
              d={d}
              fill="none"
              stroke={headTint}
              strokeOpacity={0.92}
              strokeWidth={Math.max(1.6, fluidW * 0.36)}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={comet.headDash}
            />
            {/* 介质颗粒：保留原有白色短虚线，密度仍由管路属性决定 */}
            {(
              <path
                ref={(el) => {
                  const refs = flowRefMap.get(pipe.id) ?? {};
                  if (el) refs.particle = el; else delete refs.particle;
                  if (refs.body || refs.head || refs.particle) flowRefMap.set(pipe.id, refs); else flowRefMap.delete(pipe.id);
                }}
                data-flow={pipe.id}
                data-flow-layer="particle"
                d={d}
                fill="none"
                stroke="#ffffff"
                strokeOpacity={0.38}
                strokeWidth={Math.max(1.4, fluidW * 0.26)}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={dash}
              />
            )}
          </g>
        )}
        {!disabled && pipe.showArrow && (
          <g transform={`translate(${mid.pt.x} ${mid.pt.y}) rotate(${arrowAngle})`}>
            <path d={`M ${wallW * 0.9 + 4} 0 L ${-wallW * 0.25} ${-wallW * 0.62 - 3} L ${-wallW * 0.25} ${wallW * 0.62 + 3} Z`} fill={visibleFluidColor} stroke="#ffffff" strokeWidth={1.6} strokeLinejoin="round" />
          </g>
        )}
        {/* 管路文字标签（双击就地编辑；编号与管径可分别开关） */}
        {(() => {
          const midLabel = composePipeMidLabel(pipe.label, pipe.nominalDiameter, showPipeLabels, showPipeDiameters, lang ?? "zh");
          if (!midLabel) return null;
          return (
            <text x={mid.pt.x} y={labelY} textAnchor="middle" fontSize={11} fill={disabled ? "#8a9ba8" : "var(--text)"} fontFamily="system-ui, sans-serif" fontWeight={500} stroke="var(--canvas-label-halo)" strokeWidth={3} paintOrder="stroke" style={{ cursor: "text" }} data-ui="1" data-pipe-id={pipe.id} onDoubleClick={(e) => { e.stopPropagation(); onLabelDoubleClick(pipe.id, mid.pt.x, labelY, pipe.label); }}>
              {midLabel}
            </text>
          );
        })()}
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
            <text className="fp-pipe-annotation" x={mid.pt.x} y={mid.pt.y + wallW * 0.7 + 15.5} textAnchor="middle" fontSize={10} fill="#c07b1f" fontFamily="system-ui, sans-serif" fontWeight={600} data-pipe-id={pipe.id}>{pipe.annotation}</text>
          </g>
        )}
        {/* 自动介质标签 */}
        {showFluidLabels && displayFluidType && displayFluidType !== "custom" && (
          <g pointerEvents="none">
            <rect x={mid.pt.x - 30} y={mid.pt.y + wallW * 0.7 + (pipe.annotation ? 21 : 5)} width={60} height={15} rx={4} fill={visibleFluidColor} fillOpacity={0.18} stroke={visibleFluidColor} strokeWidth={1} />
          <text className="fp-fluid-label" x={mid.pt.x} y={mid.pt.y + wallW * 0.7 + (pipe.annotation ? 31 : 15)} textAnchor="middle" fontSize={9.5} fill={visibleFluidColor} fontFamily="system-ui, sans-serif" fontWeight={650} data-pipe-id={pipe.id}>
              {FLUID_PRESETS.find((f) => f.key === displayFluidType)?.label ?? displayFluidType}
            </text>
          </g>
        )}
      </g>
      {/* 管路堵塞故障标记（红色，导出时剔除） */}
      {pipe.fault === "pipeBlocked" && (
        <g data-ui="1" pointerEvents="none">
          <circle cx={mid.pt.x} cy={mid.pt.y - (wallW + 34)} r={8} fill="#d64545" stroke="#ffffff" strokeWidth={1.5} />
          <text x={mid.pt.x} y={mid.pt.y - (wallW + 34) + 4} textAnchor="middle" fontSize={11} fontWeight={800} fill="#ffffff" fontFamily="system-ui, sans-serif">×</text>
          <title>{lang === "en" ? "Pipe blocked (fault simulation)" : "管路堵塞（故障模拟）"}</title>
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
