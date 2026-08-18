import { describe, expect, it } from "vitest";
import { createFullAutoMachineDiagram } from "../sample";
import { pipeEngineeringDisabled, setCachedPipes } from "../geometry";

describe("蒸汽锅炉排废", () => {
  it("排废两通阀打开时，锅炉底部至排出口保持可流动", () => {
    const d = createFullAutoMachineDiagram();
    const valve = d.nodes.find((n) => n.id === "fa_drain")!;
    valve.valveState = "open";
    setCachedPipes(d.pipes, d.nodes);
    const drainPipes = d.pipes.filter((p) => p.label === "排废收集" || p.label === "排废排出");
    expect(drainPipes).toHaveLength(2);
    drainPipes.forEach((p) => expect(pipeEngineeringDisabled(p, d.nodes), p.label).toBe(false));
    valve.valveState = "closed";
    setCachedPipes(d.pipes, d.nodes);
    drainPipes.forEach((p) => expect(pipeEngineeringDisabled(p, d.nodes), p.label).toBe(true));
  });
});
