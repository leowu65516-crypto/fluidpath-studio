/**
 * 量感层（v1.19）：相对流量级联衰减 + 压力域。
 *
 * 定位：给「量感」而不做物理求解——图纸没有标高/粗糙度/泵曲线，
 * 不引入 EPANET 类求解器（见开发建议 §2.4），只做拓扑启发式：
 *
 * - computeRelativeFlow：从源管出发沿有效流向传播流量因子（0–1）。
 *   分流节点（tee/teeY/teeF/cross）按「流动中的出管数」均分；
 *   汇流相加（clamp 1）；阀/泵/直通 1:1 传递。只传播流动管路——
 *   停流判定完全复用三层引擎（pipeEngineeringDisabled），零新语义。
 * - computePressureDomain：运行泵（与锅炉）出侧顺流可达集合，即「有压力的管」。
 *
 * 手填 override：pipe.relativeFlow (0–100) 优先于自动计算。
 */

import type { DiagramNode, Pipe } from "./types";
import { findPort, pipeEngineeringDisabled, pumpEffectiveOn, setCachedPipes, valve2EffectiveOpen, valve3EffectivePath } from "./geometry";

/** 分流节点：流出流量在这些节点按流动出管数均分 */
const SPLIT_TYPES = new Set(["tee", "teeY", "teeF", "cross"]);

interface FlowEnds {
  uNode: string;
  vNode: string;
}

function endsOf(p: Pipe, nodes: DiagramNode[]): FlowEnds | null {
  const fr = p.fromPortId ? findPort(nodes, p.fromPortId) : undefined;
  const to = p.toPortId ? findPort(nodes, p.toPortId) : undefined;
  let u = fr;
  let v = to;
  if (p.direction === "reverse") {
    u = to;
    v = fr;
  }
  if (!u || !v) return null;
  return { uNode: u.node.id, vNode: v.node.id };
}

function nodeTypeOf(nodes: DiagramNode[], id: string): string {
  return nodes.find((n) => n.id === id)?.type ?? "";
}

/** 是否为流动管（工程判定） */
function isFlowing(p: Pipe, nodes: DiagramNode[]): boolean {
  return !pipeEngineeringDisabled(p, nodes);
}

/**
 * 相对流量因子：pipeId → 0.15–1。
 * 源管（上游无流动供入）= 1；分流均分、汇流相加、1:1 直通。
 * 环路残留（拓扑迭代无法收敛者）给中性值 0.6。
 */
export function computeRelativeFlow(pipes: Pipe[], nodes: DiagramNode[]): Map<string, number> {
  setCachedPipes(pipes, nodes);
  const factor = new Map<string, number>();
  const ends = new Map<string, FlowEnds>();
  const flowing: Pipe[] = [];
  for (const p of pipes) {
    if (!isFlowing(p, nodes)) continue;
    const e = endsOf(p, nodes);
    if (!e) continue;
    ends.set(p.id, e);
    flowing.push(p);
  }
  // 节点级流入/流出表（仅流动管）
  const inFlow = new Map<string, Pipe[]>();
  const outFlow = new Map<string, Pipe[]>();
  for (const p of flowing) {
    const e = ends.get(p.id)!;
    if (!inFlow.has(e.vNode)) inFlow.set(e.vNode, []);
    inFlow.get(e.vNode)!.push(p);
    if (!outFlow.has(e.uNode)) outFlow.set(e.uNode, []);
    outFlow.get(e.uNode)!.push(p);
  }
  // Kahn 式拓扑迭代：一根管在其 u 节点的全部流动流入管都有因子后即可计算
  const remaining = new Set(flowing.map((p) => p.id));
  let progress = true;
  let guard = flowing.length * 4 + 8;
  while (progress && remaining.size > 0 && guard-- > 0) {
    progress = false;
    for (const id of Array.from(remaining)) {
      const e = ends.get(id)!;
      const ins = (inFlow.get(e.uNode) ?? []).filter((x) => x.id !== id);
      if (!ins.every((x) => factor.has(x.id))) continue;
      let f: number;
      if (ins.length === 0) {
        f = 1; // 源管
      } else {
        const inSum = ins.reduce((acc, x) => acc + (factor.get(x.id) ?? 0), 0);
        const outCount = (outFlow.get(e.uNode) ?? []).length;
        const isSplit = SPLIT_TYPES.has(nodeTypeOf(nodes, e.uNode));
        f = isSplit && outCount > 1 ? inSum / outCount : inSum;
      }
      factor.set(id, Math.max(0.15, Math.min(1, f)));
      remaining.delete(id);
      progress = true;
    }
  }
  // 环路残留：中性值
  for (const id of remaining) factor.set(id, 0.6);
  return factor;
}

/** 粒子密度降档：factor 高→原档，中→降一档，低→降两档 */
export function downscaleDensity(
  density: "low" | "medium" | "high",
  factor: number
): "low" | "medium" | "high" {
  if (factor >= 0.67) return density;
  if (factor >= 0.34) return density === "high" ? "medium" : "low";
  return "low";
}

/**
 * 压力域：从压力源（运行泵出侧、锅炉出侧）顺拓扑可达的管集合。
 * **不要求流动**——阀前「停流但带压」的管段是最有价值的教学信息（打开阀就有水）。
 * 穿越门控与引擎 push 相位一致：泵为断点、关阀/三通 off 挡、单向阀顺向。
 */
export function computePressureDomain(pipes: Pipe[], nodes: DiagramNode[]): Set<string> {
  setCachedPipes(pipes, nodes);
  const res = new Set<string>();
  const outFrom = new Map<string, Pipe[]>();
  const ends = new Map<string, FlowEnds>();
  for (const p of pipes) {
    const e = endsOf(p, nodes);
    if (!e) continue;
    ends.set(p.id, e);
    if (!outFrom.has(e.uNode)) outFrom.set(e.uNode, []);
    outFrom.get(e.uNode)!.push(p);
  }
  const seed = (p: Pipe): boolean => {
    const e = ends.get(p.id);
    if (!e) return false;
    const uType = nodeTypeOf(nodes, e.uNode);
    const uNode = nodes.find((n) => n.id === e.uNode)!;
    const isPumpSource = (uType === "pump" || uType === "milkPump" || uType === "airPump") && pumpEffectiveOn(uNode);
    const isBoilerSource = uType === "hotWaterBoiler" || uType === "steamBoiler" || uType === "boiler";
    return isPumpSource || isBoilerSource;
  };
  const queue: Pipe[] = [];
  for (const p of pipes) {
    if (seed(p)) {
      res.add(p.id);
      queue.push(p);
    }
  }
  const visited = new Set<string>(queue.map((p) => p.id));
  while (queue.length > 0) {
    const p = queue.shift()!;
    const e = ends.get(p.id)!;
    const vNode = nodes.find((n) => n.id === e.vNode);
    if (!vNode) continue;
    if (vNode.type === "solenoid2" && !valve2EffectiveOpen(vNode)) continue;
    if (vNode.type === "solenoid3" && valve3EffectivePath(vNode) === "off") continue;
    if (vNode.type === "pump" || vNode.type === "milkPump" || vNode.type === "airPump") continue;
    for (const op of outFrom.get(e.vNode) ?? []) {
      if (visited.has(op.id)) continue;
      visited.add(op.id);
      res.add(op.id);
      queue.push(op);
    }
  }
  return res;
}
