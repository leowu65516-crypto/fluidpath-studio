import { useState } from "react";
import { PromptDialog } from "./PromptDialog";
import { availableScenariosForDiagram, getScenario } from "../scenarios";
import { enterScenario, setScenarioStep, exitScenario, useAppState, saveWorkCondition } from "../store";
import { useT } from "../i18n";

export function ScenarioPanel({ onClose }: { onClose: () => void }) {
  const { ui, diagram } = useAppState();
  const { t, lang } = useT();
  const [picking, setPicking] = useState(!ui.scenario);
  const [condDialog, setCondDialog] = useState(false);
  const [quizPick, setQuizPick] = useState<number | null>(null);

  const scenario = ui.scenario ? getScenario(ui.scenario.scenarioId) : undefined;
  const stepIndex = ui.scenario?.stepIndex ?? 0;
  const step = scenario?.steps[stepIndex];
  const isLast = scenario ? stepIndex >= scenario.steps.length - 1 : false;

  // 按场景关键角色过滤，避免只有通用储罐/阀门时误显示热牛奶。
  const availableScenarios = availableScenariosForDiagram(diagram);

  if (picking || !scenario) {
    return (
      <div style={{
        position: "fixed", right: 14, top: 58, zIndex: 8000,
        width: 320, background: "var(--panel)", borderRadius: 12,
        boxShadow: "0 8px 32px rgba(0,0,0,0.2)", border: "1px solid var(--border)",
        fontFamily: "system-ui, sans-serif", overflow: "hidden",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 650, color: "var(--text)" }}>🎬 {t("演示/讲述模式")}</h3>
          <button onClick={onClose} style={{ border: "none", background: "transparent", fontSize: 17, color: "var(--text-dim)", cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 4 }}>{t("选择一个场景，按步骤讲述液路工作过程")}：</div>
          {availableScenarios.length === 0 && <div style={{ fontSize: 12, color: "var(--text-dim)" }}>{t("当前图纸没有可用的演示场景")}</div>}
          {availableScenarios.map((s) => (
            <button
              key={s.id}
              onClick={() => { enterScenario(s.id, 0); setPicking(false); }}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "12px 14px",
                borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)",
                color: "var(--text)", cursor: "pointer", fontSize: 13.5, textAlign: "left",
                opacity: 1,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.background = "var(--accent-soft)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--surface)"; }}
            >
              <span style={{ fontSize: 20 }}>{s.icon}</span>
              <span style={{ flex: 1 }}>{s.title}</span>
              <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{s.steps.length} {t("步")}</span>
            </button>
          ))}
          <button onClick={onClose} style={{ marginTop: 4, fontSize: 12.5, padding: "8px 0", borderRadius: 6, border: "none", background: "transparent", color: "var(--text-dim)", cursor: "pointer" }}>
            {t("取消")}
          </button>
        </div>
      </div>
    );
  }

  // 讲述界面
  return (
    <div style={{
      position: "fixed", right: 14, top: 58, zIndex: 8000,
      width: 340, background: "var(--panel)", borderRadius: 12,
      boxShadow: "0 8px 32px rgba(0,0,0,0.2)", border: "1px solid var(--border)",
      fontFamily: "system-ui, sans-serif", overflow: "hidden",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 650, color: "var(--text)" }}>
          {scenario.icon} {scenario.title}
          <span style={{ marginLeft: 8, fontSize: 11, color: "var(--text-dim)" }}>
            {stepIndex + 1} / {scenario.steps.length}
          </span>
        </h3>
        <button onClick={() => { exitScenario(); onClose(); }} style={{ border: "none", background: "transparent", fontSize: 17, color: "var(--text-dim)", cursor: "pointer" }}>✕</button>
      </div>

      <div style={{ padding: "14px 16px" }}>
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
      </div>

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
          title="把当前步骤的阀位/泵态保存为工况，可在工具栏「工况」里随时一键切换"
        >💾 {t("把本步存为工况")}</button>
      </div>
      {condDialog && (
        <PromptDialog
          title="保存为工况"
          label="给这套阀位起个名"
          defaultValue={`${scenario.title}·第${stepIndex + 1}步`}
          submitLabel="保存"
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
    </div>
  );
}
