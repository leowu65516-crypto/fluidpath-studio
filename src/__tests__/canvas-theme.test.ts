import { describe, expect, it } from "vitest";
import { THEME_CANVAS_BG, exportCanvasBackground, resolveCanvasBackground } from "../canvasTheme";

describe("画布底色解析（P0）", () => {
  it("未开启跟随时保持图纸自定义底色", () => {
    expect(resolveCanvasBackground("#eef2f7", false, "dark")).toBe("#eef2f7");
    expect(resolveCanvasBackground(undefined, false, "light")).toBe("#ffffff");
  });

  it("开启跟随后按主题取底色，且不改写图纸底色", () => {
    expect(resolveCanvasBackground("#eef2f7", true, "dark")).toBe(THEME_CANVAS_BG.dark);
    expect(resolveCanvasBackground("#eef2f7", true, "light")).toBe(THEME_CANVAS_BG.light);
  });

  it("导出按导出主题取底色（暗色导出得到深色画布）", () => {
    const follow = { background: "#eef2f7", backgroundFollowTheme: true };
    expect(exportCanvasBackground(follow, true)).toBe(THEME_CANVAS_BG.dark);
    expect(exportCanvasBackground(follow, false)).toBe(THEME_CANVAS_BG.light);
    const manual = { background: "#f5f2eb", backgroundFollowTheme: false };
    expect(exportCanvasBackground(manual, true)).toBe("#f5f2eb");
  });

  it("主题画布色与样式表一致（防止两边漂移）", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
    const light = css.match(/:root\s*\{[^}]*--bg-work:\s*([^;]+);/);
    const dark = css.match(/body\[data-theme="dark"\]\s*\{[^}]*--bg-work:\s*([^;]+);/);
    expect(light?.[1].trim()).toBe(THEME_CANVAS_BG.light);
    expect(dark?.[1].trim()).toBe(THEME_CANVAS_BG.dark);
  });
});
