import { describe, it, expect } from "vitest";
import { saveWorkCondition, applyWorkCondition, deleteWorkCondition, renameWorkCondition, listWorkConditions, loadDiagram, store } from "../store";
import { parseDiagramJSON } from "../export";
import { diffStateIds } from "../presets";
import bcmtsRaw from "../../BCMTS.json";
import type { Diagram } from "../types";

const toDiagram = (json: any): Diagram => JSON.parse(JSON.stringify(json)) as Diagram;

describe("工况快照", () => {
  it("保存 → 修改阀位 → 应用工况还原阀位", () => {
    loadDiagram(toDiagram(bcmtsRaw));
    // 摆一个明确的阀位组合：奶泵开、进奶阀开、清洗三通 off
    applyWorkCondition("__none__"); // 空操作保护（不存在时无副作用）
    let d = store_diagram();
    d.nodes.find((n) => n.id === "n_msvz8pbq71ca")!.pumpOn = true;
    d.nodes.find((n) => n.id === "n_ms92b8rm798rfd")!.valveState = "open";
    d.nodes.find((n) => n.id === "n_ms91xxps4wsawx")!.valvePath = "off";
    saveWorkCondition("做咖啡测试");

    // 改成另一组
    d = store_diagram();
    d.nodes.find((n) => n.id === "n_msvz8pbq71ca")!.pumpOn = false;
    d.nodes.find((n) => n.id === "n_ms91xxps4wsawx")!.valvePath = "A";

    applyWorkCondition("做咖啡测试");
    const after = store_diagram();
    expect(after.nodes.find((n) => n.id === "n_msvz8pbq71ca")?.pumpOn).toBe(true);
    expect(after.nodes.find((n) => n.id === "n_ms92b8rm798rfd")?.valveState).toBe("open");
    expect(after.nodes.find((n) => n.id === "n_ms91xxps4wsawx")?.valvePath).toBe("off");

    deleteWorkCondition("做咖啡测试");
    expect(listWorkConditions().some((c) => c.name === "做咖啡测试")).toBe(false);
  });

  it("工况随图纸 settings 保存", () => {
    loadDiagram(toDiagram(bcmtsRaw));
    saveWorkCondition("清洗测试");
    const d = store_diagram();
    expect(d.settings.workConditions?.some((c) => c.name === "清洗测试")).toBe(true);
    deleteWorkCondition("清洗测试");
  });
});

function store_diagram(): Diagram {
  return store.get().diagram;
}

describe("状态差异对比", () => {
  it("diffStateIds 只返回发生变化的节点", () => {
    const prev = { p1: { pumpOn: true }, v1: { valveState: "open" as const }, v2: { valvePath: "A" as const } };
    const next = { p1: { pumpOn: false }, v1: { valveState: "open" as const }, v2: { valvePath: "A" as const } };
    expect(diffStateIds(prev, next)).toEqual(["p1"]);
    expect(diffStateIds(prev, prev)).toEqual([]);
  });
});

describe("工况随 JSON/分享码持久化", () => {
  it("导出 JSON 再导入后工况仍在", () => {
    loadDiagram(toDiagram(bcmtsRaw));
    saveWorkCondition("做咖啡");
    // 模拟导出（JSON.stringify 即 exportJSON 的序列化方式）
    const json = JSON.stringify(store.get().diagram);
    // 模拟导入（parseDiagramJSON 即加载流程）
    const reopened = parseDiagramJSON(json);
    expect(reopened.settings.workConditions?.some((c: any) => c.name === "做咖啡")).toBe(true);
    // 加载后 listWorkConditions 可见
    loadDiagram(reopened);
    expect(listWorkConditions().some((c) => c.name === "做咖啡")).toBe(true);
    deleteWorkCondition("做咖啡");
  });
});

describe("工况重命名（自定义命名）", () => {
  it("重命名成功；重名/无效/同名拒绝", () => {
    loadDiagram(toDiagram(bcmtsRaw));
    saveWorkCondition("冲煮");
    saveWorkCondition("清洗");
    expect(renameWorkCondition("冲煮", "做美式")).toBe(true);
    const names = listWorkConditions().map((c) => c.name);
    expect(names).toContain("做美式");
    expect(names).not.toContain("冲煮");
    // 重名/空名/同名拒绝
    expect(renameWorkCondition("做美式", "清洗")).toBe(false);
    expect(renameWorkCondition("做美式", "  ")).toBe(false);
    expect(renameWorkCondition("做美式", "做美式")).toBe(false);
    deleteWorkCondition("做美式");
    deleteWorkCondition("清洗");
  });
});

describe("工况快照扩展：管路介质以当前设置为准", () => {
  it("保存含介质的工况 → 改介质 → 应用工况后介质一并还原", () => {
    loadDiagram(toDiagram(bcmtsRaw));
    const d0 = store_diagram();
    const pipe = d0.pipes[0];
    pipe.fluidType = "coldWater";
    pipe.fluidColor = "#2f7fd6";
    saveWorkCondition("介质A");
    // 改成另一种介质 + 颜色
    const d1 = store_diagram();
    d1.pipes[0].fluidType = "hotWater";
    d1.pipes[0].fluidColor = "#e8890c";
    applyWorkCondition("介质A");
    const after = store_diagram();
    expect(after.pipes[0].fluidType).toBe("coldWater");
    expect(after.pipes[0].fluidColor).toBe("#2f7fd6");
    deleteWorkCondition("介质A");
  });

  it("仅介质变化时：切换工况仍会高亮变化的管路", () => {
    loadDiagram(toDiagram(bcmtsRaw));
    const d0 = store_diagram();
    d0.pipes[0].fluidType = "coldWater";
    saveWorkCondition("甲");
    const d1 = store_diagram();
    d1.pipes[0].fluidType = "hotWater";
    applyWorkCondition("甲");
    const blinkIds = store.get().ui.blink?.ids ?? [];
    expect(blinkIds).toContain(store_diagram().pipes[0].id);
    deleteWorkCondition("甲");
  });

  it("完整快照恢复教学显示覆盖、工程状态、元器件属性与画布显示设置", () => {
    loadDiagram(toDiagram(bcmtsRaw));
    const before = store_diagram();
    const pump = before.nodes.find((node) => node.type === "pump")!;
    const pipe = before.pipes[0];
    pump.label = "工况 A 泵";
    pump.displayDisabled = true;
    pipe.fluidType = "coldWater";
    pipe.fluidColor = "#2f7fd6";
    pipe.teachingOverride = "flow";
    pipe.disabled = false;
    before.settings.showPipeLabels = true;
    before.settings.showFluidColors = true;
    saveWorkCondition("完整A");

    const changed = store_diagram();
    changed.nodes.find((node) => node.id === pump.id)!.label = "已修改";
    changed.nodes.find((node) => node.id === pump.id)!.displayDisabled = false;
    changed.pipes[0].fluidType = "hotWater";
    changed.pipes[0].fluidColor = "#e8890c";
    changed.pipes[0].teachingOverride = "stop";
    changed.pipes[0].disabled = true;
    changed.settings.showPipeLabels = false;
    changed.settings.showFluidColors = false;

    applyWorkCondition("完整A");
    const restored = store_diagram();
    expect(restored.nodes.find((node) => node.id === pump.id)?.label).toBe("工况 A 泵");
    expect(restored.nodes.find((node) => node.id === pump.id)?.displayDisabled).toBe(true);
    expect(restored.pipes[0]).toMatchObject({ fluidType: "coldWater", fluidColor: "#2f7fd6", teachingOverride: "flow", disabled: false });
    expect(restored.settings.showPipeLabels).toBe(true);
    expect(restored.settings.showFluidColors).toBe(true);
    expect(restored.settings.workConditions?.find((condition) => condition.name === "完整A")?.pipeProperties?.[pipe.id]?.teachingOverride).toBe("flow");
    deleteWorkCondition("完整A");
  });

  it("完整工况不会删除之后新增的图纸对象，也不会改端口绑定", () => {
    loadDiagram(toDiagram(bcmtsRaw));
    saveWorkCondition("结构安全");
    const initialPipe = store_diagram().pipes[0];
    const originalBinding = { from: initialPipe.fromPortId, to: initialPipe.toPortId };
    const d = store_diagram();
    d.nodes.push({ ...d.nodes[0], id: "later-node", label: "Later" });
    d.pipes[0].fromPortId = undefined;
    d.pipes[0].fromPoint = { x: 999, y: 999 };
    applyWorkCondition("结构安全");
    expect(store_diagram().nodes.some((node) => node.id === "later-node")).toBe(true);
    expect(store_diagram().pipes[0].fromPortId).toBeUndefined();
    expect(originalBinding.from).toBeTruthy();
    expect(store_diagram().pipes[0].toPortId).toBe(originalBinding.to);
    deleteWorkCondition("结构安全");
  });
});
