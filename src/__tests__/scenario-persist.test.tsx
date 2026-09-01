/**
 * v1.21 演示微调持久化测试：
 * - 保存到本步：写入 settings.scenarioOverrides，随图纸持久化（JSON 往返）
 * - 「从此步生效」：step >= N 应用，step < N 不应用
 * - 重进场景/退出重进：已保存微调自动生效
 * - 清除已保存微调
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { LangProvider } from "../i18n";
import App from "../App";
import { loadDiagram, store, enterScenario, setScenarioStep, exitScenario, overrideScenarioNode, saveScenarioOverridesToStep, clearSavedScenarioStep } from "../store";
import bcmtsRaw from "../../BCMTS.json";
import { parseDiagramJSON } from "../export";

function toDiagram(json: any) {
  return {
    ...json,
    settings: { showGrid: true, background: "#eef2f7", globalAnimationPlaying: false, crossoverHops: true, layers: [{ id: "l", name: "默认层", visible: true }], ...json.settings },
  };
}

const COLD_VALVE = "n_ms7jyyn0kfcobx"; // 常温水两通电磁阀（coffee 场景不涉及）

beforeEach(() => {
  try { localStorage.setItem("fluidpath.lang", "zh"); } catch { /* ignore */ }
  render(<LangProvider><App /></LangProvider>);
  act(() => { loadDiagram(toDiagram(bcmtsRaw)); });
});

describe("演示微调持久化", () => {
  it("保存到本步：写入 settings 且清空叠加层", () => {
    act(() => { enterScenario("coffee", 1); });
    act(() => { overrideScenarioNode(COLD_VALVE, { valveState: "open" }); });
    let n = 0;
    act(() => { n = saveScenarioOverridesToStep(1); });
    expect(n).toBe(1);
    const saved = store.get().diagram.settings.scenarioOverrides!["coffee"][1];
    expect(saved[COLD_VALVE]?.valveState).toBe("open");
    expect(Object.keys(store.get().ui.scenario?.overrides ?? {}).length).toBe(0);
  });

  it("「从此步生效」：step >= N 应用，step < N 不应用", () => {
    act(() => { enterScenario("coffee", 1); });
    act(() => { overrideScenarioNode(COLD_VALVE, { valveState: "open" }); });
    act(() => { saveScenarioOverridesToStep(1); });
    // step 0（保存步之前）：不应用
    act(() => { setScenarioStep(0); });
    expect(store.get().diagram.nodes.find((n) => n.id === COLD_VALVE)!.valveState).toBe("closed");
    // step 1：应用
    act(() => { setScenarioStep(1); });
    expect(store.get().diagram.nodes.find((n) => n.id === COLD_VALVE)!.valveState).toBe("open");
    // step 2：继续应用
    act(() => { setScenarioStep(2); });
    expect(store.get().diagram.nodes.find((n) => n.id === COLD_VALVE)!.valveState).toBe("open");
  });

  it("退出重进：已保存微调自动生效（跨会话模拟）", () => {
    act(() => { enterScenario("coffee", 1); });
    act(() => { overrideScenarioNode(COLD_VALVE, { valveState: "open" }); });
    act(() => { saveScenarioOverridesToStep(1); });
    const json = JSON.stringify(store.get().diagram); // 模拟保存/刷新
    act(() => { exitScenario(); });
    act(() => { loadDiagram(parseDiagramJSON(json)); });
    act(() => { enterScenario("coffee", 2); });
    expect(store.get().diagram.nodes.find((n) => n.id === COLD_VALVE)!.valveState).toBe("open");
  });

  it("清除已保存微调：恢复场景预设", () => {
    act(() => { enterScenario("coffee", 1); });
    act(() => { overrideScenarioNode(COLD_VALVE, { valveState: "open" }); });
    act(() => { saveScenarioOverridesToStep(1); });
    act(() => { clearSavedScenarioStep(1); });
    act(() => { setScenarioStep(1); });
    expect(store.get().diagram.nodes.find((n) => n.id === COLD_VALVE)!.valveState).toBe("closed");
    expect(store.get().diagram.settings.scenarioOverrides?.["coffee"]?.[1]).toBeUndefined();
  });

  it("JSON 往返：scenarioOverrides 随图纸保留", () => {
    act(() => { enterScenario("coffee", 1); });
    act(() => { overrideScenarioNode(COLD_VALVE, { valveState: "open" }); });
    act(() => { saveScenarioOverridesToStep(1); });
    const json = JSON.stringify(store.get().diagram);
    const back = parseDiagramJSON(json);
    expect(back.settings.scenarioOverrides?.["coffee"]?.[1]?.[COLD_VALVE]?.valveState).toBe("open");
  });
});
