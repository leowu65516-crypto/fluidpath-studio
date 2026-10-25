/**
 * AI 绘图面板激活回归：
 * - 工具栏入口可触达（此前 AiDrawingPanel 是孤儿组件，用户无法打开）
 * - App 右栏能挂载/关闭面板，且不与其他右栏面板抢占
 * - 英文模式下面板无中文 UI 残留
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen, act } from "@testing-library/react";
import { LangProvider } from "../i18n";
import App from "../App";
import { Toolbar } from "../components/Toolbar";
import { AiDrawingPanel } from "../components/AiDrawingPanel";
import { setWorkMode } from "../store";

beforeEach(() => {
  try { localStorage.setItem("fluidpath.lang", "zh"); } catch { /* ignore */ }
  act(() => setWorkMode("edit"));
});
afterEach(() => {
  cleanup();
  try { localStorage.removeItem("fluidpath.lang"); } catch { /* ignore */ }
});

const svgRef = { current: null } as React.MutableRefObject<SVGSVGElement | null>;

describe("AI 绘图入口", () => {
  it("Toolbar 提供可点击的 AI 绘图按钮", () => {
    const onOpenAi = vi.fn();
    render(<LangProvider><Toolbar svgRef={svgRef} onOpenAi={onOpenAi} /></LangProvider>);
    fireEvent.click(screen.getByRole("button", { name: /AI 绘图/ }));
    expect(onOpenAi).toHaveBeenCalledTimes(1);
  });

  it("App 从工具栏打开并关闭 AI 面板", () => {
    const view = render(<LangProvider><App /></LangProvider>);
    expect(view.container.querySelector(".ai-drawing-panel")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /AI 绘图/ }));
    expect(view.container.querySelector(".ai-drawing-panel")).toBeTruthy();
    expect(screen.getByText("结构化指令预览与应用")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /关闭 AI 绘图/ }));
    expect(view.container.querySelector(".ai-drawing-panel")).toBeNull();
  });

  it("英文模式下面板无中文 UI 残留", () => {
    try { localStorage.setItem("fluidpath.lang", "en"); } catch { /* ignore */ }
    const view = render(<LangProvider><AiDrawingPanel onClose={() => {}} /></LangProvider>);
    expect(view.container.textContent).not.toMatch(/[\u4e00-\u9fff]/);
  });
});
