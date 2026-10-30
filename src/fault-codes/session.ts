import { useSyncExternalStore } from "react";
import type { DiagnosticProfile, FaultRuntime, LocalizedText, Observation, SignalValue } from "./types";
import { emptyRuntime, stepFault } from "./runtime";
import type { Diagram, WorkCondition } from "../types";

export interface DiagnosticEvent { faultId: string; atMs: number; kind: string; observations: Record<string, Observation> }
export interface DiagnosticSession {
  selectedIds: string[];
  injectedIds: string[];
  revealHidden: boolean;
  animation: boolean;
  activeStepByFault: Record<string, number>;
  /** 0.3 知识库咨询：当前症状 / 当前部件组（仅显示层选择，与仿真/工程状态无关）。 */
  kbSymptomId: string | null;
  kbPartGroupId: string | null;
  /** 绑定向导当前预览组（画布蓝色描边提示，只读显示）。 */
  bindPreviewGroupId: string | null;
  /** 0.4 故障演练：进行中的演练（含基线快照与引擎差异集合）。 */
  drill: DrillSession | null;
  nowMs: number;
  running: boolean;
  profile: DiagnosticProfile | null;
  values: Record<string, { value: SignalValue; quality: Observation["quality"] }>;
  results: Record<string, FaultRuntime>;
  events: DiagnosticEvent[];
}
export interface DrillInjectedTarget { nodeId: string; behavior: string; groupId: string }
export interface DrillSession {
  faultId: string;
  faultCode: string;
  /** 演练前的完整可编辑状态（还原用，等价于一次 undo）。 */
  baseline: Omit<WorkCondition, "name">;
  /** 引擎差异：演练前流、演练后停 / 反向。 */
  changes: { stoppedPipes: string[]; flowingPipes: string[] };
  injected: DrillInjectedTarget[];
  note?: LocalizedText;
}
const fresh = (): DiagnosticSession => ({ selectedIds: [], injectedIds: [], revealHidden: false, animation: true, activeStepByFault: {}, kbSymptomId: null, kbPartGroupId: null, bindPreviewGroupId: null, drill: null, nowMs: 0, running: false, profile: null, values: {}, results: {}, events: [] });
let state = fresh();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
function emit() { listeners.forEach(fn => fn()); }
export const diagnosticSession = {
  get: () => state,
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
};
export const useDiagnosticSession = () => useSyncExternalStore(diagnosticSession.subscribe, diagnosticSession.get);
let viewKey = "";
let viewSnapshot = { ids: [] as string[], revealHidden: false, animation: true, activeStepByFault: {} as Record<string, number>, kbSymptomId: null as string | null, kbPartGroupId: null as string | null, bindPreviewGroupId: null as string | null, drill: null as DrillSession | null };
/** Canvas subscribes only to overlay changes, not 10 Hz clock/sample updates. */
function getViewSnapshot() {
  const ids = [...new Set([...state.selectedIds, ...state.injectedIds, ...Object.keys(state.results).filter(id => state.results[id].alarmState !== "clear")])];
  const activeStepByFault = Object.fromEntries(Object.entries(state.activeStepByFault).filter(([id]) => ids.includes(id)));
  const key = JSON.stringify([ids, state.revealHidden, state.animation, activeStepByFault, state.kbSymptomId, state.kbPartGroupId, state.bindPreviewGroupId, state.drill]);
  if (key !== viewKey) { viewKey = key; viewSnapshot = { ids, revealHidden: state.revealHidden, animation: state.animation, activeStepByFault, kbSymptomId: state.kbSymptomId, kbPartGroupId: state.kbPartGroupId, bindPreviewGroupId: state.bindPreviewGroupId, drill: state.drill }; }
  return viewSnapshot;
}
export const useDiagnosticView = () => useSyncExternalStore(diagnosticSession.subscribe, getViewSnapshot);
export function selectFaultCodes(ids: string[]) {
  const selectedIds = [...new Set(ids)];
  state = { ...state, selectedIds, revealHidden: false, activeStepByFault: Object.fromEntries(Object.entries(state.activeStepByFault).filter(([id]) => selectedIds.includes(id))) };
  emit();
}
export function selectFaultStep(faultId: string, index: number) {
  if (!state.selectedIds.includes(faultId)) return;
  state = { ...state, activeStepByFault: { ...state.activeStepByFault, [faultId]: Math.max(0, Math.floor(index)) } };
  emit();
}
/** 知识库咨询选择：症状与部件组互相独立，选择部件组时若其不在当前症状嫌疑内仍允许（自由跳查）。 */
export function selectKbSymptom(symptomId: string | null) {
  state = { ...state, kbSymptomId: symptomId, kbPartGroupId: null }; emit();
}
export function selectKbPart(groupId: string | null) {
  state = { ...state, kbPartGroupId: groupId }; emit();
}
/** 绑定向导的画布预览组（null 清除）。 */
export function setBindPreviewGroupId(groupId: string | null) {
  state = { ...state, bindPreviewGroupId: groupId }; emit();
}
/** 开始/更新一次故障演练（基线快照 + 引擎差异集合）。 */
export function setDrillSession(drill: DrillSession) {
  state = { ...state, drill }; emit();
}
export function clearDrillSession() {
  if (!state.drill) return;
  state = { ...state, drill: null }; emit();
}
export function setDiagnosticView(patch: Partial<Pick<DiagnosticSession, "revealHidden" | "animation">>) { state = { ...state, ...patch }; emit(); }
export function resetDiagnosticSession() {
  if (timer) clearInterval(timer); timer = null;
  state = fresh(); emit();
}
export function prepareDiagnosticSimulation(profile: DiagnosticProfile) {
  const selected = state.selectedIds;
  resetDiagnosticSession();
  state = { ...state, selectedIds: selected, profile: structuredClone(profile) };
  for (const s of profile.signalDefinitions) {
    state.values[s.id] = { value: s.dataType === "number" ? 0 : s.dataType === "boolean" ? false : s.values?.[0] ?? "", quality: "missing" };
  }
  advanceDiagnostics(0);
}
export function advanceDiagnostics(deltaMs = 100) {
  if (!state.profile || deltaMs < 0 || deltaMs > 1000) return;
  const nowMs = state.nowMs + deltaMs;
  const observations: Record<string, Observation> = {};
  // Manual inputs are explicitly held and sampled at every simulation step. No real sensor claim.
  for (const signal of state.profile.signalDefinitions) {
    const value = state.values[signal.id];
    if (value) observations[signal.id] = { ...value, atMs: nowMs, unit: signal.unit };
  }
  const results = { ...state.results }, events = [...state.events];
  for (const fault of state.profile.diagnostics) {
    if (!fault.detection) continue;
    const before = results[fault.id] ?? emptyRuntime();
    const after = stepFault(fault.detection, state.profile.signalDefinitions, observations, nowMs, before);
    results[fault.id] = after;
    if (before.alarmState !== after.alarmState) events.push({ faultId: fault.id, atMs: nowMs, kind: after.alarmState, observations: structuredClone(observations) });
  }
  state = { ...state, nowMs, results, events: events.slice(-1000) }; emit();
}
export function setSimulationValue(id: string, value: SignalValue, quality: Observation["quality"] = "good") {
  if (!state.profile?.signalDefinitions.some(s => s.id === id)) return;
  state = { ...state, values: { ...state.values, [id]: { value, quality } } }; advanceDiagnostics(0);
}
export function setSimulationRunning(running: boolean) {
  if (timer) clearInterval(timer); timer = null;
  state = { ...state, running: !!state.profile && running }; emit();
  if (state.running) timer = setInterval(() => advanceDiagnostics(100), 100);
}
export function acknowledgeFault(id: string) {
  if (!state.results[id] || state.results[id].alarmState === "clear") return;
  state = { ...state, results: { ...state.results, [id]: { ...state.results[id], acknowledged: true } }, events: [...state.events, { faultId: id, atMs: state.nowMs, kind: "acknowledged", observations: {} }].slice(-1000) }; emit();
}
export function resetFault(id: string) {
  const result = state.results[id];
  if (result?.alarmState !== "recoveredAwaitingReset" || result.detectionStatus !== "normal") return;
  state = { ...state, results: { ...state.results, [id]: { ...emptyRuntime(), lastAt: state.nowMs } }, events: [...state.events, { faultId: id, atMs: state.nowMs, kind: "reset", observations: {} }].slice(-1000) }; emit();
}
export function toggleInjectedFault(id: string) {
  const removing = state.injectedIds.includes(id);
  state = { ...state, injectedIds: removing ? state.injectedIds.filter(x => x !== id) : [...state.injectedIds, id], events: [...state.events, { faultId: id, atMs: state.nowMs, kind: removing ? "injectionCleared" : "teachingInjection", observations: {} }].slice(-1000) }; emit();
}

/**
 * Definitions changed: stop the old clock and invalidate results, preserving only existing lookup.
 * 0.3 咨询层：症状/部件选择与仿真无关，只要 id 在新 profile 中仍存在就保留——
 * 否则每次「替换绑定」都会清空咨询台，批量绑定时无法连续作业（1.46.0）。
 */
export function invalidateDiagnosticSimulation(profile: DiagnosticProfile | null) {
  const selected = state.selectedIds.filter(id => (profile?.diagnostics ?? []).some(f => f.id === id));
  const animation = state.animation;
  const kbSymptomId = state.kbSymptomId && (profile?.symptoms ?? []).some(s => s.id === state.kbSymptomId) ? state.kbSymptomId : null;
  const kbPartGroupId = state.kbPartGroupId && (profile?.highlightGroups ?? []).some(g => g.id === state.kbPartGroupId) ? state.kbPartGroupId : null;
  resetDiagnosticSession();
  // drill / bind preview 描述的是旧状态的画布差异，图纸一变即失效（演练还原/绑定成功后由调用方重新设置）。
  state = { ...state, selectedIds: selected, animation, kbSymptomId, kbPartGroupId };
  emit();
}

export function diagnosticContextKey(diagram: Diagram): string {
  return JSON.stringify([
    diagram.settings.diagnosticProfile,
    diagram.nodes.map(n => [n.id, n.type, n.ports.map(p => [p.id, p.nodeId])]),
    diagram.pipes.map(p => [p.id, p.fromPortId, p.toPortId]),
  ]);
}

export function syncDiagnosticDiagram(previous: Diagram, next: Diagram) {
  if (diagnosticContextKey(previous) !== diagnosticContextKey(next)) {
    invalidateDiagnosticSimulation(next.settings.diagnosticProfile ?? null);
  }
}
