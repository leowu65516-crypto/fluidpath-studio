import { describe, it, expect } from "vitest";
import { pipeEffectiveDisabled, setCachedPipes } from "../geometry";
import { parseDiagramJSON } from "../export";

/**
 * 换热器（heatExchanger）通道隔离回归（2026-10，用户确认语义）：
 * 换热器是两条金属管盘绕而成的双通道元件——热咖啡/热水走一条通道，
 * 常温水走另一条，非接触换热（知识库：冷热两侧互不混合、各自独立）。
 *
 * 引擎语义（v1.29.3 修复）：对置端口成对形成通道（left↔right、top↔bottom），
 * 出侧管的供液只由同通道另一端的入侧管决定；另一条通道不得串供。
 * 修复前（节点级汇流）：水侧入管（常开）会给咖啡出侧供液，
 * 「做咖啡」工况下出现"咖啡没进盘管却从盘管流出"的假流动。
 *
 * 拓扑（镜像 Smart X BCMT-统超定制 盘管接线）：
 *   进水口 → 进水阀 → 盘管(right/in) ~通道~ 盘管(left/out) → 单向阀 → 水泵 → 废液出口
 *   咖啡源 → 咖啡阀 → 盘管(left/in) ~通道~ 盘管(right/out) → 咖啡出口
 */

interface Opts {
  waterValve: "open" | "closed";
  coffeeValve: "open" | "closed";
  pump?: boolean;
  vw2?: "open" | "closed"; // 水侧隔离阀（默认开；关闭用于隔离 BFS 相位，验证需求域不跨通道）
}

function buildCoilLine(opts: Opts) {
  const raw = {
    nodes: [
      { id: "W_SRC", type: "inlet", label: "进水口", x: 0, y: 0, w: 60, h: 60, ports: [{ id: "W_SRC_o", position: "right", direction: "out" }] },
      {
        id: "W_V", type: "solenoid2", label: "进水阀", x: 120, y: 0, w: 64, h: 40, valveState: opts.waterValve,
        ports: [{ id: "W_V_i", position: "left", direction: "in" }, { id: "W_V_o", position: "right", direction: "out" }],
      },
      {
        id: "HX", type: "heatExchanger", label: "低温盘管", x: 260, y: -40, w: 140, h: 110,
        ports: [
          { id: "HX_w_out", position: "left", direction: "out" },
          { id: "HX_w_in", position: "right", direction: "in" },
          { id: "HX_c_in", position: "left", direction: "in" },
          { id: "HX_c_out", position: "right", direction: "out" },
        ],
      },
      { id: "CV", type: "checkValve", label: "单向阀", x: 470, y: 0, w: 48, h: 40, ports: [{ id: "CV_i", position: "left", direction: "in" }, { id: "CV_o", position: "right", direction: "out" }] },
      {
        id: "VW2", type: "solenoid2", label: "水侧隔离阀", x: 545, y: 0, w: 64, h: 40, valveState: opts.vw2 ?? "open",
        ports: [{ id: "VW2_i", position: "left", direction: "in" }, { id: "VW2_o", position: "right", direction: "out" }],
      },
      { id: "PUMP", type: "pump", label: "水泵", x: 635, y: 0, w: 60, h: 60, pumpOn: opts.pump ?? true, ports: [{ id: "PUMP_i", position: "left", direction: "in" }, { id: "PUMP_o", position: "right", direction: "out" }] },
      { id: "OW", type: "outlet", label: "废液出口", x: 750, y: 0, w: 60, h: 60, ports: [{ id: "OW_i", position: "left", direction: "in" }] },
      { id: "C_SRC", type: "inlet", label: "咖啡源", x: 0, y: 200, w: 60, h: 60, ports: [{ id: "C_SRC_o", position: "right", direction: "out" }] },
      {
        id: "C_V", type: "solenoid2", label: "咖啡阀", x: 120, y: 200, w: 64, h: 40, valveState: opts.coffeeValve,
        ports: [{ id: "C_V_i", position: "left", direction: "in" }, { id: "C_V_o", position: "right", direction: "out" }],
      },
      { id: "OC", type: "coffeeOutlet", label: "咖啡出口", x: 480, y: 200, w: 60, h: 60, ports: [{ id: "OC_i", position: "left", direction: "in" }] },
    ],
    pipes: [
      { id: "w_src_v", label: "进水管", fluidType: "coldWater", fromPortId: "W_SRC_o", toPortId: "W_V_i" },
      { id: "w_v_hx", label: "盘管进水管", fluidType: "coldWater", fromPortId: "W_V_o", toPortId: "HX_w_in" },
      { id: "w_out", label: "盘管出水管", fluidType: "coldWater", fromPortId: "HX_w_out", toPortId: "CV_i" },
      { id: "cv_vw2", label: "单向阀后管", fluidType: "coldWater", fromPortId: "CV_o", toPortId: "VW2_i" },
      { id: "vw2_pump", label: "泵吸入管", fluidType: "coldWater", fromPortId: "VW2_o", toPortId: "PUMP_i" },
      { id: "pump_out", label: "泵排出管", fluidType: "coldWater", fromPortId: "PUMP_o", toPortId: "OW_i" },
      { id: "c_src_v", label: "咖啡源管", fluidType: "coffee", fromPortId: "C_SRC_o", toPortId: "C_V_i" },
      { id: "c_in", label: "盘管咖啡进管", fluidType: "coffee", fromPortId: "C_V_o", toPortId: "HX_c_in" },
      { id: "c_out", label: "盘管咖啡出管", fluidType: "coffee", fromPortId: "HX_c_out", toPortId: "OC_i" },
    ],
  };
  const d = parseDiagramJSON(JSON.stringify(raw));
  setCachedPipes(d.pipes, d.nodes);
  return d;
}

function stateOf(opts: Opts) {
  const d = buildCoilLine(opts);
  const get = (id: string) => {
    const p = d.pipes.find((x) => x.id === id);
    expect(p, `管路 ${id} 应存在`).toBeTruthy();
    return !pipeEffectiveDisabled(p!, d.nodes); // true = 流动
  };
  return { wSrc: get("w_src_v"), wOut: get("w_out"), cIn: get("c_in"), cOut: get("c_out"), pumpOut: get("pump_out") };
}

describe("换热器双通道：两侧互不串供", () => {
  it("咖啡侧关闭：盘管咖啡出管停流（修复前被水侧串供假流）", () => {
    const m = stateOf({ waterValve: "open", coffeeValve: "closed", pump: true });
    expect(m.cIn).toBe(false);
    expect(m.cOut).toBe(false); // 关键：水侧在流，也不得让咖啡出侧有供液
    expect(m.wOut).toBe(true); // 水侧照常流动
  });

  it("水侧关闭：盘管出水停流，咖啡侧不受影响（反向隔离）", () => {
    const m = stateOf({ waterValve: "closed", coffeeValve: "open", pump: true });
    expect(m.cOut).toBe(true);
    expect(m.cIn).toBe(true);
    expect(m.wOut).toBe(false); // 关键：咖啡侧在流，也不得让水侧出管有供液
  });

  it("两侧都关闭：整条盘管两侧全停", () => {
    const m = stateOf({ waterValve: "closed", coffeeValve: "closed", pump: true });
    expect(m.cIn).toBe(false);
    expect(m.cOut).toBe(false);
    expect(m.wOut).toBe(false);
  });

  it("两侧都打开：两条通道各自独立贯通", () => {
    const m = stateOf({ waterValve: "open", coffeeValve: "open", pump: true });
    expect(m.wSrc).toBe(true); // 进水口→阀段：由运行泵需求链正常拉入
    expect(m.wOut).toBe(true);
    expect(m.cIn).toBe(true);
    expect(m.cOut).toBe(true);
    expect(m.pumpOut).toBe(true);
  });

  it("水泵停机：停流相位不跨通道扩散，且需求域不跨通道拉入水侧进管", () => {
    const m = stateOf({ waterValve: "open", coffeeValve: "open", pump: false, vw2: "closed" });
    expect(m.wOut).toBe(false); // 泵停且水侧隔离阀关 → 水侧无消费者
    expect(m.wSrc).toBe(false); // 关键：咖啡出口需求不得把水侧进管拉进需求域（跨通道短路）
    expect(m.cOut).toBe(true); // 独立通道：咖啡侧不因水侧停转/无需求而停
  });
});
