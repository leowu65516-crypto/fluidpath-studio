import type { DiagramNode, FluidType, Pipe, PortPosition, WorkCondition } from "../types";
import { FLUID_PRESETS, uid } from "../types";
import { createNode } from "../symbols";

export function makeNode(
  type: DiagramNode["type"],
  x: number,
  y: number,
  label?: string,
): DiagramNode {
  return createNode(type, x, y, label);
}

export function portOf(
  node: DiagramNode,
  position: PortPosition,
  direction?: "in" | "out" | "bidirectional",
) {
  const port = node.ports.find((p) => p.position === position && (!direction || p.direction === direction))
    ?? node.ports.find((p) => p.position === position);
  if (!port) throw new Error(`Port ${position} not found on ${node.type}`);
  return port;
}

function fluidColor(type: FluidType): string {
  return FLUID_PRESETS.find((f) => f.key === type)?.color ?? "#2f7fd6";
}

export function connect(
  from: DiagramNode,
  fromPosition: PortPosition,
  to: DiagramNode,
  toPosition: PortPosition,
  fluidType: FluidType = "coldWater",
  label?: string,
): Pipe {
  const fromPort = portOf(from, fromPosition);
  const toPort = portOf(to, toPosition);
  return {
    id: uid("pipe"),
    label: label ?? `管路 ${uid("").slice(-4)}`,
    fromPortId: fromPort.id,
    toPortId: toPort.id,
    points: [],
    nominalDiameter: "DN25",
    visualDiameter: 10,
    wallColor: "#5b6b7d",
    fluidColor: fluidColor(fluidType),
    fluidOpacity: 0.92,
    direction: "forward",
    flowSpeed: 1.2,
    particleDensity: "medium",
    animated: true,
    showArrow: true,
    fluidType,
    material: "custom",
    wallOpacity: 1,
    routing: "orthogonal",
    cornerRadius: 0,
  };
}

export function offsetNodes(nodes: DiagramNode[], dx: number, dy: number): DiagramNode[] {
  for (const node of nodes) {
    node.x += dx;
    node.y += dy;
  }
  return nodes;
}

export function mergeResults(results: Array<{ nodes: DiagramNode[]; pipes: Pipe[]; conditions?: WorkCondition[] }>) {
  return {
    nodes: results.flatMap((r) => r.nodes),
    pipes: results.flatMap((r) => r.pipes),
    conditions: results.flatMap((r) => r.conditions ?? []),
  };
}

export interface StateValue {
  pumpOn?: boolean;
  valveState?: "open" | "closed";
  valvePath?: "A" | "B" | "off";
}

/** 生成图的默认安全状态：泵停、两通阀关、三通阀 off；隔膜阀没有 off，保留 A。 */
export function applyIdleStates(nodes: DiagramNode[]): void {
  for (const n of nodes) {
    if (n.type === "pump" || n.type === "milkPump" || n.type === "airPump") n.pumpOn = false;
    else if (n.type === "solenoid2" || n.type === "ballValve" || n.type === "diaphragmValve2" || n.type === "pulseAirValve") n.valveState = "closed";
    else if (n.type === "solenoid3") n.valvePath = "off";
    else if (n.type === "diaphragmValve3") n.valvePath = "A";
  }
}

export function makeCondition(
  name: string,
  nodes: DiagramNode[],
  overrides: Record<string, StateValue> = {},
): WorkCondition {
  const state: Record<string, StateValue> = {};
  for (const n of nodes) {
    if (n.type === "pump" || n.type === "milkPump" || n.type === "airPump") state[n.id] = { pumpOn: false };
    else if (n.type === "solenoid2" || n.type === "ballValve" || n.type === "diaphragmValve2" || n.type === "pulseAirValve") state[n.id] = { valveState: "closed" };
    else if (n.type === "solenoid3") state[n.id] = { valvePath: "off" };
    else if (n.type === "diaphragmValve3") state[n.id] = { valvePath: "A" };
  }
  for (const [id, value] of Object.entries(overrides)) state[id] = { ...state[id], ...value };
  return { name, state };
}
