import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { findPipeOverlaps } from "../smart-draw/overlap";
import { applyReroutePreview, loadDiagram, previewRerouteAll, rerouteAllPipes, routeModeOf, smartTidyPipes, store, undo, updateDiagram as updateDiagramForTest } from "../store";
import type { Diagram } from "../types";

/** 仓库内三份真实机型图（不进客户图纸，只用项目自带的样例） */
const SAMPLES = ["BCMTS.json", "BCTMS.json", "MSY2.json"].map((name) => ({
  name,
  data: JSON.parse(readFileSync(resolve(process.cwd(), name), "utf8")) as Diagram
}));

function manualCount(d: Diagram): number {
  return d.pipes.filter((p) => routeModeOf(p) === "manual").length;
}

describe("智能整理（真实图纸回归）", () => {
  beforeEach(() => {
    // 每个用例前清掉上一条图，避免 autosave 迁移逻辑互相影响
    loadDiagram({ ...SAMPLES[0].data, id: `tidy-${Math.random().toString(36).slice(2)}` });
  });

  it("样例载入后旧图纸的折点被推断为手工布线", () => {
    for (const { data, name } of SAMPLES) {
      loadDiagram({ ...data, id: `probe-${name}` });
      const d = store.get().diagram;
      const withPoints = d.pipes.filter((p) => p.points.length).length;
      expect(d.pipes.every((p) => p.routeMode === "manual" || p.routeMode === "auto")).toBe(true);
      expect(manualCount(d)).toBe(withPoints);
    }
  });

  it("智能整理：手工布线数量不减少，重合对不高于整理前", () => {
    for (const { data, name } of SAMPLES) {
      loadDiagram({ ...data, id: `tidy-${name}` });
      const beforeDiagram = store.get().diagram;
      const beforeOverlaps = findPipeOverlaps(beforeDiagram).length;
      const beforeManual = manualCount(beforeDiagram);
      const result = smartTidyPipes();
      const afterDiagram = store.get().diagram;
      const afterOverlaps = findPipeOverlaps(afterDiagram).length;
      expect(manualCount(afterDiagram)).toBe(beforeManual);
      expect(afterOverlaps).toBeLessThanOrEqual(beforeOverlaps);
      expect(result.untouchedManual + result.nudgedManual).toBe(beforeManual);
    }
  });

  it("智能整理后三份样例的重合为 0（清 auto + 平移 manual 两档合力）", () => {
    for (const { data, name } of SAMPLES) {
      loadDiagram({ ...data, id: `zero-${name}` });
      smartTidyPipes();
      expect(findPipeOverlaps(store.get().diagram).length).toBe(0);
    }
  });

  it("整理只记一条撤销：撤销后回到整理前状态", () => {
    const { data } = SAMPLES[0];
    loadDiagram({ ...data, id: "undo-probe" });
    const before = JSON.stringify(store.get().diagram.pipes.map((p) => [p.id, p.points, p.routeMode]));
    smartTidyPipes();
    expect(JSON.stringify(store.get().diagram.pipes.map((p) => [p.id, p.points, p.routeMode]))).not.toBe(before);
    undo();
    expect(JSON.stringify(store.get().diagram.pipes.map((p) => [p.id, p.points, p.routeMode]))).toBe(before);
  });

  it("重排全部：带占用表后重合对不高于整理前（此前实测会从 2 涨到 16）", () => {
    let before = 0;
    let after = 0;
    for (const { data, name } of SAMPLES) {
      loadDiagram({ ...data, id: `all-${name}` });
      before += findPipeOverlaps(store.get().diagram).length;
      rerouteAllPipes();
      after += findPipeOverlaps(store.get().diagram).length;
    }
    expect(after).toBeLessThanOrEqual(before + 1);
    expect(after).toBeLessThanOrEqual(3);
  });
});

describe("重排预览与曲线管跳过", () => {
  beforeEach(() => {
    loadDiagram({ ...SAMPLES[0].data, id: `preview-${Math.random().toString(36).slice(2)}` });
  });

  it("预览只算不写：图纸与撤销栈都不变", () => {
    const before = JSON.stringify(store.get().diagram.pipes.map((p) => [p.id, p.points]));
    const manualBefore = store.get().diagram.pipes.filter((p) => routeModeOf(p) === "manual").length;
    const preview = previewRerouteAll();
    expect(preview.routes.length).toBeGreaterThan(0);
    expect(preview.manualCleared).toBe(manualBefore);
    expect(JSON.stringify(store.get().diagram.pipes.map((p) => [p.id, p.points]))).toBe(before);
  });

  it("应用预览后才写回，且只产生一条撤销", () => {
    const before = JSON.stringify(store.get().diagram.pipes.map((p) => [p.id, p.points]));
    const preview = previewRerouteAll();
    applyReroutePreview(preview);
    const after = JSON.stringify(store.get().diagram.pipes.map((p) => [p.id, p.points]));
    expect(after).not.toBe(before);
    undo();
    expect(JSON.stringify(store.get().diagram.pipes.map((p) => [p.id, p.points]))).toBe(before);
  });

  it("曲线模式的管不参与重排，折点原样保留", () => {
    const curvedPipe = store.get().diagram.pipes[0];
    updateDiagramForTest((d) => { d.pipes[0].routing = "curved"; d.pipes[0].points = [{ x: 10, y: 20 }]; });
    const preview = previewRerouteAll();
    expect(preview.skippedCurved).toBeGreaterThan(0);
    expect(preview.routes.some((r) => r.id === curvedPipe.id)).toBe(false);
    applyReroutePreview(preview);
    const kept = store.get().diagram.pipes.find((p) => p.id === curvedPipe.id)!;
    expect(kept.points).toEqual([{ x: 10, y: 20 }]);
  });
});
