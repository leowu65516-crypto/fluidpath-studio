import { useState } from "react";
import { PromptDialog } from "./PromptDialog";
import { SCENARIOS, getScenario, resolveScenarioRoles } from "../scenarios";
import { enterScenario, setScenarioStep, exitScenario, useAppState, loadDiagram, saveWorkCondition } from "../store";
import { createDemoMachineDiagram } from "../sample";
import { useT } from "../i18n";

const ROLE_LABELS: Record<string, string> = {
  waterInlet: "进水口", waterPump: "水泵", inletValve: "进水总阀", hotBoiler: "热水锅炉",
  steamBoiler: "蒸汽锅炉", refillValve: "蒸汽锅炉补水阀", brewV3: "咖啡冲泡三通阀",
  brewChamber: "冲泡缸", coffeeDrainV3: "咖啡排废三通阀", coffeeOut: "咖啡出口",
  milkTank: "储液罐", milkInValve: "进奶阀", milkPump: "奶泵", cleanV3: "牛奶清洗三通阀",
  milkDrainV3: "牛奶排废三通阀", heatV3: "牛奶加热三通阀", milkOut: "牛奶出口",
};

export function ScenarioPanel({ onClose }: { onClose: () => void }) {
  const { ui, diagram } = useAppState();
  const { t } = useT();
  const [picking, setPicking] = useState(!ui.scenario);
  const [condDialog, setCondDialog] = useState(false);

  const scenario = ui.scenario ? getScenario(ui.scenario.scenarioId) : undefined;
  const stepIndex = ui.scenario?.stepIndex ?? 0;
  const step = scenario?.steps[stepIndex];
  const isLast = scenario ? stepIndex >= scenario.steps.length - 1 : false;

  // 按元件角色在当前图纸中解析：无任何可匹配元件的场景禁用
  const resolved = resolveScenarioRoles(diagram);
  const unusable = new Set(SCENARIOS.filter((s) => !s.allNodes.some((role) => resolved.nodes[role])).map((s) => s.id));
  const missingLabels = resolved.missing.map((r) => ROLE_LABELS[r] ?? r);

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
          {diagram.nodes.length > 0 && missingLabels.length > 0 && (
            <div style={{ fontSize: 12, color: "#b06d1a", background: "#fdf3e7", border: "1px solid #e0a34b", borderRadius: 6, padding: "8px 10px", lineHeight: 1.7 }}>
              ⚠️ {t("当前图纸缺少部分演示元件")}：{missingLabels.join("、")}。
              <button
                onClick={() => loadDiagram(createDemoMachineDiagram())}
                style={{ marginLeft: 6, fontSize: 12, padding: "2px 8px", borderRadius: 5, border: "1px solid var(--border)", background: "var(--input-bg)", color: "var(--text)", cursor: "pointer" }}
              >{t("加载咖啡机示例图")}</button>
            </div>
          )}
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              disabled={unusable.has(s.id)}
              onClick={() => { enterScenario(s.id, 0); setPicking(false); }}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "12px 14px",
                borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)",
                color: "var(--text)", cursor: unusable.has(s.id) ? "not-allowed" : "pointer", fontSize: 13.5, textAlign: "left",
                opacity: unusable.has(s.id) ? 0.45 : 1,
              }}
              onMouseEnter={(e) => { if (!unusable.has(s.id)) { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.background = "var(--accent-soft)"; } }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--surface)"; }}
            >
              <span style={{ fontSize: 20 }}>{s.icon}</span>
              <span style={{ flex: 1 }}>{s.title}</span>
              {unusable.has(s.id)
                ? <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{t("缺少元件")}</span>
                : <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{s.steps.length} {t("步")}</span>}
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
          onClick={() => { if (stepIndex > 0) setScenarioStep(stepIndex - 1); }}
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
