import { useState } from "react";
import { useT } from "../i18n";
import { createFaultCode } from "../fault-codes/actions";
import { selectFaultCodes } from "../fault-codes/session";
import { store } from "../store";

/**
 * 新建故障码三步向导（1.48.0）：编码名称 → 绑定排查范围 → 保存/导出。
 * 让"自己配一个故障"也有明确的用户旅程，而不是一个裸表单。
 */
export function NewCodeWizard({ canEdit, onStartBinding, onSave, onExport, onError, onDone, onCreated }: {
  canEdit: boolean;
  onStartBinding: (groupId: string) => void;
  onSave: () => void;
  onExport: () => void;
  onError: (message: string) => void;
  onDone?: (code?: string) => void;
  onCreated?: (created: { code: string; faultId: string; groupId: string }) => void;
}) {
  const { t, lang } = useT();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [created, setCreated] = useState<{ faultId: string; groupId: string; code: string } | null>(null);

  function create() {
    if (!code.trim()) return;
    try {
      const faultId = createFaultCode(code, title, lang);
      const profile = store.get().diagram.settings.diagnosticProfile;
      const fault = profile?.diagnostics.find(item => item.id === faultId);
      const groupId = fault?.highlightBindings[0]?.groupId ?? "";
      const info = { faultId, groupId, code: code.trim() };
      setCreated(info);
      selectFaultCodes([faultId]);
      onCreated?.(info);
      // 不再自动跳主步骤/自动开绑定向导：先让用户在这里明确选"去画布绑定"还是"稍后绑定"。
      setStep(2);
    } catch (error) {
      onError((error as Error).message);
    }
  }

  function reset() {
    setStep(1); setCode(""); setTitle(""); setCreated(null);
  }

  return <section className="fault-card new-code-wizard" data-testid="new-code-wizard">
    <div className="fault-section-title"><strong>{t("新建故障码")}</strong><span className="fault-badge">{step} / 3</span></div>
    <ol className="ncw-steps">
      <li className={step === 1 ? "current" : step > 1 ? "done" : ""}>{t("填写编码与名称")}</li>
      <li className={step === 2 ? "current" : step > 2 ? "done" : ""}>{t("绑定排查范围")}</li>
      <li className={step === 3 ? "current" : ""}>{t("保存与导出")}</li>
    </ol>
    {step === 1 && <div className="fault-form">
      <p className="fault-hint">{t("先给它一个报警码和名称；创建后马上去画布绑定范围，最后保存文件或导出知识库。")}</p>
      <label>{t("故障码")}<input value={code} required maxLength={120} disabled={!canEdit} onChange={event => setCode(event.target.value)} placeholder="E01" /></label>
      <label>{t("故障名称")}<input value={title} maxLength={200} disabled={!canEdit} onChange={event => setTitle(event.target.value)} /></label>
      <div className="fault-actions">
        <button className="btn" disabled={!canEdit || !code.trim()} onClick={create}>{t("创建故障码")} →</button>
        <button className="btn ghost" onClick={reset}>{t("取消")}</button>
      </div>
    </div>}
    {step === 2 && created && <div className="fault-form">
      <p className="fault-hint"><b>{created.code}</b> {t("已创建，但排查范围还没绑定。绑定后它才能在画布高亮和演练。")}</p>
      <ol className="ncw-next">
        <li><i>1</i><span>{t("去画布绑定（推荐）：打开绑定向导，把它的部件组指到本图元件/管路。")}</span></li>
        <li><i>2</i><span>{t("稍后绑定：先保存/导出，之后随时回第③步补绑。")}</span></li>
      </ol>
      <div className="fault-actions">
        <button className="btn" disabled={!canEdit || !created.groupId} onClick={() => onStartBinding(created.groupId)}>{t("去画布绑定（推荐）")} →</button>
        <button className="btn ghost" onClick={() => setStep(3)}>{t("稍后绑定，先保存")} →</button>
      </div>
    </div>}
    {step === 3 && created && <div className="fault-form">
      <p className="fault-hint">{t("「{code}」已创建。保存到本地会写进图纸 JSON；导出知识库可交给同事或作为模板。").replace("{code}", created.code)}</p>
      <div className="fault-actions">
        <button className="btn" onClick={onSave}>{t("保存到本地")}</button>
        <button className="btn ghost" onClick={onExport}>{t("导出知识库")}</button>
        <button className="btn ghost" onClick={() => { const finished = created?.code; reset(); onDone?.(finished); }}>{t("完成")}</button>
      </div>
    </div>}
  </section>;
}
