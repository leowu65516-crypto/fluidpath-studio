import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MOTION, EASE_OUT_SOFT, EASE_SPRING } from "../motion";

/**
 * CSS 变量与 JS 常量必须同值：toast 的卸载延时、模式横幅的淡出窗口都读 JS 数值，
 * 一旦两边漂移，就会出现「样式已经结束、定时器还没到」的空档。
 */
describe("动效令牌", () => {
  const css = readFileSync(resolve(__dirname, "../styles.css"), "utf8");

  function token(name: string): string {
    const m = css.match(new RegExp(`--${name}:\\s*([^;]+);`));
    return m ? m[1].trim() : "";
  }

  it(":root 定义了四个时长与两条缓动曲线", () => {
    expect(token("motion-fast")).toBe(`${MOTION.fast}ms`);
    expect(token("motion-base")).toBe(`${MOTION.base}ms`);
    expect(token("motion-slow")).toBe(`${MOTION.slow}ms`);
    expect(token("motion-decor")).toBe(`${MOTION.decor}ms`);
    expect(token("ease-out-soft")).toBe(EASE_OUT_SOFT);
    expect(token("ease-spring")).toBe(EASE_SPRING);
  });

  it("容器层动效不超过 250ms", () => {
    expect(Math.max(MOTION.fast, MOTION.base)).toBeLessThanOrEqual(250);
    expect(MOTION.slow).toBeGreaterThanOrEqual(MOTION.base);
  });

  it("减弱动效时全局降级为即时切换", () => {
    const block = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(block).toMatch(/animation-duration:\s*0\.01ms\s*!important/);
    expect(block).toMatch(/transition-duration:\s*0\.01ms\s*!important/);
  });

  it("四处微动效都改用令牌而不是硬编码时长", () => {
    expect(css).toMatch(/\.fp-toast\s*\{[^}]*transition:[^;]*var\(--motion-base\)/);
    expect(css).toMatch(/\.save-pill\s*\{[^}]*transition:[^;]*var\(--motion-fast\)/);
    expect(css).toMatch(/\.library\s*\{[^}]*transition:\s*width var\(--motion-base\)/);
    expect(css).toMatch(/\.inspector\s*\{[^}]*transition:\s*width var\(--motion-base\)/);
    expect(css).toMatch(/\.mode-banner\.leaving\s*\{[^}]*opacity:\s*0/);
  });

  it("所有容器层 transition 都走令牌（无硬编码时长残留）", () => {
    const offenders = css
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("transition:") && !l.includes("var(--motion"));
    expect(offenders).toEqual([]);
  });

  it("进出场动画（toastIn/menuIn）走令牌", () => {
    const offenders = css
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /^animation:\s*(toastIn|menuIn)\b/.test(l) && !l.includes("var(--motion"));
    expect(offenders).toEqual([]);
  });
});
