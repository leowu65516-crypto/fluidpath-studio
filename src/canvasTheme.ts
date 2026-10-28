/**
 * 画布底色的解析层。
 *
 * 图纸里的 `settings.background` 是**用户资产**（随图纸保存、随分享链接扩散），
 * 而「跟随主题」只是**显示偏好**。所以这里只做派生，绝不回写数据：
 * 画布渲染、网格配色、流光配色、导出底色全部读同一个解析函数，
 * 保证「屏幕上看到的」与「导出/分享得到的」一致。
 */
import type { DiagramSettings } from "./types";

/** 主题画布底色（与 styles.css 的 --bg-work 保持一致） */
export const THEME_CANVAS_BG = {
  light: "#e8edf3",
  dark: "#141b24"
} as const;

export type CanvasTheme = "light" | "dark";

export function isFollowTheme(settings: Pick<DiagramSettings, "backgroundFollowTheme">): boolean {
  return settings.backgroundFollowTheme === true;
}

/**
 * 解析画布实际底色。
 * @param background 图纸自定义底色
 * @param follow 是否跟随主题
 * @param theme 当前（或导出时选择的）主题
 */
export function resolveCanvasBackground(background: string | undefined, follow: boolean | undefined, theme: CanvasTheme): string {
  if (follow) return THEME_CANVAS_BG[theme];
  return background || "#ffffff";
}

/** 供导出使用：根据导出选项决定主题（导出对话框的暗色开关优先于屏幕主题） */
export function exportCanvasBackground(
  settings: Pick<DiagramSettings, "background" | "backgroundFollowTheme">,
  darkMode: boolean
): string {
  return resolveCanvasBackground(settings.background, settings.backgroundFollowTheme, darkMode ? "dark" : "light");
}
