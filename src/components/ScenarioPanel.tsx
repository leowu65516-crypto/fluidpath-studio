import { useMemo, useState } from "react";
import { PromptDialog } from "./PromptDialog";
import { availableScenariosForDiagram, getScenario } from "../scenarios";
import {
  enterScenario,
  setScenarioStep,
  exitScenario,
  useAppState,
  saveWorkCondition,
  resetScenarioOverrides,
  saveScenarioOverridesToStep,
  clearSavedScenarioStep,
  createCustomScenarioFromConditions,
  deleteCustomScenarioById,
  updateCustomScenario,
  type CustomScenarioStepInput,
} from "../store";
import type { SceneScenario } from "../types";
import { useT } from "../i18n";
import { toast } from "../toast";

export function ScenarioPanel({ onClose }: { onClose: () => void }) {
  const { ui, diagram } = useAppState();
  const { t, lang } = useT();
  const [picking, setPicking] = useState(!ui.scenario);
  const [condDialog, setCondDialog] = useState(false);
  const [quizPick, setQuizPick] = useState<number | null>(null);
  const [showConditionPicker, setShowConditionPicker] = useState(false);
  const [pickedConditions, setPickedConditions] = useState<string[]>([]);
  const [newDemoDialog, setNewDemoDialog] = useState(false);
  const [editingScenarioId, setEditingScenarioId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftSteps, setDraftSteps] = useState<CustomScenarioStepInput[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const condNames = useMemo(() => (diagram.settings.workConditions ?? []).map((c) => c.name), [diagram.settings.workConditions]);

  const scenario = ui.scenario ? getScenario(ui.scenario.scenarioId, diagram) : undefined;
  const stepIndex = ui.scenario?.stepIndex ?? 0;
  const step = scenario?.steps[stepIndex];
  const isLast = scenario ? stepIndex >= scenario.steps.length - 1 : false;

  // 按场景关键角色过滤，避免只有通用储罐/阀门时误显示热牛奶。
  const availableScenarios = availableScenariosForDiagram(diagram);

  const beginEditing = (scene: SceneScenario) => {
    setEditingScenarioId(scene.id);
    setDraftTitle(scene.title);
    setDraftSteps(scene.steps.map((step) => ({
      // 兼容 v1.30 由工况生成、但还没有 conditionName 的旧自定义演示。
      conditionName: step.conditionName ?? (condNames.includes(step.title) ? step.title : condNames[0] ?? ""),
      title: step.title,
    })));
    setPicking(false);
  };

  const closeEditor = () => {
    setEditingScenarioId(null);
    setDraftTitle("");
    setDraftSteps([]);
    setPicking(true);
  };

  const updateDraftStep = (index: number, patch: Partial<CustomScenarioStepInput>) => {
    setDraftSteps((steps) => steps.map((step, current) => current === index ? { ...step, ...patch } : step));
  };

  const moveDraftStep = (index: number, delta: -1 | 1) => {
    setDraftSteps((steps) => {
      const target = index + delta;
      if (target < 0 || target >= steps.length) return steps;
      const next = [...steps];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  if (editingScenarioId) {
    const canSave = draftTitle.trim().length > 0 && draftSteps.length > 0 && draftSteps.every((step) => step.conditionName);
    return (
      <div className={`scenario-panel scenario-editor${collapsed ? " is-collapsed" : ""}`} data-ui="1">
        <div className="scenario-panel-head">
          <div>
            <h3>⭐ {t("编辑自定义演示")}</h3>
            <p>{t("每一步引用一个已保存工况；进入步骤时会恢复该工况的全部教学状态。")}</p>
          </div>
          <div className="scenario-panel-actions">
            <button className="scenario-icon-btn" title={collapsed ? t("展开") : t("折叠")} aria-label={collapsed ? t("展开") : t("折叠")} onClick={() => setCollapsed((value) => !value)}>{collapsed ? "▸" : "▾"}</button>
            <button className="scenario-icon-btn" title={t("返回演示列表")} onClick={closeEditor}>✕</button>
          </div>
        </div>
        {!collapsed && <><div className="scenario-editor-body">
          <label className="scenario-field">
            <span>{t("演示名称")}</span>
            <input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} placeholder={t("例如：日常冲煮流程")} />
          </label>
          <div className="scenario-step-head">
            <span>{t("演示步骤")}</span>
            <span>{draftSteps.length} {t("步")}</span>
          </div>
          <div className="scenario-step-list">
            {draftSteps.map((step, index) => (
              <div className="scenario-edit-step" key={`${step.conditionName}-${index}`}>
                <span className="scenario-step-number">{index + 1}</span>
                <div className="scenario-step-fields">
                  <select value={step.conditionName} onChange={(event) => updateDraftStep(index, { conditionName: event.target.value, title: event.target.value })}>
                    {condNames.map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                  <input value={step.title ?? ""} onChange={(event) => updateDraftStep(index, { title: event.target.value })} placeholder={t("这一步的讲述标题")} />
                </div>
                <div className="scenario-step-actions">
                  <button title={t("上移步骤")} disabled={index === 0} onClick={() => moveDraftStep(index, -1)}>↑</button>
                  <button title={t("下移步骤")} disabled={index === draftSteps.length - 1} onClick={() => moveDraftStep(index, 1)}>↓</button>
                  <button className="danger" title={t("删除步骤")} onClick={() => setDraftSteps((steps) => steps.filter((_, current) => current !== index))}>✕</button>
                </div>
              </div>
            ))}
          </div>
          {condNames.length === 0 ? (
            <div className="scenario-empty">{t("先在“工况”里保存至少一个工况，才能编排演示。")}</div>
          ) : (
            <button className="scenario-add-step" onClick={() => setDraftSteps((steps) => [...steps, { conditionName: condNames[0], title: condNames[0] }])}>＋ {t("增加步骤")}</button>
          )}
        </div>
        <div className="scenario-editor-foot">
          <button className="btn ghost" onClick={closeEditor}>{t("取消")}</button>
          <button className="btn" disabled={!canSave} onClick={() => {
            if (!updateCustomScenario(editingScenarioId, draftTitle, draftSteps, lang)) {
              toast(t("演示名称和步骤不能为空"), "error");
              return;
            }
            if (ui.scenario?.scenarioId === editingScenarioId) setScenarioStep(Math.min(ui.scenario.stepIndex, draftSteps.length - 1));
            toast(t("自定义演示已保存"));
            closeEditor();
          }}>💾 {t("保存演示")}</button>
        </div></>}
      </div>
    );
  }

  if (picking || !scenario) {
    return (
      <div className={`scenario-panel${collapsed ? " is-collapsed" : ""}`} data-ui="1">
        <div className="scenario-panel-head">
          <div>
            <h3>🎬 {t("演示/讲述模式")}</h3>
            <p>{t("选择演示，或用已保存的工况编排自己的步骤。")}</p>
          </div>
          <div className="scenario-panel-actions">
            <button className="scenario-icon-btn" title={collapsed ? t("展开") : t("折叠")} aria-label={collapsed ? t("展开") : t("折叠")} onClick={() => setCollapsed((value) => !value)}>{collapsed ? "▸" : "▾"}</button>
            <button className="scenario-icon-btn" onClick={onClose} title={t("关闭")}>✕</button>
          </div>
        </div>
        {!collapsed && <div className="scenario-picker-body">
          {availableScenarios.length === 0 && <div className="scenario-empty">{t("当前图纸没有可用的演示场景")}</div>}
          {availableScenarios.map((s) => (
            <button
              key={s.id}
              className="scenario-choice"
              onClick={() => { enterScenario(s.id, 0); setPicking(false); }}
            >
              <span className="scenario-choice-icon">{s.icon}</span>
              <span className="scenario-choice-name">
                {s.title}
                {s.custom && <span className="scenario-custom-badge">{t("自定义")}</span>}
              </span>
              <span className="scenario-choice-actions">
                <span>{s.steps.length} {t("步")}</span>
                {s.custom && (
                  <>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); beginEditing(s); }}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); beginEditing(s); } }}
                      className="scenario-card-action"
                      title={t("编辑步骤")}
                    >✎</span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); if (confirm(t("删除该自定义演示？"))) deleteCustomScenarioById(s.id); }}
                      onKeyDown={(e) => { if (e.key === "Enter" && confirm(t("删除该自定义演示？"))) deleteCustomScenarioById(s.id); }}
                      className="scenario-card-action danger"
                    title={t("删除")}
                    >×</span>
                  </>
                )}
              </span>
            </button>
          ))}
          {showConditionPicker ? (
            <div className="scenario-condition-picker">
              <div className="scenario-section-label">{t("选择工况（按点选顺序编排步骤）")}</div>
              <div className="scenario-condition-list">
                {condNames.length === 0 && <div className="scenario-empty">{t("本图纸还没有工况——先在“工况”面板保存几个完整状态")}</div>}
                {condNames.map((name) => (
                  <label key={name} className="scenario-condition-option">
                    <input
                      type="checkbox"
                      checked={pickedConditions.includes(name)}
                      onChange={(e) => {
                        setPickedConditions((prev) => e.target.checked ? [...prev, name] : prev.filter((x) => x !== name));
                      }}
                    />
                    <span style={{ flex: 1 }}>{pickedConditions.indexOf(name) >= 0 ? `${pickedConditions.indexOf(name) + 1}. ${name}` : name}</span>
                  </label>
                ))}
              </div>
              <div className="scenario-condition-actions">
                <button
                  disabled={pickedConditions.length === 0}
                  onClick={() => setNewDemoDialog(true)}
                  className="btn"
                >⭐ {t("命名并创建")}</button>
                <button onClick={() => setShowConditionPicker(false)} className="btn ghost">{t("取消")}</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowConditionPicker(true)} className="scenario-create-btn">
              ⭐ {t("从工况新建演示")}
            </button>
          )}
          <button onClick={onClose} className="scenario-cancel-btn">
            {t("取消")}
          </button>
          {newDemoDialog && (
            <PromptDialog
              title={t("命名自定义演示")}
              label={t("演示名称")}
              defaultValue={pickedConditions.join(" → ").slice(0, 60)}
              submitLabel={t("创建演示")}
              onSubmit={(title) => {
                const id = createCustomScenarioFromConditions(pickedConditions, lang, title);
                if (!id) return;
                setPickedConditions([]);
                setShowConditionPicker(false);
                setNewDemoDialog(false);
                enterScenario(id, 0);
                setPicking(false);
                toast(t("自定义演示已创建"));
              }}
              onClose={() => setNewDemoDialog(false)}
            />
          )}
        </div>}
      </div>
    );
  }

  // 讲述界面
  return (
    <div className={`scenario-panel scenario-player${collapsed ? " is-collapsed" : ""}`} data-ui="1">
      <div className="scenario-panel-head scenario-player-head">
        <div>
          <h3>
          {scenario.icon} {scenario.title}
          <span className="scenario-step-count">
            {stepIndex + 1} / {scenario.steps.length}
          </span>
          </h3>
          <p>{step?.conditionName ? t("当前步骤正在应用完整工况快照") : t("按步骤讲述液路工作过程")}</p>
        </div>
        <div className="scenario-panel-actions">
          <button className="scenario-icon-btn" title={collapsed ? t("展开") : t("折叠")} aria-label={collapsed ? t("展开") : t("折叠")} onClick={() => setCollapsed((value) => !value)}>{collapsed ? "▸" : "▾"}</button>
          <button className="scenario-icon-btn" onClick={() => { exitScenario(); onClose(); }} title={t("退出演示")}>✕</button>
        </div>
      </div>

      {!collapsed && <div style={{ padding: "14px 16px" }}>
        <div style={{ fontSize: 14, fontWeight: 650, color: "var(--accent)", marginBottom: 8 }}>{step?.title}</div>
        <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.7, minHeight: 60 }}>{step?.desc}</div>
        {step?.narrator && (
          <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 8, background: "var(--surface-2)", fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.7 }}>
            🎤 {step.narrator[lang]}
          </div>
        )}
        {step?.callouts && step.callouts.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
            {step.callouts.map((c, i) => (
              <span key={i} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 10, background: "var(--accent-soft)", color: "var(--accent)" }}>📍 {c.text[lang]}</span>
            ))}
          </div>
        )}
        {step?.quiz && (
          <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 8, border: "1px dashed var(--border)", fontSize: 12.5 }}>
            <div style={{ fontWeight: 650, marginBottom: 6 }}>❓ {step.quiz.q[lang]}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {step.quiz.options.map((o, i) => (
                <button
                  key={i}
                  onClick={() => setQuizPick(i)}
                  style={{
                    textAlign: "left", fontSize: 12, padding: "5px 8px", borderRadius: 6,
                    border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", cursor: "pointer",
                  }}
                >{String.fromCharCode(65 + i)}. {o[lang]}</button>
              ))}
            </div>
            {quizPick !== null && (
              <div style={{ marginTop: 6, fontWeight: 650, color: quizPick === step.quiz.answer ? "#3fae6a" : "#d64545" }}>
                {quizPick === step.quiz.answer ? `✓ ${t("正确")}` : `✕ ${t("再想想")}`}
              </div>
            )}
          </div>
        )}
      </div>}

      {!collapsed && <>
      {Object.keys(ui.scenario?.overrides ?? {}).length > 0 && (
        <div style={{ margin: "0 16px 8px", padding: "7px 10px", borderRadius: 8, background: "var(--accent-soft)", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <span style={{ color: "var(--accent)", fontWeight: 600 }}>🎛 {t("已手动微调 {n} 处").replace("{n}", String(Object.keys(ui.scenario?.overrides ?? {}).length))}</span>
          <span style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => {
                const n = saveScenarioOverridesToStep(ui.scenario!.stepIndex);
                if (n > 0) toast(t("已保存到第 {n} 步，随图纸保存，下次演示自动生效").replace("{n}", String(ui.scenario!.stepIndex + 1)));
              }}
              style={{ border: "1px solid var(--accent)", background: "var(--accent)", color: "#fff", fontSize: 11.5, padding: "3px 8px", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}
              title={t("把当前微调固化到此步：随图纸保存，下次演示/打开自动生效（从此步开始）")}
            >💾 {t("保存到本步")}</button>
            <button
              onClick={() => resetScenarioOverrides()}
              style={{ border: "1px solid var(--accent)", background: "transparent", color: "var(--accent)", fontSize: 11.5, padding: "3px 8px", borderRadius: 6, cursor: "pointer" }}
            >↺ {t("重置微调")}</button>
          </span>
        </div>
      )}
      {(diagram.settings.scenarioOverrides?.[ui.scenario?.scenarioId ?? ""]?.[ui.scenario?.stepIndex ?? 0] ?? null) && (() => {
        const savedCount = Object.keys(diagram.settings.scenarioOverrides![ui.scenario!.scenarioId][ui.scenario!.stepIndex]).length;
        return (
          <div style={{ margin: "0 16px 8px", padding: "6px 10px", borderRadius: 8, border: "1px dashed var(--border)", fontSize: 11.5, color: "var(--text-dim)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span>✓ {t("本步已保存 {n} 项微调（随图纸）").replace("{n}", String(savedCount))}</span>
            <button
              onClick={() => { clearSavedScenarioStep(ui.scenario!.stepIndex); toast(t("已清除本步保存的微调")); }}
              style={{ border: "none", background: "transparent", color: "var(--danger)", fontSize: 11.5, cursor: "pointer" }}
            >{t("清除")}</button>
          </div>
        );
      })()}
      {scenario.custom && (
        <div className="scenario-edit-current">
          <button onClick={() => { exitScenario(); beginEditing(scenario); }}>{t("编辑演示步骤")}</button>
          <span>{t("修改步骤会清除该演示已保存的单步微调")}</span>
        </div>
      )}
      {/* 步骤进度条 */}
      <div style={{ padding: "0 16px" }}>
        <div style={{ display: "flex", gap: 4 }}>
          {scenario.steps.map((_, i) => (
            <div key={i} style={{
              flex: 1, height: 4, borderRadius: 2,
              background: i <= stepIndex ? "var(--accent)" : "var(--surface-2)",
            }} />
          ))}
        </div>
      </div>

      <div style={{ padding: "0 16px" }}>
        <button
          onClick={() => setCondDialog(true)}
          style={{
            width: "100%", padding: "7px 0", borderRadius: 6, border: "1px dashed var(--accent)",
            background: "var(--accent-soft)", color: "var(--accent)", cursor: "pointer", fontSize: 12.5,
          }}
          title={t("把当前步骤的阀位/泵态保存为工况，可在工具栏「工况」里随时一键切换")}
        >💾 {t("把本步存为工况")}</button>
      </div>
      {condDialog && (
        <PromptDialog
          title={t("保存为工况")}
          label={t("给这套阀位起个名")}
          defaultValue={`${scenario.title}·第${stepIndex + 1}步`}
          submitLabel={t("保存")}
          onSubmit={(name) => saveWorkCondition(name)}
          onClose={() => setCondDialog(false)}
        />
      )}
      <div style={{ display: "flex", gap: 8, padding: "14px 16px", borderTop: "1px solid var(--border)", marginTop: 12 }}>
        <button
          onClick={() => { setQuizPick(null); if (stepIndex > 0) setScenarioStep(stepIndex - 1); }}
          disabled={stepIndex === 0}
          style={{
            flex: 1, padding: "8px 0", borderRadius: 6, border: "1px solid var(--border)",
            background: "var(--input-bg)", color: "var(--text)", cursor: stepIndex === 0 ? "default" : "pointer",
            opacity: stepIndex === 0 ? 0.4 : 1, fontSize: 12.5,
          }}
        >← {t("上一步")}</button>
        {!isLast ? (
          <button
            onClick={() => setScenarioStep(stepIndex + 1)}
            style={{
              flex: 1, padding: "8px 0", borderRadius: 6, border: "none",
              background: "var(--accent)", color: "#fff", cursor: "pointer", fontSize: 12.5, fontWeight: 650,
            }}
          >{t("下一步")} →</button>
        ) : (
          <button
            onClick={() => { exitScenario(); setPicking(true); }}
            style={{
              flex: 1, padding: "8px 0", borderRadius: 6, border: "1px solid var(--accent)",
              background: "var(--accent-soft)", color: "var(--accent)", cursor: "pointer", fontSize: 12.5, fontWeight: 650,
            }}
          >✓ {t("完成")}</button>
        )}
      </div>
      </>}
    </div>
  );
}
