import type { DiagramNode, FluidType, Pipe, PortPosition } from "../types";
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

export function mergeResults(results: Array<{ nodes: DiagramNode[]; pipes: Pipe[] }>) {
  return {
    nodes: results.flatMap((r) => r.nodes),
    pipes: results.flatMap((r) => r.pipes),
  };
}
