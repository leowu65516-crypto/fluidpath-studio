import type { DiagramNode, Pipe, Port, Pt } from "./types";

export const PORT_STUB = 24;

export function rotatePt(p: Pt, c: Pt, deg: number): Pt {
  if (!deg) return { ...p };
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
}

export function portLocalPos(node: DiagramNode, port: Port): Pt {
  const off = port.offset ?? 0.5;
  switch (port.position) {
    case "top":
      return { x: node.width * off, y: 0 };
    case "bottom":
      return { x: node.width * off, y: node.height };
    case "left":
      return { x: 0, y: node.height * off };
    case "right":
      return { x: node.width, y: node.height * off };
  }
}

export function nodeCenter(node: DiagramNode): Pt {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
}

export function portWorldPos(node: DiagramNode, port: Port): Pt {
  const local = portLocalPos(node, port);
  return rotatePt({ x: node.x + local.x, y: node.y + local.y }, nodeCenter(node), node.rotation);
}

const BASE_NORMALS: Record<string, Pt> = {
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
};

/** 端口朝外法向（旋转后吸附到最近的轴向） */
export function portWorldNormal(node: DiagramNode, port: Port): Pt {
  const n = BASE_NORMALS[port.position];
  const rad = (node.rotation * Math.PI) / 180;
  const x = n.x * Math.cos(rad) - n.y * Math.sin(rad);
  const y = n.x * Math.sin(rad) + n.y * Math.cos(rad);
  if (Math.abs(x) >= Math.abs(y)) return { x: x >= 0 ? 1 : -1, y: 0 };
  return { x: 0, y: y >= 0 ? 1 : -1 };
}

function near(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.01;
}

/** 在任意点列中插入直角拐点，保证全部为水平/垂直线段 */
export function orthogonalize(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    if (!out.length) {
      out.push({ ...p });
      continue;
    }
    const last = out[out.length - 1];
    if (near(last.x, p.x) && near(last.y, p.y)) continue;
    if (!near(last.x, p.x) && !near(last.y, p.y)) {
      const prev = out.length >= 2 ? out[out.length - 2] : null;
      const prevHorizontal = prev ? near(prev.y, last.y) : Math.abs(p.x - last.x) >= Math.abs(p.y - last.y);
      if (prevHorizontal) out.push({ x: p.x, y: last.y });
      else out.push({ x: last.x, y: p.y });
    }
    out.push({ ...p });
  }
  return out;
}

/** 去重与合并共线点 */
export function simplify(pts: Pt[]): Pt[] {
  const dedup: Pt[] = [];
  for (const p of pts) {
    const last = dedup[dedup.length - 1];
    if (last && near(last.x, p.x) && near(last.y, p.y)) continue;
    dedup.push(p);
  }
  if (dedup.length <= 2) return dedup;
  const out: Pt[] = [dedup[0]];
  for (let i = 1; i < dedup.length - 1; i++) {
    const a = out[out.length - 1];
    const b = dedup[i];
    const c = dedup[i + 1];
    const colinear = (near(a.x, b.x) && near(b.x, c.x)) || (near(a.y, b.y) && near(b.y, c.y));
    if (!colinear) out.push(b);
  }
  out.push(dedup[dedup.length - 1]);
  return out;
}

function autoMids(s0: Pt, s1: Pt, na: Pt): Pt[] {
  if (near(s0.x, s1.x) || near(s0.y, s1.y)) return [];
  if (Math.abs(na.x) > 0.5) {
    const midX = (s0.x + s1.x) / 2;
    return [
      { x: midX, y: s0.y },
      { x: midX, y: s1.y }
    ];
  }
  const midY = (s0.y + s1.y) / 2;
  return [
    { x: s0.x, y: midY },
    { x: s1.x, y: midY }
  ];
}

// ===== 自动走线：避让节点 =====

/** 管路与节点之间保持的净空 */
export const ROUTE_CLEARANCE = 18;

/** 轴向线段与矩形是否相交（线段均为水平/垂直，包围盒判定即精确判定） */
function segHitsRect(a: Pt, b: Pt, r: Rect): boolean {
  return (
    Math.min(a.x, b.x) < r.x + r.w &&
    Math.max(a.x, b.x) > r.x &&
    Math.min(a.y, b.y) < r.y + r.h &&
    Math.max(a.y, b.y) > r.y
  );
}

function routeCost(pts: Pt[], obstacles: Rect[]): number {
  let hits = 0;
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    len += Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    for (const r of obstacles) if (segHitsRect(a, b, r)) hits++;
  }
  const bends = Math.max(0, pts.length - 2);
  // 穿越节点重罚 > 拐点数 > 总长度
  return hits * 1e6 + bends * 60 + len;
}

/**
 * 在 s0 → s1 之间生成若干正交候选路径，按「不穿节点 → 拐点少 → 路径短」择优。
 * 候选包含：中线折返、L 形、以及沿各障碍外侧 ±净空的绕行线。
 */
function autoRoute(s0: Pt, s1: Pt, na: Pt, obstacles: Rect[]): Pt[] {
  const fallback = autoMids(s0, s1, na);
  if (!obstacles.length) return fallback;

  const cands: Pt[][] = [];
  const push = (mids: Pt[]) => cands.push(simplify(orthogonalize([s0, ...mids, s1])));
  const midX = (s0.x + s1.x) / 2;
  const midY = (s0.y + s1.y) / 2;
  push(fallback);
  push([{ x: midX, y: s0.y }, { x: midX, y: s1.y }]);
  push([{ x: s0.x, y: midY }, { x: s1.x, y: midY }]);
  push([{ x: s1.x, y: s0.y }]);
  push([{ x: s0.x, y: s1.y }]);
  // obstacles 已按净空外扩，直接贴其边界绕行即可
  for (const r of obstacles) {
    for (const y of [r.y, r.y + r.h]) {
      push([{ x: s0.x, y }, { x: s1.x, y }]);
    }
    for (const x of [r.x, r.x + r.w]) {
      push([{ x, y: s0.y }, { x, y: s1.y }]);
    }
  }

  let best = cands[0];
  let bestCost = Infinity;
  for (const c of cands) {
    if (c.length < 2) continue;
    const cost = routeCost(c, obstacles);
    if (cost < bestCost) {
      bestCost = cost;
      best = c;
    }
  }
  return best.slice(1, -1);
}

export interface PortRef {
  node: DiagramNode;
  port: Port;
}

export function findPort(nodes: DiagramNode[], portId: string): PortRef | null {
  for (const node of nodes) {
    const port = node.ports.find((p) => p.id === portId);
    if (port) return { node, port };
  }
  return null;
}

/** 缓存管路列表用于传播查找 */
let _cachedPipes: Pipe[] = [];
let _cachedDisabled = new Set<string>();
let _demand = new Set<string>();
export function setCachedPipes(pipes: Pipe[], nodes?: DiagramNode[]) {
  _cachedPipes = pipes;
  if (nodes) {
    _cachedDisabled = computeDisabledPipes(pipes, nodes);
    _demand = computeDemandPipes(pipes, nodes);
  }
}

/** 直通类节点（停流传播可穿过） */
const PASS_THROUGH_TYPES = new Set([
  "shape", "connector", "coupling", "metalCoupling", "tee", "teeY", "teeF", "cross", "elbow",
  "valve", "checkValve", "filter", "metalFilter", "heatExchanger", "pump", "milkPump",
  "solenoid2", "solenoid3", "pulseAirValve", "pressureRegulator", "flowMeter",
  "tank", "boiler", "hotWaterBoiler", "steamBoiler", "brewChamber",
]);

// ===== 故障模拟（教学用）：故障状态覆盖元件正常状态 =====
export function pumpEffectiveOn(n: DiagramNode): boolean {
  if (n.fault === "pumpStuck") return false;
  return n.pumpOn !== false;
}
export function valve2EffectiveOpen(n: DiagramNode): boolean {
  if (n.fault === "valveStuckOpen") return true;
  if (n.fault === "valveStuckClosed") return false;
  return n.valveState !== "closed";
}
export function valve3EffectivePath(n: DiagramNode): "A" | "B" | "off" {
  if (n.fault === "valveStuckOpen") return "A";
  if (n.fault === "valveStuckClosed") return "off";
  return n.valvePath ?? "A";
}

/**
 * 预计算停流管路：「断点 + 相位传播」模型。
 * 断点源 = pumpOn=false 的泵 / valveState=closed / valvePath=off / disabled 节点。
 * 相位语义（修复多泵拓扑下停流跨流源污染）：
 *  - "suck"：停转泵的入侧种子——逆行向上游追溯到源端（可逆向穿过单向元件，
 *    与「关泵 → 整条供液链停流」的教学语义一致）；
 *  - "push"：停转泵的出侧 / 关闭阀的下游种子——只顺流向传播；不穿越任何泵
 *    （运行中的泵是独立动力源），不逆向穿过单向元件（单向阀/锅炉/电磁阀），
 *    防止一条液路的停转淹没由其他泵供液的液路；
 *  - "both"：disabled 节点（置灰聚焦），双向。
 * 吸收端（排废/源端/储液罐）只标记不穿越；三通非激活支路隔离停流不扩散。
 */
type FlowPhase = "suck" | "push" | "both";

export function computeDisabledPipes(pipes: Pipe[], nodes: DiagramNode[]): Set<string> {
  const portToNode = new Map<string, { node: DiagramNode; port: Port }>();
  for (const n of nodes) for (const p of n.ports) portToNode.set(p.id, { node: n, port: p });

  /** 管路的流向边：u = 流出节点，v = 流入节点（尊重 direction=reverse） */
  function edgeOf(pipe: Pipe): {
    u?: { node: DiagramNode; port: Port };
    v?: { node: DiagramNode; port: Port };
  } {
    const fromRef = pipe.fromPortId ? portToNode.get(pipe.fromPortId) : undefined;
    const toRef = pipe.toPortId ? portToNode.get(pipe.toPortId) : undefined;
    const a = fromRef ? { node: fromRef.node, port: fromRef.port } : undefined;
    const b = toRef ? { node: toRef.node, port: toRef.port } : undefined;
    return pipe.direction === "reverse" ? { u: b, v: a } : { u: a, v: b };
  }

  const disabledPipes = new Set<string>();
  // 三通非激活支路：只停该支路本身，不扩散（避免污染其他支路）
  const isolatedDisabled = new Set<string>();
  const seedPipes = new Map<string, FlowPhase>();
  function setSeed(pid: string, phase: FlowPhase) {
    const cur = seedPipes.get(pid);
    if (!cur) seedPipes.set(pid, phase);
    else if (cur !== phase) seedPipes.set(pid, "both");
  }
  for (const n of nodes) {
    if (n.disabled) {
      for (const p of n.ports) {
        for (const pipe of pipes) {
          if (pipe.fromPortId === p.id || pipe.toPortId === p.id) setSeed(pipe.id, "both");
        }
      }
    }
    if (n.type === "pump" || n.type === "milkPump") {
      if (!pumpEffectiveOn(n)) {
        // 入侧管 → suck（向上游追溯）；出侧管 → push（顺流向下游）
        for (const p of n.ports) {
          for (const pipe of pipes) {
            if (pipe.fromPortId === p.id || pipe.toPortId === p.id) {
              setSeed(pipe.id, p.direction === "in" ? "suck" : p.direction === "out" ? "push" : "both");
            }
          }
        }
      }
    }
    if (n.type === "solenoid2" && !valve2EffectiveOpen(n)) {
      // 阀关：只停其直接出侧管（与历史基线一致，不向更下游扩散）
      const outPort = n.ports.find((p) => p.direction === "out");
      if (outPort) {
        for (const pipe of pipes) {
          if (pipe.fromPortId === outPort.id) disabledPipes.add(pipe.id);
        }
      }
    }
    if (n.type === "solenoid3") {
      const path = valve3EffectivePath(n);
      const outPorts = n.ports.filter((p) => p.direction === "out");
      const outA = outPorts.find((p) => p.position === "right") ?? outPorts[0];
      const outB = outPorts.find((p) => p.position === "bottom") ?? outPorts[1];
      const activeOutId = path === "A" ? outA?.id : path === "B" ? outB?.id : undefined;
      // 非激活出侧（bottom 或 right）连的管 → 隔离停流（不扩散）
      for (const outPort of [outA, outB]) {
        if (!outPort) continue;
        if (path !== "off" && outPort.id !== activeOutId) {
          for (const pipe of pipes) {
            if (pipe.fromPortId === outPort.id) isolatedDisabled.add(pipe.id);
          }
        }
      }
      if (path === "off") {
        // off 全关：出侧隔离，入侧向下游扩散（上游停流传播）
        const inPort = n.ports.find((p) => p.direction === "in");
        for (const p of n.ports) {
          for (const pipe of pipes) {
            if (pipe.fromPortId === p.id) {
              if (inPort && p.id === inPort.id) disabledPipes.add(pipe.id);
              else isolatedDisabled.add(pipe.id);
            }
            if (pipe.toPortId === p.id && inPort && p.id === inPort.id) isolatedDisabled.add(pipe.id);
          }
        }
      }
    }
  }

  // BFS 按相位扩散；隔离停流直接标记，不参与扩散
  for (const pid of isolatedDisabled) disabledPipes.add(pid);

  // 压力域：运行中泵出侧顺流向可达的管路集合（与 push 相同的穿越门控）。
  // 这些管路由运行泵维持正压供液：其他泵停转的 suck（吸侧失压）不得污染它们。
  const pressurized = new Set<string>();
  {
    const pq: string[] = [];
    for (const n of nodes) {
      if ((n.type === "pump" || n.type === "milkPump") && pumpEffectiveOn(n)) {
        for (const p of n.ports) {
          if (p.direction !== "out") continue;
          for (const pipe of pipes) {
            if (pipe.fromPortId === p.id || pipe.toPortId === p.id) {
              const e0 = edgeOf(pipe);
              if (e0.u && e0.u.node.id === n.id) pq.push(pipe.id);
            }
          }
        }
      }
    }
    const pseen = new Set<string>();
    while (pq.length) {
      const pid2 = pq.shift()!;
      if (pseen.has(pid2)) continue;
      pseen.add(pid2);
      pressurized.add(pid2);
      const pipe2 = pipes.find((p) => p.id === pid2);
      if (!pipe2) continue;
      const e = edgeOf(pipe2);
      if (!e.v) continue;
      const node = e.v.node;
      if (node.type === "shape" && node.label.includes("排废")) continue;
      if (node.type === "inlet" || node.type === "tank" || node.type === "pressureTank" || node.type === "syrupBottle") continue;
      if (node.disabled) continue;
      if (node.type === "pump" || node.type === "milkPump") continue;
      if (!PASS_THROUGH_TYPES.has(node.type)) continue;
      if (node.type === "solenoid2" && !valve2EffectiveOpen(node)) continue;
      if (node.type === "solenoid3" && valve3EffectivePath(node) === "off") continue;
      const portDirs = node.ports.map((p) => p.direction);
      const directed = portDirs.includes("in") && portDirs.includes("out");
      if (directed && e.v.port.direction !== "in") continue;
      if (node.type === "solenoid3") {
        const path = valve3EffectivePath(node);
        const outPorts3 = node.ports.filter((p) => p.direction === "out");
        const outA3 = outPorts3.find((p) => p.position === "right") ?? outPorts3[0];
        const outB3 = outPorts3.find((p) => p.position === "bottom") ?? outPorts3[1];
        const activeOutId3 = path === "A" ? outA3?.id : path === "B" ? outB3?.id : undefined;
        if (e.v.port.direction === "out" && e.v.port.id !== activeOutId3) continue;
      }
      for (const op of pipes) {
        if (op.id === pid2) continue;
        const oe = edgeOf(op);
        if (oe.u && oe.u.node.id === node.id) pq.push(op.id);
      }
    }
  }

  const queue: Array<{ pid: string; phase: FlowPhase }> = [...seedPipes].map(([pid, phase]) => ({ pid, phase }));
  const visited = new Set<string>(); // pid|phase：同一管路可被不同相位到达

  // 汇流点只要还有另一条可能供液的入侧，就不能把一条停流支路扩散到公共出侧。
  // 递归层仍会在所有入侧均停时判停；这里优先避免 BFS 的过度停流。
  function hasAlternateInflow(node: DiagramNode, currentPid: string): boolean {
    for (const candidate of pipes) {
      if (candidate.id === currentPid || isolatedDisabled.has(candidate.id)) continue;
      const e = edgeOf(candidate);
      if (!e.v || e.v.node.id !== node.id) continue;
      if (!disabledPipes.has(candidate.id)) return true;
    }
    return false;
  }

  while (queue.length) {
    const { pid, phase } = queue.shift()!;
    const vkey = pid + "|" + phase;
    if (visited.has(vkey)) continue;
    visited.add(vkey);
    disabledPipes.add(pid);
    const pipe = pipes.find((p) => p.id === pid);
    if (!pipe) continue;
    const edge = edgeOf(pipe);
    // push 在 v 端（下游）继续；suck 在 u 端（上游）继续；both 两端
    const arrivals: Array<{ node: DiagramNode; port: Port } | undefined> = [];
    if (phase !== "suck") arrivals.push(edge.v);
    if (phase !== "push") arrivals.push(edge.u);
    for (const arr of arrivals) {
      if (!arr) continue;
      const node = arr.node;
      // 排废/源端 吸收：不继续
      if (node.type === "shape" && node.label.includes("排废")) continue;
      if (node.type === "inlet" || node.type === "tank" || node.type === "pressureTank" || node.type === "syrupBottle") continue;
      if (node.disabled) continue;
      // 泵是动力源/断点本身：任何相位都不穿越（运行中的泵为独立动力源）
      if (node.type === "pump" || node.type === "milkPump") continue;
      // 锅炉是供水基础设施：suck 不得逆行穿越（下游某泵停转的吸侧失压
      // 不应经锅炉抽空由其他泵维持的主供水链；下游停流由 push 顺向负责）
      if (phase === "suck" && (node.type === "boiler" || node.type === "hotWaterBoiler" || node.type === "steamBoiler")) continue;
      if (!PASS_THROUGH_TYPES.has(node.type)) continue;
      // 阀状态门控
      if (node.type === "solenoid2" && !valve2EffectiveOpen(node)) continue;
      if (node.type === "solenoid3" && valve3EffectivePath(node) === "off") continue;
      // 单向元件（有 in/out 端口定义）：push 只允许顺向（经 in 口进入）穿越；
      // suck 允许逆行（吸侧失压整链停流）；both 不限
      const portDirs = node.ports.map((p) => p.direction);
      const directed = portDirs.includes("in") && portDirs.includes("out");
      if (directed && phase === "push" && arr.port.direction !== "in") continue;
      if (phase === "push" && !directed && hasAlternateInflow(node, pid)) continue;
      if (node.type === "solenoid3") {
        // 到达非激活出侧 → 不穿越
        const path = valve3EffectivePath(node);
        const outPorts3 = node.ports.filter((p) => p.direction === "out");
        const outA3 = outPorts3.find((p) => p.position === "right") ?? outPorts3[0];
        const outB3 = outPorts3.find((p) => p.position === "bottom") ?? outPorts3[1];
        const activeOutId3 = path === "A" ? outA3?.id : path === "B" ? outB3?.id : undefined;
        if (arr.port.direction === "out" && arr.port.id !== activeOutId3) continue;
      }
      // 扩散到 node 的其他管路（隔离停流不参与扩散）
      for (const op of pipes) {
        if (op.id === pid || isolatedDisabled.has(op.id)) continue;
        const oe = edgeOf(op);
        if (phase === "push") {
          // 顺流向：op 必须从 node 流出
          if (oe.u && oe.u.node.id === node.id) queue.push({ pid: op.id, phase: "push" });
        } else if (phase === "suck") {
          // 逆流向：op 必须流入 node（继续向上游追溯）；
          // 但从运行中/任何泵流出的管不得被 suck 污染（泵是独立动力源，其出侧由自身维持）；
          // 压力域（其他运行泵正压供液的管路）同样不得被污染
          if (oe.v && oe.v.node.id === node.id) {
            const srcNode = oe.u?.node;
            if (srcNode && (srcNode.type === "pump" || srcNode.type === "milkPump")) continue;
            if (pressurized.has(op.id)) continue;
            queue.push({ pid: op.id, phase: "suck" });
          }
        } else {
          if ((oe.u && oe.u.node.id === node.id) || (oe.v && oe.v.node.id === node.id)) {
            queue.push({ pid: op.id, phase: "both" });
          }
        }
      }
    }
  }

  return disabledPipes;
}

/** 消费端（需求根）：锅炉进液口、各出口/排废、运行泵的吸入口；储液罐可作为清洗/润湿回流终点 */
const DEMAND_SINK_TYPES = new Set([
  "boiler", "hotWaterBoiler", "steamBoiler",
  "coffeeOutlet", "milkOutlet", "hotWaterOutlet", "hotWaterWand", "steamWand", "outlet",
  "tank", "brewChamber",
]);
/** 源/动力边界：需求倒推不穿越（泵、罐、进水口、锅炉本体） */
const DEMAND_BOUNDARY_TYPES = new Set([
  "pump", "milkPump", "tank", "pressureTank", "syrupBottle", "inlet",
  "boiler", "hotWaterBoiler", "steamBoiler",
]);

/**
 * 需求域：从消费端逆流向倒推「能到达开放去处」的管路集合。
 * 流动 = 上游有供液 且 下游有去处；仅供液却流入全关死路的管（如润湿/快冲阀全关时的上游支管）应停流。
 * 倒推穿越门控：两通阀须开、三通仅激活支路、泵须运行、单向件顺向；源/动力边界处停止。
 */
function computeDemandPipes(pipes: Pipe[], nodes: DiagramNode[]): Set<string> {
  const demand = new Set<string>();
  const portToNode = new Map<string, { node: DiagramNode; port: Port }>();
  for (const n of nodes) for (const p of n.ports) portToNode.set(p.id, { node: n, port: p });
  function edgeOf(pipe: Pipe): {
    u?: { node: DiagramNode; port: Port };
    v?: { node: DiagramNode; port: Port };
  } {
    const fromRef = pipe.fromPortId ? portToNode.get(pipe.fromPortId) : undefined;
    const toRef = pipe.toPortId ? portToNode.get(pipe.toPortId) : undefined;
    const a = fromRef ? { node: fromRef.node, port: fromRef.port } : undefined;
    const b = toRef ? { node: toRef.node, port: toRef.port } : undefined;
    return pipe.direction === "reverse" ? { u: b, v: a } : { u: a, v: b };
  }
  /** 源节点 u 是否允许通过 port 向下游放流（决定该出侧管是否有需求） */
  function canEmit(u: DiagramNode, port: Port): boolean {
    if (u.disabled) return false;
    if (u.type === "pump" || u.type === "milkPump") return pumpEffectiveOn(u);
    if (u.type === "solenoid2") return valve2EffectiveOpen(u);
    if (u.type === "solenoid3") {
      const path = valve3EffectivePath(u);
      if (path === "off") return false;
      if (port.direction === "in") return true; // 入侧供液管：有任一激活支路即可
      const outPorts = u.ports.filter((p) => p.direction === "out");
      const outA = outPorts.find((p) => p.position === "right") ?? outPorts[0];
      const outB = outPorts.find((p) => p.position === "bottom") ?? outPorts[1];
      const activeOutId = path === "A" ? outA?.id : outB?.id;
      return port.id === activeOutId;
    }
    // 直通/接头/容器/单向件等：允许（单向件顺向由 edgeOf 保证）
    return true;
  }
  // 每个需求根独立 BFS，最后取并集。
  // 根自身可能兼作源/动力边界（如 tank：既是回流终点又是奶源），
  // 该根的树中必须跳过「根自身作为上游源」的回环管（如 储液罐→T型三通 的出奶管），
  // 否则 tank 回流需求会经回环把出奶管拉进需求域造成假流；该管仍可由其他根（如出奶口）的需求树正常拉入。
  const roots: DiagramNode[] = [];
  for (const n of nodes) {
    if (DEMAND_SINK_TYPES.has(n.type) && !n.disabled) roots.push(n);
    else if (n.type === "shape" && ((n.label || "").includes("排废") || (n.label || "").includes("冲泡")) && !n.disabled) roots.push(n);
    else if ((n.type === "pump" || n.type === "milkPump") && pumpEffectiveOn(n) && !n.disabled) roots.push(n);
  }
  for (const root of roots) {
    const hasDemandNode = new Set<string>();
    const queue: DiagramNode[] = [];
    function seed(n: DiagramNode) {
      if (hasDemandNode.has(n.id)) return;
      hasDemandNode.add(n.id);
      queue.push(n);
    }
    seed(root);
    while (queue.length) {
      const n = queue.shift()!;
      for (const pipe of pipes) {
        const e = edgeOf(pipe);
        if (!e.v || e.v.node.id !== n.id) continue; // 该管流入 n
        if (!e.u) continue;
        if (e.u.node.id === root.id && DEMAND_BOUNDARY_TYPES.has(e.u.node.type)) continue; // 根自身出侧回环 → 跳过
        if (!canEmit(e.u.node, e.u.port)) continue; // 上游源不放流 → 无需求
        if (demand.has(pipe.id)) continue;
        demand.add(pipe.id);
        if (!DEMAND_BOUNDARY_TYPES.has(e.u.node.type) && !hasDemandNode.has(e.u.node.id)) seed(e.u.node);
      }
    }
  }
  return demand;
}

/**
 * 管路是否应"置灰/停流"：
 * - 自身 disabled；或任一端连接节点 disabled；
 * - 或受电磁阀门控：两通电磁阀关闭、三通电磁阀关闭、三通非激活支路。
 * - 或相连自定义图形/接头/容器类节点有禁用的入口管路（传播效应）
 * - 或上游供液被切断：进水阀未打开时，锅炉/容器之后的管路即使出口阀打开也不流动
 * visitedPipes 用于防止递归回环。
 */
export function pipeEffectiveDisabled(
  pipe: Pipe,
  nodes: DiagramNode[],
  visitedPipes?: Set<string>,
  ignoreTeachingOverride = false
): boolean {
  const override = pipe.teachingOverride ?? (pipe.forceFlow ? "flow" : pipe.forceStop ? "stop" : undefined);
  if (!ignoreTeachingOverride && override === "flow") return false;
  if (!ignoreTeachingOverride && override === "stop") return true;
  if (pipe.disabled || pipe.fault === "pipeBlocked") return true;
  // 优先查预计算缓存（含泵/阀断点双向传播）
  if (_cachedDisabled.size > 0 && _cachedDisabled.has(pipe.id)) return true;
  // 供液侧递归判定
  const supplyStopped = pipeEffectiveDisabledRecursive(pipe, nodes, visitedPipes, ignoreTeachingOverride);
  if (supplyStopped) return true;
  // 需求域：供液到达但下游无任何开放去处（全关死路）→ 不流动
  if (_demand.size > 0 && !_demand.has(pipe.id)) return true;
  return false;
}

/** 工程有效判定：只基于拓扑、泵阀状态和故障，不受讲解画面覆盖影响。 */
export function pipeEngineeringDisabled(pipe: Pipe, nodes: DiagramNode[]): boolean {
  return pipeEffectiveDisabled(pipe, nodes, undefined, true);
}

/** 取得教学显示覆盖，兼容尚未迁移的旧工程文件。 */
export function pipeTeachingOverride(pipe: Pipe): "flow" | "stop" | undefined {
  return pipe.teachingOverride ?? (pipe.forceFlow ? "flow" : pipe.forceStop ? "stop" : undefined);
}

function pipeEffectiveDisabledRecursive(
  pipe: Pipe,
  nodes: DiagramNode[],
  visitedPipes?: Set<string>,
  ignoreTeachingOverride = false
): boolean {
  const override = pipe.teachingOverride ?? (pipe.forceFlow ? "flow" : pipe.forceStop ? "stop" : undefined);
  if (!ignoreTeachingOverride && override === "flow") return false;
  if (!ignoreTeachingOverride && override === "stop") return true;
  if (pipe.disabled || pipe.fault === "pipeBlocked") return true;
  const visited = visitedPipes ?? new Set<string>();
  if (visited.has(pipe.id)) return false;
  visited.add(pipe.id);
  // 递归深度上限：防止全连通图环回导致的栈溢出
  if (visited.size > 200) return false;

  /** 连接到指定端口的管路是否全部 disabled（汇流语义：任一路在供液即有供，全停才算断供） */
  function hasDisabledUpstream(portId: string): boolean {
    const ref = findPort(nodes, portId);
    if (!ref) return false;
    let count = 0;
    for (const op of _cachedPipes) {
      if (visited.has(op.id)) continue;
      for (const oe of [op.fromPortId, op.toPortId]) {
        if (!oe || oe !== portId) continue;
        count++;
        if (!pipeEffectiveDisabled(op, nodes, visited, ignoreTeachingOverride)) return false; // 任一流动 → 有供液
      }
    }
    return count > 0; // 有管且全停 → 断供；无管 → 维持既有行为（不判停）
  }

  function checkPort(portId: string | undefined): boolean {
    if (!portId) return false;
    const ref = findPort(nodes, portId);
    if (!ref) return false;
    const n = ref.node;

    if (n.disabled) return true;
    if (n.type === "pump" || n.type === "milkPump") {
      // 泵关闭/卡死：前后液路都停流
      if (!pumpEffectiveOn(n)) return true;
      // 泵打开：出侧（direction=out 的端口）依赖入侧（direction=in）上游供液；入侧无供液则出侧无介质
      const inPort = n.ports.find((p) => p.direction === "in");
      const outPort = n.ports.find((p) => p.direction === "out");
      if (inPort && outPort && ref.port.id === outPort.id && hasDisabledUpstream(inPort.id)) return true;
    }
    if (n.type === "solenoid2") {
      if (!valve2EffectiveOpen(n)) return true;
      // 阀门打开：出侧（direction=out）依赖入侧（direction=in）上游供液；入侧关闭则出侧也无介质
      const inPort = n.ports.find((p) => p.direction === "in");
      const outPort = n.ports.find((p) => p.direction === "out");
      if (inPort && outPort && ref.port.id === outPort.id && hasDisabledUpstream(inPort.id)) return true;
    }
    if (n.type === "solenoid3") {
      const path = valve3EffectivePath(n);
      if (path === "off") return true;
      // 端口方向：优先用 direction，缺失时按位置推断（left=in, right=A, bottom=B）
      const hasDir = n.ports.some((p) => p.direction === "in" || p.direction === "out");
      const inPort = hasDir ? n.ports.find((p) => p.direction === "in") : n.ports.find((p) => p.position === "left");
      const outPorts = hasDir
        ? n.ports.filter((p) => p.direction === "out")
        : n.ports.filter((p) => p.position === "right" || p.position === "bottom");
      const outA = outPorts.find((p) => p.position === "right") ?? outPorts[0];
      const outB = outPorts.find((p) => p.position === "bottom") ?? outPorts[1];
      // 当前端口是非激活出侧 → 停流
      if (path === "A" && outB && ref.port.id === outB.id) return true;
      if (path === "B" && outA && ref.port.id === outA.id) return true;
      // 当前端口是激活出侧：依赖入侧上游供液
      const isActiveOut = (outA && ref.port.id === outA.id) || (outB && ref.port.id === outB.id);
      if (isActiveOut && inPort && hasDisabledUpstream(inPort.id)) return true;
    }

    // 经过中间节点传播（直通类元件：阀门、接头、容器、换热器、过滤器、泵、单向阀等）
    // 注意：电磁阀（solenoid2/3）不在其中，避免阀门间环回；
    // 它们自身的停流通过上方专门分支 + 泵/阀的「上游依赖」逻辑处理。
    const passThrough = new Set(["shape", "connector", "coupling", "metalCoupling", "tee", "teeY", "teeF", "elbow",
      "valve", "checkValve", "filter", "metalFilter", "heatExchanger", "pump", "milkPump",
      "solenoid2", "solenoid3", "pulseAirValve", "pressureRegulator",
      "tank", "boiler", "hotWaterBoiler", "steamBoiler", "brewChamber"]);
    if (!passThrough.has(n.type)) return false;

    // 方向性传播：当前管 P 连到节点 n。
    // 若 P 是「入侧管」（作为 n 的 toPort），n 的下游停流不反向污染 P（如排废阀关闭不影响上游）。
    // 若 P 是「出侧管」（作为 n 的 fromPort），则依赖 n 的入侧上游供液：全部入侧管停流 P 才停（汇流 AND）。
    // 出侧管停不反向传播（不因下游断而污染本管）。
    // 当前管连到节点 n 的端口：
    let curPortId: string | undefined;
    if (pipe.fromPortId) {
      const or = findPort(nodes, pipe.fromPortId);
      if (or?.node.id === n.id) curPortId = pipe.fromPortId;
    }
    if (!curPortId && pipe.toPortId) {
      const or = findPort(nodes, pipe.toPortId);
      if (or?.node.id === n.id) curPortId = pipe.toPortId;
    }
    if (!curPortId) return false;
    // 当前管是否从 n 流出（出侧）。direction=reverse 时有效流向为 toPort→fromPort，出侧端为 toPortId
    const curIsOut = pipe.direction === "reverse" ? pipe.toPortId === curPortId : pipe.fromPortId === curPortId;

    // 若当前管是入侧（流入 n），不反向传播下游停流
    if (!curIsOut) return false;

    // 当前管是出侧：查 n 的所有「入侧管」（有效流入端落在 n 上的管）
    // 汇流语义（AND）：只有全部入侧管都停流，该出侧管才停；任一入侧仍流动则有流。
    // 避免单条停流支路（如关闭的冲洗阀）经共享三通污染并行支路。
    const inboundPipes: Pipe[] = [];
    for (const op of _cachedPipes) {
      if (op.id === pipe.id) continue;
      // op 的有效流入端：正向为 toPortId，direction=reverse 时为 fromPortId
      const inEndPortId = op.direction === "reverse" ? op.fromPortId : op.toPortId;
      if (!inEndPortId) continue;
      const or = findPort(nodes, inEndPortId);
      if (or?.node.id !== n.id) continue;
      inboundPipes.push(op);
    }
    if (inboundPipes.length === 0) return false; // 无入侧管 → 不判停
    for (const op of inboundPipes) {
      if (!pipeEffectiveDisabled(op, nodes, visited, ignoreTeachingOverride)) return false; // 任一入侧流动 → 有流
    }
    return true; // 全部入侧停流 → 本管停
  }

  return checkPort(pipe.fromPortId) || checkPort(pipe.toPortId);
}

/** 计算管路完整折线（含两端端口点）。任一端可为「连端口」或「游离端点」 */
export function pipePolyline(pipe: Pipe, nodes: DiagramNode[]): Pt[] | null {
  const fromPort = pipe.fromPortId ? findPort(nodes, pipe.fromPortId) : null;
  const toPort = pipe.toPortId ? findPort(nodes, pipe.toPortId) : null;
  const a = fromPort ? portWorldPos(fromPort.node, fromPort.port) : pipe.fromPoint;
  const b = toPort ? portWorldPos(toPort.node, toPort.port) : pipe.toPoint;
  if (!a || !b) return null;
  const na = fromPort ? portWorldNormal(fromPort.node, fromPort.port) : { x: 0, y: 0 };
  const nb = toPort ? portWorldNormal(toPort.node, toPort.port) : { x: 0, y: 0 };
  const s0 = fromPort ? { x: a.x + na.x * PORT_STUB, y: a.y + na.y * PORT_STUB } : a;
  const s1 = toPort ? { x: b.x + nb.x * PORT_STUB, y: b.y + nb.y * PORT_STUB } : b;
  let mids: Pt[];
  if (pipe.points.length) {
    mids = pipe.points;
  } else if (!fromPort || !toPort) {
    // 任一端游离：不做节点避让，走简单折返
    mids = autoMids(s0, s1, na);
  } else {
    // 障碍 = 除两端设备外、且落在走线活动范围内的节点（外扩净空）
    const span = {
      x: Math.min(s0.x, s1.x) - ROUTE_CLEARANCE * 6,
      y: Math.min(s0.y, s1.y) - ROUTE_CLEARANCE * 6,
      w: Math.abs(s1.x - s0.x) + ROUTE_CLEARANCE * 12,
      h: Math.abs(s1.y - s0.y) + ROUTE_CLEARANCE * 12
    };
    const obstacles: Rect[] = [];
    for (const n of nodes) {
      if (n.id === fromPort.node.id || n.id === toPort.node.id) continue;
      if (n.type === "label" || n.type === "arrow") continue;
      const bb = nodeBBox(n);
      const infl = {
        x: bb.x - ROUTE_CLEARANCE,
        y: bb.y - ROUTE_CLEARANCE,
        w: bb.w + ROUTE_CLEARANCE * 2,
        h: bb.h + ROUTE_CLEARANCE * 2
      };
      if (rectsIntersect(span, infl)) obstacles.push(infl);
    }
    mids = autoRoute(s0, s1, na, obstacles);
  }
  const raw = pipe.points.length ? [a, ...mids, b] : [a, s0, ...mids, s1, b];
  // 曲线模式：保留折点原貌，不强制正交
  if (pipe.routing === "curved") return simplify(raw);
  return simplify(orthogonalize(raw));
}

/** 两点距离 */
export function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** 从 from 朝 to 方向走距离 d 的点（用于圆角拐弯的切线端点） */
function lerpToward(from: Pt, to: Pt, d: number): Pt {
  const len = dist(from, to) || 1;
  const t = d / len;
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

/** 平滑曲线（Catmull-Rom → 三次贝塞尔），穿过所有顶点 */
export function smoothPath(pts: Pt[]): string {
  if (pts.length < 3) return pathD(pts);
  let d = `M ${round2(pts[0].x)} ${round2(pts[0].y)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${round2(c1x)} ${round2(c1y)} ${round2(c2x)} ${round2(c2y)} ${round2(p2.x)} ${round2(p2.y)}`;
  }
  return d;
}

/** 正交折线 + 圆角拐弯（直角折线模式下软化 90° 转角） */
export function roundedOrthPath(pts: Pt[], r: number): string {
  if (r <= 0.5 || pts.length < 3) return pathD(pts);
  let d = `M ${round2(pts[0].x)} ${round2(pts[0].y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1];
    const cur = pts[i];
    const next = pts[i + 1];
    const rUse = Math.max(0, Math.min(r, dist(prev, cur) / 2, dist(cur, next) / 2));
    if (rUse < 0.5) {
      d += ` L ${round2(cur.x)} ${round2(cur.y)}`;
      continue;
    }
    const a = lerpToward(cur, prev, rUse);
    const b = lerpToward(cur, next, rUse);
    d += ` L ${round2(a.x)} ${round2(a.y)} Q ${round2(cur.x)} ${round2(cur.y)} ${round2(b.x)} ${round2(b.y)}`;
  }
  d += ` L ${round2(pts[pts.length - 1].x)} ${round2(pts[pts.length - 1].y)}`;
  return d;
}

/** 将 world 投影到折线上，返回最近点及其所在段序号（用于插入顶点） */
export function projectOnPolyline(pts: Pt[], world: Pt): { point: Pt; index: number } {
  let best: { d: number; p: Pt; index: number } | null = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = 0;
    if (len2 > 0.0001) t = ((world.x - a.x) * dx + (world.y - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const p = { x: a.x + dx * t, y: a.y + dy * t };
    const dd = dist(p, world);
    if (!best || dd < best.d) best = { d: dd, p, index: i };
  }
  return best ? { point: best.p, index: best.index } : { point: { ...world }, index: 0 };
}

/** 在 world 附近找最近端口（端子拖拽时用于吸附重连）。excludePortIds 用于排除自身两端 */
export function nearestPort(
  nodes: DiagramNode[],
  world: Pt,
  excludePortIds: string[],
  tol: number
): { nodeId: string; portId: string } | null {
  let best: { nodeId: string; portId: string; d: number } | null = null;
  for (const n of nodes) {
    for (const p of n.ports) {
      if (excludePortIds.includes(p.id)) continue;
      const wp = portWorldPos(n, p);
      const d = Math.hypot(wp.x - world.x, wp.y - world.y);
      if (d <= tol && (!best || d < best.d)) best = { nodeId: n.id, portId: p.id, d };
    }
  }
  return best ? { nodeId: best.nodeId, portId: best.portId } : null;
}

export function pathD(pts: Pt[]): string {
  if (!pts.length) return "";
  return pts.map((p, i) => `${i === 0 ? "M" : "L"} ${round2(p.x)} ${round2(p.y)}`).join(" ");
}

function strictBetween(v: number, m: number, n: number): boolean {
  const lo = Math.min(m, n);
  const hi = Math.max(m, n);
  return v > lo + 0.01 && v < hi - 0.01;
}

/** 下层管路障碍：折线 + 外轮廓半宽（用于计算跨线拱半径） */
export interface HopObstacle {
  pts: Pt[];
  halfW: number;
}

/**
 * 生成带"跨线拱桥"的路径：当本管路与更早绘制（视觉在下层）的管路
 * 垂直交叉时，在交叉点用半圆弧绕过，避免看起来像连通。
 * 规则：水平段向上拱，垂直段向右拱；靠近拐角/端口处不生成拱。
 */
export function pathDWithHops(pts: Pt[], lowers: HopObstacle[], selfHalfW: number): string {
  if (pts.length < 2) return pathD(pts);
  let d = `M ${round2(pts[0].x)} ${round2(pts[0].y)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const horiz = near(a.y, b.y);
    const len = horiz ? Math.abs(b.x - a.x) : Math.abs(b.y - a.y);
    if (len < 0.01 || (!horiz && !near(a.x, b.x))) {
      d += ` L ${round2(b.x)} ${round2(b.y)}`;
      continue;
    }
    const dir = horiz ? Math.sign(b.x - a.x) : Math.sign(b.y - a.y);
    // 收集本段上的所有交叉点（沿行进方向的距离 t）
    const hops: Array<{ t: number; r: number }> = [];
    for (const lo of lowers) {
      for (let j = 0; j < lo.pts.length - 1; j++) {
        const c = lo.pts[j];
        const e = lo.pts[j + 1];
        const loHoriz = near(c.y, e.y);
        if (loHoriz === horiz) continue; // 平行段不交叉
        let t = -1;
        if (horiz) {
          if (strictBetween(c.x, a.x, b.x) && strictBetween(a.y, c.y, e.y)) t = (c.x - a.x) * dir;
        } else {
          if (strictBetween(c.y, a.y, b.y) && strictBetween(a.x, c.x, e.x)) t = (c.y - a.y) * dir;
        }
        if (t < 0) continue;
        const r = Math.max(7, lo.halfW + selfHalfW + 1.6);
        if (t < r + 2 || t > len - (r + 2)) continue; // 距拐角/端口太近，跳过
        hops.push({ t, r });
      }
    }
    hops.sort((h1, h2) => h1.t - h2.t);
    let cursor = 0;
    for (const h of hops) {
      let r = h.r;
      if (h.t - r < cursor + 1) r = h.t - cursor - 1; // 相邻拱太密时收缩半径
      if (r < 3) continue;
      const p1 = horiz ? { x: a.x + dir * (h.t - r), y: a.y } : { x: a.x, y: a.y + dir * (h.t - r) };
      const p2 = horiz ? { x: a.x + dir * (h.t + r), y: a.y } : { x: a.x, y: a.y + dir * (h.t + r) };
      const sweep = dir > 0 ? 1 : 0; // 水平恒向上拱、垂直恒向右拱
      d += ` L ${round2(p1.x)} ${round2(p1.y)} A ${round2(r)} ${round2(r)} 0 0 ${sweep} ${round2(p2.x)} ${round2(p2.y)}`;
      cursor = h.t + r;
    }
    d += ` L ${round2(b.x)} ${round2(b.y)}`;
  }
  return d;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function polylineLength(pts: Pt[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.abs(pts[i].x - pts[i - 1].x) + Math.abs(pts[i].y - pts[i - 1].y);
  }
  return len;
}

/** 折线上距起点 dist 处的位置与切向角度（度） */
export function pointAtLength(pts: Pt[], dist: number): { pt: Pt; angle: number } {
  let remaining = dist;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const segLen = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    if (segLen >= remaining || i === pts.length - 1) {
      const t = segLen === 0 ? 0 : Math.min(1, remaining / segLen);
      const pt = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      return { pt, angle };
    }
    remaining -= segLen;
  }
  return { pt: pts[0] ?? { x: 0, y: 0 }, angle: 0 };
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function nodeBBox(node: DiagramNode): Rect {
  const c = nodeCenter(node);
  const corners = [
    { x: node.x, y: node.y },
    { x: node.x + node.width, y: node.y },
    { x: node.x, y: node.y + node.height },
    { x: node.x + node.width, y: node.y + node.height }
  ].map((p) => rotatePt(p, c, node.rotation));
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
}

export function polylineBBox(pts: Pt[]): Rect {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function snap(v: number, grid = 8): number {
  return Math.round(v / grid) * grid;
}

// ===== 对齐吸附 =====

export interface AlignResult {
  dx: number;
  dy: number;
  /** 需要绘制的竖直参考线 x 坐标 */
  vLines: number[];
  /** 需要绘制的水平参考线 y 坐标 */
  hLines: number[];
}

/**
 * 计算拖动矩形相对其他矩形的对齐吸附量。
 * 三档锚点：左/中/右（竖直）与上/中/下（水平），取容差内最近的一档。
 */
export function computeAlign(moving: Rect, others: Rect[], tol: number): AlignResult {
  const mv = [moving.x, moving.x + moving.w / 2, moving.x + moving.w];
  const mh = [moving.y, moving.y + moving.h / 2, moving.y + moving.h];
  let bestX: { d: number; line: number } | null = null;
  let bestY: { d: number; line: number } | null = null;
  for (const o of others) {
    const ov = [o.x, o.x + o.w / 2, o.x + o.w];
    const oh = [o.y, o.y + o.h / 2, o.y + o.h];
    for (const a of mv)
      for (const b of ov) {
        const d = b - a;
        if (Math.abs(d) <= tol && (!bestX || Math.abs(d) < Math.abs(bestX.d))) bestX = { d, line: b };
      }
    for (const a of mh)
      for (const b of oh) {
        const d = b - a;
        if (Math.abs(d) <= tol && (!bestY || Math.abs(d) < Math.abs(bestY.d))) bestY = { d, line: b };
      }
  }
  const dx = bestX?.d ?? 0;
  const dy = bestY?.d ?? 0;
  // 吸附后收集全部命中的参考线（可能同时对齐多个对象）
  const vLines: number[] = [];
  const hLines: number[] = [];
  if (bestX) {
    const snapped = mv.map((v) => v + dx);
    for (const o of others)
      for (const b of [o.x, o.x + o.w / 2, o.x + o.w])
        if (snapped.some((v) => Math.abs(v - b) < 0.5) && !vLines.includes(b)) vLines.push(b);
  }
  if (bestY) {
    const snapped = mh.map((v) => v + dy);
    for (const o of others)
      for (const b of [o.y, o.y + o.h / 2, o.y + o.h])
        if (snapped.some((v) => Math.abs(v - b) < 0.5) && !hLines.includes(b)) hLines.push(b);
  }
  return { dx, dy, vLines, hLines };
}
