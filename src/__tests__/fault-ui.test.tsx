/** 1.47.0：工作台起步卡、绑定向导、画布绑定预览与演练差异层 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, cleanup, fireEvent, act } from "@testing-library/react";
import { createElement } from "react";
import { LangProvider } from "../i18n";
import { loadDiagram, setSelection, setUI, setWorkMode, store } from "../store";
import { createEmptyDiagram, createMinimalBrewDiagram } from "../sample";
import { EMPTY_PROFILE } from "../fault-codes/profile";
import { snapshotWorkCondition } from "../presets";
import { startBindingWizard, BindingWizard } from "../components/BindingWizard";
import { FaultWorkbench } from "../components/FaultWorkbench";
import { FaultHighlightOverlay } from "../components/FaultHighlightOverlay";
import { resetDiagnosticSession, setBindPreviewGroupId, setDrillSession } from "../fault-codes/session";
import type { DiagnosticProfile } from "../fault-codes/types";

const noop = () => undefined;

function withGroups(diagramNodes: string[], profile: DiagnosticProfile = structuredClone(EMPTY_PROFILE)): DiagnosticProfile {
  profile.version = "0.4-draft";
  profile.highlightGroups = [
    { id: "g1", label: { zh: "水泵", en: "Pump" }, resolution: "explicit", nodeIds: [], pipeIds: [] },
    { id: "g2", label: { zh: "出口", en: "Outlet" }, resolution: "explicit", nodeIds: [diagramNodes[1]], pipeIds: [] },
  ];
  profile.diagnostics = [{ id: "f1", code: "E1", label: { zh: "故障", en: "Fault" }, definitionStatus: "userDeclared", highlightBindings: [{ groupId: "g1", meaning: "inspectionScope" }], presentation: { style: "outline", color: "#d97706", animation: "none" }, troubleshooting: [], controlActions: [], rootCauseStatus: "notDetermined" }];
  return profile;
}

beforeEach(() => { setWorkMode("fault"); resetDiagnosticSession(); setUI({ kbBinding: null }); });

describe("FaultWorkbench 起步卡", () => {
  it("无图纸时给三个出口", () => {
    const diagram = createEmptyDiagram();
    loadDiagram(diagram);
    const view = render(createElement(LangProvider, null, createElement(FaultWorkbench, {
      onOpenJson: noop, onOpenSmart: noop, onLoadDemo: noop, onLoadSample: noop, onImport: noop, onStartBinding: noop, onStartDrill: noop,
    })));
    expect(view.getByTestId("fault-workbench").textContent).toContain("Fault mode needs a drawing");
    expect(view.getByRole("button", { name: /Open a drawing/ })).toBeTruthy();
    cleanup();
  });

  it("有图纸无知识库时给导入/示例出口，并提示可手工新建", () => {
    const diagram = createMinimalBrewDiagram();
    diagram.settings.diagnosticProfile = structuredClone(EMPTY_PROFILE);
    loadDiagram(diagram);
    const view = render(createElement(LangProvider, null, createElement(FaultWorkbench, {
      onOpenJson: noop, onOpenSmart: noop, onLoadDemo: noop, onLoadSample: noop, onImport: noop, onStartBinding: noop, onStartDrill: noop,
    })));
    const text = view.getByTestId("fault-workbench").textContent ?? "";
    expect(text).toContain("no fault codes");
    expect(view.getByRole("button", { name: /Load sample knowledge base/ })).toBeTruthy();
    cleanup();
  });

  it("未绑定时显示绑定入口", () => {
    const diagram = createMinimalBrewDiagram();
    diagram.settings.diagnosticProfile = withGroups(diagram.nodes.map(node => node.id));
    loadDiagram(diagram);
    const onStartBinding = vi.fn();
    const view = render(createElement(LangProvider, null, createElement(FaultWorkbench, {
      onOpenJson: noop, onOpenSmart: noop, onLoadDemo: noop, onLoadSample: noop, onImport: noop, onStartBinding, onStartDrill: noop,
    })));
    expect(view.getByTestId("fault-workbench").textContent).toContain("not bound to the canvas");
    act(() => { fireEvent.click(view.getByRole("button", { name: /Start binding wizard/ })); });
    expect(onStartBinding).toHaveBeenCalledTimes(1);
    cleanup();
  });
});

describe("BindingWizard", () => {
  it("确认绑定后自动进入下一组并保留进度", async () => {
    const diagram = createMinimalBrewDiagram();
    const profile = withGroups(diagram.nodes.map(node => node.id));
    profile.highlightGroups[1].nodeIds = [];
    diagram.settings.diagnosticProfile = profile;
    loadDiagram(diagram);
    expect(startBindingWizard()).toBe(true);
    const view = render(createElement(LangProvider, null, createElement(BindingWizard, { onError: noop })));
    expect(view.getByTestId("bind-wizard").textContent).toContain("1 / 2");
    act(() => { setSelection({ nodes: [diagram.nodes[0].id], pipes: [] }); });
    await act(async () => { fireEvent.click(view.getByRole("button", { name: "Confirm binding" })); });
    expect(store.get().diagram.settings.diagnosticProfile!.highlightGroups[0].nodeIds).toEqual([diagram.nodes[0].id]);
    expect(view.getByTestId("bind-wizard").textContent).toContain("2 / 2");
    cleanup();
  });

  it("跳过会前进，退出清空状态", async () => {
    const diagram = createMinimalBrewDiagram();
    const profile = withGroups(diagram.nodes.map(node => node.id));
    profile.highlightGroups[1].nodeIds = [];
    diagram.settings.diagnosticProfile = profile;
    loadDiagram(diagram);
    startBindingWizard();
    const view = render(createElement(LangProvider, null, createElement(BindingWizard, { onError: noop })));
    await act(async () => { fireEvent.click(view.getByRole("button", { name: "Skip" })); });
    expect(view.getByTestId("bind-wizard").textContent).toContain("2 / 2");
    await act(async () => { fireEvent.click(view.getByRole("button", { name: "Exit binding wizard" })); });
    expect(store.get().ui.kbBinding).toBeNull();
    cleanup();
  });
});

describe("画布 overlay：绑定预览与演练差异", () => {
  it("bindPreviewGroupId 渲染蓝色预览层", () => {
    const diagram = createMinimalBrewDiagram();
    const profile = withGroups(diagram.nodes.map(node => node.id));
    profile.highlightGroups[1].nodeIds = [diagram.nodes[1].id];
    diagram.settings.diagnosticProfile = profile;
    loadDiagram(diagram);
    const d = store.get().diagram;
    const view = render(createElement("svg", null, createElement(FaultHighlightOverlay, { diagram: d, visibleNodes: new Set(d.nodes.map(n => n.id)), visiblePipes: new Set(d.pipes.map(p => p.id)) })));
    act(() => { setBindPreviewGroupId("g2"); });
    expect(view.container.querySelector("[data-bind-preview]")).toBeTruthy();
    cleanup();
    act(() => { setBindPreviewGroupId(null); });
  });

  it("drill 会话渲染新增停流与注入元件徽标", () => {
    const diagram = createMinimalBrewDiagram();
    diagram.settings.diagnosticProfile = withGroups(diagram.nodes.map(node => node.id));
    loadDiagram(diagram);
    const d = store.get().diagram;
    const pipeId = d.pipes[0].id;
    act(() => {
      setDrillSession({
        faultId: "f1", faultCode: "E1", baseline: snapshotWorkCondition(d),
        changes: { stoppedPipes: [pipeId], flowingPipes: [] },
        injected: [{ nodeId: d.nodes[0].id, behavior: "stopped", groupId: "g1" }],
        note: { zh: "说明", en: "Note" },
      });
    });
    const view = render(createElement("svg", null, createElement(FaultHighlightOverlay, { diagram: d, visibleNodes: new Set(d.nodes.map(n => n.id)), visiblePipes: new Set(d.pipes.map(p => p.id)) })));
    expect(view.container.querySelector("[data-drill-overlay]")).toBeTruthy();
    expect(view.container.querySelector(`[data-drill-stopped="${pipeId}"]`)).toBeTruthy();
    expect(view.container.querySelector(`[data-drill-node="${d.nodes[0].id}"]`)).toBeTruthy();
    cleanup();
    act(() => { resetDiagnosticSession(); });
  });
});
