import type { Diagram } from "../types";
import { faultWorkbenchStatus } from "./workbench";
import { resolveFaultTargets } from "./profile";
import type { DiagnosticProfile, FaultCode } from "./types";

export type FaultJourneyKind = "needs-diagram" | "needs-library" | "needs-binding" | "bind-more" | "bind-done" | "drill-or-bind" | "select-code" | "drill-ready" | "drill-live" | "no-drill-config" | "no-scope";

export interface FaultJourney {
  kind: FaultJourneyKind;
  step: 1 | 2 | 3 | 4;
  detail: { zh: string; en: string };
  cta: { zh: string; en: string };
  codeId?: string;
  code?: string;
  groups?: string[];
  remaining?: number;
}

/** 已绑定且能定位的代码；优先带演练配置的。 */
export function runnableCodes(diagram: Diagram, profile: DiagnosticProfile): FaultCode[] {
  return profile.diagnostics
    .filter(code => {
      const targets = resolveFaultTargets(diagram, profile, code);
      return targets.nodes.length + targets.pipes.length > 0;
    })
    .sort((a, b) => Number(!!b.drill?.actions?.length) - Number(!!a.drill?.actions?.length));
}

export function firstRunnableCode(diagram: Diagram, profile: DiagnosticProfile): FaultCode | null {
  return runnableCodes(diagram, profile)[0] ?? null;
}

/** 代码引用到的部件组（用于"绑定此代码范围"）。 */
export function codePartGroups(profile: DiagnosticProfile, code: FaultCode): string[] {
  const ids = new Set<string>();
  for (const binding of code.highlightBindings) {
    if (profile.highlightGroups.some(group => group.id === binding.groupId)) ids.add(binding.groupId);
  }
  if (!ids.size && code.highlightBindings.length === 0) {
    // 无显式范围：退化为所有未绑定组，交给向导全量处理。
    return [];
  }
  return [...ids];
}

/**
 * 1.50.0：给故障模式一个"永远知道下一步"的单一事实来源。
 * 只做判断，不碰 store；UI 负责执行 action。
 */
export function deriveFaultJourney(
  diagram: Diagram,
  profile: DiagnosticProfile,
  options: { step?: number; selectedCodeId?: string; drillActive?: boolean } = {},
): FaultJourney {
  const status = faultWorkbenchStatus(diagram, profile);
  const selected = profile.diagnostics.find(code => code.id === options.selectedCodeId);

  if (!status.hasDiagram) {
    return { kind: "needs-diagram", step: 1, detail: { zh: "故障模式需要一张图纸，才能把故障定位到具体水路。", en: "Fault mode needs a drawing before codes can point at real water paths." }, cta: { zh: "去准备图纸", en: "Prepare a drawing" } };
  }
  if (!status.hasLibrary) {
    return { kind: "needs-library", step: 2, detail: { zh: "还没有故障库：导入现成的、加载示例，或新建一个故障码。", en: "No fault library yet: import one, load the sample, or create a code." }, cta: { zh: "去故障库", en: "Go to fault library" } };
  }
  if (options.drillActive) {
    return {
      kind: "drill-live", step: 4,
      detail: { zh: "演练进行中：红虚线是新增停流，绿虚线是恢复流动。看完了就还原，回到演练前状态。", en: "Drill running: red dashed paths are newly stopped, green are restored. Restore when done to return to the pre-drill state." },
      cta: { zh: "还原演练", en: "Restore drill" },
      code: selected?.code,
      codeId: selected?.id,
    };
  }
  if (selected) {
    const selectedTargets = resolveFaultTargets(diagram, profile, selected);
    if (selectedTargets.nodes.length + selectedTargets.pipes.length === 0) {
      return {
        kind: "no-scope", step: 3,
        detail: { zh: `${selected.code} 还没有画布落点，选中时不会高亮。先绑定它引用的部件组。`, en: `${selected.code} has no canvas scope yet, so it will not highlight. Bind the part groups it references.` },
        cta: { zh: "绑定此代码的范围", en: "Bind this code's scope" },
        codeId: selected.id, code: selected.code, groups: codePartGroups(profile, selected),
      };
    }
  }
  // 用户正停在"画布落点"步骤时，下一步优先是"继续绑定/绑完去演练"，避免被已选代码带跑。
  if (options.step === 3 && status.stage === "ready" && status.unboundGroupCount > 0) {
    return {
      kind: "bind-more", step: 3,
      detail: { zh: `已可演练 ${status.readyCodes} 个代码；还剩 ${status.unboundGroupCount} 个部件组未绑定。继续绑定不会影响已可用代码，绑完后所有代码都能定位。`, en: `${status.readyCodes} codes are already drillable; ${status.unboundGroupCount} part groups remain unbound. Continuing does not affect working codes, and when done every code can locate objects.` },
      cta: { zh: `继续绑定（${status.unboundGroupCount}）`, en: `Continue binding (${status.unboundGroupCount})` },
      remaining: status.unboundGroupCount,
    };
  }
  if (options.step === 3 && status.unboundGroupCount === 0) {
    const first = firstRunnableCode(diagram, profile);
    return {
      kind: "bind-done", step: 4,
      detail: { zh: "全部部件组已绑定。下一步：去④演练，选代码 → 演练故障 → 看差异 → 还原。", en: "All part groups are bound. Next: go to step 4, pick a code, drill it, review the difference, then restore." },
      cta: first ? { zh: `去演练 ${first.code}`, en: `Go drill ${first.code}` } : { zh: "去演练", en: "Go to drill" },
      codeId: first?.id, code: first?.code,
    };
  }
  if (status.stage === "unbound") {
    const scopeCandidate = profile.diagnostics.find(code => codePartGroups(profile, code).length > 0);
    const groups = scopeCandidate ? codePartGroups(profile, scopeCandidate) : [];
    return {
      kind: "needs-binding", step: 3,
      detail: { zh: `先绑定部件组：把知识库里的部件落到本图元件/管路，代码才能在画布高亮和演练。当前可定位代码 ${status.readyCodes}/${status.codeCount}。`, en: `Bind part groups first: map library parts onto this drawing so codes can highlight and drill. Codes with scope: ${status.readyCodes}/${status.codeCount}.` },
      cta: { zh: "绑定第一个部件组", en: "Bind the first part group" },
      groups: groups.length ? groups : undefined,
    };
  }

  if (!selected) {
    const first = firstRunnableCode(diagram, profile);
    if (status.unboundGroupCount > 0) {
      return {
        kind: "drill-or-bind", step: 4,
        detail: { zh: `已有 ${status.readyCodes} 个代码能定位，可以先演练；剩余 ${status.unboundGroupCount} 个部件组不阻塞演练，之后可回第③步补全。`, en: `${status.readyCodes} codes already have scope and can be drilled now; ${status.unboundGroupCount} unbound part groups do not block drilling and can be finished later in step 3.` },
        cta: { zh: `演练 ${first?.code ?? ""}`, en: `Drill ${first?.code ?? ""}` },
        codeId: first?.id, code: first?.code,
      };
    }
    return {
      kind: "select-code", step: 4,
      detail: { zh: "部件组已全部绑定。下一步：从左侧选一个代码，点「演练故障」看会新增哪些停流/恢复流动。", en: "All part groups are bound. Next: pick a code on the left and drill it to see newly stopped or restored flow." },
      cta: first ? { zh: `选中 ${first.code}`, en: `Select ${first.code}` } : { zh: "去演练", en: "Go to drill" },
      codeId: first?.id, code: first?.code,
    };
  }

  if (!selected.drill?.actions?.length) {
    return {
      kind: "no-drill-config", step: 4,
      detail: { zh: `${selected.code} 已有落点，但还没有演练配置。在「故障演练配置」里添加注入动作，就能模拟这个故障。`, en: `${selected.code} has scope but no drill yet. Add injection actions under Fault drill configuration to simulate it.` },
      cta: { zh: "去配置演练", en: "Configure drill" },
      codeId: selected.id, code: selected.code,
    };
  }
  return {
    kind: "drill-ready", step: 4,
    detail: { zh: `${selected.code} 已就绪：点「演练故障」会在画布临时注入故障状态，显示新增停流/恢复流动差异，可一键还原。`, en: `${selected.code} is ready: drill it to inject the fault state and see newly stopped or restored paths, then restore in one click.` },
    cta: { zh: "演练故障", en: "Drill fault" },
    codeId: selected.id, code: selected.code,
  };
}
