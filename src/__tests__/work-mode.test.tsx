/**
 * 工作模式：edit / present / verify / fault
 * - store.ui.mode 切换
 * - Toolbar 渲染模式切换器且高亮当前模式
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, cleanup, act, fireEvent } from "@testing-library/react";
import { LangProvider } from "../i18n";
import App from "../App";
import { Toolbar } from "../components/Toolbar";
import { setWorkMode, store } from "../store";

beforeEach(() => { try { localStorage.setItem("fluidpath.lang", "zh"); } catch { /* ignore */ } });
afterEach(cleanup);

describe("工作模式", () => {
  it("setWorkMode 更新 store.ui.mode（默认 edit）", () => {
    expect(store.get().ui.mode ?? "edit").toBe("edit");
    act(() => setWorkMode("present"));
    expect(store.get().ui.mode).toBe("present");
    act(() => setWorkMode("verify"));
    expect(store.get().ui.mode).toBe("verify");
    act(() => setWorkMode("fault"));
    expect(store.get().ui.mode).toBe("fault");
    act(() => setWorkMode("edit"));
    expect(store.get().ui.mode).toBe("edit");
  });

  it("Toolbar 渲染三个模式按钮且高亮当前模式", () => {
    const svgRef = { current: null } as React.MutableRefObject<SVGSVGElement | null>;
    const { container } = render(
      <LangProvider>
        <Toolbar svgRef={svgRef} />
      </LangProvider>
    );
    const seg = container.querySelector(".tb-mode");
    expect(seg).toBeTruthy();
    const btns = Array.from(seg!.querySelectorAll("button"));
    expect(btns.length).toBe(3);
    const onCount = () => btns.filter((b) => b.classList.contains("on")).length;
    expect(onCount()).toBe(1);
    expect(btns.filter((b) => b.getAttribute("aria-pressed") === "true")).toHaveLength(1);
    act(() => setWorkMode("present"));
    expect(onCount()).toBe(1);
    act(() => setWorkMode("fault"));
    expect(onCount()).toBe(1);
    act(() => setWorkMode("edit"));
    expect(onCount()).toBe(1);
  });

  it("英文模式使用紧凑且完整的三个模式名称", () => {
    localStorage.setItem("fluidpath.lang", "en");
    const svgRef = { current: null } as React.MutableRefObject<SVGSVGElement | null>;
    const { container } = render(<LangProvider><Toolbar svgRef={svgRef} /></LangProvider>);
    const labels = Array.from(container.querySelectorAll(".tb-mode button")).map((button) => button.textContent?.trim());
    expect(labels).toEqual(["✏️ Edit", "🎬 Demo", "⚠ Fault"]);
  });

  it("关闭验收会退出验收模式并恢复属性检查器，不留下空白模式框", () => {
    const view = render(<LangProvider><App /></LangProvider>);
    act(() => setWorkMode("verify"));
    expect(view.container.querySelector(".validation-panel")).toBeTruthy();
    const close = view.container.querySelector(".validation-panel .advice-close");
    expect(close).toBeTruthy();
    fireEvent.click(close!);
    expect(store.get().ui.mode).toBe("edit");
    expect(view.container.querySelector(".validation-panel")).toBeNull();
    expect(view.container.querySelector(".inspector")).toBeTruthy();
  });
});
