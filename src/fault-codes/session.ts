import { useSyncExternalStore } from "react";
import type { DiagnosticProfile, FaultRuntime, Observation, SignalValue } from "./types";
import { emptyRuntime, stepFault } from "./runtime";
import type { Diagram } from "../types";

export interface DiagnosticEvent { faultId: string; atMs: number; kind: string; observations: Record<string, Observation> }
export interface DiagnosticSession {
  selectedIds: string[];
  injectedIds: string[];
  revealHidden: boolean;
  animation: boolean;
  activeStepByFault: Record<string, number>;
  nowMs: number;
  running: boolean;
  profile: DiagnosticProfile | null;
  values: Record<string, { value: SignalValue; quality: Observation["quality"] }>;
  results: Record<string, FaultRuntime>;
  events: DiagnosticEvent[];
}
const fresh = (): DiagnosticSession => ({ selectedIds: [], injectedIds: [], revealHidden: false, animation: true, activeStepByFault: {}, nowMs: 0, running: false, profile: null, values: {}, results: {}, events: [] });
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
let viewSnapshot = { ids: [] as string[], revealHidden: false, animation: true, activeStepByFault: {} as Record<string, number> };
/** Canvas subscribes only to overlay changes, not 10 Hz clock/sample updates. */
function getViewSnapshot() {
  const ids = [...new Set([...state.selectedIds, ...state.injectedIds, ...Object.keys(state.results).filter(id => state.results[id].alarmState !== "clear")])];
  const activeStepByFault = Object.fromEntries(Object.entries(state.activeStepByFault).filter(([id]) => ids.includes(id)));
  const key = JSON.stringify([ids, state.revealHidden, state.animation, activeStepByFault]);
  if (key !== viewKey) { viewKey = key; viewSnapshot = { ids, revealHidden: state.revealHidden, animation: state.animation, activeStepByFault }; }
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

/** Definitions changed: stop the old clock and invalidate results, preserving only existing lookup. */
export function invalidateDiagnosticSimulation(existingIds: string[]) {
  const selected = state.selectedIds.filter(id => existingIds.includes(id));
  const animation = state.animation;
  resetDiagnosticSession(); state = { ...state, selectedIds: selected, animation }; emit();
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
    invalidateDiagnosticSimulation(next.settings.diagnosticProfile?.diagnostics.map(f => f.id) ?? []);
  }
}
