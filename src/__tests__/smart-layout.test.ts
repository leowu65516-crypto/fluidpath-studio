import { describe, it, expect } from "vitest";
import { SMART_TEMPLATES, buildSmartTemplate } from "../smart-draw/templates";
import { nodeBBox } from "../geometry";

describe("智能绘图模板布局", () => {
  it("所有模板的元件矩形互不重叠", () => {
    for (const template of SMART_TEMPLATES) {
      const result = buildSmartTemplate(template, {});
      const boxes = result.nodes.map((node) => ({ node, box: nodeBBox(node) }));
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i].box;
          const b = boxes[j].box;
          const overlaps = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
          if (overlaps) throw new Error(`${template.id}: ${boxes[i].node.label} overlaps ${boxes[j].node.label}`);
        }
      }
    }
  });

  it("整机 / 双锅炉骨架带四个分区提示，且只有一个进水口", () => {
    for (const id of ["full", "dual-boiler"]) {
      const template = SMART_TEMPLATES.find((t) => t.id === id)!;
      const result = buildSmartTemplate(template, {});
      expect(result.zones?.map((z) => z.id)).toEqual(["supply", "coffee", "steam-milk", "drain"]);
      expect(result.nodes.filter((n) => n.type === "inlet")).toHaveLength(1);
    }
  });
});
