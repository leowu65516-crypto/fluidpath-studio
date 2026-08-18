import { describe, it, expect } from "vitest";
import { collectAdvice, traceStopCause } from "../advice";
import { diagnoseDiagram, diagnosisSummary } from "../diagnostics";
import { blinkElements, showChainPath, loadDiagram, store } from "../store";
import { parseDiagramJSON } from "../export";
import type { Diagram } from "../types";

/** 最小拓扑：进水口 → 水泵 → 两通阀 → 三通 → 咖啡出口 */
function build(valve: "open" | "closed", pumpOn = true, pumpFault?: "pumpStuck"): Diagram {
  const raw = {
    nodes: [
      { id: "IN", type: "inlet", label: "进水口", x: 0, y: 0, w: 40, h: 40, ports: [{ id: "INo", position: "right", direction: "out" }] },
      { id: "P", type: "pump", label: "水泵", x: 80, y: 0, w: 40, h: 40, pumpOn, fault: pumpFault, ports: [{ id: "Pi", position: "left", direction: "in" }, { id: "Po", position: "right", direction: "out" }] },
      { id: "V", type: "solenoid2", label: "进水阀", x: 160, y: 0, w: 30, h: 30, valveState: valve, ports: [{ id: "Vi", position: "left", direction: "in" }, { id: "Vo", position: "right", direction: "out" }] },
      { id: "T", type: "tee", label: "三通", x: 240, y: 0, w: 20, h: 20, ports: [{ id: "Tl", position: "left", direction: "bidirectional" }, { id: "Tr", position: "right", direction: "bidirectional" }] },
      { id: "O", type: "coffeeOutlet", label: "咖啡出口", x: 320, y: 0, w: 30, h: 30, ports: [{ id: "Oi", position: "left", direction: "in" }] },
    ],
    pipes: [
      { id: "a", label: "管a", fluidType: "coldWater", fromPortId: "INo", toPortId: "Pi" },
      { id: "b", label: "管b", fluidType: "coldWater", fromPortId: "Po", toPortId: "Vi" },
      { id: "c", label: "管c", fluidType: "coldWater", fromPortId: "Vo", toPortId: "Tl" },
      { id: "d", label: "管d", fluidType: "coffee", fromPortId: "Tr", toPortId: "Oi" },
    ],
  };
  return parseDiagramJSON(JSON.stringify(raw));
}

describe("停流因果链定位", () => {
  it("阀关闭 → 出液管停流根因定位到该阀，并给出「打开阀门」修复", () => {
    const d = build("closed");
    const p = d.pipes.find((x) => x.id === "d")!;
    const cause = traceStopCause(p, d);
    expect(cause.reason).toContain("进水阀");
    expect(cause.ids[0]).toBe("V");

    const adv = collectAdvice(d).find((a) => a.kind === "outlet-stalled");
    expect(adv).toBeTruthy();
    expect(adv!.fix?.type).toBe("openValve");
    expect(adv!.fix).toMatchObject({ nodeId: "V" });
    expect(adv!.category).toBe("state");
    expect(adv!.elementIds).toContain("V"); // 根因在关联元素首位
  });

  it("泵停止 → 因果链贯穿 泵→管b→管c→管d，修复建议为「启动泵」", () => {
    const d = build("open", false);
    const p = d.pipes.find((x) => x.id === "d")!;
    const cause = traceStopCause(p, d);
    expect(cause.ids[0]).toBe("P");
    expect(cause.ids).toEqual(["P", "b", "c", "d"]);

    const adv = collectAdvice(d).find((a) => a.kind === "outlet-stalled");
    expect(adv!.fix?.type).toBe("startPump");
  });

  it("泵卡死（故障模拟）→ 根因为泵且不给出「启动泵」误导建议", () => {
    const d = build("open", true, "pumpStuck");
    const p = d.pipes.find((x) => x.id === "d")!;
    const cause = traceStopCause(p, d);
    expect(cause.ids[0]).toBe("P");
    expect(cause.reason).toContain("卡死");

    const adv = collectAdvice(d).find((a) => a.kind === "outlet-stalled");
    expect(adv!.fix).toBeUndefined(); // 只能定位，无法一键修复
    expect(collectAdvice(d).some((a) => a.kind === "fault")).toBe(true);
  });
});

describe("定位闪烁", () => {
  it("blinkElements 设置闪烁集并写入全局状态", () => {
    blinkElements(["node-x", "pipe-y"]);
    const b = store.get().ui.blink;
    expect(b).toBeTruthy();
    expect(b!.ids).toContain("node-x");
    expect(b!.ids).toContain("pipe-y");
    expect(b!.stamp).toBeGreaterThan(0);
  });
});

describe("教学解释与因果链路径", () => {
  it("每条建议都附带「为什么」教学解释", () => {
    const d = build("closed");
    const adv = collectAdvice(d);
    expect(adv.length).toBeGreaterThan(0);
    for (const a of adv) {
      expect(typeof a.why, `${a.kind} 应有教学解释`).toBe("string");
      expect(a.why!.length).toBeGreaterThan(4);
    }
  });

  it("showChainPath 设置因果链路径并随 loadDiagram 清除", () => {
    showChainPath(["a", "b"]);
    const c = store.get().ui.chainPath;
    expect(c).toBeTruthy();
    expect(c!.pipeIds).toContain("a");
    expect(c!.stamp).toBeGreaterThan(0);
    loadDiagram(build("open"));
    expect(store.get().ui.chainPath).toBeNull();
  });
});

describe("诊断分层与徽章去噪", () => {
  it("泵停/阀关归入「工况提示」，不参与结构徽章计数", () => {
    const d = build("closed", false);
    const adv = collectAdvice(d);
    expect(adv.filter((a) => a.category === "state").length).toBeGreaterThan(0);
    const summary = diagnosisSummary(d);
    expect(summary.errors).toBe(0);
    expect(summary.warnings).toBe(0); // 出液口停流属工况，不计入徽章
  });

  it("端口多连归入「结构问题」且计入徽章 error", () => {
    const d = build("open");
    // 再给三通右端口接一条管（端口多连）
    d.pipes.push({
      id: "e", label: "管e", fluidType: "coldWater",
      fromPortId: "Tr", toPortId: "Tr", points: [],
      nominalDiameter: "DN25", visualDiameter: 10, wallColor: "#5b6b7d", fluidColor: "#2f7fd6",
      fluidOpacity: 0.92, direction: "forward", flowSpeed: 1.2, particleDensity: "medium",
      animated: true, showArrow: true,
    } as any);
    const summary = diagnosisSummary(d);
    expect(summary.errors).toBeGreaterThanOrEqual(1);
    const diags = diagnoseDiagram(d);
    expect(diags.some((x) => x.kind === "port-conflict")).toBe(true);
  });

  it("统一引擎：诊断报告与建议同源（报告是建议的派生视图）", () => {
    const d = build("closed");
    const diags = diagnoseDiagram(d);
    const adv = collectAdvice(d);
    expect(diags.length).toBe(adv.length);
    expect(diags.some((x) => x.kind === "outlet-stalled")).toBe(true);
  });
});
