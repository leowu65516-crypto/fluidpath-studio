import { describe, expect, it, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LangProvider } from "../i18n";
import { ScenarioPanel } from "../components/ScenarioPanel";
import { CanvasView } from "../components/CanvasView";
import { Library } from "../components/Library";
import { fitToScreen, loadDiagram, setWorkMode, store } from "../store";
import bcmtsRaw from "../../BCMTS.json";
import type { Diagram } from "../types";

const toDiagram = (json: unknown): Diagram => JSON.parse(JSON.stringify(json)) as Diagram;

beforeEach(() => {
  loadDiagram(toDiagram(bcmtsRaw));
  setWorkMode("edit");
});

describe("演示模式符号一致性（批次 A）", () => {
  it("演示模式面板顶部显示「使用教学符号」说明；编辑模式不显示", () => {
    setWorkMode("present");
    const { unmount } = render(<LangProvider><ScenarioPanel onClose={() => {}} /></LangProvider>);
    expect(screen.getByTestId("present-symbol-note")).toBeTruthy();
    unmount();

    setWorkMode("edit");
    render(<LangProvider><ScenarioPanel onClose={() => {}} /></LangProvider>);
    expect(screen.queryByTestId("present-symbol-note")).toBeNull();
  });

  it("场景列表项点击进入播放器（防 DOM 点击回归）", () => {
    setWorkMode("present");
    render(<LangProvider><ScenarioPanel onClose={() => {}} /></LangProvider>);
    const choice = document.querySelector(".scenario-choice") as HTMLElement | null;
    expect(choice).toBeTruthy();
    fireEvent.click(choice!);
    expect(store.get().ui.scenario).toBeTruthy();
  });

  it("画布层：工程符号图纸在演示覆盖下渲染教学符号", async () => {
    const engineering = { ...toDiagram(bcmtsRaw), settings: { ...toDiagram(bcmtsRaw).settings, symbolProfile: "engineering" as const } };
    loadDiagram(engineering);
    fitToScreen(1200, 800);
    const ref = { current: null } as React.MutableRefObject<SVGSVGElement | null>;

    const normal = render(<LangProvider><CanvasView svgRefOut={ref} /></LangProvider>);
    expect(normal.container.querySelector('[data-symbol-feature^="vessel-"]')).toBeTruthy();
    normal.unmount();

    const forced = render(<LangProvider><CanvasView svgRefOut={ref} symbolProfileOverride="teaching" /></LangProvider>);
    expect(forced.container.querySelector('[data-symbol-feature^="vessel-"]')).toBeNull();
    forced.unmount();
    // 覆盖只影响显示，不改图纸设置
    expect(store.get().diagram.settings.symbolProfile).toBe("engineering");
  });

  it("元件库面板强制教学符号（图纸为工程符号时）", () => {
    loadDiagram({ ...toDiagram(bcmtsRaw), settings: { ...toDiagram(bcmtsRaw).settings, symbolProfile: "engineering" as const } });
    const { container } = render(<LangProvider><Library /></LangProvider>);
    expect(container.querySelector(".lib-item")).toBeTruthy();
    expect(container.querySelector('[data-symbol-feature^="vessel-"]')).toBeNull();
  });
});
