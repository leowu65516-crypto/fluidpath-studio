/**
 * v1.22 自定义演示场景测试：
 * - 从工况创建（多工况 → 多步，nodeId 直通）
 * - enterScenario 应用自定义场景（基线复位 + 步骤阀位）
 * - 微调保存到自定义场景步骤（机制通用）
 * - 删除
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { LangProvider } from "../i18n";
import App from "../App";
import { loadDiagram, store, enterScenario, setScenarioStep, saveScenarioOverridesToStep, createCustomScenarioFromConditions, saveWorkCondition, overrideScenarioNode } from "../store";
import { availableScenariosForDiagram, getScenario } from "../scenarios";
import bcmtsRaw from "../../BCMTS.json";

function toDiagram(json: any) {
  return {
    ...json,
    settings: { showGrid: true, background: "#eef2f7", globalAnimationPlaying: false, crossoverHops: true, layers: [{ id: "l", name: "默认层", visible: true }], ...json.settings },
  };
}

const COLD_VALVE = "n_ms7jyyn0kfcobx";

beforeEach(() => {
  try { localStorage.setItem("fluidpath.lang", "zh"); } catch { /* ignore */ }
  render(<LangProvider><App /></LangProvider>);
  act(() => { loadDiagram(toDiagram(bcmtsRaw)); });
});

describe("自定义演示场景", () => {
  it("从两个工况创建：两步场景，nodeId 阀位正确", () => {
    act(() => { saveWorkCondition("工况A"); }); // 当前阀位快照（BCMTS 存档态）
    act(() => {
      // 摆第二个工况：打开常温水阀
      const d = store.get().diagram;
      const node = d.nodes.find((n) => n.id === COLD_VALVE)!;
      node.valveState = "open";
    });
    act(() => { saveWorkCondition("工况B"); });
    let id: string | null = null;
    act(() => { id = createCustomScenarioFromConditions(["工况A", "工况B"], "zh"); });
    expect(id).toBeTruthy();
    const sc = getScenario(id!, store.get().diagram)!;
    expect(sc.steps.length).toBe(2);
    expect(sc.steps[0].title).toBe("工况A");
    expect(sc.steps[1].title).toBe("工况B");
    // 工况B 的阀位：COLD_VALVE open（nodeId 键）
    expect(sc.steps[1].valves?.[COLD_VALVE]).toBe("open");
    // 出现在可用场景列表
    expect(availableScenariosForDiagram(store.get().diagram).map((s) => s.id)).toContain(id);
  });

  it("enterScenario 应用自定义场景：第 2 步 COLD_VALVE open", () => {
    act(() => { saveWorkCondition("A"); });
    act(() => {
      const d = store.get().diagram;
      d.nodes.find((n) => n.id === COLD_VALVE)!.valveState = "open";
    });
    act(() => { saveWorkCondition("B"); });
    let id: string | null = null;
    act(() => { id = createCustomScenarioFromConditions(["A", "B"], "zh"); });
    act(() => { enterScenario(id!, 1); });
    expect(store.get().diagram.nodes.find((n) => n.id === COLD_VALVE)!.valveState).toBe("open");
    // 回第 1 步：重建（基线复位 + 第 1 步阀位）
    act(() => { setScenarioStep(0); });
    expect(store.get().diagram.nodes.find((n) => n.id === COLD_VALVE)!.valveState).toBe("closed");
  });

  it("微调保存到自定义场景步骤（机制通用）", () => {
    act(() => { saveWorkCondition("A"); });
    let id: string | null = null;
    act(() => { id = createCustomScenarioFromConditions(["A"], "zh"); });
    act(() => { enterScenario(id!, 0); });
    act(() => { overrideScenarioNode(COLD_VALVE, { valveState: "open" }); });
    act(() => { saveScenarioOverridesToStep(0); });
    act(() => { setScenarioStep(0); });
    expect(store.get().diagram.nodes.find((n) => n.id === COLD_VALVE)!.valveState).toBe("open");
  });

  it("删除自定义场景", () => {
    act(() => { saveWorkCondition("A"); });
    let id: string | null = null;
    act(() => { id = createCustomScenarioFromConditions(["A"], "zh"); });
    expect(getScenario(id!, store.get().diagram)).toBeTruthy();
    // 删除（store 层通过 updateDiagram——这里模拟面板行为）
    act(() => {
      const d = store.get().diagram;
      d.settings.customScenarios = (d.settings.customScenarios ?? []).filter((s) => s.id !== id);
    });
    expect(getScenario(id!, store.get().diagram)).toBeUndefined();
  });
});
