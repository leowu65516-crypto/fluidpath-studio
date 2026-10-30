import { useMemo } from "react";
import { useAppState, focusRectAnimated } from "../store";
import { nodeBBox, pipePolyline, polylineBBox } from "../geometry";
import { useT } from "../i18n";
import { bindKbGroupSelection, bindKbGroupTargets } from "../fault-codes/actions";
import { resolveHighlightGroupTargets } from "../fault-codes/profile";
import { suspectsForSymptom, partGroupOf, dominantOwn } from "../fault-codes/consult";
import { unboundGroups, suggestGroupTargets } from "../fault-codes/binding";
import { useDiagnosticSession, selectKbSymptom, selectKbPart, selectFaultCodes } from "../fault-codes/session";
import type { Cause, DiagnosticProfile } from "../fault-codes/types";

const PR_META: Record<3 | 2 | 1, { dot: string; zh: string; en: string }> = {
  3: { dot: "●", zh: "首要排查", en: "Primary" },
  2: { dot: "○", zh: "次要排查", en: "Secondary" },
  1: { dot: "◦", zh: "罕见排除", en: "Rare" },
};
const OWN_TEXT: Record<Cause["own"], { zh: string; en: string }> = {
  store: { zh: "门店可处理", en: "Store-fixable" },
  svc: { zh: "服务商处理", en: "Service call" },
  both: { zh: "门店先排查 → 报修", en: "Store first → ticket" },
};

/**
 * 0.3 知识库咨询台：症状 → 嫌疑分档 → 诊断详情，与故障码列表三向联动。
 * 纯显示/选择语义：不改泵阀、不改工程判定；部件组绑定是唯一的写入口。
 * 1.46.0：部件组绑定工作台（未绑定清单/名称建议/绑定后自动跳下一个）、无库时引导。
 */
export function KbConsultPanel({ profile, canEdit, onError, onImport, onLoadSample }: {
  profile: DiagnosticProfile;
  canEdit: boolean;
  onError: (message: string) => void;
  onImport: () => void;
  onLoadSample: () => void;
}) {
  const { diagram, ui } = useAppState();
  const session = useDiagnosticSession();
  const { t, lang } = useT();
  const L = (pair: { zh?: string; en?: string }) => (lang === "en" ? pair.en || pair.zh || "" : pair.zh || pair.en || "");

  const symptoms = profile.symptoms ?? [];
  const groups = profile.highlightGroups;
  const unbound = useMemo(() => unboundGroups(profile), [profile]);
  const boundCount = groups.length - unbound.length;
  const suspects = useMemo(() => session.kbSymptomId ? suspectsForSymptom(profile, session.kbSymptomId) : [], [profile, session.kbSymptomId]);
  const chipCounts = useMemo(() => new Map(symptoms.map(s => [s.id, suspectsForSymptom(profile, s.id).length])), [profile, symptoms]);
  const activeSymptom = symptoms.find(s => s.id === session.kbSymptomId);
  const activeGroup = session.kbPartGroupId ? partGroupOf(profile, session.kbPartGroupId) : undefined;
  const activeCauses = useMemo(() => activeGroup
    ? (profile.causes ?? []).filter(c => c.partGroupId === activeGroup.id && (!session.kbSymptomId || c.symptomId === session.kbSymptomId))
    : [], [profile, activeGroup, session.kbSymptomId]);
  const activeGuide = useMemo(() => (profile.checkGuides ?? []).find(g => g.groupId === activeGroup?.id), [profile, activeGroup]);
  const activeTargets = activeGroup ? resolveHighlightGroupTargets(diagram, profile, activeGroup.id) : null;
  const primary = suspects[0];
  const primaryGroup = primary ? partGroupOf(profile, primary.groupId) : undefined;
  const primaryCodes = primary ? [...new Set(primary.causes.flatMap(c => c.codes))] : [];
  const activeBound = !!activeGroup && (activeGroup.nodeIds.length > 0 || activeGroup.pipeIds.length > 0);
  const suggestions = activeGroup && !activeBound ? suggestGroupTargets(diagram, activeGroup) : null;
  const suggestedCount = suggestions ? suggestions.nodes.length + suggestions.pipes.length : 0;
  const nextUnbound = activeGroup ? unbound.find(g => g.id !== activeGroup.id) : unbound[0];

  if (!symptoms.length) return <section className="fault-card kb-consult kb-empty" data-kb-empty="1" aria-label={t("故障知识库")}>
    <div className="fault-section-title">
      <strong>{t("故障知识库")}</strong>
      <span className="fault-badge">{profile.version}</span>
    </div>
    <p className="fault-hint">{t("当前图纸未加载 0.3 故障知识库（症状/原因/排查要点）。可导入 .fluidkb.json，或先用示例奶泵知识库试用。")}</p>
    <div className="fault-actions">
      <button className="btn" disabled={!canEdit} onClick={onLoadSample}>{t("加载示例知识库")}</button>
      <button className="btn ghost" disabled={!canEdit} onClick={onImport}>{t("导入知识库")}</button>
    </div>
  </section>;

  const grouped = new Map<string, typeof symptoms>();
  for (const s of symptoms) {
    const key = s.group ? L(s.group) : "";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(s);
  }
  function pickSymptom(id: string) { selectKbSymptom(session.kbSymptomId === id ? null : id); }

  function focusGroup(groupId: string) {
    const targets = resolveHighlightGroupTargets(diagram, profile, groupId);
    const boxes = [
      ...diagram.nodes.filter(n => targets.nodes.includes(n.id)).map(nodeBBox),
      ...diagram.pipes.filter(p => targets.pipes.includes(p.id)).flatMap(p => { const pts = pipePolyline(p, diagram.nodes); return pts ? [polylineBBox(pts)] : []; }),
    ];
    if (!boxes.length) return;
    const left = Math.min(...boxes.map(b => b.x)), top = Math.min(...boxes.map(b => b.y));
    const right = Math.max(...boxes.map(b => b.x + b.w)), bottom = Math.max(...boxes.map(b => b.y + b.h));
    focusRectAnimated(left, top, right, bottom, [...targets.nodes, ...targets.pipes]);
  }

  function advanceAfterBind() {
    if (nextUnbound) selectKbPart(nextUnbound.id);
  }
  function bindSelectionWith(groupId: string, mode: "replace" | "add" | "remove") {
    try {
      bindKbGroupSelection(groupId, mode);
      if (mode !== "remove") advanceAfterBind();
    } catch (error) { onError((error as Error).message); }
  }
  function applySuggestion(groupId: string) {
    if (!suggestions) return;
    try {
      bindKbGroupTargets(groupId, suggestions);
      advanceAfterBind();
    } catch (error) { onError((error as Error).message); }
  }

  return <section className="fault-card kb-consult" data-kb-consult={profile.kb?.kbVersion ?? ""} aria-label={t("诊断咨询")}>
    <div className="fault-section-title">
      <strong>{t("诊断咨询")}</strong>
      <span className="fault-badge">{profile.kb ? `KB v${profile.kb.kbVersion}` : t("未标注 KB 版本")}</span>
    </div>
    <p className="fault-hint">{t("选择症状查看嫌疑部件分级；点部件看对策与处置归属；点故障码反查。")}</p>

    <div className="kb-symptom-groups">
      {[...grouped.entries()].map(([group, list]) => <div key={group || "other"} className="kb-symptom-group">
        {group && <div className="kb-group-label">{group}</div>}
        <div className="kb-chip-row">
          {list.map(s => {
            const count = chipCounts.get(s.id) ?? 0;
            return <button key={s.id}
              className={`kb-chip${session.kbSymptomId === s.id ? " on" : ""}`}
              aria-pressed={session.kbSymptomId === s.id}
              aria-label={`${L(s.label)} (${count})`}
              onClick={() => pickSymptom(s.id)}
              title={L(s.label)}
            >{L(s.label)}<span className="kb-chip-n">{count}</span></button>;
          })}
        </div>
      </div>)}
    </div>

    {activeSymptom && suspects.length > 0 && <div className="kb-suspect-list" data-testid="kb-suspects">
      {suspects.map(({ groupId, pr, causes }) => {
        const group = partGroupOf(profile, groupId);
        const meta = PR_META[pr];
        const own = dominantOwn(causes);
        return <div key={groupId} className={`kb-suspect${session.kbPartGroupId === groupId ? " on" : ""} pr${pr}`}>
          <button className="kb-suspect-head" onClick={() => selectKbPart(session.kbPartGroupId === groupId ? null : groupId)}>
            <span className={`kb-pr p${pr}`}>{meta.dot}</span>
            <span className="kb-suspect-name">{group ? L(group.label) : groupId}</span>
            <span className="kb-own">{t(OWN_TEXT[own].zh)}</span>
          </button>
          <div className="kb-suspect-codes">
            {[...new Set(causes.flatMap(c => c.codes))].map(code => {
              const fault = profile.diagnostics.find(f => f.code === code);
              if (!fault) return null;
              return <button key={code} className="kb-code" title={L(fault.label)}
                onClick={() => { selectFaultCodes([fault.id]); selectKbPart(groupId); }}
              >{code}</button>;
            })}
          </div>
        </div>;
      })}
    </div>}

    <details className="kb-bind-box" open={unbound.length > 0}>
      <summary>
        <b>{t("部件组绑定")}</b>
        <span>{t("已绑定")} {boundCount} / {groups.length}</span>
        {unbound.length > 0 && <span className="kb-bind-warn">{t("未绑定")} {unbound.length}</span>}
      </summary>
      <p className="fault-hint">{t("先在画布选中元件/管路，再点「替换绑定」；绑定成功后会自动跳到下一个未绑定组。")}</p>
      {unbound.length === 0
        ? <p className="fault-hint">{t("全部部件组已绑定。")}</p>
        : <div className="kb-unbound-list">
          {unbound.map(group => <button key={group.id}
            className={`kb-unbound${session.kbPartGroupId === group.id ? " on" : ""}`}
            onClick={() => selectKbPart(group.id)}
          >{L(group.label)}</button>)}
        </div>}
    </details>

    {activeGroup && <div className="kb-detail" data-testid="kb-detail">
      <div className="fault-section-title">
        <strong>{L(activeGroup.label)}</strong>
        <span className="kb-bind-state">{activeBound
          ? `${t("已绑定")} ${activeGroup.nodeIds.length}+${activeGroup.pipeIds.length}`
          : t("未绑定画布对象")}</span>
      </div>
      {activeGuide && <div className="kb-guide"><b>{t("排查要点")}</b><p>{L(activeGuide.text)}</p></div>}
      {activeCauses.length === 0 && <p className="fault-hint">{t("该部件在当前症状下不是首要怀疑对象；可点其他症状或直接查看其排查要点。")}</p>}
      {activeCauses.map(cause => <div key={cause.id} className="kb-cause">
        <div className="kb-cause-tags">
          <span className={`kb-tag own-${cause.own}`}>{t(OWN_TEXT[cause.own].zh)}</span>
          <span className="kb-tag">{t(PR_META[cause.pr].zh)}</span>
          {cause.codes.map(c => <span key={c} className="kb-tag code">{c}</span>)}
          {cause.ref && <span className="kb-tag ref" title={t("手册溯源")}>{cause.ref}</span>}
        </div>
        <div className="kb-why"><b>{t("为什么")}</b><p>{L(cause.why)}</p></div>
        <div className="kb-act"><b>{t("对策")}</b><p>{L(cause.act)}</p></div>
      </div>)}
      {!activeBound && suggestedCount > 0 && <div className="kb-suggest">
        <button className="btn mini" disabled={!canEdit} onClick={() => applySuggestion(activeGroup.id)}>
          {t("采用名称建议")} ({suggestedCount})
        </button>
        <span className="fault-hint">{t("按部件名匹配，可再用追加/移除微调")}</span>
      </div>}
      <div className="fault-actions">
        <button className="btn mini" disabled={!activeTargets || activeTargets.nodes.length + activeTargets.pipes.length === 0}
          onClick={() => focusGroup(activeGroup.id)}>{t("定位部件")}</button>
        {(["replace", "add", "remove"] as const).map(mode => <button key={mode} className="btn mini"
          disabled={!canEdit || (ui.selection.nodes.length + ui.selection.pipes.length === 0)}
          title={t("把当前画布选择绑定为该部件在本图中的落点")}
          onClick={() => bindSelectionWith(activeGroup.id, mode)}
        >{t(["替换绑定", "追加绑定", "移除绑定"][mode === "replace" ? 0 : mode === "add" ? 1 : 2])}</button>)}
      </div>
      {!nextUnbound && !activeBound && <small className="kb-source">{t("这是最后一个未绑定部件组；绑定后即全部完成。")}</small>}
    </div>}

    <div className="kb-statusbar" data-testid="kb-status" role="status">
      <span className="kb-stat" title={activeSymptom ? L(activeSymptom.label) : t("无")}><i>{t("当前症状")}</i><b>{activeSymptom ? L(activeSymptom.label) : t("无")}</b></span>
      <span className="kb-stat" title={primaryGroup ? L(primaryGroup.label) : t("无")}><i>{t("该症状首要怀疑")}</i><b>{primaryGroup ? L(primaryGroup.label) : t("无")}</b></span>
      <span className="kb-stat"><i>{t("处置归属")}</i><b>{primary ? t(OWN_TEXT[dominantOwn(primary.causes)].zh) : t("无")}</b></span>
      <span className="kb-stat" title={primaryCodes.join(" ") || t("无")}><i>{t("关联报警码")}</i><b>{primaryCodes.join(" ") || t("无")}</b></span>
    </div>
    {profile.kb && <small className="kb-source">{t("依据")}{lang === "zh" ? "：" : ": "}{L(profile.kb.source)} · v{profile.kb.kbVersion}</small>}
  </section>;
}
