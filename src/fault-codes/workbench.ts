/**
 * 故障工作台的前置状态（纯函数，1.47.0）。
 *
 * 四个前置条件的组合决定"用户现在该干嘛"：
 *   no-diagram : 没有图纸 → 先打开/生成/载入示例
 *   no-library : 有图纸但没有故障码/知识库 → 导入/示例/新建
 *   unbound    : 有库但没有任何代码能定位到画布 → 绑定向导
 *   ready      : 至少一个代码有可解析的排查范围 → 演练
 */
import type { Diagram } from "../types";
import type { DiagnosticProfile } from "./types";
import { resolveFaultTargets } from "./profile";

export type FaultStage = "no-diagram" | "no-library" | "unbound" | "ready";

export interface FaultWorkbenchStatus {
  stage: FaultStage;
  hasDiagram: boolean;
  hasLibrary: boolean;
  codeCount: number;
  symptomCount: number;
  groupCount: number;
  boundGroupCount: number;
  unboundGroupCount: number;
  /** 有代码但排查范围在画布上解析不到对象。 */
  codesWithoutScope: number;
  readyCodes: number;
  /** 至少有一个代码配置了可执行的故障演练。 */
  drillCount: number;
}

export function faultWorkbenchStatus(diagram: Diagram, profile: DiagnosticProfile): FaultWorkbenchStatus {
  const hasDiagram = diagram.nodes.length > 0 || diagram.pipes.length > 0;
  const codeCount = profile.diagnostics.length;
  const symptomCount = profile.symptoms?.length ?? 0;
  const hasLibrary = codeCount > 0 || symptomCount > 0;
  const groups = profile.highlightGroups;
  const boundGroupCount = groups.filter(group => group.nodeIds.length + group.pipeIds.length > 0).length;
  const unboundGroupCount = groups.length - boundGroupCount;
  let codesWithoutScope = 0;
  let drillCount = 0;
  for (const fault of profile.diagnostics) {
    if (fault.drill) drillCount += 1;
    const targets = resolveFaultTargets(diagram, profile, fault);
    if (targets.nodes.length + targets.pipes.length === 0) codesWithoutScope += 1;
  }
  const readyCodes = codeCount - codesWithoutScope;
  const stage: FaultStage = !hasDiagram
    ? "no-diagram"
    : !hasLibrary
      ? "no-library"
      : readyCodes === 0
        ? "unbound"
        : "ready";
  return {
    stage, hasDiagram, hasLibrary, codeCount, symptomCount,
    groupCount: groups.length, boundGroupCount, unboundGroupCount,
    codesWithoutScope, readyCodes, drillCount,
  };
}
