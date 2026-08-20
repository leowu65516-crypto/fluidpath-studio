import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { parseDiagramJSON } from "../export";
import {
  setCachedPipes,
  computeDisabledPipes,
  pipeEffectiveDisabled,
} from "../geometry";
import type { Diagram } from "../types";

const raw = JSON.parse(readFileSync("/Users/leo/Documents/测试/BCTM2S.json", "utf8"));

describe("BCTM2S Smart-Y diagram validation", () => {
  it("parses cleanly through parseDiagramJSON", () => {
    const d = parseDiagramJSON(JSON.stringify(raw)) as Diagram;
    expect(d).toBeDefined();
    expect(d.nodes.length).toBe(raw.nodes.length);
    expect(d.pipes.length).toBe(raw.pipes.length);
  });

  it("has all ports connected (no orphans)", () => {
    const d = parseDiagramJSON(JSON.stringify(raw)) as Diagram;
    const portToNode = new Map<string, string>();
    d.nodes.forEach(n => (n.ports || []).forEach(p => portToNode.set(p.id, n.id)));
    d.pipes.forEach(p => {
      expect(portToNode.has(p.fromPortId!), `pipe ${p.id} fromPort ${p.fromPortId} orphan`);
      expect(portToNode.has(p.toPortId!), `pipe ${p.id} toPort ${p.toPortId} orphan`);
    });
  });

  it("engine computes without errors in default state", () => {
    const d = parseDiagramJSON(JSON.stringify(raw)) as Diagram;
    setCachedPipes(d.pipes, d.nodes);
    const disabled = computeDisabledPipes(d.pipes, d.nodes);
    expect(disabled.size).toBeGreaterThanOrEqual(0);
    console.log(`BCTM2S: ${d.nodes.length} nodes, ${d.pipes.length} pipes`);
    console.log(`  BFS disabled count = ${disabled.size}`);
    d.pipes.forEach(p => {
      const eff = pipeEffectiveDisabled(p, d.nodes);
      console.log(`  ${p.id} (${p.label}) fluid=${p.fluidType} -> ${eff ? "STOP" : "FLOW"} (BFS=${disabled.has(p.id)})`);
    });
    const flowing = d.pipes.filter(p => !pipeEffectiveDisabled(p, d.nodes));
    console.log(`  >>> ${flowing.length}/${d.pipes.length} pipes flow in default state`);
  });

  it("work conditions apply without errors", () => {
    const d = parseDiagramJSON(JSON.stringify(raw)) as Diagram;
    for (const cond of d.settings.workConditions || []) {
      for (const [nid, s] of Object.entries(cond.state)) {
        const n = d.nodes.find(x => x.id === nid);
        if (!n) { console.warn(`  cond ${cond.name}: missing node ${nid}`); continue; }
        if (s.pumpOn !== undefined) n.pumpOn = s.pumpOn;
        if (s.valveState !== undefined) n.valveState = s.valveState;
        if (s.valvePath !== undefined) n.valvePath = s.valvePath;
      }
      setCachedPipes(d.pipes, d.nodes);
      const flowing = d.pipes.filter(p => !pipeEffectiveDisabled(p, d.nodes));
      console.log(`  cond [${cond.name}]: ${flowing.length}/${d.pipes.length} pipes flow`);
    }
  });
});
