/**
 * 功能链追踪：选中任意元件 → 计算它所在的整条功能链。
 * 按「当前阀位/泵态」追踪（与实际流动一致，教学更直观）：
 *  - 上游：沿有效流向逆推（只走各节点的入侧端口）直到源边界（进水口/罐/泵/锅炉）；
 *  - 下游：沿有效流向顺推（只走各节点的出侧端口）直到消费边界（各出口/罐）。
 * 关阀/停泵/三通非激活支路不穿越（链 = 当前实际可流通的路径）。
 */

import type { Diagram, DiagramNode, Pipe, Port } from "./types";
import { findPort, pumpEffectiveOn, valve2EffectiveOpen, valve3EffectivePath } from "./geometry";

/** 真源边界：上游回溯到此停止（泵/锅炉可穿过——它们的进水侧也是整机角色的一部分） */
const SOURCE_BOUNDARY = new Set([
  "inlet", "tank", "pressureTank", "syrupBottle",
]);

/** 消费/出口边界：下游前推到此停止 */
const SINK_BOUNDARY = new Set([
  "coffeeOutlet", "milkOutlet", "hotWaterOutlet", "hotWaterWand", "steamWand",
  "outlet", "groupHead", "tank",
]);

/** 方向性元件：只走其进/出侧端口 */
const DIRECTIONAL = new Set([
  "pump", "milkPump", "solenoid2", "solenoid3", "checkValve",
]);

export interface FunctionalChain {
  nodeIds: string[];
  pipeIds: string[];
}

interface Ends {
  u?: { node: DiagramNode; port: Port };
  v?: { node: DiagramNode; port: Port };
}

function effectiveEnds(diagram: Diagram, pipe: Pipe): Ends {
  const fromRef = pipe.fromPortId ? findPort(diagram.nodes, pipe.fromPortId) : undefined;
  const toRef = pipe.toPortId ? findPort(diagram.nodes, pipe.toPortId) : undefined;
  const a = fromRef ? { node: fromRef.node, port: fromRef.port } : undefined;
  const b = toRef ? { node: toRef.node, port: toRef.port } : undefined;
  return pipe.direction === "reverse" ? { u: b, v: a } : { u: a, v: b };
}

/** 节点当前是否允许介质流过（关阀/停泵/三通 off → 不可穿越） */
function flowable(n: DiagramNode): boolean {
  if (n.disabled) return false;
  if (n.type === "pump" || n.type === "milkPump") return pumpEffectiveOn(n);
  if (n.type === "solenoid2") return valve2EffectiveOpen(n);
  if (n.type === "solenoid3") return valve3EffectivePath(n) !== "off";
  return true;
}

/** 三通阀当前激活的出侧端口 id */
function activeOutPort(n: DiagramNode): string | undefined {
  const path = valve3EffectivePath(n);
  if (path === "off") return undefined;
  const outs = n.ports.filter((p) => p.direction === "out");
  const outA = outs.find((p) => p.position === "right") ?? outs[0];
  const outB = outs.find((p) => p.position === "bottom") ?? outs[1];
  return (path === "A" ? outA : outB)?.id;
}

/**
 * 追踪 seed（节点或管路）所在的功能链。
 */
export function traceFunctionalChain(diagram: Diagram, seedNodeId?: string, seedPipeId?: string): FunctionalChain {
  const nodeIds = new Set<string>();
  const pipeIds = new Set<string>();

  function addNode(id?: string) { if (id) nodeIds.add(id); }
  function addPipe(id?: string) { if (id) pipeIds.add(id); }

  const seedPipe = seedPipeId ? diagram.pipes.find((p) => p.id === seedPipeId) : undefined;
  if (seedNodeId) addNode(seedNodeId);
  if (seedPipe) {
    addPipe(seedPipe.id);
    const e = effectiveEnds(diagram, seedPipe);
    addNode(e.u?.node.id);
    addNode(e.v?.node.id);
  }
  if (!seedNodeId && !seedPipe) return { nodeIds: [...nodeIds], pipeIds: [...pipeIds] };

  /** 从 startId 向指定方向扩展。downstream=true：顺流（出侧）；false：逆流（入侧） */
  function extend(startId: string, downstream: boolean) {
    const queue = [startId];
    const seen = new Set<string>([startId]);
    while (queue.length) {
      const nid = queue.shift()!;
      const n = diagram.nodes.find((x) => x.id === nid);
      if (!n) continue;
      if (downstream && SINK_BOUNDARY.has(n.type)) continue; // 消费边界
      if (!downstream && SOURCE_BOUNDARY.has(n.type)) continue; // 源边界
      if (!flowable(n)) continue; // 关阀/停泵/三通 off：链在此断
      for (const p of diagram.pipes) {
        const e = effectiveEnds(diagram, p);
        const u = e.u, v = e.v;
        if (!u || !v) continue;
        const passesHere = downstream ? u.node.id === nid : v.node.id === nid;
        if (!passesHere) continue;
        // 方向性元件只走对应侧端口；三通阀只走激活支路
        const port = downstream ? u.port : v.port;
        if (DIRECTIONAL.has(n.type)) {
          const want = downstream ? "out" : "in";
          if (port.direction !== want && port.direction !== "bidirectional") continue;
        }
        if (n.type === "solenoid3" && downstream) {
          const active = activeOutPort(n);
          if (port.id !== active) continue; // 非激活支路不穿越
        }
        const nextId = downstream ? v.node.id : u.node.id;
        addPipe(p.id);
        if (!seen.has(nextId)) {
          seen.add(nextId);
          addNode(nextId);
          queue.push(nextId);
        }
      }
    }
  }

  for (const s of [...nodeIds]) {
    extend(s, true);
    extend(s, false);
  }

  return { nodeIds: [...nodeIds], pipeIds: [...pipeIds] };
}

/** 功能链可读路径摘要（Inspector 展示） */
export function chainPathSummary(diagram: Diagram, chain: FunctionalChain): string {
  const label = (id: string) => {
    const n = diagram.nodes.find((x) => x.id === id);
    return n ? n.label || n.type : id.slice(0, 8);
  };
  return chain.nodeIds.map(label).join(" → ");
}
