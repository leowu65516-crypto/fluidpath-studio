import { describe, expect, it } from "vitest";
import { NODE_DEFS, nodeDisplayLabel, nodeCanvasLabel, createNode } from "../symbols";

describe("元件双语名称", () => {
  it("元件库关键元件在英文模式有可用名称", () => {
    expect(nodeDisplayLabel(NODE_DEFS.find((d) => d.type === "pump")!, "en")).toBe("Water pump");
    expect(nodeDisplayLabel(NODE_DEFS.find((d) => d.type === "brewChamber")!, "en")).toBe("Brew chamber");
    expect(nodeDisplayLabel(NODE_DEFS.find((d) => d.type === "solenoid3")!, "en")).toBe("3-way solenoid");
    expect(nodeCanvasLabel(createNode("pump", 0, 0), "en")).toBe("Water pump");
    const custom = createNode("pump", 0, 0, "主泵");
    expect(nodeCanvasLabel(custom, "en")).toBe("主泵");
  });
});
