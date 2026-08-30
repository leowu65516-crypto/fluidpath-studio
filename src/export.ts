import { GIFEncoder, applyPalette, quantize } from "gifenc";
import type { Diagram, DiagramNode } from "./types";
import { createNode } from "./symbols";
import { buildLegendNodes } from "./legend";
import { nodeBBox, pipePolyline, polylineBBox } from "./geometry";
import { toast } from "./toast";

/** 一键分享：压缩 diagram 为 Base64 URL 片段 */
export function compressDiagram(diagram: Diagram): string {
  const json = JSON.stringify(diagram);
  // UTF-8 → 二进制串 → Base64（URL-safe）
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  const b64 = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return b64;
}

/** 从 URL 片段解压 diagram */
export function decompressDiagram(encoded: string): Diagram {
  const b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const json = new TextDecoder().decode(bytes);
  return parseDiagramJSON(json);
}

/** 生成可分享链接 */
export function buildShareLink(diagram: Diagram): string {
  const base = `${location.origin}${location.pathname}`;
  return `${base}?diagram=${compressDiagram(diagram)}`;
}

function download(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export interface JsonSaveResult {
  saved: boolean;
  filename: string;
  picker: boolean;
}

/** 网页端保存 JSON：优先使用系统文件保存器，浏览器不支持时回退为下载。 */
export async function saveJSONFile(diagram: Diagram): Promise<JsonSaveResult> {
  const rawName = (diagram.name || "fluidpath-diagram").replace(/[\\/:*?\"<>|]/g, "_").trim() || "fluidpath-diagram";
  const filename = `${rawName.toLowerCase().endsWith(".json") ? rawName.slice(0, -5) : rawName}.json`;
  const json = JSON.stringify({ ...diagram, _version: 3, _exportedAt: new Date().toISOString() }, null, 2);
  const picker = (window as Window & {
    showSaveFilePicker?: (options?: {
      suggestedName?: string;
      types?: Array<{ description: string; accept: Record<string, string[]> }>;
    }) => Promise<{ name: string; createWritable: () => Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void> }> }>;
  }).showSaveFilePicker;
  if (picker && window.isSecureContext !== false) {
    const handle = await picker({
      suggestedName: filename,
      types: [{ description: "JSON 图纸", accept: { "application/json": [".json"] } }],
    });
    const writable = await handle.createWritable();
    await writable.write(json);
    await writable.close();
    return { saved: true, filename: handle.name || filename, picker: true };
  }
  download(filename, new Blob([json], { type: "application/json" }));
  return { saved: true, filename, picker: false };
}

function contentBBox(diagram: Diagram) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const eat = (r: { x: number; y: number; w: number; h: number }) => {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  };
  diagram.nodes.forEach((n) => eat(nodeBBox(n)));
  diagram.pipes.forEach((p) => {
    const pts = pipePolyline(p, diagram.nodes);
    if (pts) {
      const b = polylineBBox(pts);
      eat({ x: b.x - p.visualDiameter, y: b.y - p.visualDiameter, w: b.w + p.visualDiameter * 2, h: b.h + p.visualDiameter * 2 });
    }
  });
  if (!isFinite(minX)) return { x: 0, y: 0, w: 800, h: 600 };
  const pad = 48;
  return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
}

/** 从画布 SVG 克隆出干净的导出用 DOM（剔除 UI 辅助元素）。transparent 时去除背景色 */
// ===== 导出预览/覆盖管线（v1.18）：所见即所得的导出前编辑 =====

/** 导出选项：全部只作用于导出物，画布零污染（延续「验收在副本运行」的哲学） */
export interface ExportOptions {
  format: "png" | "jpg" | "svg" | "pdf" | "gif";
  /** 背景：white=纯白 / canvas=画布背景色 / transparent=透明（jpg 不支持） */
  background: "white" | "canvas" | "transparent";
  /** 像素倍率 1/2/3 */
  scale: number;
  /** 四周留白（世界 px） */
  padding: number;
  filename: string;
  /** 仅导出选中（有选中时可用；由调用方裁剪） */
  selectionOnly: boolean;
  /** 当前画布选中（selectionOnly 用） */
  selection?: { nodes: string[]; pipes: string[] };
  /** 文字增强倍率 1–2（节点标签/管路标注/介质文字/图例） */
  textScale: number;
  /** 状态徽标样式：default=画布同款 / pill=强化描边放大 / hidden=隐藏 */
  badgeStyle: "default" | "pill" | "hidden";
  /** 图例段开关 */
  legend: { fluid: boolean; diameter: boolean; status: boolean };
  /** 自定义文字层（可选） */
  title?: string;
  subtitle?: string;
  footnote?: string;
  watermark?: string;
  dateStamp: boolean;
  /** 自定义文字是否同时写入画布（默认否） */
  saveTextToDiagram: boolean;
  /** 暗色导出（元素色映射暗色板，背景自动深色） */
  darkMode: boolean;
  /** GIF：帧间隔 ms（默认约 66 = 15fps） */
  gifFrameDelay: number;
  lang: "zh" | "en";
}

export const EXPORT_DEFAULTS: Omit<ExportOptions, "format" | "lang"> = {
  background: "white",
  scale: 2,
  padding: 24,
  filename: "",
  selectionOnly: false,
  textScale: 1,
  badgeStyle: "default",
  legend: { fluid: false, diameter: false, status: false },
  dateStamp: false,
  saveTextToDiagram: false,
  darkMode: false,
  gifFrameDelay: 66,
};

/** 导出主题色板（与 styles.css 的 :root / body[data-theme="dark"] 保持一致） */
const THEME_VARS: Record<"light" | "dark", Record<string, string>> = {
  light: {
    "--bg-work": "#e8edf3", "--panel": "#ffffff", "--border": "#d7dee7", "--text": "#2b3644",
    "--text-dim": "#6b7787", "--accent": "#2f7fd6", "--accent-soft": "#e7f0fb", "--danger": "#d64545",
    "--surface": "#fbfcfe", "--surface-2": "#f0f4f9", "--tip-bg": "#f4f7fb", "--input-bg": "#ffffff",
    "--brand": "#1f2c3d", "--static": "#7a8794", "--section-title": "#34435a", "--node-label": "#41505f",
    "--card": "#ffffff",
  },
  dark: {
    "--bg-work": "#141b24", "--panel": "#1d2632", "--border": "#334052", "--text": "#dde5ee",
    "--text-dim": "#8b99a9", "--accent": "#4d9ef0", "--accent-soft": "#223550", "--danger": "#e27070",
    "--surface": "#242f3d", "--surface-2": "#2a3646", "--tip-bg": "#242f3d", "--input-bg": "#242f3d",
    "--brand": "#e6edf5", "--static": "#93a1b1", "--section-title": "#c6d2e0", "--node-label": "#aebccb",
    "--card": "#24303d",
  },
};

/** 把 clone 内 fill/stroke 等属性中的 var(--x) 解析为具体色值（SVG as image 不解析 CSS 变量） */
function resolveSvgTheme(clone: SVGSVGElement, theme: "light" | "dark") {
  const vars = THEME_VARS[theme];
  const repl = (v: string): string => {
    if (!v || !v.startsWith("var(")) return v;
    const m = v.match(/var\(--([a-zA-Z-]+)\)/);
    if (!m) return v;
    return vars["--" + m[1]] ?? v;
  };
  const attrs = ["fill", "stroke", "stop-color", "flood-color"];
  clone.querySelectorAll("*").forEach((el) => {
    for (const a of attrs) {
      const v = el.getAttribute(a);
      if (v && v.includes("var(")) el.setAttribute(a, repl(v.trim()));
    }
  });
}

/** 文字/徽标 SVG DOM 后处理 */
function applySvgOverrides(clone: SVGSVGElement, opts: ExportOptions) {
  // 文字增强
  if (opts.textScale !== 1) {
    clone.querySelectorAll(".fp-node-label, .fp-pipe-annotation, .fp-fluid-label").forEach((el) => {
      const fs = Number(el.getAttribute("font-size") || 0);
      if (fs > 0) el.setAttribute("font-size", String(Math.round(fs * opts.textScale * 10) / 10));
    });
  }
  // 状态徽标
  if (opts.badgeStyle === "hidden") {
    clone.querySelectorAll(".fp-state-badge").forEach((el) => el.remove());
  } else if (opts.badgeStyle === "pill") {
    clone.querySelectorAll(".fp-state-badge").forEach((el) => {
      if (el.tagName.toLowerCase() === "text") {
        const fs = Number(el.getAttribute("font-size") || 0);
        if (fs > 0) el.setAttribute("font-size", String(Math.round(fs * 1.35 * 10) / 10));
        el.setAttribute("stroke", "#ffffff");
        el.setAttribute("stroke-width", "3");
        el.setAttribute("style", "paint-order: stroke");
      }
    });
  }
}

/** 计算内容包围盒（含附加节点） */
function bboxWith(nodes: DiagramNode[], diagram: Diagram): { x: number; y: number; w: number; h: number } {
  return contentBBox({ ...diagram, nodes: [...diagram.nodes, ...nodes] } as Diagram);
}

/**
 * 导出数据副本准备：
 * - 按 opts 生成图例节点（右上外侧）与自定义文字层（标题/副标题顶部居中，底部说明/日期/水印）；
 * - 返回图纸副本 + 附加节点列表（不修改画布）。
 */
export function prepareExportDiagram(diagram: Diagram, opts: ExportOptions): { diagram: Diagram; extra: DiagramNode[] } {
  const d = structuredClone(diagram);
  // 仅导出选中：保留选中节点/管路 + 两端都保留的连通管路
  if (opts.selectionOnly && opts.selection && (opts.selection.nodes.length + opts.selection.pipes.length > 0)) {
    const nodeSet = new Set(opts.selection.nodes);
    const pipeSet = new Set(opts.selection.pipes);
    d.nodes = d.nodes.filter((n) => nodeSet.has(n.id));
    const keptIds = new Set(d.nodes.map((n) => n.id));
    const portNode = new Map<string, string>();
    for (const n of d.nodes) for (const p of n.ports) portNode.set(p.id, n.id);
    d.pipes = d.pipes.filter((p) => {
      if (pipeSet.has(p.id)) return true;
      const fn = p.fromPortId ? portNode.get(p.fromPortId) : undefined;
      const tn = p.toPortId ? portNode.get(p.toPortId) : undefined;
      return !!(fn && tn && keptIds.has(fn) && keptIds.has(tn));
    });
  }
  const extra: DiagramNode[] = [];
  const base = contentBBox(d);
  const cx = base.x + base.w / 2;
  let top = base.y;
  const mkLabel = (text: string, y: number, fontSize: number, fill: string): DiagramNode => {
    const n = createNode("label", 0, 0, text);
    n.fontSize = fontSize;
    n.fill = fill;
    n.width = Math.max(240, text.length * fontSize * 1.05);
    n.height = fontSize + 14;
    n.x = cx - n.width / 2;
    n.y = y;
    return n;
  };
  if (opts.title?.trim()) {
    extra.push(mkLabel(opts.title.trim(), top - 64, 26, opts.darkMode ? "#dde5ee" : "#1f2c3d"));
    top -= 68;
  }
  if (opts.subtitle?.trim()) {
    extra.push(mkLabel(opts.subtitle.trim(), top - 34, 15, opts.darkMode ? "#8b99a9" : "#6b7787"));
  }
  const bottom = base.y + base.h + 18;
  if (opts.footnote?.trim()) extra.push(mkLabel(opts.footnote.trim(), bottom, 13, opts.darkMode ? "#8b99a9" : "#6b7787"));
  if (opts.dateStamp) {
    const stamp = new Date().toLocaleString(opts.lang === "zh" ? "zh-CN" : "en-US");
    const n = mkLabel(stamp, bottom, 12, opts.darkMode ? "#8b99a9" : "#9aa7b5");
    n.x = base.x + base.w - n.width;
    extra.push(n);
  }
  if (opts.watermark?.trim()) {
    const n = mkLabel(opts.watermark.trim(), bottom, 13, opts.darkMode ? "#6b7787" : "#9aa7b5");
    n.x = base.x;
    extra.push(n);
  }
  if (opts.legend.fluid || opts.legend.diameter || opts.legend.status) {
    const nodes = buildLegendNodes(d, base.x + base.w + 28, base.y, opts.legend, opts.lang);
    extra.push(...nodes);
  }
  return { diagram: d, extra };
}
function appendExportNodes(clone: SVGSVGElement, extra: DiagramNode[]) {
  const world = clone.querySelector("[data-world='1']");
  if (!world) return;
  const NS = "http://www.w3.org/2000/svg";
  for (const n of extra) {
    const g = document.createElementNS(NS, "g");
    if (n.type === "shape" && n.variant === "rect") {
      const r = document.createElementNS(NS, "rect");
      r.setAttribute("x", String(n.x)); r.setAttribute("y", String(n.y));
      r.setAttribute("width", String(n.width)); r.setAttribute("height", String(n.height));
      r.setAttribute("rx", "6");
      r.setAttribute("fill", n.fill); r.setAttribute("stroke", n.stroke); r.setAttribute("stroke-width", "1");
      g.appendChild(r);
      const t = document.createElementNS(NS, "text");
      t.setAttribute("x", String(n.x + n.width / 2));
      t.setAttribute("y", String(n.y + n.height / 2 + 5));
      t.setAttribute("text-anchor", "middle");
      t.setAttribute("font-size", String(n.fontSize ?? 13));
      t.setAttribute("fill", n.stroke);
      t.setAttribute("font-family", "system-ui, -apple-system, sans-serif");
      t.setAttribute("font-weight", "600");
      t.textContent = n.label;
      g.appendChild(t);
    } else {
      // label 文本
      const t = document.createElementNS(NS, "text");
      const w = n.width || 400;
      t.setAttribute("x", String(n.x + w / 2));
      t.setAttribute("y", String(n.y + (n.height ?? 24) / 2 + (n.fontSize ?? 14) / 3));
      t.setAttribute("text-anchor", "middle");
      t.setAttribute("font-size", String(n.fontSize ?? 14));
      t.setAttribute("fill", n.fill && n.fill !== "#fff" ? n.fill : "#2b3644");
      t.setAttribute("font-family", "system-ui, -apple-system, sans-serif");
      if (n.fontSize && n.fontSize >= 22) t.setAttribute("font-weight", "700");
      t.textContent = n.label;
      g.appendChild(t);
    }
    world.appendChild(g);
  }
}


function buildExportClone(svgEl: SVGSVGElement, diagram: Diagram, transparent = false): { clone: SVGSVGElement; w: number; h: number } {
  const bbox = contentBBox(diagram);
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll("[data-ui='1']").forEach((el) => el.remove());
  const world = clone.querySelector("[data-world='1']");
  if (world) world.removeAttribute("transform");
  clone.setAttribute("viewBox", `${bbox.x} ${bbox.y} ${bbox.w} ${bbox.h}`);
  clone.setAttribute("width", String(Math.round(bbox.w)));
  clone.setAttribute("height", String(Math.round(bbox.h)));
  clone.removeAttribute("style");
  clone.removeAttribute("class");
  // 背景（透明导出时跳过）
  if (!transparent) {
    const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bg.setAttribute("x", String(bbox.x));
    bg.setAttribute("y", String(bbox.y));
    bg.setAttribute("width", String(bbox.w));
    bg.setAttribute("height", String(bbox.h));
    bg.setAttribute("fill", diagram.settings.background || "#ffffff");
    clone.insertBefore(bg, clone.firstChild);
  }
  return { clone, w: Math.round(bbox.w), h: Math.round(bbox.h) };
}

export function buildExportSVG(svgEl: SVGSVGElement, diagram: Diagram, transparent = false): { svg: string; w: number; h: number } {
  const { clone, w, h } = buildExportClone(svgEl, diagram, transparent);
  const xml = new XMLSerializer().serializeToString(clone);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n` + xml;
  return { svg, w, h };
}

export function exportSVG(svgEl: SVGSVGElement, diagram: Diagram, transparent = false) {
  const { svg } = buildExportSVG(svgEl, diagram, transparent);
  download(`${diagram.name || "fluidpath"}.svg`, new Blob([svg], { type: "image/svg+xml" }));
}

export function exportPNG(svgEl: SVGSVGElement, diagram: Diagram, scale = 2, transparent = false) {
  const { svg, w, h } = buildExportSVG(svgEl, diagram, transparent);
  rasterizeAndDownload(svg, w, h, diagram, scale, transparent, "image/png", "png");
}

/** JPG 导出（不支持透明，默认白色背景，质量 0.92） */
export function exportJPG(svgEl: SVGSVGElement, diagram: Diagram, scale = 2, quality = 0.92) {
  const { svg, w, h } = buildExportSVG(svgEl, diagram, false);
  rasterizeAndDownload(svg, w, h, diagram, scale, false, "image/jpeg", "jpg", quality);
}

function rasterizeAndDownload(
  svgText: string, w: number, h: number,
  diagram: Diagram, scale: number, transparent: boolean,
  mimeType: string, ext: string, quality?: number, bgColor?: string, filename?: string
) {
  const url = URL.createObjectURL(new Blob([svgText], { type: "image/svg+xml" }));
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext("2d")!;
    if (!transparent) {
      ctx.fillStyle = bgColor || diagram.settings.background || "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    canvas.toBlob((blob) => {
      if (blob) download(`${filename || diagram.name || "fluidpath"}.${ext}`, blob);
    }, mimeType, quality);
  };
  img.onerror = () => URL.revokeObjectURL(url);
  img.src = url;
}

function rasterize(svgText: string, w: number, h: number): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svgText], { type: "image/svg+xml" }));
    const img = new Image(w, h);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("SVG 渲染失败"));
    };
    img.src = url;
  });
}

/**
 * 真实 GIF 导出：逐帧推进各管路流动层的 stroke-dashoffset，
 * 序列化 SVG → 位图 → gifenc 调色板编码。
 * 每条管路的位移量取整数个虚线周期，保证 GIF 无缝循环。
 */
export async function exportGIF(
  svgEl: SVGSVGElement,
  diagram: Diagram,
  onProgress?: (ratio: number) => void,
  transparent = false
): Promise<void> {
  const DURATION = 2; // 秒
  const FRAMES = 30; // 15 fps
  const { clone, w, h } = buildExportClone(svgEl, diagram, transparent);
  const scale = Math.min(1.5, Math.max(0.5, 1100 / Math.max(w, h)));
  const outW = Math.round(w * scale);
  const outH = Math.round(h * scale);

  // 预计算每条管路的循环参数
  const flows: Array<{ el: Element; cyclePx: number; dir: number }> = [];
  for (const pipe of diagram.pipes) {
    const el = clone.querySelector(`[data-flow="${pipe.id}"]`);
    if (!el) continue;
    if (!pipe.animated) continue;
    const dashLen = Math.max(6, pipe.visualDiameter * 1.5);
    const gapMul = pipe.particleDensity === "high" ? 1.1 : pipe.particleDensity === "medium" ? 2.1 : 3.6;
    const period = dashLen + Math.round(dashLen * gapMul);
    const speedPx = 26 + pipe.flowSpeed * 58;
    const cycles = Math.max(1, Math.round((speedPx * DURATION) / period));
    flows.push({ el, cyclePx: cycles * period, dir: pipe.direction === "forward" ? 1 : -1 });
  }

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

  // 咖啡出口滴液水滴：逐帧驱动（DURATION 内整数个滴落周期，保证循环无缝）
  const drips = Array.from(clone.querySelectorAll('[data-drip="1"]')).map((el) => ({
    el,
    phase: Number(el.getAttribute("data-drip-phase") || 0)
  }));
  const dripCycles = Math.max(1, Math.round(DURATION / 1.05));

  const gif = GIFEncoder();
  let palette: number[][] | null = null;
  const delay = Math.round((DURATION * 1000) / FRAMES);

  for (let i = 0; i < FRAMES; i++) {
    const t = i / FRAMES;
    for (const f of flows) {
      f.el.setAttribute("stroke-dashoffset", (-f.dir * f.cyclePx * t).toFixed(2));
    }
    for (const d of drips) {
      const p = (t * dripCycles + d.phase) % 1;
      const op = p < 0.12 ? (p / 0.12) * 0.9 : p > 0.8 ? ((1 - p) / 0.2) * 0.9 : 0.9;
      d.el.setAttribute("transform", `translate(0 ${(46 * p).toFixed(1)})`);
      d.el.setAttribute("opacity", op.toFixed(2));
    }
    const xml = new XMLSerializer().serializeToString(clone);
    const img = await rasterize(xml, w, h);
    if (!transparent) {
      ctx.fillStyle = diagram.settings.background || "#ffffff";
      ctx.fillRect(0, 0, outW, outH);
    } else {
      ctx.clearRect(0, 0, outW, outH);
    }
    ctx.drawImage(img, 0, 0, outW, outH);
    const { data } = ctx.getImageData(0, 0, outW, outH);
    if (!palette) palette = quantize(data, 256);
    const index = applyPalette(data, palette);
    gif.writeFrame(index, outW, outH, { palette: palette ?? undefined, delay, repeat: 0 });
    onProgress?.((i + 1) / FRAMES);
    // 让出主线程，避免 UI 冻结
    await new Promise((r) => setTimeout(r, 0));
  }
  gif.finish();
  const bytes = gif.bytes();
  download(`${diagram.name || "fluidpath"}.gif`, new Blob([bytes.slice().buffer as ArrayBuffer], { type: "image/gif" }));
}

// ===== 导出对话框函数族（v1.18）：ExportDialog 专用 =====

function backgroundColorOf(diagram: Diagram, opts: ExportOptions): string {
  if (opts.darkMode) return "#141b24";
  if (opts.background === "white") return "#ffffff";
  return diagram.settings.background || "#ffffff";
}

/** 组装导出 SVG：预览与落盘共用同一管线（数据副本 + 附加节点 + DOM 后处理 + 主题色） */
export function buildExportSVGWithOptions(svgEl: SVGSVGElement, diagram: Diagram, opts: ExportOptions): { svg: string; w: number; h: number } {
  const { diagram: exDiagram, extra } = prepareExportDiagram(diagram, opts);
  const bbox = bboxWith(extra, exDiagram);
  const pad = Math.max(0, opts.padding || 0);
  const x = bbox.x - pad;
  const y = bbox.y - pad;
  const w = bbox.w + pad * 2;
  const h = bbox.h + pad * 2;
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll("[data-ui='1']").forEach((el) => el.remove());
  const world = clone.querySelector("[data-world='1']");
  if (world) world.removeAttribute("transform");
  clone.setAttribute("viewBox", `${x} ${y} ${w} ${h}`);
  clone.setAttribute("width", String(Math.round(w)));
  clone.setAttribute("height", String(Math.round(h)));
  clone.removeAttribute("style");
  clone.removeAttribute("class");
  appendExportNodes(clone, extra);
  if (opts.background !== "transparent") {
    const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bg.setAttribute("x", String(x));
    bg.setAttribute("y", String(y));
    bg.setAttribute("width", String(Math.round(w)));
    bg.setAttribute("height", String(Math.round(h)));
    bg.setAttribute("fill", backgroundColorOf(diagram, opts));
    clone.insertBefore(bg, clone.firstChild);
  }
  applySvgOverrides(clone, opts);
  resolveSvgTheme(clone, opts.darkMode ? "dark" : "light");
  const xml = new XMLSerializer().serializeToString(clone);
  return { svg: `<?xml version="1.0" encoding="UTF-8"?>\n` + xml, w: Math.round(w), h: Math.round(h) };
}

/** PNG/JPG 选项化导出 */
export function exportImageWithOptions(svgEl: SVGSVGElement, diagram: Diagram, opts: ExportOptions) {
  const transparent = opts.background === "transparent" && opts.format !== "jpg";
  const { svg, w, h } = buildExportSVGWithOptions(svgEl, diagram, { ...opts, background: transparent ? "transparent" : opts.background });
  rasterizeAndDownload(
    svg, w, h, diagram, opts.scale, transparent,
    opts.format === "jpg" ? "image/jpeg" : "image/png", opts.format, 0.92,
    backgroundColorOf(diagram, { ...opts, background: transparent ? "transparent" : opts.background }),
    opts.filename || diagram.name
  );
}

/** SVG 选项化导出 */
export function exportSvgWithOptions(svgEl: SVGSVGElement, diagram: Diagram, opts: ExportOptions) {
  const { svg } = buildExportSVGWithOptions(svgEl, diagram, opts);
  download(`${opts.filename || diagram.name || "fluidpath"}.svg`, new Blob([svg], { type: "image/svg+xml" }));
}

/** PDF 选项化导出（打印窗口，走同一管线） */
export function exportPdfWithOptions(svgEl: SVGSVGElement, diagram: Diagram, opts: ExportOptions) {
  const { svg, w, h } = buildExportSVGWithOptions(svgEl, diagram, opts);
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${opts.filename || diagram.name || "FluidPath"}</title>
<style>
  @page { margin: 10mm; size: ${w > h ? "landscape" : "portrait"}; }
  body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
  svg { max-width: 100%; max-height: 100vh; }
</style></head><body>${svg}</body></html>`;
  const win = window.open("", "_blank");
  if (!win) { alert("请允许弹出窗口以导出 PDF"); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
  setTimeout(() => win.close(), 1000);
}

/** GIF 选项化导出（逐帧管线 + 附加节点 + DOM 后处理 + 主题色） */
export async function exportGifWithOptions(
  svgEl: SVGSVGElement,
  diagram: Diagram,
  opts: ExportOptions,
  onProgress?: (ratio: number) => void
): Promise<void> {
  const { diagram: exDiagram, extra } = prepareExportDiagram(diagram, opts);
  const bbox = bboxWith(extra, exDiagram);
  const pad = Math.max(0, opts.padding || 0);
  const w = Math.round(bbox.w + pad * 2);
  const h = Math.round(bbox.h + pad * 2);
  const outScale = Math.min(2, Math.max(0.4, opts.scale));
  const outW = Math.round(w * outScale);
  const outH = Math.round(h * outScale);
  const transparent = opts.background === "transparent";

  const { clone } = (() => {
    const c = svgEl.cloneNode(true) as SVGSVGElement;
    c.querySelectorAll("[data-ui='1']").forEach((el) => el.remove());
    const world = c.querySelector("[data-world='1']");
    if (world) world.removeAttribute("transform");
    c.setAttribute("viewBox", `${bbox.x - pad} ${bbox.y - pad} ${w} ${h}`);
    c.setAttribute("width", String(w));
    c.setAttribute("height", String(h));
    c.removeAttribute("style");
    c.removeAttribute("class");
    appendExportNodes(c, extra);
    if (!transparent) {
      const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      bg.setAttribute("x", String(bbox.x - pad));
      bg.setAttribute("y", String(bbox.y - pad));
      bg.setAttribute("width", String(w));
      bg.setAttribute("height", String(h));
      bg.setAttribute("fill", backgroundColorOf(diagram, opts));
      c.insertBefore(bg, c.firstChild);
    }
    applySvgOverrides(c, opts);
    resolveSvgTheme(c, opts.darkMode ? "dark" : "light");
    return { clone: c };
  })();

  const DURATION = 2; // 秒
  const delay = Math.max(20, Math.round(opts.gifFrameDelay || 66));
  const FRAMES = Math.max(8, Math.round((DURATION * 1000) / delay));

  const flows: Array<{ el: Element; cyclePx: number; dir: number }> = [];
  for (const pipe of exDiagram.pipes) {
    const el = clone.querySelector(`[data-flow="${pipe.id}"]`);
    if (!el) continue;
    if (!pipe.animated) continue;
    const dashLen = Math.max(6, pipe.visualDiameter * 1.5);
    const gapMul = pipe.particleDensity === "high" ? 1.1 : pipe.particleDensity === "medium" ? 2.1 : 3.6;
    const period = dashLen + Math.round(dashLen * gapMul);
    const speedPx = 26 + pipe.flowSpeed * 58;
    const cycles = Math.max(1, Math.round((speedPx * DURATION) / period));
    flows.push({ el, cyclePx: cycles * period, dir: pipe.direction === "forward" ? 1 : -1 });
  }

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

  const drips = Array.from(clone.querySelectorAll('[data-drip="1"]')).map((el) => ({
    el,
    phase: Number(el.getAttribute("data-drip-phase") || 0)
  }));
  const dripCycles = Math.max(1, Math.round(DURATION / 1.05));

  const gif = GIFEncoder();
  let palette: number[][] | null = null;

  for (let i = 0; i < FRAMES; i++) {
    const t = i / FRAMES;
    for (const f of flows) {
      f.el.setAttribute("stroke-dashoffset", (-f.dir * f.cyclePx * t).toFixed(2));
    }
    for (const dp of drips) {
      const p = (t * dripCycles + dp.phase) % 1;
      const op = p < 0.12 ? (p / 0.12) * 0.9 : p > 0.8 ? ((1 - p) / 0.2) * 0.9 : 0.9;
      dp.el.setAttribute("transform", `translate(0 ${(46 * p).toFixed(1)})`);
      dp.el.setAttribute("opacity", op.toFixed(2));
    }
    const xml = new XMLSerializer().serializeToString(clone);
    const img = await rasterize(xml, w, h);
    if (!transparent) {
      ctx.fillStyle = backgroundColorOf(diagram, opts);
      ctx.fillRect(0, 0, outW, outH);
    } else {
      ctx.clearRect(0, 0, outW, outH);
    }
    ctx.drawImage(img, 0, 0, outW, outH);
    const { data } = ctx.getImageData(0, 0, outW, outH);
    if (!palette) palette = quantize(data, 256);
    const index = applyPalette(data, palette);
    gif.writeFrame(index, outW, outH, { palette: palette ?? undefined, delay, repeat: 0 });
    onProgress?.((i + 1) / FRAMES);
    await new Promise((r) => setTimeout(r, 0));
  }
  gif.finish();
  const bytes = gif.bytes();
  download(`${opts.filename || diagram.name || "fluidpath"}.gif`, new Blob([bytes.slice().buffer as ArrayBuffer], { type: "image/gif" }));
}

export function exportJSON(diagram: Diagram) {
  const out = { ...diagram, _version: 2, _exportedAt: new Date().toISOString() };
  const json = JSON.stringify(out, null, 2);
  download(`${diagram.name || "fluidpath"}.json`, new Blob([json], { type: "application/json" }));
}

/** 工程图纸导出：剔除所有讲解覆盖，避免人工动画状态进入工程交付。 */
export function exportEngineeringJSON(diagram: Diagram) {
  const out = structuredClone(diagram);
  for (const pipe of out.pipes) {
    delete pipe.teachingOverride;
    delete pipe.forceFlow;
    delete pipe.forceStop;
  }
  const json = JSON.stringify({ ...out, _version: 3, _exportedAt: new Date().toISOString(), _exportProfile: "engineering" }, null, 2);
  download(`${diagram.name || "fluidpath"}_工程版.json`, new Blob([json], { type: "application/json" }));
}

/** 检测是否为旧版 JSON 格式（position/size/style 嵌套对象） */
function isOldFormatNode(n: any): boolean {
  return n && typeof n === "object" && ("position" in n || "size" in n || "style" in n);
}

/** 迁移旧版节点：{ position:{x,y}, size:{w,h}, style:{fill,stroke} } → 扁平字段 */
function migrateNode(n: any): void {
  if (n.position && typeof n.position === "object") {
    if (n.x === undefined) n.x = n.position.x ?? 0;
    if (n.y === undefined) n.y = n.position.y ?? 0;
    delete n.position;
  }
  if (n.size && typeof n.size === "object") {
    if (n.width === undefined) n.width = n.size.width ?? 100;
    if (n.height === undefined) n.height = n.size.height ?? 100;
    delete n.size;
  }
  if (n.style && typeof n.style === "object") {
    if (n.fill === undefined) n.fill = n.style.fill ?? "#ffffff";
    if (n.stroke === undefined) n.stroke = n.style.stroke ?? "#3d4c5e";
    delete n.style;
  }
}

/** 迁移旧版管路：{ connection:{from,to}, style:{...}, flow:{...} } → 扁平字段 */
function migratePipe(p: any): void {
  if (p.connection && typeof p.connection === "object") {
    if (p.fromPortId === undefined) p.fromPortId = p.connection.from ?? undefined;
    if (p.toPortId === undefined) p.toPortId = p.connection.to ?? undefined;
    delete p.connection;
  }
  if (p.style && typeof p.style === "object") {
    const s = p.style;
    if (p.nominalDiameter === undefined) p.nominalDiameter = s.nominalDiameter ?? "DN25";
    if (p.visualDiameter === undefined) p.visualDiameter = s.visualDiameter ?? 10;
    if (p.wallColor === undefined) p.wallColor = s.wallColor ?? "#5b6b7d";
    if (p.fluidColor === undefined) p.fluidColor = s.fluidColor ?? "#2f7fd6";
    if (p.fluidOpacity === undefined) p.fluidOpacity = s.fluidOpacity ?? 0.92;
    delete p.style;
  }
  if (p.flow && typeof p.flow === "object") {
    const f = p.flow;
    if (p.direction === undefined) p.direction = f.direction ?? "forward";
    if (p.flowSpeed === undefined) p.flowSpeed = f.speed ?? 1.2;
    if (p.particleDensity === undefined) p.particleDensity = f.particleDensity ?? "medium";
    if (p.animated === undefined) p.animated = f.animated ?? true;
    if (p.showArrow === undefined) p.showArrow = f.showArrow ?? true;
    delete p.flow;
  }
  // 旧版 path 字段 → points
  if (p.path && Array.isArray(p.path) && (!p.points || !p.points.length)) {
    p.points = p.path;
  }
  // 1.7 起把旧的强制流/停字段迁移为明确的教学显示覆盖。
  if (!p.teachingOverride) {
    if (p.forceFlow) p.teachingOverride = "flow";
    else if (p.forceStop) p.teachingOverride = "stop";
  }
  delete p.forceFlow;
  delete p.forceStop;
}

export function parseDiagramJSON(text: string): Diagram {
  const data = JSON.parse(text);
  // 轻量 schema 校验：给出可理解的错误信息，而不是让字段缺失静默传播
  const errors = validateDiagramShape(data);
  if (errors.length > 0) {
    throw new Error(`不是有效的 FluidPath 工程文件：${errors.slice(0, 3).join("；")}${errors.length > 3 ? `（等 ${errors.length} 处）` : ""}`);
  }
  // 检测并迁移旧格式
  const hasOldNodes = data.nodes.some(isOldFormatNode);
  if (hasOldNodes) {
    data.nodes.forEach(migrateNode);
  }
  // 管路字段迁移与节点格式无关，所有历史图纸都需要执行。
  data.pipes.forEach(migratePipe);
  data.settings = {
    showGrid: true,
    background: "#eef2f7",
    globalAnimationPlaying: true,
    crossoverHops: true,
    ...(data.settings ?? {})
  };
  // 确保图层信息兼容旧文件
  if (!data.settings.layers || !data.settings.layers.length) {
    data.settings.layers = [{ id: "layer_default", name: "默认层", visible: true }];
  }
  return data as Diagram;
}

// ===== 轻量 Schema 校验与显式迁移注册表（P1 v1.17） =====

/**
 * 轻量 diagram schema 校验：返回可读的错误列表（空数组 = 通过）。
 * 只校验「缺了就无法工作」的核心字段，不做严格类型检查。
 */
export function validateDiagramShape(raw: unknown): string[] {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return ["顶层必须是工程对象"];
  }
  const d = raw as Record<string, unknown>;
  if (!Array.isArray(d.nodes)) errors.push("缺少 nodes 数组");
  if (!Array.isArray(d.pipes)) errors.push("缺少 pipes 数组");
  if (Array.isArray(d.nodes)) {
    d.nodes.forEach((n: unknown, i: number) => {
      if (!n || typeof n !== "object" || Array.isArray(n)) {
        errors.push(`nodes[${i}] 必须是对象`);
        return;
      }
      const node = n as Record<string, unknown>;
      if (typeof node.id !== "string" || !node.id) errors.push(`nodes[${i}].id 缺失`);
      if (typeof node.type !== "string" || !node.type) errors.push(`nodes[${i}].type 缺失`);
      if (typeof node.x !== "number" || typeof node.y !== "number") errors.push(`nodes[${i}].x/y 坐标缺失`);
    });
  }
  if (Array.isArray(d.pipes)) {
    d.pipes.forEach((p: unknown, i: number) => {
      if (!p || typeof p !== "object" || Array.isArray(p)) {
        errors.push(`pipes[${i}] 必须是对象`);
        return;
      }
      const pipe = p as Record<string, unknown>;
      if (typeof pipe.id !== "string" || !pipe.id) errors.push(`pipes[${i}].id 缺失`);
    });
  }
  return errors;
}

export interface DiagramMigration {
  from: number;
  to: number;
  /** 迁移内容说明（可展示给用户） */
  note: string;
  migrate: (d: Record<string, unknown>) => void;
}

/**
 * 显式版本迁移注册表：_version 1→2→3。
 * 未知更高版本由调用方提示升级 App。
 */
export const DIAGRAM_MIGRATIONS: DiagramMigration[] = [
  {
    from: 1,
    to: 2,
    note: "旧版节点格式（kind 字段、缺省端口方向）→ 统一 type/ports 结构",
    migrate: (d) => {
      if (Array.isArray(d.nodes)) d.nodes.forEach((n: unknown) => migrateNode(n as never));
    },
  },
  {
    from: 2,
    to: 3,
    note: "强制流/停字段（forceFlow/forceStop）→ 教学显示覆盖 teachingOverride",
    migrate: (d) => {
      if (Array.isArray(d.pipes)) d.pipes.forEach((p: unknown) => migratePipe(p as never));
    },
  },
];

/**
 * 按注册表把旧版本 diagram 逐级迁移到当前版本。
 * @returns 迁移说明列表（未发生迁移则为空）
 */
export function migrateDiagramToCurrent(d: Record<string, unknown>): string[] {
  const applied: string[] = [];
  let v = typeof d._version === "number" ? d._version : 1;
  const CURRENT = 3;
  while (v < CURRENT) {
    const step = DIAGRAM_MIGRATIONS.find((m) => m.from === v);
    if (!step) break;
    step.migrate(d);
    applied.push(`v${step.from}→v${step.to}: ${step.note}`);
    v = step.to;
  }
  d._version = CURRENT;
  return applied;
}

/** 导出选中区域 SVG */
export function buildSelectedSVG(svgEl: SVGSVGElement, diagram: Diagram, selectedNodes: string[], selectedPipes: string[]) {
  const selNodes = diagram.nodes.filter((n) => selectedNodes.includes(n.id));
  if (!selNodes.length) return null;
  const selPipes = diagram.pipes.filter((p) => selectedPipes.includes(p.id));
  // 隐藏非选中元素
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll("[data-ui='1']").forEach((el) => el.remove());
  // 隐藏所有节点/管路，再显示选中的
  const world = clone.querySelector("[data-world='1']");
  if (!world) return null;
  // 收集选中内容包围盒
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of selNodes) {
    const bb = nodeBBox(n);
    minX = Math.min(minX, bb.x); minY = Math.min(minY, bb.y);
    maxX = Math.max(maxX, bb.x + bb.w); maxY = Math.max(maxY, bb.y + bb.h);
  }
  for (const p of selPipes) {
    const pts = pipePolyline(p, diagram.nodes);
    if (pts) {
      const bb = polylineBBox(pts);
      minX = Math.min(minX, bb.x); minY = Math.min(minY, bb.y);
      maxX = Math.max(maxX, bb.x + bb.w); maxY = Math.max(maxY, bb.y + bb.h);
    }
  }
  if (!isFinite(minX)) return null;
  const pad = 20;
  const vx = minX - pad, vy = minY - pad, vw = maxX - minX + pad * 2, vh = maxY - minY + pad * 2;
  clone.setAttribute("viewBox", `${vx} ${vy} ${vw} ${vh}`);
  clone.setAttribute("width", String(Math.round(vw)));
  clone.setAttribute("height", String(Math.round(vh)));
  clone.removeAttribute("style");
  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("x", String(vx)); bg.setAttribute("y", String(vy));
  bg.setAttribute("width", String(vw)); bg.setAttribute("height", String(vh));
  bg.setAttribute("fill", diagram.settings.background || "#ffffff");
  clone.insertBefore(bg, clone.firstChild);
  return { svg: `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`, w: Math.round(vw), h: Math.round(vh) };
}

export function exportSelectedPNG(svgEl: SVGSVGElement, diagram: Diagram, selectedNodes: string[], selectedPipes: string[]) {
  const result = buildSelectedSVG(svgEl, diagram, selectedNodes, selectedPipes);
  if (!result) { toast("请先选中要导出的内容", "error"); return; }
  const { svg, w, h } = result;
  const scale = 2;
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = w * scale; canvas.height = h * scale;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = diagram.settings.background || "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    canvas.toBlob((blob) => { if (blob) download(`${diagram.name || "fluidpath"}_选区.png`, blob); }, "image/png");
  };
  img.onerror = () => URL.revokeObjectURL(url);
  img.src = url;
}

/** PDF 导出：使用 SVG → 内联打印的方式（浏览器"另存为 PDF"） */
export function exportPDF(svgEl: SVGSVGElement, diagram: Diagram, diagramName?: string, transparent = false) {
  const { svg, w, h } = buildExportSVG(svgEl, diagram, transparent);
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${diagramName || diagram.name || "FluidPath"}</title>
<style>
  @page { margin: 10mm; size: ${w > h ? "landscape" : "portrait"}; }
  body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
  svg { max-width: 100%; max-height: 100vh; }
</style></head><body>${svg}</body></html>`;
  const win = window.open("", "_blank");
  if (!win) { alert("请允许弹出窗口以导出 PDF"); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
  // 打印后关闭标签页
  setTimeout(() => win.close(), 1000);
}
