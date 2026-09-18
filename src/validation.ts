import { applyStates } from "./presets";
import { pipeEngineeringDisabled, setCachedPipes } from "./geometry";
import type { Diagram, ValidationCase } from "./types";

export interface ValidationFailure {
  pipeId: string;
  expected: "flow" | "stop";
  actual: "flow" | "stop" | "missing";
  label: string;
}

export interface ValidationResult {
  caseId: string;
  name: string;
  passed: boolean;
  checked: number;
  failures: ValidationFailure[];
  status: "PASS" | "FAIL" | "INVALID";
  issues: string[];
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
  const check = (pipeId: string, expected: "flow" | "stop") => {
    const pipe = draft.pipes.find((p) => p.id === pipeId);
    if (!pipe) {
      issues.push(`INVALID_REFERENCE: ${pipeId}`);
      failures.push({ pipeId, expected, actual: "missing", label: pipeId });
      return;
    }
    const actual = pipeEngineeringDisabled(pipe, draft.nodes) ? "stop" : "flow";
    if (actual !== expected) failures.push({ pipeId, expected, actual, label: pipe.label || pipeId });
  };
  for (const pipeId of validationCase.mustFlowPipeIds) check(pipeId, "flow");
  for (const pipeId of validationCase.mustStopPipeIds) check(pipeId, "stop");
  // Restore the global legacy cache to the caller's drawing after evaluating the cloned state.
  setCachedPipes(diagram.pipes, diagram.nodes);
  const status = issues.length ? "INVALID" : failures.length ? "FAIL" : "PASS";
  return { caseId: validationCase.id, name: validationCase.name, passed: status === "PASS", status, issues, checked: flow.length + stop.length, failures };
}

export function runValidationCases(diagram: Diagram): ValidationResult[] {
  return (diagram.settings.validationCases ?? []).map((c) => runValidationCase(diagram, c));
}
