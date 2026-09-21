/** Versioned, optional module on legacy diagrams. This is not diagram schema v4. */
export type LocalizedText = { zh: string; en: string };
export type SignalValue = number | boolean | string;
export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { signal: string; op: "lt" | "lte" | "gt" | "gte" | "eq" | "ne"; value: SignalValue; unit?: string };
export interface SignalDefinition {
  id: string;
  label: LocalizedText;
  dataType: "number" | "boolean" | "enum";
  quantity?: string;
  unit?: string;
  values?: string[];
  trueMeans?: string;
  origin: "manualScenario" | "simulatedModel" | "replay" | "external";
  binding?: { nodeId: string; purpose: "displayAnchor" };
  maxAgeMs: number;
}
export interface DetectionRule {
  clock: "simulation";
  enabledWhen?: Condition;
  graceMs: number;
  trigger: { condition: Condition; continuousMs: number };
  recovery: { condition: Condition; continuousMs: number };
  onUnknown: "breakContinuityAndRetainActiveAlarm";
  latching: boolean;
  resetPolicy: "manualAfterRecovery" | "automaticAfterRecovery";
}
export interface HighlightGroup {
  id: string;
  label: LocalizedText;
  resolution: "explicit";
  nodeIds: string[];
  pipeIds: string[];
}
export type FaultHighlightAnimation = "none" | "breathe" | "flash";
/**
 * A user-authored investigation checkpoint. It may describe a pipe/component
 * scope, signal evidence, or both. It never drives the simulated machine.
 */
export interface TroubleshootingStep {
  id: string;
  label: LocalizedText;
  instruction?: LocalizedText;
  sensorIds: string[];
  sensorNote?: LocalizedText;
  highlightBinding?: { groupId: string };
  presentation?: { color: string; animation: FaultHighlightAnimation };
}
export interface FaultCode {
  id: string;
  code: string;
  label: LocalizedText;
  description?: LocalizedText;
  definitionStatus: "userDeclared" | "illustrative";
  detection?: DetectionRule;
  highlightBindings: { groupId: string; meaning: "inspectionScope" | "observedAt" | "affectedCircuit" }[];
  presentation: { style: "outline"; color: string; animation: FaultHighlightAnimation };
  /** Ordered, configurable checks used by Fault mode. */
  troubleshooting?: TroubleshootingStep[];
  controlActions: never[];
  rootCauseStatus: "notDetermined";
}
export interface DiagnosticProfile {
  format: "fluidpath.diagnostic-profile";
  version: "0.1-draft" | "0.2-draft";
  namespace: string;
  source: { kind: "userDeclared" | "illustrative"; appliesToRealMachine: boolean };
  diagramBinding?: { sourceFile: string; sourceSha256: string };
  signalDefinitions: SignalDefinition[];
  highlightGroups: HighlightGroup[];
  diagnostics: FaultCode[];
}
export interface Observation {
  value: SignalValue;
  atMs: number;
  quality: "good" | "missing" | "stale" | "invalid";
  unit?: string;
}
export type DetectionStatus = "notApplicable" | "normal" | "pending" | "triggered" | "unknown" | "invalid";
export interface FaultRuntime {
  detectionStatus: DetectionStatus;
  alarmState: "clear" | "active" | "recoveredAwaitingReset";
  acknowledged: boolean;
  eligibleSince?: number;
  triggerSince?: number;
  recoverySince?: number;
  triggeredAt?: number;
  recoveredAt?: number;
  lastAt?: number;
  /** Latest instant through which all required observations were valid. */
  validThrough?: number;
  reason?: string;
}
