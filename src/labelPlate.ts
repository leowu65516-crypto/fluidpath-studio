/**
 * 元器件名称底板（标签底衬）与文字宽度测量（v1.57）。
 *
 * 背景：旧版用「字符数 × 字号 × 0.62」估算底板宽度，那是拉丁文字的经验系数，
 * 中文全角字符实际接近 1 个字号宽，于是 11 个汉字的阀名算成 103px 而实际约 143px，
 * 底板两侧会露出悬空文字。这里改为离屏 canvas 实测（带缓存），
 * 无 canvas 的环境（jsdom/SSR）退回「全角 1.0em / 半角 0.55em」估算。
 */

import type { DiagramNode, DiagramSettings } from "./types";

/** 与 CanvasView 中 `<text fontFamily>` 保持一致，才能量到真实宽度。 */
export const LABEL_FONT_FAMILY = "system-ui, -apple-system, sans-serif";
const LABEL_FONT_WEIGHT = 500;

export const DEFAULT_PLATE_OPACITY = 0.82;
/** 底板在文字宽度之外左右各留的内边距（世界坐标 px）。 */
export const PLATE_PADDING_X = 7;
/** 底板高度相对字号的比例与上下余量。 */
const PLATE_TOP_RATIO = 0.95;
const PLATE_BOTTOM_RATIO = 0.4;

type Ctx = CanvasRenderingContext2D;
let measureCtx: Ctx | null | undefined;
const widthCache = new Map<string, number>();
const CACHE_LIMIT = 4000;

function getCtx(): Ctx | null {
  if (measureCtx !== undefined) return measureCtx;
  try {
    if (typeof document === "undefined") { measureCtx = null; return null; }
    const canvas = document.createElement("canvas");
    measureCtx = canvas.getContext("2d");
  } catch {
    measureCtx = null;
  }
  return measureCtx;
}

/** 无 canvas 时的保守估算：全角 1.0em、半角 0.55em，再按常见中文字重的 0.98 微调。 */
export function estimateTextWidth(text: string, fontSize: number): number {
  let w = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    // 全角/中日韩文字、全角标点、常见符号按 1em；其余按半角
    const fullWidth =
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6);
    w += fontSize * (fullWidth ? 1 : 0.55);
  }
  return w;
}

/** 实测文字宽度（带缓存）。多行取最长行。 */
export function measureLabelWidth(text: string, fontSize: number): number {
  if (!text) return 0;
  const key = `${fontSize}|${LABEL_FONT_WEIGHT}|${text}`;
  const hit = widthCache.get(key);
  if (hit !== undefined) return hit;
  const ctx = getCtx();
  let w: number;
  if (ctx) {
    ctx.font = `${LABEL_FONT_WEIGHT} ${fontSize}px ${LABEL_FONT_FAMILY}`;
    const lines = text.split("\n");
    w = 0;
    for (const line of lines) w = Math.max(w, ctx.measureText(line).width);
  } else {
    w = Math.max(...text.split("\n").map((line) => estimateTextWidth(line, fontSize)));
  }
  if (widthCache.size > CACHE_LIMIT) widthCache.clear();
  widthCache.set(key, w);
  return w;
}

export interface LabelPlate {
  color: string;
  opacity: number;
}

/**
 * 解析某元件最终使用的底板：
 * 1. 元件 `labelBackground === "none"` → 显式关闭；
 * 2. 元件有颜色 → 用元件色 + 元件/全局透明度；
 * 3. 否则跟随图纸级 `settings.nodeLabelBackground`（"none"/空 → 无底板）。
 */
export function resolveLabelPlate(
  node: Pick<DiagramNode, "labelBackground" | "labelBackgroundOpacity">,
  settings?: Pick<DiagramSettings, "nodeLabelBackground" | "nodeLabelBackgroundOpacity">,
): LabelPlate | null {
  const globalOpacity = settings?.nodeLabelBackgroundOpacity ?? DEFAULT_PLATE_OPACITY;
  if (node.labelBackground === "none") return null;
  if (node.labelBackground) {
    return { color: node.labelBackground, opacity: clamp01(node.labelBackgroundOpacity ?? globalOpacity) };
  }
  const globalColor = settings?.nodeLabelBackground;
  if (!globalColor || globalColor === "none") return null;
  return { color: globalColor, opacity: clamp01(node.labelBackgroundOpacity ?? globalOpacity) };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** 底板矩形几何（相对标签锚点 lx/ly，返回 x/y/width/height）。 */
export function plateRect(text: string, fontSize: number, lx: number, ly: number) {
  const width = Math.max(34, measureLabelWidth(text, fontSize) + PLATE_PADDING_X * 2);
  return {
    x: lx - width / 2,
    y: ly - fontSize * PLATE_TOP_RATIO,
    width,
    height: fontSize * (PLATE_TOP_RATIO + PLATE_BOTTOM_RATIO),
  };
}

/** 测试或主题切换后可清空宽度缓存。 */
export function clearLabelWidthCache(): void {
  widthCache.clear();
}
