import { describe, expect, it } from "vitest";
import { parseDiagramJSON } from "../export";
import { pipeEngineeringDisabled, setCachedPipes } from "../geometry";

describe("冲泡缸输入输出依赖", () => {
  it("停泵且进水阀关闭时，冲泡缸之后的咖啡链必须停流", () => {
    const d = parseDiagramJSON(JSON.stringify({
      nodes: [
        { id: "IN", type: "inlet", label: "进水", x: 0, y: 0, width: 10, height: 10, rotation: 0, fill: "#fff", stroke: "#000", ports: [{ id: "INo", nodeId: "IN", position: "right", direction: "out" }] },
        { id: "V", type: "solenoid2", label: "进水阀", x: 40, y: 0, width: 10, height: 10, rotation: 0, fill: "#fff", stroke: "#000", valveState: "closed", ports: [{ id: "Vi", nodeId: "V", position: "left", direction: "in" }, { id: "Vo", nodeId: "V", position: "right", direction: "out" }] },
        { id: "P", type: "pump", label: "水泵", x: 80, y: 0, width: 10, height: 10, rotation: 0, fill: "#fff", stroke: "#000", pumpOn: false, ports: [{ id: "Pi", nodeId: "P", position: "left", direction: "in" }, { id: "Po", nodeId: "P", position: "right", direction: "out" }] },
        { id: "B", type: "brewChamber", label: "冲泡缸", x: 120, y: 0, width: 10, height: 10, rotation: 0, fill: "#fff", stroke: "#000", ports: [{ id: "Bi", nodeId: "B", position: "bottom", direction: "in" }, { id: "Bo", nodeId: "B", position: "top", direction: "out" }] },
        { id: "D", type: "solenoid3", label: "排废阀", x: 160, y: 0, width: 10, height: 10, rotation: 0, fill: "#fff", stroke: "#000", valvePath: "A", ports: [{ id: "Di", nodeId: "D", position: "left", direction: "in" }, { id: "Do", nodeId: "D", position: "right", direction: "out" }] },
        { id: "O", type: "coffeeOutlet", label: "咖啡出口", x: 200, y: 0, width: 10, height: 10, rotation: 0, fill: "#fff", stroke: "#000", ports: [{ id: "Oi", nodeId: "O", position: "left", direction: "in" }] },
      ],
      pipes: [
        { id: "before-pump", label: "泵前", fromPortId: "INo", toPortId: "Vi" },
        { id: "after-pump", label: "泵后", fromPortId: "Vo", toPortId: "Pi" },
        { id: "into-brew", label: "冲泡缸入口", fromPortId: "Po", toPortId: "Bi" },
        { id: "after-brew", label: "冲泡缸出口", fromPortId: "Bo", toPortId: "Di" },
        { id: "coffee-out", label: "咖啡出口", fromPortId: "Do", toPortId: "Oi" },
      ],
    }));

    setCachedPipes(d.pipes, d.nodes);
    for (const pipe of d.pipes.filter((p) => ["into-brew", "after-brew", "coffee-out"].includes(p.id))) {
      expect(pipeEngineeringDisabled(pipe, d.nodes), `${pipe.label} 应停流`).toBe(true);
    }
  });
});
