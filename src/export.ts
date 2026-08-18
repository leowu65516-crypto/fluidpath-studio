import { GIFEncoder, applyPalette, quantize } from "gifenc";
import type { Diagram } from "./types";
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
  mimeType: string, ext: string, quality?: number
) {
  const url = URL.createObjectURL(new Blob([svgText], { type: "image/svg+xml" }));
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext("2d")!;
    if (!transparent) {
      ctx.fillStyle = diagram.settings.background || "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    canvas.toBlob((blob) => {
      if (blob) download(`${diagram.name || "fluidpath"}.${ext}`, blob);
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

export function exportJSON(diagram: Diagram) {
  const out = { ...diagram, _version: 2, _exportedAt: new Date().toISOString() };
  const json = JSON.stringify(out, null, 2);
  download(`${diagram.name || "fluidpath"}.json`, new Blob([json], { type: "application/json" }));
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
}

export function parseDiagramJSON(text: string): Diagram {
  const data = JSON.parse(text);
  if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.pipes)) {
    throw new Error("不是有效的 FluidPath 工程文件");
  }
  // 检测并迁移旧格式
  const hasOldNodes = data.nodes.some(isOldFormatNode);
  if (hasOldNodes) {
    data.nodes.forEach(migrateNode);
    data.pipes.forEach(migratePipe);
  }
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
