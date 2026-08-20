import { describe, it, expect } from "vitest";
import { createSampleDiagram, createMinimalBrewDiagram } from "../sample";
import { setCachedPipes, pipeEffectiveDisabled } from "../geometry";
import { store, loadDiagram, updateDiagram, saveWorkCondition, applyWorkCondition, deleteWorkCondition, listWorkConditions } from "../store";

describe("启动默认最简图", () => {
  it("createSampleDiagram 返回三元件：水泵→冲泡缸→咖啡出口", () => {
    const d = createSampleDiagram();
    expect(d.nodes.map((n) => n.type)).toEqual(["pump", "brewChamber", "coffeeOutlet"]);
    expect(d.nodes.map((n) => n.label)).toEqual(["水泵", "冲泡缸", "咖啡出口"]);
    expect(d.pipes.length).toBe(2);
  });

  it("最简图全链流动（泵开）", () => {
    const d = createMinimalBrewDiagram();
    setCachedPipes(d.pipes, d.nodes);
    expect(d.nodes.find((n) => n.type === "pump")?.pumpOn).toBe(true);
    for (const p of d.pipes) {
      expect(pipeEffectiveDisabled(p, d.nodes), `管路 ${p.label} 应流动`).toBe(false);
    }
  });

  it("应用启动为空白图（0 元件，用户要求打开即空白）", () => {
    const d = store.get().diagram;
    expect(d.nodes.length).toBe(0);
    expect(d.pipes.length).toBe(0);
  });
});

describe("工况面板数据流（无 UI 逻辑）", () => {
  it("最简图上保存/应用/删除工况", () => {
    loadDiagram(createMinimalBrewDiagram());
    const pumpId = store.get().diagram.nodes.find((n) => n.type === "pump")!.id;
    updateDiagram((d) => { d.nodes.find((n) => n.id === pumpId)!.pumpOn = false; }); // 停泵
    saveWorkCondition("泵停");
    updateDiagram((d) => { d.nodes.find((n) => n.id === pumpId)!.pumpOn = true; }); // 开泵
    applyWorkCondition("泵停"); // 恢复停泵
    expect(store.get().diagram.nodes.find((n) => n.id === pumpId)?.pumpOn).toBe(false);
    expect(listWorkConditions().some((c) => c.name === "泵停")).toBe(true);
    deleteWorkCondition("泵停");
    expect(listWorkConditions().length).toBe(0);
  });
});
