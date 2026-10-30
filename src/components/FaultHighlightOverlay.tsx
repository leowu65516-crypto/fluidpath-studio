import { memo } from "react";
import type { Diagram } from "../types";
import { nodeBBox, pipePolyline, pathD, smoothPath, polylineBBox } from "../geometry";
import { resolveFaultTargets, resolveHighlightGroupTargets } from "../fault-codes/profile";
import { suspectsForSymptom } from "../fault-codes/consult";
import { useDiagnosticView } from "../fault-codes/session";
import { BEHAVIOR_META } from "../fault-codes/drill";
import type { DrillBehavior, DiagnosticProfile } from "../fault-codes/types";
import type { DrillSession } from "../fault-codes/session";

function animationClass(enabled: boolean, animation: "none" | "breathe" | "flash") {
  if (!enabled || animation === "none") return undefined;
  return animation === "flash" ? "fault-overlay-flash" : "fault-overlay-breathe";
}

function TargetOutline({
  diagram, nodeIds, pipeIds, visibleNodes, visiblePipes, index, strong = false,
}: {
  diagram: Diagram; nodeIds: string[]; pipeIds: string[]; visibleNodes: Set<string>; visiblePipes: Set<string>; index: number; strong?: boolean;
}) {
  return <>
    {pipeIds.filter(id => visiblePipes.has(id)).map(id => {
      const pipe = diagram.pipes.find(p => p.id === id)!;
      const points = pipePolyline(pipe, diagram.nodes);
      if (!points) return null;
      return <path key={id} data-fault-target={id} d={pipe.routing === "curved" ? smoothPath(points) : pathD(points)} strokeWidth={pipe.visualDiameter + (strong ? 14 : 10) + index * 3} strokeDasharray={strong ? "5 5" : `${8 + index * 2} 6`} opacity={strong ? 0.95 : 0.38} />;
    })}
    {nodeIds.filter(id => visibleNodes.has(id)).map(id => {
      const box = nodeBBox(diagram.nodes.find(n => n.id === id)!);
      const padding = (strong ? 12 : 8) + index * 4;
      return <rect key={id} data-fault-target={id} x={box.x - padding} y={box.y - padding} width={box.w + padding * 2} height={box.h + padding * 2} rx={strong ? 12 : 10} opacity={strong ? 1 : 0.5} />;
    })}
  </>;
}

/** 0.3 概率分档视觉：与故障码高亮区分——分档用固定橙色系 + 虚线节奏，故障码保持用户设定色（多为实线）。 */
const KB_TIER: Record<3 | 2 | 1, { color: string; width: number; dash: string; opacity: number; zh: string; en: string }> = {
  3: { color: "#ea580c", width: 4, dash: "12 6", opacity: 0.9, zh: "首要排查", en: "Primary" },
  2: { color: "#f59e0b", width: 3, dash: "8 6", opacity: 0.55, zh: "次要排查", en: "Secondary" },
  1: { color: "#fbbf24", width: 2, dash: "3 7", opacity: 0.25, zh: "罕见排除", en: "Rare" },
};
const KB_ACTIVE_COLOR = "#2563eb";

/** 0.4 差异视觉：演练注入后"新增停流 / 恢复流动 / 注入元件徽标 / 编号标注"。 */
function DrillLayer({ diagram, profile, drill, visibleNodes, visiblePipes, animation }: {
  diagram: Diagram; profile: DiagnosticProfile; drill: DrillSession; visibleNodes: Set<string>; visiblePipes: Set<string>; animation: boolean;
}) {
  const pipePath = (id: string) => {
    const pipe = diagram.pipes.find(item => item.id === id);
    if (!pipe) return null;
    const points = pipePolyline(pipe, diagram.nodes);
    if (!points) return null;
    return { d: pipe.routing === "curved" ? smoothPath(points) : pathD(points), width: pipe.visualDiameter + 10, label: pipe.label };
  };
  const labels = new Map(profile.highlightGroups.map(group => [group.id, group.label]));
  return <g data-drill-overlay="1" fill="none" strokeLinecap="round" strokeLinejoin="round">
    <g className={animationClass(animation, "breathe")}>
    {drill.changes.stoppedPipes.filter(id => visiblePipes.has(id)).map(id => {
      const path = pipePath(id);
      return path ? <path key={`stop-${id}`} data-drill-stopped={id} d={path.d} stroke="#dc2626" strokeWidth={path.width} strokeDasharray="10 6" opacity={0.92}><title>{path.label} · 故障导致停流</title></path> : null;
    })}
    </g>
    {drill.changes.flowingPipes.filter(id => visiblePipes.has(id)).map(id => {
      const path = pipePath(id);
      return path ? <path key={`flow-${id}`} data-drill-flowing={id} d={path.d} stroke="#16a34a" strokeWidth={path.width} strokeDasharray="10 6" opacity={0.92}><title>{path.label} · 故障后恢复流动</title></path> : null;
    })}
    {drill.injected.map((target, index) => {
      if (!visibleNodes.has(target.nodeId)) return null;
      const node = diagram.nodes.find(item => item.id === target.nodeId);
      if (!node) return null;
      const box = nodeBBox(node);
      const meta = BEHAVIOR_META[target.behavior as DrillBehavior] ?? BEHAVIOR_META.disabled;
      const groupLabel = labels.get(target.groupId);
      const title = `${groupLabel ? (groupLabel.zh || groupLabel.en) : target.groupId} · ${meta.zh} / ${meta.en}`;
      const badgeX = box.x + box.w - 6, badgeY = box.y - 14;
      const labelX = box.x + box.w + 18, labelY = box.y - 14;
      return <g key={`inject-${target.nodeId}`} data-drill-node={target.nodeId} data-drill-behavior={target.behavior}>
        <title>{title}</title>
        <path d={`M${badgeX + 8} ${badgeY + 4} L${labelX} ${labelY + 8}`} stroke="#b45309" strokeWidth={1.2} opacity={0.85} />
        <circle cx={labelX} cy={labelY + 8} r={9} fill="#fff7ed" stroke="#b45309" strokeWidth={1.6} />
        <text x={labelX} y={labelY + 12} textAnchor="middle" fontSize={11} fontWeight={700} fill="#b45309" stroke="none">{index + 1}</text>
        <rect x={badgeX} y={badgeY} width={18} height={18} rx={5} fill="#fff7ed" stroke="#b45309" strokeWidth={1.4} opacity={0.95} />
        <text x={badgeX + 9} y={badgeY + 13} textAnchor="middle" fontSize={11} fill="#b45309" stroke="none">{meta.glyph}</text>
      </g>;
    })}
  </g>;
}

/** 故障模式备注/高亮：编号徽标 + 琥珀色描边 + 文本标签（仅故障模式渲染，读图纸 settings.faultNotes）。 */
function FaultNotesLayer({ diagram, visibleNodes, visiblePipes }: { diagram: Diagram; visibleNodes: Set<string>; visiblePipes: Set<string> }) {
  const notes = diagram.settings.faultNotes ?? [];
  return <g data-fault-notes="1" fill="none" strokeLinecap="round" strokeLinejoin="round">
    {notes.map((note, noteIndex) => {
      const boxes = [
        ...diagram.nodes.filter(node => note.nodeIds.includes(node.id) && visibleNodes.has(node.id)).map(nodeBBox),
        ...diagram.pipes.filter(pipe => note.pipeIds.includes(pipe.id) && visiblePipes.has(pipe.id)).flatMap(pipe => {
          const points = pipePolyline(pipe, diagram.nodes);
          return points ? [polylineBBox(points)] : [];
        }),
      ];
      if (!boxes.length) return null;
      const left = Math.min(...boxes.map(box => box.x)), top = Math.min(...boxes.map(box => box.y));
      const right = Math.max(...boxes.map(box => box.x + box.w)), bottom = Math.max(...boxes.map(box => box.y + box.h));
      const color = note.color || "#b45309";
      const text = note.text.length > 28 ? `${note.text.slice(0, 27)}…` : note.text;
      const labelWidth = Math.max(48, Math.min(220, text.length * 11 + 20));
      return <g key={note.id} data-fault-note={note.id} stroke={color}>
        <title>{note.text}</title>
        <rect x={left - 8} y={top - 8} width={right - left + 16} height={bottom - top + 16} rx={10} strokeDasharray="5 5" strokeWidth={2} opacity={0.85} />
        <circle cx={left - 8} cy={top - 8} r={9} fill="#fff7ed" strokeWidth={1.6} />
        <text x={left - 8} y={top - 4} textAnchor="middle" fontSize={11} fontWeight={700} fill={color} stroke="none">{noteIndex + 1}</text>
        <rect x={left - 8} y={top - 34} width={labelWidth} height={20} rx={6} fill="#fff7ed" strokeWidth={1.2} opacity={0.96} />
        <text x={left + 1} y={top - 20} fontSize={11} fill={color} stroke="none">{text}</text>
      </g>;
    })}
  </g>;
}

export const FaultHighlightOverlay = memo(function FaultHighlightOverlay({ diagram, visibleNodes, visiblePipes, showFaultNotes = false }: { diagram: Diagram; visibleNodes: Set<string>; visiblePipes: Set<string>; showFaultNotes?: boolean }) {
  const view = useDiagnosticView();
  const profile = diagram.settings.diagnosticProfile;
  if (!profile) return null;
  // 0.3 知识库咨询层：按概率分档渲染嫌疑部件（与故障码高亮独立，只读显示语义）
  const kbSuspects = view.kbSymptomId && profile.symptoms?.length ? suspectsForSymptom(profile, view.kbSymptomId) : [];
  return <g data-fault-overlay="1" data-ui="1" pointerEvents="none">
    {profile.diagnostics.filter(f => view.ids.includes(f.id)).map((fault, index) => {
      const targets = resolveFaultTargets(diagram, profile, fault);
      const step = fault.troubleshooting?.[view.activeStepByFault[fault.id]];
      const stepTargets = step?.highlightBinding ? resolveHighlightGroupTargets(diagram, profile, step.highlightBinding.groupId) : null;
      return <g key={fault.id} data-fault-code={fault.code} fill="none" strokeLinecap="round" strokeLinejoin="round">
        <g className={animationClass(view.animation, fault.presentation.animation)} stroke={fault.presentation.color} strokeWidth={3} opacity={0.85}>
          <title>{fault.code}</title>
          <TargetOutline diagram={diagram} nodeIds={targets.nodes} pipeIds={targets.pipes} visibleNodes={visibleNodes} visiblePipes={visiblePipes} index={index} />
        </g>
        {step && stepTargets && <g data-fault-step={step.id} className={animationClass(view.animation, step.presentation?.animation ?? "flash")} stroke={step.presentation?.color ?? fault.presentation.color} strokeWidth={4}>
          <title>{fault.code} · {step.label.zh || step.label.en}</title>
          <TargetOutline diagram={diagram} nodeIds={stepTargets.nodes} pipeIds={stepTargets.pipes} visibleNodes={visibleNodes} visiblePipes={visiblePipes} index={index} strong />
        </g>}
      </g>;
    })}
    {kbSuspects.length > 0 && <g data-kb-consult="1" fill="none" strokeLinecap="round" strokeLinejoin="round">
      {kbSuspects.map(({ groupId, pr }) => {
        const targets = resolveHighlightGroupTargets(diagram, profile, groupId);
        const isActive = view.kbPartGroupId === groupId;
        const tier = KB_TIER[pr];
        const label = profile.highlightGroups.find(g => g.id === groupId)?.label;
        const title = `${label ? (label.zh || label.en) : groupId} · ${tier.zh} / ${tier.en}`;
        // 分档：pr3 橙色呼吸、pr2 静态细描、pr1 弱虚线；选中部件组叠加蓝色强调（提高不透明度，避免 pr1 看不见）
        return <g key={groupId} data-kb-suspect={pr} data-kb-active={isActive ? "1" : undefined}
          stroke={isActive ? KB_ACTIVE_COLOR : tier.color}
          opacity={isActive ? 0.95 : tier.opacity}>
          <title>{title}</title>
          <g className={pr === 3 && !isActive ? animationClass(view.animation, "breathe") : undefined}
            strokeWidth={isActive ? tier.width + 1 : tier.width}
            strokeDasharray={tier.dash}>
            <TargetOutline diagram={diagram} nodeIds={targets.nodes} pipeIds={targets.pipes} visibleNodes={visibleNodes} visiblePipes={visiblePipes} index={0} strong={pr === 3 || isActive} />
          </g>
        </g>;
      })}
    </g>}
    {view.bindPreviewGroupId && (() => {
      const targets = resolveHighlightGroupTargets(diagram, profile, view.bindPreviewGroupId);
      if (!targets.nodes.length && !targets.pipes.length) return null;
      const group = profile.highlightGroups.find(item => item.id === view.bindPreviewGroupId);
      return <g data-bind-preview="1" stroke={KB_ACTIVE_COLOR} opacity={0.95} className={animationClass(view.animation, "breathe")} strokeDasharray="4 6">
        <title>{group ? `${group.label.zh || group.label.en} · 绑定预览` : "绑定预览"}</title>
        <TargetOutline diagram={diagram} nodeIds={targets.nodes} pipeIds={targets.pipes} visibleNodes={visibleNodes} visiblePipes={visiblePipes} index={0} strong />
      </g>;
    })()}
    {view.drill && <DrillLayer diagram={diagram} profile={profile} drill={view.drill} visibleNodes={visibleNodes} visiblePipes={visiblePipes} animation={view.animation} />}
    {showFaultNotes && <FaultNotesLayer diagram={diagram} visibleNodes={visibleNodes} visiblePipes={visiblePipes} />}
  </g>;
});
