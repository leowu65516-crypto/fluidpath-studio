/**
 * 故障演练（profile 0.4-draft，1.47.0）。
 *
 * 思路：知识库里的部件组是"演什么"的声明；落到画布后，用现有工程状态字段
 * （Node.fault / pumpOn / valveState / valvePath / disabled / Pipe.fault）注入，
 * 再由引擎重算停流传播，最后对比注入前后的停流集合得到"差异视觉"。
 * 不新增求解逻辑、不改导出、不改教学覆盖语义。
 */
import { computeDisabledPipes } from "../geometry";
import { applyWorkConditionSnapshot, snapshotWorkCondition } from "../presets";
import { store, updateDiagram } from "../store";
import type { Diagram, DiagramNode, NodeFault, Pipe, WorkCondition } from "../types";
import { resolveHighlightGroupTargets } from "./profile";
import { diagnosticSession, setDrillSession, clearDrillSession, type DrillInjectedTarget, type DrillSession } from "./session";
import type { DiagnosticProfile, DrillBehavior, FaultDrill } from "./types";

const PUMP_TYPES = new Set(["pump", "milkPump", "airPump"]);
const TWO_STATE_VALVES = new Set(["valve", "solenoid2", "diaphragmValve2", "pulseAirValve", "ballValve"]);
const THREE_STATE_VALVES = new Set(["solenoid3", "diaphragmValve3"]);
const BLOCKABLE_PASSIVES = new Set(["checkValve", "pressureRegulator", "filter", "metalFilter", "flowMeter", "heatExchanger", "thermoblock"]);

type NodePatch = Partial<Pick<DiagramNode, "pumpOn" | "valveState" | "valvePath" | "disabled">> & { fault?: NodeFault | null };
type PipePatch = Partial<Pick<Pipe, "disabled">> & { fault?: Pipe["fault"] | null };

export const BEHAVIOR_META: Record<DrillBehavior, { zh: string; en: string; glyph: string }> = {
  stopped: { zh: "停止", en: "Stopped", glyph: "⏹" },
  running: { zh: "运行", en: "Running", glyph: "▶" },
  stuckClosed: { zh: "卡关", en: "Stuck closed", glyph: "🔒" },
  stuckOpen: { zh: "卡开", en: "Stuck open", glyph: "🔓" },
  disabled: { zh: "禁用", en: "Disabled", glyph: "🚫" },
  enabled: { zh: "启用", en: "Enabled", glyph: "✓" },
};

export interface DrillTargets {
  nodes: Array<{ nodeId: string; groupId: string; behavior: DrillBehavior; patch: NodePatch }>;
  pipes: Array<{ pipeId: string; groupId: string; behavior: DrillBehavior; patch: PipePatch }>;
  missingGroups: string[];
}

function nodePatchFor(type: DiagramNode["type"], behavior: DrillBehavior): NodePatch {
  if (behavior === "disabled") return { disabled: true };
  if (behavior === "enabled") return { disabled: false, fault: null };
  if (PUMP_TYPES.has(type)) {
    if (behavior === "stopped") return { pumpOn: false, fault: null };
    if (behavior === "running") return { pumpOn: true, fault: null };
    if (behavior === "stuckClosed") return { fault: "pumpStuck" };
    return { fault: null };
  }
  if (THREE_STATE_VALVES.has(type)) {
    if (behavior === "stopped") return { valvePath: "off", fault: null };
    if (behavior === "running") return { valvePath: "A", fault: null };
    if (behavior === "stuckClosed") return { fault: "valveStuckClosed" };
    return { fault: "valveStuckOpen" };
  }
  if (TWO_STATE_VALVES.has(type)) {
    if (behavior === "stopped") return { valveState: "closed", fault: null };
    if (behavior === "running") return { valveState: "open", fault: null };
    if (behavior === "stuckClosed") return { fault: "valveStuckClosed" };
    return { fault: "valveStuckOpen" };
  }
  if (BLOCKABLE_PASSIVES.has(type)) {
    return behavior === "stuckOpen" || behavior === "running" ? { fault: null } : { fault: "valveStuckClosed" };
  }
  return behavior === "stuckOpen" || behavior === "running" ? { fault: null } : { fault: "valveStuckClosed" };
}

function pipePatchFor(behavior: DrillBehavior): PipePatch {
  if (behavior === "stuckClosed" || behavior === "stopped" || behavior === "disabled") return { fault: "pipeBlocked" };
  return { fault: null };
}

/** 把演练动作解析为具体元件/管路补丁（纯函数，不修改输入）。 */
export function resolveDrillTargets(diagram: Diagram, profile: DiagnosticProfile, drill: FaultDrill): DrillTargets {
  const nodes: DrillTargets["nodes"] = [];
  const pipes: DrillTargets["pipes"] = [];
  const missingGroups: string[] = [];
  const seenNodes = new Set<string>(), seenPipes = new Set<string>();
  for (const action of drill.actions ?? []) {
    const targets = resolveHighlightGroupTargets(diagram, profile, action.groupId);
    if (!profile.highlightGroups.some(group => group.id === action.groupId) || (!targets.nodes.length && !targets.pipes.length)) missingGroups.push(action.groupId);
    for (const nodeId of targets.nodes) {
      if (seenNodes.has(nodeId)) continue;
      seenNodes.add(nodeId);
      const node = diagram.nodes.find(item => item.id === nodeId);
      if (!node) continue;
      nodes.push({ nodeId, groupId: action.groupId, behavior: action.behavior, patch: nodePatchFor(node.type, action.behavior) });
    }
    for (const pipeId of targets.pipes) {
      if (seenPipes.has(pipeId)) continue;
      seenPipes.add(pipeId);
      pipes.push({ pipeId, groupId: action.groupId, behavior: action.behavior, patch: pipePatchFor(action.behavior) });
    }
  }
  return { nodes, pipes, missingGroups };
}

function applyPatch(target: Record<string, unknown>, patch: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete target[key];
    else target[key] = value;
  }
}

/** 在给定图纸上应用演练（基线工况 → 注入动作）；直接修改传入的 draft。 */
export function applyDrillToDiagram(diagram: Diagram, profile: DiagnosticProfile, drill: FaultDrill): { missingGroups: string[]; missingCondition: boolean } {
  let missingCondition = false;
  if (drill.conditionName) {
    const condition = diagram.settings.workConditions?.find(item => item.name === drill.conditionName);
    if (condition) applyWorkConditionSnapshot(diagram, condition);
    else missingCondition = true;
  }
  const targets = resolveDrillTargets(diagram, profile, drill);
  for (const target of targets.nodes) {
    const node = diagram.nodes.find(item => item.id === target.nodeId);
    if (node) applyPatch(node as unknown as Record<string, unknown>, target.patch as unknown as Record<string, unknown>);
  }
  for (const target of targets.pipes) {
    const pipe = diagram.pipes.find(item => item.id === target.pipeId);
    if (pipe) applyPatch(pipe as unknown as Record<string, unknown>, target.patch as unknown as Record<string, unknown>);
  }
  return { missingGroups: targets.missingGroups, missingCondition };
}

/** 引擎停流集合（用于差异对比）。 */
export function pipeStopSet(diagram: Diagram): Set<string> {
  return computeDisabledPipes(diagram.pipes, diagram.nodes);
}

export interface DrillStartResult {
  ok: boolean;
  reason?: "no-profile" | "no-fault" | "no-drill";
  session?: DrillSession;
  missingGroups?: string[];
  missingCondition?: boolean;
  /** 剧本声明的基线工况名（缺失时用于给出一键创建入口）。 */
  missingConditionName?: string;
}

/** 开始演练：记录基线 → 注入 → 计算差异 → 写入图纸并挂载会话。 */
export function startFaultDrill(faultId: string): DrillStartResult {
  const diagram = store.get().diagram;
  const profile = diagram.settings.diagnosticProfile;
  if (!profile) return { ok: false, reason: "no-profile" };
  const fault = profile.diagnostics.find(item => item.id === faultId);
  if (!fault) return { ok: false, reason: "no-fault" };
  const drill = fault.drill;
  if (!drill || !(drill.actions?.length)) return { ok: false, reason: "no-drill" };

  const baseline = snapshotWorkCondition(diagram);
  const before = pipeStopSet(diagram);
  const preview = structuredClone(diagram);
  const applied = applyDrillToDiagram(preview, profile, drill);
  const after = pipeStopSet(preview);
  const stoppedPipes = [...after].filter(id => !before.has(id));
  const flowingPipes = [...before].filter(id => !after.has(id));
  const targets = resolveDrillTargets(diagram, profile, drill);
  const injected: DrillInjectedTarget[] = targets.nodes.map(target => ({ nodeId: target.nodeId, groupId: target.groupId, behavior: target.behavior }));

  updateDiagram(draft => { applyDrillToDiagram(draft, profile, drill); });
  const session: DrillSession = {
    faultId: fault.id,
    faultCode: fault.code,
    baseline,
    changes: { stoppedPipes, flowingPipes },
    injected,
    note: drill.note,
  };
  setDrillSession(session);
  return { ok: true, session, missingGroups: applied.missingGroups, missingCondition: applied.missingCondition, missingConditionName: applied.missingCondition ? drill.conditionName : undefined };
}

/**
 * "全通基线"工况：泵全开、两通阀全开、三通置 A、清除教学故障注入。
 * KB 演练剧本声明的基线工况在目标图纸缺失时，用它一键补齐——保证演练有现象可看；
 * 工况保存进图纸 workConditions（可撤销、可再编辑），不是隐藏状态。
 */
export function createRunBaselineCondition(diagram: Diagram, name: string): WorkCondition {
  const draft = structuredClone(diagram);
  for (const node of draft.nodes) {
    if (PUMP_TYPES.has(node.type)) node.pumpOn = true;
    else if (TWO_STATE_VALVES.has(node.type)) node.valveState = "open";
    else if (THREE_STATE_VALVES.has(node.type)) node.valvePath = "A";
    if (node.fault) delete node.fault;
  }
  for (const pipe of draft.pipes) if (pipe.fault) delete pipe.fault;
  const snapshot = snapshotWorkCondition(draft);
  return { name, ...snapshot };
}

/**
 * 演练残留：图上仍挂着属于某演练配置目标的 fault 注入（演练中刷新/崩溃后，
 * 会话丢失但注入已被自动保存持久化）。工况快照只含泵/阀态，不清 fault，
 * 所以全通基线重演前必须显式清除，否则"注入已停的链路"演不出差异。
 */
export function drillResidueIds(diagram: Diagram, profile: DiagnosticProfile): { nodes: string[]; pipes: string[] } {
  const nodes: string[] = [], pipes: string[] = [];
  for (const fault of profile.diagnostics) {
    for (const action of fault.drill?.actions ?? []) {
      const targets = resolveHighlightGroupTargets(diagram, profile, action.groupId);
      for (const id of targets.nodes) {
        const node = diagram.nodes.find(item => item.id === id);
        if (node?.fault && !nodes.includes(id)) nodes.push(id);
      }
      for (const id of targets.pipes) {
        const pipe = diagram.pipes.find(item => item.id === id);
        if (pipe?.fault && !pipes.includes(id)) pipes.push(id);
      }
    }
  }
  return { nodes, pipes };
}

/** 清除演练残留（仅 drill 目标上的 fault，不动用户的工程禁用）。返回清除数量。 */
export function clearDrillResidue(diagram: Diagram, profile: DiagnosticProfile): number {
  const residue = drillResidueIds(diagram, profile);
  for (const id of residue.nodes) {
    const node = diagram.nodes.find(item => item.id === id);
    if (node?.fault) delete node.fault;
  }
  for (const id of residue.pipes) {
    const pipe = diagram.pipes.find(item => item.id === id);
    if (pipe?.fault) delete pipe.fault;
  }
  return residue.nodes.length + residue.pipes.length;
}

/** 基线工况缺失时的一键重演：清除演练残留，创建全通基线工况，再以它为基线重演。 */
export function restartDrillWithBaseline(faultId: string, conditionName: string): DrillStartResult {
  restoreFaultDrill();
  const diagram = store.get().diagram;
  const profile = diagram.settings.diagnosticProfile;
  if (profile) updateDiagram(draft => { clearDrillResidue(draft, profile); });
  const created = createRunBaselineCondition(store.get().diagram, conditionName);
  updateDiagram(draft => {
    if (!draft.settings.workConditions) draft.settings.workConditions = [];
    if (!draft.settings.workConditions.some(item => item.name === conditionName)) draft.settings.workConditions.push(created);
  });
  return startFaultDrill(faultId);
}

/** 还原演练前的状态（等价于一次显式 undo），并退出演练会话。 */
export function restoreFaultDrill(): boolean {
  const drill = diagnosticSession.get().drill;
  if (!drill) return false;
  const baseline = { name: "__drill_baseline__", ...drill.baseline } as WorkCondition;
  updateDiagram(draft => { applyWorkConditionSnapshot(draft, baseline); });
  clearDrillSession();
  return true;
}
