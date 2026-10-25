import { useMemo, useState } from "react";
import { useAppState, batchReroutePipes } from "../store";
import { useT } from "../i18n";
import { diagnosisSummary } from "../diagnostics";
import { parseBlockText } from "../smart-draw/intent";
import { SMART_BLOCKS } from "../smart-draw/blocks";
import type { SmartBlock } from "../smart-draw/types";
import { toast } from "../toast";

export function SmartDrawingPanel({
  onClose,
  onAddBlock,
  onOpenWizard,
  onOpenAdvanced,
}: {
  onClose: () => void;
  onAddBlock: (block: SmartBlock) => void;
  onOpenWizard: () => void;
  onOpenAdvanced?: () => void;
}) {
  const { diagram } = useAppState();
  const { t } = useT();
  const [text, setText] = useState("");
  const diag = useMemo(() => diagnosisSummary(diagram), [diagram]);
  const warnings = diag.errors + diag.warnings;

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
        <div className="smart-panel-summary">
          <span>✓ {diagram.nodes.length} {t("个元件")}</span>
          <span>✓ {diagram.pipes.length} {t("段管路")}</span>
          {warnings > 0 ? <span className="smart-warn">⚠ {warnings} {t("处可改进")}</span> : <span className="smart-ok">✓ {t("结构正常")}</span>}
        </div>

        <div className="smart-panel-section">
          <div className="smart-panel-title">{t("加一段")}</div>
          <div className="smart-block-list">
            {SMART_BLOCKS.map((block) => (
              <button key={block.id} type="button" className="smart-block-card" onClick={() => onAddBlock(block)}>
                <span className="smart-block-title">+ {t(block.titleZh)}</span>
                <span className="smart-block-desc">{t(block.descZh)}</span>
              </button>
            ))}
          </div>
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
        </div>

        <div className="smart-panel-section">
          <div className="smart-panel-title">{t("整理")}</div>
          <button className="btn wide" onClick={reroute}>🔄 {t("自动布线全部管路")}</button>
          <button className="btn wide" onClick={() => window.dispatchEvent(new CustomEvent("fluidpath:open-advice"))}>🔍 {t("检查图纸")}</button>
          <button className="btn wide" onClick={onOpenWizard}>✨ {t("换一个模板")}</button>
          <button className="btn wide primary" onClick={() => window.dispatchEvent(new CustomEvent("fluidpath:save-file"))}>💾 {t("保存文件")}</button>
          {onOpenAdvanced && (
            <button className="btn wide ghost" onClick={onOpenAdvanced}>🧩 {t("高级：结构化指令")}</button>
          )}
        </div>

        <p className="fault-hint">{t("插入、修复和布线都会自动保存在本机；要分享或换电脑，请保存文件。")}</p>
      </div>
    </aside>
  );
}
