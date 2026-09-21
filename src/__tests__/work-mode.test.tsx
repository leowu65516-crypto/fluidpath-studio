/**
 * 工作模式：edit / present / verify / fault
 * - store.ui.mode 切换
 * - Toolbar 渲染模式切换器且高亮当前模式
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import { LangProvider } from "../i18n";
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

  it("Toolbar 渲染四个模式按钮且高亮当前模式", () => {
    const svgRef = { current: null } as React.MutableRefObject<SVGSVGElement | null>;
    const { container } = render(
      <LangProvider>
        <Toolbar svgRef={svgRef} />
      </LangProvider>
    );
    const seg = container.querySelector(".tb-mode");
    expect(seg).toBeTruthy();
    const btns = Array.from(seg!.querySelectorAll("button"));
    expect(btns.length).toBe(4);
    const onCount = () => btns.filter((b) => b.classList.contains("on")).length;
    expect(onCount()).toBe(1);
    act(() => setWorkMode("present"));
    expect(onCount()).toBe(1);
    act(() => setWorkMode("fault"));
    expect(onCount()).toBe(1);
    act(() => setWorkMode("edit"));
    expect(onCount()).toBe(1);
  });
});
