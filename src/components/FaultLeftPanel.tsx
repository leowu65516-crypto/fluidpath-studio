import { useMemo, useState } from "react";
import { focusRectAnimated, setSelection, setUI, useAppState } from "../store";
import { nodeBBox, pipePolyline, polylineBBox } from "../geometry";
import { useT } from "../i18n";
import { toast } from "../toast";
import { PromptDialog } from "./PromptDialog";
import { addFaultNote, clearFaultNotes, faultNotes, removeFaultNote } from "../fault-codes/notes";
import { EMPTY_PROFILE, resolveFaultTargets } from "../fault-codes/profile";
import { strongestCauseForCode } from "../fault-codes/consult";
import { selectFaultCodes, selectKbPart, selectKbSymptom, useDiagnosticSession } from "../fault-codes/session";

/**
 * 故障模式左栏（1.48.0）：故障码常驻 + 故障模式专用标注/高亮 + 工作台步骤。
 * 常规元件库只在编辑模式出现；这里的内容也只在故障模式渲染。
 */
export function FaultLeftPanel({ collapsed = false, onToggle }: { collapsed?: boolean; onToggle?: () => void }) {
  const { diagram, ui } = useAppState();
  const session = useDiagnosticSession();
  const { t, lang } = useT();
  const [query, setQuery] = useState("");
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const profile = diagram.settings.diagnosticProfile ?? EMPTY_PROFILE;
  const notes = faultNotes(diagram);
  const codes = useMemo(() => {
    const text = query.trim().toLowerCase();
    return profile.diagnostics.filter(fault => !text || `${fault.code} ${fault.label.zh} ${fault.label.en}`.toLowerCase().includes(text));
  }, [profile, query]);
  const label = (fault: { label: { zh?: string; en?: string }; code: string }) => lang === "en" ? fault.label.en || fault.label.zh || fault.code : fault.label.zh || fault.label.en || fault.code;
  const selectionCount = ui.selection.nodes.length + ui.selection.pipes.length;

  function focusBoxes(nodeIds: string[], pipeIds: string[]) {
    const boxes = [
      ...diagram.nodes.filter(node => nodeIds.includes(node.id)).map(nodeBBox),
      ...diagram.pipes.filter(pipe => pipeIds.includes(pipe.id)).flatMap(pipe => {
        const points = pipePolyline(pipe, diagram.nodes);
        return points ? [polylineBBox(points)] : [];
      }),
    ];
    if (!boxes.length) return false;
    const left = Math.min(...boxes.map(box => box.x)), top = Math.min(...boxes.map(box => box.y));
    const right = Math.max(...boxes.map(box => box.x + box.w)), bottom = Math.max(...boxes.map(box => box.y + box.h));
    focusRectAnimated(left, top, right, bottom, []);
    return true;
  }

  function selectCode(faultId: string) {
    const fault = profile.diagnostics.find(item => item.id === faultId);
    if (!fault) return;
    selectFaultCodes([fault.id]);
    setUI({ faultStep: 4 });
    const strongest = profile.symptoms?.length ? strongestCauseForCode(profile, fault.code) : null;
    if (strongest) {
      selectKbSymptom(strongest.symptomId);
      selectKbPart(strongest.groupId);
    }
    const targets = resolveFaultTargets(diagram, profile, fault);
    if (targets.nodes.length + targets.pipes.length) {
      focusBoxes(targets.nodes, targets.pipes);
      setSelection({ nodes: targets.nodes, pipes: targets.pipes });
    } else {
      toast(t("该代码还没有画布落点：到「画布落点」步骤绑定后才会高亮"));
    }
  }

  function locateNote(noteId: string) {
    const note = notes.find(item => item.id === noteId);
    if (!note) return;
    setSelection({ nodes: note.nodeIds, pipes: note.pipeIds });
    if (!focusBoxes(note.nodeIds, note.pipeIds)) toast(t("这条备注关联的对象已被删除或隐藏"));
  }

  function addNote() {
    if (selectionCount === 0) {
      toast(t("先在画布选择元件或管路，再添加备注"));
      return;
    }
    setNoteDraft("");
  }

  const steps = [
    { index: 1 as const, label: t("图纸") },
    { index: 2 as const, label: t("故障库") },
    { index: 3 as const, label: t("画布落点") },
    { index: 4 as const, label: t("演练") },
  ];

  return <div className={`library fault-left${collapsed ? " collapsed" : ""}`} data-testid="fault-left-panel">
    <div className={`panel-title${collapsed ? " vertical" : ""}`}>
      <button className="panel-toggle" onClick={onToggle} title={collapsed ? t("展开故障面板") : t("折叠故障面板")} aria-label={collapsed ? t("展开故障面板") : t("折叠故障面板")}>
        {collapsed ? "▶" : "◀"}
      </button>
      {!collapsed && <span>🧭 {t("故障")}</span>}
      {collapsed && <span className="vertical-text">{t("故障")}</span>}
    </div>
    {!collapsed && <div className="fault-left-scroll">
      <section className="fl-section">
        <div className="fl-title">{t("故障码")} <em>{codes.length}</em></div>
        <input className="fl-search" aria-label={t("搜索代码或名称")} placeholder={t("搜索代码或名称")} value={query} onChange={event => setQuery(event.target.value)} />
        <div className="fl-code-list">
          {codes.map(fault => {
            const targets = resolveFaultTargets(diagram, profile, fault);
            const missingScope = targets.nodes.length + targets.pipes.length === 0;
            return <button key={fault.id} className={`fl-code${session.selectedIds.includes(fault.id) ? " on" : ""}${missingScope ? " scope-missing" : ""}`}
              title={missingScope ? t("该代码还没有画布落点") : label(fault)} onClick={() => selectCode(fault.id)}>
              <b>{fault.code}</b><span>{label(fault)}</span>{missingScope && <i>⚠</i>}
            </button>;
          })}
          {!codes.length && <p className="fl-hint">{profile.diagnostics.length ? t("没有匹配的故障码") : t("还没有故障码：到「故障库」步骤导入或新建")}</p>}
        </div>
      </section>

      <section className="fl-section">
        <div className="fl-title">{t("标注与高亮")} <em>{notes.length}</em></div>
        <p className="fl-hint">{t("先在画布选择元件/管路，再添加备注；备注和描边只在故障模式显示，随图纸保存。")}</p>
        <div className="fl-actions">
          <button className="btn mini" onClick={addNote} disabled={selectionCount === 0}>＋ {t("为选中对象添加备注")}</button>
          {notes.length > 0 && <button className="btn ghost mini" onClick={() => clearFaultNotes()}>{t("清空")}</button>}
        </div>
        <div className="fl-note-list">
          {notes.map((note, index) => <div className="fl-note" key={note.id}>
            <button className="fl-note-text" onClick={() => locateNote(note.id)} title={note.text}><i>{index + 1}</i>{note.text}</button>
            <button className="btn ghost sq" onClick={() => removeFaultNote(note.id)} aria-label={t("删除备注")}>×</button>
          </div>)}
        </div>
      </section>

      <section className="fl-section">
        <div className="fl-title">{t("工作台")}</div>
        <div className="fl-steps">
          {steps.map(step => <button key={step.index} className={ui.faultStep === step.index ? "on" : ""} onClick={() => setUI({ faultStep: step.index })}>{step.index}. {step.label}</button>)}
        </div>
      </section>
    </div>}
    {noteDraft !== null && <PromptDialog title={t("添加故障备注")} label={t("备注内容")} placeholder={t("例如：拆机检查奶管是否折弯")} multiline
      onSubmit={text => { addFaultNote(text); setNoteDraft(null); }} onClose={() => setNoteDraft(null)} />}
  </div>;
}
