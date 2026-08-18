import { useMemo } from "react";
import { useAppState } from "../store";
import { useT } from "../i18n";
import { diagnosisSummary } from "../diagnostics";

/** 读取上次导出格式用于状态栏提示 */
function lastExportLabel(): string {
  try { const f = localStorage.getItem("fluidpath.lastExport"); return f ? f.toUpperCase() : "PNG"; } catch { return "PNG"; }
}

export function StatusBar() {
  const { diagram, ui } = useAppState();
  const { t } = useT();
  const sel = ui.selection;
  const diag = useMemo(() => diagnosisSummary(diagram), [diagram]);
  let selText = t("未选中对象");
  if (sel.nodes.length === 1) {
    const n = diagram.nodes.find((nn) => nn.id === sel.nodes[0]);
    selText = n ? `${t("节点")}：${n.label}` : selText;
  } else if (sel.pipes.length === 1 && sel.nodes.length === 0) {
    const p = diagram.pipes.find((pp) => pp.id === sel.pipes[0]);
    selText = p ? `${t("管路")}：${p.label}（${p.nominalDiameter}）` : selText;
  } else if (sel.nodes.length + sel.pipes.length > 1) {
    selText = `${t("已选中")} ${sel.nodes.length} ${t("个节点")} / ${sel.pipes.length} ${t("条管路")}`;
  }
  return (
    <div className="statusbar">
      <span className="sb-item">{selText}</span>
      <span className="sb-item">X: {Math.round(ui.mouseWorld.x)} , Y: {Math.round(ui.mouseWorld.y)}</span>
      <span className="sb-item">{t("缩放")} {Math.round(ui.zoom * 100)}%</span>
      <span className="sb-spacer" />
      <span className="sb-item sb-hint" title={`Ctrl+E 快速导出 ${lastExportLabel()}`}>⌨ Ctrl+E → {lastExportLabel()}</span>
      <span className="sb-item">{t("节点")} {diagram.nodes.length} · {t("管路")} {diagram.pipes.length}</span>
      <span
        className="sb-item sb-diag-click"
        title="结构问题计数（工况提示不参与）· 点击打开回路诊断"
        onClick={() => window.dispatchEvent(new CustomEvent("fluidpath:open-advice"))}
        style={{ cursor: "pointer" }}
      >
        {diag.errors > 0 && <span style={{ color: "#d64545" }}>⛔ {diag.errors}</span>}
        {diag.warnings > 0 && <span style={{ color: "#c07b1f" }}>⚠ {diag.warnings}</span>}
        {diag.errors === 0 && diag.warnings === 0 && <span style={{ color: "#3fae6a" }}>✓ 正常</span>}
      </span>
      <span className={`sb-item ${ui.dirty ? "sb-dirty" : "sb-saved"}`}>{ui.dirty ? "● " + t("未保存") : "✓ " + t("已保存")}</span>
    </div>
  );
}
