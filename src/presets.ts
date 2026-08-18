/**
 * 预设状态原语（统一数据模型）：
 * 一套「泵/阀的开关组合」。演示场景步骤与工况快照共用这一套状态表示，
 * 只保留一份快照/应用逻辑，避免两处各自实现导致漂移。
 */

import type { Diagram } from "./types";

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
    if (n.type === "pump" || n.type === "milkPump") st[n.id] = { pumpOn: n.pumpOn !== false };
    else if (n.type === "solenoid2") st[n.id] = { valveState: n.valveState === "open" ? "open" : "closed" };
    else if (n.type === "solenoid3") st[n.id] = { valvePath: n.valvePath ?? "A" };
  }
  return st;
}

/** 把一套状态应用到图（就地改节点；调用方负责包一层 updateDiagram） */
export function applyStates(diagram: Diagram, state: PresetStateMap): void {
  for (const n of diagram.nodes) {
    const s = state[n.id];
    if (!s) continue;
    if (n.type === "pump" || n.type === "milkPump") n.pumpOn = s.pumpOn !== false;
    else if (n.type === "solenoid2") n.valveState = s.valveState === "open" ? "open" : "closed";
    else if (n.type === "solenoid3") n.valvePath = s.valvePath ?? "A";
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
