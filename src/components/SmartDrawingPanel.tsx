import { useMemo, useState } from "react";
import { useAppState, batchReroutePipes, blinkElements } from "../store";
import { useT } from "../i18n";
import { diagnosisSummary } from "../diagnostics";
import { engineeringSummary, engineeringIssueLabel } from "../smart-draw/engineering";
import { parseBlockText } from "../smart-draw/intent";
import { SMART_BLOCKS } from "../smart-draw/blocks";
import type { SmartBlock } from "../smart-draw/types";
import { toast } from "../toast";
import { trackSmart } from "../smart-draw/telemetry";

export function SmartDrawingPanel({
  onClose,
  onAddBlock,
  onOpenWizard,
  onOpenAdvanced,
  onFocusMain,
  onFocusAccessories,
  smartView = "all",
  onToggleSmartView,
}: {
  onClose: () => void;
  onAddBlock: (block: SmartBlock) => void;
  onOpenWizard: () => void;
  onOpenAdvanced?: () => void;
  onFocusMain?: () => void;
  onFocusAccessories?: () => void;
  smartView?: "all" | "main";
  onToggleSmartView?: () => void;
}) {
  const { diagram, ui } = useAppState();
  const { t } = useT();
  const [text, setText] = useState("");
  const [showTip, setShowTip] = useState(() => {
    try { return localStorage.getItem("fluidpath.smart.panelTip") !== "1"; } catch { return true; }
  });
  const [showMoreBlocks, setShowMoreBlocks] = useState(false);
  const [showMoreActions, setShowMoreActions] = useState(false);
  const diag = useMemo(() => diagnosisSummary(diagram), [diagram]);
  const eng = useMemo(() => engineeringSummary(diagram), [diagram]);
  const warnings = diag.errors + diag.warnings;
  const engCount = eng.errors + eng.warnings + eng.infos;

  const hasCoffee = diagram.nodes.some((n) => n.type === "coffeeOutlet" || n.type === "brewChamber");
  const hasMilk = diagram.nodes.some((n) => n.type === "milkOutlet" || n.type === "milkPump");
  const hasSteam = diagram.nodes.some((n) => n.type === "steamWand" || n.type === "steamBoiler");
  const hasClean = diagram.nodes.some((n) => /清洗|clean/i.test(n.label || ""));
  const suggestedId = hasCoffee && !hasMilk
    ? "milk-line"
    : hasCoffee && !hasSteam
      ? "steam-wand"
      : !hasClean
        ? "cleaning-bypass"
        : null;
  const suggested = SMART_BLOCKS.find((b) => b.id === suggestedId);
  const otherBlocks = SMART_BLOCKS.filter((b) => b.id !== suggestedId);

  function handleText() {
    const blockId = parseBlockText(text);
    if (!blockId) {
      toast(t("还没听懂；可以点下面的功能块，或换一种说法"));
      return;
    }
    const block = SMART_BLOCKS.find((b) => b.id === blockId);
    if (block) onAddBlock(block);
    setText("");
  }

  function reroute() {
    batchReroutePipes(diagram.pipes.map((p) => p.id));
    toast(t("已重新自动布线；手动折点已清除"));
  }

  return (
    <aside className="fault-panel smart-panel" data-ui="1" aria-label={t("继续完善")}>
      <header className="fault-header">
        <div><strong>{t("继续完善")}</strong><span>{t("这张图还缺什么")}</span></div>
        <button className="btn ghost sq" onClick={onClose} aria-label={t("关闭")}>×</button>
      </header>
      <div className="fault-scroll">
        {showTip && (
          <div className="smart-panel-tip">
            <span>💡 {t("这里会告诉你还缺什么；点功能块会引导你选接点。")}</span>
            <button
              className="btn ghost sq"
              aria-label={t("知道了")}
              onClick={() => { setShowTip(false); try { localStorage.setItem("fluidpath.smart.panelTip", "1"); } catch { /* ignore */ } }}
            >×</button>
          </div>
        )}
        <div className="smart-save-line">
          <span>{ui.dirty ? t("本机已自动保存 · 文件未保存") : t("已保存文件")}</span>
          <button className="btn mini" onClick={() => window.dispatchEvent(new CustomEvent("fluidpath:save-file"))}>💾 {t("保存文件")}</button>
        </div>

        <div className="smart-panel-summary">
          <span>✓ {diagram.nodes.length} {t("个元件")}</span>
          <span>✓ {diagram.pipes.length} {t("段管路")}</span>
          {warnings > 0 ? <span className="smart-warn">⚠ {warnings} {t("处可改进")}</span> : <span className="smart-ok">✓ {t("结构正常")}</span>}
          {engCount > 0 ? <span className="smart-warn">⚠ {t("工程建议")} {engCount}</span> : <span className="smart-ok">✓ {t("工程检查通过")}</span>}
        </div>

        {(onFocusMain || onFocusAccessories || onToggleSmartView) && (
          <div className="smart-view-row">
            {onToggleSmartView && <button type="button" className={`btn mini ${smartView === "main" ? "primary" : ""}`} onClick={onToggleSmartView}>{smartView === "main" ? `👁 ${t("显示全部")}` : `🎯 ${t("只看主链")}`}</button>}
            {onFocusMain && <button type="button" className="btn mini" onClick={onFocusMain}>🎯 {t("定位主链")}</button>}
            {onFocusAccessories && <button type="button" className="btn mini" onClick={onFocusAccessories}>🔧 {t("定位安全附件")}</button>}
          </div>
        )}

        {eng.issues.length > 0 && (
          <div className="smart-panel-section smart-eng-panel">
            <div className="smart-panel-title">{t("工程检查")}</div>
            {eng.issues.slice(0, 5).map((issue) => {
              const label = engineeringIssueLabel(issue);
              return (
                <button
                  key={issue.id}
                  type="button"
                  className={`smart-eng-item ${issue.severity}`}
                  onClick={() => { trackSmart("engineering_issue_click", { code: issue.id.split("-").slice(0, 2).join("-") }); blinkElements([...issue.nodeIds, ...issue.pipeIds]); }}
                >
                  <span>{issue.severity === "error" ? "⛔" : issue.severity === "warning" ? "⚠" : "💡"}</span>
                  <span><b>{label.title}</b>：{label.message}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="smart-panel-section">
          <div className="smart-panel-title">{suggested ? t("建议下一步") : t("图纸已比较完整")}</div>
          {suggested ? (
            <button type="button" className="smart-block-card suggested" onClick={() => onAddBlock(suggested)}>
              <span className="smart-block-title">+ {t(suggested.titleZh)}</span>
              <span className="smart-block-desc">{t(suggested.descZh)}</span>
            </button>
          ) : (
            <div className="smart-empty-note">{t("检查图纸并保存文件；需要更多支路时展开下面的功能块。")}</div>
          )}
          <button className="smart-more-toggle" onClick={() => setShowMoreBlocks((v) => !v)}>
            {showMoreBlocks ? "▾" : "▸"} {t("更多功能块")}
          </button>
          {showMoreBlocks && (
            <div className="smart-block-list">
              {otherBlocks.map((block) => (
                <button key={block.id} type="button" className="smart-block-card" onClick={() => onAddBlock(block)}>
                  <span className="smart-block-title">+ {t(block.titleZh)}</span>
                  <span className="smart-block-desc">{t(block.descZh)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="smart-panel-section">
          <div className="smart-panel-title">{t("我想加…")}</div>
          <div className="smart-inline-input">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleText(); }}
              placeholder={t("例如：加一个清洗旁通")}
              aria-label={t("我想加…")}
            />
            <button className="btn" onClick={handleText} disabled={!text.trim()}>{t("添加")}</button>
          </div>
          <div className="smart-suggest-chips">
            {SMART_BLOCKS.map((block) => (
              <button key={block.id} type="button" className="smart-chip-btn" onClick={() => onAddBlock(block)}>
                + {t(block.titleZh)}
              </button>
            ))}
          </div>
        </div>

        <div className="smart-panel-section">
          <button className="btn wide" onClick={() => window.dispatchEvent(new CustomEvent("fluidpath:open-advice"))}>🔍 {t("检查图纸")}</button>
          <button className="smart-more-toggle" onClick={() => setShowMoreActions((v) => !v)}>
            {showMoreActions ? "▾" : "▸"} {t("更多操作")}
          </button>
          {showMoreActions && (
            <>
              <button className="btn wide" onClick={reroute}>🔄 {t("自动布线全部管路")}</button>
              <button className="btn wide" onClick={onOpenWizard}>✨ {t("换一个模板")}</button>
              {onOpenAdvanced && (
                <button className="btn wide ghost" onClick={onOpenAdvanced}>🧩 {t("高级：结构化指令")}</button>
              )}
            </>
          )}
        </div>

        <p className="fault-hint">{t("插入、修复和布线都会自动保存在本机；要分享或换电脑，请保存文件。")}</p>
      </div>
    </aside>
  );
}
