import { memo } from "react";
import type { Diagram } from "../types";
import { nodeBBox, pipePolyline, pathD, smoothPath } from "../geometry";
import { resolveFaultTargets, resolveHighlightGroupTargets } from "../fault-codes/profile";
import { suspectsForSymptom } from "../fault-codes/consult";
import { useDiagnosticView } from "../fault-codes/session";

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

export const FaultHighlightOverlay = memo(function FaultHighlightOverlay({ diagram, visibleNodes, visiblePipes }: { diagram: Diagram; visibleNodes: Set<string>; visiblePipes: Set<string> }) {
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
  </g>;
});
