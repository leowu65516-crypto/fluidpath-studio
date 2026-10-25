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
import {
  pipeEngineeringDisabled,
  pipeTeachingOverride,
  setCachedPipes,
  pumpEffectiveOn,
  valveEffectiveOpen,
  valve3EffectivePath,
  findPort,
  pipeSupplyBlocked,
  pipeDemandBlocked,
  pipeInStopCache,
} from "./geometry";
import { diaphragmRouteLabel, diaphragmValveRoute } from "./diaphragmValve";

/** 双语取值 */
const L = (lang: Lang, zh: string, en: string): string => (lang === "zh" ? zh : en);
const isTwoWayFlowValve = (type: string): boolean => type === "solenoid2" || type === "ballValve" || type === "diaphragmValve2" || type === "pulseAirValve";

/** 可执行的修复动作 */
export type FixAction =
  | { type: "setFluid"; pipeId: string; fluidType: FluidType }
  | { type: "deleteNode"; nodeId: string }
  | { type: "deletePipe"; pipeId: string }
  | { type: "detachPipe"; pipeId: string; end: "from" | "to" }
  | { type: "reversePipe"; pipeId: string }
  | { type: "startPump"; nodeId: string }
  | { type: "openValve"; nodeId: string }
  | { type: "renumberPipes" };

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
/**
 * 停流因果链：追溯一根停流管路的根本原因。
 *
 * 归因规则（教学语义）：
 *  - 先看本管、上游元件、上游各来路；汇流点必须「所有来路都断」才算上游断供，
 *    只要还有一条来路有液，就不能把停流归咎于关闭的旁支阀（如快速冲洗阀）。
 *  - 上游全断时汇总所有不同的根因，而不是只报第一条支路。
 *  - 储液罐按液源处理：罐内有液，可直接被泵吸出，不报「上游无供液」。
 * @returns 根因描述 + 从根因到该管的元素 id 链
 */
export function traceStopCause(pipe: Pipe, diagram: Diagram, lang: Lang = "zh"): { reason: string; ids: string[] } {
  setCachedPipes(diagram.pipes, diagram.nodes);
  const targetLabel = pipe.label || L(lang, "未命名管路", "unnamed pipe");

  type CauseKind = "self" | "cut" | "source" | "downstream" | "unknown";
  interface Cause {
    reason: string;
    ids: string[];
    kind: CauseKind;
    /** 聚合归因时的叶子原因（避免「上游 N 条来路」套娃） */
    details?: string[];
  }

  const nodeLabel = (n: Diagram["nodes"][number]) => n.label || n.type;
  const pipeLabel = (p: Pipe) => p.label || L(lang, "未命名管路", "unnamed pipe");

  // 归因分层：本管自身 → 上游供液 → 下游去处。
  // 先排除「上游有液、只是下游全关」的情况，否则会把关闭的旁支阀误当成根因。
  const selfBlocked = pipe.disabled || pipe.fault === "pipeBlocked" ||
    pipeTeachingOverride(pipe) === "stop";
  if (pipeTeachingOverride(pipe) === "stop") {
    return {
      reason: L(
        lang,
        `「${targetLabel}」被设置为教学强制停流；这是画面显示覆盖，工程状态可能仍在流动`,
        `"${targetLabel}" has a teaching forced-stop override; this affects the animation, not necessarily the engineering state`
      ),
      ids: [pipe.id],
    };
  }
  if (!selfBlocked && !pipeInStopCache(pipe) && pipeDemandBlocked(pipe) && !pipeSupplyBlocked(pipe, diagram.nodes)) {
    return {
      reason: L(
        lang,
        `「${targetLabel}」上游有液，但下游没有开放去处（下游阀门全关或管路走到死路）`,
        `"${targetLabel}" has liquid upstream, but no open destination downstream (all downstream valves closed or a dead end)`
      ),
      ids: [pipe.id],
    };
  }

  /** 某端口上「有效流入」的管路（用于说明这个阀切断的是哪一段） */
  const feedPipeAt = (n: Diagram["nodes"][number], portId: string): Pipe | undefined =>
    diagram.pipes.find((op) => {
      const oe = effectiveEnds(diagram, op);
      return oe.v?.node.id === n.id && oe.v.port.id === portId;
    });

  const valveKindLabel = (n: Diagram["nodes"][number], t: (zh: string, en: string) => string): string => {
    if (n.type === "ballValve") return t("球阀", "ball valve");
    if (n.type === "diaphragmValve2") return t("两通隔膜阀", "2-way diaphragm valve");
    if (n.type === "pulseAirValve") return t("脉冲空气阀", "pulse air valve");
    return t("两通电磁阀", "2-way solenoid");
  };

  const walk = (p: Pipe, visited: Set<string>): Cause | null => {
    if (visited.has(p.id)) return null;
    visited.add(p.id);
    if (visited.size > 200) return null; // 防环/防深度爆炸

    const label = pipeLabel(p);
    if (p.disabled) {
      return { reason: L(lang, `管路「${label}」被工程禁用，这一段本身不通`, `Pipe "${label}" is engineering-disabled; this segment is cut`), ids: [p.id], kind: "self" };
    }
    if (p.fault === "pipeBlocked") {
      return { reason: L(lang, `管路「${label}」堵塞（故障模拟），介质过不去`, `Pipe "${label}" is blocked (fault simulation); fluid cannot pass`), ids: [p.id], kind: "self" };
    }

    const { u, v } = effectiveEnds(diagram, p);
    if (!u) {
      return { reason: L(lang, `「${label}」没有上游连接，无法形成流动`, `"${label}" has no upstream connection, so it cannot flow`), ids: [p.id], kind: "unknown" };
    }

    const n = u.node;
    if (n.disabled) {
      return {
        reason: L(
          lang,
          `「${nodeLabel(n)}」被工程禁用，相当于从液路中移除；与它相连的「${label}」随之停流`,
          `"${nodeLabel(n)}" is engineering-disabled (removed from the circuit); the connected "${label}" stops`
        ),
        ids: [n.id, p.id],
        kind: "cut",
      };
    }

    if (n.type === "pump" || n.type === "milkPump" || n.type === "airPump") {
      if (!pumpEffectiveOn(n)) {
        const why = n.fault === "pumpStuck" ? L(lang, "卡死（故障模拟）", "seized (fault simulation)") : L(lang, "未运行", "not running");
        const inPort = n.ports.find((pp) => pp.direction === "in");
        const feed = inPort ? feedPipeAt(n, inPort.id) : undefined;
        const from = feed ? `「${pipeLabel(feed)}」` : L(lang, "入口", "its inlet");
        return {
          reason: L(
            lang,
            `「${nodeLabel(n)}」${why}，无法把${from}的介质送到「${label}」`,
            `"${nodeLabel(n)}" is ${why} and cannot move fluid from ${from} to "${label}"`
          ),
          ids: [n.id, p.id],
          kind: "cut",
        };
      }
    }

    if (isTwoWayFlowValve(n.type)) {
      if (!valveEffectiveOpen(n)) {
        const why = n.fault === "valveStuckClosed" ? L(lang, "卡关（故障模拟）", "stuck closed (fault simulation)") : L(lang, "关闭", "closed");
        const inPort = n.ports.find((pp) => pp.direction === "in");
        const feed = inPort ? feedPipeAt(n, inPort.id) : undefined;
        const from = feed ? `「${pipeLabel(feed)}」` : L(lang, "上游", "upstream");
        return {
          reason: L(
            lang,
            `「${nodeLabel(n)}」（${valveKindLabel(n, (zh, en) => L(lang, zh, en))}）${why}，切断了${from} → 「${label}」这一路，介质过不去`,
            `"${nodeLabel(n)}" (${valveKindLabel(n, (zh, en) => L(lang, zh, en))}) is ${why}, cutting ${from} → "${label}"; fluid cannot pass`
          ),
          ids: [n.id, p.id],
          kind: "cut",
        };
      }
    }

    if (n.type === "solenoid3") {
      const path = valve3EffectivePath(n);
      if (path === "off") {
        const why = n.fault === "valveStuckClosed" ? L(lang, "卡关（故障模拟）", "stuck closed (fault simulation)") : L(lang, "全关", "fully closed");
        return {
          reason: L(lang, `「${nodeLabel(n)}」${why}：入口与 A/B 两路出口都不通，介质无法进入「${label}」`, `"${nodeLabel(n)}" is ${why}: inlet and both A/B outlets are cut, so fluid cannot reach "${label}"`),
          ids: [n.id, p.id],
          kind: "cut",
        };
      }
      const outPorts = n.ports.filter((pp) => pp.direction === "out");
      const outA = outPorts.find((pp) => pp.position === "right") ?? outPorts[0];
      const outB = outPorts.find((pp) => pp.position === "bottom") ?? outPorts[1];
      const activeId = path === "A" ? outA?.id : outB?.id;
      if (u.port.direction === "out" && u.port.id !== activeId) {
        return {
          reason: L(
            lang,
            `「${nodeLabel(n)}」当前导通 ${path} 路，而「${label}」接在未导通的另一路上；介质被导向了 ${path} 路`,
            `"${nodeLabel(n)}" currently routes path ${path}, while "${label}" is on the other, inactive branch; fluid is diverted to ${path}`
          ),
          ids: [n.id, p.id],
          kind: "cut",
        };
      }
    }

    if (n.type === "diaphragmValve3") {
      const path = valve3EffectivePath(n);
      if (path === "off") {
        const why = n.fault === "valveStuckClosed" ? L(lang, "卡关（故障模拟）", "stuck closed (fault simulation)") : L(lang, "关闭", "closed");
        return {
          reason: L(lang, `「${nodeLabel(n)}」${why}，三个端口互不连通，「${label}」没有介质`, `"${nodeLabel(n)}" is ${why}; its three ports are isolated, so "${label}" gets no fluid`),
          ids: [n.id, p.id],
          kind: "cut",
        };
      }
      const route = diaphragmValveRoute(n, path);
      if (!route.activePortIds.has(u.port.id)) {
        const current = diaphragmRouteLabel(n, path);
        return {
          reason: L(
            lang,
            `「${nodeLabel(n)}」当前只连通 ${current}；「${label}」所在端口不在通路上，介质走另一条支路`,
            `"${nodeLabel(n)}" currently connects only ${current}; the port feeding "${label}" is outside the active route`
          ),
          ids: [n.id, p.id],
          kind: "cut",
        };
      }
    }

    // 下游直接断点：介质走到这里没有去处（关闭的阀 / 停转的泵 / 禁用元件）。
    // 先于“上游供液”判断，避免把「奶罐→禁用阀」这类上游管误报成奶罐没液。
    if (v) {
      const vn = v.node;
      const vlabel = nodeLabel(vn);
      if (vn.disabled) {
        return {
          reason: L(lang, `下游「${vlabel}」被工程禁用，介质没有去处；上游「${label}」因此停流`, `Downstream "${vlabel}" is engineering-disabled, so there is no destination; "${label}" stops`),
          ids: [vn.id, p.id],
          kind: "cut",
        };
      }
      if (vn.type === "pump" || vn.type === "milkPump" || vn.type === "airPump") {
        if (!pumpEffectiveOn(vn)) {
          const why = vn.fault === "pumpStuck" ? L(lang, "卡死（故障模拟）", "seized (fault simulation)") : L(lang, "未运行", "not running");
          return {
            reason: L(lang, `下游「${vlabel}」${why}，泵不吸液，「${label}」里的介质不会被带走`, `Downstream "${vlabel}" is ${why}; the pump does not draw, so fluid in "${label}" is not moved`),
            ids: [vn.id, p.id],
            kind: "cut",
          };
        }
      }
      if (isTwoWayFlowValve(vn.type) && !valveEffectiveOpen(vn)) {
        const why = vn.fault === "valveStuckClosed" ? L(lang, "卡关（故障模拟）", "stuck closed (fault simulation)") : L(lang, "关闭", "closed");
        return {
          reason: L(lang, `下游「${vlabel}」（${valveKindLabel(vn, (zh, en) => L(lang, zh, en))}）${why}，介质到此被截断，「${label}」没有去处`, `Downstream "${vlabel}" (${valveKindLabel(vn, (zh, en) => L(lang, zh, en))}) is ${why}; fluid is cut off and "${label}" has no destination`),
          ids: [vn.id, p.id],
          kind: "cut",
        };
      }
      if (vn.type === "solenoid3") {
        const path = valve3EffectivePath(vn);
        if (path === "off") {
          return {
            reason: L(lang, `下游「${vlabel}」全关，入口与 A/B 两路出口互不连通，「${label}」没有去处`, `Downstream "${vlabel}" is fully closed; its inlet and A/B outlets are isolated, so "${label}" has no destination`),
            ids: [vn.id, p.id],
            kind: "cut",
          };
        }
        const outPorts = vn.ports.filter((pp) => pp.direction === "out");
        const outA = outPorts.find((pp) => pp.position === "right") ?? outPorts[0];
        const outB = outPorts.find((pp) => pp.position === "bottom") ?? outPorts[1];
        const activeId = path === "A" ? outA?.id : outB?.id;
        if (v.port.direction === "out" && v.port.id !== activeId) {
          return {
            reason: L(lang, `下游「${vlabel}」当前导通 ${path} 路，本段接在未导通的另一路上，「${label}」的介质过不去`, `Downstream "${vlabel}" routes path ${path}; this segment is on the inactive branch, so "${label}" cannot pass`),
            ids: [vn.id, p.id],
            kind: "cut",
          };
        }
      }
      if (vn.type === "diaphragmValve3") {
        const path = valve3EffectivePath(vn);
        const route = diaphragmValveRoute(vn, path);
        if (path === "off" || !route.activePortIds.has(v.port.id)) {
          const current = path === "off" ? L(lang, "全关", "fully closed") : diaphragmRouteLabel(vn, path);
          return {
            reason: L(lang, `下游「${vlabel}」当前只连通 ${current}，本段端口不在通路上，「${label}」的介质没有去处`, `Downstream "${vlabel}" connects only ${current}; this port is outside the active route, so "${label}" has no destination`),
            ids: [vn.id, p.id],
            kind: "cut",
          };
        }
      }
    }

    // 储液罐是液源：罐内介质不依赖上游来液，停流原因在下游而不是“没有供液”。
    if (n.type === "tank") {
      return {
        reason: L(
          lang,
          `「${nodeLabel(n)}」是储液罐（液源），罐内介质可以直接被泵吸出；这一段停流不是奶罐/水箱供液问题，应检查下游阀门是否关闭、下游有没有开放去处`,
          `"${nodeLabel(n)}" is a tank (liquid source); its contents can be drawn directly by the pump. The stop is not a supply problem — check downstream valves and open destinations`
        ),
        ids: [n.id, p.id],
        kind: "source",
      };
    }

    // 上游各来路：汇流语义——任一路仍有供液，就不能把停流归因于其他关闭的旁支。
    const isJunction = JUNCTION_TYPES.has(n.type);
    const inPortIds = new Set(n.ports.filter((pp) => pp.direction === "in").map((pp) => pp.id));
    const feeds: Pipe[] = [];
    for (const op of diagram.pipes) {
      if (op.id === p.id) continue;
      const oe = effectiveEnds(diagram, op);
      const feedsHere = isJunction
        ? oe.v && oe.v.node.id === n.id
        : oe.v && inPortIds.has(oe.v.port.id);
      if (feedsHere) feeds.push(op);
    }

    if (feeds.length === 0) {
      return {
        reason: L(
          lang,
          `「${label}」上游没有接入任何供液管，介质没有来源`,
          `"${label}" has no incoming supply pipe; there is no source of fluid`
        ),
        ids: [p.id],
        kind: "unknown",
      };
    }

    // 第一遍：只要还有一条来路在供液，就不是上游断供（原因在下游/去处）。
    if (feeds.some((op) => !pipeSupplyBlocked(op, diagram.nodes))) {
      return {
        reason: L(
          lang,
          `「${label}」上游仍有供液；停流是因为下游没有开放去处（下游阀门全关或管路走到死路）`,
          `"${label}" still has upstream supply; it stops because downstream has no open destination (all downstream valves closed or a dead end)`
        ),
        ids: [p.id],
        kind: "downstream",
      };
    }

    // 第二遍：所有来路都断了，逐条追溯并汇总不同的阻断点。
    const causes: Cause[] = [];
    for (const op of feeds) {
      const sub = walk(op, new Set(visited));
      if (sub) causes.push(sub);
    }
    if (causes.length === 0) {
      return {
        reason: L(
          lang,
          `「${label}」上游的几条来路都没有可用的供液，也未找到明确的阻断元件`,
          `None of the upstream branches can supply "${label}", and no clear blocking element was found`
        ),
        ids: [p.id],
        kind: "unknown",
      };
    }

    const seenRoots = new Set<string>();
    const roots = causes.filter((c) => {
      const key = c.ids[0] ?? c.reason;
      if (seenRoots.has(key)) return false;
      seenRoots.add(key);
      return true;
    });

    if (roots.length === 1) {
      return { ...roots[0], ids: [...roots[0].ids, p.id] };
    }

    // 多个根因：优先列出真正的“切断点”；液源正常只是说明该支路不是断点。
    const cutRoots = roots.filter((c) => c.kind === "cut");
    const chosen = cutRoots.length > 0 ? cutRoots : roots;
    if (chosen.length === 1) {
      return { ...chosen[0], ids: [...chosen[0].ids, p.id] };
    }
    const details = chosen.flatMap((c) => c.details ?? [c.reason]);
    const numbered = details.map((d, i) => `${["①", "②", "③", "④", "⑤"][i] ?? `(${i + 1})`}${d}`).join(L(lang, "；", "; "));
    return {
      reason: L(
        lang,
        `上游有 ${details.length} 处阻断：${numbered}`,
        `${details.length} blocking points upstream: ${numbered}`
      ),
      ids: [...chosen[0].ids, p.id],
      kind: cutRoots.length > 0 ? "cut" : chosen[0].kind,
      details,
    };
  };

  const cause = walk(pipe, new Set<string>());
  if (!cause) {
    return { reason: L(lang, "未找到明确原因", "No clear cause found"), ids: [pipe.id] };
  }
  const ids = cause.ids[cause.ids.length - 1] === pipe.id ? cause.ids : [...cause.ids, pipe.id];
  let reason = cause.reason;
  if (cause.kind === "cut" && !reason.includes(targetLabel)) {
    reason += L(lang, `，导致「${targetLabel}」没有介质流动`, `, so "${targetLabel}" carries no fluid`);
  }
  return { reason, ids };
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

  // 1b) 线路编号重复：自动编号应唯一；自定义名称重复时只提示不自动改
  const labelGroups = new Map<string, typeof diagram.pipes>();
  for (const p of diagram.pipes) {
    if (scoped && pipeIds && !pipeIds.has(p.id)) continue;
    const key = (p.label || "").trim().toLowerCase();
    if (!key) continue;
    const group = labelGroups.get(key) ?? [];
    group.push(p);
    labelGroups.set(key, group);
  }
  for (const [key, group] of labelGroups) {
    if (group.length < 2) continue;
    const allAuto = group.every((p) => /^(管路|Pipe)\s*\d+$/i.test((p.label || "").trim()));
    out.push({
      id: `duplicate_pipe_label_${key}`,
      severity: "warning",
      category: "structure",
      kind: "duplicate-pipe-label",
      title: L(lang, "管路编号重复", "Duplicate pipe label"),
      message: L(
        lang,
        `「${group[0].label}」出现 ${group.length} 次；线路编号应唯一，否则导出、BOM 和现场排查时无法区分具体管段。`,
        `"${group[0].label}" appears ${group.length} times; line numbers should be unique for export, BOM, and field troubleshooting.`
      ),
      fixLabel: allAuto ? L(lang, "重新编号自动管路", "Renumber automatic pipes") : L(lang, "定位重复管路", "Locate duplicates"),
      fix: allAuto ? { type: "renumberPipes" } : undefined,
      elementIds: group.map((p) => p.id),
    });
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
    if (isTwoWayFlowValve(n.type) && !valveEffectiveOpen(n)) {
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
          title: n.type === "ballValve" ? L(lang, "球阀关闭", "Ball valve closed") : n.type === "pulseAirValve" ? L(lang, "脉冲空气阀关闭", "Pulse air valve closed") : L(lang, "电磁阀关闭", "Solenoid closed"),
          message: L(
            lang,
            `「${n.label || n.type}」当前关闭，它所在的这条支路会停流；与它并联的主路仍可由自己的泵/阀供液，不会因为这一个阀关闭而断流。`,
            `"${n.label || n.type}" is closed; its own branch stops. Parallel branches are still fed by their own pumps/valves and are not cut by this valve alone.`
          ),
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
    if ((n.type === "pump" || n.type === "milkPump" || n.type === "airPump" || isTwoWayFlowValve(n.type))) continue; // 已由 6) 覆盖
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
        } else if (isTwoWayFlowValve(rootNode.type) && !valveEffectiveOpen(rootNode)) {
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
    "duplicate-pipe-label": {
      zh: "线路编号是图纸的交付语言：重复编号会让 BOM、故障码和现场排查同时指向多个对象。自动重排只改「管路 N / Pipe N」这类自动编号，自定义名称（如「奶路」「蒸汽旁通」）会保留。",
      en: "Line numbers are the delivery language of a drawing: duplicates make BOM, fault codes, and field checks point at multiple objects. Automatic renumbering only changes generated labels such as \"Pipe N\"; custom names are preserved.",
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
      zh: "两通阀只控制自己所在的那条支路：关闭它，该支路停流；其他并联支路仍可由各自的泵/阀供液。只有当它位于当前主出液路径上时，才会导致出口停流——判断根因要看「为什么停流」里的因果链，而不是只看某个阀关着。",
      en: "A two-way valve controls only its own branch: closing it stops that branch, while parallel branches keep their own supply. It stalls an outlet only when it sits on the active delivery path — use the stop-cause chain rather than a closed-valve list to identify the root cause.",
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
