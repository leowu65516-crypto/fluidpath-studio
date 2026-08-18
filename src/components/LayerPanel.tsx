import { useState } from "react";
import { PromptDialog } from "./PromptDialog";
import { useAppState, addLayer, removeLayer, toggleLayerVisibility, setCurrentLayer, setSelection, blinkElements, renameLayer, updateDiagram } from "../store";
import { useT } from "../i18n";

/** 顶部工具栏的图层面板（固定面板）：可见性、当前图层、新建/删除/改名、定位本层 */
export function LayerPanel({ onClose }: { onClose: () => void }) {
  const { diagram } = useAppState();
  const { t } = useT();
  const [newName, setNewName] = useState("");
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null);
  const layers = diagram.settings.layers ?? [];
  const current = diagram.settings.currentLayerId ?? layers[0]?.id ?? "";

  const nodesInLayer = (layerId: string) =>
    diagram.nodes.filter((n) => (n.layerId ?? layers[0]?.id ?? "") === layerId);

  function locateLayer(layerId: string) {
    const ids = nodesInLayer(layerId).map((n) => n.id);
    if (ids.length) {
      setSelection({ nodes: ids, pipes: [] });
      blinkElements(ids);
    }
  }

  return (
    <div className="layer-dropdown" onClick={(e) => e.stopPropagation()}>
      <div className="layer-head">
        <span>🗂 {t("图层")}</span>
        <button className="layer-close" onClick={onClose} aria-label="关闭">✕</button>
      </div>
      <div className="layer-list">
        {layers.map((l) => {
          const count = nodesInLayer(l.id).length;
          return (
            <div
              key={l.id}
              className={`layer-row${l.id === current ? " active" : ""}`}
              onClick={() => setCurrentLayer(l.id)}
              title="点击设为当前图层（新元件自动归入）"
            >
              <button
                className="layer-eye"
                onClick={(e) => { e.stopPropagation(); toggleLayerVisibility(l.id); }}
                title={l.visible ? t("隐藏本层") : t("显示本层")}
              >
                {l.visible ? "👁" : "◌"}
              </button>
              <span
                className="layer-name"
                title="双击改名"
                onDoubleClick={(e) => { e.stopPropagation(); setRenameTarget({ id: l.id, name: l.name }); }}
              >
                {l.name}{l.id === current ? "（当前）" : ""}
                {!l.visible ? " · 已隐藏" : ""}
              </span>
              <button
                className="layer-locate"
                onClick={(e) => { e.stopPropagation(); locateLayer(l.id); }}
                title={t("选中本层所有元件并定位")}
                disabled={count === 0}
              >
                {count}
              </button>
              {layers.length > 1 && (
                <button className="layer-del" onClick={(e) => { e.stopPropagation(); removeLayer(l.id); }} title={t("删除图层（本层元件归入其他图层）")}>×</button>
              )}
            </div>
          );
        })}
      </div>
      <div className="layer-export-controls">
        <b>{t("导出整理")}</b>
        <label><input type="checkbox" checked={diagram.settings.showNodeLabels !== false} onChange={(e) => updateDiagram((d) => { d.settings.showNodeLabels = e.target.checked; }, false)} /> {t("显示元器件名称")}</label>
        <label><input type="checkbox" checked={diagram.settings.showPipeLabels !== false} onChange={(e) => updateDiagram((d) => { d.settings.showPipeLabels = e.target.checked; }, false)} /> {t("显示管路编号属性")}</label>
        <label><input type="checkbox" checked={diagram.settings.showFluidLabels === true} onChange={(e) => updateDiagram((d) => { d.settings.showFluidLabels = e.target.checked; }, false)} /> {t("显示介质文字")}</label>
        <label><input type="checkbox" checked={diagram.settings.showFluidColors !== false} onChange={(e) => updateDiagram((d) => { d.settings.showFluidColors = e.target.checked; }, false)} /> {t("显示介质颜色")}</label>
        <button className="btn wide" onClick={() => updateDiagram((d) => { d.settings.showNodeLabels = false; d.settings.showPipeLabels = false; d.settings.showFluidLabels = false; d.settings.showFluidColors = false; }, false)}>{t("清洁导出模式")}</button>
        <button className="btn ghost wide" onClick={() => updateDiagram((d) => { d.settings.showNodeLabels = true; d.settings.showPipeLabels = true; d.settings.showFluidLabels = true; d.settings.showFluidColors = true; }, false)}>{t("恢复全部显示")}</button>
      </div>
      <div className="layer-add">
        <input
          value={newName}
          placeholder={t("新图层名称…")}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newName.trim()) { addLayer(newName.trim()); setNewName(""); }
          }}
        />
        <button onClick={() => { if (newName.trim()) { addLayer(newName.trim()); setNewName(""); } }}>＋</button>
      </div>
      <div className="layer-tip">👁 显示/隐藏 · 点图层名=当前图层 · 点数字=选中本层 · 双击=改名 · ×=删除</div>
      {renameTarget && (
        <PromptDialog
          title={t("图层改名")}
          defaultValue={renameTarget.name}
          submitLabel={t("改名")}
          onSubmit={(name) => renameLayer(renameTarget.id, name)}
          onClose={() => setRenameTarget(null)}
        />
      )}
    </div>
  );
}
