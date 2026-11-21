import { useState } from "react";
import type { DiagramNode } from "../types";
import { patchNode } from "../store";
import { useT } from "../i18n";

export function PresentationObjectEditor({ node, onClose }: { node: DiagramNode; onClose: () => void }) {
  const { t } = useT();
  const [draft, setDraft] = useState(() => structuredClone(node));
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const isImage = node.type === "image";
  const set = (patch: Partial<DiagramNode>) => setDraft((current) => ({ ...current, ...patch }));
  return <div className="prompt-overlay" data-ui="1" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="prompt-dialog presentation-editor" role="dialog" aria-modal="true" aria-label={t(isImage ? "编辑图片" : "编辑文字标签")}>
      <div className="prompt-title">{t(isImage ? "编辑图片" : "编辑文字标签")}</div>
      {!isImage && <label>{t("文字内容")}<input value={draft.label} onChange={(event) => set({ label: event.target.value })} /></label>}
      {!isImage && <label>{t("文字大小")}<input type="number" min={8} max={160} value={draft.fontSize ?? 16} onChange={(event) => set({ fontSize: Math.max(8, Math.min(160, Number(event.target.value) || 8)) })} /></label>}
      {!isImage && <label>{t("文字颜色")}<input type="color" value={draft.stroke.slice(0, 7)} onChange={(event) => set({ stroke: event.target.value })} /></label>}
      {isImage && <>
        <label>{t("替换图片")}<input type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          setError("");
          setReading(true);
          const reader = new FileReader();
          reader.onload = () => { set({ imageData: String(reader.result) }); setReading(false); };
          reader.onerror = () => { setError(t("图片读取失败")); setReading(false); };
          reader.readAsDataURL(file);
        }} /></label>
        <label>{t("图片适配")}<select value={draft.imageFit ?? "cover"} onChange={(event) => set({ imageFit: event.target.value as DiagramNode["imageFit"] })}><option value="contain">{t("完整显示")}</option><option value="cover">{t("填满裁剪")}</option><option value="stretch">{t("拉伸填满")}</option></select></label>
        <label>{t("图片不透明度")} {Math.round((draft.imageOpacity ?? 1) * 100)}%<input type="range" min={0} max={100} value={Math.round((draft.imageOpacity ?? 1) * 100)} onChange={(event) => set({ imageOpacity: Number(event.target.value) / 100 })} /></label>
      </>}
      <div className="presentation-editor-dimensions">
        <label>{t("宽度")}<input type="number" min={20} max={4000} value={draft.width} onChange={(event) => set({ width: Math.max(20, Math.min(4000, Number(event.target.value) || 20)) })} /></label>
        <label>{t("高度")}<input type="number" min={20} max={4000} value={draft.height} onChange={(event) => set({ height: Math.max(20, Math.min(4000, Number(event.target.value) || 20)) })} /></label>
        <label>{t("旋转角度")}<input type="number" value={draft.rotation} onChange={(event) => set({ rotation: Number(event.target.value) || 0 })} /></label>
      </div>
      {error && <div role="alert">{error}</div>}
      <div className="prompt-actions"><button className="btn" disabled={reading} onClick={() => { patchNode(node.id, draft); onClose(); }}>{t("保存")}</button><button className="btn ghost" onClick={onClose}>{t("取消")}</button></div>
    </div>
  </div>;
}
