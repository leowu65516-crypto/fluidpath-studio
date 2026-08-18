import { applyStates } from "./presets";
import { pipeEngineeringDisabled, setCachedPipes } from "./geometry";
import type { Diagram, ValidationCase } from "./types";

export interface ValidationFailure {
  pipeId: string;
  expected: "flow" | "stop";
  actual: "flow" | "stop";
  label: string;
}

export interface ValidationResult {
  caseId: string;
  name: string;
  passed: boolean;
  checked: number;
  failures: ValidationFailure[];
}

/** 在副本中执行验收案例，绝不改变用户当前画布和工况。 */
export function runValidationCase(diagram: Diagram, validationCase: ValidationCase): ValidationResult {
  const draft = structuredClone(diagram);
  applyStates(draft, validationCase.state);
  setCachedPipes(draft.pipes, draft.nodes);
  const failures: ValidationFailure[] = [];
  const check = (pipeId: string, expected: "flow" | "stop") => {
    const pipe = draft.pipes.find((p) => p.id === pipeId);
    if (!pipe) {
      failures.push({ pipeId, expected, actual: "stop", label: `缺失管路 ${pipeId}` });
      return;
    }
    const actual = pipeEngineeringDisabled(pipe, draft.nodes) ? "stop" : "flow";
    if (actual !== expected) failures.push({ pipeId, expected, actual, label: pipe.label || pipeId });
  };
  for (const pipeId of validationCase.mustFlowPipeIds) check(pipeId, "flow");
  for (const pipeId of validationCase.mustStopPipeIds) check(pipeId, "stop");
  return { caseId: validationCase.id, name: validationCase.name, passed: failures.length === 0, checked: validationCase.mustFlowPipeIds.length + validationCase.mustStopPipeIds.length, failures };
}

export function runValidationCases(diagram: Diagram): ValidationResult[] {
  return (diagram.settings.validationCases ?? []).map((c) => runValidationCase(diagram, c));
}
