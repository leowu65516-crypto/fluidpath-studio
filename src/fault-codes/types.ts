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

/** 0.4+：演练注入动作（按部件组表达，运行时解析到已绑定的元件/管路）。 */
export const DRILL_BEHAVIORS = ["stopped", "running", "stuckClosed", "stuckOpen", "disabled", "enabled"] as const;
export type DrillBehavior = typeof DRILL_BEHAVIORS[number];
export interface DrillAction {
  /** 引用 highlightGroups（部件组）——用组而不是 nodeId，知识库才能跨图纸复用。 */
  groupId: string;
  behavior: DrillBehavior;
}
/**
 * 0.4+：故障演练——"把这个故障演出来"所需的最小声明。
 * 只声明基线工况与注入行为；停流传播、差异集合由引擎和 Studio 负责，不写死结果。
 */
export interface FaultDrill {
  /** 基线工况名（引用 settings.workConditions）；缺省则在当前状态上直接注入。 */
  conditionName?: string;
  /** 一句话说明（双语）。 */
  note?: LocalizedText;
  actions?: DrillAction[];
}
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
  /** 0.4+：故障演练配置（可选）。 */
  drill?: FaultDrill;
  controlActions: never[];
  rootCauseStatus: "notDetermined";
}

/** 0.3+：一条可见症状（奶温偏高/不出奶…），按观察维度分组。 */
export interface Symptom {
  id: string;
  label: LocalizedText;
  group?: LocalizedText;
}

/**
 * 0.3+：部件 × 症状的责任条目（诊断矩阵的单元格）。
 * pr: 3=高概率首要排查 2=次要常规 1=罕见需排除；own: 处置归属（门店/服务商/先排查后报修）。
 * partGroupId 引用 highlightGroups（部件组），codes 引用 diagnostics[].code。
 */
export interface Cause {
  id: string;
  partGroupId: string;
  symptomId: string;
  pr: 1 | 2 | 3;
  own: "store" | "svc" | "both";
  codes: string[];
  why: LocalizedText;
  act: LocalizedText;
  /** 手册章节/页码溯源（可选） */
  ref?: string;
}

/** 0.3+：部件排查要点——无论该部件是否为嫌疑，都给出的检查内容。 */
export interface CheckGuide {
  groupId: string;
  text: LocalizedText;
}

/** 0.3+：知识库身份与溯源。kbVersion 随手册/知识库修订递增，与图纸更新节奏解耦。 */
export interface KbMeta {
  kbVersion: number;
  source: LocalizedText;
  updatedAt: string;
}

export interface DiagnosticProfile {
  format: "fluidpath.diagnostic-profile";
  version: "0.1-draft" | "0.2-draft" | "0.3-draft" | "0.4-draft";
  namespace: string;
  source: { kind: "userDeclared" | "illustrative"; appliesToRealMachine: boolean };
  diagramBinding?: { sourceFile: string; sourceSha256: string };
  signalDefinitions: SignalDefinition[];
  highlightGroups: HighlightGroup[];
  diagnostics: FaultCode[];
  /** 0.3+：故障知识库扩展（症状→原因→对策的 consult 层）。 */
  kb?: KbMeta;
  symptoms?: Symptom[];
  causes?: Cause[];
  checkGuides?: CheckGuide[];
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
