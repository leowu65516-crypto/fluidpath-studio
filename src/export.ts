import { GIFEncoder, applyPalette, quantize } from "gifenc";
import type { Diagram, DiagramNode } from "./types";
import { createNode } from "./symbols";
import { buildLegendNodes } from "./legend";
import { nodeBBox, pipePolyline, polylineBBox } from "./geometry";
import { toast } from "./toast";

/** PDF 预览窗口被拦截时的双语提示（export.ts 为纯模块，不走 React i18n 上下文） */
function pdfBlockedMessage(): string {
  try {
    if (localStorage.getItem("fluidpath.lang") === "zh") return "请允许弹出窗口以导出 PDF";
  } catch { /* ignore */ }
  return "Allow pop-ups to export the PDF";
}
import { parseDiagnosticProfile } from "./fault-codes/profile";
import { flowExportEntry } from "./flow";
import { exportCanvasBackground } from "./canvasTheme";

/** Current diagram JSON schema. Keep this single source of truth for exports, migration and reports. */
export const CURRENT_DIAGRAM_SCHEMA_VERSION = 3;

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
  const json = JSON.stringify({ ...diagram, _version: CURRENT_DIAGRAM_SCHEMA_VERSION, _exportedAt: new Date().toISOString() }, null, 2);
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

/** 导出文字增强的分类键：pipes=管路 / valves=阀门 / components=元器件 / switches=开关状态 / legend=图例 / custom=自定义文字 */
export type ExportTextCategory = "pipes" | "valves" | "components" | "switches" | "legend" | "custom";

/** 导出文字增强选项（全部只作用于导出物） */
export interface ExportTextEnhance {
  /** 分类倍率（缺省视为 1；与全局 textScale 相乘） */
  scales: Partial<Record<ExportTextCategory, number>>;
  /** 描边加强：白色描边光晕，让放大文字在元件/管线上仍可读（尽量不遮元件） */
  halo: boolean;
  /** 白色底板：文字后加半透明白底（更醒目，但会遮盖背景，默认关） */
  plates: boolean;
  /** 单个元素偏移（导出坐标系）：key = pipe:xx:label / pipe:xx:anno / pipe:xx:fluid / node:xx / node:xx:badge / export:xx */
  offsets: Record<string, { x: number; y: number }>;
  /** 逐条文字内容修改（导出物专用）：key 同上；徽标分段用 node:xx:badge:0/1/2 */
  overrides: Record<string, string>;
  /** 逐条文字大小（导出坐标系绝对字号）：key 同上；设置后覆盖分类倍率 */
  sizes: Record<string, number>;
}

/** 导出选项：全部只作用于导出物，画布零污染（延续「验收在副本运行」的哲学） */
export interface ExportOptions {
  /** Static diagnostic overlays are opt-in and never modify fluid colors. */
  includeDiagnostics?: boolean;
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
  /** 文字增强（分类放大/描边/底板/拖拽偏移，与 textScale 相乘） */
  text?: ExportTextEnhance;
  /** 额外自定义文字（预览内添加；x/y 为文字中心，导出坐标系） */
  extraTexts?: Array<{ id: string; text: string; x: number; y: number; size: number }>;
  /** 状态徽标样式：default=画布同款 / pill=强化描边放大 / hidden=隐藏 */
  badgeStyle: "default" | "pill" | "hidden";
  /** 图例段开关 */
  legend: { fluid: boolean; diameter: boolean; status: boolean };
  /** 自定义文字层（可选） */
  title?: string;
  subtitle?: string;
  footnote?: string;
  watermark?: string;
  /** 快速内容字号（px）。 */
  textLayerSizes?: Partial<Record<"title" | "subtitle" | "footnote" | "watermark", number>>;
  dateStamp: boolean;
  /** 自定义文字是否同时写入画布（默认否） */
  saveTextToDiagram: boolean;
  /** 暗色导出（元素色映射暗色板，背景自动深色） */
  darkMode: boolean;
  /** 符号风格：follow=跟随图纸 / teaching / engineering（导出时临时切换，不写回图纸） */
  symbolProfile: "follow" | "teaching" | "engineering";
  /** GIF：帧间隔 ms（默认约 66 = 15fps） */
  gifFrameDelay: number;
  /** GIF 演示步骤间的交叉切换时长 ms；0 表示直接切换。 */
  gifStepTransitionMs: number;
  lang: "zh" | "en";
}

export const EXPORT_DEFAULTS: Omit<ExportOptions, "format" | "lang"> = {
  includeDiagnostics: false,
  background: "white",
  scale: 2,
  padding: 24,
  filename: "",
  selectionOnly: false,
  textScale: 1,
  text: { scales: {}, halo: true, plates: false, offsets: {}, overrides: {}, sizes: {} },
  badgeStyle: "default",
  legend: { fluid: false, diameter: false, status: false },
  dateStamp: false,
  saveTextToDiagram: false,
  darkMode: false,
  symbolProfile: "follow",
  gifFrameDelay: 66,
  gifStepTransitionMs: 320,
  textLayerSizes: {},
};

/** 导出主题色板（与 styles.css 的 :root / body[data-theme="dark"] 保持一致） */
const THEME_VARS: Record<"light" | "dark", Record<string, string>> = {
  light: {
    "--bg-work": "#e8edf3", "--panel": "#ffffff", "--border": "#d7dee7", "--text": "#2b3644",
    "--text-dim": "#6b7787", "--accent": "#2f7fd6", "--accent-soft": "#e7f0fb", "--danger": "#d64545",
    "--surface": "#fbfcfe", "--surface-2": "#f0f4f9", "--tip-bg": "#f4f7fb", "--input-bg": "#ffffff",
    "--brand": "#1f2c3d", "--static": "#7a8794", "--section-title": "#34435a", "--node-label": "#41505f",
    "--canvas-label-halo": "#ffffff", "--card": "#ffffff",
  },
  dark: {
    "--bg-work": "#141b24", "--panel": "#1d2632", "--border": "#334052", "--text": "#dde5ee",
    "--text-dim": "#8b99a9", "--accent": "#4d9ef0", "--accent-soft": "#223550", "--danger": "#e27070",
    "--surface": "#242f3d", "--surface-2": "#2a3646", "--tip-bg": "#242f3d", "--input-bg": "#242f3d",
    "--brand": "#e6edf5", "--static": "#93a1b1", "--section-title": "#c6d2e0", "--node-label": "#aebccb",
    "--canvas-label-halo": "#1d2632", "--card": "#24303d",
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

/** 导出克隆前：保留节点/管路标签、介质/标注文字与状态徽标——它们带 data-ui，先解除标记再剥离 UI 辅助元素 */
function preserveExportText(clone: SVGSVGElement) {
  clone
    .querySelectorAll(".fp-node-label-wrap, .fp-node-label-wrap *, .fp-node-label, .fp-pipe-annotation, .fp-fluid-label, .fp-state-badge, text[data-pipe-id]")
    .forEach((el) => el.removeAttribute("data-ui"));
}

/** 文字/徽标 SVG DOM 后处理（v1.30：分类放大 + 描边/底板 + 拖拽偏移 + 逐条改字） */
function applySvgOverrides(clone: SVGSVGElement, opts: ExportOptions) {
  const text = opts.text ?? { scales: {}, halo: true, plates: false, offsets: {}, overrides: {}, sizes: {} };
  const global = opts.textScale ?? 1;
  const catScale = (cat: ExportTextCategory | null) => (cat ? (text.scales?.[cat] ?? 1) : 1) * global;
  const overrides = text.overrides ?? {};
  const sizes = text.sizes ?? {};

  const NS = "http://www.w3.org/2000/svg";
  const round1 = (n: number) => Math.round(n * 10) / 10;
  const nodeRotationOf = (el: Element): number => {
    const g = el.closest("[data-node-id]");
    const m = (g?.getAttribute("transform") || "").match(/rotate\(\s*([-\d.eE]+)/);
    return m ? parseFloat(m[1]) : 0;
  };
  const classify = (el: Element): { cat: ExportTextCategory | null; key: string | null } => {
    if (el.closest(".fp-state-badge")) {
      const host = el.closest("[data-node-id]");
      const badge = el.closest(".fp-state-badge");
      if (!host || !badge) return { cat: "switches", key: null };
      const segs = [...badge.querySelectorAll("text")];
      const idx = segs.indexOf(el as SVGTextElement);
      return { cat: "switches", key: `node:${host.getAttribute("data-node-id")}:badge:${idx}` };
    }
    const expKind = el.getAttribute("data-export-kind");
    if (expKind === "legend" || expKind === "custom") {
      const nid = el.getAttribute("data-export-node-id");
      return { cat: expKind, key: nid ? `export:${nid}` : null };
    }
    const pipeId = el.getAttribute("data-pipe-id");
    if (pipeId) {
      const suffix = el.classList.contains("fp-fluid-label") ? "fluid" : el.classList.contains("fp-pipe-annotation") ? "anno" : "label";
      return { cat: "pipes", key: `pipe:${pipeId}:${suffix}` };
    }
    const nodeId = el.getAttribute("data-node-id");
    if (nodeId) {
      const kind = el.getAttribute("data-node-kind");
      return { cat: kind === "solenoid2" || kind === "solenoid3" || kind === "pulseAirValve" ? "valves" : "components", key: `node:${nodeId}` };
    }
    return { cat: null, key: null };
  };

  clone
    .querySelectorAll(".fp-node-label, .fp-pipe-annotation, .fp-fluid-label, text[data-pipe-id], text[data-export-kind], .fp-state-badge text")
    .forEach((el) => {
      const { cat, key } = classify(el);
      // 逐条改字（先于缩放/底板，使底板按新文字长度计算）
      if (key && overrides[key] !== undefined) el.textContent = overrides[key];
      const scale = catScale(cat);
      const sizeOv = key ? sizes[key] : undefined;
      const enhanced = scale !== 1 || (typeof sizeOv === "number" && sizeOv > 0);
      if (typeof sizeOv === "number" && sizeOv > 0) {
        el.setAttribute("font-size", String(round1(sizeOv)));
      } else if (scale !== 1) {
        const fs = Number(el.getAttribute("font-size") || 0);
        if (fs > 0) el.setAttribute("font-size", String(round1(fs * scale)));
      }
      if (enhanced) {
        if (text.halo) {
          el.setAttribute("stroke", "#ffffff");
          el.setAttribute("stroke-width", "3");
          el.setAttribute("style", "paint-order: stroke");
        }
        if (text.plates) {
          // 文字后插半透明白底（近似包围盒；不依赖 getBBox，jsdom/导出环境安全）
          const x = Number(el.getAttribute("x") || 0);
          const y = Number(el.getAttribute("y") || 0);
          const fs2 = Number(el.getAttribute("font-size") || 12);
          const len = (el.textContent || "").length;
          const w = len * fs2 * 0.62 + 10;
          const h = fs2 * 1.45 + 6;
          const rect = el.ownerDocument.createElementNS(NS, "rect");
          rect.setAttribute("x", String(Math.round(x - w / 2)));
          rect.setAttribute("y", String(Math.round(y - fs2 * 0.95 - h / 2 + fs2 / 2)));
          rect.setAttribute("width", String(Math.round(w)));
          rect.setAttribute("height", String(Math.round(h)));
          rect.setAttribute("rx", "4");
          rect.setAttribute("fill", "#ffffff");
          rect.setAttribute("fill-opacity", "0.72");
          if (el.parentNode) el.parentNode.insertBefore(rect, el);
        }
      }
      // 拖拽偏移（徽标分段不单独偏移，由整组 node:xx:badge 处理）
      const isBadgeSeg = el.closest(".fp-state-badge") !== null;
      if (key && !isBadgeSeg && text.offsets?.[key]) {
        const off = text.offsets[key];
        if (off.x || off.y) {
          const baseX = Number(el.getAttribute("x") || 0);
          const baseY = Number(el.getAttribute("y") || 0);
          el.setAttribute("x", String(round1(baseX + off.x)));
          el.setAttribute("y", String(round1(baseY + off.y)));
        }
      }
    });

  // 状态徽标整组拖拽偏移（局部坐标系：按节点 rotation 逆变换）
  clone.querySelectorAll(".fp-state-badge").forEach((badge) => {
    if (badge.tagName.toLowerCase() !== "g") return;
    const host = badge.closest("[data-node-id]");
    if (!host) return;
    const key = `node:${host.getAttribute("data-node-id")}:badge`;
    const off = text.offsets?.[key];
    if (!off || (!off.x && !off.y)) return;
    const rot = (nodeRotationOf(badge) * Math.PI) / 180;
    const lx = off.x * Math.cos(rot) + off.y * Math.sin(rot);
    const ly = -off.x * Math.sin(rot) + off.y * Math.cos(rot);
    badge.setAttribute("transform", `translate(${round1(lx)} ${round1(ly)})`);
  });

  // 状态徽标样式（保留 v1.18 行为：隐藏/强化描边）
  if (opts.badgeStyle === "hidden") {
    clone.querySelectorAll(".fp-state-badge").forEach((el) => el.remove());
  } else if (opts.badgeStyle === "pill") {
    clone.querySelectorAll(".fp-state-badge").forEach((el) => {
      if (el.tagName.toLowerCase() === "text") {
        const fs = Number(el.getAttribute("font-size") || 0);
        if (fs > 0) el.setAttribute("font-size", String(round1(fs * 1.35)));
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
  const mkLabel = (id: string, text: string, y: number, fontSize: number, fill: string): DiagramNode => {
    const n = createNode("label", 0, 0, text);
    n.id = id;
    n.fontSize = fontSize;
    n.fill = fill;
    n.exportKind = "custom";
    n.width = Math.max(240, text.length * fontSize * 1.05);
    n.height = fontSize + 14;
    n.x = cx - n.width / 2;
    n.y = y;
    return n;
  };
  if (opts.title?.trim()) {
    extra.push(mkLabel("ex_title", opts.title.trim(), top - 64, opts.textLayerSizes?.title ?? 26, opts.darkMode ? "#dde5ee" : "#1f2c3d"));
    top -= 68;
  }
  if (opts.subtitle?.trim()) {
    extra.push(mkLabel("ex_subtitle", opts.subtitle.trim(), top - 34, opts.textLayerSizes?.subtitle ?? 15, opts.darkMode ? "#8b99a9" : "#6b7787"));
  }
  const bottom = base.y + base.h + 18;
  if (opts.footnote?.trim()) extra.push(mkLabel("ex_footnote", opts.footnote.trim(), bottom, opts.textLayerSizes?.footnote ?? 13, opts.darkMode ? "#8b99a9" : "#6b7787"));
  if (opts.dateStamp) {
    const stamp = new Date().toLocaleString(opts.lang === "zh" ? "zh-CN" : "en-US");
    const n = mkLabel("ex_date", stamp, bottom, 12, opts.darkMode ? "#8b99a9" : "#9aa7b5");
    n.x = base.x + base.w - n.width;
    extra.push(n);
  }
  if (opts.watermark?.trim()) {
    const n = mkLabel("ex_watermark", opts.watermark.trim(), bottom, opts.textLayerSizes?.watermark ?? 13, opts.darkMode ? "#6b7787" : "#9aa7b5");
    n.x = base.x;
    extra.push(n);
  }
  // 预览内新增的自由文字（稳定 id：拖拽偏移/改字键位 export:ex_<id> 不随重建漂移）
  (opts.extraTexts ?? []).forEach((t) => {
    const label = (t.text ?? "").trim();
    if (!label) return;
    const size = Math.max(6, Math.round(t.size || 18));
    const n = mkLabel(`ex_${t.id}`, label, 0, size, opts.darkMode ? "#dde5ee" : "#2b3644");
    n.x = t.x - n.width / 2;
    n.y = t.y - n.height / 2 - size / 3;
    extra.push(n);
  });
  if (opts.legend.fluid || opts.legend.diameter || opts.legend.status) {
    const nodes = buildLegendNodes(d, base.x + base.w + 28, base.y, opts.legend, opts.lang);
    nodes.forEach((n, i) => {
      n.exportKind = "legend";
      n.id = `ex_legend_${i}`;
    });
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
      t.setAttribute("class", "fp-export-text");
      t.setAttribute("data-export-kind", n.exportKind ?? "custom");
      t.setAttribute("data-export-node-id", n.id);
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
      t.setAttribute("class", "fp-export-text");
      t.setAttribute("data-export-kind", n.exportKind ?? "custom");
      t.setAttribute("data-export-node-id", n.id);
      t.textContent = n.label;
      g.appendChild(t);
    }
    world.appendChild(g);
  }
}


function buildExportClone(svgEl: SVGSVGElement, diagram: Diagram, transparent = false, darkMode = false): { clone: SVGSVGElement; w: number; h: number } {
  const bbox = contentBBox(diagram);
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  preserveExportText(clone);
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
    bg.setAttribute("fill", exportCanvasBackground(diagram.settings, darkMode));
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
      ctx.fillStyle = bgColor || exportCanvasBackground(diagram.settings, false);
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
 * 把管路的每一层流动元素（拖尾本体 / 头部高光 / 介质颗粒）换算成「整数个周期」的循环位移，
 * 保证 GIF 首尾帧衔接。周期与画布共用 src/flow.ts，视觉改动不会再只改到画布、漏掉导出。
 */
function flowSceneEntries(pipe: Diagram["pipes"][number], el: Element, seconds: number): Array<{ el: Element; cyclePx: number; dir: number; lag: number }> {
  if (!pipe.animated) return [];
  const layerAttr = el.getAttribute("data-flow-layer");
  const layer = layerAttr === "body" || layerAttr === "head" ? layerAttr : "particle";
  return [{ el, ...flowExportEntry(pipe, layer, seconds) }];
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
  const flows: Array<{ el: Element; cyclePx: number; dir: number; lag: number }> = [];
  for (const pipe of diagram.pipes) {
    if (!pipe.animated) continue;
    for (const el of Array.from(clone.querySelectorAll(`[data-flow="${pipe.id}"]`))) {
      flows.push(...flowSceneEntries(pipe, el, DURATION));
    }
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
      f.el.setAttribute("stroke-dashoffset", (f.lag - f.dir * f.cyclePx * t).toFixed(2));
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
      ctx.fillStyle = exportCanvasBackground(diagram.settings, false);
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
  if (opts.background === "white") return "#ffffff";
  // 跟随主题的图纸：导出按导出对话框选择的主题取底色，保证「所见即所出」
  return exportCanvasBackground(diagram.settings, opts.darkMode);
}

/** 组装导出 SVG：预览与落盘共用同一管线（数据副本 + 附加节点 + DOM 后处理 + 主题色） */
export function prepareDiagnosticExport(clone: SVGSVGElement, opts: ExportOptions) {
  for (const overlay of clone.querySelectorAll("[data-fault-overlay]")) {
    if (!opts.includeDiagnostics) { overlay.remove(); continue; }
    overlay.removeAttribute("data-ui");
    overlay.querySelectorAll(".fault-overlay-breathe").forEach(el => el.removeAttribute("class"));
    if (opts.selectionOnly && opts.selection) {
      const selected = new Set([...opts.selection.nodes, ...opts.selection.pipes]);
      overlay.querySelectorAll("[data-fault-target]").forEach(el => { if (!selected.has(el.getAttribute("data-fault-target")!)) el.remove(); });
    }
  }
}

export function buildExportSVGWithOptions(svgEl: SVGSVGElement, diagram: Diagram, opts: ExportOptions): { svg: string; w: number; h: number; x: number; y: number } {
  const { diagram: exDiagram, extra } = prepareExportDiagram(diagram, opts);
  const bbox = bboxWith(extra, exDiagram);
  const pad = Math.max(0, opts.padding || 0);
  const x = bbox.x - pad;
  const y = bbox.y - pad;
  const w = bbox.w + pad * 2;
  const h = bbox.h + pad * 2;
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  prepareDiagnosticExport(clone, opts);
  preserveExportText(clone);
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
  return { svg: `<?xml version="1.0" encoding="UTF-8"?>\n` + xml, w: Math.round(w), h: Math.round(h), x: Math.round(x), y: Math.round(y) };
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
  if (!win) { toast(pdfBlockedMessage(), "error"); return; }
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
  onProgress?: (ratio: number) => void,
  onPrepared?: () => void,
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
    prepareDiagnosticExport(c, opts);
    preserveExportText(c);
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
  // 调用方可在此时恢复临时画布状态；后续 GIF 帧只读取独立的 SVG 副本。
  onPrepared?.();

  const DURATION = 2; // 秒
  const delay = Math.max(20, Math.round(opts.gifFrameDelay || 66));
  const FRAMES = Math.max(8, Math.round((DURATION * 1000) / delay));

  const flows: Array<{ el: Element; cyclePx: number; dir: number; lag: number }> = [];
  for (const pipe of exDiagram.pipes) {
    if (!pipe.animated) continue;
    for (const el of Array.from(clone.querySelectorAll(`[data-flow="${pipe.id}"]`))) {
      flows.push(...flowSceneEntries(pipe, el, DURATION));
    }
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
      f.el.setAttribute("stroke-dashoffset", (f.lag - f.dir * f.cyclePx * t).toFixed(2));
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

/** 一个演示 GIF 的静态步骤快照。svg 必须在对应工况已渲染后复制，避免导出时改动编辑器画布。 */
export interface GifSequenceFrame {
  svg: SVGSVGElement;
  diagram: Diagram;
  durationMs: number;
}

/**
 * 导出多步骤演示 GIF。
 * 每个步骤都使用自身的完整图纸快照；切换只发生在导出副本中，绝不写回工作区状态。
 */
export async function exportGifSequenceWithOptions(
  frames: GifSequenceFrame[],
  opts: ExportOptions,
  onProgress?: (ratio: number) => void,
): Promise<void> {
  if (frames.length === 0) throw new Error("No demo steps to export");
  // 序列必须使用一个统一视窗，否则各步骤的标签、注释增减会造成画面跳动。
  const sources = frames.map((frame) => {
    const prepared = prepareExportDiagram(frame.diagram, { ...opts, selectionOnly: false, selection: undefined });
    return { ...frame, ...prepared, bbox: bboxWith(prepared.extra, prepared.diagram) };
  });
  const left = Math.min(...sources.map((source) => source.bbox.x));
  const top = Math.min(...sources.map((source) => source.bbox.y));
  const right = Math.max(...sources.map((source) => source.bbox.x + source.bbox.w));
  const bottom = Math.max(...sources.map((source) => source.bbox.y + source.bbox.h));
  const pad = Math.max(0, opts.padding || 0);
  const view = { x: left - pad, y: top - pad, w: Math.round(right - left + pad * 2), h: Math.round(bottom - top + pad * 2) };
  const outScale = Math.min(2, Math.max(0.4, opts.scale));
  const outW = Math.round(view.w * outScale);
  const outH = Math.round(view.h * outScale);
  const transparent = opts.background === "transparent";
  const delay = Math.max(20, Math.round(opts.gifFrameDelay || 66));

  type PreparedScene = {
    clone: SVGSVGElement;
    diagram: Diagram;
    flows: Array<{ el: Element; cyclePx: number; dir: number; lag: number }>;
    drips: Array<{ el: Element; phase: number }>;
    cycles: number;
    durationMs: number;
  };
  const scenes: PreparedScene[] = sources.map((source) => {
    const clone = source.svg.cloneNode(true) as SVGSVGElement;
    prepareDiagnosticExport(clone, opts);
    preserveExportText(clone);
    clone.querySelectorAll("[data-ui='1']").forEach((el) => el.remove());
    clone.querySelector("[data-world='1']")?.removeAttribute("transform");
    clone.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`);
    clone.setAttribute("width", String(view.w));
    clone.setAttribute("height", String(view.h));
    clone.removeAttribute("style");
    clone.removeAttribute("class");
    appendExportNodes(clone, source.extra);
    if (!transparent) {
      const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      bg.setAttribute("x", String(view.x));
      bg.setAttribute("y", String(view.y));
      bg.setAttribute("width", String(view.w));
      bg.setAttribute("height", String(view.h));
      bg.setAttribute("fill", backgroundColorOf(source.diagram, opts));
      clone.insertBefore(bg, clone.firstChild);
    }
    applySvgOverrides(clone, opts);
    resolveSvgTheme(clone, opts.darkMode ? "dark" : "light");
    const seconds = Math.max(delay, source.durationMs) / 1000;
    const flows = source.diagram.pipes.flatMap((pipe) =>
      Array.from(clone.querySelectorAll(`[data-flow="${pipe.id}"]`)).flatMap((el) => flowSceneEntries(pipe, el, seconds))
    );
    return {
      clone, diagram: source.diagram, flows,
      drips: Array.from(clone.querySelectorAll('[data-drip="1"]')).map((el) => ({ el, phase: Number(el.getAttribute("data-drip-phase") || 0) })),
      cycles: Math.max(1, Math.round(seconds / 1.05)),
      durationMs: Math.max(delay, source.durationMs),
    };
  });

  const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
  ctx.canvas.width = outW;
  ctx.canvas.height = outH;
  const render = async (scene: PreparedScene, progress: number) => {
    for (const flow of scene.flows) flow.el.setAttribute("stroke-dashoffset", (flow.lag - flow.dir * flow.cyclePx * progress).toFixed(2));
    for (const drip of scene.drips) {
      const p = (progress * scene.cycles + drip.phase) % 1;
      const opacity = p < 0.12 ? (p / 0.12) * 0.9 : p > 0.8 ? ((1 - p) / 0.2) * 0.9 : 0.9;
      drip.el.setAttribute("transform", `translate(0 ${(46 * p).toFixed(1)})`);
      drip.el.setAttribute("opacity", opacity.toFixed(2));
    }
    return rasterize(new XMLSerializer().serializeToString(scene.clone), view.w, view.h);
  };
  const holds = scenes.map((scene) => Math.max(1, Math.round(scene.durationMs / delay)));
  const transitionFrames = Math.max(0, Math.round((opts.gifStepTransitionMs || 0) / delay));
  const totalFrames = holds.reduce((total, count) => total + count, 0) + Math.max(0, scenes.length - 1) * transitionFrames;
  let written = 0;
  const gif = GIFEncoder();
  let palette: number[][] | null = null;
  const write = (images: Array<{ image: CanvasImageSource; alpha: number }>) => {
    if (transparent) ctx.clearRect(0, 0, outW, outH);
    else {
      ctx.globalAlpha = 1;
      ctx.fillStyle = backgroundColorOf(scenes[0].diagram, opts);
      ctx.fillRect(0, 0, outW, outH);
    }
    for (const { image, alpha } of images) {
      ctx.globalAlpha = alpha;
      ctx.drawImage(image, 0, 0, outW, outH);
    }
    ctx.globalAlpha = 1;
    const { data } = ctx.getImageData(0, 0, outW, outH);
    if (!palette) palette = quantize(data, 256);
    gif.writeFrame(applyPalette(data, palette), outW, outH, { palette: palette ?? undefined, delay, repeat: 0 });
    written += 1;
    onProgress?.(written / totalFrames);
  };

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    for (let frame = 0; frame < holds[i]; frame++) {
      write([{ image: await render(scene, frame / holds[i]), alpha: 1 }]);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    if (i < scenes.length - 1 && transitionFrames > 0) {
      const from = await render(scene, 1);
      const to = await render(scenes[i + 1], 0);
      for (let frame = 1; frame <= transitionFrames; frame++) {
        const mix = frame / (transitionFrames + 1);
        write([{ image: from, alpha: 1 - mix }, { image: to, alpha: mix }]);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
  }
  gif.finish();
  const bytes = gif.bytes();
  download(`${opts.filename || frames[0].diagram.name || "fluidpath"}.gif`, new Blob([bytes.slice().buffer as ArrayBuffer], { type: "image/gif" }));
}

export function exportJSON(diagram: Diagram) {
  const out = { ...diagram, _version: CURRENT_DIAGRAM_SCHEMA_VERSION, _exportedAt: new Date().toISOString() };
  const json = JSON.stringify(out, null, 2);
  download(`${diagram.name || "fluidpath"}.json`, new Blob([json], { type: "application/json" }));
}

/** 工程图纸导出：剔除所有讲解覆盖，避免人工动画状态进入工程交付。 */
export function exportEngineeringJSON(diagram: Diagram) {
  const out = structuredClone(diagram);
  for (const node of out.nodes) { delete node.displayDisabled; delete node.smartSecondary; }
  for (const pipe of out.pipes) {
    delete pipe.displayDisabled;
    delete pipe.teachingOverride;
    delete pipe.forceFlow;
    delete pipe.forceStop;
  }
  const json = JSON.stringify({ ...out, _version: CURRENT_DIAGRAM_SCHEMA_VERSION, _exportedAt: new Date().toISOString(), _exportProfile: "engineering" }, null, 2);
  download(`${diagram.name || "fluidpath"}_工程版.json`, new Blob([json], { type: "application/json" }));
}

/** 检测是否为旧版 JSON 格式（position/size/style 嵌套对象） */
function isOldFormatNode(n: any): boolean {
  return n && typeof n === "object" && ("position" in n || "size" in n || "style" in n);
}

/** 迁移旧版节点：{ position:{x,y}, size:{w,h}, style:{fill,stroke} } → 扁平字段 */
function migrateNode(n: any): void {
  if (!n || typeof n !== "object" || Array.isArray(n)) return;
  if (n.type === undefined && typeof n.kind === "string") { n.type = n.kind; delete n.kind; }
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
  if (n.type === "diaphragmValve3" && Array.isArray(n.ports)) {
    const ports: any[] = n.ports.slice(0, 3);
    for (const port of ports) port.direction = "bidirectional";
    const fallback = ports.find((port) => port.position === "right") ?? ports[ports.length - 1];
    if (!ports.some((port) => port.id === n.valveCommonPortId)) n.valveCommonPortId = fallback?.id;
    if (n.valvePath !== "A" && n.valvePath !== "B") n.valvePath = "A";
  }
}

/** 迁移旧版管路：{ connection:{from,to}, style:{...}, flow:{...} } → 扁平字段 */
function migratePipe(p: any): void {
  if (!p || typeof p !== "object" || Array.isArray(p)) return;
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
  // Recognize the envelope before migration; old nested coordinates are valid migration input.
  if (data && typeof data === "object" && !Array.isArray(data) && Array.isArray(data.nodes) && Array.isArray(data.pipes)) {
    migrateDiagramToCurrent(data);
    // 端口语义也可能随图纸协议演进；该迁移是幂等的，因此每次导入都归一化一次。
    data.nodes.forEach(migrateNode);
  }
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
  if (data.settings.diagnosticProfile !== undefined) data.settings.diagnosticProfile = parseDiagnosticProfile(data.settings.diagnosticProfile);
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
      if (node.type === "diaphragmValve3") {
        const ports = Array.isArray(node.ports) ? node.ports as Array<Record<string, unknown>> : [];
        if (ports.length !== 3) errors.push(`nodes[${i}] 三通隔膜切换阀必须有 3 个端口`);
        if (ports.some((port) => port.direction !== "bidirectional")) errors.push(`nodes[${i}] 三通隔膜切换阀端口必须为双向`);
        if (ports.length === 3 && !ports.some((port) => port.id === node.valveCommonPortId)) errors.push(`nodes[${i}] 三通隔膜切换阀缺少有效公共端口`);
      }
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
  if (d._version !== undefined && (typeof d._version !== "number" || !Number.isInteger(d._version) || d._version < 1 || d._version > CURRENT_DIAGRAM_SCHEMA_VERSION)) {
    throw new Error("图纸版本不受支持，请升级应用 / Unsupported diagram version; update the app");
  }
  let v = typeof d._version === "number" ? d._version : 1;
  const CURRENT = CURRENT_DIAGRAM_SCHEMA_VERSION;
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
  bg.setAttribute("fill", exportCanvasBackground(diagram.settings, false));
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
    ctx.fillStyle = exportCanvasBackground(diagram.settings, false);
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
  if (!win) { toast(pdfBlockedMessage(), "error"); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
  // 打印后关闭标签页
  setTimeout(() => win.close(), 1000);
}
