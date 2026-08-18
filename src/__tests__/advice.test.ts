import { describe, it, expect } from "vitest";
import { collectAdvice } from "../advice";
import { createSemiAutoMachineDiagram } from "../sample";
import { loadDiagram, store, applyFix } from "../store";
import { checkDiagramFluid } from "../fluidRules";

describe("智能诊断建议引擎", () => {
  it("检测热水锅炉进水的介质冲突并给出修复建议", () => {
    const d = createSemiAutoMachineDiagram();
    const pipe = d.pipes.find((p) => p.label === "冲泡锅炉进水");
    if (pipe) pipe.fluidType = "steam";
    const advices = collectAdvice(d);
    const hit = advices.find((a) => a.title === "介质冲突" && a.fix?.type === "setFluid");
    expect(hit).toBeTruthy();
    expect(hit?.fixLabel).toContain("常温水");
  });

  it("检测泵停止", () => {
    const d = createSemiAutoMachineDiagram();
    const pump = d.nodes.find((n) => n.type === "pump");
    if (pump) pump.pumpOn = false;
    const advices = collectAdvice(d);
    expect(advices.some((a) => a.title === "泵未运行" && a.fix?.type === "startPump")).toBe(true);
  });

  it("applyFix 修复介质冲突后冲突消失", () => {
    const d = createSemiAutoMachineDiagram();
    const pipe = d.pipes.find((p) => p.label === "冲泡锅炉进水");
    if (pipe) pipe.fluidType = "steam";
    loadDiagram(d);

    const advices = collectAdvice(store.get().diagram);
    const fix = advices.find((a) => a.fix?.type === "setFluid")!;
    applyFix(fix.fix!);

    // 修复后该管路介质冲突消失
    const stillConflicted = checkDiagramFluid(store.get().diagram).has(pipe!.id);
    expect(stillConflicted).toBe(false);
  });

  it("检测孤立元件并建议删除", () => {
    const d = createSemiAutoMachineDiagram();
    // 追加一个孤立泵
    d.nodes.push({
      id: "orphan", type: "pump", label: "孤泵", x: 0, y: 0, width: 80, height: 80, rotation: 0, fill: "#fff", stroke: "#000",
      ports: [{ id: "op", nodeId: "orphan", position: "right", direction: "out" }],
    });
    const advices = collectAdvice(d);
    expect(advices.some((a) => a.title === "孤立元件" && a.fix?.type === "deleteNode")).toBe(true);
  });
});
