import { describe, it, expect } from "vitest";
import { parseDiagramJSON } from "../export";
import { pipeEngineeringDisabled, pipeSupplyBlocked, setCachedPipes } from "../geometry";
import { applyStates, snapshotStates } from "../presets";
import { traceStopCause } from "../advice";
import type { Diagram } from "../types";

type RawNode = Record<string, unknown> & { id: string; type: string; label: string; ports: Array<Record<string, unknown>> };
const node = (id: string, type: string, label: string, ports: Array<[string, string, string]>, extra: Record<string, unknown> = {}): RawNode => ({
  id, type, label, x: 0, y: 0, w: 40, h: 40,
  ports: ports.map(([pid, position, direction]) => ({ id: pid, nodeId: id, position, direction })),
  ...extra,
});
const pipe = (id: string, fromPortId: string, toPortId: string, label = id, fluidType = "coldWater") => ({
  id, label, fluidType, fromPortId, toPortId, points: [],
});
const build = (nodes: RawNode[], pipes: ReturnType<typeof pipe>[]): Diagram => {
  const d = parseDiagramJSON(JSON.stringify({ nodes, pipes }));
  setCachedPipes(d.pipes, d.nodes); // 与真实加载一致，避免跨测试复用旧派生缓存
  return d;
};

/** 奶路最小复刻：储液罐 → 三通 → 奶泵 → 出口；三通底部接「空气入口→脉冲阀(禁用)→单向阀」旁支。 */
function milkWithDisabledAirBranch(): Diagram {
  return build(
    [
      node("TANK", "tank", "奶罐", [["TANKo", "top", "out"]]),
      node("J", "tee", "奶泵前汇流三通", [["Jl", "left", "bidirectional"], ["Jr", "right", "bidirectional"], ["Jb", "bottom", "bidirectional"]]),
      node("AIR", "inlet", "空气入口", [["AIRo", "right", "out"]]),
      node("AV", "pulseAirValve", "脉冲空气电磁阀", [["AVi", "left", "in"], ["AVo", "right", "out"]], { disabled: true }),
      node("CV", "checkValve", "空气单向阀", [["CVi", "left", "in"], ["CVo", "right", "out"]]),
      node("P", "milkPump", "奶泵", [["Pi", "left", "in"], ["Po", "right", "out"]], { pumpOn: true }),
      node("OUT", "milkOutlet", "牛奶出口", [["OUTi", "left", "in"]]),
    ],
    [
      pipe("p_main", "TANKo", "Jl", "罐→三通", "coldMilk"),
      pipe("p_air1", "AIRo", "AVi", "空气入口→脉冲阀", "air"),
      pipe("p_air2", "AVo", "CVi", "脉冲阀→单向阀", "air"),
      pipe("p_air3", "CVo", "Jb", "单向阀→三通", "air"),
      pipe("p_suck", "Jr", "Pi", "三通→奶泵", "coldMilk"),
      pipe("p_out", "Po", "OUTi", "奶泵→出口", "coldMilk"),
    ]
  );
}

describe("脉冲空气阀开/关", () => {
  it("关闭脉冲空气阀只停空气支路，奶路仍然流动", () => {
    const d = milkWithDisabledAirBranch();
    const av = d.nodes.find((n) => n.type === "pulseAirValve")!;
    av.disabled = false;
    av.valveState = "closed";
    setCachedPipes(d.pipes, d.nodes);
    const byId = (id: string) => d.pipes.find((p) => p.id === id)!;
    expect(pipeEngineeringDisabled(byId("p_air1"), d.nodes)).toBe(true);
    expect(pipeEngineeringDisabled(byId("p_air2"), d.nodes)).toBe(true);
    expect(pipeEngineeringDisabled(byId("p_air3"), d.nodes)).toBe(true);
    expect(pipeEngineeringDisabled(byId("p_main"), d.nodes)).toBe(false);
    expect(pipeEngineeringDisabled(byId("p_suck"), d.nodes)).toBe(false);
    expect(pipeEngineeringDisabled(byId("p_out"), d.nodes)).toBe(false);
    const cause = traceStopCause(byId("p_air2"), d);
    expect(cause.reason).toContain("脉冲空气阀");
    expect(cause.reason).toContain("关闭");
  });

  it("打开脉冲空气阀时空气支路导通", () => {
    const d = milkWithDisabledAirBranch();
    const av = d.nodes.find((n) => n.type === "pulseAirValve")!;
    av.disabled = false;
    av.valveState = "open";
    setCachedPipes(d.pipes, d.nodes);
    const byId = (id: string) => d.pipes.find((p) => p.id === id)!;
    expect(pipeEngineeringDisabled(byId("p_air1"), d.nodes)).toBe(false);
    expect(pipeEngineeringDisabled(byId("p_air2"), d.nodes)).toBe(false);
    expect(pipeEngineeringDisabled(byId("p_air3"), d.nodes)).toBe(false);
    expect(pipeEngineeringDisabled(byId("p_main"), d.nodes)).toBe(false);
  });

  it("工况快照保存并恢复脉冲空气阀开关", () => {
    const d = milkWithDisabledAirBranch();
    const av = d.nodes.find((n) => n.type === "pulseAirValve")!;
    av.disabled = false;
    av.valveState = "closed";
    const snap = snapshotStates(d);
    expect(snap[av.id]).toEqual({ valveState: "closed" });
    applyStates(d, { [av.id]: { valveState: "open" } });
    expect(av.valveState).toBe("open");
  });
});

describe("工程禁用旁支止于汇流点", () => {
  it("禁用脉冲空气阀只断空气支路，奶路仍然流动", () => {
    const d = milkWithDisabledAirBranch();
    const byId = (id: string) => d.pipes.find((p) => p.id === id)!;
    expect(pipeEngineeringDisabled(byId("p_main"), d.nodes)).toBe(false);
    expect(pipeEngineeringDisabled(byId("p_suck"), d.nodes)).toBe(false);
    expect(pipeEngineeringDisabled(byId("p_out"), d.nodes)).toBe(false);
    expect(pipeEngineeringDisabled(byId("p_air1"), d.nodes)).toBe(true);
    expect(pipeEngineeringDisabled(byId("p_air2"), d.nodes)).toBe(true);
    expect(pipeEngineeringDisabled(byId("p_air3"), d.nodes)).toBe(true);
  });

  it("串联的禁用元件仍会切断它所在的整条支路", () => {
    const d = build(
      [
        node("TANK", "tank", "奶罐", [["TANKo", "top", "out"]]),
        node("V", "solenoid2", "禁用阀", [["Vi", "left", "in"], ["Vo", "right", "out"]], { disabled: true }),
        node("OUT", "milkOutlet", "牛奶出口", [["OUTi", "left", "in"]]),
      ],
      [pipe("p1", "TANKo", "Vi"), pipe("p2", "Vo", "OUTi")]
    );
    expect(pipeEngineeringDisabled(d.pipes[0], d.nodes)).toBe(true);
    expect(pipeEngineeringDisabled(d.pipes[1], d.nodes)).toBe(true);
    expect(traceStopCause(d.pipes[0], d).reason).toContain("禁用阀");
  });
});

describe("为什么停流：汇流点归因", () => {
  it("主路有液、下游全关时，不把关闭的旁支阀当根因", () => {
    const d = build(
      [
        node("TANK", "tank", "奶罐", [["TANKo", "top", "out"]]),
        node("J", "tee", "三通", [["Jl", "left", "bidirectional"], ["Jr", "right", "bidirectional"], ["Jb", "bottom", "bidirectional"]]),
        node("SV", "solenoid2", "旁支清洗阀", [["SVi", "left", "in"], ["SVo", "right", "out"]], { valveState: "closed" }),
        node("DV", "solenoid2", "下游出口阀", [["DVi", "left", "in"], ["DVo", "right", "out"]], { valveState: "closed" }),
        node("OUT", "milkOutlet", "牛奶出口", [["OUTi", "left", "in"]]),
      ],
      [
        pipe("p_main", "TANKo", "Jl"),
        pipe("p_side", "SVo", "Jb"),
        pipe("p3", "Jr", "DVi"),
        pipe("p4", "DVo", "OUTi"),
      ]
    );
    const p3 = d.pipes.find((p) => p.id === "p3")!;
    expect(pipeSupplyBlocked(p3, d.nodes)).toBe(false); // 奶罐这一路仍有液
    expect(pipeEngineeringDisabled(p3, d.nodes)).toBe(true); // 但下游出口阀关着，没有去处
    const cause = traceStopCause(p3, d);
    expect(cause.reason).toContain("下游");
    expect(cause.reason).not.toContain("旁支清洗阀");
  });

  it("所有来路都断时汇总所有根因，而不是只报第一条", () => {
    const d = build(
      [
        node("TANK1", "tank", "奶罐A", [["T1o", "top", "out"]]),
        node("TANK2", "tank", "奶罐B", [["T2o", "top", "out"]]),
        node("V1", "solenoid2", "进奶阀A", [["V1i", "left", "in"], ["V1o", "right", "out"]], { valveState: "closed" }),
        node("V2", "solenoid2", "进奶阀B", [["V2i", "left", "in"], ["V2o", "right", "out"]], { valveState: "closed" }),
        node("J", "tee", "汇流三通", [["Jl", "left", "bidirectional"], ["Jr", "right", "bidirectional"], ["Jb", "bottom", "bidirectional"]]),
        node("OUT", "milkOutlet", "牛奶出口", [["OUTi", "left", "in"]]),
      ],
      [
        pipe("p1", "T1o", "V1i"),
        pipe("p2", "V1o", "Jl"),
        pipe("p3", "T2o", "V2i"),
        pipe("p4", "V2o", "Jb"),
        pipe("p5", "Jr", "OUTi"),
      ]
    );
    const cause = traceStopCause(d.pipes.find((p) => p.id === "p5")!, d);
    expect(cause.reason).toContain("进奶阀A");
    expect(cause.reason).toContain("进奶阀B");
    expect(cause.reason).toContain("2 处阻断");
  });

  it("储液罐出液管不再报「上游无供液」", () => {
    const d = build(
      [
        node("TANK", "tank", "奶罐", [["TANKo", "top", "out"]]),
        node("V", "solenoid2", "出口阀", [["Vi", "left", "in"], ["Vo", "right", "out"]], { valveState: "closed" }),
        node("OUT", "milkOutlet", "牛奶出口", [["OUTi", "left", "in"]]),
      ],
      [pipe("p1", "TANKo", "Vi"), pipe("p2", "Vo", "OUTi")]
    );
    const cause = traceStopCause(d.pipes.find((p) => p.id === "p1")!, d);
    expect(cause.reason).not.toContain("没有接入任何供液管");
    expect(cause.reason).toContain("下游");
  });
});
