import { applyStates } from "./presets";
import { findPort, pipeEngineeringDisabled, setCachedPipes } from "./geometry";
import { CURRENT_DIAGRAM_SCHEMA_VERSION } from "./export";
import { APP_VERSION } from "./version";
import type { Diagram, ValidationCase } from "./types";

export const VALIDATION_ENGINE_VERSION = "flow-engine/1";
export const VALIDATION_RULE_VERSION = "validation/2";
export type ValidationStatus = "PASS" | "FAIL" | "INVALID" | "UNKNOWN" | "NOT_RUN";
export type ValidationConfidence = "complete" | "partial";

export interface ValidationBinding {
  diagramId: string;
  schemaVersion: number;
  appVersion: string;
  engineVersion: string;
  ruleVersion: string;
}

export interface ValidationFailure {
  pipeId: string;
  expected: "flow" | "stop";
  actual: "flow" | "stop" | "missing" | "unknown";
  label: string;
  reason?: string;
}

export interface ValidationResult {
  caseId: string;
  name: string;
  passed: boolean;
  checked: number;
  failures: ValidationFailure[];
  status: ValidationStatus;
  confidence: ValidationConfidence;
  binding: ValidationBinding;
  issues: string[];
}

function bindingFor(diagram: Diagram): ValidationBinding {
  return {
    diagramId: diagram.id,
    schemaVersion: CURRENT_DIAGRAM_SCHEMA_VERSION,
    appVersion: APP_VERSION,
    engineVersion: VALIDATION_ENGINE_VERSION,
    ruleVersion: VALIDATION_RULE_VERSION,
  };
}

export function createNotRunValidationResult(diagram: Diagram, validationCase: ValidationCase, reason = "NOT_RUN"): ValidationResult {
  return {
    caseId: validationCase.id,
    name: validationCase.name,
    passed: false,
    checked: 0,
    failures: [],
    status: "NOT_RUN",
    confidence: "partial",
    binding: bindingFor(diagram),
    issues: [reason],
  };
}

/** 在副本中执行验收案例，绝不改变用户当前画布和工况。 */
export function runValidationCase(diagram: Diagram, validationCase: ValidationCase): ValidationResult {
  const draft = structuredClone(diagram);
  const issues: string[] = [];
  const flow = validationCase.mustFlowPipeIds, stop = validationCase.mustStopPipeIds;
  if (!flow.length && !stop.length) issues.push("EMPTY_ASSERTIONS");
  if (flow.some(id => stop.includes(id))) issues.push("CONFLICTING_ASSERTIONS");
  if (new Set([...flow, ...stop]).size !== flow.length + stop.length) issues.push("DUPLICATE_ASSERTIONS");
  for (const [id, state] of Object.entries(validationCase.state)) {
    const node = draft.nodes.find(n => n.id === id);
    if (!node) { issues.push(`INVALID_STATE_REFERENCE: ${id}`); continue; }
    if (state.pumpOn !== undefined && (!["pump", "milkPump", "airPump"].includes(node.type) || typeof state.pumpOn !== "boolean")) issues.push(`INVALID_PUMP_STATE: ${id}`);
    if (state.valveState !== undefined && (!["solenoid2", "pulseAirValve"].includes(node.type) || !["open", "closed"].includes(state.valveState))) issues.push(`INVALID_VALVE_STATE: ${id}`);
    if (state.valvePath !== undefined && (node.type !== "solenoid3" || !["A", "B", "off"].includes(state.valvePath))) issues.push(`INVALID_VALVE_PATH: ${id}`);
  }
  applyStates(draft, validationCase.state);
  setCachedPipes(draft.pipes, draft.nodes);
  const failures: ValidationFailure[] = [];
  let unknownCount = 0;
  const check = (pipeId: string, expected: "flow" | "stop") => {
    const pipe = draft.pipes.find((p) => p.id === pipeId);
    if (!pipe) {
      issues.push(`INVALID_REFERENCE: ${pipeId}`);
      failures.push({ pipeId, expected, actual: "missing", label: pipeId });
      return;
    }
    const endpointUnknown = (pipe.fromPortId && !findPort(draft.nodes, pipe.fromPortId)) || (pipe.toPortId && !findPort(draft.nodes, pipe.toPortId));
    if (endpointUnknown) {
      issues.push(`UNKNOWN_TOPOLOGY: ${pipeId}`);
      unknownCount++;
      failures.push({ pipeId, expected, actual: "unknown", label: pipe.label || pipeId, reason: "端口引用存在但无法解析" });
      return;
    }
    const actual = pipeEngineeringDisabled(pipe, draft.nodes) ? "stop" : "flow";
    if (actual !== expected) failures.push({ pipeId, expected, actual, label: pipe.label || pipeId });
  };
  for (const pipeId of validationCase.mustFlowPipeIds) check(pipeId, "flow");
  for (const pipeId of validationCase.mustStopPipeIds) check(pipeId, "stop");
  // Restore the global legacy cache to the caller's drawing after evaluating the cloned state.
  setCachedPipes(diagram.pipes, diagram.nodes);
  const hasInvalid = issues.some((issue) => issue.startsWith("INVALID_") || issue.startsWith("EMPTY_") || issue.startsWith("CONFLICTING_") || issue.startsWith("DUPLICATE_"));
  const status: ValidationStatus = hasInvalid ? "INVALID" : unknownCount ? "UNKNOWN" : failures.length ? "FAIL" : "PASS";
  const confidence: ValidationConfidence = flow.length > 0 ? "complete" : "partial";
  if (!flow.length && stop.length) issues.push("NO_POSITIVE_FLOW_ASSERTION: 仅验证停流断言，不能证明整机工况正确");
  return { caseId: validationCase.id, name: validationCase.name, passed: status === "PASS", status, confidence, binding: bindingFor(diagram), issues, checked: flow.length + stop.length, failures };
}

export function runValidationCases(diagram: Diagram): ValidationResult[] {
  return (diagram.settings.validationCases ?? []).map((c) => runValidationCase(diagram, c));
}
