/**
 * v1.22 自定义演示场景测试：
 * - 从工况创建（多工况 → 多步，nodeId 直通）
 * - enterScenario 应用自定义场景（基线复位 + 步骤阀位）
 * - 微调保存到自定义场景步骤（机制通用）
 * - 删除
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, act, fireEvent } from "@testing-library/react";
import { LangProvider } from "../i18n";
import App from "../App";
import { ScenarioPanel } from "../components/ScenarioPanel";
import { loadDiagram, store, enterScenario, setScenarioStep, saveScenarioOverridesToStep, createCustomScenarioFromConditions, saveWorkCondition, overrideScenarioNode, updateCustomScenario, renameWorkCondition } from "../store";
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

  it("步骤切换：闪烁 = 与上一步相比变化的元件（含关闭），未变化的不闪", () => {
    const PUMP = "n_ms7jr4mj2wu7sw";
    const INLET_VALVE = "n_ms7jsb6764ggp8";
    act(() => {
      const d = store.get().diagram;
      d.nodes.find((n) => n.id === PUMP)!.pumpOn = false;
      d.nodes.find((n) => n.id === COLD_VALVE)!.valveState = "open";
      d.nodes.find((n) => n.id === INLET_VALVE)!.valveState = "closed";
    });
    act(() => { saveWorkCondition("甲"); });
    act(() => {
      const d = store.get().diagram;
      d.nodes.find((n) => n.id === COLD_VALVE)!.valveState = "closed";
      d.nodes.find((n) => n.id === PUMP)!.pumpOn = true;
    });
    act(() => { saveWorkCondition("乙"); });
    let id: string | null = null;
    act(() => { id = createCustomScenarioFromConditions(["甲", "乙"], "zh"); });
    // 第 1 步只建立教学画面，不用闪烁分散注意力。
    act(() => { enterScenario(id!, 0); });
    let blink = store.get().ui.blink?.ids ?? [];
    expect(blink).toEqual([]);
    // 第 2 步（与第 1 步相比）：冷水阀关了、泵开了 → 两者都闪；未变化的入水阀不闪
    act(() => { setScenarioStep(1); });
    blink = store.get().ui.blink?.ids ?? [];
    expect(blink).toContain(COLD_VALVE);
    expect(blink).toContain(PUMP);
    expect(blink).not.toContain(INLET_VALVE);
  });

  it("回归：自定义场景进入后，面板直接显示步骤讲述界面（不能停在挑选页）", () => {
    act(() => { saveWorkCondition("甲"); });
    act(() => {
      const d = store.get().diagram;
      d.nodes.find((n) => n.id === COLD_VALVE)!.valveState = "open";
    });
    act(() => { saveWorkCondition("乙"); });
    let id: string | null = null;
    act(() => { id = createCustomScenarioFromConditions(["甲", "乙"], "zh"); });
    act(() => { enterScenario(id!, 0); });
    // 模拟面板在场景已激活时渲染（真实入口：工具栏「演示」打开）
    const view = render(<LangProvider><ScenarioPanel onClose={() => { /* noop */ }} /></LangProvider>);
    expect(view.container.textContent).toContain("上一步");
    expect(view.container.textContent).toContain("下一步");
    expect(view.container.textContent).not.toContain("选择一个场景");
  });

  it("自定义演示可重命名、增删替换重排步骤，步骤仍引用完整工况", () => {
    store.get().diagram.pipes[0].fluidType = "coldWater";
    store.get().diagram.pipes[0].teachingOverride = "flow";
    act(() => { saveWorkCondition("A"); });
    store.get().diagram.pipes[0].fluidType = "hotWater";
    store.get().diagram.pipes[0].teachingOverride = "stop";
    act(() => { saveWorkCondition("B"); });
    let id: string | null = null;
    act(() => { id = createCustomScenarioFromConditions(["A", "B"], "zh", "旧名称"); });
    act(() => {
      expect(updateCustomScenario(id!, "冲煮与清洗", [
        { conditionName: "B", title: "先清洗" },
        { conditionName: "A", title: "再冲煮" },
        { conditionName: "B", title: "再次清洗" },
      ], "zh")).toBe(true);
    });
    const scene = getScenario(id!, store.get().diagram)!;
    expect(scene.title).toBe("冲煮与清洗");
    expect(scene.steps.map((step) => step.conditionName)).toEqual(["B", "A", "B"]);
    expect(scene.steps.map((step) => step.title)).toEqual(["先清洗", "再冲煮", "再次清洗"]);
    act(() => { enterScenario(id!, 1); });
    expect(store.get().diagram.pipes[0]).toMatchObject({ fluidType: "coldWater", teachingOverride: "flow" });
    act(() => { setScenarioStep(0); });
    expect(store.get().diagram.pipes[0]).toMatchObject({ fluidType: "hotWater", teachingOverride: "stop" });
    act(() => { renameWorkCondition("B", "清洗B"); });
    expect(getScenario(id!, store.get().diagram)?.steps.filter((step) => step.conditionName === "清洗B")).toHaveLength(2);
  });

  it("面板可进入编辑器并增加步骤", () => {
    act(() => { saveWorkCondition("A"); });
    act(() => { saveWorkCondition("B"); });
    let id: string | null = null;
    act(() => { id = createCustomScenarioFromConditions(["A", "B"], "zh", "可编辑演示"); });
    const view = render(<LangProvider><ScenarioPanel onClose={() => undefined} /></LangProvider>);
    const edit = view.container.querySelector('[title="编辑步骤"]')!;
    act(() => { fireEvent.click(edit); });
    expect(view.container.textContent).toContain("编辑自定义演示");
    expect(view.container.querySelectorAll(".scenario-edit-step")).toHaveLength(2);
    act(() => { fireEvent.click(view.container.querySelector(".scenario-add-step")!); });
    expect(view.container.querySelectorAll(".scenario-edit-step")).toHaveLength(3);
    expect(getScenario(id!, store.get().diagram)?.title).toBe("可编辑演示");
  });
});
