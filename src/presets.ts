/**
 * 预设状态原语（统一数据模型）：
 * 一套「泵/阀的开关组合」。演示场景步骤与工况快照共用这一套状态表示，
 * 只保留一份快照/应用逻辑，避免两处各自实现导致漂移。
 */

import type { Diagram, FluidType } from "./types";

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
