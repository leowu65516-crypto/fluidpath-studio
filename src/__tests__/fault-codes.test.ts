import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { EMPTY_PROFILE, parseDiagnosticProfile, resolveFaultTargets, detachProfileTargets, convertValue } from "../fault-codes/profile";
import { emptyRuntime, evaluateCondition, stepFault } from "../fault-codes/runtime";
import type { DiagnosticProfile, Observation } from "../fault-codes/types";
import { resetDiagnosticSession, prepareDiagnosticSimulation, setSimulationValue, advanceDiagnostics, diagnosticSession, acknowledgeFault, resetFault, selectFaultCodes, toggleInjectedFault } from "../fault-codes/session";
import { createFaultCode, bindFaultSelection, patchFaultCode, importFaultCatalog } from "../fault-codes/actions";
import { loadDiagram, store, setSelection, undo, redo, deleteSelection, patchNode, setWorkMode } from "../store";
import { parseDiagramJSON } from "../export";
import { buildMachinePack, parseMachinePack } from "../machinePack";
import { pipeEngineeringDisabled, setCachedPipes } from "../geometry";
import { buildFaultReport } from "../fault-codes/report";
import raw from "../../BCMTS.json";

function fixture(): DiagnosticProfile {
  const p = structuredClone(EMPTY_PROFILE);
  p.signalDefinitions = [{ id: "flow", label: { zh: "流量", en: "Flow" }, dataType: "number", unit: "mL/s", origin: "manualScenario", maxAgeMs: 500 }];
  p.highlightGroups = [{ id: "supply", label: { zh: "补水", en: "Supply" }, resolution: "explicit", nodeIds: ["n_ms7jr4mj2wu7sw"], pipeIds: ["pipe_ms7k87u8l8re4p"] }];
  p.diagnostics = [{ id: "lowFlow", code: "TEST-FLOW", label: { zh: "低流量", en: "Low flow" }, definitionStatus: "illustrative", highlightBindings: [{ groupId: "supply", meaning: "inspectionScope" }], presentation: { style: "outline", color: "#d97706", animation: "none" }, controlActions: [], rootCauseStatus: "notDetermined", detection: {
    clock: "simulation", graceMs: 2000, trigger: { condition: { signal: "flow", op: "lt", value: 1, unit: "mL/s" }, continuousMs: 5000 }, recovery: { condition: { signal: "flow", op: "gte", value: 2, unit: "mL/s" }, continuousMs: 2000 }, onUnknown: "breakContinuityAndRetainActiveAlarm", latching: true, resetPolicy: "manualAfterRecovery",
  } }];
  return p;
}
const observations = (t: number, value = 0, quality: Observation["quality"] = "good"): Record<string, Observation> => ({ flow: { value, atMs: t, quality, unit: "mL/s" } });
function until(profile: DiagnosticProfile, end: number, start = 0, initial = emptyRuntime(), value = 0) {
  let result = initial;
  for (let t = start; t <= end; t += 100) result = stepFault(profile.diagnostics[0].detection!, profile.signalDefinitions, observations(t, value), t, result);
  return result;
}
beforeEach(() => { setWorkMode("edit"); loadDiagram(parseDiagramJSON(JSON.stringify(raw))); });
afterEach(resetDiagnosticSession);

describe("strict portable diagnostic definitions", () => {
  it("round trips in JSON and machine packs without changing the original", () => {
    const diagram = store.get().diagram, original = structuredClone(diagram);
    const p = parseDiagnosticProfile(fixture()); diagram.settings.diagnosticProfile = p;
    const restored = parseMachinePack(JSON.stringify(buildMachinePack(diagram))).diagram;
    expect(restored.settings.diagnosticProfile).toEqual(p);
    expect(restored.nodes).toEqual(original.nodes); expect(restored.pipes).toEqual(original.pipes);
  });
  it.each(["version", "signal", "unit", "expression", "actions", "code", "color"])("rejects unsupported/malformed %s", kind => {
    const p = fixture();
    if (kind === "version") (p as unknown as { version: number }).version = 99;
    if (kind === "signal") p.signalDefinitions = [];
    if (kind === "unit") p.signalDefinitions[0].unit = "degC";
    if (kind === "expression") (p.diagnostics[0].detection!.trigger.condition as unknown as { eval: string }).eval = "evil()";
    if (kind === "actions") (p.diagnostics[0].controlActions as unknown[]).push({ closeAll: true });
    if (kind === "code") p.diagnostics.push(structuredClone(p.diagnostics[0]));
    if (kind === "color") p.diagnostics[0].presentation.color = "url(https://example.com/)";
    expect(() => parseDiagnosticProfile(p)).toThrow();
  });
  it("bounded expressions and empty condition lists are rejected", () => {
    const p = fixture(); p.diagnostics[0].detection!.enabledWhen = { all: [] };
    expect(() => parseDiagnosticProfile(p)).toThrow(/empty condition/);
    let c = p.diagnostics[0].detection!.trigger.condition;
    for (let i = 0; i < 14; i++) c = { not: c };
    p.diagnostics[0].detection!.enabledWhen = c;
    expect(() => parseDiagnosticProfile(p)).toThrow(/limit/);
  });
  it("cross-machine import clears target and sensor bindings even when old IDs match", () => {
    const p = fixture(); p.signalDefinitions[0].binding = { nodeId: "n_ms7jr4mj2wu7sw", purpose: "displayAnchor" };
    const next = detachProfileTargets(p);
    expect(next.highlightGroups[0].nodeIds).toEqual([]); expect(next.highlightGroups[0].pipeIds).toEqual([]);
    expect(next.signalDefinitions[0].binding).toBeUndefined(); expect(p.highlightGroups[0].nodeIds).toHaveLength(1);
  });
  it("missing targets stay visible as issues and never expand to the whole diagram", () => {
    const p = fixture(); p.highlightGroups[0].pipeIds.push("deleted");
    const targets = resolveFaultTargets(store.get().diagram, p, p.diagnostics[0]);
    expect(targets.pipes).toEqual(["pipe_ms7k87u8l8re4p"]); expect(targets.missing).toEqual(["deleted"]);
  });
});

describe("deterministic detection with independent clock, signals and latch", () => {
  it("waits through 2s grace and 5s persistence; recovers at 11s", () => {
    const p = fixture();
    expect(until(p, 6900).alarmState).toBe("clear");
    const active = until(p, 7000); expect(active.triggeredAt).toBe(7000);
    const after9 = until(p, 8900, 7100, active);
    expect(until(p, 10900, 9000, after9, 3).alarmState).toBe("active");
    const recovered = until(p, 11000, 9000, after9, 3);
    expect(recovered).toMatchObject({ alarmState: "recoveredAwaitingReset", recoveredAt: 11000 });
  });
  it("threshold equality, unit conversion and hysteresis are not guessed", () => {
    const p = fixture(), rule = p.diagnostics[0].detection!;
    expect(until(p, 10000, 0, emptyRuntime(), 1).alarmState).toBe("clear");
    const active = until(p, 7000);
    expect(until(p, 10000, 7100, active, 1.5).alarmState).toBe("active");
    expect(until(p, 9100, 7100, active, 2).alarmState).toBe("recoveredAwaitingReset");
    expect(convertValue(.06, "L/min", "mL/s")).toBeCloseTo(1);
    expect(evaluateCondition(rule.trigger.condition, p.signalDefinitions, { flow: { value: .06, atMs: 0, quality: "good", unit: "L/min" } }, 0).truth).toBe(false);
  });
  it.each(["missing", "stale", "invalid"] as const)("%s breaks pending detection and retains an active alarm", quality => {
    const p = fixture(), rule = p.diagnostics[0].detection!;
    const pending = until(p, 6900);
    const unknown = stepFault(rule, p.signalDefinitions, observations(7000, 0, quality), 7000, pending);
    expect(unknown.detectionStatus).toBe("unknown"); expect(unknown.triggerSince).toBeUndefined();
    const active = until(p, 7000);
    expect(stepFault(rule, p.signalDefinitions, observations(7100, 0, quality), 7100, active).alarmState).toBe("active");
  });
  it("a sparse fresh sample cannot claim continuous evidence across a gap", () => {
    const p = fixture(), rule = p.diagnostics[0].detection!;
    const previous = until(p, 2100);
    const afterGap = stepFault(rule, p.signalDefinitions, observations(12000), 12000, previous);
    expect(afterGap.alarmState).toBe("clear"); expect(afterGap.eligibleSince).toBe(12000);
  });
  it("false prerequisites suppress detection; unknown and invalid are distinct", () => {
    const p = fixture(), rule = p.diagnostics[0].detection!;
    rule.enabledWhen = { signal: "flow", op: "gt", value: 100, unit: "mL/s" };
    expect(until(p, 9000).detectionStatus).toBe("notApplicable");
    expect(evaluateCondition({ any: [{ signal: "flow", op: "eq", value: 0, unit: "mL/s" }, { signal: "absent", op: "eq", value: true }] }, p.signalDefinitions, observations(0), 0).invalid).toBe(true);
    expect(stepFault(rule, p.signalDefinitions, observations(0), -1).detectionStatus).toBe("invalid");
  });
});

describe("editing and runtime isolation", () => {
  it("lookup, injection and sampled detection leave all engineering states unchanged", () => {
    const d = store.get().diagram, before = structuredClone(d);
    setCachedPipes(d.pipes, d.nodes); const flows = d.pipes.map(p => pipeEngineeringDisabled(p, d.nodes));
    prepareDiagnosticSimulation(fixture()); selectFaultCodes(["lowFlow"]); toggleInjectedFault("lowFlow"); setSimulationValue("flow", 0);
    for (let i = 0; i < 70; i++) advanceDiagnostics(100);
    expect(diagnosticSession.get().results.lowFlow.alarmState).toBe("active");
    expect(store.get().diagram).toEqual(before); expect(d.pipes.map(p => pipeEngineeringDisabled(p, d.nodes))).toEqual(flows);
  });
  it("acknowledge cannot clear alarm; reset requires observed recovery", () => {
    prepareDiagnosticSimulation(fixture()); setSimulationValue("flow", 0);
    for (let i = 0; i < 70; i++) advanceDiagnostics(100);
    acknowledgeFault("lowFlow"); resetFault("lowFlow"); expect(diagnosticSession.get().results.lowFlow.alarmState).toBe("active");
    setSimulationValue("flow", 3); for (let i = 0; i < 20; i++) advanceDiagnostics(100);
    resetFault("lowFlow"); expect(diagnosticSession.get().results.lowFlow.alarmState).toBe("clear");
    expect(diagnosticSession.get().events.map(e => e.kind)).toContain("acknowledged");
  });
  it("add/bind/undo/redo round trip; invalid edits do not create history or partial data", () => {
    const node = store.get().diagram.nodes[0], pipe = store.get().diagram.pipes[0];
    const id = createFaultCode("E01", "Supply", "en");
    setSelection({ nodes: [node.id], pipes: [pipe.id] }); bindFaultSelection(id, "replace");
    let p = store.get().diagram.settings.diagnosticProfile!;
    expect(resolveFaultTargets(store.get().diagram, p, p.diagnostics[0]).pipes).toEqual([pipe.id]);
    undo(); p = store.get().diagram.settings.diagnosticProfile!; expect(p.highlightGroups[0].pipeIds).toEqual([]);
    redo(); expect(store.get().diagram.settings.diagnosticProfile!.highlightGroups[0].pipeIds).toEqual([pipe.id]);
    const before = structuredClone(store.get().diagram);
    expect(() => createFaultCode("E01", "duplicate", "en")).toThrow(); expect(store.get().diagram).toEqual(before);
  });
  it("deleted targets are reported, simulation invalidated, and new document clears lookup even with same legacy ID", () => {
    const id = createFaultCode("E01", "Supply", "en"); const node = store.get().diagram.nodes[0];
    setSelection({ nodes: [node.id], pipes: [] }); bindFaultSelection(id, "replace");
    selectFaultCodes([id]); deleteSelection();
    const p = store.get().diagram.settings.diagnosticProfile!;
    expect(resolveFaultTargets(store.get().diagram, p, p.diagnostics[0]).missing).toEqual([node.id]);
    loadDiagram(parseDiagramJSON(JSON.stringify(raw))); expect(diagnosticSession.get().selectedIds).toEqual([]);
  });
  it("mode locks definition edits, not lookup; pump toggles do not edit unrelated definitions", () => {
    const id = createFaultCode("E01", "Supply", "en");
    const before = structuredClone(store.get().diagram.settings.diagnosticProfile);
    patchNode("n_ms7jr4mj2wu7sw", { pumpOn: false });
    expect(store.get().diagram.settings.diagnosticProfile).toEqual(before);
    setWorkMode("present"); expect(() => patchFaultCode(id, { code: "E02" })).toThrow(/Edit/);
    selectFaultCodes([id]); expect(diagnosticSession.get().selectedIds).toEqual([id]);
  });
  it("catalog import explicitly detaches targets and reports lookup/NOT_RUN honestly", () => {
    importFaultCatalog(JSON.stringify(fixture()));
    expect(store.get().diagram.settings.diagnosticProfile!.highlightGroups[0].nodeIds).toEqual([]);
    const report = buildFaultReport(store.get().diagram, diagnosticSession.get(), "en");
    expect(report).toContain("NOT_RUN"); expect(report).toContain("not proven root causes");
  });
});
