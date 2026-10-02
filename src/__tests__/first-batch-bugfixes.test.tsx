import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import type { Diagram, DiagramNode, ValidationCase } from "../types";
import { createEmptyDiagram } from "../sample";
import { createNode } from "../symbols";
import { connectionErrorMessage, validatePipeConnection } from "../connection";
import { getEnginePerfStats, pipeEffectiveDisabled, pipeEngineeringDisabled, portWorldPos, setCachedPipes } from "../geometry";
import { CanvasView } from "../components/CanvasView";
import { focusTargetViewport } from "../components/FaultCodePanel";
import { Inspector } from "../components/Inspector";
import { StatusBar } from "../components/StatusBar";
import { LangProvider } from "../i18n";
import { runValidationCase } from "../validation";
import { createPipe, loadDiagram, reconnectPipeEndpoint, selectPipe, setMouseWorld, setPipesForceStop, setSelection, setSelectionDisabled, setWorkMode, store, undo, updateDiagram } from "../store";

function fixture(): { diagram: Diagram; inlet: DiagramNode; outlet: DiagramNode; inlet2: DiagramNode; outlet2: DiagramNode; pump: DiagramNode } {
  const diagram = createEmptyDiagram();
  diagram.settings.globalAnimationPlaying = true;
  const inlet = createNode("inlet", 20, 20);
  const outlet = createNode("outlet", 340, 20);
  const inlet2 = createNode("inlet", 20, 130);
  const outlet2 = createNode("outlet", 340, 130);
  const pump = createNode("pump", 160, 130);
  diagram.nodes = [inlet, outlet, inlet2, outlet2, pump];
  return { diagram, inlet, outlet, inlet2, outlet2, pump };
}

function loadPipe() {
  const f = fixture();
  loadDiagram(f.diagram);
  setWorkMode("edit");
  const pipe = createPipe(f.inlet.ports[0].id, f.outlet.ports[0].id)!;
  return { ...f, pipe };
}

beforeEach(() => localStorage.setItem("fluidpath.lang", "zh"));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); setWorkMode("edit"); });

describe("首批修复：连接规则与重连", () => {
  it("新建和重连共用缺失、同元件、两进/两出及占用校验", () => {
    const { diagram, inlet, outlet, inlet2, outlet2, pump } = fixture();
    expect(validatePipeConnection(diagram, "missing", outlet.ports[0].id)).toBe("missing-port");
    expect(validatePipeConnection(diagram, inlet.ports[0].id, inlet.ports[0].id)).toBe("same-port");
    expect(validatePipeConnection(diagram, pump.ports[0].id, pump.ports[1].id)).toBe("same-node");
    expect(validatePipeConnection(diagram, outlet.ports[0].id, outlet2.ports[0].id)).toBe("both-in");
    expect(validatePipeConnection(diagram, inlet.ports[0].id, inlet2.ports[0].id)).toBe("both-out");
    expect(connectionErrorMessage("occupied", "en")).toContain("already used");
    loadDiagram(diagram);
    expect(createPipe(inlet.ports[0].id, inlet2.ports[0].id)).toBeUndefined();
    expect(store.get().diagram.pipes).toHaveLength(0);
    const pipe = createPipe(inlet.ports[0].id, outlet.ports[0].id)!;
    expect(validatePipeConnection(store.get().diagram, inlet.ports[0].id, outlet2.ports[0].id)).toBe("occupied");
    expect(validatePipeConnection(store.get().diagram, inlet.ports[0].id, outlet2.ports[0].id, pipe.id)).toBeNull();
  });

  it("无效端口重连保持旧管路不变；合法重连一次提交且可撤销", () => {
    const { pipe, inlet, inlet2, outlet, outlet2, pump } = loadPipe();
    const before = store.get().diagram;
    expect(reconnectPipeEndpoint(pipe.id, "to", { portId: inlet2.ports[0].id })).toBe(false);
    expect(reconnectPipeEndpoint(pipe.id, "to", { portId: pump.ports[1].id })).toBe(false);
    expect(reconnectPipeEndpoint(pipe.id, "to", { portId: inlet.ports[0].id })).toBe(false);
    expect(store.get().diagram).toBe(before);
    expect(createPipe(inlet2.ports[0].id, outlet2.ports[0].id)).toBeTruthy();
    expect(reconnectPipeEndpoint(pipe.id, "to", { portId: outlet2.ports[0].id })).toBe(false);
    expect(store.get().diagram.pipes.find(p => p.id === pipe.id)!.toPortId).toBe(outlet.ports[0].id);
    const free = { x: 490, y: 90 };
    expect(reconnectPipeEndpoint(pipe.id, "to", { point: free })).toBe(true);
    expect(store.get().diagram.pipes.find(p => p.id === pipe.id)!.toPoint).toEqual(free);
    undo();
    expect(store.get().diagram.pipes.find(p => p.id === pipe.id)!.toPortId).toBe(outlet.ports[0].id);
  });

  it("端点拖动期间只有预览、无效候选显示红线且松手不破坏旧连接；编辑模式才允许重连", () => {
    const { pipe, outlet, outlet2, pump } = loadPipe();
    const callbacks: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => { callbacks.push(fn); return callbacks.length; });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const { container } = render(<LangProvider><CanvasView svgRefOut={{ current: null }} /></LangProvider>);
    const screenPos = (n: DiagramNode, portId: string) => {
      const pt = portWorldPos(n, n.ports.find(p => p.id === portId)!);
      const { panX, panY, zoom } = store.get().ui;
      return { clientX: panX + pt.x * zoom, clientY: panY + pt.y * zoom };
    };
    const start = screenPos(outlet, outlet.ports[0].id);
    const invalid = screenPos(pump, pump.ports[1].id);
    const handle = () => container.querySelector(`[data-pipe-terminal="${pipe.id}:to"]`)!;
    const before = store.get().diagram;
    fireEvent.mouseDown(handle(), start);
    fireEvent.mouseMove(window, invalid);
    expect(container.querySelector('[data-terminal-preview="invalid"]')).toBeTruthy();
    expect(store.get().diagram).toBe(before);
    fireEvent.mouseUp(window, invalid);
    expect(store.get().diagram).toBe(before);
    expect(container.querySelector("[data-terminal-preview]")).toBeNull();

    const valid = screenPos(outlet2, outlet2.ports[0].id);
    fireEvent.mouseDown(handle(), start);
    fireEvent.mouseMove(window, valid);
    expect(container.querySelector('[data-terminal-preview="valid"]')).toBeTruthy();
    expect(store.get().diagram).toBe(before);
    fireEvent.mouseUp(window, valid);
    expect(store.get().diagram.pipes.find(p => p.id === pipe.id)!.toPortId).toBe(outlet2.ports[0].id);

    act(() => setWorkMode("verify"));
    const locked = store.get().diagram;
    fireEvent.mouseDown(handle(), valid);
    fireEvent.mouseMove(window, invalid);
    fireEvent.mouseUp(window, invalid);
    expect(store.get().diagram).toBe(locked);
  });
});

describe("首批修复：画布状态、性能与定位", () => {
  it("故障目标从小缩放可放大至可读范围，同时大范围仍可缩小并居中", () => {
    const small = focusTargetViewport(100, 100, 120, 120, 800, 600);
    expect(small.zoom).toBe(1.8);
    expect(small.panX + 110 * small.zoom).toBe(400);
    expect(small.panY + 110 * small.zoom).toBe(300);
    expect(focusTargetViewport(0, 0, 10000, 9000, 800, 600).zoom).toBe(0.2);
  });

  it("动画帧和 UI 坐标重绘不再重算；图纸改变后重算", () => {
    loadPipe();
    const callbacks: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => { callbacks.push(fn); return callbacks.length; });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    render(<LangProvider><CanvasView svgRefOut={{ current: null }} /></LangProvider>);
    const initial = getEnginePerfStats().samples;
    act(() => {
      for (let i = 0; i < 6; i++) callbacks.shift()?.(performance.now() + i * 16);
      for (let i = 0; i < 3; i++) setMouseWorld({ x: i, y: i });
    });
    expect(getEnginePerfStats().samples).toBe(initial);
    act(() => updateDiagram(d => { d.name = "updated"; }));
    expect(getEnginePerfStats().samples).toBeGreaterThan(initial);
  });

  it("暂停与逐管停止隐藏白色粒子，状态栏提示工程判定不变", () => {
    const { pipe } = loadPipe();
    const { container } = render(<LangProvider><CanvasView svgRefOut={{ current: null }} /><StatusBar /></LangProvider>);
    expect(container.querySelector(`[data-flow="${pipe.id}"]`)).toBeTruthy();
    act(() => updateDiagram(d => { d.settings.globalAnimationPlaying = false; }));
    expect(container.querySelector(`[data-flow="${pipe.id}"]`)).toBeNull();
    expect(container.textContent).toContain("动画已暂停 · 工程流动仍按工况计算");
    expect(pipeEngineeringDisabled(store.get().diagram.pipes[0], store.get().diagram.nodes)).toBe(false);
    act(() => updateDiagram(d => { d.settings.globalAnimationPlaying = true; d.pipes[0].animated = false; }));
    expect(container.querySelector(`[data-flow="${pipe.id}"]`)).toBeNull();
  });

  it("画布淡化与讲解停流不改工程流动或验收；教学控制独立折叠并在验收模式禁用", () => {
    const { pipe, inlet } = loadPipe();
    setSelection({ nodes: [inlet.id], pipes: [pipe.id] });
    setSelectionDisabled(true);
    const d = store.get().diagram;
    expect(d.nodes.find(n => n.id === inlet.id)!.displayDisabled).toBe(true);
    expect(d.nodes.find(n => n.id === inlet.id)!.disabled).not.toBe(true);
    expect(d.pipes.find(p => p.id === pipe.id)!.displayDisabled).toBe(true);
    setPipesForceStop([pipe.id], true);
    const current = store.get().diagram;
    setCachedPipes(current.pipes, current.nodes);
    expect(pipeEngineeringDisabled(current.pipes[0], current.nodes)).toBe(false);
    expect(pipeEffectiveDisabled(current.pipes[0], current.nodes)).toBe(true);
    const validation: ValidationCase = { id: "flow", name: "flow", state: {}, mustFlowPipeIds: [pipe.id], mustStopPipeIds: [] };
    expect(runValidationCase(current, validation).status).toBe("PASS");

    selectPipe(pipe.id);
    setWorkMode("verify");
    const { container } = render(<LangProvider><Inspector /></LangProvider>);
    const teachingSection = Array.from(container.querySelectorAll(".insp-section")).find(section => section.querySelector(".insp-section-title")?.textContent?.includes("教学显示覆盖"));
    expect(teachingSection).toBeTruthy();
    fireEvent.click(teachingSection!.querySelector(".insp-section-title")!);
    expect(teachingSection!.textContent).toContain("不改变工程判定，不参与验收");
    const controls = Array.from(teachingSection!.querySelectorAll<HTMLButtonElement>(".seg button"));
    expect(controls).toHaveLength(3);
    expect(controls.every(button => button.disabled)).toBe(true);
  });
});
