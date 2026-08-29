/**
 * 智能建议引擎（回路诊断唯一数据源）：
 * 基于液路元素（元器件、阀/泵通断、介质、端口拓扑、故障标记），生成可
 * 「逐个确认 → 自动修改」的建议项。
 *
 * 分层模型：
 *  - structure（结构问题）：永远是错的接线/介质问题（端口多连、单向阀装反、
 *    孤立/游离、介质冲突），与当前阀位/泵态无关；
 *  - state（工况提示）：由当前阀位/泵态/故障标记导致的停流现象（泵停、阀关、
 *    出液口停流、故障模拟），教学演示中多为有意为之，只作提示不作错误。
 *
 * diagnostics.ts 是它的只读派生视图（报告/徽章计数）。
 * 全部用户可见文案支持 zh/en：collectAdvice / traceStopCause 接受 lang 参数（默认 zh，兼容旧调用）。
 */

import type { Diagram, FluidType, Pipe } from "./types";
import type { Lang } from "./i18n";
import { checkDiagramFluid, fluidLabel } from "./fluidRules";
import { pipeEngineeringDisabled, pipeTeachingOverride, setCachedPipes, pumpEffectiveOn, valve2EffectiveOpen, valve3EffectivePath, findPort } from "./geometry";

/** 双语取值 */
const L = (lang: Lang, zh: string, en: string): string => (lang === "zh" ? zh : en);

/** 可执行的修复动作 */
export type FixAction =
  | { type: "setFluid"; pipeId: string; fluidType: FluidType }
  | { type: "deleteNode"; nodeId: string }
  | { type: "deletePipe"; pipeId: string }
  | { type: "detachPipe"; pipeId: string; end: "from" | "to" }
  | { type: "reversePipe"; pipeId: string }
  | { type: "startPump"; nodeId: string }
  | { type: "openValve"; nodeId: string };

export type AdviceCategory = "structure" | "state";

export interface SmartAdvice {
  id: string;
  severity: "error" | "warning" | "info";
  /** 分层：结构问题 vs 工况提示 */
  category: AdviceCategory;
  /** 诊断类别（供诊断报告视图使用） */
  kind: string;
  title: string;
  message: string;
  fixLabel: string;
  fix?: FixAction;
  /** 关联的节点/管路 id（用于点选时高亮定位画布对应元素；因果链时第一个 = 根因） */
  elementIds: string[];
  /** 停流因果链（状态类）：阻塞元件定位结果 */
  cause?: { reason: string; ids: string[] };
  /** 教学解释：这条建议「为什么」（物理/工程原理） */
  why?: string;
}

/** 纯注释类元件：跳过孤立检查 */
const NON_FLOW_TYPES = new Set(["label", "arrow", "annotation", "image"]);

/** 直通/接头类：介质可跨端口流过（因果链上游可跨端口追溯） */
const JUNCTION_TYPES = new Set([
  "tee", "teeY", "teeF", "cross", "elbow", "checkValve", "coupling", "metalCoupling",
  "connector", "filter", "metalFilter", "flowMeter", "pressureGauge",
  "pressureSensor", "pressureSwitch", "heatExchanger", "opv", "safetyValve",
  "brewChamber",
]);

/** 诊断范围：框选/多选后只对范围内元素做诊断 */
export interface AdviceScope {
  nodeIds?: Set<string>;
  pipeIds?: Set<string>;
}

function faultLabel(fault: string, lang: Lang): string {
  switch (fault) {
    case "pumpStuck": return L(lang, "泵卡死", "pump seized");
    case "valveStuckOpen": return L(lang, "阀卡开", "valve stuck open");
    case "valveStuckClosed": return L(lang, "阀卡关", "valve stuck closed");
    default: return fault;
  }
}

// ===== 停流因果链 =====

interface Ends {
  u?: { node: Diagram["nodes"][number]; port: Diagram["nodes"][number]["ports"][number] };
  v?: { node: Diagram["nodes"][number]; port: Diagram["nodes"][number]["ports"][number] };
}

/** 有效流向两端（尊重 direction=reverse） */
function effectiveEnds(diagram: Diagram, pipe: Pipe): Ends {
  const fromRef = pipe.fromPortId ? findPort(diagram.nodes, pipe.fromPortId) : undefined;
  const toRef = pipe.toPortId ? findPort(diagram.nodes, pipe.toPortId) : undefined;
  const a = fromRef ? { node: fromRef.node, port: fromRef.port } : undefined;
  const b = toRef ? { node: toRef.node, port: toRef.port } : undefined;
  return pipe.direction === "reverse" ? { u: b, v: a } : { u: a, v: b };
}

/**
 * 停流因果链：追溯一根停流管路的根本原因。
 * 沿供液侧递归向上游找「第一个阻断元件」（故障/禁用/关泵/关阀/三通未导通），
 * 供液正常则判定为「下游无开放去处（死路）」。
 * @returns 根因描述 + 从根因到该管的元素 id 链
 */
export function traceStopCause(pipe: Pipe, diagram: Diagram, lang: Lang = "zh"): { reason: string; ids: string[] } {
  setCachedPipes(diagram.pipes, diagram.nodes);
  const visited = new Set<string>();
  const walk = (p: Pipe): { reason: string; ids: string[] } | null => {
    if (visited.has(p.id)) return null;
    visited.add(p.id);
    const label = p.label || L(lang, "未命名", "unnamed");
    if (p.disabled) return { reason: L(lang, `管路「${label}」被禁用`, `Pipe "${label}" is disabled`), ids: [p.id] };
    if (p.fault === "pipeBlocked") return { reason: L(lang, `管路「${label}」堵塞（故障模拟）`, `Pipe "${label}" is blocked (fault simulation)`), ids: [p.id] };
    const { u } = effectiveEnds(diagram, p);
    if (u) {
      const n = u.node;
      if (n.disabled) return { reason: L(lang, `「${n.label || n.type}」被禁用，无法向下游供液`, `"${n.label || n.type}" is dimmed and cannot feed downstream`), ids: [n.id, p.id] };
      if (n.type === "pump" || n.type === "milkPump" || n.type === "airPump") {
        if (!pumpEffectiveOn(n)) {
          const why = n.fault === "pumpStuck" ? L(lang, "卡死（故障模拟）", "seized (fault simulation)") : L(lang, "未运行", "not running");
          return { reason: L(lang, `「${n.label}」${why}，无法向下游供液`, `"${n.label}" is ${why} and cannot feed downstream`), ids: [n.id, p.id] };
        }
      }
      if (n.type === "solenoid2") {
        if (!valve2EffectiveOpen(n)) {
          const why = n.fault === "valveStuckClosed" ? L(lang, "卡关（故障模拟）", "stuck closed (fault simulation)") : L(lang, "关闭", "closed");
          return { reason: L(lang, `「${n.label}」${why}`, `"${n.label}" is ${why}`), ids: [n.id, p.id] };
        }
      }
      if (n.type === "solenoid3") {
        const path = valve3EffectivePath(n);
        if (path === "off") {
          const why = n.fault === "valveStuckClosed" ? L(lang, "卡关（故障模拟）", "stuck closed (fault simulation)") : L(lang, "关闭", "off");
          return { reason: L(lang, `「${n.label}」${why}`, `"${n.label}" is ${why}`), ids: [n.id, p.id] };
        }
        const outPorts = n.ports.filter((pp) => pp.direction === "out");
        const outA = outPorts.find((pp) => pp.position === "right") ?? outPorts[0];
        const outB = outPorts.find((pp) => pp.position === "bottom") ?? outPorts[1];
        const activeId = path === "A" ? outA?.id : outB?.id;
        if (u.port.direction === "out" && u.port.id !== activeId) {
          return { reason: L(lang, `「${n.label}」当前导通 ${path} 路，未导通该支路`, `"${n.label}" currently routes path ${path}; this branch is not active`), ids: [n.id, p.id] };
        }
      }
      // 上游供液管停流 → 继续向上递归（AND 汇流：任一入侧流动即有供，故只在全部入侧停流时进来）
      const isJunction = JUNCTION_TYPES.has(n.type);
      const inPortIds = new Set(n.ports.filter((pp) => pp.direction === "in").map((pp) => pp.id));
      let anyFlowingUpstream = false;
      for (const op of diagram.pipes) {
        if (op.id === p.id) continue;
        const oe = effectiveEnds(diagram, op);
        const feedsHere = isJunction
          ? oe.v && oe.v.node.id === n.id
          : oe.v && inPortIds.has(oe.v.port.id);
        if (!feedsHere) continue;
        if (!pipeEngineeringDisabled(op, diagram.nodes)) { anyFlowingUpstream = true; break; }
        const sub = walk(op);
        if (sub) return { reason: sub.reason, ids: [...sub.ids, p.id] };
      }
      if (anyFlowingUpstream) return { reason: L(lang, `「${label}」上游有供液但下游无开放去处（支路全关或死路）`, `"${label}" has supply upstream but no open destination downstream (all branches closed or dead end)`), ids: [p.id] };
    }
    return { reason: L(lang, `「${label}」上游无供液来源（未接入有效供水链）`, `"${label}" has no upstream supply (not connected to a live feed chain)`), ids: [p.id] };
  };
  return walk(pipe) ?? { reason: L(lang, "未找到明确原因", "No clear cause found"), ids: [pipe.id] };
}

// ===== 建议收集 =====

export function collectAdvice(diagram: Diagram, scope?: AdviceScope, lang: Lang = "zh"): SmartAdvice[] {
  const out: SmartAdvice[] = [];
  const scoped = !!scope && ((scope.nodeIds && scope.nodeIds.size > 0) || (scope.pipeIds && scope.pipeIds.size > 0));
  const nodeIds = scope?.nodeIds;
  const pipeIds = scope?.pipeIds;
  setCachedPipes(diagram.pipes, diagram.nodes);

  // ===== 结构问题（与阀位/泵态无关） =====

  // 教学覆盖不计入结构问题，但必须显式告知：画面动画与工程状态已分离。
  for (const p of diagram.pipes) {
    if (scoped && pipeIds && !pipeIds.has(p.id)) continue;
    const override = pipeTeachingOverride(p);
    if (!override) continue;
    out.push({
      id: `teaching_override_${p.id}`,
      severity: "info",
      category: "state",
      kind: "teaching-override",
      title: L(lang, "教学显示覆盖", "Teaching display override"),
      message: L(
        lang,
        `「${p.label || "未命名"}」被设置为教学${override === "flow" ? "强制流动" : "强制停流"}；工程判定与画面显示已分离。`,
        `"${p.label || "unnamed"}" has a teaching ${override === "flow" ? "forced-flow" : "forced-stop"} override; engineering state and on-canvas animation are separated.`
      ),
      fixLabel: L(lang, "在属性面板清除覆盖", "Clear override in Inspector"),
      elementIds: [p.id],
    });
  }

  // 1) 介质冲突（物理常识）
  const fluidMap = checkDiagramFluid(diagram, lang);
  for (const [pipeId, issues] of fluidMap) {
    if (scoped && pipeIds && !pipeIds.has(pipeId)) continue;
    for (const issue of issues) {
      out.push({
        id: `fluid_${pipeId}_${issue.side}`,
        severity: "warning",
        category: "structure",
        kind: "fluid",
        title: L(lang, "介质冲突", "Fluid mismatch"),
        message: issue.message,
        fixLabel: L(lang, `改为「${fluidLabel(issue.preferred, lang)}」`, `Change to "${fluidLabel(issue.preferred, lang)}"`),
        fix: { type: "setFluid", pipeId, fluidType: issue.preferred },
        elementIds: [pipeId],
      });
    }
  }

  // 2) 孤立元件（有端口却没接任何管路）
  const connectedPorts = new Set<string>();
  for (const p of diagram.pipes) {
    if (p.fromPortId) connectedPorts.add(p.fromPortId);
    if (p.toPortId) connectedPorts.add(p.toPortId);
  }
  for (const n of diagram.nodes) {
    if (scoped && nodeIds && !nodeIds.has(n.id)) continue;
    if (NON_FLOW_TYPES.has(n.type)) continue;
    if (n.ports.length === 0) continue;
    const hasConnection = n.ports.some((p) => connectedPorts.has(p.id));
    if (!hasConnection) {
      out.push({
        id: `isolated_${n.id}`,
        severity: "info",
        category: "structure",
        kind: "isolated",
        title: L(lang, "孤立元件", "Isolated component"),
        message: L(lang, `「${n.label || n.type}」尚未接入任何管路。`, `"${n.label || n.type}" is not connected to any pipe.`),
        fixLabel: L(lang, "删除该元件", "Delete component"),
        fix: { type: "deleteNode", nodeId: n.id },
        elementIds: [n.id],
      });
    }
  }

  // 3) 端口多连（一个端口接了多条管路）
  const portFirstPipe = new Map<string, string>();
  const portCount = new Map<string, number>();
  for (const p of diagram.pipes) {
    if (scoped && pipeIds && !pipeIds.has(p.id)) continue;
    for (const ref of [p.fromPortId, p.toPortId]) {
      if (!ref) continue;
      portCount.set(ref, (portCount.get(ref) ?? 0) + 1);
      if (!portFirstPipe.has(ref)) portFirstPipe.set(ref, p.id);
    }
  }
  const seenPort = new Set<string>();
  for (const p of diagram.pipes) {
    if (scoped && pipeIds && !pipeIds.has(p.id)) continue;
    for (const [ref, end] of [[p.fromPortId, "from"], [p.toPortId, "to"]] as Array<[string | undefined, "from" | "to"]>) {
      if (!ref) continue;
      if ((portCount.get(ref) ?? 0) <= 1) continue;
      if (portFirstPipe.get(ref) === p.id && !seenPort.has(ref)) {
        seenPort.add(ref);
        continue;
      }
      const node = diagram.nodes.find((n) => n.ports.some((pt) => pt.id === ref));
      out.push({
        id: `portconflict_${p.id}_${end}`,
        severity: "error",
        category: "structure",
        kind: "port-conflict",
        title: L(lang, "端口多连", "Port overloaded"),
        message: L(lang, `「${node?.label ?? node?.type ?? "?"}」的某端口被多条管路占用，需通过三通分路。`, `A port of "${node?.label ?? node?.type ?? "?"}" is used by multiple pipes; split with a tee.`),
        fixLabel: L(lang, "断开这条管路", "Detach this pipe"),
        fix: { type: "detachPipe", pipeId: p.id, end },
        elementIds: [node?.id ?? p.id],
      });
    }
  }

  // 4) 单向阀装反（出水口被当作入口）
  for (const n of diagram.nodes) {
    if (scoped && nodeIds && !nodeIds.has(n.id)) continue;
    if (n.type !== "checkValve") continue;
    const outPort = n.ports.find((p) => p.direction === "out");
    if (!outPort) continue;
    for (const p of diagram.pipes) {
      if (scoped && pipeIds && !pipeIds.has(p.id)) continue;
      if (p.toPortId === outPort.id) {
        out.push({
          id: `checkrev_${p.id}`,
          severity: "warning",
          category: "structure",
          kind: "check-reverse",
          title: L(lang, "单向阀装反", "Check valve reversed"),
          message: L(lang, `「${n.label || n.type}」的出水口被当作入口连接，介质流向相反。`, `The outlet of "${n.label || n.type}" is used as an inlet; flow direction is inverted.`),
          fixLabel: L(lang, "反转流向", "Reverse flow"),
          fix: { type: "reversePipe", pipeId: p.id },
          elementIds: [n.id, p.id],
        });
      }
    }
  }

  // 4b) 泵入口/出口未接管（Linter：动力源悬空）
  for (const n of diagram.nodes) {
    if (scoped && nodeIds && !nodeIds.has(n.id)) continue;
    if (n.type !== "pump" && n.type !== "milkPump" && n.type !== "airPump") continue;
    const inPorts = n.ports.filter((p) => p.direction === "in");
    const outPorts = n.ports.filter((p) => p.direction === "out");
    const inConnected = inPorts.some((p) => connectedPorts.has(p.id));
    const outConnected = outPorts.some((p) => connectedPorts.has(p.id));
    if (inPorts.length > 0 && !inConnected) {
      out.push({
        id: `pumpin_${n.id}`,
        severity: "warning",
        category: "structure",
        kind: "pump-no-inlet",
        title: L(lang, "泵入口未接管", "Pump inlet unconnected"),
        message: L(lang, `「${n.label || n.type}」的入口端口没有接入任何管路，泵无法吸取介质。`, `No pipe is connected to the inlet of "${n.label || n.type}"; the pump cannot draw fluid.`),
        fixLabel: L(lang, "定位元件", "Locate"),
        elementIds: [n.id],
      });
    }
    if (outPorts.length > 0 && !outConnected) {
      out.push({
        id: `pumpout_${n.id}`,
        severity: "warning",
        category: "structure",
        kind: "pump-no-outlet",
        title: L(lang, "泵出口未接管", "Pump outlet unconnected"),
        message: L(lang, `「${n.label || n.type}」的出口端口没有接入任何管路，泵送的介质无处可去。`, `No pipe is connected to the outlet of "${n.label || n.type}"; pumped fluid has nowhere to go.`),
        fixLabel: L(lang, "定位元件", "Locate"),
        elementIds: [n.id],
      });
    }
  }

  // 5) 游离管路（两端都未连接）
  for (const p of diagram.pipes) {
    if (scoped && pipeIds && !pipeIds.has(p.id)) continue;
    if (!p.fromPortId && !p.toPortId) {
      out.push({
        id: `loose_${p.id}`,
        severity: "warning",
        category: "structure",
        kind: "loose-pipe",
        title: L(lang, "游离管路", "Loose pipe"),
        message: L(lang, `管路「${p.label || "未命名"}」两端都未连接任何端口。`, `Both ends of pipe "${p.label || "unnamed"}" are unconnected.`),
        fixLabel: L(lang, "删除管路", "Delete pipe"),
        fix: { type: "deletePipe", pipeId: p.id },
        elementIds: [p.id],
      });
    }
  }

  // ===== 工况提示（由当前阀位/泵态/故障标记导致，多为有意为之） =====

  // 6) 泵未运行 / 阀关闭（带故障标记的归入「故障模拟」，且不给修复动作）
  for (const n of diagram.nodes) {
    if (scoped && nodeIds && !nodeIds.has(n.id)) continue;
    if ((n.type === "pump" || n.type === "milkPump" || n.type === "airPump") && !pumpEffectiveOn(n)) {
      if (n.fault) {
        out.push({
          id: `fault_${n.id}`,
          severity: "warning",
          category: "state",
          kind: "fault",
          title: L(lang, "故障模拟", "Fault simulation"),
          message: L(lang, `「${n.label || n.type}」处于故障状态：${faultLabel(n.fault, lang)}，其前后管路会停流。`, `"${n.label || n.type}" is in fault state: ${faultLabel(n.fault, lang)}; adjacent pipes will stop.`),
          fixLabel: L(lang, "移除故障", "Remove fault"),
          elementIds: [n.id],
        });
      } else {
        out.push({
          id: `pump_${n.id}`,
          severity: "info",
          category: "state",
          kind: "pump-off",
          title: L(lang, "泵未运行", "Pump off"),
          message: L(lang, `「${n.label || n.type}」当前停止，其前后相连管路会停流。`, `"${n.label || n.type}" is stopped; adjacent pipes will stop flowing.`),
          fixLabel: L(lang, "启动泵", "Start pump"),
          fix: { type: "startPump", nodeId: n.id },
          elementIds: [n.id],
        });
      }
    }
    if (n.type === "solenoid2" && !valve2EffectiveOpen(n)) {
      if (n.fault) {
        out.push({
          id: `fault_${n.id}`,
          severity: "warning",
          category: "state",
          kind: "fault",
          title: L(lang, "故障模拟", "Fault simulation"),
          message: L(lang, `「${n.label || n.type}」处于故障状态：${faultLabel(n.fault, lang)}，下游管路会停流。`, `"${n.label || n.type}" is in fault state: ${faultLabel(n.fault, lang)}; downstream pipes will stop.`),
          fixLabel: L(lang, "移除故障", "Remove fault"),
          elementIds: [n.id],
        });
      } else {
        out.push({
          id: `valve_${n.id}`,
          severity: "info",
          category: "state",
          kind: "valve-closed",
          title: L(lang, "电磁阀关闭", "Solenoid closed"),
          message: L(lang, `「${n.label || n.type}」当前关闭，下游管路会停流。`, `"${n.label || n.type}" is closed; downstream pipes will stop flowing.`),
          fixLabel: L(lang, "打开阀门", "Open valve"),
          fix: { type: "openValve", nodeId: n.id },
          elementIds: [n.id],
        });
      }
    }
  }

  // 7) 故障模拟提示（三通阀卡滞、管路堵塞等其余故障标记）
  for (const n of diagram.nodes) {
    if (scoped && nodeIds && !nodeIds.has(n.id)) continue;
    if (!n.fault) continue;
    if ((n.type === "pump" || n.type === "milkPump" || n.type === "airPump" || n.type === "solenoid2")) continue; // 已由 6) 覆盖
    out.push({
      id: `fault_${n.id}`,
      severity: "warning",
      category: "state",
      kind: "fault",
      title: L(lang, "故障模拟", "Fault simulation"),
      message: L(lang, `「${n.label || n.type}」处于故障状态：${faultLabel(n.fault, lang)}。`, `"${n.label || n.type}" is in fault state: ${faultLabel(n.fault, lang)}.`),
      fixLabel: L(lang, "移除故障", "Remove fault"),
      elementIds: [n.id],
    });
  }
  for (const p of diagram.pipes) {
    if (scoped && pipeIds && !pipeIds.has(p.id)) continue;
    if (p.fault !== "pipeBlocked") continue;
    out.push({
      id: `fault_${p.id}`,
      severity: "warning",
      category: "state",
      kind: "fault",
      title: L(lang, "故障模拟", "Fault simulation"),
      message: L(lang, `「${p.label || "管路"}」处于故障状态：管路堵塞。`, `"${p.label || "pipe"}" is in fault state: blocked.`),
      fixLabel: L(lang, "移除故障", "Remove fault"),
      elementIds: [p.id],
    });
  }

  // 8) 出液口停流：给出因果链定位（根因修复建议，而非强制流动）
  const OUTLET_TYPES = new Set(["coffeeOutlet", "milkOutlet", "hotWaterOutlet", "steamWand", "hotWaterWand", "groupHead"]);
  for (const n of diagram.nodes) {
    if (scoped && nodeIds && !nodeIds.has(n.id)) continue;
    if (!OUTLET_TYPES.has(n.type)) continue;
    for (const p of diagram.pipes) {
      if (!p.toPortId || !n.ports.some((pt) => pt.id === p.toPortId)) continue;
      if (!pipeEngineeringDisabled(p, diagram.nodes)) continue;
      const cause = traceStopCause(p, diagram, lang);
      let fix: FixAction | undefined;
      let fixLabel = L(lang, "定位原因", "Locate cause");
      const root = cause.ids[0];
      const rootNode = root ? diagram.nodes.find((x) => x.id === root) : undefined;
      if (rootNode && !rootNode.fault) {
        if ((rootNode.type === "pump" || rootNode.type === "milkPump") && !pumpEffectiveOn(rootNode)) {
          fix = { type: "startPump", nodeId: rootNode.id };
          fixLabel = L(lang, "启动泵", "Start pump");
        } else if (rootNode.type === "solenoid2" && !valve2EffectiveOpen(rootNode)) {
          fix = { type: "openValve", nodeId: rootNode.id };
          fixLabel = L(lang, "打开阀门", "Open valve");
        }
      }
      out.push({
        id: `stall_${p.id}`,
        severity: "warning",
        category: "state",
        kind: "outlet-stalled",
        title: L(lang, "出液口停流", "Outlet stalled"),
        message: L(lang, `「${n.label || n.type}」的上游管路「${p.label || "未命名"}」当前停止流动：${cause.reason}。`, `Upstream pipe "${p.label || "unnamed"}" of "${n.label || n.type}" is stopped: ${cause.reason}.`),
        fixLabel,
        fix,
        elementIds: [...cause.ids, n.id],
        cause,
      });
    }
  }

  // 教学解释层：按诊断类别统一补充「为什么」
  const WHY: Record<string, { zh: string; en: string }> = {
    fluid: {
      zh: "介质类型决定液体的物理属性与教学演示的正确性——接错介质会让学生看到错误的液路（如奶路里显示蒸汽）。",
      en: "Fluid type determines both physics and teaching correctness — a wrong fluid shows students a wrong circuit (e.g. steam inside a milk line).",
    },
    isolated: {
      zh: "没有接入任何管路的元件不参与液路工作，通常是删除残留；若是有意预留请忽略本条。",
      en: "A component with no pipes takes no part in the circuit; usually a leftover. Ignore if intentionally reserved.",
    },
    "port-conflict": {
      zh: "一个端口只能承载一条管路——多连会让两路介质在同一端口互相干扰甚至回流，必须用三通接头分路。",
      en: "One port carries one pipe only — multiple pipes on one port let two fluids interfere or backflow; split with a tee.",
    },
    "check-reverse": {
      zh: "单向阀只允许介质沿一个方向流动——出水口被当入口接会让介质倒流，整条液路逻辑错误。",
      en: "A check valve allows flow one way only — wiring its outlet as an inlet reverses flow and breaks the circuit logic.",
    },
    "pump-no-inlet": {
      zh: "泵是动力源：入口没有管路就无法吸取介质，整条泵送链都是死路。",
      en: "A pump is the power source: with no inlet pipe it cannot draw fluid and the whole pumping chain is a dead end.",
    },
    "pump-no-outlet": {
      zh: "泵出口没有管路时，介质无处可去；运行泵也只会是空转（教学上表现为无下游流动）。",
      en: "With no outlet pipe the pumped fluid has nowhere to go; a running pump idles (no downstream flow).",
    },
    "loose-pipe": {
      zh: "两端都没接端口的管路不参与任何液路，通常是删除残留。",
      en: "A pipe with both ends free takes no part in any circuit; usually a leftover.",
    },
    "pump-off": {
      zh: "泵是液路动力源：泵停止时前后管路没有介质流动。教学演示中关闭泵多为有意为之。",
      en: "The pump is the power source: when it stops, adjacent pipes carry no flow. In teaching demos pumps are often stopped on purpose.",
    },
    "valve-closed": {
      zh: "电磁阀关闭会切断该支路，下游管路随之停流。教学演示中关闭阀门多为有意为之。",
      en: "A closed solenoid cuts the branch and downstream pipes stop. In teaching demos valves are often closed on purpose.",
    },
    fault: {
      zh: "故障标记是教学演练用的：注入故障后观察停流如何向下游传播，再配合因果链定位根因。确认是故意注入的可忽略。",
      en: "Fault marks are for training: inject a fault, watch the stop propagate downstream, then locate the root cause via the causal chain. Ignore intentional ones.",
    },
    "outlet-stalled": {
      zh: "出口没有介质到达：要么被上游的关阀/停泵切断（点开因果链可见根因），要么下游本身就是死路。",
      en: "No fluid reaches the outlet: either an upstream closed valve / stopped pump cuts it (see the causal chain), or the downstream is a dead end.",
    },
    "teaching-override": {
      zh: "教学覆盖只改变画面动画，工程判定仍以泵、阀、故障与拓扑为准，避免讲解效果掩盖真实断流。",
      en: "Teaching overrides only change the on-canvas animation; engineering state still follows pumps, valves, faults and topology.",
    },
  };
  for (const a of out) a.why = WHY[a.kind] ? WHY[a.kind][lang] : undefined;
  // 按严重度排序：error > warning > info；同级别结构问题在前
  const rank: Record<string, number> = { error: 0, warning: 1, info: 2 };
  const catRank: Record<AdviceCategory, number> = { structure: 0, state: 1 };
  out.sort((a, b) => rank[a.severity] - rank[b.severity] || catRank[a.category] - catRank[b.category]);
  return out;
}
