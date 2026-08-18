import { describe, it, expect } from "vitest";
import { pipeEffectiveDisabled, setCachedPipes } from "../geometry";
import { parseDiagramJSON } from "../export";
import type { Diagram } from "../types";
import bcmtsRaw from "../../BCMTS.json";

/**
 * 回流回归 harness：BCMTS（商用咖啡机牛奶回路，含清洗/润湿回流管）
 * 背景（用户需求）：
 *  1. 「牛奶常温水润湿两通」与「常温快速冲洗两通」的上游支路（泵后滤后、T 型三通前）
 *     在两阀都关闭时不流动；但凡其中一个打开，对应的支路要流动。
 *  2. 润湿阀打开 + 进奶阀关闭 → 水经「清洗回流管」反推回储液罐。
 *  3. 牛奶清洗三通 A 位 + 奶泵关闭 → 热水经「清洗热水回流管」流入储液罐溶化清洗药丸。
 * 引擎要求：
 *  - 储液罐（tank）计入需求域终点（DEMAND_SINK_TYPES）；
 *  - 需求域按需求根独立 BFS，跳过「根自身作为上游源」的出奶回环管
 *    （否则润湿/待机时储液罐→T型三通 的出奶管假流）。
 */

const WET = "n_msbyfj71l363q0"; // 牛奶常温水润湿两通电磁阀
const RINSE = "n_msbykiz9c83f14"; // 常温快速冲洗两通电磁阀
const INLET = "n_ms92b8rm798rfd"; // 进奶两通电磁阀
const CLEAN3 = "n_ms91xxps4wsawx"; // 牛奶清洗三通电磁阀
const MILKP = "n_msvz8pbq71ca"; // 奶泵
const WPUMP = "n_ms7jr4mj2wu7sw"; // 水泵

// 润湿上游支路
const P_40 = "pipe_msbyicyo3pqh4d"; // T型三通 → 润湿阀
const P_42 = "pipe_msbyisx85vn5rc"; // 润湿阀 → T型三通
// 快冲支路
const P_43 = "pipe_msbykkd3ckp4w8"; // T型三通 → 快冲阀
const P_44 = "pipe_msbykureeblc6o"; // 快冲阀 → 单向阀
const P_45 = "pipe_msbyl2lkgi9hj8"; // 单向阀 → T型三通
const P_46 = "pipe_msbymc5nlypwud"; // T型三通 → 三通接头
const P_63 = "pipe_msvz95cn74m1"; // 三通接头 → 奶泵
// 奶路
const P_68 = "pipe_msw0gpmt7m99"; // 储液罐 → T型三通（出奶）
const P_41 = "pipe_msbyirjp5gqoa5"; // T型三通 → 进奶阀
const P_50 = "pipe_msbyqad7aklcn7"; // T型三通 → T型三通（奶泵出侧）
// 清洗
const P_51 = "pipe_msbyqrewct8h67"; // 清洗三通 → T型三通
// 回流管
const P_REF_WET = "pipe_reflux_to_tank"; // 清洗回流管（润湿水回罐）
const P_REF_CLEAN = "pipe_reflux_clean"; // 清洗热水回流管（热水回罐）

interface Scenario {
  wet?: "open" | "closed";
  rinse?: "open" | "closed";
  inlet?: "open" | "closed";
  clean3?: "A" | "B" | "off";
  milkPump?: boolean;
  waterPump?: boolean;
}

function stateOf(d: Diagram, cfg: Scenario): Record<string, boolean> {
  const g = (id: string) => d.nodes.find((n) => n.id === id)!;
  if (cfg.wet !== undefined) g(WET).valveState = cfg.wet;
  if (cfg.rinse !== undefined) g(RINSE).valveState = cfg.rinse;
  if (cfg.inlet !== undefined) g(INLET).valveState = cfg.inlet;
  if (cfg.clean3 !== undefined) g(CLEAN3).valvePath = cfg.clean3;
  if (cfg.milkPump !== undefined) g(MILKP).pumpOn = cfg.milkPump;
  if (cfg.waterPump !== undefined) g(WPUMP).pumpOn = cfg.waterPump;
  setCachedPipes(d.pipes, d.nodes);
  const m: Record<string, boolean> = {};
  for (const [k, pid] of Object.entries({
    P_40, P_42, P_43, P_44, P_45, P_46, P_63,
    P_68, P_41, P_50, P_51, P_REF_WET, P_REF_CLEAN,
  })) {
    const p = d.pipes.find((x) => x.id === pid);
    expect(p, `管路 ${k} 应存在`).toBeTruthy();
    m[k] = !pipeEffectiveDisabled(p!, d.nodes); // true = 流动
  }
  return m;
}

const BASE: Scenario = { waterPump: true };

describe("BCMTS 回流场景：润湿/快冲支路与清洗回流", () => {
  it("两阀全关：润湿与快冲上游支路全部停流（核心缺陷回归）", () => {
    const d = parseDiagramJSON(JSON.stringify(bcmtsRaw));
    const m = stateOf(d, { ...BASE, wet: "closed", rinse: "closed", inlet: "open", clean3: "A", milkPump: false });
    expect(m.P_40).toBe(false);
    expect(m.P_42).toBe(false);
    expect(m.P_43).toBe(false);
    expect(m.P_44).toBe(false);
    // 出奶管不得因回流回环假流
    expect(m.P_68).toBe(false);
  });

  it("只开润湿（进奶关+奶泵关）：润湿支路流动且水反推回储液罐", () => {
    const d = parseDiagramJSON(JSON.stringify(bcmtsRaw));
    const m = stateOf(d, { ...BASE, wet: "open", rinse: "closed", inlet: "closed", clean3: "off", milkPump: false });
    expect(m.P_40).toBe(true);
    expect(m.P_42).toBe(true);
    expect(m.P_REF_WET).toBe(true); // 润湿水回流进罐
    expect(m.P_68).toBe(false); // 出奶管不流动
    expect(m.P_41).toBe(false); // 进奶阀关
    expect(m.P_REF_CLEAN).toBe(false); // 清洗回流不误动
  });

  it("清洗溶药丸（清洗三通 A+奶泵关）：热水经回流管入罐", () => {
    const d = parseDiagramJSON(JSON.stringify(bcmtsRaw));
    const m = stateOf(d, { ...BASE, wet: "closed", rinse: "closed", inlet: "closed", clean3: "A", milkPump: false });
    expect(m.P_51).toBe(true);
    expect(m.P_REF_CLEAN).toBe(true); // 热水回罐
    expect(m.P_40).toBe(false); // 润湿支路隔离
    expect(m.P_42).toBe(false);
    expect(m.P_REF_WET).toBe(false); // 润湿回流不误动
  });

  it("快冲+奶泵运行：快冲支路贯通（正冲）", () => {
    const d = parseDiagramJSON(JSON.stringify(bcmtsRaw));
    const m = stateOf(d, { ...BASE, wet: "closed", rinse: "open", inlet: "closed", clean3: "off", milkPump: true });
    expect(m.P_43).toBe(true);
    expect(m.P_44).toBe(true);
    expect(m.P_45).toBe(true);
    expect(m.P_46).toBe(true);
    expect(m.P_63).toBe(true);
    expect(m.P_40).toBe(false); // 润湿支路隔离
  });

  it("快冲+奶泵关闭：快冲水到达关断奶泵的死路，全停（不误显示流动）", () => {
    const d = parseDiagramJSON(JSON.stringify(bcmtsRaw));
    const m = stateOf(d, { ...BASE, wet: "closed", rinse: "open", inlet: "closed", clean3: "off", milkPump: false });
    expect(m.P_43).toBe(false);
    expect(m.P_44).toBe(false);
    expect(m.P_45).toBe(false);
    expect(m.P_46).toBe(false);
    expect(m.P_63).toBe(false);
  });

  it("正常出奶（进奶开+奶泵开）：奶路贯通且润湿/快冲支路隔离", () => {
    const d = parseDiagramJSON(JSON.stringify(bcmtsRaw));
    const m = stateOf(d, { ...BASE, wet: "closed", rinse: "closed", inlet: "open", clean3: "off", milkPump: true });
    expect(m.P_68).toBe(true);
    expect(m.P_41).toBe(true);
    expect(m.P_50).toBe(true);
    expect(m.P_46).toBe(true);
    expect(m.P_63).toBe(true);
    expect(m.P_40).toBe(false);
    expect(m.P_42).toBe(false);
    expect(m.P_51).toBe(false);
  });
});
