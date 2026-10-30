import { useAppState, setUI } from "../store";
import { useT } from "../i18n";
import { faultWorkbenchStatus, type FaultStage } from "../fault-codes/workbench";
import { EMPTY_PROFILE } from "../fault-codes/profile";
import { useDiagnosticSession } from "../fault-codes/session";
import { restoreFaultDrill } from "../fault-codes/drill";

const STAGE_TEXT: Record<FaultStage, { zh: string; en: string }> = {
  "no-diagram": { zh: "先准备一张图纸", en: "Need a drawing first" },
  "no-library": { zh: "先准备故障知识库", en: "Need a fault library" },
  unbound: { zh: "还差画布落点", en: "Bind part groups" },
  ready: { zh: "可以开始演练", en: "Ready to drill" },
};

/**
 * 故障工作台步骤条（1.48.0）：右侧工作区的唯一"导航"。
 * 四步可点击切换；每一步的具体操作在下方对应步骤面板里，不再把所有入口堆在一起。
 */
export function FaultWorkbench() {
  const { diagram, ui } = useAppState();
  const session = useDiagnosticSession();
  const { t, lang } = useT();
  const profile = diagram.settings.diagnosticProfile ?? EMPTY_PROFILE;
  const status = faultWorkbenchStatus(diagram, profile);
  const current = ui.faultStep ?? (status.stage === "no-diagram" ? 1 : status.stage === "no-library" ? 2 : status.stage === "unbound" ? 3 : 4);
  const steps = [
    { index: 1 as const, label: t("图纸"), done: status.hasDiagram, note: "" },
    { index: 2 as const, label: t("故障库"), done: status.hasLibrary, note: status.hasLibrary ? `${status.codeCount}` : "" },
    { index: 3 as const, label: t("画布落点"), done: status.boundGroupCount > 0, note: status.groupCount ? `${status.boundGroupCount}/${status.groupCount}` : "" },
    { index: 4 as const, label: t("演练"), done: status.drillCount > 0, note: status.drillCount ? `${status.drillCount}` : "" },
  ];
  const stageLabel = lang === "en" ? STAGE_TEXT[status.stage].en : STAGE_TEXT[status.stage].zh;

  return <section className="fault-workbench" data-stage={status.stage} data-testid="fault-workbench">
    <div className="fw-head">
      <strong>🧭 {t("故障工作台")}</strong>
      <span className="fw-stage">{stageLabel}</span>
    </div>
    <ol className="fw-steps fw-steps-nav" role="tablist" aria-label={t("故障工作台")}>
      {steps.map(step => <li key={step.index} className={`${step.done ? "done" : ""}${current === step.index ? " current" : ""}`}>
        <button role="tab" aria-selected={current === step.index} onClick={() => setUI({ faultStep: step.index })}>
          <i>{step.done ? "✓" : step.index}</i>{step.label}{step.note ? <em>{step.note}</em> : null}
        </button>
      </li>)}
    </ol>
    {session.drill && <div className="fw-drill-live">
      <b>⚠ {t("演练进行中")} · {session.drill.faultCode}</b>
      <span>{t("新增停流")} {session.drill.changes.stoppedPipes.length} · {t("恢复流动")} {session.drill.changes.flowingPipes.length}</span>
      <button className="btn mini" onClick={() => restoreFaultDrill()}>{t("还原演练")}</button>
    </div>}
  </section>;
}
