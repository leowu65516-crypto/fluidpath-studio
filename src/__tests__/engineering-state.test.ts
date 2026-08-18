import { describe, expect, it } from "vitest";
import { parseDiagramJSON } from "../export";
import { computeDisabledPipes, pipeEngineeringDisabled, pipeEffectiveDisabled, pipeTeachingOverride, setCachedPipes } from "../geometry";

describe("工程状态与教学显示状态分离", () => {
  it("旧版 forceStop 加载后迁移为教学覆盖，工程判定仍按真实拓扑执行", () => {
    const d = parseDiagramJSON(JSON.stringify({
      nodes: [
        { id: "IN", type: "inlet", label: "进水", x: 0, y: 0, w: 10, h: 10, ports: [{ id: "INo", position: "right", direction: "out" }] },
        { id: "O", type: "outlet", label: "出口", x: 100, y: 0, w: 10, h: 10, ports: [{ id: "Oi", position: "left", direction: "in" }] },
      ],
      pipes: [{ id: "p", label: "主路", fromPortId: "INo", toPortId: "Oi", forceStop: true }],
    }));
    const p = d.pipes[0];
    setCachedPipes(d.pipes, d.nodes);
    expect(pipeTeachingOverride(p)).toBe("stop");
    expect(p.forceStop).toBeUndefined();
    expect(pipeEffectiveDisabled(p, d.nodes)).toBe(true); // 教学画面停流
    expect(pipeEngineeringDisabled(p, d.nodes)).toBe(false); // 工程状态仍连通
  });

  it("一条停泵支路不得让另一条供液支路的公共出管被 BFS 判停", () => {
    const d = parseDiagramJSON(JSON.stringify({
      nodes: [
        { id: "IN1", type: "inlet", label: "水源一", x: 0, y: 0, w: 10, h: 10, ports: [{ id: "IN1o", position: "right", direction: "out" }] },
        { id: "P1", type: "pump", label: "停泵", x: 40, y: 0, w: 10, h: 10, pumpOn: false, ports: [{ id: "P1i", position: "left", direction: "in" }, { id: "P1o", position: "right", direction: "out" }] },
        { id: "IN2", type: "inlet", label: "水源二", x: 0, y: 80, w: 10, h: 10, ports: [{ id: "IN2o", position: "right", direction: "out" }] },
        { id: "P2", type: "pump", label: "运行泵", x: 40, y: 80, w: 10, h: 10, pumpOn: true, ports: [{ id: "P2i", position: "left", direction: "in" }, { id: "P2o", position: "right", direction: "out" }] },
        { id: "J", type: "tee", label: "汇流三通", x: 120, y: 30, w: 10, h: 10, ports: [{ id: "J1", position: "left", direction: "bidirectional" }, { id: "J2", position: "bottom", direction: "bidirectional" }, { id: "Jo", position: "right", direction: "bidirectional" }] },
        { id: "O", type: "outlet", label: "公共出口", x: 200, y: 30, w: 10, h: 10, ports: [{ id: "Oi", position: "left", direction: "in" }] },
      ],
      pipes: [
        { id: "p1in", label: "停泵入", fromPortId: "IN1o", toPortId: "P1i" },
        { id: "p1out", label: "停泵支路", fromPortId: "P1o", toPortId: "J1" },
        { id: "p2in", label: "运行泵入", fromPortId: "IN2o", toPortId: "P2i" },
        { id: "p2out", label: "运行泵支路", fromPortId: "P2o", toPortId: "J2" },
        { id: "common", label: "公共出管", fromPortId: "Jo", toPortId: "Oi" },
      ],
    }));
    const disabled = computeDisabledPipes(d.pipes, d.nodes);
    expect(disabled.has("p1out")).toBe(true);
    expect(disabled.has("p2out")).toBe(false);
    expect(disabled.has("common")).toBe(false);
  });
});
