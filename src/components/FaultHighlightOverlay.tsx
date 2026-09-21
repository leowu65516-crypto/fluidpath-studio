import { memo } from "react";
import type { Diagram } from "../types";
import { nodeBBox, pipePolyline, pathD, smoothPath } from "../geometry";
import { resolveFaultTargets, resolveHighlightGroupTargets } from "../fault-codes/profile";
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

export const FaultHighlightOverlay = memo(function FaultHighlightOverlay({ diagram, visibleNodes, visiblePipes }: { diagram: Diagram; visibleNodes: Set<string>; visiblePipes: Set<string> }) {
  const view = useDiagnosticView();
  const profile = diagram.settings.diagnosticProfile;
  if (!profile) return null;
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
  </g>;
});
