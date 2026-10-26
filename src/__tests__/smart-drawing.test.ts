import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SMART_TEMPLATES, buildSmartTemplate } from "../smart-draw/templates";
import { SMART_BLOCKS } from "../smart-draw/blocks";
import { parseBlockText, parseSmartText } from "../smart-draw/intent";
import { diagnosisSummary } from "../diagnostics";
import { engineeringIssues } from "../smart-draw/engineering";
import { insertSmartDrawing, loadDiagram, store, undo } from "../store";
import { createEmptyDiagram } from "../sample";
import { pipePolyline } from "../geometry";
import type { Diagram } from "../types";

function asDiagram(result: { nodes: any[]; pipes: any[] }): Diagram {
  return { id: "t", name: "t", nodes: result.nodes, pipes: result.pipes, settings: { showGrid: true, background: "#fff", globalAnimationPlaying: false } };
}

beforeEach(() => { loadDiagram(createEmptyDiagram()); });
afterEach(() => { localStorage.clear(); });

describe("智能绘图模板", () => {
  it("六个模板结构合法且无重复 ID", () => {
    for (const template of SMART_TEMPLATES) {
      const result = buildSmartTemplate(template, {});
      expect(result.nodes.length).toBeGreaterThan(2);
      expect(result.pipes.length).toBeGreaterThan(1);
      const ids = [...result.nodes.map((n) => n.id), ...result.pipes.map((p) => p.id)];
      expect(new Set(ids).size).toBe(ids.length);
      const portIds = new Set(result.nodes.flatMap((n) => n.ports.map((p) => p.id)));
      for (const pipe of result.pipes) {
        expect(portIds.has(pipe.fromPortId!)).toBe(true);
        expect(portIds.has(pipe.toPortId!)).toBe(true);
        // 模板允许预填走线点（如安全件泄压管），只需保证折线可用
        expect(pipePolyline(pipe, result.nodes)).toBeTruthy();
      }
      expect(diagnosisSummary(asDiagram(result)).errors).toBe(0);
    }
  });

  it("奶路选项会改变结构（单/双奶罐、蒸汽）", () => {
    const milk = SMART_TEMPLATES.find((t) => t.id === "milk")!;
    const single = buildSmartTemplate(milk, { doubleTank: false, steam: false });
    const full = buildSmartTemplate(milk, { doubleTank: true, steam: true });
    expect(full.nodes.length).toBeGreaterThan(single.nodes.length);
    expect(diagnosisSummary(asDiagram(single)).errors).toBe(0);
    expect(diagnosisSummary(asDiagram(full)).errors).toBe(0);
  });

  it("单锅炉可加蒸汽杆，且仍通过工程检查", () => {
    const coffee = SMART_TEMPLATES.find((t) => t.id === "coffee")!;
    const result = buildSmartTemplate(coffee, { steam: true });
    expect(result.nodes.some((n) => n.type === "steamWand")).toBe(true);
    expect(result.conditions?.some((c) => /蒸汽/.test(c.name))).toBe(true);
    const base = asDiagram(result);
    const diagram = { ...base, settings: { ...base.settings, workConditions: result.conditions } } as Diagram;
    expect(engineeringIssues(diagram)).toHaveLength(0);
  });
});

describe("自由文本解析", () => {
  it("识别双锅炉整机与双奶罐/蒸汽", () => {
    const intent = parseSmartText("双锅炉咖啡机，带两个奶罐、奶泵、蒸汽杆和一条清洗旁通");
    expect(intent.templateId).toBe("full");
    expect(intent.options.doubleTank).toBe(true);
    expect(intent.options.steam).toBe(true);
    expect(intent.understood).toContain("奶路");
    expect(intent.understood).toContain("咖啡冲泡");
  });

  it("识别奶路与咖啡", () => {
    expect(parseSmartText("画一个奶路").templateId).toBe("milk");
    expect(parseSmartText("coffee machine with milk").templateId).toBe("full");
    expect(parseSmartText("基础水路").templateId).toBe("water");
    expect(parseSmartText("即热咖啡机").templateId).toBe("thermoblock");
    expect(parseSmartText("BCMTS 真机骨架").templateId).toBe("dual-boiler");
    const steamCoffee = parseSmartText("咖啡机带蒸汽杆");
    expect(steamCoffee.templateId).toBe("coffee");
    expect(steamCoffee.options.steam).toBe(true);
  });

  it("功能块关键词", () => {
    expect(parseBlockText("加一个清洗旁通")).toBe("cleaning-bypass");
    expect(parseBlockText("加蒸汽杆")).toBe("steam-wand");
    expect(parseBlockText("加一个排废")).toBe("drain");
    expect(parseBlockText("加一段奶路")).toBe("milk-line");
    expect(parseBlockText("加一个压力表")).toBe("pressure-gauge");
    expect(parseBlockText("加一个单向阀")).toBe("check-valve");
    expect(parseBlockText("加一个三通")).toBe("tee");
    expect(parseBlockText("加一个锅炉")).toBe("boiler");
    expect(parseBlockText("加一个水泵")).toBe("pump");
    expect(parseBlockText("随便说点什么")).toBeNull();
  });
});

describe("插入与撤销", () => {
  it("追加模板到当前画布并可一次撤销", () => {
    const before = store.get().diagram.nodes.length;
    const result = buildSmartTemplate(SMART_TEMPLATES.find((t) => t.id === "coffee")!, {});
    const inserted = insertSmartDrawing(result, "append");
    expect(store.get().diagram.nodes.length).toBe(before + result.nodes.length);
    expect(store.get().diagram.pipes.length).toBe(result.pipes.length);
    expect(inserted.nodeIds.length).toBe(result.nodes.length);
    undo();
    expect(store.get().diagram.nodes.length).toBe(before);
    expect(store.get().diagram.pipes.length).toBe(0);
  });

  it("替换模式加载新图", () => {
    const result = buildSmartTemplate(SMART_TEMPLATES.find((t) => t.id === "water")!, {});
    insertSmartDrawing(result, "replace");
    expect(store.get().diagram.nodes.length).toBe(result.nodes.length);
    expect(store.get().diagram.name).toBe("智能绘图");
    expect(store.get().ui.dirty).toBe(true);
  });

  it("带锚点插入功能块会生成连接管", () => {
    const water = buildSmartTemplate(SMART_TEMPLATES.find((t) => t.id === "water")!, {});
    insertSmartDrawing(water, "replace");
    const boiler = store.get().diagram.nodes.find((n) => n.type === "hotWaterBoiler")!;
    const anchor = boiler.ports.find((p) => p.direction === "out")!;
    const block = SMART_BLOCKS.find((b) => b.id === "steam-wand")!;
    const beforePipes = store.get().diagram.pipes.length;
    insertSmartDrawing(block.build(), "append", anchor.id, block.medium);
    expect(store.get().diagram.pipes.length).toBe(beforePipes + block.build().pipes.length + 1);
    const link = store.get().diagram.pipes.find((p) => p.label === "智能连接");
    expect(link?.fromPortId).toBe(anchor.id);
  });
});
