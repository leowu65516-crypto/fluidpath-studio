import { useEffect, useRef, useState } from "react";
import { buildExportSVGWithOptions, exportImageWithOptions, exportSvgWithOptions, exportPdfWithOptions, exportGifWithOptions, prepareExportDiagram, EXPORT_DEFAULTS, type ExportOptions, type ExportTextCategory, type ExportTextEnhance } from "../export";
import { updateDiagram, useAppState } from "../store";
import { useT } from "../i18n";
import { toast } from "../toast";

type Fmt = "png" | "jpg" | "svg" | "pdf" | "gif";

/**
 * 导出预览对话框（v1.18，对标 Excalidraw ImageExportDialog）：
 * 左侧实时预览（canvas）+ 右侧选项面板，所见即所得。
 * 全部选项只作用于导出物（画布零污染）；自定义文字可选存回图纸。
 */
export function ExportDialog({ svgRef, initialFormat, onClose }: { svgRef: React.MutableRefObject<SVGSVGElement | null>; initialFormat: Fmt; onClose: () => void }) {
  const { diagram, ui } = useAppState();
  const { t, lang } = useT();
  const [format, setFormat] = useState<Fmt>(initialFormat);
  const [opts, setOpts] = useState<ExportOptions>({ ...EXPORT_DEFAULTS, format: initialFormat, lang, filename: diagram.name || "fluidpath" });
  const [progress, setProgress] = useState<number | null>(null);
  const [quizSaved, setQuizSaved] = useState(false);
  const previewRef = useRef<HTMLCanvasElement | null>(null);
  const reqIdRef = useRef(0);
  /** 预览几何（导出坐标系原点与缩放），供文字拖拽命中换算 */
  const previewMetaRef = useRef<{ x: number; y: number; w: number; h: number; fit: number } | null>(null);
  const dragRef = useRef<{ key: string; ax: number; ay: number } | null>(null);
  const patch = (p: Partial<ExportOptions>) => setOpts((o) => ({ ...o, ...p }));
  const patchText = (p: Partial<ExportTextEnhance>) =>
    setOpts((o) => ({ ...o, text: { scales: {}, halo: true, plates: false, offsets: {}, ...(o.text ?? {}), ...p } }));

  const hasSelection = ui.selection.nodes.length + ui.selection.pipes.length > 0;

  /** 可拖拽文字目录（导出坐标系）：画布文字 + 图例/自定义文字层 */
  type TextItem = { key: string; cat: ExportTextCategory; x: number; y: number; fs: number; len: number };
  const buildTextCatalog = (): TextItem[] => {
    const items: TextItem[] = [];
    const svgEl = svgRef.current;
    if (svgEl) {
      svgEl.querySelectorAll(".fp-node-label, .fp-pipe-annotation, .fp-fluid-label, text[data-pipe-id]").forEach((el) => {
        const pipeId = el.getAttribute("data-pipe-id");
        const nodeId = el.getAttribute("data-node-id");
        const kind = el.getAttribute("data-node-kind");
        const cat: ExportTextCategory = pipeId ? "pipes" : kind === "solenoid2" || kind === "solenoid3" ? "valves" : "components";
        items.push({
          key: pipeId ? `pipe:${pipeId}` : `node:${nodeId}`,
          cat,
          x: Number(el.getAttribute("x") || 0),
          y: Number(el.getAttribute("y") || 0),
          fs: Number(el.getAttribute("font-size") || 12),
          len: (el.textContent || "").length,
        });
      });
    }
    const { extra } = prepareExportDiagram(diagram, { ...opts, selection: ui.selection });
    for (const n of extra) {
      if (n.type === "shape") {
        items.push({ key: `export:${n.id}`, cat: "legend", x: n.x + (n.width || 130) / 2, y: n.y + (n.height || 28) / 2 + 5, fs: n.fontSize ?? 13, len: n.label.length });
      } else {
        const fs = n.fontSize ?? 14;
        items.push({ key: `export:${n.id}`, cat: n.exportKind === "legend" ? "legend" : "custom", x: n.x + (n.width || 0) / 2, y: n.y + (n.height || 24) / 2 + fs / 3, fs, len: n.label.length });
      }
    }
    return items;
  };

  const canvasToWorld = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const meta = previewMetaRef.current;
    const cv = previewRef.current;
    if (!meta || !cv) return null;
    const rect = cv.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / Math.max(1, rect.width)) * cv.width;
    const py = ((e.clientY - rect.top) / Math.max(1, rect.height)) * cv.height;
    const sx = px / Math.max(0.001, meta.fit);
    const sy = py / Math.max(0.001, meta.fit);
    return { x: sx + meta.x, y: sy + meta.y };
  };

  const onPreviewPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const w = canvasToWorld(e);
    if (!w) return;
    let best: { item: TextItem; d: number } | null = null;
    for (const it of buildTextCatalog()) {
      const halfW = Math.max(26, it.fs * it.len * 0.5);
      const halfH = Math.max(14, it.fs);
      const dx = Math.max(0, Math.abs(w.x - it.x) - halfW);
      const dy = Math.max(0, Math.abs(w.y - it.y) - halfH);
      const d = Math.hypot(dx, dy);
      if (d < 12 && (!best || d < best.d)) best = { item: it, d };
    }
    if (!best) return;
    dragRef.current = { key: best.item.key, ax: best.item.x, ay: best.item.y };
    try { (e.currentTarget as HTMLCanvasElement).setPointerCapture?.(e.pointerId); } catch { /* 合成事件/无活动指针时忽略 */ }
    (e.currentTarget as HTMLCanvasElement).classList.add("text-dragging");
    e.preventDefault();
  };

  const onPreviewPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const w = canvasToWorld(e);
    if (!w) return;
    const off = opts.text?.offsets ?? {};
    patchText({ offsets: { ...off, [drag.key]: { x: Math.round(w.x - drag.ax), y: Math.round(w.y - drag.ay) } } });
  };

  const onPreviewPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    (e.currentTarget as HTMLCanvasElement).classList.remove("text-dragging");
  };

  // 语言切换时同步导出物语言（图例/日期）
  useEffect(() => { patch({ lang }); }, [lang]);

  // 实时预览：任何选项变更立即重绘（防抖 + requestId 防竞态）
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || !previewRef.current) return;
    const id = ++reqIdRef.current;
    const timer = setTimeout(() => {
      if (id !== reqIdRef.current) return;
      try {
        const { svg, w, h, x, y } = buildExportSVGWithOptions(svgEl, diagram, { ...opts, selection: ui.selection });
        const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
        const img = new Image();
        img.onload = () => {
          if (id !== reqIdRef.current) { URL.revokeObjectURL(url); return; }
          const cv = previewRef.current;
          if (!cv) { URL.revokeObjectURL(url); return; }
          const maxW = cv.parentElement?.clientWidth ?? 560;
          const maxH = cv.parentElement?.clientHeight ?? 420;
          const fit = Math.min(maxW / w, maxH / h, 1);
          cv.width = Math.max(1, Math.round(w * fit));
          cv.height = Math.max(1, Math.round(h * fit));
          const ctx = cv.getContext("2d")!;
          ctx.clearRect(0, 0, cv.width, cv.height);
          ctx.drawImage(img, 0, 0, cv.width, cv.height);
          previewMetaRef.current = { x, y, w, h, fit };
          URL.revokeObjectURL(url);
        };
        img.onerror = () => URL.revokeObjectURL(url);
        img.src = url;
      } catch { /* 预览失败静默（导出时会报错） */ }
    }, 120);
    return () => clearTimeout(timer);
  }, [opts, diagram, svgRef]);

  const run = async () => {
    if (!svgRef.current) return;
    const finalOpts: ExportOptions = { ...opts, format, filename: (opts.filename || diagram.name || "fluidpath").trim() };
    try { localStorage.setItem("fluidpath.lastExport", format); } catch { /* ignore */ }
    if (format === "gif") {
      setProgress(0);
      try {
        await exportGifWithOptions(svgRef.current, diagram, { ...finalOpts, selection: ui.selection }, (r) => setProgress(r));
        toast(t("GIF 已生成"));
      } catch (err) {
        toast(`${t("GIF 保存失败")}：${(err as Error).message}`, "error");
      }
      setProgress(null);
    } else if (format === "svg") {
      exportSvgWithOptions(svgRef.current, diagram, { ...finalOpts, selection: ui.selection });
    } else if (format === "pdf") {
      exportPdfWithOptions(svgRef.current, diagram, { ...finalOpts, selection: ui.selection });
    } else {
      exportImageWithOptions(svgRef.current, diagram, { ...finalOpts, selection: ui.selection });
    }
    // 自定义文字存回图纸（把文字层节点插入画布；图例节点不写回）
    if (finalOpts.saveTextToDiagram) {
      const { extra } = prepareExportDiagram(diagram, { ...finalOpts, legend: { fluid: false, diameter: false, status: false } });
      const textNodes = extra.filter((n) => n.type === "label");
      if (textNodes.length > 0) {
        updateDiagram((d) => d.nodes.push(...textNodes));
        setQuizSaved(true);
        setTimeout(() => setQuizSaved(false), 2500);
      }
    }
    onClose();
  };

  const fmtBtn = (f: Fmt, label: string) => (
    <button key={f} className={`exp-fmt${format === f ? " on" : ""}`} onClick={() => setFormat(f)}>{label}</button>
  );

  const group = (title: string, children: React.ReactNode, key?: string) => (
    <div className="exp-group" key={key}>
      <div className="exp-group-title">{title}</div>
      {children}
    </div>
  );

  const textInput = (label: string, key: "title" | "subtitle" | "footnote" | "watermark", placeholder: string) => (
    <div className="exp-row">
      <label>{label}</label>
      <input value={(opts[key] as string) ?? ""} placeholder={placeholder} onChange={(e) => patch({ [key]: e.target.value } as Partial<ExportOptions>)} />
    </div>
  );

  return (
    <div className="export-dialog-overlay" data-ui="1" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="export-dialog">
        <div className="export-dialog-head">
          <h3>🖼️ {t("导出预览")}</h3>
          <div className="exp-fmt-tabs">
            {fmtBtn("png", "PNG")}
            {fmtBtn("jpg", "JPG")}
            {fmtBtn("svg", "SVG")}
            {fmtBtn("pdf", "PDF")}
            {fmtBtn("gif", "GIF")}
          </div>
          <button className="advice-close" onClick={onClose}>✕</button>
        </div>
        <div className="export-dialog-body">
          <div className="exp-preview-wrap">
            <canvas
              ref={previewRef}
              className="exp-preview"
              onPointerDown={onPreviewPointerDown}
              onPointerMove={onPreviewPointerMove}
              onPointerUp={onPreviewPointerUp}
              onPointerCancel={onPreviewPointerUp}
            />
            <div className="exp-preview-meta">{diagram.nodes.length} {t("节点")} · {diagram.pipes.length} {t("管路")}{opts.scale > 1 ? ` · ${opts.scale}x` : ""}</div>
          </div>
          <div className="exp-options">
            {group(t("画布"), (
              <>
                <div className="exp-row">
                  <label>{t("背景")}</label>
                  <select value={opts.background} onChange={(e) => patch({ background: e.target.value as ExportOptions["background"] })}>
                    <option value="white">{t("纯白")}</option>
                    <option value="canvas">{t("画布背景色")}</option>
                    <option value="transparent" disabled={format === "jpg"}>{t("透明")}{format === "jpg" ? `（${t("JPG 不支持")}）` : ""}</option>
                  </select>
                </div>
                {format !== "svg" && format !== "pdf" && (
                  <div className="exp-row">
                    <label>{t("缩放倍率")}</label>
                    <div className="seg">
                      {[1, 2, 3].map((sc) => (
                        <button key={sc} className={opts.scale === sc ? "on" : ""} onClick={() => patch({ scale: sc })}>{sc}x</button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="exp-row">
                  <label>{t("边界留白")}</label>
                  <input type="range" min={0} max={120} value={opts.padding} onChange={(e) => patch({ padding: Number(e.target.value) })} />
                  <span className="exp-val">{opts.padding}px</span>
                </div>
                <div className="exp-row">
                  <label>{t("暗色主题")}</label>
                  <input type="checkbox" checked={opts.darkMode} onChange={(e) => patch({ darkMode: e.target.checked })} />
                </div>
              </>
            ), "canvas")}
            {group(t("文字与状态"), (
              <>
                <label className="exp-row"><span>{t("包含故障高亮")}</span><input type="checkbox" checked={!!opts.includeDiagnostics} onChange={e => patch({ includeDiagnostics: e.target.checked })} /></label>
                <div className="exp-row">
                  <label>{t("文字增强")}</label>
                  <div className="seg">
                    {[1, 1.25, 1.5, 2].map((sc) => (
                      <button key={sc} className={opts.textScale === sc ? "on" : ""} onClick={() => patch({ textScale: sc })}>{sc}x</button>
                    ))}
                  </div>
                </div>
                <div className="exp-row">
                  <label>{t("状态徽标")}</label>
                  <select value={opts.badgeStyle} onChange={(e) => patch({ badgeStyle: e.target.value as ExportOptions["badgeStyle"] })}>
                    <option value="default">{t("画布同款")}</option>
                    <option value="pill">{t("强化描边")}</option>
                    <option value="hidden">{t("隐藏")}</option>
                  </select>
                </div>
              </>
            ), "text")}
            {group(t("文字增强（分类）"), (
              <>
                {([
                  ["pipes", t("管路")],
                  ["valves", t("阀门")],
                  ["components", t("元器件")],
                  ["switches", t("开关状态")],
                  ["legend", t("图例文字")],
                  ["custom", t("自定义文字")],
                ] as Array<[ExportTextCategory, string]>).map(([key, label]) => (
                  <div className="exp-row" key={key}>
                    <label>{label}</label>
                    <div className="seg">
                      {[1, 1.5, 2, 2.5].map((sc) => (
                        <button key={sc} className={(opts.text?.scales?.[key] ?? 1) === sc ? "on" : ""} onClick={() => patchText({ scales: { ...(opts.text?.scales ?? {}), [key]: sc } })}>{sc}x</button>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="exp-row exp-checks">
                  <label><input type="checkbox" checked={opts.text?.halo !== false} onChange={(e) => patchText({ halo: e.target.checked })} /> {t("描边加强")}</label>
                  <label><input type="checkbox" checked={!!opts.text?.plates} onChange={(e) => patchText({ plates: e.target.checked })} /> {t("白色底板")}</label>
                </div>
                {Object.keys(opts.text?.offsets ?? {}).length > 0 && (
                  <button className="btn ghost exp-reset" onClick={() => patchText({ offsets: {} })}>{t("重置位置")}</button>
                )}
                <div className="exp-tip">{t("拖动预览里的文字可微调位置（仅导出物生效）")}</div>
              </>
            ), "textcats")}
            {group(t("图例"), (
              <div className="exp-row exp-checks">
                <label><input type="checkbox" checked={opts.legend.fluid} onChange={(e) => patch({ legend: { ...opts.legend, fluid: e.target.checked } })} /> {t("介质")}</label>
                <label><input type="checkbox" checked={opts.legend.diameter} onChange={(e) => patch({ legend: { ...opts.legend, diameter: e.target.checked } })} /> {t("管径")}</label>
                <label><input type="checkbox" checked={opts.legend.status} onChange={(e) => patch({ legend: { ...opts.legend, status: e.target.checked } })} /> {t("状态颜色说明")}（{t("红绿含义")}）</label>
              </div>
            ), "legend")}
            {group(t("自定义文字"), (
              <>
                {textInput(t("标题"), "title", t("如：CAYE 全自动咖啡机液路"))}
                {textInput(t("副标题"), "subtitle", t("如：售后培训 · 第 1 讲"))}
                {textInput(t("底部说明"), "footnote", t("如：仅用于内部培训"))}
                {textInput(t("水印"), "watermark", t("如：FluidPath Studio"))}
                <div className="exp-row exp-checks">
                  <label><input type="checkbox" checked={opts.dateStamp} onChange={(e) => patch({ dateStamp: e.target.checked })} /> {t("右下角日期戳")}</label>
                  <label><input type="checkbox" checked={opts.saveTextToDiagram} onChange={(e) => patch({ saveTextToDiagram: e.target.checked })} /> {t("同时写回图纸")}</label>
                </div>
                {quizSaved && <div className="exp-note">✓ {t("已写回图纸")}</div>}
              </>
            ), "textlayer")}
            {format === "gif" && group("GIF", (
              <>
                <div className="exp-row">
                  <label>{t("帧间隔")}</label>
                  <input type="range" min={30} max={200} step={5} value={opts.gifFrameDelay} onChange={(e) => patch({ gifFrameDelay: Number(e.target.value) })} />
                  <span className="exp-val">{opts.gifFrameDelay}ms</span>
                </div>
                <div className="exp-tip">{t("帧间隔越小动画越快；总时长固定 2 秒无缝循环。")}</div>
              </>
            ), "gif")}
            {group(t("输出"), (
              <>
                <div className="exp-row">
                  <label>{t("文件名")}</label>
                  <input value={opts.filename} onChange={(e) => patch({ filename: e.target.value })} />
                </div>
                <div className="exp-row">
                  <label>{t("仅导出选中")}</label>
                  <input type="checkbox" checked={opts.selectionOnly && hasSelection} disabled={!hasSelection} onChange={(e) => patch({ selectionOnly: e.target.checked })} />
                  <span className="exp-val">{hasSelection ? "" : t("先在画布选中内容")}</span>
                </div>
              </>
            ), "output")}
          </div>
        </div>
        <div className="export-dialog-foot">
          <span className="exp-hint">⌘/Ctrl+E {t("快速导出（跳过此界面）")}</span>
          <button className="btn ghost" onClick={onClose}>{t("取消")}</button>
          <button className="btn" disabled={progress !== null} onClick={() => void run()}>
            {progress !== null ? `${t("生成中")} ${Math.round(progress * 100)}%…` : `${t("导出")} ${format.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  );
}
