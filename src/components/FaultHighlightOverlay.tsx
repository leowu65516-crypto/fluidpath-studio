import { memo } from "react";
import type { Diagram } from "../types";
import { nodeBBox, pipePolyline, pathD, smoothPath } from "../geometry";
import { resolveFaultTargets } from "../fault-codes/profile";
import { useDiagnosticView } from "../fault-codes/session";

export const FaultHighlightOverlay = memo(function FaultHighlightOverlay({ diagram, visibleNodes, visiblePipes }: { diagram: Diagram; visibleNodes: Set<string>; visiblePipes: Set<string> }) {
  const view = useDiagnosticView();
  const profile = diagram.settings.diagnosticProfile;
  if (!profile) return null;
  return <g data-fault-overlay="1" data-ui="1" pointerEvents="none">
    {profile.diagnostics.filter(f => view.ids.includes(f.id)).map((fault, index) => {
      const targets = resolveFaultTargets(diagram, profile, fault);
      const animate = view.animation && fault.presentation.animation === "breathe";
      return <g key={fault.id} data-fault-code={fault.code} className={animate ? "fault-overlay-breathe" : undefined} fill="none" stroke={fault.presentation.color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" opacity={0.85}>
        <title>{fault.code}</title>
        {targets.pipes.filter(id => visiblePipes.has(id)).map(id => {
          const pipe = diagram.pipes.find(p => p.id === id)!;
          const points = pipePolyline(pipe, diagram.nodes);
          if (!points) return null;
          return <path key={id} data-fault-target={id} d={pipe.routing === "curved" ? smoothPath(points) : pathD(points)} strokeWidth={pipe.visualDiameter + 10 + index * 3} strokeDasharray={`${8 + index * 2} 6`} opacity={0.55} />;
        })}
        {targets.nodes.filter(id => visibleNodes.has(id)).map(id => {
          const box = nodeBBox(diagram.nodes.find(n => n.id === id)!);
          const padding = 8 + index * 4;
          return <rect key={id} data-fault-target={id} x={box.x - padding} y={box.y - padding} width={box.w + padding * 2} height={box.h + padding * 2} rx={10} />;
        })}
      </g>;
    })}
  </g>;
});
