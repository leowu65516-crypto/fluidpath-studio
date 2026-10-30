/** 1.47.0：工作台起步卡、绑定向导、画布绑定预览与演练差异层 */
import { beforeEach, describe, expect, it } from "vitest";
import { render, cleanup, fireEvent, act } from "@testing-library/react";
import { createElement } from "react";
import { LangProvider } from "../i18n";
import { loadDiagram, setSelection, setUI, setWorkMode, store } from "../store";
import { createEmptyDiagram, createMinimalBrewDiagram } from "../sample";
import { EMPTY_PROFILE, parseDiagnosticProfile } from "../fault-codes/profile";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { snapshotWorkCondition } from "../presets";
import { startBindingWizard, BindingWizard } from "../components/BindingWizard";
import { FaultWorkbench } from "../components/FaultWorkbench";
import { FaultLeftPanel } from "../components/FaultLeftPanel";
import { FaultCodePanel } from "../components/FaultCodePanel";
import { FaultHighlightOverlay } from "../components/FaultHighlightOverlay";
import { diagnosticSession, resetDiagnosticSession, setBindPreviewGroupId, setDrillSession } from "../fault-codes/session";
import { bindKbGroupTargets } from "../fault-codes/actions";
import type { DiagnosticProfile } from "../fault-codes/types";

const noop = () => undefined;
const GOLDEN = parseDiagnosticProfile(JSON.parse(readFileSync(resolve(__dirname, "../../MILK-KB.fluidkb.json"), "utf8")));

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

describe("FaultWorkbench 步骤导航", () => {
  it("空图纸时停在 no-diagram，点击步骤可切换 faultStep", () => {
    loadDiagram(createEmptyDiagram());
    setUI({ faultStep: undefined });
    const view = render(createElement(LangProvider, null, createElement(FaultWorkbench)));
    const wb = view.getByTestId("fault-workbench");
    expect(wb.getAttribute("data-stage")).toBe("no-diagram");
    expect(wb.textContent).toContain("Need a drawing first");
    const tabs = view.getAllByRole("tab");
    expect(tabs).toHaveLength(4);
    act(() => { fireEvent.click(tabs[1]); });
    expect(store.get().ui.faultStep).toBe(2);
    cleanup();
    setUI({ faultStep: undefined });
  });

  it("有图纸无知识库 → no-library", () => {
    const diagram = createMinimalBrewDiagram();
    diagram.settings.diagnosticProfile = structuredClone(EMPTY_PROFILE);
    loadDiagram(diagram);
    const view = render(createElement(LangProvider, null, createElement(FaultWorkbench)));
    expect(view.getByTestId("fault-workbench").getAttribute("data-stage")).toBe("no-library");
    expect(view.getByTestId("fault-workbench").textContent).toContain("Need a fault library");
    cleanup();
  });

  it("有代码无落点 → unbound", () => {
    const diagram = createMinimalBrewDiagram();
    diagram.settings.diagnosticProfile = withGroups(diagram.nodes.map(node => node.id));
    diagram.settings.diagnosticProfile.highlightGroups[0].nodeIds = [];
    loadDiagram(diagram);
    const view = render(createElement(LangProvider, null, createElement(FaultWorkbench)));
    expect(view.getByTestId("fault-workbench").getAttribute("data-stage")).toBe("unbound");
    cleanup();
  });

  it("「下一步」直接执行动作：未绑定→开绑定向导；可演练→开始演练", () => {
    const diagram = createMinimalBrewDiagram();
    const profile = withGroups(diagram.nodes.map(node => node.id));
    profile.highlightGroups[0].nodeIds = [];
    profile.diagnostics[0].drill = { actions: [{ groupId: "g1", behavior: "stopped" }] };
    diagram.settings.diagnosticProfile = profile;
    loadDiagram(diagram);
    setUI({ faultStep: 3 });
    const view = render(createElement(LangProvider, null, createElement(FaultWorkbench)));
    const strip = view.getByTestId("fault-next");
    expect(strip.getAttribute("data-kind")).toBe("needs-binding");
    act(() => { fireEvent.click(strip.querySelector("button")!); });
    expect(store.get().ui.kbBinding).toBeTruthy();
    expect(store.get().ui.faultStep).toBe(3);
    cleanup();
    act(() => { setUI({ kbBinding: null }); });
  });
});

describe("FaultLeftPanel", () => {
  it("故障码常驻左栏；点击代码选中并同步咨询台", () => {
    const diagram = createMinimalBrewDiagram();
    const profile = structuredClone(GOLDEN);
    diagram.settings.diagnosticProfile = profile;
    loadDiagram(diagram);
    const view = render(createElement(LangProvider, null, createElement(FaultLeftPanel)));
    const text = view.getByTestId("fault-left-panel").textContent ?? "";
    expect(text).toContain("Fault code");
    expect(text).toContain("Notes & highlights");
    const codeButton = [...view.container.querySelectorAll(".fl-code")].find(button => button.textContent?.includes("E045"));
    expect(codeButton).toBeTruthy();
    act(() => { fireEvent.click(codeButton!); });
    expect(store.get().ui.faultStep).toBe(4);
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
    await act(async () => { fireEvent.click(view.getByRole("button", { name: /Confirm binding/ })); });
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
    await act(async () => { fireEvent.click(view.getByRole("button", { name: /^Skip/ })); });
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

describe("FaultCodePanel 步骤内容", () => {
  it("按步骤渲染不同内容，默认落在图纸步骤", async () => {
    loadDiagram(createEmptyDiagram());
    setUI({ faultStep: undefined });
    const view = render(createElement(LangProvider, null, createElement(FaultCodePanel, { onClose: noop, onOpenJson: noop, onOpenSmart: noop, onLoadDemo: noop })));
    expect(view.getByTestId("fault-step-diagram")).toBeTruthy();
    act(() => { fireEvent.click(view.getAllByRole("tab")[1]); });
    expect(view.getByTestId("fault-step-library")).toBeTruthy();
    cleanup();
    setUI({ faultStep: undefined });
  });

  it("最后一组绑定完成后自动进入演练并选中可用代码（闭环）", async () => {
    const diagram = createMinimalBrewDiagram();
    const profile = withGroups(diagram.nodes.map(node => node.id));
    profile.highlightGroups[0].nodeIds = [diagram.nodes[0].id];
    profile.highlightGroups[1].nodeIds = [];
    diagram.settings.diagnosticProfile = profile;
    loadDiagram(diagram);
    setUI({ faultStep: 3 });
    render(createElement(LangProvider, null, createElement(FaultCodePanel, { onClose: noop, onOpenJson: noop, onOpenSmart: noop, onLoadDemo: noop })));
    await act(async () => { bindKbGroupTargets("g2", { nodes: [diagram.nodes[1].id], pipes: [] }); });
    await act(async () => { await Promise.resolve(); });
    expect(store.get().ui.faultStep).toBe(4);
    expect(diagnosticSession.get().selectedIds).toContain("f1");
    cleanup();
    setUI({ faultStep: undefined });
  });

  it("故障备注层只在允许时渲染", () => {
    const diagram = createMinimalBrewDiagram();
    diagram.settings.faultNotes = [{ id: "n1", text: "检查这里", nodeIds: [diagram.nodes[0].id], pipeIds: [] }];
    diagram.settings.diagnosticProfile = withGroups(diagram.nodes.map(node => node.id));
    loadDiagram(diagram);
    const d = store.get().diagram;
    const hidden = render(createElement("svg", null, createElement(FaultHighlightOverlay, { diagram: d, visibleNodes: new Set(d.nodes.map(n => n.id)), visiblePipes: new Set(d.pipes.map(p => p.id)), showFaultNotes: false })));
    expect(hidden.container.querySelector("[data-fault-notes]")).toBeNull();
    cleanup();
    const shown = render(createElement("svg", null, createElement(FaultHighlightOverlay, { diagram: d, visibleNodes: new Set(d.nodes.map(n => n.id)), visiblePipes: new Set(d.pipes.map(p => p.id)), showFaultNotes: true })));
    expect(shown.container.querySelector("[data-fault-notes]")).toBeTruthy();
    expect(shown.container.querySelector("[data-fault-note='n1']")).toBeTruthy();
    cleanup();
  });
});
