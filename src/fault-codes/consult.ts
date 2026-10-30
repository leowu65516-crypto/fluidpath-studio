/**
 * 故障知识库咨询层派生（纯函数）：
 * 症状 → 嫌疑部件分档（pr 3/2/1），故障码 → 部件+最强症状反查。
 * 只读 profile，不触碰工程状态——咨询是显示层语义。
 */
import type { Cause, DiagnosticProfile, HighlightGroup } from "./types";

export interface Suspect {
  groupId: string;
  pr: 3 | 2 | 1;
  causes: Cause[];
}

/** 某症状下的嫌疑部件，按 pr 降序、组内条目数降序稳定排序；同组多条合并取最高 pr。 */
export function suspectsForSymptom(profile: DiagnosticProfile, symptomId: string): Suspect[] {
  const byGroup = new Map<string, Suspect>();
  for (const cause of profile.causes ?? []) {
    if (cause.symptomId !== symptomId) continue;
    const existing = byGroup.get(cause.partGroupId);
    if (!existing) byGroup.set(cause.partGroupId, { groupId: cause.partGroupId, pr: cause.pr, causes: [cause] });
    else {
      existing.causes.push(cause);
      if (cause.pr > existing.pr) existing.pr = cause.pr;
    }
  }
  return [...byGroup.values()].sort((a, b) => b.pr - a.pr || b.causes.length - a.causes.length || a.groupId.localeCompare(b.groupId));
}

/** 故障码反查：引用该码的最高 pr 原因（部件+症状）；无原因条目时退化到码的 inspectionScope 绑定组。 */
export function strongestCauseForCode(profile: DiagnosticProfile, code: string): { groupId: string; symptomId: string | null } | null {
  const causes = (profile.causes ?? []).filter(c => c.codes.includes(code)).sort((a, b) => b.pr - a.pr);
  if (causes.length) return { groupId: causes[0].partGroupId, symptomId: causes[0].symptomId };
  const fault = profile.diagnostics.find(f => f.code === code);
  const binding = fault?.highlightBindings.find(b => b.meaning === "inspectionScope") ?? fault?.highlightBindings[0];
  return binding ? { groupId: binding.groupId, symptomId: null } : null;
}

export function partGroupOf(profile: DiagnosticProfile, groupId: string): HighlightGroup | undefined {
  return profile.highlightGroups.find(g => g.id === groupId);
}

/** 处置归属的稳定显示序：门店 → 先排查后报修 → 服务商。 */
export const OWN_ORDER: Record<Cause["own"], number> = { store: 0, both: 1, svc: 2 };
