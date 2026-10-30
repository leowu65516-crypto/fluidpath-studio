import { useEffect, useState } from "react";
import { useAppState } from "../store";
import { useT } from "../i18n";
import { editDiagnosticProfile } from "../fault-codes/actions";
import { BEHAVIOR_META } from "../fault-codes/drill";
import { DRILL_BEHAVIORS } from "../fault-codes/types";
import type { DiagnosticProfile, DrillBehavior, FaultCode, FaultDrill } from "../fault-codes/types";

/**
 * 0.4 故障演练编辑器（1.47.0）：声明「基线工况 + 注入动作 + 说明」。
 * 只保存声明；停流传播与差异由引擎/overlay 计算。
 */
export function FaultDrillEditor({ fault, profile, canEdit, run }: {
  fault: FaultCode;
  profile: DiagnosticProfile;
  canEdit: boolean;
  run: (fn: () => void) => void;
}) {
  const { diagram } = useAppState();
  const { t, lang } = useT();
  const [conditionName, setConditionName] = useState(fault.drill?.conditionName ?? "");
  const [noteZh, setNoteZh] = useState(fault.drill?.note?.zh ?? "");
  const [noteEn, setNoteEn] = useState(fault.drill?.note?.en ?? "");
  const [actions, setActions] = useState<Array<{ groupId: string; behavior: DrillBehavior }>>(
    (fault.drill?.actions ?? []).map(action => ({ ...action })),
  );

  useEffect(() => {
    setConditionName(fault.drill?.conditionName ?? "");
    setNoteZh(fault.drill?.note?.zh ?? "");
    setNoteEn(fault.drill?.note?.en ?? "");
    setActions((fault.drill?.actions ?? []).map(action => ({ ...action })));
  }, [fault.id, fault.drill]);

  const conditions = diagram.settings.workConditions ?? [];
  const groups = profile.highlightGroups;
  const configured = !!fault.drill && ((fault.drill.actions?.length ?? 0) > 0 || !!fault.drill.conditionName);

  function save() {
    const drill: FaultDrill = {};
    if (conditionName) drill.conditionName = conditionName;
    if (noteZh.trim() || noteEn.trim()) drill.note = { zh: noteZh.trim(), en: noteEn.trim() };
    const valid = actions.filter(action => action.groupId);
    if (valid.length) drill.actions = valid;
    run(() => editDiagnosticProfile(p => {
      const target = p.diagnostics.find(item => item.id === fault.id);
      if (!target) throw new Error("Fault code no longer exists");
      if (Object.keys(drill).length) target.drill = drill;
      else delete target.drill;
    }));
  }

  return <section className="fault-card drill-editor" data-testid="drill-editor">
    <div className="fault-section-title">
      <strong>{t("故障演练")}</strong>
      <span className="fault-badge">{configured ? t("已配置") : t("未配置")}</span>
    </div>
    <p className="fault-hint">{t("配置后可用「演练故障」：临时注入泵/阀/元件状态，画布显示因此新增的停流与恢复流动；点「还原演练」恢复。")}</p>
    <div className="fault-form">
      <label>{t("基线工况")}
        <select disabled={!canEdit} value={conditionName} onChange={event => setConditionName(event.target.value)} aria-label={t("基线工况")}>
          <option value="">{t("当前状态")}</option>
          {conditions.map(condition => <option key={condition.name} value={condition.name}>{condition.name}</option>)}
        </select>
      </label>
    </div>
    <div className="drill-actions">
      {actions.map((action, index) => <div className="drill-action-row" key={`${index}-${action.groupId}`}>
        <select disabled={!canEdit} value={action.groupId} aria-label={t("部件组")} onChange={event => setActions(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, groupId: event.target.value } : item))}>
          <option value="">{t("选择部件组")}</option>
          {groups.map(group => <option key={group.id} value={group.id}>{lang === "en" ? group.label.en || group.label.zh : group.label.zh || group.label.en}</option>)}
        </select>
        <select disabled={!canEdit} value={action.behavior} aria-label={t("注入行为")} onChange={event => setActions(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, behavior: event.target.value as DrillBehavior } : item))}>
          {DRILL_BEHAVIORS.map(behavior => <option key={behavior} value={behavior}>{BEHAVIOR_META[behavior].glyph} {lang === "en" ? BEHAVIOR_META[behavior].en : BEHAVIOR_META[behavior].zh}</option>)}
        </select>
        <button className="btn ghost sq" disabled={!canEdit} title={t("删除动作")} onClick={() => setActions(current => current.filter((_, itemIndex) => itemIndex !== index))}>×</button>
      </div>)}
      <button className="btn ghost mini" disabled={!canEdit} onClick={() => setActions(current => [...current, { groupId: "", behavior: "stuckClosed" }])}>＋ {t("添加注入动作")}</button>
    </div>
    <div className="fault-form">
      <label>{t("演练说明（中文）")}<input disabled={!canEdit} value={noteZh} maxLength={200} onChange={event => setNoteZh(event.target.value)} /></label>
      <label>{t("演练说明（英文）")}<input disabled={!canEdit} value={noteEn} maxLength={200} onChange={event => setNoteEn(event.target.value)} /></label>
    </div>
    <div className="fault-actions">
      <button className="btn" disabled={!canEdit} onClick={save}>{t("保存演练配置")}</button>
      <button className="btn ghost" disabled={!canEdit} onClick={() => { setConditionName(""); setNoteZh(""); setNoteEn(""); setActions([]); run(() => editDiagnosticProfile(p => { const target = p.diagnostics.find(item => item.id === fault.id); if (target) delete target.drill; })); }}>{t("清除演练")}</button>
    </div>
    {!canEdit && <p className="fault-hint">{t("切回编辑或故障模式可修改演练配置。")}</p>}
  </section>;
}
