import type { Condition, DetectionRule, DiagnosticProfile, FaultRuntime, Observation, SignalDefinition } from "./types";
import { convertValue, signalIds } from "./profile";

export interface ConditionResult { truth: boolean | null; invalid: boolean; validThrough: number }
export const emptyRuntime = (): FaultRuntime => ({ detectionStatus: "notApplicable", alarmState: "clear", acknowledged: false });

/** Three-valued logic. An absent/stale sample is not a zero or a healthy measurement. */
export function evaluateCondition(condition: Condition, definitions: SignalDefinition[], samples: Record<string, Observation>, now: number): ConditionResult {
  const unknown = (invalid = false): ConditionResult => ({ truth: null, invalid, validThrough: now });
  if ("not" in condition) {
    const r = evaluateCondition(condition.not, definitions, samples, now);
    return { ...r, truth: r.truth === null ? null : !r.truth };
  }
  if ("all" in condition || "any" in condition) {
    const all = "all" in condition;
    const children = ("all" in condition ? condition.all : condition.any).map(c => evaluateCondition(c, definitions, samples, now));
    const invalid = children.some(c => c.invalid);
    const truth = all
      ? children.some(c => c.truth === false) ? false : children.some(c => c.truth === null) ? null : true
      : children.some(c => c.truth === true) ? true : children.some(c => c.truth === null) ? null : false;
    return { truth: invalid ? null : truth, invalid, validThrough: Math.min(...children.map(c => c.validThrough)) };
  }
  const def = definitions.find(s => s.id === condition.signal), sample = samples[condition.signal];
  if (!def) return unknown(true);
  if (!sample || sample.quality !== "good" || sample.atMs > now || now - sample.atMs > def.maxAgeMs) return unknown();
  let value = sample.value, expected = condition.value;
  if (def.dataType === "number") {
    if (typeof value !== "number" || typeof expected !== "number") return unknown(true);
    const normalized = convertValue(value, sample.unit ?? def.unit, def.unit);
    const threshold = convertValue(expected, condition.unit, def.unit);
    if (normalized === null || threshold === null) return unknown(true);
    value = normalized; expected = threshold;
  } else if (def.dataType === "boolean" ? typeof value !== "boolean" : !def.values?.includes(String(value))) return unknown(true);
  const truth = condition.op === "eq" ? value === expected : condition.op === "ne" ? value !== expected
    : condition.op === "lt" ? value < expected : condition.op === "lte" ? value <= expected
      : condition.op === "gt" ? value > expected : value >= expected;
  return { truth, invalid: false, validThrough: sample.atMs + def.maxAgeMs };
}

/** Pure clocked step; independent of DOM, animation speed, drawing, and rendering order. */
export function stepFault(rule: DetectionRule, definitions: SignalDefinition[], samples: Record<string, Observation>, now: number, previous: FaultRuntime = emptyRuntime()): FaultRuntime {
  const next = { ...previous, lastAt: now };
  if (!Number.isFinite(now) || now < 0 || (previous.lastAt !== undefined && now < previous.lastAt)) {
    return { ...next, detectionStatus: "invalid", reason: "Non-monotonic simulation clock" };
  }
  const enabled = rule.enabledWhen ? evaluateCondition(rule.enabledWhen, definitions, samples, now) : { truth: true, invalid: false, validThrough: Infinity };
  const trigger = evaluateCondition(rule.trigger.condition, definitions, samples, now);
  const recovery = evaluateCondition(rule.recovery.condition, definitions, samples, now);
  next.validThrough = Math.min(enabled.validThrough, trigger.validThrough, next.alarmState === "clear" ? Infinity : recovery.validThrough);
  delete next.reason;
  if (previous.validThrough !== undefined && previous.validThrough < now) {
    delete next.eligibleSince; delete next.triggerSince; delete next.recoverySince;
  }
  if (enabled.truth === false && !enabled.invalid) {
    delete next.eligibleSince; delete next.triggerSince; delete next.recoverySince;
    return { ...next, detectionStatus: "notApplicable" };
  }
  if (enabled.truth === null || trigger.truth === null || (next.alarmState !== "clear" && recovery.truth === null)) {
    delete next.eligibleSince; delete next.triggerSince; delete next.recoverySince;
    return { ...next, detectionStatus: enabled.invalid || trigger.invalid || recovery.invalid ? "invalid" : "unknown" };
  }
  if (trigger.truth === true && recovery.truth === true) {
    delete next.triggerSince; delete next.recoverySince;
    return { ...next, detectionStatus: "invalid", reason: "Trigger and recovery overlap" };
  }
  next.eligibleSince ??= now;
  if (next.alarmState !== "clear") {
    if (recovery.truth === true) {
      next.recoverySince ??= now;
      if (now - next.recoverySince >= rule.recovery.continuousMs) {
        next.recoveredAt ??= now;
        next.alarmState = rule.latching ? "recoveredAwaitingReset" : "clear";
        delete next.triggerSince;
      }
    } else {
      delete next.recoverySince; delete next.recoveredAt;
      next.alarmState = "active";
    }
    return { ...next, detectionStatus: trigger.truth ? "triggered" : "normal" };
  }
  if (now - next.eligibleSince < rule.graceMs) return { ...next, detectionStatus: "notApplicable" };
  if (trigger.truth !== true) { delete next.triggerSince; return { ...next, detectionStatus: "normal" }; }
  next.triggerSince ??= now;
  if (now - next.triggerSince < rule.trigger.continuousMs) return { ...next, detectionStatus: "pending" };
  delete next.recoverySince; delete next.recoveredAt;
  return { ...next, detectionStatus: "triggered", alarmState: "active", triggeredAt: now, acknowledged: false };
}

export function requiredSignals(profile: DiagnosticProfile): Set<string> {
  return new Set(profile.diagnostics.flatMap(f => f.detection ? [
    ...signalIds(f.detection.trigger.condition), ...signalIds(f.detection.recovery.condition),
    ...(f.detection.enabledWhen ? signalIds(f.detection.enabledWhen) : []),
  ] : []));
}
