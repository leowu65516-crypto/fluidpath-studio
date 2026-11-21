import { describe, expect, it } from "vitest";
import { createNode } from "../symbols";
import { pipeEngineeringDisabled, setCachedPipes } from "../geometry";
import { validatePipeConnection } from "../connection";
import { parseDiagramJSON } from "../export";
import { applyWorkConditionSnapshot, snapshotWorkCondition } from "../presets";
import type { Diagram, Pipe } from "../types";

function pipe(id: string, fromPortId: string, toPortId: string): Pipe {
  return { id, label: id, fromPortId, toPortId, points: [], nominalDiameter: "DN6", visualDiameter: 2, wallColor: "#444", fluidColor: "#2f7fd6", fluidOpacity: 1, direction: "forward", flowSpeed: 1, particleDensity: "medium", animated: true, showArrow: false };
}
function port(node: ReturnType<typeof createNode>, position: string): string {
  return node.ports.find((p) => p.position === position)!.id;
}

describe("configurable three-way solenoid", () => {
  it("connects hot water to the shared port in A and the shared port to drain in B", () => {
    const valve = createNode("solenoid3", 0, 0);
    valve.valveCommonPortId = port(valve, "right");
    const water = createNode("inlet", 0, 0), brew = createNode("tank", 0, 0), drain = createNode("outlet", 0, 0);
    const d = { nodes: [water, valve, brew, drain], pipes: [pipe("water", port(water, "right"), port(valve, "left")), pipe("brew", port(valve, "right"), port(brew, "left")), pipe("drain", port(valve, "bottom"), port(drain, "left"))] } as Diagram;
    for (const path of ["A", "B"] as const) {
      valve.valvePath = path;
      // The engine currently models each pipe with an explicitly saved direction.
      d.pipes[1].direction = path === "A" ? "forward" : "reverse";
      setCachedPipes(d.pipes, d.nodes);
      expect(d.pipes.map((p) => pipeEngineeringDisabled(p, d.nodes))).toEqual(path === "A" ? [false, false, true] : [true, false, false]);
    }
  });

  it("allows a configured shared port to connect to an otherwise matching direction", () => {
    const valve = createNode("solenoid3", 0, 0), source = createNode("inlet", 0, 0);
    valve.valveCommonPortId = port(valve, "right");
    const d = { nodes: [valve, source], pipes: [] } as unknown as Diagram;
    expect(validatePipeConnection(d, port(valve, "right"), port(source, "right"))).toBeNull();
    delete valve.valveCommonPortId;
    expect(validatePipeConnection(d, port(valve, "right"), port(source, "right"))).toBe("both-out");
  });

  it("persists the shared port and restores it along with the saved pipe direction", () => {
    const valve = createNode("solenoid3", 0, 0), source = createNode("inlet", 0, 0), drain = createNode("outlet", 0, 0);
    valve.valveCommonPortId = port(valve, "right");
    const d: Diagram = { id: "test", name: "test", nodes: [valve, source, drain], pipes: [pipe("water", port(source, "right"), port(valve, "left"))], settings: { showGrid: true, background: "#ffffff", globalAnimationPlaying: true, crossoverHops: true } };
    const condition = { name: "A", ...snapshotWorkCondition(d) };
    valve.valveCommonPortId = port(valve, "left");
    d.pipes[0].direction = "reverse";
    applyWorkConditionSnapshot(d, condition);
    expect(d.nodes[0].valveCommonPortId).toBe(port(valve, "right"));
    expect(d.pipes[0].direction).toBe("forward");
    const loaded = parseDiagramJSON(JSON.stringify(d));
    expect(loaded.nodes[0].valveCommonPortId).toBe(port(valve, "right"));
    expect(loaded.nodes[0].ports.map((p) => p.direction)).toEqual(["in", "out", "out"]);
  });
});
