import { describe, it, expect } from "vitest";
import { pipeEffectiveDisabled, setCachedPipes } from "../geometry";
import { parseDiagramJSON } from "../export";

/**
 * 三通电磁阀「汇流」（两进一出）供液回归（2026-10，用户确认语义）：
 * Smart X BCMT-统超定制 冲泡出口后的第一个三通电磁阀是"咖啡 + 热水汇集"用法
 * （两进一出：左入=清洗/热水分支、底入=冲泡缸咖啡、右出=汇流输出）。
 *
 * 引擎语义（v1.29.3 修复）：激活出侧的供液按"全部入侧口"判定——
 * 任一路入侧有来流，出侧即有介质；所有接了管的入侧口都断供才判停。
 * 修复前只检查第一个入侧口（left），「做咖啡」时热水侧关闭 →
 * 出侧误判停流 → 咖啡主路（出阀→下一级）整段灭。
 *
 * 单入侧阀（绝大多数存量图纸）行为保持不变。
 */

interface Opts {
  hotValve: "open" | "closed";
  coffeeValve: "open" | "closed";
  path?: "A" | "B";
  variant?: "merge" | "yTop" | "single";
}

function buildMergeLine(opts: Opts) {
  const v3Ports =
    opts.variant === "yTop"
      ? [
          { id: "V3_i1", position: "left", direction: "in" },
          { id: "V3_o", position: "right", direction: "out" },
          { id: "V3_i2", position: "top", direction: "in" },
        ]
      : opts.variant === "single"
        ? [
            { id: "V3_i1", position: "left", direction: "in" },
            { id: "V3_o", position: "right", direction: "out" },
            { id: "V3_o2", position: "bottom", direction: "out" },
          ]
        : [
            { id: "V3_i1", position: "left", direction: "in" },
            { id: "V3_o", position: "right", direction: "out" },
            { id: "V3_i2", position: "bottom", direction: "in" },
          ];
  const raw = {
    nodes: [
      { id: "H_SRC", type: "inlet", label: "热水源", x: 0, y: 0, w: 60, h: 60, ports: [{ id: "H_SRC_o", position: "right", direction: "out" }] },
      {
        id: "H_V", type: "solenoid2", label: "清洗阀", x: 120, y: 0, w: 64, h: 40, valveState: opts.hotValve,
        ports: [{ id: "H_V_i", position: "left", direction: "in" }, { id: "H_V_o", position: "right", direction: "out" }],
      },
      { id: "C_SRC", type: "inlet", label: "咖啡源", x: 0, y: 200, w: 60, h: 60, ports: [{ id: "C_SRC_o", position: "right", direction: "out" }] },
      {
        id: "C_V", type: "solenoid2", label: "咖啡阀", x: 120, y: 200, w: 64, h: 40, valveState: opts.coffeeValve,
        ports: [{ id: "C_V_i", position: "left", direction: "in" }, { id: "C_V_o", position: "right", direction: "out" }],
      },
      { id: "V3", type: "solenoid3", label: "汇流三通电磁阀", x: 300, y: 80, w: 64, h: 64, valvePath: opts.path ?? "A", ports: v3Ports },
      { id: "O", type: "coffeeOutlet", label: "出口", x: 460, y: 80, w: 60, h: 60, ports: [{ id: "O_i", position: "left", direction: "in" }] },
    ],
    pipes: [
      { id: "h_src_v", label: "热水管", fluidType: "hotWater", fromPortId: "H_SRC_o", toPortId: "H_V_i" },
      { id: "h_to_v3", label: "热水进阀管", fluidType: "hotWater", fromPortId: "H_V_o", toPortId: "V3_i1" },
      { id: "c_src_v", label: "咖啡源管", fluidType: "coffee", fromPortId: "C_SRC_o", toPortId: "C_V_i" },
      ...(opts.variant === "single" ? [] : [{ id: "c_to_v3", label: "咖啡进阀管", fluidType: "coffee", fromPortId: "C_V_o", toPortId: "V3_i2" }]),
      { id: "v3_out", label: "汇流出管", fluidType: "coffee", fromPortId: "V3_o", toPortId: "O_i" },
    ],
  };
  const d = parseDiagramJSON(JSON.stringify(raw));
  setCachedPipes(d.pipes, d.nodes);
  return d;
}

function stateOf(opts: Opts) {
  const d = buildMergeLine(opts);
  const get = (id: string) => {
    const p = d.pipes.find((x) => x.id === id);
    return p ? !pipeEffectiveDisabled(p, d.nodes) : null; // true = 流动；null = 该变体无此管
  };
  return { hotIn: get("h_to_v3"), coffeeIn: get("c_to_v3"), out: get("v3_out") };
}

describe("三通电磁阀汇流：两进一出任一路有供液即出流", () => {
  it("热水侧关闭 + 咖啡侧流动：汇流出管照常流动（修复前误判停流）", () => {
    const m = stateOf({ hotValve: "closed", coffeeValve: "open" });
    expect(m.hotIn).toBe(false);
    expect(m.coffeeIn).toBe(true);
    expect(m.out).toBe(true); // 关键：底入侧有流即出侧有介质
  });

  it("咖啡侧关闭 + 热水侧流动：汇流出管照常流动（左右对称）", () => {
    const m = stateOf({ hotValve: "open", coffeeValve: "closed" });
    expect(m.out).toBe(true);
  });

  it("两路入侧都关闭：汇流出管停流", () => {
    const m = stateOf({ hotValve: "closed", coffeeValve: "closed" });
    expect(m.out).toBe(false);
  });

  it("两路都流动：汇流出管流动（汇集用法常态）", () => {
    const m = stateOf({ hotValve: "open", coffeeValve: "open" });
    expect(m.out).toBe(true);
  });

  it("B 档：右出为非激活出侧，汇流出管停流", () => {
    const m = stateOf({ hotValve: "open", coffeeValve: "open", path: "B" });
    expect(m.out).toBe(false);
  });

  it("Y 图纸同型（左入 + 顶入）：顶入有流、左入停时出侧仍流动", () => {
    const m = stateOf({ hotValve: "closed", coffeeValve: "open", variant: "yTop" });
    expect(m.out).toBe(true);
  });

  it("单入侧阀零回归：入侧关闭则出侧停流、入侧供液则出侧流动", () => {
    const closed = stateOf({ hotValve: "closed", coffeeValve: "closed", variant: "single" });
    expect(closed.out).toBe(false);
    const open = stateOf({ hotValve: "open", coffeeValve: "closed", variant: "single" });
    expect(open.out).toBe(true);
  });
});
