/**
 * P1 质量测试组：
 * - MachinePack：构建/解析/错误信息友好化/往返一致
 * - Schema 校验与迁移注册表：坏图纸给出可理解错误；v1/v2 迁移到 v3
 * - setCachedPipes 缓存失效回归：阀位变更后引擎结果立即更新
 */
import { describe, it, expect } from "vitest";
import { buildMachinePack, parseMachinePack, MACHINE_PACK_FORMAT } from "../machinePack";
import { validateDiagramShape, migrateDiagramToCurrent, parseDiagramJSON } from "../export";
import { pipeEffectiveDisabled, setCachedPipes } from "../geometry";
import { patchNode, loadDiagram, store } from "../store";
import type { Diagram } from "../types";
import bcmtsRaw from "../../BCMTS.json";

function mini(): Diagram {
  return {
    id: "m1",
    name: "Mini",
    nodes: [
      { id: "t", type: "tank", label: "Tank", x: 0, y: 0, width: 80, height: 80, rotation: 0, fill: "#fff", stroke: "#000", ports: [{ id: "tp", nodeId: "t", position: "right", direction: "out" }] },
      { id: "o", type: "outlet", label: "Out", x: 200, y: 0, width: 60, height: 60, rotation: 0, fill: "#fff", stroke: "#000", ports: [{ id: "op", nodeId: "o", position: "left", direction: "in" }] },
    ],
    pipes: [ { id: "pp", label: "P", fromPortId: "tp", toPortId: "op", points: [], fluidType: "coldWater", direction: "forward" } as never ],
    settings: { showGrid: true, background: "#fff", globalAnimationPlaying: false },
  };
}

describe("MachinePack", () => {
  it("构建：包含 format/version/meta/diagram", () => {
    const d = mini();
    const pack = buildMachinePack(d, { title: "BCMTS" });
    expect(pack.format).toBe(MACHINE_PACK_FORMAT);
    expect(pack.version).toBe(1);
    expect(pack.meta.title).toBe("BCMTS");
    expect(pack.meta.appVersion).toBeTruthy();
    expect(pack.diagram.id).toBe("m1");
  });

  it("解析：往返一致", () => {
    const d = mini();
    const pack = buildMachinePack(d, { title: "Round" });
    const parsed = parseMachinePack(JSON.stringify(pack));
    expect(parsed.meta.title).toBe("Round");
    expect(parsed.diagram.nodes.length).toBe(d.nodes.length);
    expect(parsed.diagram.pipes.length).toBe(d.pipes.length);
  });

  it("解析：缺少 format 给出可理解错误", () => {
    expect(() => parseMachinePack(JSON.stringify({ nodes: [], pipes: [] }))).toThrow(/format/);
  });

  it("解析：版本过新给出升级提示", () => {
    const pack = { ...buildMachinePack(mini()), version: 99 };
    expect(() => parseMachinePack(JSON.stringify(pack))).toThrow(/版本过新/);
  });

  it("解析：缺少 diagram 给出可理解错误", () => {
    expect(() => parseMachinePack(JSON.stringify({ format: MACHINE_PACK_FORMAT, version: 1 }))).toThrow(/diagram/);
  });

  it("BCMTS 机型包往返", () => {
    const d = parseDiagramJSON(JSON.stringify(bcmtsRaw));
    const pack = buildMachinePack(d, { title: "CAYE (BCMTS)", description: "四功能全自动咖啡机" });
    const parsed = parseMachinePack(JSON.stringify(pack));
    expect(parsed.meta.title).toBe("CAYE (BCMTS)");
    expect(parsed.diagram.pipes.length).toBe(d.pipes.length);
    expect((parsed.diagram.settings.validationCases ?? []).length).toBe((d.settings.validationCases ?? []).length);
  });
});

describe("Schema 校验与迁移注册表", () => {
  it("合法图纸通过校验", () => {
    expect(validateDiagramShape(mini())).toEqual([]);
  });

  it("缺 nodes/pipes 与节点 id 缺失给出可读错误", () => {
    const errs = validateDiagramShape({ pipes: [], nodes: [{ type: "pump", x: 0, y: 0 }] });
    expect(errs.some((e) => e.includes("nodes"))).toBe(true);
    const errs2 = validateDiagramShape({});
    expect(errs2.join()).toContain("nodes");
    expect(errs2.join()).toContain("pipes");
  });

  it("迁移注册表：v1 图纸逐级迁移到 v3", () => {
    const old = { _version: 1, nodes: [], pipes: [] } as Record<string, unknown>;
    const applied = migrateDiagramToCurrent(old);
    expect(applied.length).toBe(2);
    expect(old._version).toBe(3);
    expect(applied[0]).toContain("v1→v2");
    expect(applied[1]).toContain("v2→v3");
  });

  it("parseDiagramJSON 拒绝坏图纸并给出可理解信息", () => {
    expect(() => parseDiagramJSON('{"foo": 1}')).toThrow(/不是有效的 FluidPath 工程文件/);
  });
});

describe("setCachedPipes 缓存失效回归", () => {
  it("store.patchNode 改阀位后引擎立即反映新状态（缓存不陈旧）", () => {
    const d = parseDiagramJSON(JSON.stringify(bcmtsRaw));
    loadDiagram(d);
    // 找一个两通阀与其下游管
    const valve = d.nodes.find((n) => n.type === "solenoid2")!;
    const pipeThrough = d.pipes.find((p) => {
      const from = valve.ports.find((pp) => pp.id === p.fromPortId);
      return from && from.direction === "out";
    })!;
    expect(pipeThrough).toBeTruthy();
    // 先让阀关：下游应停
    act(() => patchNode(valve.id, { valveState: "closed" }));
    const d1 = store.get().diagram;
    setCachedPipes(d1.pipes, d1.nodes);
    const p1 = d1.pipes.find((p) => p.id === pipeThrough.id)!;
    expect(pipeEffectiveDisabled(p1, d1.nodes)).toBe(true);
    // 再开：下游应流（若缓存未失效会误判为停）
    act(() => patchNode(valve.id, { valveState: "open" }));
    const d2 = store.get().diagram;
    setCachedPipes(d2.pipes, d2.nodes);
    const p2 = d2.pipes.find((p) => p.id === pipeThrough.id)!;
    expect(pipeEffectiveDisabled(p2, d2.nodes)).toBe(false);
  });
});

// 最小 act 垫片（避免引入 react-dom/test-utils）
function act(fn: () => void) {
  fn();
}
