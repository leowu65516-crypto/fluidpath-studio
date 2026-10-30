import { useState } from "react";
import { useT } from "../i18n";
import { addCause, addSymptom, removeCause, removeCheckGuide, removeSymptom, setCheckGuide, upgradeToKnowledgeBase } from "../fault-codes/actions";
import type { DiagnosticProfile, LocalizedText } from "../fault-codes/types";

/**
 * 自建知识库编辑器（1.49.0）：症状 / 原因 / 排查要点。
 * 面向"没有现成库、想自己配"的用户：表单化录入，不要求手写 JSON。
 */
export function FaultKnowledgeEditor({ profile, canEdit, onError, onGoBinding }: {
  profile: DiagnosticProfile;
  canEdit: boolean;
  onError: (message: string) => void;
  onGoBinding?: () => void;
}) {
  const { t, lang } = useT();
  const [symptomZh, setSymptomZh] = useState("");
  const [symptomEn, setSymptomEn] = useState("");
  const [symptomGroupZh, setSymptomGroupZh] = useState("");
  const [symptomGroupEn, setSymptomGroupEn] = useState("");

  const [causeSymptom, setCauseSymptom] = useState("");
  const [causeGroup, setCauseGroup] = useState("");
  const [causePr, setCausePr] = useState<"1" | "2" | "3">("2");
  const [causeOwn, setCauseOwn] = useState<"store" | "svc" | "both">("store");
  const [causeCodes, setCauseCodes] = useState("");
  const [causeWhyZh, setCauseWhyZh] = useState("");
  const [causeWhyEn, setCauseWhyEn] = useState("");
  const [causeActZh, setCauseActZh] = useState("");
  const [causeActEn, setCauseActEn] = useState("");
  const [causeRef, setCauseRef] = useState("");

  const [guideGroup, setGuideGroup] = useState("");
  const [guideZh, setGuideZh] = useState("");
  const [guideEn, setGuideEn] = useState("");

  const symptoms = profile.symptoms ?? [];
  const causes = profile.causes ?? [];
  const guides = profile.checkGuides ?? [];
  const groups = profile.highlightGroups;
  const codes = profile.diagnostics.map(fault => fault.code);
  const groupLabel = (id: string) => {
    const group = groups.find(item => item.id === id);
    if (!group) return id;
    return lang === "en" ? group.label.en || group.label.zh || id : group.label.zh || group.label.en || id;
  };
  const localized = (zh: string, en: string): LocalizedText => ({ zh: zh.trim(), en: en.trim() });
  const hasKb = profile.version === "0.4-draft" && !!profile.kb;
  const wrap = (fn: () => void) => { try { fn(); onError(""); } catch (error) { onError((error as Error).message); } };

  function createSymptom() {
    if (!symptomZh.trim() || !symptomEn.trim()) return;
    const group = symptomGroupZh.trim() || symptomGroupEn.trim()
      ? localized(symptomGroupZh || symptomGroupEn, symptomGroupEn || symptomGroupZh)
      : undefined;
    wrap(() => {
      addSymptom(localized(symptomZh, symptomEn), group);
      setSymptomZh(""); setSymptomEn(""); setSymptomGroupZh(""); setSymptomGroupEn("");
    });
  }
  function createCause() {
    if (!causeSymptom || !causeGroup) return;
    const why = localized(causeWhyZh || causeWhyEn, causeWhyEn || causeWhyZh);
    const act = localized(causeActZh || causeActEn, causeActEn || causeActZh);
    if (!why.zh || !why.en || !act.zh || !act.en) return;
    const chosenCodes = causeCodes.split(/[,，\s]+/).map(code => code.trim()).filter(code => code && codes.includes(code));
    wrap(() => {
      addCause({ symptomId: causeSymptom, partGroupId: causeGroup, pr: Number(causePr) as 1 | 2 | 3, own: causeOwn, codes: chosenCodes, why, act, ref: causeRef.trim() || undefined });
      setCauseWhyZh(""); setCauseWhyEn(""); setCauseActZh(""); setCauseActEn(""); setCauseCodes(""); setCauseRef("");
    });
  }
  function createGuide() {
    if (!guideGroup) return;
    const text = localized(guideZh || guideEn, guideEn || guideZh);
    if (!text.zh || !text.en) return;
    wrap(() => { setCheckGuide(guideGroup, text); setGuideZh(""); setGuideEn(""); });
  }

  if (!hasKb) {
    return <div className="kb-editor">
      <p className="fault-hint">{t("当前图纸还没有 0.3+ 知识库结构。先创建一个空知识库，才能添加症状/原因/排查要点。")}</p>
      <button className="btn" disabled={!canEdit} onClick={() => wrap(() => upgradeToKnowledgeBase())}>{t("新建空知识库（0.4）")}</button>
    </div>;
  }

  return <div className="kb-editor">
    <section className="kb-editor-block">
      <div className="fault-section-title"><strong>{t("症状")}</strong><span className="fault-badge">{symptoms.length}</span></div>
      <p className="fault-hint">{t("症状是用户能观察到的现象（如不出奶、奶温偏高）。")}</p>
      <div className="kb-editor-list">
        {symptoms.map(symptom => <div className="kb-editor-item" key={symptom.id}>
          <span>{lang === "en" ? symptom.label.en || symptom.label.zh : symptom.label.zh || symptom.label.en}</span>
          <small>{symptom.group ? (lang === "en" ? symptom.group.en : symptom.group.zh) : ""}</small>
          <button className="btn ghost sq" disabled={!canEdit} title={t("删除症状（同时移除其下的原因）")} onClick={() => wrap(() => removeSymptom(symptom.id))}>×</button>
        </div>)}
        {!symptoms.length && <p className="fault-hint">{t("还没有症状。")}</p>}
      </div>
      <div className="kb-editor-form">
        <input aria-label={t("症状中文名")} placeholder={t("症状中文名")} value={symptomZh} disabled={!canEdit} onChange={event => setSymptomZh(event.target.value)} />
        <input aria-label={t("症状英文名")} placeholder={t("症状英文名")} value={symptomEn} disabled={!canEdit} onChange={event => setSymptomEn(event.target.value)} />
        <input aria-label={t("观察分组（中文）")} placeholder={t("观察分组（可选）")} value={symptomGroupZh} disabled={!canEdit} onChange={event => setSymptomGroupZh(event.target.value)} />
        <input aria-label={t("观察分组（英文）")} placeholder={t("Group (EN, optional)")} value={symptomGroupEn} disabled={!canEdit} onChange={event => setSymptomGroupEn(event.target.value)} />
        <button className="btn mini" disabled={!canEdit || !symptomZh.trim() || !symptomEn.trim()} onClick={createSymptom}>＋ {t("添加症状")}</button>
      </div>
    </section>

    <section className="kb-editor-block">
      <div className="fault-section-title"><strong>{t("原因")}</strong><span className="fault-badge">{causes.length}</span></div>
      <p className="fault-hint">{t("原因是「症状 × 部件」的责任条目：概率 3/2/1、处置归属、关联报警码、机理与对策。")}</p>
      <div className="kb-editor-list">
        {causes.map(cause => <div className="kb-editor-item" key={cause.id}>
          <span>{lang === "en" ? (symptoms.find(item => item.id === cause.symptomId)?.label.en ?? cause.symptomId) : (symptoms.find(item => item.id === cause.symptomId)?.label.zh ?? cause.symptomId)} · {groupLabel(cause.partGroupId)}</span>
          <small>P{cause.pr} · {cause.own} · {cause.codes.join(" ")}</small>
          <button className="btn ghost sq" disabled={!canEdit} title={t("删除原因")} onClick={() => wrap(() => removeCause(cause.id))}>×</button>
        </div>)}
        {!causes.length && <p className="fault-hint">{t("还没有原因。")}</p>}
      </div>
      <div className="kb-editor-form">
        <select aria-label={t("症状")} value={causeSymptom} disabled={!canEdit || !symptoms.length} onChange={event => setCauseSymptom(event.target.value)}>
          <option value="">{t("选择症状")}</option>
          {symptoms.map(symptom => <option key={symptom.id} value={symptom.id}>{lang === "en" ? symptom.label.en : symptom.label.zh}</option>)}
        </select>
        <select aria-label={t("部件组")} value={causeGroup} disabled={!canEdit} onChange={event => setCauseGroup(event.target.value)}>
          <option value="">{t("选择部件组")}</option>
          {groups.map(group => <option key={group.id} value={group.id}>{groupLabel(group.id)}</option>)}
        </select>
        <select aria-label={t("概率")} value={causePr} disabled={!canEdit} onChange={event => setCausePr(event.target.value as "1" | "2" | "3")}>
          <option value="3">{t("首要排查")}</option>
          <option value="2">{t("次要排查")}</option>
          <option value="1">{t("罕见排除")}</option>
        </select>
        <select aria-label={t("处置归属")} value={causeOwn} disabled={!canEdit} onChange={event => setCauseOwn(event.target.value as "store" | "svc" | "both")}>
          <option value="store">{t("门店可处理")}</option>
          <option value="svc">{t("服务商处理")}</option>
          <option value="both">{t("门店先排查 → 报修")}</option>
        </select>
        <input aria-label={t("关联报警码（逗号分隔）")} placeholder={t("关联报警码，逗号分隔，如 E041,E045")} value={causeCodes} disabled={!canEdit} onChange={event => setCauseCodes(event.target.value)} />
        <input aria-label={t("手册溯源 ref")} placeholder={t("手册章节/编号（可选）")} value={causeRef} disabled={!canEdit} onChange={event => setCauseRef(event.target.value)} />
        <textarea aria-label={t("为什么（中文）")} placeholder={t("为什么（中文）")} value={causeWhyZh} disabled={!canEdit} onChange={event => setCauseWhyZh(event.target.value)} />
        <textarea aria-label={t("为什么（英文）")} placeholder={t("Why (EN)")} value={causeWhyEn} disabled={!canEdit} onChange={event => setCauseWhyEn(event.target.value)} />
        <textarea aria-label={t("对策（中文）")} placeholder={t("对策（中文）")} value={causeActZh} disabled={!canEdit} onChange={event => setCauseActZh(event.target.value)} />
        <textarea aria-label={t("对策（英文）")} placeholder={t("Action (EN)")} value={causeActEn} disabled={!canEdit} onChange={event => setCauseActEn(event.target.value)} />
        <button className="btn mini" disabled={!canEdit || !causeSymptom || !causeGroup || !causeWhyZh.trim() || !causeWhyEn.trim() || !causeActZh.trim() || !causeActEn.trim()} onClick={createCause}>＋ {t("添加原因")}</button>
      </div>
    </section>

    <section className="kb-editor-block">
      <div className="fault-section-title"><strong>{t("排查要点")}</strong><span className="fault-badge">{guides.length}</span></div>
      <p className="fault-hint">{t("每个部件组最多一条；无论是否为嫌疑都会展示。")}</p>
      <div className="kb-editor-list">
        {guides.map(guide => <div className="kb-editor-item" key={guide.groupId}>
          <span>{groupLabel(guide.groupId)}</span>
          <small>{lang === "en" ? guide.text.en : guide.text.zh}</small>
          <button className="btn ghost sq" disabled={!canEdit} title={t("删除排查要点")} onClick={() => wrap(() => removeCheckGuide(guide.groupId))}>×</button>
        </div>)}
        {!guides.length && <p className="fault-hint">{t("还没有排查要点。")}</p>}
      </div>
      <div className="kb-editor-form">
        <select aria-label={t("部件组")} value={guideGroup} disabled={!canEdit} onChange={event => setGuideGroup(event.target.value)}>
          <option value="">{t("选择部件组")}</option>
          {groups.map(group => <option key={group.id} value={group.id}>{groupLabel(group.id)}</option>)}
        </select>
        <input aria-label={t("排查要点（中文）")} placeholder={t("排查要点（中文）")} value={guideZh} disabled={!canEdit} onChange={event => setGuideZh(event.target.value)} />
        <input aria-label={t("排查要点（英文）")} placeholder={t("Inspection point (EN)")} value={guideEn} disabled={!canEdit} onChange={event => setGuideEn(event.target.value)} />
        <button className="btn mini" disabled={!canEdit || !guideGroup || !guideZh.trim() || !guideEn.trim()} onClick={createGuide}>＋ {t("保存排查要点")}</button>
      </div>
    </section>
    <footer className="kb-editor-footer">
      <p>{t("内容添加后：去画布落点把部件组绑到本图，代码才能高亮与演练。")}</p>
      {onGoBinding && <button className="btn mini" onClick={onGoBinding}>{t("去画布落点")} →</button>}
    </footer>
  </div>;
}
