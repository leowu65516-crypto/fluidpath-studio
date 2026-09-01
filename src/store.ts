import { useSyncExternalStore } from "react";
import { uid, FLUID_PRESETS } from "./types";
import type {
  AppState,
  Diagram,
  DiagramNode,
  NodeType,
  Pipe,
  PortDirection,
  PortPosition,
  Pt,
  Selection,
  ShapeVariant,
  ValidationCase
} from "./types";
import { createEmptyDiagram, createCoffeeMachineDiagram, createSteamSystemDiagram, createMilkFoamDiagram, createCommercialMachineDiagram, createDemoMachineDiagram, createSemiAutoMachineDiagram, createFullAutoMachineDiagram } from "./sample";
import { createNode } from "./symbols";
import { nodeBBox, pipePolyline, polylineBBox } from "./geometry";
import { getScenario, collectScenarioState, resolveScenarioRoles, valveActionsToPreset } from "./scenarios";
import { snapshotStates, applyStates, diffStateIds, type PresetState } from "./presets";
import { toast } from "./toast";
import type { FixAction } from "./advice";

/** 当前 UI 语言（由 LangProvider 同步到 html lang；供数据层 toast 双语） */
function sysLang(): "zh" | "en" {
  try { return typeof document !== "undefined" && document.documentElement.lang === "en" ? "en" : "zh"; } catch { return "zh"; }
}
/** 双语取值 */
function L(lang: "zh" | "en", zh: string, en: string): string {
  return lang === "zh" ? zh : en;
}

const MAX_HISTORY = 100;

let state: AppState = {
  diagram: createEmptyDiagram(), // 启动空白图（用户要求：打开即空白）
  ui: {
    zoom: 1,
    panX: 40,
    panY: 20,
    selection: { nodes: [], pipes: [] },
    mouseWorld: { x: 0, y: 0 },
    dirty: false
  }
};

let past: Diagram[] = [];
let future: Diagram[] = [];

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

export const store = {
  get: (): AppState => state,
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }
};

export function useAppState(): AppState {
  return useSyncExternalStore(store.subscribe, store.get);
}

function setState(next: AppState) {
  state = next;
  emit();
  if (next.ui.dirty) _scheduleAutosave(next.diagram);
}

/** 定位闪烁：脉冲高亮指定元件（诊断/演示定位用），2.4s 后自动清除 */
let blinkTimer: ReturnType<typeof setTimeout> | null = null;
// ===== 自动保存 / 崩溃恢复（领域模块 store-autosave.ts，此处 API 全兼容 re-export） =====
export { AUTOSAVE_MAX_VERSIONS } from "./store-autosave";
export type { AutosaveVersion } from "./store-autosave";
export {
  setSourceFilePath,
  fileAutosaveStatus,
  setFileAutosave,
  scheduleAutosave,
  flushAutosave,
  getAutosaveVersions,
  pendingAutosave,
  restoreAutosaveVersion,
  recordSavedAt,
  clearAutosave,
  lastEditedDiagramId
} from "./store-autosave";
import { initAutosave, type ElectronBridge } from "./store-autosave";

initAutosave({
  getDiagram: () => state.diagram,
  notifyUI: (patch) => setUI(patch),
  reloadDiagram: (d) => loadDiagram(d),
});

// 本地引用（内部逻辑继续使用；对外仍走上方 re-export）
import { scheduleAutosave as _scheduleAutosave, recordSavedAt as _recordSavedAt } from "./store-autosave";
void _scheduleAutosave; void _recordSavedAt;

// ===== 多窗口剪贴板通道（网页版 BroadcastChannel + 系统剪贴板） =====
const WEB_SELECTION_CHANNEL = "fluidpath.selection.v1";
const WEB_SELECTION_PREFIX = "FLUIDPATH_SELECTION_V1:";
let webSelectionChannel: BroadcastChannel | null = null;

function getWebSelectionChannel() {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!webSelectionChannel) {
    webSelectionChannel = new BroadcastChannel(WEB_SELECTION_CHANNEL);
    webSelectionChannel.onmessage = (event: MessageEvent<unknown>) => {
      if (typeof event.data !== "string") return;
      const clipboard = parseSelectionClipboard(event.data);
      if (clipboard) setUI({ clipboard });
    };
  }
  return webSelectionChannel;
}

async function writeWebSelectionClipboard(serialized: string) {
  getWebSelectionChannel()?.postMessage(serialized);
  try {
    await navigator.clipboard?.writeText(`${WEB_SELECTION_PREFIX}${serialized}`);
  } catch {
    // BroadcastChannel 已覆盖同一站点的多窗口；浏览器剪贴板权限被拒绝时不影响该路径。
  }
}

async function readWebSelectionClipboard(): Promise<string | null> {
  try {
    const text = await navigator.clipboard?.readText();
    return text?.startsWith(WEB_SELECTION_PREFIX) ? text.slice(WEB_SELECTION_PREFIX.length) : null;
  } catch {
    return null;
  }
}

if (typeof window !== "undefined") getWebSelectionChannel();


export function blinkElements(ids: string[]) {
  if (blinkTimer) clearTimeout(blinkTimer);
  setUI({ blink: { ids, stamp: Date.now() } });
  blinkTimer = setTimeout(() => {
    blinkTimer = null;
    setUI({ blink: null });
  }, 2400);
}
let chainTimer: ReturnType<typeof setTimeout> | null = null;
export function showChainPath(pipeIds: string[]) {
  if (chainTimer) clearTimeout(chainTimer);
  setUI({ chainPath: { pipeIds, stamp: Date.now() } });
  chainTimer = setTimeout(() => {
    chainTimer = null;
    setUI({ chainPath: null });
  }, 2800);
}
export function clearChainPath() {
  if (chainTimer) clearTimeout(chainTimer);
  chainTimer = null;
  setUI({ chainPath: null });
}

export function clearBlink() {
  if (blinkTimer) clearTimeout(blinkTimer);
  blinkTimer = null;
  setUI({ blink: null });
}

export function setUI(patch: Partial<AppState["ui"]>) {
  setState({ ...state, ui: { ...state.ui, ...patch } });
}

export function setMouseWorld(pt: Pt) {
  // 高频更新，直接更新（状态栏依赖）
  setState({ ...state, ui: { ...state.ui, mouseWorld: pt } });
}

export function pushHistory() {
  past.push(structuredClone(state.diagram));
  if (past.length > MAX_HISTORY) past.shift();
  future = [];
}

export function canUndo() {
  return past.length > 0;
}
export function canRedo() {
  return future.length > 0;
}

function pruneSelection(diagram: Diagram, sel: Selection): Selection {
  return {
    nodes: sel.nodes.filter((id) => diagram.nodes.some((n) => n.id === id)),
    pipes: sel.pipes.filter((id) => diagram.pipes.some((p) => p.id === id))
  };
}

export function undo() {
  if (!past.length) return;
  future.push(structuredClone(state.diagram));
  const diagram = past.pop()!;
  setState({
    ...state,
    diagram,
    ui: { ...state.ui, dirty: true, selection: pruneSelection(diagram, state.ui.selection) }
  });
}

export function redo() {
  if (!future.length) return;
  past.push(structuredClone(state.diagram));
  const diagram = future.pop()!;
  setState({
    ...state,
    diagram,
    ui: { ...state.ui, dirty: true, selection: pruneSelection(diagram, state.ui.selection) }
  });
}

/** 修改 diagram。history=true 时先入栈快照（离散操作）；拖动等连续操作应在开始时手动 pushHistory 一次 */
export function updateDiagram(mutator: (draft: Diagram) => void, history = true) {
  if (history) pushHistory();
  const draft = structuredClone(state.diagram);
  mutator(draft);
  setState({
    ...state,
    diagram: draft,
    ui: { ...state.ui, dirty: true, selection: pruneSelection(draft, state.ui.selection) }
  });
}

export function loadDiagram(diagram: Diagram) {
  past = [];
  future = [];
  scenarioSnapshot = null;
  // 克隆入参，避免直接改动调用方持有的对象
  const d = structuredClone(diagram);
  // 确保旧文件有图层（默认层名按当前语言）
  if (!d.settings.layers || !d.settings.layers.length) {
    const en = (() => { try { return typeof document !== "undefined" && document.documentElement.lang === "en"; } catch { return false; } })();
    d.settings.layers = [{ id: "layer_default", name: en ? "Default" : "默认层", visible: true }];
  }
  setState({
    ...state,
    diagram: d,
    ui: { ...state.ui, dirty: false, selection: { nodes: [], pipes: [] }, scenario: null, blink: null, chainPath: null }
  });
  // 延迟一帧执行适应画布（等待 SVG 布局完成）
  setTimeout(() => {
    if (typeof document === "undefined") return;
    const svg = document.querySelector(".main-canvas");
    if (svg) {
      fitToScreen(svg.clientWidth || 1200, svg.clientHeight || 800);
    }
  }, 50);
}

/** 创建独立编辑副本。后续自动保存使用新 ID，因此不会写入原图的备份历史。 */
export function createWorkingCopy() {
  const original = state.diagram;
  const copy = structuredClone(original);
  copy.id = uid("diagram");
  copy.name = `${original.name || "未命名液路图"}（编辑副本）`;
  copy.settings.workingCopyOf = original.settings.workingCopyOf ?? original.id;
  copy.settings.workingCopyStartedAt = new Date().toISOString();
  past = [];
  future = [];
  setState({
    ...state,
    diagram: copy,
    ui: { ...state.ui, dirty: true, selection: { nodes: [], pipes: [] } }
  });
  return copy;
}

export function newDiagram() {
  loadDiagram(createEmptyDiagram());
}

export function markSaved() {
  setUI({ dirty: false });
  _recordSavedAt(state.diagram.id);
}

// ===== 演示/讲述模式 =====

/** 进入演示前的图纸快照（退出时还原，避免演示污染用户阀位） */
let scenarioSnapshot: Diagram | null = null;
let scenarioSnapshotDirty = false;

/** 直通/接头类元件：场景高亮时从种子节点自动向外补齐，保证链条中间段不被淡化 */
const SCENARIO_JUNCTION_TYPES = new Set<string>([
  "tee", "teeY", "teeF", "cross", "elbow", "checkValve", "coupling", "metalCoupling",
  "connector", "filter", "metalFilter", "flowMeter", "pressureGauge",
  "pressureSensor", "pressureSwitch", "heatExchanger",
]);

/** 把种子节点经直通/接头类元件连通的所有节点补进激活集（阀/泵/锅炉/出口等停在该处） */
function expandScenarioNodes(diagram: Diagram, seeds: Set<string>): Set<string> {
  const expanded = new Set(seeds);
  const nodeById = new Map(diagram.nodes.map((n) => [n.id, n]));
  const portToNode = new Map<string, string>();
  for (const n of diagram.nodes) for (const p of n.ports) portToNode.set(p.id, n.id);
  const adj = new Map<string, string[]>();
  for (const p of diagram.pipes) {
    const f = p.fromPortId ? portToNode.get(p.fromPortId) : undefined;
    const t = p.toPortId ? portToNode.get(p.toPortId) : undefined;
    if (f && t && f !== t) {
      if (!adj.has(f)) adj.set(f, []);
      if (!adj.has(t)) adj.set(t, []);
      adj.get(f)!.push(t);
      adj.get(t)!.push(f);
    }
  }
  const queue = [...seeds];
  while (queue.length) {
    const id = queue.shift()!;
    for (const nb of adj.get(id) ?? []) {
      if (expanded.has(nb)) continue;
      const node = nodeById.get(nb);
      if (!node) continue;
      if (!SCENARIO_JUNCTION_TYPES.has(node.type)) continue; // 非接头类不穿透
      expanded.add(nb);
      queue.push(nb);
    }
  }
  return expanded;
}

/**
 * 进入演示模式并跳到指定步骤：
 * 1. 首次进入：快照当前图纸，并把所有泵/阀复位到中性基线（泵停、两通关、三通 off），
 *    保证演示不被图纸存档阀位干扰；
 * 2. 按元件角色在当前图纸解析节点，累积应用场景步骤的泵/阀状态；
 * 3. 计算高亮节点（种子 + 中间接头自动补齐）与高亮管路（两端都在激活集内）。
 */
export function enterScenario(scenarioId: string, stepIndex = 0, opts?: { rebuild?: boolean }) {
  const scenario = getScenario(scenarioId, state.diagram);
  if (!scenario) return;
  const resolved = resolveScenarioRoles(state.diagram).nodes;
  const nodeIds = new Set(state.diagram.nodes.map((n) => n.id));
  const { activeNodes, valves } = collectScenarioState(scenario, stepIndex, resolved, nodeIds);
  const prev = state.ui.scenario;
  const isNewEntry = !prev;
  const rebuild = opts?.rebuild === true;
  // 微调叠加层：同场景跨步骤保留；切场景/首次进入清空
  const sameScenario = !!prev && prev.scenarioId === scenarioId;
  const overrides = sameScenario ? { ...(prev.overrides ?? {}) } : {};
  const highlightMode = prev?.highlightMode ?? "step";
  if (isNewEntry) {
    scenarioSnapshot = structuredClone(state.diagram);
    scenarioSnapshotDirty = state.ui.dirty;
  }
  updateDiagram((d) => {
    if (isNewEntry || rebuild) {
      // 基线复位：所有泵停、两通阀关、三通阀 off（场景步骤只激活自己需要的）
      for (const n of d.nodes) {
        if (n.type === "pump" || n.type === "milkPump" || n.type === "airPump") n.pumpOn = false;
        else if (n.type === "solenoid2") n.valveState = "closed";
        else if (n.type === "solenoid3") n.valvePath = "off";
      }
    }
    applyStates(d, valveActionsToPreset(valves));
    // 已保存的微调（settings.scenarioOverrides）：「从此步生效」——应用 step <= 当前的全部覆盖，按步升序
    const savedAll = d.settings.scenarioOverrides?.[scenarioId] ?? {};
    const savedSteps = Object.keys(savedAll).map(Number).filter((n) => Number.isFinite(n) && n <= stepIndex).sort((a, b) => a - b);
    for (const sv of savedSteps) {
      applyStates(d, savedAll[sv]);
    }
    // 会话叠加层（未保存的微调）最后应用（覆盖场景预设与已保存值）
    if (sameScenario && Object.keys(overrides).length > 0) applyStates(d, overrides as Parameters<typeof applyStates>[1]);
  }, false);
  // 闪烁定位本步新增的元件（换步骤时脉冲高亮新激活项，便于快速找到）
  if (isNewEntry) {
    blinkElements([...activeNodes]);
  } else {
    const prevSeeds = collectScenarioState(scenario, stepIndex - 1, resolved, nodeIds).activeNodes;
    const newIds = [...activeNodes].filter((id) => !prevSeeds.has(id));
    if (newIds.length) blinkElements(newIds);
  }
  // 高亮：种子节点 + 经接头类元件补齐
  const seedIds = new Set([...activeNodes].filter((id) => state.diagram.nodes.some((n) => n.id === id)));
  const expanded = expandScenarioNodes(state.diagram, seedIds);
  const portToNode = new Map<string, string>();
  state.diagram.nodes.forEach((n) => n.ports.forEach((p) => portToNode.set(p.id, n.id)));
  const activePipes = state.diagram.pipes
    .filter((p) => {
      const fn = p.fromPortId ? portToNode.get(p.fromPortId) : undefined;
      const tn = p.toPortId ? portToNode.get(p.toPortId) : undefined;
      return fn !== undefined && tn !== undefined && expanded.has(fn) && expanded.has(tn);
    })
    .map((p) => p.id);
  setUI({
    scenario: { scenarioId, stepIndex, activeNodes: [...expanded], activePipes, overrides, highlightMode },
  });
}

/** 跳到场景下一/指定步骤：从快照重建，保证每步状态确定（基线 + 0..i 步阀位 + 已保存微调 + 会话微调） */
export function setScenarioStep(stepIndex: number) {
  const sc = state.ui.scenario;
  if (!sc) return;
  if (scenarioSnapshot) {
    setState({
      ...state,
      diagram: restoreSnapshotDiagram(),
      ui: { ...state.ui, dirty: scenarioSnapshotDirty, selection: { nodes: [], pipes: [] } },
    });
  }
  enterScenario(sc.scenarioId, stepIndex, { rebuild: true });
}

/** 从快照恢复图纸：保留演示期间保存的 scenarioOverrides（否则会被旧快照吞掉） */
function restoreSnapshotDiagram(): Diagram {
  const cur = state.diagram.settings.scenarioOverrides;
  const d = structuredClone(scenarioSnapshot!);
  if (cur) d.settings.scenarioOverrides = cur;
  return d;
}

/** 退出演示模式：还原进入演示前的图纸快照（不污染用户阀位） */
export function exitScenario() {
  if (!state.ui.scenario) return;
  if (scenarioSnapshot) {
    setState({
      ...state,
      diagram: restoreSnapshotDiagram(),
      ui: { ...state.ui, scenario: null, dirty: scenarioSnapshotDirty, selection: { nodes: [], pipes: [] } },
    });
  } else {
    setUI({ scenario: null });
  }
  scenarioSnapshot = null;
  scenarioSnapshotDirty = false;
}

// ===== 工况快照（阀位组合保存/恢复，随图纸保存与分享） =====

export type WorkConditionState = PresetState;

/** 保存当前全部泵/阀状态为命名的工况 */
export function saveWorkCondition(name: string) {
  const d = state.diagram;
  const state2 = snapshotStates(d);
  updateDiagram((draft) => {
    const list = draft.settings.workConditions ?? [];
    const idx = list.findIndex((c) => c.name === name);
    if (idx >= 0) list[idx] = { name, state: state2 };
    else list.push({ name, state: state2 });
    draft.settings.workConditions = list;
  });
}

/** 应用工况：恢复该工况记录的泵/阀状态（进入撤销历史，可 Ctrl+Z） */
export function applyWorkCondition(name: string) {
  const cond = state.diagram.settings.workConditions?.find((c) => c.name === name);
  if (!cond) return;
  const prev = snapshotStates(state.diagram);
  updateDiagram((d) => {
    applyStates(d, cond.state);
  });
  // 差异对比：只高亮本次切换发生变化的元件，并给出变化摘要
  const changed = diffStateIds(prev, cond.state);
  if (changed.length === 0) {
    const lang = sysLang();
    toast(L(lang, `「${name}」与当前开关状态一致，没有变化`, `"${name}" matches the current switches — no change`));
    return;
  }
  blinkElements(changed);
  const byId = new Map(state.diagram.nodes.map((n) => [n.id, n.label || n.type]));
  const sample = changed.slice(0, 3).map((id) => byId.get(id)).filter(Boolean).join("、");
  const lang = sysLang();
  toast(L(lang, `已切换到「${name}」：${changed.length} 个开关变化（${sample}${changed.length > 3 ? "…" : ""}），橙色高亮即改动处`, `Switched to "${name}": ${changed.length} switch change(s) (${sample}${changed.length > 3 ? "…" : ""}); orange highlights mark the changes`));
}

/** 删除工况 */
export function deleteWorkCondition(name: string) {
  updateDiagram((d) => {
    d.settings.workConditions = (d.settings.workConditions ?? []).filter((c) => c.name !== name);
  });
}

export function listWorkConditions(): Array<{ name: string; state: Record<string, WorkConditionState> }> {
  return state.diagram.settings.workConditions ?? [];
}

/** 保存验收工况：记录当前泵阀状态与用户指定的应流/应停管路。 */
export function saveValidationCase(name: string, mustFlowPipeIds: string[], mustStopPipeIds: string[]) {
  const validationCase: ValidationCase = {
    id: uid("validation"),
    name,
    state: snapshotStates(state.diagram),
    mustFlowPipeIds: [...new Set(mustFlowPipeIds)],
    mustStopPipeIds: [...new Set(mustStopPipeIds)],
  };
  updateDiagram((d) => {
    const list = d.settings.validationCases ?? [];
    const idx = list.findIndex((c) => c.name === name);
    if (idx >= 0) validationCase.id = list[idx].id;
    if (idx >= 0) list[idx] = validationCase;
    else list.push(validationCase);
    d.settings.validationCases = list;
  });
}

export function deleteValidationCase(id: string) {
  updateDiagram((d) => {
    d.settings.validationCases = (d.settings.validationCases ?? []).filter((c) => c.id !== id);
  });
}

export function listValidationCases(): ValidationCase[] {
  return state.diagram.settings.validationCases ?? [];
}

/** 演示微调：记录手动改动到叠加层（跨步骤保留；返回是否处于演示中） */
export function overrideScenarioNode(nodeId: string, patch: { pumpOn?: boolean; valveState?: "open" | "closed"; valvePath?: "A" | "B" | "off" }): boolean {
  const sc = state.ui.scenario;
  if (!sc) return false;
  const overrides = { ...(sc.overrides ?? {}), [nodeId]: { ...(sc.overrides?.[nodeId] ?? {}), ...patch } };
  setUI({ scenario: { ...sc, overrides } });
  // 即时生效（不进撤销历史；退出演示时快照还原）
  updateDiagram((d) => {
    applyStates(d, { [nodeId]: patch });
  }, false);
  return true;
}

/** 重置演示微调：回到场景预设阀位 */
export function resetScenarioOverrides() {
  const sc = state.ui.scenario;
  if (!sc) return;
  // 清会话叠加层后重建：回到「场景预设 + 已保存微调」
  setUI({ scenario: { ...sc, overrides: {} } });
  setScenarioStep(sc.stepIndex);
}

/** 演示高亮模式：step=按步骤种子 / flow=跟随实际流动发光 */
export function setScenarioHighlightMode(mode: "step" | "flow") {
  const sc = state.ui.scenario;
  if (!sc) return;
  setUI({ scenario: { ...sc, highlightMode: mode } });
}

/** 把当前演示微调（叠加层）保存到指定步骤：随图纸持久化，「从此步生效」 */
export function saveScenarioOverridesToStep(stepIndex: number): number {
  const sc = state.ui.scenario;
  if (!sc) return 0;
  const overrides = sc.overrides ?? {};
  const count = Object.keys(overrides).length;
  if (count === 0) return 0;
  updateDiagram((d) => {
    const all = d.settings.scenarioOverrides ?? {};
    const perStep = { ...(all[sc.scenarioId]?.[stepIndex] ?? {}), ...overrides };
    all[sc.scenarioId] = { ...(all[sc.scenarioId] ?? {}), [stepIndex]: perStep };
    d.settings.scenarioOverrides = all;
  });
  // 已持久化，清空会话叠加层（避免重复应用）
  setUI({ scenario: { ...sc, overrides: {} } });
  return count;
}

/** 清除某步已保存的微调（随后重建演示） */
export function clearSavedScenarioStep(stepIndex: number) {
  const sc = state.ui.scenario;
  if (!sc) return;
  updateDiagram((d) => {
    const all = d.settings.scenarioOverrides;
    if (!all || !all[sc.scenarioId]) return;
    const next = { ...all[sc.scenarioId] };
    delete next[stepIndex];
    d.settings.scenarioOverrides = { ...all, [sc.scenarioId]: next };
  });
  // 重建：exit + re-enter（应用剩余已保存覆盖）
  exitScenario();
  enterScenario(sc.scenarioId, sc.stepIndex);
}

/** 从工况创建自定义演示场景：每个工况一步，按传入顺序编排 */
export function createCustomScenarioFromConditions(names: string[], lang: "zh" | "en" = "zh"): string | null {
  const conds = state.diagram.settings.workConditions ?? [];
  const steps = [];
  const allNodes = new Set<string>();
  for (const name of names) {
    const cond = conds.find((c) => c.name === name);
    if (!cond) continue;
    // 种子 = 该工况中「显式激活」的元件（泵开/阀开/三通 A·B）
    const seeds = Object.entries(cond.state)
      .filter(([, st]) => st.pumpOn === true || st.valveState === "open" || (st.valvePath && st.valvePath !== "off"))
      .map(([nodeId]) => nodeId);
    seeds.forEach((id) => allNodes.add(id));
    const valves: Record<string, import("./types").SceneValveAction> = {};
    for (const [nodeId, st] of Object.entries(cond.state)) {
      if (st.pumpOn !== undefined) valves[nodeId] = st.pumpOn ? "pump-run" : "pump-stop";
      else if (st.valveState !== undefined) valves[nodeId] = st.valveState;
      else if (st.valvePath !== undefined) valves[nodeId] = st.valvePath;
    }
    steps.push({
      title: name,
      desc: lang === "zh" ? `一键应用工况「${name}」的阀位组合（自定义演示步骤）` : `Apply condition "${name}" (custom demo step)`,
      addNodes: seeds,
      valves,
    });
  }
  if (steps.length === 0) return null;
  const scene: import("./types").SceneScenario = {
    id: uid("scn"),
    title: names.join(" → ").slice(0, 60) || (lang === "zh" ? "自定义演示" : "Custom demo"),
    icon: "⭐",
    allNodes: [...allNodes],
    steps,
    custom: true,
    createdAt: new Date().toISOString(),
  };
  updateDiagram((d) => {
    d.settings.customScenarios = [...(d.settings.customScenarios ?? []), scene];
  });
  return scene.id;
}

/** 删除自定义演示场景 */
export function deleteCustomScenarioById(id: string): boolean {
  let removed = false;
  updateDiagram((d) => {
    const list = d.settings.customScenarios ?? [];
    const next = list.filter((s) => s.id !== id);
    removed = next.length !== list.length;
    if (removed) d.settings.customScenarios = next;
  });
  return removed;
}

export function hasActiveScenario() {
  return !!state.ui.scenario;
}

/** 全局流速倍率（不改动各管路数据，只影响动画播放速度） */
export function setGlobalFlowScale(scale: number) {
  updateDiagram((d) => {
    d.settings.flowScale = Math.min(2.5, Math.max(0.5, scale));
  }, false);
}

/** 三态工作模式：编辑 edit / 演示 present / 验收 verify（面板联动在 App 层） */
export function setWorkMode(mode: "edit" | "present" | "verify") {
  setUI({ mode });
}

export interface SelectionClipboardPayload {
  kind: "fluidpath-selection";
  version: 1;
  nodes: DiagramNode[];
  pipes: Pipe[];
}

type DiagramClipboard = NonNullable<AppState["ui"]["clipboard"]>;

function isDiagramClipboard(value: unknown): value is DiagramClipboard {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { nodes?: unknown; pipes?: unknown };
  return Array.isArray(candidate.nodes) && Array.isArray(candidate.pipes);
}

export function parseSelectionClipboard(json: string | null | undefined): DiagramClipboard | null {
  if (!json) return null;
  try {
    const payload = JSON.parse(json) as Partial<SelectionClipboardPayload>;
    if (payload.kind !== "fluidpath-selection" || payload.version !== 1 || !isDiagramClipboard(payload)) return null;
    return structuredClone({ nodes: payload.nodes, pipes: payload.pipes });
  } catch {
    return null;
  }
}

export function serializeSelectionClipboard(clipboard: DiagramClipboard): string {
  const payload: SelectionClipboardPayload = { kind: "fluidpath-selection", version: 1, ...clipboard };
  return JSON.stringify(payload);
}

/** 复制选中内容到系统剪贴板。框选节点时会自动带上两端均在框内的内部管路。 */
export function copyToClipboard() {
  const sel = state.ui.selection;
  if (!sel.nodes.length && !sel.pipes.length) return;
  const nodes = state.diagram.nodes.filter((n) => sel.nodes.includes(n.id));
  const selectedPorts = new Set(nodes.flatMap((n) => n.ports.map((p) => p.id)));
  const pipes = state.diagram.pipes.filter((p) => sel.pipes.includes(p.id) || (
    Boolean(p.fromPortId) && Boolean(p.toPortId) && selectedPorts.has(p.fromPortId!) && selectedPorts.has(p.toPortId!)
  ));
  const clipboard = { nodes: structuredClone(nodes), pipes: structuredClone(pipes) };
  setUI({ clipboard });
  const bridge = (typeof window !== "undefined" ? (window as Window & { electron?: ElectronBridge }).electron : undefined);
  const serialized = serializeSelectionClipboard(clipboard);
  // 桌面版用应用专用剪贴板；网页版用 BroadcastChannel + 浏览器剪贴板。
  if (bridge?.writeSelectionClipboard) {
    void bridge.writeSelectionClipboard(serialized).catch(() => { /* 本窗口内复制仍可用 */ });
  } else {
    void writeWebSelectionClipboard(serialized);
  }
}

/** 从剪贴板载荷粘贴（偏移 48px 避免重叠） */
function pasteClipboard(clip: DiagramClipboard | null | undefined) {
  if (!clip || (!clip.nodes.length && !clip.pipes.length)) return;
  const portMap = new Map<string, string>();
  const newNodes = clip.nodes.map((n) => {
    const clone = structuredClone(n);
    clone.id = uid("n");
    clone.x += 48;
    clone.y += 48;
    clone.ports = clone.ports.map((p) => {
      const npid = uid("p");
      portMap.set(p.id, npid);
      return { ...p, id: npid, nodeId: clone.id };
    });
    return clone;
  });
  const newPipes = clip.pipes
    .filter((p) => {
      // 只复制两端都在粘贴范围内的管路
      if (p.fromPortId && !portMap.has(p.fromPortId)) return false;
      if (p.toPortId && !portMap.has(p.toPortId)) return false;
      if (!p.fromPortId && !p.toPortId) return false;
      return true;
    })
    .map((p) => {
      const clone = structuredClone(p);
      clone.id = uid("pipe");
      if (clone.fromPortId) clone.fromPortId = portMap.get(clone.fromPortId)!;
      if (clone.toPortId) clone.toPortId = portMap.get(clone.toPortId)!;
      clone.points = clone.points.map((pt) => ({ x: pt.x + 48, y: pt.y + 48 }));
      return clone;
    });
  updateDiagram((d) => {
    d.nodes.push(...newNodes);
    d.pipes.push(...newPipes);
  });
  setSelection({ nodes: newNodes.map((n) => n.id), pipes: newPipes.map((p) => p.id) });
}

/** 从系统剪贴板粘贴；网页或系统读取失败时回退到当前窗口复制内容。 */
export function pasteFromClipboard() {
  const localClipboard = state.ui.clipboard;
  const bridge = (typeof window !== "undefined" ? (window as Window & { electron?: ElectronBridge }).electron : undefined);
  if (!bridge?.readSelectionClipboard) {
    if (!navigator.clipboard?.readText) {
      pasteClipboard(localClipboard);
      return;
    }
    void readWebSelectionClipboard().then((serialized) => {
      const externalClipboard = parseSelectionClipboard(serialized);
      const clipboard = externalClipboard ?? localClipboard;
      if (externalClipboard) setUI({ clipboard: externalClipboard });
      pasteClipboard(clipboard);
    }).catch(() => pasteClipboard(localClipboard));
    return;
  }
  void bridge.readSelectionClipboard().then((json) => {
    const externalClipboard = parseSelectionClipboard(json);
    const clipboard = externalClipboard ?? localClipboard;
    if (externalClipboard) setUI({ clipboard: externalClipboard });
    pasteClipboard(clipboard);
  }).catch(() => pasteClipboard(localClipboard));
}

export function setSelection(sel: Selection) {
  setUI({ selection: sel });
}

export function clearSelection() {
  setUI({ selection: { nodes: [], pipes: [] } });
}

/** 展开成组：选中组内任一节点即选中整组 */
export function expandGroup(ids: string[]): string[] {
  const all = state.diagram.nodes;
  const gids = new Set(
    ids.map((id) => all.find((n) => n.id === id)?.groupId).filter((g): g is string => !!g)
  );
  if (!gids.size) return ids;
  const out = new Set(ids);
  all.forEach((n) => {
    if (n.groupId && gids.has(n.groupId)) out.add(n.id);
  });
  return [...out];
}

export function selectNode(id: string, additive = false) {
  const sel = state.ui.selection;
  const group = expandGroup([id]);
  if (additive) {
    const has = sel.nodes.includes(id);
    const nodes = has ? sel.nodes.filter((n) => !group.includes(n)) : [...new Set([...sel.nodes, ...group])];
    setSelection({ nodes, pipes: sel.pipes });
  } else {
    setSelection({ nodes: group, pipes: [] });
  }
}

/** 将选中节点成组（≥2 个） */
export function groupSelection() {
  const ids = state.ui.selection.nodes;
  if (ids.length < 2) return;
  const gid = uid("g");
  updateDiagram((d) => {
    d.nodes.forEach((n) => {
      if (ids.includes(n.id)) n.groupId = gid;
    });
  });
}

/** 解散选中节点所在的组 */
export function ungroupSelection() {
  const ids = state.ui.selection.nodes;
  if (!ids.length) return;
  const gids = new Set(
    ids.map((id) => state.diagram.nodes.find((n) => n.id === id)?.groupId).filter(Boolean)
  );
  if (!gids.size) return;
  updateDiagram((d) => {
    d.nodes.forEach((n) => {
      if (n.groupId && gids.has(n.groupId)) delete n.groupId;
    });
  });
}

/** 方向键微调：移动选中节点（连续按键合并为一次撤销步） */
let lastNudgeAt = 0;
export function nudgeSelection(dx: number, dy: number) {
  const ids = state.ui.selection.nodes;
  if (!ids.length) return;
  const now = Date.now();
  const newStep = now - lastNudgeAt > 700;
  lastNudgeAt = now;
  updateDiagram((d) => {
    d.nodes.forEach((n) => {
      if (ids.includes(n.id)) {
        n.x += dx;
        n.y += dy;
      }
    });
  }, newStep);
}

export function selectPipe(id: string, additive = false) {
  const sel = state.ui.selection;
  if (additive) {
    const pipes = sel.pipes.includes(id) ? sel.pipes.filter((n) => n !== id) : [...sel.pipes, id];
    setSelection({ nodes: sel.nodes, pipes });
  } else {
    setSelection({ nodes: [], pipes: [id] });
  }
}

export function addNodeAt(type: NodeType, x: number, y: number, variant?: ShapeVariant) {
  const node = createNode(type, x, y, undefined, variant);
  // 自动分配到当前活动图层
  const current = state.diagram.settings.currentLayerId;
  if (current) node.layerId = current;
  updateDiagram((d) => {
    d.nodes.push(node);
  });
  setSelection({ nodes: [node.id], pipes: [] });
  return node;
}

/** 设置当前活动图层（新建元件自动分配到此图层） */
export function setCurrentLayer(layerId: string | undefined) {
  updateDiagram((d) => {
    d.settings.currentLayerId = layerId;
  }, false);
}

/** 锅炉类节点：管路连接仅允许上/下端（进水在下、出水/出汽在上） */
export const BOILER_TYPES = new Set<NodeType>(["boiler", "hotWaterBoiler", "steamBoiler"]);

/** 将某一侧的端口按数量均匀分布 */
function redistributeSide(node: DiagramNode, position: PortPosition) {
  const side = node.ports.filter((p) => p.position === position);
  side.forEach((p, i) => {
    p.offset = (i + 1) / (side.length + 1);
  });
}

/** 端口增多时锅炉尺寸自适应增大 */
function autoGrowNode(node: DiagramNode) {
  if (!BOILER_TYPES.has(node.type)) return;
  const count = (pos: PortPosition) => node.ports.filter((p) => p.position === pos).length;
  const vMax = Math.max(count("left"), count("right"));
  const hMax = Math.max(count("top"), count("bottom"));
  const minH = Math.max(150, vMax * 42 + 66);
  const minW = Math.max(120, hMax * 46 + 54);
  if (node.height < minH) node.height = minH;
  if (node.width < minW) node.width = minW;
}

/** 追加端口（普通节点：进左/出右；锅炉：进下/出上，且仅允许上下端），同侧均匀分布 */
/** 端口上限：单个元件最多端口数（防无限添加导致画布/引擎负担） */
export const MAX_PORTS_PER_NODE = 8;

export function addPort(nodeId: string, direction: PortDirection, position?: PortPosition) {
  updateDiagram((d) => {
    const node = d.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    if (node.ports.length >= MAX_PORTS_PER_NODE) {
      const lang = sysLang();
      toast(L(lang, `端口已达上限 ${MAX_PORTS_PER_NODE} 个，无法继续添加`, `Port limit reached (${MAX_PORTS_PER_NODE}); cannot add more`));
      return;
    }
    const boiler = BOILER_TYPES.has(node.type);
    let pos: PortPosition =
      position ??
      (boiler
        ? direction === "in" ? "bottom" : "top"
        : direction === "in" ? "left" : direction === "out" ? "right" : "top");
    if (boiler && pos !== "top" && pos !== "bottom") pos = direction === "in" ? "bottom" : "top";
    node.ports.push({ id: uid("p"), nodeId, position: pos, direction });
    redistributeSide(node, pos);
    autoGrowNode(node);
  });
}

/** 删除端口（连带删除挂在该端口上的管路） */
export function removePort(nodeId: string, portId: string) {
  updateDiagram((d) => {
    const node = d.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    node.ports = node.ports.filter((p) => p.id !== portId);
    d.pipes = d.pipes.filter((p) => p.fromPortId !== portId && p.toPortId !== portId);
  });
}

/** 修改端口所在边/偏移/方向 */
export function patchPort(
  nodeId: string,
  portId: string,
  patch: { position?: PortPosition; offset?: number; direction?: PortDirection },
  history = true
) {
  updateDiagram((d) => {
    const node = d.nodes.find((n) => n.id === nodeId);
    const port = node?.ports.find((p) => p.id === portId);
    if (!node || !port) return;
    // 锅炉端口只允许上/下端
    if (BOILER_TYPES.has(node.type) && patch.position && patch.position !== "top" && patch.position !== "bottom") {
      const { position: _drop, ...rest } = patch;
      patch = rest;
    }
    const oldPos = port.position;
    Object.assign(port, patch);
    if (patch.position && patch.position !== oldPos && patch.offset === undefined) {
      redistributeSide(node, oldPos);
      redistributeSide(node, patch.position);
    }
  }, history);
}

export function patchNode(id: string, patch: Partial<DiagramNode>, history = true) {
  updateDiagram((d) => {
    const n = d.nodes.find((nn) => nn.id === id);
    if (n) Object.assign(n, patch);
  }, history);
}

export function patchPipe(id: string, patch: Partial<Pipe>, history = true) {
  updateDiagram((d) => {
    const p = d.pipes.find((pp) => pp.id === id);
    if (p) Object.assign(p, patch);
    // 介质改为「独立修改」：只改当前这条管路，不自动联动直通链
    // （需要整链同步时请显式调用 syncFluidThroughChain）
  }, history);
}

// ===== 介质动态传播 =====

/** 介质色值查找表 */
const FLUID_COLOR: Record<string, string> = Object.fromEntries(
  FLUID_PRESETS.map((f) => [f.key, f.color])
);

/** 直通节点：连接它的所有管路介质一致（进入 a 流出也 a） */
const PASS_THROUGH_TYPES = new Set([
  "shape", "connector", "coupling", "metalCoupling", "tee", "teeY", "teeF", "cross", "elbow",
  "valve", "checkValve", "filter", "pump", "flowMeter", "pressureGauge",
  "ntcProbe", "pressureSensor", "sensor", "safetyValve", "solenoid2", "solenoid3",
]);

function findNodeByPort(diagram: Diagram, portId: string): DiagramNode | null {
  for (const n of diagram.nodes) {
    if (n.ports.some((p) => p.id === portId)) return n;
  }
  return null;
}

function pipesTouchingNode(diagram: Diagram, nodeId: string): Pipe[] {
  const portIds = new Set(diagram.nodes.find((n) => n.id === nodeId)?.ports.map((p) => p.id) ?? []);
  return diagram.pipes.filter(
    (p) => (p.fromPortId && portIds.has(p.fromPortId)) || (p.toPortId && portIds.has(p.toPortId))
  );
}

/**
 * 介质沿直通链传播的 BFS 实现（在 draft 上原地修改）。
 * 经过直通节点（阀门/接头/过滤器/泵等）让相连管路共享同一介质。
 * 变换节点（锅炉/冲泡缸/排废/奶泵）作为边界不覆盖其固有介质。
 */
function propagateFluidOnDraft(diagram: Diagram, changedPipeId: string) {
  const queue: string[] = [changedPipeId];
  const visited = new Set<string>();
  while (queue.length) {
    const pid = queue.shift()!;
    if (visited.has(pid)) continue;
    visited.add(pid);
    const pipe = diagram.pipes.find((p) => p.id === pid);
    if (!pipe || !pipe.fluidType) continue;
    const medium = pipe.fluidType;
    const color = FLUID_COLOR[medium];
    for (const end of [pipe.fromPortId, pipe.toPortId]) {
      if (!end) continue;
      const node = findNodeByPort(diagram, end);
      if (!node || !PASS_THROUGH_TYPES.has(node.type)) continue;
      for (const cp of pipesTouchingNode(diagram, node.id)) {
        if (cp.id === pid || visited.has(cp.id)) continue;
        cp.fluidType = medium;
        if (color) cp.fluidColor = color;
        queue.push(cp.id);
      }
    }
  }
}

/** 手动：把某条管路的介质同步到相连直通链（显式触发，不随单条修改自动传播） */
export function syncFluidThroughChain(pipeId: string) {
  updateDiagram((d) => {
    propagateFluidOnDraft(d, pipeId);
  });
}

// ===== 管路样式复制 / 粘贴 =====
let pipeStyleClipboard: Partial<Pipe> | null = null;

/** 复制管路样式（不含连接关系、标签与走线点） */
export function copyPipeStyle(id: string) {
  const p = state.diagram.pipes.find((pp) => pp.id === id);
  if (!p) return;
  const { id: _id, label: _label, fromPortId: _f, toPortId: _t, fromPoint: _fp, toPoint: _tp, points: _pts, ...style } = p;
  pipeStyleClipboard = structuredClone(style);
}

/** 将复制的管路样式应用到目标管路 */
export function pastePipeStyle(id: string) {
  if (!pipeStyleClipboard) return;
  patchPipe(id, pipeStyleClipboard);
}

export function hasPipeStyle() {
  return pipeStyleClipboard !== null;
}

// ===== 节点样式复制 / 粘贴（样式刷） =====
let nodeStyleClipboard: Partial<DiagramNode> | null = null;

/** 复制节点样式（不含位置、标签、端口） */
export function copyNodeStyle(id: string) {
  const n = state.diagram.nodes.find((nn) => nn.id === id);
  if (!n) return;
  const { id: _id, label: _label, x: _x, y: _y, ports: _ports, ...style } = n;
  nodeStyleClipboard = structuredClone(style);
}

/** 将复制的节点样式应用到目标节点 */
export function pasteNodeStyle(id: string) {
  if (!nodeStyleClipboard) return;
  patchNode(id, nodeStyleClipboard);
}

export function hasNodeStyle() {
  return nodeStyleClipboard !== null;
}

/** 切换样式刷模式 */
export function setStyleBrush(on: boolean) {
  setUI({ styleBrush: on });
}

/** 批量修改多条管路属性（history 默认 true 合并为一步撤销） */
export function patchPipes(ids: string[], patch: Partial<Pipe>, history = true) {
  updateDiagram((d) => {
    d.pipes.forEach((p) => {
      if (ids.includes(p.id)) Object.assign(p, patch);
    });
  }, history);
}

// ===== 批量替换标签 =====
export type LabelReplaceMode = "prefix" | "suffix" | "replace" | "clear";

/**
 * 批量替换选中节点/管路标签。
 * - prefix/suffix：在现有标签前/后追加文本
 * - replace：把 from 文本替换为 to（从标签中）
 * - clear：清空标签
 */
export function batchReplaceLabels(
  mode: LabelReplaceMode,
  text: string,
  from: string,
  nodeIds: string[],
  pipeIds: string[]
) {
  updateDiagram((d) => {
    for (const n of d.nodes) {
      if (!nodeIds.includes(n.id)) continue;
      if (mode === "prefix") n.label = text + n.label;
      else if (mode === "suffix") n.label = n.label + text;
      else if (mode === "replace") n.label = n.label.split(from).join(text);
      else if (mode === "clear") n.label = "";
    }
    for (const p of d.pipes) {
      if (!pipeIds.includes(p.id)) continue;
      if (mode === "prefix") p.label = text + p.label;
      else if (mode === "suffix") p.label = p.label + text;
      else if (mode === "replace") p.label = p.label.split(from).join(text);
      else if (mode === "clear") p.label = "";
    }
  });
}

// ===== 批量重路由：清除手动折点，让自动走线重算 =====
export function batchReroutePipes(ids: string[]) {
  if (!ids.length) return;
  updateDiagram((d) => {
    d.pipes.forEach((p) => {
      if (ids.includes(p.id)) p.points = [];
    });
  });
}

// ===== 等距排列选中管路 =====
/**
 * 对选中管路中「平行同向」的一组做等距排列：
 * 找出各管路的中段（端口引线之间的主线段），若主线段方向一致（同为水平/垂直），
 * 在垂直于主线的方向上等距重排它们的中间折点。
 * 无法归组的管路保持不变。
 */
export function distributePipes(ids: string[]) {
  if (ids.length < 2) return;
  const sel = ids;

  // 计算每条管路的主线段坐标（水平主线段取 y，垂直主线段取 x）
  function pipeY(pts: Pt[]): number | null {
    for (let i = 1; i < pts.length; i++) {
      if (Math.abs(pts[i].y - pts[i - 1].y) < 0.5 && Math.abs(pts[i].x - pts[i - 1].x) > 40) return pts[i].y;
    }
    return null;
  }
  function pipeX(pts: Pt[]): number | null {
    for (let i = 1; i < pts.length; i++) {
      if (Math.abs(pts[i].x - pts[i - 1].x) < 0.5 && Math.abs(pts[i].y - pts[i - 1].y) > 40) return pts[i].x;
    }
    return null;
  }

  // 计算每条管路归属：horizontal（水平主线段 y）或 vertical（垂直主线段 x）
  const items = sel
    .map((id) => {
      const pipe = state.diagram.pipes.find((p) => p.id === id);
      if (!pipe) return null;
      const pts = pipePolyline(pipe, state.diagram.nodes);
      if (!pts || pts.length < 2) return null;
      return { pipe, pts, h: pipeY(pts), v: pipeX(pts) };
    })
    .filter((x): x is { pipe: Pipe; pts: Pt[]; h: number | null; v: number | null } => !!x);

  const TOL = 20; // 垂直坐标带容差
  // 归组：水平组按 y 相近，垂直组按 x 相近
  const horizGroups: Array<typeof items> = [];
  const vertGroups: Array<typeof items> = [];

  for (const item of items) {
    if (item.h !== null && (item.v === null || Math.abs(item.h - (pipeY(item.pts) ?? 0)) < 0.01)) {
      const g = horizGroups.find((grp) => grp[0].h !== null && Math.abs(grp[0].h! - item.h!) < TOL);
      if (g) g.push(item);
      else horizGroups.push([item]);
    } else if (item.v !== null) {
      const g = vertGroups.find((grp) => grp[0].v !== null && Math.abs(grp[0].v! - item.v!) < TOL);
      if (g) g.push(item);
      else vertGroups.push([item]);
    }
  }

  // 对每个 ≥2 的组做等距排列
  updateDiagram((d) => {
    for (const grp of [...horizGroups, ...vertGroups]) {
      if (grp.length < 2) continue;
      const isHoriz = horizGroups.includes(grp);
      const sorted = [...grp].sort((a, b) => (isHoriz ? (a.h ?? 0) - (b.h ?? 0) : (a.v ?? 0) - (b.v ?? 0)));
      const firstVal = isHoriz ? sorted[0].h! : sorted[0].v!;
      const lastVal = isHoriz ? sorted[sorted.length - 1].h! : sorted[sorted.length - 1].v!;
      const span = lastVal - firstVal;
      const step = span / (sorted.length - 1);

      sorted.forEach((it, idx) => {
        const target = firstVal + idx * step;
        const curVal = isHoriz ? it.h! : it.v!;
        const delta = target - curVal;
        if (Math.abs(delta) < 0.5) return;
        const pipe = d.pipes.find((p) => p.id === it.pipe.id);
        if (!pipe) return;
        // 整体平移主线段所在的中间折点
        const newPts = it.pts.map((p) => (isHoriz ? { ...p, y: p.y + delta } : { ...p, x: p.x + delta }));
        pipe.points = newPts.slice(1, -1);
      });
    }
  });
}

export function deleteSelection() {
  const sel = state.ui.selection;
  if (!sel.nodes.length && !sel.pipes.length) return;
  updateDiagram((d) => {
    const nodeIds = new Set(sel.nodes);
    const portIds = new Set<string>();
    d.nodes.filter((n) => nodeIds.has(n.id)).forEach((n) => n.ports.forEach((p) => portIds.add(p.id)));
    d.nodes = d.nodes.filter((n) => !nodeIds.has(n.id));
    d.pipes = d.pipes.filter(
      (p) =>
        !sel.pipes.includes(p.id) &&
        !(p.fromPortId && portIds.has(p.fromPortId)) &&
        !(p.toPortId && portIds.has(p.toPortId))
    );
  });
  clearSelection();
}

/** 删除单个节点（连带删除挂在其端口上的管路）——供智能建议等使用 */
function deleteNodeById(nodeId: string, history = true) {
  updateDiagram((d) => {
    const node = d.nodes.find((n) => n.id === nodeId);
    const portIds = new Set(node?.ports.map((p) => p.id) ?? []);
    d.nodes = d.nodes.filter((n) => n.id !== nodeId);
    d.pipes = d.pipes.filter(
      (p) => !(p.fromPortId && portIds.has(p.fromPortId)) && !(p.toPortId && portIds.has(p.toPortId))
    );
  }, history);
}

/** 执行智能建议的修复动作（不写撤销历史，由诊断面板的快照负责撤回） */
export function applyFix(fix: FixAction) {
  switch (fix.type) {
    case "setFluid": {
      const color = FLUID_PRESETS.find((f) => f.key === fix.fluidType)?.color ?? "#2f7fd6";
      patchPipe(fix.pipeId, { fluidType: fix.fluidType, fluidColor: color }, false);
      break;
    }
    case "deleteNode":
      deleteNodeById(fix.nodeId, false);
      break;
    case "detachPipe":
      patchPipe(fix.pipeId, fix.end === "from" ? { fromPortId: undefined } : { toPortId: undefined }, false);
      break;
    case "deletePipe":
      updateDiagram((d) => {
        d.pipes = d.pipes.filter((p) => p.id !== fix.pipeId);
      }, false);
      break;
    case "reversePipe": {
      const pipe = state.diagram.pipes.find((p) => p.id === fix.pipeId);
      if (pipe) {
        patchPipe(fix.pipeId, {
          fromPortId: pipe.toPortId,
          toPortId: pipe.fromPortId,
          fromPoint: pipe.toPoint,
          toPoint: pipe.fromPoint,
          direction: pipe.direction === "forward" ? "reverse" : "forward",
        }, false);
      }
      break;
    }
    case "startPump":
      patchNode(fix.nodeId, { pumpOn: true }, false);
      break;
    case "openValve":
      patchNode(fix.nodeId, { valveState: "open" }, false);
      break;
  }
}

/** 直接恢复整张图（供诊断面板撤回时精确还原，不污染撤销历史） */
export function restoreDiagram(diagram: Diagram) {
  setState({
    ...state,
    diagram: structuredClone(diagram),
    ui: { ...state.ui, selection: { nodes: [], pipes: [] } }
  });
}

/** 置灰 / 取消置灰当前选中元素：节点淡化、相连管路停止流动（讲解聚焦） */
export function setSelectionDisabled(disabled: boolean) {
  const sel = state.ui.selection;
  if (!sel.nodes.length && !sel.pipes.length) return;
  updateDiagram((d) => {
    d.nodes.forEach((n) => {
      if (sel.nodes.includes(n.id)) n.disabled = disabled;
    });
    d.pipes.forEach((p) => {
      if (sel.pipes.includes(p.id)) p.disabled = disabled;
    });
  });
}

/** 设置/清除教学显示覆盖（不改变工程有效状态）。 */
export function setPipesForceFlow(ids: string[], on: boolean) {
  if (!ids.length) return;
  updateDiagram((d) => {
    d.pipes.forEach((p) => {
      if (ids.includes(p.id)) {
        if (on) p.teachingOverride = "flow";
        else if (p.teachingOverride === "flow") delete p.teachingOverride;
      }
    });
  });
}

export function setPipesForceStop(ids: string[], on: boolean) {
  if (!ids.length) return;
  updateDiagram((d) => {
    d.pipes.forEach((p) => {
      if (ids.includes(p.id)) {
        if (on) p.teachingOverride = "stop";
        else if (p.teachingOverride === "stop") delete p.teachingOverride;
      }
    });
  });
}

export function duplicateSelection() {
  const sel = state.ui.selection;
  if (!sel.nodes.length) return;
  const newNodeIds: string[] = [];
  const groupRemap = new Map<string, string>();
  updateDiagram((d) => {
    const portMap = new Map<string, string>();
    const selectedNodes = d.nodes.filter((n) => sel.nodes.includes(n.id));
    const clones: DiagramNode[] = selectedNodes.map((n) => {
      const clone = structuredClone(n);
      clone.id = uid("n");
      clone.x += 32;
      clone.y += 32;
      if (clone.groupId) {
        if (!groupRemap.has(clone.groupId)) groupRemap.set(clone.groupId, uid("g"));
        clone.groupId = groupRemap.get(clone.groupId)!;
      }
      clone.ports = clone.ports.map((p) => {
        const npid = uid("p");
        portMap.set(p.id, npid);
        return { ...p, id: npid, nodeId: clone.id };
      });
      return clone;
    });
    d.nodes.push(...clones);
    // 复制两端都在选中集合内的管路
    const internal = d.pipes.filter((p) => p.fromPortId && portMap.has(p.fromPortId) && p.toPortId && portMap.has(p.toPortId));
    for (const p of internal) {
      const clone = structuredClone(p);
      clone.id = uid("pipe");
      clone.fromPortId = portMap.get(p.fromPortId!)!;
      clone.toPortId = portMap.get(p.toPortId!)!;
      clone.points = clone.points.map((pt) => ({ x: pt.x + 32, y: pt.y + 32 }));
      d.pipes.push(clone);
    }
    newNodeIds.push(...clones.map((c) => c.id));
  });
  setSelection({ nodes: newNodeIds, pipes: [] });
}

export function createPipe(fromPortId: string, toPortId: string) {
  // 校验：不允许一个端口连接多条管路（必须通过三通接头分路）
  for (const existing of state.diagram.pipes) {
    if (existing.fromPortId === fromPortId || existing.toPortId === fromPortId) {
      toast(L(sysLang(), "此端口已被占用，请使用三通接头（T型/Y型）进行分路。", "This port is already used — split with a tee (T/Y) fitting."), "error");
      return;
    }
    if (existing.fromPortId === toPortId || existing.toPortId === toPortId) {
      toast(L(sysLang(), "此端口已被占用，请使用三通接头（T型/Y型）进行分路。", "This port is already used — split with a tee (T/Y) fitting."), "error");
      return;
    }
  }
  const pipe: Pipe = {
    id: uid("pipe"),
    label: `管路 ${state.diagram.pipes.length + 1}`,
    fromPortId,
    toPortId,
    points: [],
    nominalDiameter: "DN25",
    visualDiameter: 10,
    wallColor: "#5b6b7d",
    fluidColor: "#2f7fd6",
    fluidOpacity: 0.92,
    direction: "forward",
    flowSpeed: 1.2,
    particleDensity: "medium",
    animated: true,
    showArrow: true,
    fluidType: "coldWater",
    material: "custom",
    wallOpacity: 1,
    routing: "orthogonal",
    cornerRadius: 0
  };
  updateDiagram((d) => {
    d.pipes.push(pipe);
  });
  setSelection({ nodes: [], pipes: [pipe.id] });
  return pipe;
}

export function zoomAt(clientX: number, clientY: number, factor: number, svgRect: DOMRect) {
  const { zoom, panX, panY } = state.ui;
  const next = Math.min(4, Math.max(0.2, zoom * factor));
  const sx = clientX - svgRect.left;
  const sy = clientY - svgRect.top;
  const wx = (sx - panX) / zoom;
  const wy = (sy - panY) / zoom;
  setUI({ zoom: next, panX: sx - wx * next, panY: sy - wy * next });
}

export function setZoomCenter(nextZoom: number, viewW: number, viewH: number) {
  const { zoom, panX, panY } = state.ui;
  const next = Math.min(4, Math.max(0.2, nextZoom));
  const cx = viewW / 2;
  const cy = viewH / 2;
  const wx = (cx - panX) / zoom;
  const wy = (cy - panY) / zoom;
  setUI({ zoom: next, panX: cx - wx * next, panY: cy - wy * next });
}

/** 将画布视图居中定位到指定节点（保持当前缩放） */
export function focusNode(id: string) {
  const n = state.diagram.nodes.find((nn) => nn.id === id);
  if (!n) return;
  const svg = document.querySelector(".main-canvas") as SVGSVGElement | null;
  const w = svg?.clientWidth ?? 1200;
  const h = svg?.clientHeight ?? 800;
  const { zoom } = state.ui;
  const cx = n.x + n.width / 2;
  const cy = n.y + n.height / 2;
  setUI({
    panX: w / 2 - cx * zoom,
    panY: h / 2 - cy * zoom,
    selection: { nodes: [id], pipes: [] }
  });
}

/** 聚焦某个节点或管路：选中并居中（供智能诊断定位使用） */
export function focusElement(id: string) {
  const node = state.diagram.nodes.find((n) => n.id === id);
  if (node) {
    focusNode(id);
    return;
  }
  const pipe = state.diagram.pipes.find((p) => p.id === id);
  if (pipe) {
    const pts = pipePolyline(pipe, state.diagram.nodes);
    if (pts) {
      const bb = polylineBBox(pts);
      const svg = document.querySelector(".main-canvas") as SVGSVGElement | null;
      const w = svg?.clientWidth ?? 1200;
      const h = svg?.clientHeight ?? 800;
      const { zoom } = state.ui;
      setUI({
        panX: w / 2 - (bb.x + bb.w / 2) * zoom,
        panY: h / 2 - (bb.y + bb.h / 2) * zoom,
        selection: { nodes: [], pipes: [id] }
      });
    }
  }
}

/** 将画布缩放到适应全部内容（包含 40px 边距） */
export function fitToScreen(viewW: number, viewH: number) {
  const { diagram } = state;
  if (!diagram.nodes.length && !diagram.pipes.length) return;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of diagram.nodes) {
    const bb = nodeBBox(n);
    minX = Math.min(minX, bb.x);
    minY = Math.min(minY, bb.y);
    maxX = Math.max(maxX, bb.x + bb.w);
    maxY = Math.max(maxY, bb.y + bb.h);
  }
  for (const p of diagram.pipes) {
    const pts = pipePolyline(p, diagram.nodes);
    if (pts) {
      const bb = polylineBBox(pts);
      minX = Math.min(minX, bb.x);
      minY = Math.min(minY, bb.y);
      maxX = Math.max(maxX, bb.x + bb.w);
      maxY = Math.max(maxY, bb.y + bb.h);
    }
  }
  const pad = 40;
  const contentW = maxX - minX + pad * 2;
  const contentH = maxY - minY + pad * 2;
  if (contentW < 1 || contentH < 1) return;
  const zoom = Math.min(viewW / contentW, viewH / contentH, 2);
  const panX = (viewW - contentW * zoom) / 2 - (minX - pad) * zoom;
  const panY = (viewH - contentH * zoom) / 2 - (minY - pad) * zoom;
  setUI({ zoom, panX, panY });
}

// ===== 多选对齐 + 等距分布 =====
export function alignSelection(dir: "left" | "right" | "top" | "bottom" | "centerH" | "centerV") {
  const sel = state.ui.selection;
  const ids = sel.nodes;
  if (ids.length < 2) return;
  pushHistory();
  const selected = state.diagram.nodes.filter((n) => ids.includes(n.id));
  if (dir === "left") {
    const ref = Math.min(...selected.map((n) => n.x));
    updateDiagram((d) => d.nodes.forEach((n) => { if (ids.includes(n.id)) n.x = ref; }), false);
  } else if (dir === "right") {
    const ref = Math.max(...selected.map((n) => n.x + n.width));
    updateDiagram((d) => d.nodes.forEach((n) => { if (ids.includes(n.id)) n.x = ref - n.width; }), false);
  } else if (dir === "top") {
    const ref = Math.min(...selected.map((n) => n.y));
    updateDiagram((d) => d.nodes.forEach((n) => { if (ids.includes(n.id)) n.y = ref; }), false);
  } else if (dir === "bottom") {
    const ref = Math.max(...selected.map((n) => n.y + n.height));
    updateDiagram((d) => d.nodes.forEach((n) => { if (ids.includes(n.id)) n.y = ref - n.height; }), false);
  } else if (dir === "centerH") {
    const ref = selected.reduce((s, n) => s + n.x + n.width / 2, 0) / selected.length;
    updateDiagram((d) => d.nodes.forEach((n) => { if (ids.includes(n.id)) { n.x = ref - n.width / 2; } }), false);
  } else if (dir === "centerV") {
    const ref = selected.reduce((s, n) => s + n.y + n.height / 2, 0) / selected.length;
    updateDiagram((d) => d.nodes.forEach((n) => { if (ids.includes(n.id)) { n.y = ref - n.height / 2; } }), false);
  }
}

export function distributeSelection(dir: "horizontal" | "vertical") {
  const sel = state.ui.selection;
  const ids = sel.nodes;
  if (ids.length < 3) return;
  pushHistory();
  const selected = state.diagram.nodes.filter((n) => ids.includes(n.id)).sort((a, b) => dir === "horizontal" ? a.x - b.x : a.y - b.y);
  if (dir === "horizontal") {
    const first = selected[0];
    const last = selected[selected.length - 1];
    const totalSpace = last.x + last.width - first.x;
    const totalNodeW = selected.reduce((s, n) => s + n.width, 0);
    const gap = (totalSpace - totalNodeW) / (selected.length - 1);
    let curX = first.x;
    for (const n of selected) {
      const idx = ids.indexOf(n.id);
      if (idx < 0) continue;
      updateDiagram((d) => { const nn = d.nodes.find((x) => x.id === n.id); if (nn) nn.x = curX; }, false);
      curX += n.width + gap;
    }
  } else {
    const first = selected[0];
    const last = selected[selected.length - 1];
    const totalSpace = last.y + last.height - first.y;
    const totalNodeH = selected.reduce((s, n) => s + n.height, 0);
    const gap = (totalSpace - totalNodeH) / (selected.length - 1);
    let curY = first.y;
    for (const n of selected) {
      updateDiagram((d) => { const nn = d.nodes.find((x) => x.id === n.id); if (nn) nn.y = curY; }, false);
      curY += n.height + gap;
    }
  }
}

// ===== 镜像翻转 =====
const OPPOSITE_SIDE: Record<string, string> = { left: "right", right: "left", top: "bottom", bottom: "top" };

/** 翻转端口所在边（left↔right / top↔bottom），并重置偏移 */
function mirrorPorts(node: DiagramNode, horizontal: boolean) {
  for (const p of node.ports) {
    if (horizontal) {
      if (p.position === "left" || p.position === "right") {
        p.position = OPPOSITE_SIDE[p.position] as typeof p.position;
      }
    } else {
      if (p.position === "top" || p.position === "bottom") {
        p.position = OPPOSITE_SIDE[p.position] as typeof p.position;
      }
    }
  }
}

/**
 * 镜像翻转选中节点（沿包围盒中心轴）。
 * 节点位置镜像 + 端口边翻转 + 旋转角取反；相连管路两端互换方向。
 */
export function mirrorSelection(horizontal: boolean) {
  const ids = state.ui.selection.nodes;
  if (!ids.length) return;
  updateDiagram((d) => {
    const selected = d.nodes.filter((n) => ids.includes(n.id));
    if (!selected.length) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of selected) {
      minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.width); maxY = Math.max(maxY, n.y + n.height);
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    for (const n of selected) {
      if (horizontal) {
        n.x = 2 * cx - (n.x + n.width);
      } else {
        n.y = 2 * cy - (n.y + n.height);
      }
      n.rotation = n.rotation ? (360 - n.rotation) % 360 : 0;
      mirrorPorts(n, horizontal);
    }
    // 管路：两端端口若都在选中节点上且翻转后在同一侧，需要交换 from/to
    const selPortIds = new Set(selected.flatMap((n) => n.ports.map((p) => p.id)));
    for (const p of d.pipes) {
      if (!p.fromPortId || !p.toPortId) continue;
      const fromIn = selPortIds.has(p.fromPortId);
      const toIn = selPortIds.has(p.toPortId);
      if (fromIn && toIn) {
        const fromNode = d.nodes.find((n) => n.ports.some((pt) => pt.id === p.fromPortId));
        const toNode = d.nodes.find((n) => n.ports.some((pt) => pt.id === p.toPortId));
        // 同节点内部翻转（如 tee）交换端口方向
        if (fromNode === toNode) {
          [p.fromPortId, p.toPortId] = [p.toPortId, p.fromPortId];
        }
      }
    }
  });
}

// ===== 自动排版布局 =====
const LAYOUT_GAP = 40;

/**
 * 自动排版选中节点：
 * - "leftright"：从左到右排成一行
 * - "topdown"：从上到下排成一列
 * - "grid"：按网格排列（每行约 4 个）
 * - "tree"：按连接关系分层（简单 BFS 分层，同层竖排）
 */
export function autoLayout(mode: "leftright" | "topdown" | "grid" | "tree") {
  const ids = state.ui.selection.nodes;
  if (ids.length < 2) return;
  updateDiagram((d) => {
    const selected = d.nodes.filter((n) => ids.includes(n.id));
    if (selected.length < 2) return;

    if (mode === "leftright") {
      // 按当前 y 中心排序，保持上下顺序
      const sorted = [...selected].sort((a, b) => (a.y + a.height / 2) - (b.y + b.height / 2));
      const maxH = Math.max(...sorted.map((n) => n.height));
      let x = Math.min(...sorted.map((n) => n.x));
      const yRef = sorted[0].y;
      for (const n of sorted) {
        n.x = x;
        n.y = yRef + (maxH - n.height) / 2;
        x += n.width + LAYOUT_GAP;
      }
    } else if (mode === "topdown") {
      const sorted = [...selected].sort((a, b) => (a.x + a.width / 2) - (b.x + b.width / 2));
      const maxW = Math.max(...sorted.map((n) => n.width));
      let y = Math.min(...sorted.map((n) => n.y));
      const xRef = sorted[0].x;
      for (const n of sorted) {
        n.y = y;
        n.x = xRef + (maxW - n.width) / 2;
        y += n.height + LAYOUT_GAP;
      }
    } else if (mode === "grid") {
      const cols = Math.ceil(Math.sqrt(selected.length));
      const sorted = [...selected].sort((a, b) => (a.y + a.height / 2) - (b.y + b.height / 2) || (a.x + a.width / 2) - (b.x + b.width / 2));
      const minX = Math.min(...sorted.map((n) => n.x));
      const minY = Math.min(...sorted.map((n) => n.y));
      let i = 0;
      for (const n of sorted) {
        const row = Math.floor(i / cols);
        const col = i % cols;
        // 简单网格：固定单元格宽 200 高 180
        n.x = minX + col * 200;
        n.y = minY + row * 180;
        i++;
      }
    } else if (mode === "tree") {
      // BFS 分层：从最上游（入度=0 的节点）开始
      const selIds = new Set(selected.map((n) => n.id));
      const portToNode = new Map<string, DiagramNode>();
      for (const n of d.nodes) for (const p of n.ports) portToNode.set(p.id, n);
      // 计算选中范围内节点的"上游依赖"
      const upstreamCount = new Map<string, number>();
      for (const n of selected) {
        let up = 0;
        for (const p of n.ports) {
          if (p.direction !== "in" && p.direction !== "bidirectional") continue;
          for (const pipe of d.pipes) {
            if (pipe.toPortId === p.id) {
              const fromN = pipe.fromPortId ? portToNode.get(pipe.fromPortId) : undefined;
              if (fromN && selIds.has(fromN.id)) { up++; break; }
            }
          }
        }
        upstreamCount.set(n.id, up);
      }
      // 分层：上游为 0 的层 0，其余按入度分层
      const layer = new Map<string, number>();
      const queue: DiagramNode[] = [];
      for (const n of selected) {
        if ((upstreamCount.get(n.id) ?? 0) === 0) { layer.set(n.id, 0); queue.push(n); }
      }
      let qi = 0;
      const portToNodeForOut = new Map<string, DiagramNode>();
      for (const n of d.nodes) for (const p of n.ports) portToNodeForOut.set(p.id, n);
      while (qi < queue.length) {
        const node = queue[qi++];
        const L = layer.get(node.id) ?? 0;
        for (const p of node.ports) {
          for (const pipe of d.pipes) {
            if (pipe.fromPortId !== p.id) continue;
            const toN = pipe.toPortId ? portToNodeForOut.get(pipe.toPortId) : undefined;
            if (toN && selIds.has(toN.id) && !layer.has(toN.id)) {
              layer.set(toN.id, L + 1);
              queue.push(toN);
            }
          }
        }
      }
      // 未分层的归为最深层
      for (const n of selected) if (!layer.has(n.id)) layer.set(n.id, 0);
      const maxLayer = Math.max(...[...layer.values()]);
      const minX = Math.min(...selected.map((n) => n.x));
      const minY = Math.min(...selected.map((n) => n.y));
      // 计算每层最大宽
      const layerW = new Map<number, number>();
      for (const n of selected) {
        const L = layer.get(n.id)!;
        layerW.set(L, Math.max(layerW.get(L) ?? 0, n.width));
      }
      let x = minX;
      for (let L = 0; L <= maxLayer; L++) {
        const layerNodes = selected.filter((n) => layer.get(n.id) === L);
        let y = minY;
        for (const n of layerNodes) {
          n.x = x;
          n.y = y;
          y += n.height + LAYOUT_GAP;
        }
        x += (layerW.get(L) ?? 100) + LAYOUT_GAP;
      }
    }
  });
}

// ===== 图层管理 =====
export function addLayer(name: string) {
  const layers = state.diagram.settings.layers ?? [];
  const id = uid("layer");
  updateDiagram((d) => {
    d.settings.layers = [...layers, { id, name, visible: true }];
  });
  return id;
}

export function removeLayer(layerId: string) {
  updateDiagram((d) => {
    const layers = d.settings.layers ?? [];
    if (layers.length <= 1) return;
    const target = layers.find((l) => l.id !== layerId);
    d.settings.layers = layers.filter((l) => l.id !== layerId);
    // 被删图层的元件归入第一个剩余图层（而不是变成"无图层"永远可见）
    d.nodes.forEach((n) => { if (n.layerId === layerId) n.layerId = target?.id; });
    // 删除的是当前图层 → 复位到第一个剩余图层
    if (d.settings.currentLayerId === layerId) d.settings.currentLayerId = target?.id;
  });
}

export function toggleLayerVisibility(layerId: string) {
  updateDiagram((d) => {
    const layer = d.settings.layers?.find((l) => l.id === layerId);
    if (layer) layer.visible = !layer.visible;
  }, false);
}

export function renameLayer(layerId: string, name: string) {
  updateDiagram((d) => {
    const layer = d.settings.layers?.find((l) => l.id === layerId);
    if (layer) layer.name = name;
  }, false);
}

export function setNodeLayer(nodeId: string, layerId: string | undefined) {
  updateDiagram((d) => {
    const n = d.nodes.find((nn) => nn.id === nodeId);
    if (n) n.layerId = layerId;
  });
}

// ===== Z 轴顺序控制 =====
export function bringToFront() {
  const ids = state.ui.selection.nodes;
  if (!ids.length) return;
  updateDiagram((d) => {
    const moved = ids.map((id) => d.nodes.find((n) => n.id === id)).filter((n): n is DiagramNode => !!n);
    d.nodes = d.nodes.filter((n) => !ids.includes(n.id));
    d.nodes.push(...moved);
  });
}

export function sendToBack() {
  const ids = state.ui.selection.nodes;
  if (!ids.length) return;
  updateDiagram((d) => {
    const moved = ids.map((id) => d.nodes.find((n) => n.id === id)).filter((n): n is DiagramNode => !!n);
    d.nodes = d.nodes.filter((n) => !ids.includes(n.id));
    d.nodes.unshift(...moved);
  });
}

export function moveUp() {
  const ids = state.ui.selection.nodes;
  if (!ids.length) return;
  updateDiagram((d) => {
    for (const id of ids) {
      const idx = d.nodes.findIndex((n) => n.id === id);
      if (idx < d.nodes.length - 1) {
        [d.nodes[idx], d.nodes[idx + 1]] = [d.nodes[idx + 1], d.nodes[idx]];
      }
    }
  });
}

export function moveDown() {
  const ids = state.ui.selection.nodes;
  if (!ids.length) return;
  const reversed = [...ids].reverse();
  updateDiagram((d) => {
    for (const id of reversed) {
      const idx = d.nodes.findIndex((n) => n.id === id);
      if (idx > 0) {
        [d.nodes[idx], d.nodes[idx - 1]] = [d.nodes[idx - 1], d.nodes[idx]];
      }
    }
  });
}

// ===== 撤销历史面板 =====
export function getUndoCount() { return past.length; }
export function getRedoCount() { return future.length; }
export function getPastDiagrams() { return past; }
export function getFutureDiagrams() { return future; }
export function jumpToHistory(targetPastLength: number) {
  if (targetPastLength < 0 || targetPastLength >= past.length) return;
  const stepsBack = past.length - targetPastLength;
  for (let i = 0; i < stepsBack; i++) {
    const d = past.pop()!;
    future.unshift(structuredClone(state.diagram));
    setState({ ...state, diagram: d, ui: { ...state.ui, dirty: true, selection: pruneSelection(d, state.ui.selection) } });
  }
}

// ===== 自动图例 =====
import { buildLegendNodes } from "./legend";
export { buildLegendNodes } from "./legend";
export type { LegendOpts } from "./legend";

/** 画布右键菜单「生成图例」：默认全段开启，插入当前画布。 */
export function generateLegend(x: number, y: number, lang: "zh" | "en" = "zh") {
  const legendNodes = buildLegendNodes(state.diagram, x, y, { fluid: true, diameter: true, status: true }, lang);
  updateDiagram((d) => d.nodes.push(...legendNodes));
  setSelection({ nodes: legendNodes.map((n) => n.id), pipes: [] });
}

// ===== 标准回路模板 =====
const USER_TEMPLATES_KEY = "fluidpath.userTemplates.v1";

export interface UserTemplateRecord {
  name: string;
  diagram: Diagram;
  createdAt: string;
}

export function listSavedTemplates(): UserTemplateRecord[] {
  try {
    const raw = localStorage.getItem(USER_TEMPLATES_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

export function saveCurrentAsTemplate(name: string): boolean {
  const clean = name.trim();
  if (!clean) return false;
  const list = listSavedTemplates().filter((x) => x.name !== clean);
  list.unshift({ name: clean, diagram: structuredClone(state.diagram), createdAt: new Date().toISOString() });
  try { localStorage.setItem(USER_TEMPLATES_KEY, JSON.stringify(list.slice(0, 30))); return true; } catch { return false; }
}

export function deleteSavedTemplate(name: string) {
  try { localStorage.setItem(USER_TEMPLATES_KEY, JSON.stringify(listSavedTemplates().filter((x) => x.name !== name))); } catch { /* ignore */ }
}

export function insertTemplate(name: string) {
  const templates: Record<string, () => Diagram> = {
    "循环回路": () => {
      const t = createNode("tank", 100, 240, "储液罐");
      const p = createNode("pump", 300, 268, "循环泵");
      const b = createNode("hotWaterBoiler", 520, 230, "锅炉");
      const hx = createNode("heatExchanger", 740, 252, "换热器");
      return { id: uid("diagram"), name: "循环回路", nodes: [t, p, b, hx], pipes: [
        { id: uid("pipe"), label: "吸入", fromPortId: t.ports.find((pp) => pp.position === "right")?.id ?? "", toPortId: p.ports.find((pp) => pp.position === "left")?.id ?? "", points: [], fluidColor: "#2f7fd6", ...basePipeObj() },
        { id: uid("pipe"), label: "泵出", fromPortId: p.ports.find((pp) => pp.position === "right")?.id ?? "", toPortId: b.ports.find((pp) => pp.position === "bottom")?.id ?? "", points: [], fluidColor: "#2f7fd6", ...basePipeObj() },
        { id: uid("pipe"), label: "高温供水", fromPortId: b.ports.find((pp) => pp.position === "top")?.id ?? "", toPortId: hx.ports.find((pp) => pp.position === "left")?.id ?? "", points: [], fluidColor: "#e2542f", ...basePipeObj(), fluidType: "hotWater" },
        { id: uid("pipe"), label: "回水", fromPortId: hx.ports.find((pp) => pp.position === "right")?.id ?? "", toPortId: t.ports.find((pp) => pp.position === "left")?.id ?? "", points: [{ x: 920, y: 307 }, { x: 920, y: 480 }, { x: 40, y: 480 }, { x: 40, y: 295 }], fluidColor: "#e8964a", ...basePipeObj(), flowSpeed: 0.9 },
      ], settings: { showGrid: true, background: "#eef2f7", globalAnimationPlaying: true, crossoverHops: true, layers: [{ id: "layer_default", name: "默认层", visible: true }] } };
    },
    "咖啡机水路": () => createCoffeeMachineDiagram(),
    "蒸汽系统": () => createSteamSystemDiagram(),
    "牛奶发泡系统": () => createMilkFoamDiagram(),
    "商用咖啡机整机": () => createCommercialMachineDiagram(),
    "咖啡机整机示例（演示）": () => createDemoMachineDiagram(),
    "半自动咖啡机（双锅炉）": () => createSemiAutoMachineDiagram(),
    "全自动商用咖啡机": () => createFullAutoMachineDiagram(),
  };
  const tpl = templates[name];
  const saved = listSavedTemplates().find((x) => x.name === name);
  if (!tpl && !saved) return;
  const diagram = saved ? structuredClone(saved.diagram) : tpl!();
  diagram.id = uid("diagram");
  loadDiagram(diagram);
}

// ===== 元件样式预设 =====
const STYLE_PRESETS: Record<string, Partial<DiagramNode>> = {
  "默认工业风": { fill: "#ffffff", stroke: "#3d4c5e" },
  "暖色暖机": { fill: "#fff5ee", stroke: "#c94f3d" },
  "冷色冷水": { fill: "#eef4fb", stroke: "#2f7fd6" },
  "灰色淡化": { fill: "#f0f2f4", stroke: "#8a9ba8" },
  "高亮警示": { fill: "#fff8e1", stroke: "#d64545" },
};
export function applyStylePreset(presetName: string, nodeIds: string[]) {
  const preset = STYLE_PRESETS[presetName];
  if (!preset || !nodeIds.length) return;
  updateDiagram((d) => {
    for (const n of d.nodes) {
      if (nodeIds.includes(n.id)) Object.assign(n, preset);
    }
  });
}
export function getStylePresets() { return Object.keys(STYLE_PRESETS); }

// 辅助函数 — 模板用
function basePipeObj() {
  return { nominalDiameter: "DN25", visualDiameter: 10, wallColor: "#5b6b7d", fluidOpacity: 0.92, direction: "forward" as const, flowSpeed: 1.2, particleDensity: "medium" as const, animated: true, showArrow: true, fluidType: "coldWater" as const, material: "custom" as const, wallOpacity: 1, routing: "orthogonal" as const, cornerRadius: 0 };
}

// 测试/调试钩子：允许页面上下文访问 React 应用的 store 实例
if (typeof window !== "undefined") {
  (window as unknown as { __fluidpathStore?: typeof store }).__fluidpathStore = store;
}
