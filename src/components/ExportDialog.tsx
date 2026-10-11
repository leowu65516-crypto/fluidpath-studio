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
  /** 可拖拽/可编辑文字目录项（导出坐标系基准锚点；offsets 由命中测试/高亮实时叠加） */
  type TextItem = { key: string; groupKey?: string; cat: ExportTextCategory; x: number; y: number; fs: number; len: number; text: string };
  /** 预览几何（导出坐标系原点与缩放 + 基础位图尺寸），供文字拖拽/命中换算 */
  const previewMetaRef = useRef<{ x: number; y: number; w: number; h: number; fit: number; bw: number; bh: number } | null>(null);
  /** 预览视图：相对「适应」尺寸的缩放 z 与平移 pan（单位=基础位图像素） */
  const viewRef = useRef({ z: 1, panX: 0, panY: 0 });
  const [zoomPct, setZoomPct] = useState(100);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const catalogRef = useRef<TextItem[]>([]);
  const hoverRef = useRef<TextItem | null>(null);
  const activeRef = useRef<TextItem | null>(null);
  const panRef = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);
  const drawRafRef = useRef(0);
  const offsetsRef = useRef<Record<string, { x: number; y: number }>>({});
  const dragRef = useRef<{ key: string; ax: number; ay: number; item: TextItem } | null>(null);
  const patch = (p: Partial<ExportOptions>) => setOpts((o) => ({ ...o, ...p }));
  const patchText = (p: Partial<ExportTextEnhance>) =>
    setOpts((o) => ({ ...o, text: { scales: {}, halo: true, plates: false, offsets: {}, overrides: {}, sizes: {}, ...(o.text ?? {}), ...p } }));
  /** 双击就地编辑状态（预览内）：文字内容 + 字号（空=默认） */
  const [editing, setEditing] = useState<{ key: string; value: string; size: string; left: number; top: number } | null>(null);
  const editCancelRef = useRef(false);
  const editingRef = useRef(editing);
  editingRef.current = editing;
  offsetsRef.current = opts.text?.offsets ?? {};

  const hasSelection = ui.selection.nodes.length + ui.selection.pipes.length > 0;
  /** 画布客户端坐标 → 世界坐标（经 svg 元素尺寸与 data-world 变换反推） */
  const clientToWorld = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const sw = (svg as SVGSVGElement).width?.baseVal?.value || r.width;
    const sh = (svg as SVGSVGElement).height?.baseVal?.value || r.height;
    const ux = (clientX - r.left) * (sw / r.width);
    const uy = (clientY - r.top) * (sh / r.height);
    const tr = (svg.querySelector("[data-world='1']")?.getAttribute("transform") || "").match(/translate\(\s*([-\d.eE]+)[ ,]+([-\d.eE]+)\s*\)\s*scale\(\s*([-\d.eE]+)\s*\)/);
    const tx = tr ? parseFloat(tr[1]) : 0, ty = tr ? parseFloat(tr[2]) : 0, s = tr ? parseFloat(tr[3]) : 1;
    return { x: (ux - tx) / s, y: (uy - ty) / s };
  };
  const buildTextCatalog = (): TextItem[] => {
    const items: TextItem[] = [];
    const svgEl = svgRef.current;
    if (svgEl) {
      svgEl.querySelectorAll(".fp-node-label, .fp-pipe-annotation, .fp-fluid-label, text[data-pipe-id]").forEach((el) => {
        const pipeId = el.getAttribute("data-pipe-id");
        const nodeId = el.getAttribute("data-node-id");
        const kind = el.getAttribute("data-node-kind");
        const cat: ExportTextCategory = pipeId ? "pipes" : kind === "solenoid2" || kind === "solenoid3" ? "valves" : "components";
        const suffix = pipeId
          ? el.classList.contains("fp-fluid-label") ? ":fluid" : el.classList.contains("fp-pipe-annotation") ? ":anno" : ":label"
          : "";
        items.push({
          key: pipeId ? `pipe:${pipeId}${suffix}` : `node:${nodeId}`,
          cat,
          x: Number(el.getAttribute("x") || 0),
          y: Number(el.getAttribute("y") || 0),
          fs: Number(el.getAttribute("font-size") || 12),
          len: (el.textContent || "").length,
          text: el.textContent || "",
        });
      });
      // 开关徽标分段（锚点由屏幕坐标换算；拖拽整组、双击改单段文字）
      svgEl.querySelectorAll("g.fp-state-badge").forEach((badge) => {
        const host = badge.closest("[data-node-id]");
        if (!host) return;
        const nodeId = host.getAttribute("data-node-id");
        [...badge.querySelectorAll("text")].forEach((t, i) => {
          const br = t.getBoundingClientRect();
          const wp = clientToWorld(br.left + br.width / 2, br.top + br.height / 2);
          if (!wp) return;
          items.push({
            key: `node:${nodeId}:badge:${i}`,
            groupKey: `node:${nodeId}:badge`,
            cat: "switches",
            x: wp.x, y: wp.y,
            fs: Number(t.getAttribute("font-size") || 10),
            len: (t.textContent || "").length,
            text: t.textContent || "",
          });
        });
      });
    }
    const { extra } = prepareExportDiagram(diagram, { ...opts, selection: ui.selection });
    for (const n of extra) {
      if (n.type === "shape") {
        items.push({ key: `export:${n.id}`, cat: "legend", x: n.x + (n.width || 130) / 2, y: n.y + (n.height || 28) / 2 + 5, fs: n.fontSize ?? 13, len: n.label.length, text: n.label });
      } else {
        const fs = n.fontSize ?? 14;
        items.push({ key: `export:${n.id}`, cat: n.exportKind === "legend" ? "legend" : "custom", x: n.x + (n.width || 0) / 2, y: n.y + (n.height || 24) / 2 + fs / 3, fs, len: n.label.length, text: n.label });
      }
    }
    return items;
  };

  /** 最近的文字项（命中测试：近似包围盒 + 半径容差；容差按缩放换算为固定屏幕像素） */
  const nearestTextItem = (wx: number, wy: number): TextItem | null => {
    const list = catalogRef.current.length ? catalogRef.current : buildTextCatalog();
    const meta = previewMetaRef.current;
    const tol = meta ? Math.max(2, 12 / (meta.fit * viewRef.current.z)) : 12;
    const offs = offsetsRef.current;
    let best: { item: TextItem; d: number } | null = null;
    for (const it of list) {
      const o = offs[it.groupKey ?? it.key];
      const ix = it.x + (o?.x ?? 0);
      const iy = it.y + (o?.y ?? 0);
      const halfW = Math.max(26, it.fs * it.len * 0.5);
      const halfH = Math.max(14, it.fs);
      const dx = Math.max(0, Math.abs(wx - ix) - halfW);
      const dy = Math.max(0, Math.abs(wy - iy) - halfH);
      const d = Math.hypot(dx, dy);
      if (d < tol && (!best || d < best.d)) best = { item: it, d };
    }
    return best ? best.item : null;
  };

  /** 画布客户端坐标 → 基础位图像素（考虑 object-fit:contain 居中留白） */
  const bitmapFromClient = (clientX: number, clientY: number): { bx: number; by: number; scale: number } | null => {
    const cv = previewRef.current;
    if (!cv) return null;
    const rect = cv.getBoundingClientRect();
    const scale = Math.min(rect.width / cv.width, rect.height / cv.height) || 1;
    const ox = rect.left + (rect.width - cv.width * scale) / 2;
    const oy = rect.top + (rect.height - cv.height * scale) / 2;
    return { bx: (clientX - ox) / scale, by: (clientY - oy) / scale, scale };
  };

  /** 画布客户端坐标 → 世界坐标（含视图缩放/平移） */
  const canvasToWorld = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const meta = previewMetaRef.current;
    const bm = bitmapFromClient(clientX, clientY);
    if (!meta || !bm) return null;
    const v = viewRef.current;
    const cx = (bm.bx - v.panX) / v.z;
    const cy = (bm.by - v.panY) / v.z;
    return { x: cx / Math.max(0.001, meta.fit) + meta.x, y: cy / Math.max(0.001, meta.fit) + meta.y };
  };

  /** 平移越界收敛（软边距）；z<1 时居中 */
  const clampView = () => {
    const meta = previewMetaRef.current;
    if (!meta) return;
    const v = viewRef.current;
    v.z = Math.min(8, Math.max(0.5, v.z));
    const w = meta.bw * v.z, h = meta.bh * v.z;
    const m = 60;
    v.panX = w <= meta.bw ? (meta.bw - w) / 2 : Math.min(m, Math.max(meta.bw - w - m, v.panX));
    v.panY = h <= meta.bh ? (meta.bh - h) / 2 : Math.min(m, Math.max(meta.bh - h - m, v.panY));
  };

  /** 重绘预览（图像 + 悬停/拖拽高亮），rAF 节流 */
  const drawPreview = () => {
    const cv = previewRef.current;
    const meta = previewMetaRef.current;
    const img = imgRef.current;
    if (!cv || !meta || !img) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const { z, panX, panY } = viewRef.current;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.imageSmoothingEnabled = z < 1;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, panX, panY, meta.bw * z, meta.bh * z);
    const hl = activeRef.current ?? hoverRef.current;
    if (hl) {
      const o = offsetsRef.current[hl.groupKey ?? hl.key];
      const bx = (hl.x + (o?.x ?? 0) - meta.x) * meta.fit * z + panX;
      const by = (hl.y + (o?.y ?? 0) - meta.y) * meta.fit * z + panY;
      const halfW = Math.max(26, hl.fs * hl.len * 0.5) * meta.fit * z;
      const halfH = Math.max(14, hl.fs) * meta.fit * z;
      ctx.save();
      ctx.fillStyle = "rgba(47,127,214,0.08)";
      ctx.strokeStyle = "#2f7fd6";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 3]);
      ctx.fillRect(bx - halfW, by - halfH, halfW * 2, halfH * 2);
      ctx.strokeRect(bx - halfW, by - halfH, halfW * 2, halfH * 2);
      ctx.restore();
    }
  };
  const scheduleDraw = () => {
    if (drawRafRef.current) return;
    drawRafRef.current = requestAnimationFrame(() => { drawRafRef.current = 0; drawPreview(); });
  };

  /** 以位图点 (bx,by) 为锚缩放（光标下的内容保持不动） */
  const zoomAt = (bx: number, by: number, factor: number) => {
    const v = viewRef.current;
    const z2 = Math.min(8, Math.max(0.5, v.z * factor));
    if (Math.abs(z2 - v.z) < 0.001) return;
    const cx = (bx - v.panX) / v.z, cy = (by - v.panY) / v.z;
    v.z = z2;
    v.panX = bx - cx * z2;
    v.panY = by - cy * z2;
    clampView();
    setZoomPct(Math.round(v.z * 100));
    scheduleDraw();
  };
  const zoomBy = (factor: number) => {
    const cv = previewRef.current;
    if (!cv) return;
    zoomAt(cv.width / 2, cv.height / 2, factor);
  };
  const fitView = () => {
    viewRef.current = { z: 1, panX: 0, panY: 0 };
    setZoomPct(100);
    scheduleDraw();
  };

  const onPreviewPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cv = e.currentTarget;
    const w = canvasToWorld(e.clientX, e.clientY);
    if (!w) return;
    const item = e.button === 1 ? null : nearestTextItem(w.x, w.y);
    if (item) {
      dragRef.current = { key: item.groupKey ?? item.key, ax: item.x, ay: item.y, item };
      activeRef.current = item;
      try { cv.setPointerCapture?.(e.pointerId); } catch { /* 合成事件/无活动指针时忽略 */ }
      cv.classList.add("text-dragging");
      scheduleDraw();
      return;
    }
    panRef.current = { sx: e.clientX, sy: e.clientY, px: viewRef.current.panX, py: viewRef.current.panY };
    try { cv.setPointerCapture?.(e.pointerId); } catch { /* 合成事件/无活动指针时忽略 */ }
    cv.classList.add("panning");
  };

  const onPreviewPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cv = e.currentTarget;
    const pan = panRef.current;
    if (pan) {
      const bm = bitmapFromClient(e.clientX, e.clientY);
      if (!bm) return;
      viewRef.current.panX = pan.px + (e.clientX - pan.sx) / bm.scale;
      viewRef.current.panY = pan.py + (e.clientY - pan.sy) / bm.scale;
      clampView();
      scheduleDraw();
      return;
    }
    const drag = dragRef.current;
    if (drag) {
      const w = canvasToWorld(e.clientX, e.clientY);
      if (!w) return;
      const off = opts.text?.offsets ?? {};
      patchText({ offsets: { ...off, [drag.key]: { x: Math.round(w.x - drag.ax), y: Math.round(w.y - drag.ay) } } });
      scheduleDraw();
      return;
    }
    // 悬停命中：更新高亮与光标（选中更精准）
    const w = canvasToWorld(e.clientX, e.clientY);
    const it = w ? nearestTextItem(w.x, w.y) : null;
    if ((it?.key ?? null) !== (hoverRef.current?.key ?? null)) {
      hoverRef.current = it;
      cv.style.cursor = it ? "move" : "grab";
      scheduleDraw();
    }
  };

  const onPreviewPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cv = e.currentTarget;
    let changed = false;
    if (panRef.current) { panRef.current = null; changed = true; }
    if (dragRef.current) { dragRef.current = null; activeRef.current = null; changed = true; }
    cv.classList.remove("text-dragging");
    cv.classList.remove("panning");
    if (changed) scheduleDraw();
  };

  /** 双击预览文字 → 就地修改内容/字号 */
  const onPreviewDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const w = canvasToWorld(e.clientX, e.clientY);
    if (!w) return;
    const item = nearestTextItem(w.x, w.y);
    if (!item) return;
    const cv = previewRef.current;
    const wrap = cv?.parentElement;
    if (!wrap) return;
    const wr = wrap.getBoundingClientRect();
    const sizeOv = opts.text?.sizes?.[item.key];
    // 新增文字：字号框预填其当前字号（无 sizes 覆盖时取 extraTexts 里的值）
    const utId = item.key.startsWith("export:ex_") ? item.key.slice("export:ex_".length) : null;
    const utSize = utId ? opts.extraTexts?.find((x) => x.id === utId)?.size : undefined;
    setEditing({
      key: item.key,
      value: opts.text?.overrides?.[item.key] ?? item.text,
      size: sizeOv !== undefined ? String(sizeOv) : utSize !== undefined ? String(utSize) : "",
      left: Math.min(Math.max(8, e.clientX - wr.left + 10), Math.max(8, wr.width - 310)),
      top: Math.min(Math.max(8, e.clientY - wr.top + 12), Math.max(8, wr.height - 64)),
    });
  };

  /** 提交就地编辑：内容→overrides，字号→sizes（空即恢复默认） */
  const commitEdit = () => {
    const ed = editingRef.current;
    if (!ed) return;
    setEditing(null);
    const ov = { ...(opts.text?.overrides ?? {}) };
    const v = ed.value.trim();
    if (!v) delete ov[ed.key];
    else ov[ed.key] = v;
    const sz = { ...(opts.text?.sizes ?? {}) };
    const num = Number(ed.size);
    if (ed.size.trim() === "" || !isFinite(num) || num <= 0) delete sz[ed.key];
    else sz[ed.key] = Math.round(num * 10) / 10;
    patchText({ overrides: ov, sizes: sz });
  };

  /** 在预览视口中心新增一段自由文字（可拖拽/双击改字与字号） */
  const addExtraText = () => {
    const cv = previewRef.current;
    let wx = 120, wy = 120;
    if (cv) {
      const r = cv.getBoundingClientRect();
      const c = canvasToWorld(r.left + r.width / 2, r.top + r.height / 2);
      if (c) { wx = c.x; wy = c.y; }
    }
    const id = `ut${Date.now().toString(36)}`;
    patch({ extraTexts: [...(opts.extraTexts ?? []), { id, text: t("新文字"), x: Math.round(wx), y: Math.round(wy), size: 18 }] });
  };

  /** 删除新增文字并清理它的偏移/改字/字号记录 */
  const removeExtraText = (id: string) => {
    const ek = `export:ex_${id}`;
    const off = { ...(opts.text?.offsets ?? {}) }; delete off[ek];
    const ovr = { ...(opts.text?.overrides ?? {}) }; delete ovr[ek];
    const szs = { ...(opts.text?.sizes ?? {}) }; delete szs[ek];
    patch({ extraTexts: (opts.extraTexts ?? []).filter((x) => x.id !== id) });
    patchText({ offsets: off, overrides: ovr, sizes: szs });
  };

  // 语言切换时同步导出物语言（图例/日期）
  useEffect(() => { patch({ lang }); }, [lang]);

  // 实时预览：选项变更重建 SVG（拖拽中即时、平时防抖）；缩放/平移仅重绘不改内容
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || !previewRef.current) return;
    const id = ++reqIdRef.current;
    const immediate = dragRef.current !== null;
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
          const bw = Math.max(1, Math.round(w * fit));
          const bh = Math.max(1, Math.round(h * fit));
          cv.width = bw;
          cv.height = bh;
          previewMetaRef.current = { x, y, w, h, fit, bw, bh };
          imgRef.current = img;
          catalogRef.current = buildTextCatalog();
          clampView();
          drawPreview();
          URL.revokeObjectURL(url);
        };
        img.onerror = () => URL.revokeObjectURL(url);
        img.src = url;
      } catch { /* 预览失败静默（导出时会报错） */ }
    }, immediate ? 16 : 120);
    return () => clearTimeout(timer);
  }, [opts, diagram, svgRef]);

  // 滚轮缩放（原生监听：需要 preventDefault；React 合成 wheel 为 passive）
  useEffect(() => {
    const cv = previewRef.current;
    if (!cv) return;
    const onWheel = (e: WheelEvent) => {
      if (!previewMetaRef.current) return;
      e.preventDefault();
      const bm = bitmapFromClient(e.clientX, e.clientY);
      if (bm) zoomAt(bm.bx, bm.by, Math.exp(-e.deltaY * 0.0018));
    };
    cv.addEventListener("wheel", onWheel, { passive: false });
    return () => cv.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      const existing = new Set(diagram.nodes.map((n) => n.id));
      const textNodes = extra.filter((n) => n.type === "label" && !existing.has(n.id));
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
              onDoubleClick={onPreviewDoubleClick}
            />
            <div className="exp-zoom-bar">
              <button onClick={() => zoomBy(1 / 1.25)} title={t("缩小")}>−</button>
              <span className="exp-zoom-val">{zoomPct}%</span>
              <button onClick={() => zoomBy(1.25)} title={t("放大")}>＋</button>
              <button className="exp-zoom-fit" onClick={fitView}>{t("适应")}</button>
            </div>
            {editing && (
              <div
                className="exp-text-edit"
                style={{ left: editing.left, top: editing.top }}
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    if (editCancelRef.current) { editCancelRef.current = false; return; }
                    commitEdit();
                  }
                }}
              >
                <input
                  className="exp-text-edit-main"
                  autoFocus
                  value={editing.value}
                  placeholder={t("文字内容")}
                  onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitEdit();
                    if (e.key === "Escape") { editCancelRef.current = true; setEditing(null); }
                  }}
                />
                <input
                  className="exp-text-edit-size"
                  type="number"
                  min={6}
                  max={160}
                  value={editing.size}
                  placeholder={t("大小")}
                  onChange={(e) => setEditing({ ...editing, size: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitEdit();
                    if (e.key === "Escape") { editCancelRef.current = true; setEditing(null); }
                  }}
                />
              </div>
            )}
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
                {(Object.keys(opts.text?.offsets ?? {}).length > 0 || Object.keys(opts.text?.overrides ?? {}).length > 0 || Object.keys(opts.text?.sizes ?? {}).length > 0) && (
                  <div className="exp-reset-row">
                    {Object.keys(opts.text?.offsets ?? {}).length > 0 && (
                      <button className="btn ghost exp-reset" onClick={() => patchText({ offsets: {} })}>{t("重置位置")}</button>
                    )}
                    {(Object.keys(opts.text?.overrides ?? {}).length > 0 || Object.keys(opts.text?.sizes ?? {}).length > 0) && (
                      <button className="btn ghost exp-reset" onClick={() => patchText({ overrides: {}, sizes: {} })}>{t("重置文字")}</button>
                    )}
                  </div>
                )}
                <div className="exp-tip">{t("滚轮缩放、空白处拖动平移；单击文字拖拽移动，双击改文字/大小（仅导出物生效）")}</div>
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
                <div className="exp-row">
                  <label>{t("添加文字")}</label>
                  <button className="btn ghost exp-add-text" onClick={addExtraText}>＋ {t("添加文字")}</button>
                  <span className="exp-val">{t("拖拽移动、双击改字与字号")}</span>
                </div>
                {(opts.extraTexts?.length ?? 0) > 0 && (
                  <div className="exp-extra-chips">
                    {(opts.extraTexts ?? []).map((et) => (
                      <span className="exp-chip" key={et.id}>
                        <span>{et.text}</span>
                        <button title={t("删除文字")} onClick={() => removeExtraText(et.id)}>✕</button>
                      </span>
                    ))}
                  </div>
                )}
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
