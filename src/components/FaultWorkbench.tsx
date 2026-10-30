import { useState } from "react";
import { useAppState } from "../store";
import { useT } from "../i18n";
import { faultWorkbenchStatus, type FaultStage } from "../fault-codes/workbench";
import { EMPTY_PROFILE } from "../fault-codes/profile";
import { restoreFaultDrill } from "../fault-codes/drill";
import { useDiagnosticSession } from "../fault-codes/session";

const STAGE_TEXT: Record<FaultStage, { zh: string; en: string }> = {
  "no-diagram": { zh: "先准备一张图纸", en: "Need a drawing first" },
  "no-library": { zh: "先准备故障知识库", en: "Need a fault library" },
  unbound: { zh: "还差画布落点", en: "Bind part groups" },
  ready: { zh: "可以开始演练", en: "Ready to drill" },
};

export function FaultWorkbench({ onOpenJson, onOpenSmart, onLoadDemo, onLoadSample, onImport, onStartBinding, onStartDrill }: {
  onOpenJson: () => void;
  onOpenSmart: () => void;
  onLoadDemo: () => void;
  onLoadSample: () => void;
  onImport: () => void;
  onStartBinding: () => void;
  onStartDrill: () => void;
}) {
  const { diagram } = useAppState();
  const session = useDiagnosticSession();
  const { t, lang } = useT();
  const [collapsed, setCollapsed] = useState(false);
  const profile = diagram.settings.diagnosticProfile ?? EMPTY_PROFILE;
  const status = faultWorkbenchStatus(diagram, profile);
  const stageLabel = status ? (lang === "en" ? STAGE_TEXT[status.stage].en : STAGE_TEXT[status.stage].zh) : "";
  const selectedFault = profile.diagnostics.find(fault => session.selectedIds.includes(fault.id));
  const activeDrill = session.drill;

  const steps = [
    { key: "diagram", label: t("图纸"), done: !!status?.hasDiagram },
    { key: "library", label: t("故障库"), done: !!status?.hasLibrary },
    { key: "binding", label: t("画布落点"), done: !!status && status.boundGroupCount > 0, note: status && status.groupCount ? `${status.boundGroupCount}/${status.groupCount}` : "" },
    { key: "drill", label: t("演练"), done: (status?.drillCount ?? 0) > 0 },
  ];
  const currentStep = steps.findIndex(step => !step.done);

  return <section className="fault-workbench" data-stage={status?.stage ?? "unknown"} data-testid="fault-workbench">
    <div className="fw-head">
      <strong>🧭 {t("故障工作台")}</strong>
      <span className="fw-stage">{stageLabel}</span>
      <button className="btn ghost sq" onClick={() => setCollapsed(value => !value)} aria-label={collapsed ? t("展开") : t("收起")}>{collapsed ? "▸" : "▾"}</button>
    </div>
    {!collapsed && <>
      <ol className="fw-steps">
        {steps.map((step, stepIndex) => <li key={step.key} className={`${step.done ? "done" : ""}${stepIndex === currentStep ? " current" : ""}`}>
          <i>{step.done ? "✓" : stepIndex + 1}</i>{step.label}{step.note ? <em>{step.note}</em> : null}
        </li>)}
      </ol>

      {activeDrill ? <div className="fw-drill-live">
        <b>⚠ {t("演练进行中")} · {activeDrill.faultCode}</b>
        <span>{t("新增停流")} {activeDrill.changes.stoppedPipes.length} · {t("恢复流动")} {activeDrill.changes.flowingPipes.length}</span>
        <button className="btn mini" onClick={() => restoreFaultDrill()}>{t("还原演练")}</button>
      </div> : null}

      {status?.stage === "no-diagram" && <div className="fw-card">
        <b>{t("故障模式需要一张图纸，才能把故障定位到具体水路。")}</b>
        <div className="fw-actions">
          <button className="btn" onClick={onOpenJson}>📂 {t("打开图纸")}</button>
          <button className="btn" onClick={onOpenSmart}>✨ {t("智能绘图生成")}</button>
          <button className="btn ghost" onClick={onLoadDemo}>{t("载入示例（图纸+知识库）")}</button>
        </div>
      </div>}

      {status?.stage === "no-library" && <div className="fw-card">
        <b>{t("当前图纸还没有故障代码或知识库。")}</b>
        <div className="fw-actions">
          <button className="btn" onClick={onLoadSample}>{t("加载示例知识库")}</button>
          <button className="btn ghost" onClick={onImport}>{t("导入知识库")}</button>
          <button className="btn ghost" onClick={onLoadDemo}>{t("载入示例（图纸+知识库）")}</button>
        </div>
        <p className="fw-hint">{t("也可以向下滚动，用「新建代码」手工配置一个故障码。")}</p>
      </div>}

      {status?.stage === "unbound" && <div className="fw-card">
        <b>{t("故障码还没有落到画布上，选中代码时不会出现任何高亮。")}</b>
        <p className="fw-hint">
          {t("未绑定部件组")} {status.unboundGroupCount} / {status.groupCount}
          {status.codesWithoutScope > 0 ? ` · ${t("无排查范围的代码")} ${status.codesWithoutScope}` : ""}
        </p>
        <div className="fw-actions">
          <button className="btn" onClick={onStartBinding} disabled={status.unboundGroupCount === 0}>{t("开始绑定向导")}</button>
          <button className="btn ghost" onClick={onLoadSample}>{t("导入/加载示例知识库")}</button>
        </div>
      </div>}

      {status?.stage === "ready" && <div className="fw-card">
        <b>{t("已就绪：选中一个故障码，查看排查范围，或直接演练故障。")}</b>
        <p className="fw-hint">{t("可演练的故障码")} {status.drillCount} · {t("可定位的故障码")} {status.readyCodes} / {status.codeCount}</p>
        <div className="fw-actions">
          <button className="btn" onClick={onStartDrill} disabled={!selectedFault}>{selectedFault ? `${t("演练此代码")}（${selectedFault.code}）` : t("先选中一个故障码")}</button>
          {status.unboundGroupCount > 0 && <button className="btn ghost" onClick={onStartBinding}>{t("继续绑定剩余部件组")}（{status.unboundGroupCount}）</button>}
        </div>
      </div>}

      <div className="fw-footer">
        <button className="btn ghost mini" onClick={onLoadDemo}>▶ {t("3 分钟示例演练")}</button>
        {status?.stage !== "no-diagram" && <button className="btn ghost mini" onClick={onOpenJson}>📂 {t("打开其他图纸")}</button>}
      </div>
    </>}
  </section>;
}
