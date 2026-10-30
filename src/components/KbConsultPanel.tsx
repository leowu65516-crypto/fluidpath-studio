import { useMemo } from "react";
import { useAppState, setUI } from "../store";
import { nodeBBox, pipePolyline, polylineBBox } from "../geometry";
import { useT } from "../i18n";
import { bindKbGroupSelection } from "../fault-codes/actions";
import { resolveHighlightGroupTargets } from "../fault-codes/profile";
import { suspectsForSymptom, partGroupOf, OWN_ORDER } from "../fault-codes/consult";
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

function focusGroup(diagram: Parameters<typeof resolveHighlightGroupTargets>[0], profile: DiagnosticProfile, groupId: string) {
  const targets = resolveHighlightGroupTargets(diagram, profile, groupId);
  const boxes = [
    ...diagram.nodes.filter(n => targets.nodes.includes(n.id)).map(nodeBBox),
    ...diagram.pipes.filter(p => targets.pipes.includes(p.id)).flatMap(p => { const pts = pipePolyline(p, diagram.nodes); return pts ? [polylineBBox(pts)] : []; }),
  ];
  if (!boxes.length) return;
  const left = Math.min(...boxes.map(b => b.x)), top = Math.min(...boxes.map(b => b.y));
  const right = Math.max(...boxes.map(b => b.x + b.w)), bottom = Math.max(...boxes.map(b => b.y + b.h));
  const svg = document.querySelector(".main-canvas"), w = svg?.clientWidth || 800, h = svg?.clientHeight || 600;
  const fit = Math.min(1.8, Math.max(0.2, Math.min(w / (right - left + 100), h / (bottom - top + 100))));
  setUI({ zoom: fit, panX: w / 2 - (left + right) / 2 * fit, panY: h / 2 - (top + bottom) / 2 * fit });
}

/**
 * 0.3 知识库咨询台：症状 → 嫌疑分档 → 诊断详情，与故障码列表三向联动。
 * 纯显示/选择语义：不改泵阀、不改工程判定；部件组绑定是唯一的写入口。
 */
export function KbConsultPanel({ profile, canEdit }: { profile: DiagnosticProfile; canEdit: boolean }) {
  const { diagram, ui } = useAppState();
  const session = useDiagnosticSession();
  const { t, lang } = useT();
  const L = (pair: { zh?: string; en?: string }) => (lang === "en" ? pair.en || pair.zh || "" : pair.zh || pair.en || "");

  const symptoms = profile.symptoms ?? [];
  const suspects = useMemo(() => session.kbSymptomId ? suspectsForSymptom(profile, session.kbSymptomId) : [], [profile, session.kbSymptomId]);
  const activeSymptom = symptoms.find(s => s.id === session.kbSymptomId);
  const activeGroup = session.kbPartGroupId ? partGroupOf(profile, session.kbPartGroupId) : undefined;
  const activeCauses = useMemo(() => activeGroup
    ? (profile.causes ?? []).filter(c => c.partGroupId === activeGroup.id && (!session.kbSymptomId || c.symptomId === session.kbSymptomId))
    : [], [profile, activeGroup, session.kbSymptomId]);
  const activeGuide = useMemo(() => (profile.checkGuides ?? []).find(g => g.groupId === activeGroup?.id), [profile, activeGroup]);
  const activeTargets = activeGroup ? resolveHighlightGroupTargets(diagram, profile, activeGroup.id) : null;
  const primary = suspects.find(s => s.pr === 3);

  if (!symptoms.length) return null;
  const grouped = new Map<string, typeof symptoms>();
  for (const s of symptoms) {
    const key = s.group ? L(s.group) : "";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(s);
  }

  function pickSymptom(id: string) { selectKbSymptom(session.kbSymptomId === id ? null : id); }

  return <section className="fault-card kb-consult" data-kb-consult={profile.kb?.kbVersion ?? ""} aria-label={t("诊断咨询")}>
    <div className="fault-section-title">
      <strong>{t("诊断咨询")}</strong>
      <span className="fault-badge">{profile.kb ? `KB v${profile.kb.kbVersion}` : "0.3"}</span>
    </div>
    <p className="fault-hint">{t("选择症状查看嫌疑部件分级；点部件看对策与处置归属；点故障码反查。")}</p>

    <div className="kb-symptom-groups">
      {[...grouped.entries()].map(([group, list]) => <div key={group || "other"} className="kb-symptom-group">
        {group && <div className="kb-group-label">{group}</div>}
        <div className="kb-chip-row">
          {list.map(s => <button key={s.id}
            className={`kb-chip${session.kbSymptomId === s.id ? " on" : ""}`}
            aria-pressed={session.kbSymptomId === s.id}
            onClick={() => pickSymptom(s.id)}
            title={L(s.label)}
          >{L(s.label)}</button>)}
        </div>
      </div>)}
    </div>

    {activeSymptom && suspects.length > 0 && <div className="kb-suspect-list" data-testid="kb-suspects">
      {suspects.map(({ groupId, pr, causes }) => {
        const group = partGroupOf(profile, groupId);
        const meta = PR_META[pr];
        const own = causes.slice().sort((a, b) => OWN_ORDER[a.own] - OWN_ORDER[b.own])[0].own;
        return <div key={groupId} className={`kb-suspect${session.kbPartGroupId === groupId ? " on" : ""} pr${pr}`}>
          <button className="kb-suspect-head" onClick={() => selectKbPart(session.kbPartGroupId === groupId ? null : groupId)}>
            <span className={`kb-pr p${pr}`}>{meta.dot}</span>
            <span className="kb-suspect-name">{group ? L(group.label) : groupId}</span>
            <span className="kb-own">{t(OWN_TEXT[own].zh)}</span>
          </button>
          <div className="kb-suspect-codes">
            {causes.flatMap(c => c.codes).filter((c, i, arr) => arr.indexOf(c) === i).map(code => {
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

    {activeGroup && <div className="kb-detail" data-testid="kb-detail">
      <div className="fault-section-title">
        <strong>{L(activeGroup.label)}</strong>
        <span className="kb-bind-state">{activeTargets && (activeTargets.nodes.length + activeTargets.pipes.length) > 0
          ? `${t("已绑定")} ${activeTargets.nodes.length}+${activeTargets.pipes.length}`
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
      <div className="fault-actions">
        <button className="btn mini" disabled={!activeTargets || activeTargets.nodes.length + activeTargets.pipes.length === 0}
          onClick={() => focusGroup(diagram, profile, activeGroup.id)}>{t("定位部件")}</button>
        {(["replace", "add", "remove"] as const).map(mode => <button key={mode} className="btn mini"
          disabled={!canEdit || (ui.selection.nodes.length + ui.selection.pipes.length === 0)}
          title={t("把当前画布选择绑定为该部件在本图中的落点")}
          onClick={() => { try { bindKbGroupSelection(activeGroup.id, mode); } catch { /* 面板顶部已有错误位 */ } }}
        >{t(["替换绑定", "追加绑定", "移除绑定"][mode === "replace" ? 0 : mode === "add" ? 1 : 2])}</button>)}
      </div>
    </div>}

    <div className="kb-statusbar" data-testid="kb-status" role="status">
      <span className="kb-stat"><i>{t("当前症状")}</i><b>{activeSymptom ? L(activeSymptom.label) : "—"}</b></span>
      <span className="kb-stat"><i>{t("首要怀疑")}</i><b>{primary ? ((): string => { const g = partGroupOf(profile, primary.groupId); return g ? L(g.label) : primary.groupId; })() : "—"}</b></span>
      <span className="kb-stat"><i>{t("处置归属")}</i><b>{primary ? t(OWN_TEXT[primary.causes[0].own].zh) : "—"}</b></span>
      <span className="kb-stat"><i>{t("关联报警码")}</i><b>{primary ? (primary.causes.flatMap(c => c.codes).filter((c, i, a) => a.indexOf(c) === i).join(" ") || "—") : "—"}</b></span>
    </div>
    {profile.kb && <small className="kb-source">{t("依据")}：{L(profile.kb.source)} · v{profile.kb.kbVersion}</small>}
  </section>;
}
