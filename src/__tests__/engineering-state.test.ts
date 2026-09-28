import { describe, expect, it } from "vitest";
import { parseDiagramJSON } from "../export";
import { computeDisabledPipes, pipeEngineeringDisabled, pipeEffectiveDisabled, pipeTeachingOverride, setCachedPipes } from "../geometry";
import bcmtsRaw from "../../BCMTS.json";

describe("工程状态与教学显示状态分离", () => {
  it("画布淡化字段不改变工程液路判定", () => {
    const d = parseDiagramJSON(JSON.stringify({
      nodes: [
        { id: "IN", type: "inlet", label: "进水", x: 0, y: 0, w: 10, h: 10, ports: [{ id: "INo", position: "right", direction: "out" }] },
        { id: "O", type: "outlet", label: "出口", x: 100, y: 0, w: 10, h: 10, ports: [{ id: "Oi", position: "left", direction: "in" }] },
      ],
      pipes: [{ id: "p", label: "主路", fromPortId: "INo", toPortId: "Oi", displayDisabled: true }],
    }));
    setCachedPipes(d.pipes, d.nodes);
    expect(pipeEngineeringDisabled(d.pipes[0], d.nodes)).toBe(false);
    expect(pipeEffectiveDisabled(d.pipes[0], d.nodes)).toBe(false);
  });

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

  it("BCMTS 总进水阀关闭且水泵停止时，流量计至热水锅炉底部补水链必须全部停流", () => {
    const d = parseDiagramJSON(JSON.stringify(bcmtsRaw));
    d.nodes.find((n) => n.id === "n_ms7jr4mj2wu7sw")!.pumpOn = false;
    d.nodes.find((n) => n.id === "n_ms7jsb6764ggp8")!.valveState = "closed";
    setCachedPipes(d.pipes, d.nodes);
    const labels = ["管路 61", "管路 62", "管路 4", "管路 5", "管路 3"];
    for (const label of labels) {
      const pipe = d.pipes.find((p) => p.label === label);
      expect(pipe, `${label} 应存在`).toBeTruthy();
      expect(pipeEngineeringDisabled(pipe!, d.nodes), `${label} 应按工程状态停流`).toBe(true);
      expect(pipeEffectiveDisabled(pipe!, d.nodes), `${label} 应按画面状态停流`).toBe(true);
    }
  });

  it("递归兜底判定也会穿过流量计：停泵时流量计后的出口管必须停流", () => {
    const d = parseDiagramJSON(JSON.stringify({
      nodes: [
        { id: "in", type: "inlet", label: "in", x: 0, y: 0, w: 10, h: 10, ports: [{ id: "in-out", position: "right", direction: "out" }] },
        { id: "pump", type: "pump", label: "pump", x: 30, y: 0, w: 10, h: 10, pumpOn: false, ports: [{ id: "pump-in", position: "left", direction: "in" }, { id: "pump-out", position: "right", direction: "out" }] },
        { id: "meter", type: "flowMeter", label: "meter", x: 60, y: 0, w: 10, h: 10, ports: [{ id: "meter-in", position: "left", direction: "in" }, { id: "meter-out", position: "right", direction: "out" }] },
        { id: "out", type: "outlet", label: "out", x: 90, y: 0, w: 10, h: 10, ports: [{ id: "out-in", position: "left", direction: "in" }] },
      ],
      pipes: [
        { id: "p1", label: "inlet", fromPortId: "in-out", toPortId: "pump-in" },
        { id: "p2", label: "pump to meter", fromPortId: "pump-out", toPortId: "meter-in" },
        { id: "p3", label: "meter to outlet", fromPortId: "meter-out", toPortId: "out-in" },
      ],
    }));
    // Exercise the recursive fallback rather than the pre-computed cache.
    setCachedPipes([], []); setCachedPipes(d.pipes);
    expect(pipeEngineeringDisabled(d.pipes[2], d.nodes)).toBe(true);
  });
});
