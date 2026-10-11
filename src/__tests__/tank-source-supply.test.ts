import { describe, it, expect } from "vitest";
import { pipeEffectiveDisabled, setCachedPipes } from "../geometry";
import { parseDiagramJSON } from "../export";

/**
 * 储液罐液源回归（2026-10 用户报告）：
 * Smart X BCM2TS 图纸上「奶泵开 + 进奶阀开 + 出口阀开 + 加热阀关」时整条奶路显示停流。
 * 根因：供液递归把 tank 当直通件——罐出侧管要求“入侧有来流”；
 * 该图储液罐入侧仅一根关闭的润湿阀管 → 罐出液管判停 → 连锁到进奶阀、泵吸入、泵出。
 *
 * 语义：储液罐是液源（与需求域 DEMAND_BOUNDARY_TYPES、压力域、知识库一致），
 * 罐出侧管不因入侧全停而判停；是否流动仍由需求域（下游开放去处）与阀门状态决定。
 *
 * 拓扑（镜像 Smart X 奶路主干）：
 *   润湿阀(默认关) → 储液罐(唯一入侧)
 *   储液罐 → 三通 → 进奶阀 → T型三通 → 奶泵 → 出口阀 → 牛奶出口
 */

interface Opts {
  feed: "open" | "closed";
  pump: boolean;
  outletValve: "open" | "closed";
  wet?: "open" | "closed";
}

function buildMilkLine(opts: Opts) {
  const raw = {
    nodes: [
      {
        id: "WET", type: "solenoid2", label: "牛奶常温水润湿阀", x: 0, y: 160, w: 64, h: 40,
        valveState: opts.wet ?? "closed",
        ports: [
          { id: "WET_in", position: "left", direction: "in" },
          { id: "WET_out", position: "right", direction: "out" },
        ],
      },
      {
        id: "T", type: "tank", label: "储液罐", x: 0, y: 0, w: 70, h: 64,
        ports: [
          { id: "T_in", position: "left", direction: "in" },
          { id: "T_out", position: "right", direction: "out" },
        ],
      },
      {
        id: "J1", type: "tee", label: "三通接头", x: 140, y: 0, w: 20, h: 20,
        ports: [
          { id: "J1_l", position: "left", direction: "bidirectional" },
          { id: "J1_r", position: "right", direction: "bidirectional" },
        ],
      },
      {
        id: "FEED", type: "solenoid2", label: "进奶两通电磁阀", x: 220, y: 0, w: 64, h: 40,
        valveState: opts.feed,
        ports: [
          { id: "FEED_in", position: "left", direction: "in" },
          { id: "FEED_out", position: "right", direction: "out" },
        ],
      },
      {
        id: "J2", type: "tee", label: "T型三通", x: 340, y: 0, w: 20, h: 20,
        ports: [
          { id: "J2_l", position: "left", direction: "bidirectional" },
          { id: "J2_r", position: "right", direction: "bidirectional" },
        ],
      },
      {
        id: "PUMP", type: "milkPump", label: "奶泵", x: 400, y: 0, w: 60, h: 60,
        pumpOn: opts.pump,
        ports: [
          { id: "PUMP_in", position: "left", direction: "in" },
          { id: "PUMP_out", position: "right", direction: "out" },
        ],
      },
      {
        id: "V", type: "solenoid2", label: "牛奶出口阀", x: 500, y: 0, w: 64, h: 40,
        valveState: opts.outletValve,
        ports: [
          { id: "V_in", position: "left", direction: "in" },
          { id: "V_out", position: "right", direction: "out" },
        ],
      },
      {
        id: "O", type: "milkOutlet", label: "牛奶出口", x: 620, y: 0, w: 60, h: 60,
        ports: [{ id: "O_in", position: "left", direction: "in" }],
      },
    ],
    pipes: [
      { id: "wet_to_tank", label: "润湿管", fluidType: "coldWater", fromPortId: "WET_out", toPortId: "T_in" },
      { id: "tank_out", label: "储液罐出奶管", fluidType: "coldMilk", fromPortId: "T_out", toPortId: "J1_l" },
      { id: "j1_to_feed", label: "进奶阀前管", fluidType: "coldMilk", fromPortId: "J1_r", toPortId: "FEED_in" },
      { id: "feed_to_j2", label: "进奶阀后管", fluidType: "coldMilk", fromPortId: "FEED_out", toPortId: "J2_l" },
      { id: "j2_to_pump", label: "泵吸入管", fluidType: "coldMilk", fromPortId: "J2_r", toPortId: "PUMP_in" },
      { id: "pump_to_valve", label: "泵排出管", fluidType: "coldMilk", fromPortId: "PUMP_out", toPortId: "V_in" },
      { id: "valve_to_outlet", label: "出口管", fluidType: "coldMilk", fromPortId: "V_out", toPortId: "O_in" },
    ],
  };
  const d = parseDiagramJSON(JSON.stringify(raw));
  setCachedPipes(d.pipes, d.nodes);
  return d;
}

function stateOf(opts: Opts) {
  const d = buildMilkLine(opts);
  const get = (id: string) => {
    const p = d.pipes.find((x) => x.id === id);
    expect(p, `管路 ${id} 应存在`).toBeTruthy();
    return !pipeEffectiveDisabled(p!, d.nodes); // true = 流动
  };
  return {
    wet: get("wet_to_tank"),
    tankOut: get("tank_out"),
    j1ToFeed: get("j1_to_feed"),
    feedToJ2: get("feed_to_j2"),
    suction: get("j2_to_pump"),
    discharge: get("pump_to_valve"),
    toOutlet: get("valve_to_outlet"),
  };
}

describe("储液罐液源：出侧管不因入侧全停而判停", () => {
  it("润湿阀关 + 进奶阀开 + 奶泵开：奶路从储液罐贯通到牛奶出口（用户场景回归）", () => {
    const m = stateOf({ feed: "open", pump: true, outletValve: "open" });
    expect(m.tankOut).toBe(true);
    expect(m.j1ToFeed).toBe(true);
    expect(m.feedToJ2).toBe(true);
    expect(m.suction).toBe(true);
    expect(m.discharge).toBe(true);
    expect(m.toOutlet).toBe(true);
    expect(m.wet).toBe(false); // 润湿阀关闭，润湿管仍停流
  });

  it("需求域兜底：进奶阀关闭时罐出液管与奶路全部停流，不得假流", () => {
    const m = stateOf({ feed: "closed", pump: true, outletValve: "open" });
    expect(m.tankOut).toBe(false);
    expect(m.j1ToFeed).toBe(false);
    expect(m.feedToJ2).toBe(false);
    expect(m.suction).toBe(false);
    expect(m.discharge).toBe(false);
    expect(m.toOutlet).toBe(false);
  });

  it("奶泵关闭：无运行泵需求根，全部停流", () => {
    const m = stateOf({ feed: "open", pump: false, outletValve: "open" });
    expect(m.tankOut).toBe(false);
    expect(m.j1ToFeed).toBe(false);
    expect(m.feedToJ2).toBe(false);
    expect(m.suction).toBe(false);
    expect(m.discharge).toBe(false);
    expect(m.toOutlet).toBe(false);
  });

  it("出口阀关闭：泵上游按“泵在抽”流动，泵排出与出口下游按需求域停流", () => {
    const m = stateOf({ feed: "open", pump: true, outletValve: "closed" });
    expect(m.tankOut).toBe(true);
    expect(m.suction).toBe(true);
    expect(m.discharge).toBe(false);
    expect(m.toOutlet).toBe(false);
  });

  it("润湿阀打开：润湿管流动，奶路照常贯通（方向语义不变）", () => {
    const m = stateOf({ feed: "open", pump: true, outletValve: "open", wet: "open" });
    expect(m.wet).toBe(true);
    expect(m.tankOut).toBe(true);
    expect(m.suction).toBe(true);
    expect(m.toOutlet).toBe(true);
  });
});
