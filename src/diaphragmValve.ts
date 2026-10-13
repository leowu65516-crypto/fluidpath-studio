import type { DiagramNode, Port } from "./types";

export type DiaphragmValveRoutePath = "A" | "B" | "off";

/**
 * Resolve the two legal paths of a three-port diaphragm selector.
 *
 * The persisted A/B values are stable state slots, not physical port names:
 * both paths always share `commonPort`, while the other endpoint changes.
 * Legacy diagrams without `valveCommonPortId` retain their former right-port
 * behavior until a user selects a common port explicitly.
 */
export function diaphragmValveRoute(node: DiagramNode, path: DiaphragmValveRoutePath = node.valvePath ?? "A") {
  const ports = node.ports.slice(0, 3);
  const commonPort = ports.find((port) => port.id === node.valveCommonPortId)
    ?? ports.find((port) => port.position === "right")
    ?? ports[ports.length - 1];
  const branches = ports.filter((port) => port.id !== commonPort?.id);
  const routeA = branches[0];
  const routeB = branches[1];
  const activeBranch = path === "A" ? routeA : path === "B" ? routeB : undefined;
  const inactiveBranch = path === "A" ? routeB : path === "B" ? routeA : undefined;
  const activePortIds = new Set([commonPort?.id, activeBranch?.id].filter((id): id is string => !!id));
  return { commonPort, routeA, routeB, activeBranch, inactiveBranch, activePortIds };
}

/** Stable diagram-local labels; never imply a physical inlet or outlet. */
export function diaphragmPortLabel(node: DiagramNode, port: Port | undefined): string {
  const index = port ? node.ports.findIndex((candidate) => candidate.id === port.id) : -1;
  return index >= 0 ? `P${index + 1}` : "P?";
}

export function diaphragmRouteLabel(node: DiagramNode, path: DiaphragmValveRoutePath = node.valvePath ?? "A"): string {
  const route = diaphragmValveRoute(node, path);
  if (!route.commonPort || !route.activeBranch) return "—";
  return `${diaphragmPortLabel(node, route.commonPort)} ↔ ${diaphragmPortLabel(node, route.activeBranch)}`;
}
