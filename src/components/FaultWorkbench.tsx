import { useAppState, setUI } from "../store";
import { useT } from "../i18n";
import { faultWorkbenchStatus, type FaultStage } from "../fault-codes/workbench";
import { EMPTY_PROFILE } from "../fault-codes/profile";
import { selectFaultCodes, useDiagnosticSession } from "../fault-codes/session";
import { restoreFaultDrill, startFaultDrill } from "../fault-codes/drill";
import { deriveFaultJourney } from "../fault-codes/journey";
import { startBindingWizard } from "./BindingWizard";
import { toast } from "../toast";

const STAGE_TEXT: Record<FaultStage, { zh: string; en: string }> = {
  "no-diagram": { zh: "先准备一张图纸", en: "Need a drawing first" },
  "no-library": { zh: "先准备故障知识库", en: "Need a fault library" },
  unbound: { zh: "还差画布落点", en: "Bind part groups" },
  ready: { zh: "可以开始演练", en: "Ready to drill" },
};

/**
 * 故障工作台（1.50.0）：步骤导航 + 永远可见的"下一步"。
 * 「下一步」直接从当前状态推导，点按钮就执行真正动作（绑定/选码/演练/还原），
 * 让每次操作之后都有明确的下一站，而不是停在半路。
 */
export function FaultWorkbench() {
  const { diagram, ui } = useAppState();
  const session = useDiagnosticSession();
  const { t, lang } = useT();
  const profile = diagram.settings.diagnosticProfile ?? EMPTY_PROFILE;
  const status = faultWorkbenchStatus(diagram, profile);
  const current = ui.faultStep ?? (status.stage === "no-diagram" ? 1 : status.stage === "no-library" ? 2 : status.stage === "unbound" ? 3 : 4);
  const selectedCodeId = session.selectedIds[0];
  const journey = deriveFaultJourney(diagram, profile, { step: current, selectedCodeId, drillActive: !!session.drill });
  const steps = [
    { index: 1 as const, label: t("图纸"), done: status.hasDiagram, note: "" },
    { index: 2 as const, label: t("故障库"), done: status.hasLibrary, note: status.hasLibrary ? `${status.codeCount}` : "" },
    { index: 3 as const, label: t("画布落点"), done: status.boundGroupCount > 0, note: status.groupCount ? `${status.boundGroupCount}/${status.groupCount}` : "" },
    { index: 4 as const, label: t("演练"), done: status.drillCount > 0, note: status.drillCount ? `${status.drillCount}` : "" },
  ];
  const stageLabel = lang === "en" ? STAGE_TEXT[status.stage].en : STAGE_TEXT[status.stage].zh;

  function runJourney() {
    switch (journey.kind) {
      case "needs-diagram": setUI({ faultStep: 1 }); return;
      case "needs-library": setUI({ faultStep: 2 }); return;
      case "bind-more": {
        setUI({ faultStep: 3 });
        startBindingWizard();
        toast(`${t("继续绑定：还有")} ${journey.remaining ?? 0} ${t("个部件组")}`);
        return;
      }
      case "bind-done": {
        setUI({ faultStep: 4 });
        if (journey.codeId) {
          selectFaultCodes([journey.codeId]);
          toast(`${t("全部绑定完成，已选中")} ${journey.code}：${t("点「演练故障」看差异")}`);
        }
        return;
      }
      case "needs-binding":
      case "no-scope": {
        setUI({ faultStep: 3 });
        if (!startBindingWizard(journey.groups)) startBindingWizard();
        if (journey.code) toast(`${t("正在绑定")} ${journey.code} ${t("引用的部件组")}`);
        return;
      }
      case "drill-or-bind":
      case "drill-ready": {
        if (!journey.codeId) return;
        setUI({ faultStep: 4 });
        selectFaultCodes([journey.codeId]);
        const result = startFaultDrill(journey.codeId);
        if (result.ok) toast(t("已开始演练：画布显示新增停流/恢复流动差异；点顶部「还原演练」恢复"));
        else toast(t("该故障码还没有演练配置：请在「故障演练配置」里添加注入动作"), "error");
        return;
      }
      case "select-code": {
        setUI({ faultStep: 4 });
        if (journey.codeId) {
          selectFaultCodes([journey.codeId]);
          toast(`${t("已选中")} ${journey.code}：${t("点「演练故障」看水路变化")}`);
        }
        return;
      }
      case "no-drill-config": {
        setUI({ faultStep: 4 });
        if (journey.codeId) selectFaultCodes([journey.codeId]);
        toast(t("先在「故障演练配置」里添加注入动作，再点「演练故障」"));
        return;
      }
      case "drill-live": restoreFaultDrill(); toast(t("已还原到演练前状态；可继续选下一个代码")); return;
    }
  }

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
    <div className={`fw-next fw-next-${journey.kind}`} data-testid="fault-next" data-kind={journey.kind}>
      <span className="fw-next-label">{t("下一步")}</span>
      <p>{journey.detail[lang]}</p>
      <button className="btn mini" onClick={runJourney}>{journey.cta[lang]} →</button>
    </div>
    {session.drill && <div className="fw-drill-live">
      <b>⚠ {t("演练进行中")} · {session.drill.faultCode}</b>
      <span>{t("新增停流")} {session.drill.changes.stoppedPipes.length} · {t("恢复流动")} {session.drill.changes.flowingPipes.length}</span>
      <button className="btn mini" onClick={() => { restoreFaultDrill(); toast(t("已还原到演练前状态；可继续选下一个代码")); }}>{t("还原演练")}</button>
    </div>}
  </section>;
}
