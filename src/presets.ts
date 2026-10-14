/**
 * 预设状态原语（统一数据模型）：
 * 一套「泵/阀的开关组合」。演示场景步骤与工况快照共用这一套状态表示，
 * 只保留一份快照/应用逻辑，避免两处各自实现导致漂移。
 */

import type {
  Diagram,
  FluidType,
  WorkCondition,
  WorkConditionDisplaySettings,
  WorkConditionNodeProperties,
  WorkConditionPipeProperties,
} from "./types";

export interface PresetState {
  pumpOn?: boolean;
  valveState?: "open" | "closed";
  valvePath?: "A" | "B" | "off";
}

/** nodeId → 单件状态 */
export type PresetStateMap = Record<string, PresetState>;

/** 快照当前图所有泵/阀的开关状态 */
export function snapshotStates(diagram: Diagram): PresetStateMap {
  const st: PresetStateMap = {};
  for (const n of diagram.nodes) {
    if (n.type === "pump" || n.type === "milkPump" || n.type === "airPump") st[n.id] = { pumpOn: n.pumpOn !== false };
    else if (n.type === "solenoid2" || n.type === "ballValve" || n.type === "diaphragmValve2") st[n.id] = { valveState: n.valveState !== "closed" ? "open" : "closed" };
    else if (n.type === "solenoid3" || n.type === "diaphragmValve3") st[n.id] = { valvePath: n.valvePath ?? "A" };
  }
  return st;
}

/** 把一套状态应用到图（就地改节点；调用方负责包一层 updateDiagram） */
export function applyStates(diagram: Diagram, state: PresetStateMap): void {
  for (const n of diagram.nodes) {
    const s = state[n.id];
    if (!s) continue;
    if (n.type === "pump" || n.type === "milkPump" || n.type === "airPump") n.pumpOn = s.pumpOn !== false;
    else if (n.type === "solenoid2" || n.type === "ballValve" || n.type === "diaphragmValve2") n.valveState = s.valveState === "open" ? "open" : "closed";
    else if (n.type === "solenoid3") n.valvePath = s.valvePath ?? "A";
    else if (n.type === "diaphragmValve3") n.valvePath = s.valvePath === "B" ? "B" : "A";
  }
}

/** 两个状态是否一致（对比用） */
export function statesEqual(a: PresetStateMap, b: PresetStateMap): boolean {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  if (ka.length !== kb.length || ka.join("\u0000") !== kb.join("\u0000")) return false;
  for (const k of ka) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) return false;
  return true;
}

/** 状态条目数（参与状态的泵/阀总数） */
export function stateEntryCount(state: PresetStateMap): number {
  return Object.keys(state).length;
}

/** 两份状态之间发生变化的节点 id（用于切换工况后高亮差异） */
export function diffStateIds(prev: PresetStateMap, next: PresetStateMap): string[] {
  const ids = new Set([...Object.keys(prev), ...Object.keys(next)]);
  const changed: string[] = [];
  for (const id of ids) {
    if (JSON.stringify(prev[id] ?? null) !== JSON.stringify(next[id] ?? null)) changed.push(id);
  }
  return changed;
}

// ===== v1.30.7：工况快照扩展——管路介质（以当前设置为准，切回工况时一并还原） =====

export interface PresetPipeState {
  fluidType?: FluidType;
  fluidColor?: string;
}

/** pipeId → 单管路介质状态 */
export type PresetPipeMap = Record<string, PresetPipeState>;

/** 快照当前图全部管路的介质（类型 + 颜色） */
export function snapshotPipeStates(diagram: Diagram): PresetPipeMap {
  const st: PresetPipeMap = {};
  for (const p of diagram.pipes) st[p.id] = { fluidType: p.fluidType, fluidColor: p.fluidColor };
  return st;
}

/** 把一套管路介质状态应用到图（就地改管路；调用方负责包一层 updateDiagram） */
export function applyPipeStates(diagram: Diagram, state: PresetPipeMap): void {
  for (const p of diagram.pipes) {
    const s = state[p.id];
    if (!s) continue;
    if (s.fluidType !== undefined) p.fluidType = s.fluidType;
    if (s.fluidColor !== undefined) p.fluidColor = s.fluidColor;
  }
}

/** 两份介质快照之间发生变化的管路 id（用于切换工况后高亮差异） */
export function diffPipeStateIds(prev: PresetPipeMap, next: PresetPipeMap): string[] {
  const ids = new Set([...Object.keys(prev), ...Object.keys(next)]);
  const changed: string[] = [];
  for (const id of ids) {
    if (JSON.stringify(prev[id] ?? null) !== JSON.stringify(next[id] ?? null)) changed.push(id);
  }
  return changed;
}

// ===== v1.31：完整工况快照 =====
// 工况是“运行/讲解画面”的版本，不是历史版本管理：它故意不恢复对象增删或端口绑定。
// 这样保存工况以后仍能继续改图，而不会因切换工况回滚新画出来的结构。

const NODE_PROPERTY_KEYS = [
  "label", "x", "y", "width", "height", "rotation", "fill", "stroke", "variant", "fontSize",
  "labelOffset", "labelBackground", "labelBackgroundOpacity", "dispensing", "groupId", "exportKind", "disabled", "displayDisabled", "valveState",
  "valvePath", "valveCommonPortId", "showStateOnDiagram", "pumpOn", "fault", "pointerTarget", "imageData", "layerId",
  "annotationLineColor", "annotationLineOpacity", "annotationFillOpacity", "annotationStrokeOpacity",
] as const;

const PIPE_PROPERTY_KEYS = [
  "label", "points", "nominalDiameter", "visualDiameter", "wallColor", "fluidColor", "fluidOpacity",
  "direction", "flowSpeed", "particleDensity", "animated", "showArrow", "fluidType", "declaredMedium",
  "resolvedMedium", "material", "wallOpacity", "routing", "cornerRadius", "disabled", "displayDisabled",
  "fault", "teachingOverride", "forceFlow", "forceStop", "annotation",
] as const;

const DISPLAY_SETTING_KEYS = [
  "showGrid", "background", "globalAnimationPlaying", "crossoverHops", "layers", "currentLayerId",
  "snapToGrid", "showAlignmentGuides", "flowScale", "showFluidLabels", "showNodeLabels", "showPipeLabels",
  "showPipeDiameters", "showFluidColors", "nodeLabelFontSize", "backgroundType",
] as const;

type MutableRecord = Record<string, unknown>;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function snapshotNodeProperties(diagram: Diagram): Record<string, WorkConditionNodeProperties> {
  const result: Record<string, WorkConditionNodeProperties> = {};
  for (const node of diagram.nodes) {
    const copy = clone(node) as unknown as MutableRecord;
    delete copy.id;
    delete copy.type;
    delete copy.ports;
    result[node.id] = copy as WorkConditionNodeProperties;
  }
  return result;
}

function snapshotPipeProperties(diagram: Diagram): Record<string, WorkConditionPipeProperties> {
  const result: Record<string, WorkConditionPipeProperties> = {};
  for (const pipe of diagram.pipes) {
    const copy = clone(pipe) as unknown as MutableRecord;
    delete copy.id;
    delete copy.fromPortId;
    delete copy.toPortId;
    delete copy.fromPoint;
    delete copy.toPoint;
    result[pipe.id] = copy as WorkConditionPipeProperties;
  }
  return result;
}

function snapshotDisplaySettings(diagram: Diagram): WorkConditionDisplaySettings {
  const source = diagram.settings as unknown as MutableRecord;
  const result: MutableRecord = {};
  for (const key of DISPLAY_SETTING_KEYS) result[key] = clone(source[key]);
  return result as WorkConditionDisplaySettings;
}

function restoreProperties(target: MutableRecord, source: MutableRecord, keys: readonly string[]) {
  // 删除在快照中不存在的可选字段，才能把“取消覆盖/取消故障”也真正还原。
  for (const key of keys) {
    if (!(key in source)) delete target[key];
  }
  for (const [key, value] of Object.entries(source)) target[key] = clone(value);
}

/** 保存工况所需的完整非拓扑状态。旧版消费者仍可只读取 state/pipes。 */
export function snapshotWorkCondition(diagram: Diagram): Omit<WorkCondition, "name"> {
  return {
    state: snapshotStates(diagram),
    pipes: snapshotPipeStates(diagram),
    componentProperties: snapshotNodeProperties(diagram),
    pipeProperties: snapshotPipeProperties(diagram),
    displaySettings: snapshotDisplaySettings(diagram),
  };
}

/** 应用完整工况；无 v1.31 扩展字段的旧工况自动按旧的泵阀/介质语义兼容。 */
export function applyWorkConditionSnapshot(diagram: Diagram, condition: WorkCondition): void {
  applyStates(diagram, condition.state);
  if (condition.pipes) applyPipeStates(diagram, condition.pipes);

  // 旧版工况没有保存教学显示覆盖。切换到这类工况时，必须回到工程显示，
  // 否则上一工况的“显示为流动/停止”会残留并误导用户。
  if (!condition.pipeProperties) {
    for (const pipe of diagram.pipes) {
      delete pipe.teachingOverride;
      delete pipe.forceFlow;
      delete pipe.forceStop;
    }
  }

  if (condition.componentProperties) {
    const nodes = new Map(diagram.nodes.map((node) => [node.id, node]));
    for (const [id, source] of Object.entries(condition.componentProperties)) {
      const node = nodes.get(id);
      if (node) restoreProperties(node as unknown as MutableRecord, source as unknown as MutableRecord, NODE_PROPERTY_KEYS);
    }
  }
  if (condition.pipeProperties) {
    const pipes = new Map(diagram.pipes.map((pipe) => [pipe.id, pipe]));
    for (const [id, source] of Object.entries(condition.pipeProperties)) {
      const pipe = pipes.get(id);
      if (pipe) restoreProperties(pipe as unknown as MutableRecord, source as unknown as MutableRecord, PIPE_PROPERTY_KEYS);
    }
  }
  if (condition.displaySettings) {
    restoreProperties(diagram.settings as unknown as MutableRecord, condition.displaySettings as MutableRecord, DISPLAY_SETTING_KEYS);
  }
}

/** 任意按 ID 保存的属性快照之间的变化对象，用于切换后的定位反馈。 */
export function diffPropertyIds<T>(prev: Record<string, T>, next: Record<string, T>): string[] {
  const ids = new Set([...Object.keys(prev), ...Object.keys(next)]);
  return [...ids].filter((id) => JSON.stringify(prev[id] ?? null) !== JSON.stringify(next[id] ?? null));
}
