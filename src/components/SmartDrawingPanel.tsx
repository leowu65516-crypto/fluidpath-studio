import { useMemo, useState } from "react";
import { updateDiagram, useAppState, blinkElements, smartTidyPipes, previewRerouteAll, setRoutePreview, toastWithFocus } from "../store";
import { useT } from "../i18n";
import { PromptDialog } from "./PromptDialog";
import { findPipeOverlaps } from "../smart-draw/overlap";
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
  const { t, lang } = useT();
  const [renamingZone, setRenamingZone] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [showTip, setShowTip] = useState(() => {
    try { return localStorage.getItem("fluidpath.smart.panelTip") !== "1"; } catch { return true; }
  });
  const [showMoreBlocks, setShowMoreBlocks] = useState(false);
  const [showMoreActions, setShowMoreActions] = useState(false);
  const diag = useMemo(() => diagnosisSummary(diagram), [diagram]);
  const eng = useMemo(() => engineeringSummary(diagram), [diagram]);
  const overlaps = useMemo(() => findPipeOverlaps(diagram), [diagram]);
  const zones = diagram.settings.smartZones ?? [];
  const zonesVisible = diagram.settings.smartZonesVisible !== false;
  const accessoriesVisible = diagram.settings.smartAccessoriesVisible !== false;
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

  function smartTidy() {
    const r = smartTidyPipes();
    if (!r.fixed && !r.unresolved) {
      toast(t("未发现管路重合，无需整理"));
      return;
    }
    toastWithFocus(`${t("已修复 {n} 处管路重合").replace("{n}", String(r.fixed))} · ${t("保留 {n} 条手工布线").replace("{n}", String(r.untouchedManual))}`, r.affected);
  }

  function rerouteAll() {
    const preview = previewRerouteAll();
    if (!preview.rerouted) {
      toast(t("没有可重排的管路"));
      return;
    }
    // 与画布右键一致：先幽灵预览，确认后才写回
    setRoutePreview(preview);
    onClose?.();
  }

  function toggleZones() {
    updateDiagram((d) => { d.settings.smartZonesVisible = !zonesVisible; }, false);
  }

  function toggleZone(id: string) {
    updateDiagram((d) => {
      const zone = d.settings.smartZones?.find((z) => z.id === id);
      if (zone) zone.visible = zone.visible === false;
    }, false);
  }

  function toggleAccessories() {
    updateDiagram((d) => { d.settings.smartAccessoriesVisible = !accessoriesVisible; }, false);
  }

  function setZoneColor(id: string, color: string) {
    updateDiagram((d) => {
      const zone = d.settings.smartZones?.find((z) => z.id === id);
      if (zone) zone.color = color;
    }, false);
  }

  function renameZone(id: string, name: string) {
    updateDiagram((d) => {
      const zone = d.settings.smartZones?.find((z) => z.id === id);
      if (zone) { zone.labelZh = name; zone.labelEn = name; }
    }, false);
    toast(t("已更新分区名称").replace("{name}", name));
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

        <div className="smart-panel-section">
          <div className="smart-panel-title">{t("视图与分区")}</div>
          <div className="smart-view-row">
            {onToggleSmartView && <button type="button" className={`btn mini ${smartView === "main" ? "primary" : ""}`} onClick={onToggleSmartView}>{smartView === "main" ? `👁 ${t("显示全部")}` : `🎯 ${t("只看主链")}`}</button>}
            <button type="button" className={`btn mini ${zonesVisible ? "" : "ghost"}`} onClick={toggleZones}>{zonesVisible ? `🗺 ${t("隐藏分区")}` : `🗺 ${t("显示分区")}`}</button>
            <button type="button" className={`btn mini ${accessoriesVisible ? "" : "ghost"}`} onClick={toggleAccessories}>{accessoriesVisible ? `🔧 ${t("隐藏安全附件")}` : `🔧 ${t("显示安全附件")}`}</button>
          </div>
          {zonesVisible && zones.length > 0 && (
            <div className="smart-zone-list">
              {zones.map((zone) => (
                <div key={zone.id} className={`smart-zone-row ${zone.visible === false ? "off" : ""}`}>
                  <button type="button" className="btn ghost sq" aria-label={t("显示/隐藏分区")} onClick={() => toggleZone(zone.id)}>{zone.visible === false ? "○" : "👁"}</button>
                  <input type="color" value={zone.color ?? "#7b8794"} aria-label={t("分区颜色")} onChange={(e) => setZoneColor(zone.id, e.target.value)} />
                  <span className="smart-zone-name" title={t("双击重命名")} onDoubleClick={() => setRenamingZone(zone.id)}>{lang === "en" ? zone.labelEn : zone.labelZh}</span>
                  <button type="button" className="btn ghost sq" title={t("重命名")} onClick={() => setRenamingZone(zone.id)}>✏️</button>
                </div>
              ))}
            </div>
          )}
          {overlaps.length > 0 && (
            <div className="smart-overlap-list">
              <div className="smart-panel-title">⚠ {overlaps.length} {t("处管路视觉重合")}</div>
              {overlaps.slice(0, 4).map((o) => (
                <button key={o.id} type="button" className="smart-eng-item warning" onClick={() => { blinkElements(o.pipeIds); smartTidy(); }}>
                  <span>⚠</span>
                  <span><b>{lang === "en" ? o.titleEn : o.titleZh}</b>：{lang === "en" ? o.messageEn : o.messageZh}</span>
                </button>
              ))}
            </div>
          )}
          <button className="btn wide" onClick={smartTidy}>🧹 {t("智能整理：只修复重合，保留手工布线")}</button>
          <button className="btn wide ghost" onClick={rerouteAll}>↯ {t("重排全部管路（将清空手工折点）")}</button>
        </div>

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
              <button className="btn wide" onClick={onOpenWizard}>✨ {t("换一个模板")}</button>
              {onOpenAdvanced && (
                <button className="btn wide ghost" onClick={onOpenAdvanced}>🧩 {t("高级：结构化指令")}</button>
              )}
            </>
          )}
        </div>

        <p className="fault-hint">{t("插入、修复和布线都会自动保存在本机；要分享或换电脑，请保存文件。")}</p>
      </div>
      {renamingZone && (
        <PromptDialog
          title={t("重命名分区")}
          label={t("输入新的分区名称")}
          defaultValue={zones.find((z) => z.id === renamingZone) ? (lang === "en" ? zones.find((z) => z.id === renamingZone)!.labelEn : zones.find((z) => z.id === renamingZone)!.labelZh) : ""}
          submitLabel={t("保存")}
          onSubmit={(v) => renameZone(renamingZone, v)}
          onClose={() => setRenamingZone(null)}
        />
      )}
    </aside>
  );
}
