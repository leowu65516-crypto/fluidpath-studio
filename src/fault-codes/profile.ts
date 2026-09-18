import type { Diagram, Selection } from "../types";
import type { Condition, DiagnosticProfile, FaultCode, HighlightGroup, SignalDefinition } from "./types";

export const EMPTY_PROFILE: DiagnosticProfile = {
  format: "fluidpath.diagnostic-profile", version: "0.1-draft", namespace: "user.local",
  source: { kind: "userDeclared", appliesToRealMachine: false },
  signalDefinitions: [], highlightGroups: [], diagnostics: [],
};
export const MAX_PROFILE_BYTES = 1_000_000;
const UNITS: Record<string, [string, number]> = {
  "m3/s": ["volumeFlow", 1], "L/min": ["volumeFlow", 1 / 60000], "mL/s": ["volumeFlow", 1e-6],
  Pa: ["pressure", 1], kPa: ["pressure", 1000], bar: ["pressure", 100000],
  degC: ["temperature", 1], "%": ["ratio", 0.01], "1": ["ratio", 1],
  s: ["time", 1], ms: ["time", 0.001], count: ["count", 1],
};
export const SIGNAL_UNITS = Object.keys(UNITS);
export function convertValue(value: number, from: string | undefined, to: string | undefined): number | null {
  if (!Number.isFinite(value) || !from || !to || !UNITS[from] || !UNITS[to] || UNITS[from][0] !== UNITS[to][0]) return null;
  return value * UNITS[from][1] / UNITS[to][1];
}

function fail(path: string, message: string): never { throw new Error(`${path}: ${message}`); }
function object(raw: unknown, path: string): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail(path, "expected object");
  return raw as Record<string, unknown>;
}
function keys(o: Record<string, unknown>, allowed: string[], path: string) {
  for (const key of Object.keys(o)) if (!allowed.includes(key)) fail(`${path}.${key}`, "unsupported field");
}
function str(v: unknown, path: string, max = 2000, empty = false): asserts v is string {
  if (typeof v !== "string" || (!empty && !v.trim()) || v.length > max) fail(path, "expected bounded text");
}
function enumeration(v: unknown, values: readonly unknown[], path: string) {
  if (!values.includes(v)) fail(path, `expected ${values.join(" / ")}`);
}
function duration(v: unknown, path: string) {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 86_400_000) fail(path, "expected 0–86400000 ms");
}
function list(v: unknown, path: string, max = 1000): unknown[] {
  if (!Array.isArray(v) || v.length > max) fail(path, `expected array, at most ${max} entries`);
  return v;
}
function textPair(v: unknown, path: string) {
  const o = object(v, path); keys(o, ["zh", "en"], path);
  str(o.zh, `${path}.zh`, 4000, true); str(o.en, `${path}.en`, 4000, true);
}
function idList(v: unknown, path: string) {
  const ids = list(v, path, 10000); ids.forEach((x, i) => str(x, `${path}[${i}]`, 160));
  if (new Set(ids).size !== ids.length) fail(path, "duplicate reference");
}

/** Parse untrusted files/AI results before they enter the store. No executable expressions. */
export function parseDiagnosticProfile(raw: unknown): DiagnosticProfile {
  if (typeof raw === "string") {
    if (raw.length > MAX_PROFILE_BYTES) fail("profile", "file too large");
    raw = JSON.parse(raw);
  }
  const o = object(raw, "profile");
  keys(o, ["format", "version", "namespace", "source", "diagramBinding", "signalDefinitions", "highlightGroups", "diagnostics"], "profile");
  enumeration(o.format, ["fluidpath.diagnostic-profile"], "format");
  enumeration(o.version, ["0.1-draft"], "version"); str(o.namespace, "namespace", 160);
  const source = object(o.source, "source"); keys(source, ["kind", "appliesToRealMachine"], "source");
  enumeration(source.kind, ["userDeclared", "illustrative"], "source.kind");
  if (typeof source.appliesToRealMachine !== "boolean") fail("source.appliesToRealMachine", "expected boolean");
  if (source.kind === "illustrative" && source.appliesToRealMachine) fail("source", "illustrative data cannot claim real-machine applicability");
  if (o.diagramBinding !== undefined) {
    const b = object(o.diagramBinding, "diagramBinding"); keys(b, ["sourceFile", "sourceSha256"], "diagramBinding");
    str(b.sourceFile, "diagramBinding.sourceFile");
    if (typeof b.sourceSha256 !== "string" || !/^[a-f0-9]{64}$/.test(b.sourceSha256)) fail("diagramBinding.sourceSha256", "invalid SHA-256");
  }
  const signals = new Map<string, SignalDefinition>();
  for (const [i, value] of list(o.signalDefinitions, "signalDefinitions", 200).entries()) {
    const p = `signalDefinitions[${i}]`, s = object(value, p);
    keys(s, ["id", "label", "dataType", "quantity", "unit", "values", "trueMeans", "origin", "binding", "maxAgeMs"], p);
    str(s.id, `${p}.id`, 160); if (signals.has(s.id)) fail(p, "duplicate signal ID"); textPair(s.label, `${p}.label`);
    enumeration(s.dataType, ["number", "boolean", "enum"], `${p}.dataType`);
    enumeration(s.origin, ["manualScenario", "simulatedModel", "replay", "external"], `${p}.origin`);
    duration(s.maxAgeMs, `${p}.maxAgeMs`); if (s.maxAgeMs === 0) fail(p, "signal validity must be positive");
    if (s.dataType === "number") {
      enumeration(s.unit, SIGNAL_UNITS, `${p}.unit`);
      if (s.quantity !== undefined && s.quantity !== UNITS[s.unit as string][0]) fail(p, "quantity/unit mismatch");
    }
    if (s.dataType === "boolean") str(s.trueMeans, `${p}.trueMeans`);
    if (s.dataType === "enum") { idList(s.values, `${p}.values`); if (!(s.values as unknown[]).length) fail(p, "empty enum"); }
    if (s.binding !== undefined) {
      const b = object(s.binding, `${p}.binding`); keys(b, ["nodeId", "purpose"], `${p}.binding`);
      str(b.nodeId, `${p}.binding.nodeId`, 160); enumeration(b.purpose, ["displayAnchor"], `${p}.binding.purpose`);
    }
    signals.set(s.id, s as unknown as SignalDefinition);
  }
  const groups = new Set<string>();
  for (const [i, value] of list(o.highlightGroups, "highlightGroups", 500).entries()) {
    const p = `highlightGroups[${i}]`, g = object(value, p);
    keys(g, ["id", "label", "resolution", "nodeIds", "pipeIds"], p);
    str(g.id, `${p}.id`, 160); if (groups.has(g.id)) fail(p, "duplicate group ID"); groups.add(g.id);
    textPair(g.label, `${p}.label`); enumeration(g.resolution, ["explicit"], `${p}.resolution`);
    idList(g.nodeIds, `${p}.nodeIds`); idList(g.pipeIds, `${p}.pipeIds`);
  }
  let expressionNodes = 0;
  function condition(rawCondition: unknown, p: string, depth = 0) {
    if (++expressionNodes > 10000 || depth > 12) fail(p, "expression limit exceeded");
    const c = object(rawCondition, p);
    if ("all" in c || "any" in c) {
      const key = "all" in c ? "all" : "any"; keys(c, [key], p);
      const children = list(c[key], p, 50); if (!children.length) fail(p, "empty condition");
      children.forEach((child, i) => condition(child, `${p}.${key}[${i}]`, depth + 1)); return;
    }
    if ("not" in c) { keys(c, ["not"], p); condition(c.not, `${p}.not`, depth + 1); return; }
    keys(c, ["signal", "op", "value", "unit"], p); str(c.signal, `${p}.signal`, 160);
    const signal = signals.get(c.signal); if (!signal) fail(p, "unknown signal");
    enumeration(c.op, signal.dataType === "number" ? ["lt", "lte", "gt", "gte", "eq", "ne"] : ["eq", "ne"], `${p}.op`);
    if (signal.dataType === "number") {
      if (typeof c.value !== "number" || convertValue(c.value, c.unit as string, signal.unit) === null) fail(p, "invalid numeric value or incompatible unit");
    } else if (signal.dataType === "boolean") {
      if (typeof c.value !== "boolean" || c.unit !== undefined) fail(p, "expected boolean without unit");
    } else if (!signal.values?.includes(c.value as string) || c.unit !== undefined) fail(p, "invalid enum value");
  }
  const ids = new Set<string>(), codes = new Set<string>();
  for (const [i, value] of list(o.diagnostics, "diagnostics", 500).entries()) {
    const p = `diagnostics[${i}]`, f = object(value, p);
    keys(f, ["id", "code", "label", "description", "definitionStatus", "detection", "highlightBindings", "presentation", "controlActions", "rootCauseStatus"], p);
    str(f.id, `${p}.id`, 160); str(f.code, `${p}.code`, 120);
    if (ids.has(f.id) || codes.has(f.code)) fail(p, "duplicate fault ID/code in namespace"); ids.add(f.id); codes.add(f.code);
    textPair(f.label, `${p}.label`); if (f.description !== undefined) textPair(f.description, `${p}.description`);
    enumeration(f.definitionStatus, ["userDeclared", "illustrative"], `${p}.definitionStatus`);
    if (list(f.controlActions, `${p}.controlActions`, 0).length) fail(p, "control actions unsupported");
    enumeration(f.rootCauseStatus, ["notDetermined"], `${p}.rootCauseStatus`);
    for (const b of list(f.highlightBindings, `${p}.highlightBindings`, 500)) {
      const binding = object(b, p); keys(binding, ["groupId", "meaning"], p);
      if (!groups.has(binding.groupId as string)) fail(p, "unknown highlight group");
      enumeration(binding.meaning, ["inspectionScope", "observedAt", "affectedCircuit"], p);
    }
    const style = object(f.presentation, `${p}.presentation`); keys(style, ["style", "color", "animation"], p);
    enumeration(style.style, ["outline"], p); enumeration(style.animation, ["none", "breathe"], p);
    if (typeof style.color !== "string" || !/^#[a-f0-9]{6}$/i.test(style.color)) fail(p, "invalid color");
    if (f.detection !== undefined) {
      const r = object(f.detection, `${p}.detection`);
      keys(r, ["clock", "enabledWhen", "graceMs", "trigger", "recovery", "onUnknown", "latching", "resetPolicy"], p);
      enumeration(r.clock, ["simulation"], p); duration(r.graceMs, p);
      if (r.enabledWhen !== undefined) condition(r.enabledWhen, `${p}.enabledWhen`);
      for (const phase of ["trigger", "recovery"] as const) {
        const c = object(r[phase], `${p}.${phase}`); keys(c, ["condition", "continuousMs"], p);
        duration(c.continuousMs, p); condition(c.condition, `${p}.${phase}.condition`);
      }
      enumeration(r.onUnknown, ["breakContinuityAndRetainActiveAlarm"], p);
      if (typeof r.latching !== "boolean") fail(p, "expected latching boolean");
      enumeration(r.resetPolicy, ["manualAfterRecovery", "automaticAfterRecovery"], p);
      if (r.latching !== (r.resetPolicy === "manualAfterRecovery")) fail(p, "latching/reset policy conflict");
    }
  }
  return structuredClone(o) as unknown as DiagnosticProfile;
}

export function resolveFaultTargets(diagram: Diagram, profile: DiagnosticProfile, fault: FaultCode) {
  const nodeIds = new Set(diagram.nodes.map(n => n.id)), pipeIds = new Set(diagram.pipes.map(p => p.id));
  const nodes = new Set<string>(), pipes = new Set<string>(), missing = new Set<string>();
  for (const binding of fault.highlightBindings) {
    const group = profile.highlightGroups.find(g => g.id === binding.groupId);
    if (!group) { missing.add(binding.groupId); continue; }
    for (const id of group.nodeIds) (nodeIds.has(id) ? nodes : missing).add(id);
    for (const id of group.pipeIds) (pipeIds.has(id) ? pipes : missing).add(id);
  }
  return { nodes: [...nodes], pipes: [...pipes], missing: [...missing] };
}

/** Importing into another diagram never trusts recycled legacy IDs. Explicit rebind follows. */
export function detachProfileTargets(profile: DiagnosticProfile): DiagnosticProfile {
  const next = structuredClone(profile);
  delete next.diagramBinding;
  next.highlightGroups.forEach(g => { g.nodeIds = []; g.pipeIds = []; });
  next.signalDefinitions.forEach(s => { delete s.binding; });
  return next;
}

export function bindSelection(group: HighlightGroup, selection: Selection, mode: "replace" | "add" | "remove"): HighlightGroup {
  const merge = (old: string[], next: string[]) => mode === "replace" ? [...new Set(next)] : mode === "add" ? [...new Set([...old, ...next])] : old.filter(id => !next.includes(id));
  return { ...group, nodeIds: merge(group.nodeIds, selection.nodes), pipeIds: merge(group.pipeIds, selection.pipes) };
}

export function signalIds(condition: Condition): string[] {
  if ("all" in condition) return condition.all.flatMap(signalIds);
  if ("any" in condition) return condition.any.flatMap(signalIds);
  if ("not" in condition) return signalIds(condition.not);
  return [condition.signal];
}
