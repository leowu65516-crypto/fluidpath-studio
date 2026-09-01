import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, act, screen, waitFor, cleanup } from "@testing-library/react";
import { LangProvider } from "../i18n";
import App from "../App";
import {
  fitToScreen,
  loadDiagram,
  setSelection,
  patchPipe,
  setStyleBrush,
  setGlobalFlowScale,
  store,
} from "../store";
import b2c from "../../MSY2.json";

beforeEach(() => { try { localStorage.setItem("fluidpath.lang", "zh"); } catch { /* ignore */ } });
afterEach(cleanup);

function renderApp() {
  return render(
    <LangProvider>
      <App />
    </LangProvider>
  );
}

/** 构造一个可加载的 diagram（补齐 settings 字段） */
function toDiagram(json: any) {
  return {
    ...json,
    settings: {
      showGrid: true,
      background: "#eef2f7",
      globalAnimationPlaying: false,
      crossoverHops: true,
      layers: [{ id: "layer_default", name: "默认层", visible: true }],
      ...json.settings,
    },
  };
}

describe("UI 集成：批量编辑、管路标注、样式刷、流速", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("fluidpath.lang", "zh");
  });

  it("多选管路后属性面板显示批量编辑区", () => {
    renderApp();
    act(() => {
      loadDiagram(toDiagram(b2c));
    });
    act(() => {
      const d = store.get().diagram;
      setSelection({ nodes: [], pipes: d.pipes.slice(0, 3).map((p) => p.id) });
    });
    expect(screen.getByText(/批量编辑/)).toBeTruthy();
    expect(screen.getByText(/介质类型/)).toBeTruthy();
  });

  it("管路标注文字设置后渲染在画布", () => {
    renderApp();
    act(() => {
      loadDiagram(toDiagram(b2c));
    });
    act(() => { fitToScreen(1200, 900); });
    act(() => {
      const d = store.get().diagram;
      patchPipe(d.pipes[0].id, { annotation: "测试标注XYZ" });
    });
    // 画布 SVG 中应出现标注文字
    const svg = document.querySelector(".main-canvas");
    expect(svg).toBeTruthy();
    const texts = svg ? Array.from(svg.querySelectorAll("text")).map((t) => t.textContent ?? "") : [];
    expect(texts.some((x) => x.includes("测试标注XYZ"))).toBe(true);
  });

  it("开启样式刷后画布显示提示条", () => {
    renderApp();
    act(() => {
      loadDiagram(toDiagram(b2c));
    });
    act(() => {
      setStyleBrush(true);
    });
    expect(document.querySelector(".brush-tip")).toBeTruthy();
    // Esc 退出（从 body 派发，冒泡到 window）
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(store.get().ui.styleBrush).toBe(false);
  });

  it("全局流速滑杆写入 settings.flowScale", () => {
    renderApp();
    act(() => {
      loadDiagram(toDiagram(b2c));
    });
    act(() => {
      setGlobalFlowScale(1.8);
    });
    expect(store.get().diagram.settings.flowScale).toBe(1.8);
  });

  it("中英双语切换后库标题变为 Library", async () => {
    renderApp();
    act(() => {
      loadDiagram(toDiagram(b2c));
    });
    // 找到 EN 按钮点击
    const enBtn = screen.getByText("EN");
    act(() => enBtn.click());
    await waitFor(() => {
      expect(screen.getAllByText("Library").length).toBeGreaterThan(0);
    });
    // 切回中文
    const zhBtn = screen.getByText("中");
    act(() => zhBtn.click());
    await waitFor(() => {
      expect(screen.getAllByText("元件库").length).toBeGreaterThan(0);
    });
  });

  it("MiniMap 渲染在画布上", () => {
    renderApp();
    act(() => {
      loadDiagram(toDiagram(b2c));
    });
    expect(document.querySelector(".minimap")).toBeTruthy();
  });
});
