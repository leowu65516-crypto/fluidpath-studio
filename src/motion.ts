/**
 * 动效令牌的 JS 侧来源。
 *
 * 为什么 CSS 和 TS 各存一份：CSS 变量作用于样式，而 toast 的卸载延时、模式横幅的淡出窗口
 * 由 JS 定时器控制，必须能读到同一组数值。两侧一致性由 `src/__tests__/motion-tokens.test.ts` 锁定。
 */
export const MOTION = {
  fast: 150,
  base: 220,
  slow: 320,
  decor: 320
} as const;

export const EASE_OUT_SOFT = "cubic-bezier(0.22, 0.61, 0.36, 1)";
export const EASE_SPRING = "cubic-bezier(0.34, 1.3, 0.64, 1)";

/** 模式横幅的淡出窗口（比 base 略长，肉眼更顺） */
export const BANNER_LEAVE_MS = 240;
