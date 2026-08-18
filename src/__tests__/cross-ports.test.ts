import { describe, it, expect } from "vitest";
import { parseDiagramJSON } from "../export";
import { setCachedPipes, pipeEffectiveDisabled } from "../geometry";
import { addPort, store, loadDiagram, MAX_PORTS_PER_NODE } from "../store";
import type { Diagram } from "../types";

/** 十字四通：进水口 → 水泵 → cross → 四路出口，四路都应贯通 */
function crossDiagram(): Diagram {
  const raw = {
    nodes: [
      { id: "IN", type: "inlet", label: "进水口", x: 0, y: 0, w: 40, h: 40, ports: [{ id: "INo", position: "right", direction: "out" }] },
      { id: "P", type: "pump", label: "水泵", x: 80, y: 0, w: 40, h: 40, pumpOn: true, ports: [{ id: "Pi", position: "left", direction: "in" }, { id: "Po", position: "right", direction: "out" }] },
      { id: "X", type: "cross", label: "十字四通", x: 180, y: 0, w: 64, h: 64, ports: [{ id: "Xl", position: "left", direction: "bidirectional" }, { id: "Xr", position: "right", direction: "bidirectional" }, { id: "Xt", position: "top", direction: "bidirectional" }, { id: "Xb", position: "bottom", direction: "bidirectional" }] },
      { id: "O1", type: "outlet", label: "出口1", x: 300, y: -40, w: 30, h: 30, ports: [{ id: "O1i", position: "left", direction: "in" }] },
      { id: "O2", type: "outlet", label: "出口2", x: 300, y: 0, w: 30, h: 30, ports: [{ id: "O2i", position: "left", direction: "in" }] },
      { id: "O3", type: "outlet", label: "出口3", x: 300, y: 40, w: 30, h: 30, ports: [{ id: "O3i", position: "left", direction: "in" }] },
      { id: "O4", type: "outlet", label: "出口4", x: 300, y: 80, w: 30, h: 30, ports: [{ id: "O4i", position: "left", direction: "in" }] },
    ],
    pipes: [
      { id: "a", label: "管a", fluidType: "coldWater", fromPortId: "INo", toPortId: "Pi" },
      { id: "b", label: "管b", fluidType: "coldWater", fromPortId: "Po", toPortId: "Xl" },
      { id: "c1", label: "管c1", fluidType: "coldWater", fromPortId: "Xr", toPortId: "O1i" },
      { id: "c2", label: "管c2", fluidType: "coldWater", fromPortId: "Xt", toPortId: "O2i" },
      { id: "c3", label: "管c3", fluidType: "coldWater", fromPortId: "Xb", toPortId: "O3i" },
      { id: "c4", label: "管c4", fluidType: "coldWater", fromPortId: "Xr", toPortId: "O4i" },
    ],
  };
  return parseDiagramJSON(JSON.stringify(raw));
}

describe("十字四通（cross）", () => {
  it("四路出口全部贯通流动", () => {
    const d = crossDiagram();
    setCachedPipes(d.pipes, d.nodes);
    for (const id of ["c1", "c2", "c3", "c4"]) {
      const p = d.pipes.find((x) => x.id === id)!;
      expect(pipeEffectiveDisabled(p, d.nodes), `${id} 应流动`).toBe(false);
    }
  });
});

describe("端口上限", () => {
  it("addPort 不超过 MAX_PORTS_PER_NODE", () => {
    loadDiagram(crossDiagram());
    const nodeId = "X";
    const node = () => store.get().diagram.nodes.find((n) => n.id === nodeId)!;
    // 已有 4 口，加到 8
    for (let i = 4; i < MAX_PORTS_PER_NODE; i++) addPort(nodeId, "in");
    expect(node().ports.length).toBe(MAX_PORTS_PER_NODE);
    // 再添加不生效
    addPort(nodeId, "out");
    expect(node().ports.length).toBe(MAX_PORTS_PER_NODE);
  });
});
