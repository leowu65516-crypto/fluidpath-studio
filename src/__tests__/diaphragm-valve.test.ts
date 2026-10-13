import { describe, expect, it } from "vitest";
import { createNode } from "../symbols";
import { pipeEngineeringDisabled, setCachedPipes } from "../geometry";
import { runValidationCase } from "../validation";
import type { Diagram, Pipe } from "../types";

function port(node: ReturnType<typeof createNode>, position: "left" | "right" | "bottom") {
  const found = node.ports.find((item) => item.position === position);
  if (!found) throw new Error(`missing ${position} port`);
  return found.id;
}

function pipe(id: string, fromPortId: string, toPortId: string): Pipe {
  return {
    id, label: id, fromPortId, toPortId, points: [], nominalDiameter: "DN6", visualDiameter: 2,
    wallColor: "#444", fluidColor: "#2f7fd6", fluidOpacity: 1, direction: "forward",
    flowSpeed: 1, particleDensity: "medium", animated: true, showArrow: false,
  };
}

function selectorDiagram(path: "A" | "B"): Diagram {
  const sourceA = createNode("inlet", 0, 80, "A source");
  const sourceB = createNode("inlet", 0, 250, "B source");
  const selector = createNode("diaphragmValve3", 180, 140, "Selector");
  selector.valvePath = path;
  const outlet = createNode("outlet", 360, 150, "Outlet");
  return {
    id: "diaphragm-selector", name: "Diaphragm selector", nodes: [sourceA, sourceB, selector, outlet],
    pipes: [
      pipe("A", port(sourceA, "right"), port(selector, "left")),
      pipe("B", port(sourceB, "right"), port(selector, "bottom")),
      pipe("C", port(selector, "right"), port(outlet, "left")),
    ],
    settings: { showGrid: true, background: "#eef2f7", globalAnimationPlaying: true, crossoverHops: true },
  };
}

describe("diaphragm valves", () => {
  it("creates a 3-port, 2-position selector with two inlets and one outlet", () => {
    const valve = createNode("diaphragmValve3", 0, 0);
    expect(valve.valvePath).toBe("A");
    expect(valve.showStateOnDiagram).toBe(true);
    expect(valve.ports.map((item) => [item.position, item.direction])).toEqual([
      ["left", "in"], ["bottom", "in"], ["right", "out"],
    ]);
    expect(createNode("diaphragmValve2", 0, 0).valveState).toBe("open");
  });

  it("only permits the selected A→C or B→C branch to carry engineering flow", () => {
    const aRoute = selectorDiagram("A");
    setCachedPipes(aRoute.pipes, aRoute.nodes);
    expect(pipeEngineeringDisabled(aRoute.pipes[0], aRoute.nodes)).toBe(false);
    expect(pipeEngineeringDisabled(aRoute.pipes[1], aRoute.nodes)).toBe(true);
    expect(pipeEngineeringDisabled(aRoute.pipes[2], aRoute.nodes)).toBe(false);

    const bRoute = selectorDiagram("B");
    setCachedPipes(bRoute.pipes, bRoute.nodes);
    expect(pipeEngineeringDisabled(bRoute.pipes[0], bRoute.nodes)).toBe(true);
    expect(pipeEngineeringDisabled(bRoute.pipes[1], bRoute.nodes)).toBe(false);
    expect(pipeEngineeringDisabled(bRoute.pipes[2], bRoute.nodes)).toBe(false);
  });

  it("rejects an off state for a selector that has only two legal positions", () => {
    const diagram = selectorDiagram("A");
    const selector = diagram.nodes.find((node) => node.type === "diaphragmValve3")!;
    const result = runValidationCase(diagram, {
      id: "invalid-selector-path", name: "Invalid selector path", state: { [selector.id]: { valvePath: "off" } },
      mustFlowPipeIds: ["C"], mustStopPipeIds: [],
    });
    expect(result.status).toBe("INVALID");
    expect(result.issues).toContain(`INVALID_VALVE_PATH: ${selector.id}`);
  });
});
