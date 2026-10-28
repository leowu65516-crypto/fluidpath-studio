import { useEffect, useMemo, useRef, useState } from "react";
import { store, useAppState } from "../store";
import { setCachedPipes } from "../geometry";
import { useT } from "../i18n";
import { diagnosisSummary } from "../diagnostics";
import { engineeringSummary, engineeringIssueLabel } from "../smart-draw/engineering";
import { SMART_TEMPLATES, buildSmartTemplate, smartTemplateCounts } from "../smart-draw/templates";
import { parseSmartText } from "../smart-draw/intent";
import { trackSmart } from "../smart-draw/telemetry";
import type { SmartBuildResult, SmartOptionValue, SmartTemplate } from "../smart-draw/types";
import { prefersReducedMotion } from "../flow";
import { DiagramPreview } from "./DiagramPreview";
import type { Diagram } from "../types";

function previewDiagram(result: SmartBuildResult): Diagram {
  return {
    id: "smart-preview",
    name: "smart-preview",
    nodes: result.nodes,
    pipes: result.pipes,
    settings: { showGrid: true, background: "#eef2f7", globalAnimationPlaying: false, workConditions: result.conditions },
  };
}

export function SmartDrawingWizard({
  onClose,
  onInserted,
}: {
  onClose: () => void;
  onInserted: (result: SmartBuildResult, mode: "replace" | "append") => void;
}) {
  const { diagram } = useAppState();
  const { t, lang } = useT();
  const isZh = lang === "zh";
  const hasContent = diagram.nodes.length > 0 || diagram.pipes.length > 0;
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [templateId, setTemplateId] = useState<string>("water");
  const [options, setOptions] = useState<Record<string, SmartOptionValue>>({});
  const [freeText, setFreeText] = useState("");
  const [intentOptionKeys, setIntentOptionKeys] = useState<Set<string>>(new Set());
  const [intentSummary, setIntentSummary] = useState<string[]>([]);
  const [mode, setMode] = useState<"replace" | "append">(hasContent ? "append" : "replace");
  const modalRef = useRef<HTMLDivElement>(null);
  const lastAutoText = useRef("");
  // 遮罩只在入场时做背景模糊，随后退回静态 scrim：底下是每帧重绘的画布，
  // 全程 backdrop-filter 会持续重采样，在集显机器上是可感知的掉帧来源。
  const [overlayBlur, setOverlayBlur] = useState(() => !prefersReducedMotion());
  useEffect(() => {
    if (!overlayBlur) return;
    const timer = window.setTimeout(() => setOverlayBlur(false), 260);
    return () => window.clearTimeout(timer);
  }, [overlayBlur]);

  const template = SMART_TEMPLATES.find((tpl) => tpl.id === templateId) ?? SMART_TEMPLATES[0];
  const result = useMemo(() => buildSmartTemplate(template, options), [template, options]);
  // 预览诊断会临时改写引擎缓存；算完立即恢复当前画布，避免关闭向导后画布沿用预览的流动结果。
  const eng = useMemo(() => engineeringSummary(previewDiagram(result)), [result]);
  const diag = useMemo(() => {
    const summary = diagnosisSummary(previewDiagram(result));
    const live = store.get().diagram;
    setCachedPipes(live.pipes, live.nodes);
    return summary;
  }, [result]);

  useEffect(() => () => {
    const live = store.get().diagram;
    setCachedPipes(live.pipes, live.nodes);
  }, []);
  const intent = useMemo(() => parseSmartText(freeText), [freeText]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = modalRef.current;
    const focusable = () => Array.from(root?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ) ?? []).filter((el) => el.offsetParent !== null);
    focusable()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); previous?.focus?.(); };
  }, [onClose]);

  function pickTemplate(next: SmartTemplate) {
    setTemplateId(next.id);
    setOptions(Object.fromEntries(next.options.map((o) => [o.key, o.default])));
    setIntentOptionKeys(new Set());
    setIntentSummary([]);
    // 没有配置项的模板直接到预览，避免出现一个空的“配置”步骤
    setStep(next.options.length ? 2 : 3);
    trackSmart("template_select", { template: next.id });
  }

  // 自由描述命中模板时自动进入第 2 步；同一段文本只自动推进一次，避免用户返回时被反复弹走
  useEffect(() => {
    if (step !== 1) return;
    const text = freeText.trim();
    if (text.length < 4 || text === lastAutoText.current) return;
    const parsed = parseSmartText(text);
    const timer = window.setTimeout(() => {
      if (!parsed.templateId) {
        if (text.length >= 4) trackSmart("intent_miss", { text: text.slice(0, 40) });
        return;
      }
      const next = SMART_TEMPLATES.find((tpl) => tpl.id === parsed.templateId);
      if (!next) return;
      lastAutoText.current = text;
      setTemplateId(next.id);
      setOptions({ ...Object.fromEntries(next.options.map((o) => [o.key, o.default])), ...parsed.options });
      setIntentOptionKeys(new Set(Object.keys(parsed.options)));
      setIntentSummary(parsed.understood);
      // 有配置项时进入第 2 步；没有配置项直接到预览，避免空步骤
      setStep(next.options.length ? 2 : 3);
      trackSmart("intent_hit", { template: next.id });
      trackSmart("intent_auto_advance", { template: next.id });
    }, 650);
    return () => window.clearTimeout(timer);
  }, [freeText, step]);

  return (
    <div className={`smart-modal-overlay${overlayBlur ? " blurring" : ""}`} data-ui="1" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="smart-modal" role="dialog" aria-modal="true" aria-label={t("智能绘图")} ref={modalRef}>
        <header className="smart-modal-head">
          <div>
            <div className="smart-modal-title">✨ {t("智能绘图")}</div>
            <div className="smart-modal-sub">{t("描述或选择模板，快速得到可编辑液路图")}</div>
            <div className="smart-head-rule" aria-hidden="true" />
          </div>
          <button className="btn ghost sq" onClick={onClose} aria-label={t("关闭")}>×</button>
        </header>

        <div className="smart-steps" aria-label={t("步骤")}>
          {[1, 2, 3].map((n) => (
            <div key={n} className={`smart-step ${step === n ? "on" : ""} ${step > n ? "done" : ""}`} aria-current={step === n ? "step" : undefined}>
              <span className="smart-step-num">{step > n ? "✓" : n}</span>
              <span>{n === 1 ? t("选场景") : n === 2 ? t("选配置") : t("预览插入")}</span>
            </div>
          ))}
        </div>

        <div className="smart-modal-body">
          {step === 1 && (
            <div className="smart-step-pane">
              <label className="smart-free-label">
                {t("直接描述你的想法（咖啡机液路）")}
                <textarea
                  className="smart-free-input"
                  value={freeText}
                  onChange={(e) => setFreeText(e.target.value)}
                  placeholder={t("例如：双锅炉咖啡机，带两个奶罐、奶泵、蒸汽杆和一条清洗旁通")}
                  rows={2}
                />
              </label>
              {freeText.trim() && (
                <div className="smart-intent">
                  <span className="smart-intent-label">{t("我理解到：")}</span>
                  {intent.understood.length ? intent.understood.map((x, i) => <span key={x} className="smart-chip" style={{ ["--i" as string]: i }}>{x}</span>) : <span className="smart-muted">{t("还没有识别到场景，先从下面选一个")}</span>}
                  {intent.unknown.length > 0 && <span className="smart-muted">{t("未完全识别：")}{intent.unknown.join("、")}</span>}
                </div>
              )}
              <div className="smart-template-grid">
                {SMART_TEMPLATES.map((tpl) => {
                  const preview = buildSmartTemplate(tpl, {});
                  const counts = smartTemplateCounts(tpl);
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      className={`smart-template-card ${templateId === tpl.id ? "on" : ""}`}
                      aria-pressed={templateId === tpl.id}
                      onClick={() => pickTemplate(tpl)}
                    >
                      {templateId === tpl.id && <span className="smart-card-check" aria-hidden="true">✓</span>}
                      <div className="smart-template-preview">
                        <DiagramPreview nodes={preview.nodes} pipes={preview.pipes} compact symbolProfile={diagram.settings.symbolProfile} />
                      </div>
                      <div className="smart-template-title">{t(tpl.titleZh)}</div>
                      <div className="smart-template-desc">{t(tpl.descZh)}</div>
                      <div className="smart-template-tags">
                        {(isZh ? tpl.tagsZh : tpl.tagsEn).map((tag) => <span key={tag} className="smart-tag">{tag}</span>)}
                        <span className="smart-tag muted">{counts.nodes} {t("元件")}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="smart-step-pane">
              <div className="smart-pane-title">{t(template.titleZh)}</div>
              <div className="smart-pane-desc">{t(template.descZh)}</div>
              {intentSummary.length > 0 && (
                <div className="smart-intent-applied">✓ {t("已根据你的描述选择：")}{intentSummary.join(" · ")}</div>
              )}
              {template.options.length === 0 ? (
                <div className="smart-empty-note">{t("这个模板不需要额外配置，直接进入预览即可。")}</div>
              ) : (
                <div className="smart-options">
                  {template.options.map((opt) => {
                    const checked = options[opt.key] ?? opt.default;
                    return (
                      <label key={opt.key} className={`smart-option ${checked ? "on" : ""}`}>
                        <input
                          type="checkbox"
                          checked={Boolean(checked)}
                          onChange={(e) => {
                            setOptions((prev) => ({ ...prev, [opt.key]: e.target.checked }));
                            setIntentOptionKeys((prev) => { const next = new Set(prev); next.delete(opt.key); return next; });
                          }}
                        />
                        <span>{t(opt.labelZh)}</span>
                        {intentOptionKeys.has(opt.key) && <span className="smart-option-source">{t("来自你的描述")}</span>}
                      </label>
                    );
                  })}
                </div>
              )}
              <div className="smart-option-summary">
                {t("将生成")} {result.nodes.length} {t("个元件")} · {result.pipes.length} {t("段管路")}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="smart-step-pane">
              <div className="smart-preview-wrap">
                <DiagramPreview nodes={result.nodes} pipes={result.pipes} className="smart-preview" showLabels symbolProfile={diagram.settings.symbolProfile} />
              </div>
              <div className="smart-summary">
                <span>✓ {result.nodes.length} {t("个元件")}</span>
                <span>✓ {result.pipes.length} {t("段管路")}</span>
                {diag.errors === 0 ? (
                  <span className="smart-ok">✓ {t("结构检查通过")}</span>
                ) : (
                  <span className="smart-warn">⚠ {t("结构检查有")} {diag.errors} {t("处问题")}</span>
                )}
                {eng.errors + eng.warnings === 0 ? (
                  <span className="smart-ok">✓ {t("工程检查通过")}</span>
                ) : (
                  <span className="smart-warn">⚠ {t("工程建议")} {eng.errors + eng.warnings + eng.infos} {t("项")}</span>
                )}
              </div>
              {eng.issues.length > 0 && (
                <div className="smart-eng-list">
                  {eng.issues.slice(0, 4).map((issue) => {
                    const label = engineeringIssueLabel(issue);
                    return (
                      <div key={issue.id} className={`smart-eng-item ${issue.severity}`}>
                        <span>{issue.severity === "error" ? "⛔" : issue.severity === "warning" ? "⚠" : "💡"}</span>
                        <span><b>{label.title}</b>：{label.message}</span>
                      </div>
                    );
                  })}
                  {eng.issues.length > 4 && <div className="smart-muted">+{eng.issues.length - 4} {t("更多")}</div>}
                </div>
              )}
              {hasContent && (
                <div className="smart-insert-mode">
                  <div className="smart-mode-title">{t("当前画布已有内容，插入方式：")}</div>
                  <label className={`smart-mode ${mode === "append" ? "on" : ""}`}>
                    <input type="radio" checked={mode === "append"} onChange={() => setMode("append")} />
                    <span>{t("追加到右侧（推荐）")}</span>
                    <small>{t("保留原图，一次撤销")}</small>
                  </label>
                  <label className={`smart-mode ${mode === "replace" ? "on" : ""}`}>
                    <input type="radio" checked={mode === "replace"} onChange={() => setMode("replace")} />
                    <span>{t("新建一张图")}</span>
                    <small>{t("当前内容会被替换")}</small>
                  </label>
                </div>
              )}
            </div>
          )}
        </div>

        <footer className="smart-modal-foot">
          <button className="btn ghost" onClick={onClose}>{t("取消")}</button>
          <div className="smart-foot-right">
            {step > 1 && <button className="btn ghost" onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}>{t("上一步")}</button>}
            {step < 3 ? (
              <button className="btn" onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)} disabled={step === 1 && !templateId}>
                {t("下一步")}
              </button>
            ) : (
              <button className="btn" onClick={() => { trackSmart("wizard_insert", { template: template.id, mode: hasContent ? mode : "replace" }); onInserted(result, hasContent ? mode : "replace"); }}>
                {t("插入画布")}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
