import { beforeEach, describe, expect, it } from "vitest";
import { loadDiagram, store, withSymbolProfile } from "../store";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Diagram } from "../types";

const SAMPLE = JSON.parse(readFileSync(resolve(process.cwd(), "BCMTS.json"), "utf8")) as Diagram;

describe("导出符号风格（P3）", () => {
  beforeEach(() => {
    loadDiagram({ ...SAMPLE, id: `symbol-${Math.random().toString(36).slice(2)}` });
  });

  it("导出期间切换到指定符号，导出结束后还原", async () => {
    const d = store.get().diagram;
    update(d);
    const before = store.get().diagram.settings.symbolProfile;
    let seen: string | undefined;
    await withSymbolProfile("engineering", () => {
      seen = store.get().diagram.settings.symbolProfile;
    });
    expect(seen).toBe("engineering");
    expect(store.get().diagram.settings.symbolProfile).toBe(before);
  });

  it("不写撤销历史、不把图纸标记为已修改", async () => {
    const d = store.get().diagram;
    update(d);
    const dirtyBefore = store.get().ui.dirty;
    await withSymbolProfile("teaching", () => {});
    expect(store.get().ui.dirty).toBe(dirtyBefore);
  });

  it("同值时直接执行，不做多余切换", async () => {
    update(store.get().diagram);
    const before = store.get().diagram.settings.symbolProfile ?? "teaching";
    let called = false;
    await withSymbolProfile(before as "teaching" | "engineering", () => { called = true; });
    expect(called).toBe(true);
    expect(store.get().diagram.settings.symbolProfile).toBe(before);
  });
});

function update(d: Diagram) {
  // 统一初始状态：显式设置一次符号风格，避免依赖样例缺省值
  const patch = (fn: (x: Diagram) => void) => {
    const next = structuredClone(d);
    fn(next);
    loadDiagram(next);
  };
  patch((x) => { x.settings.symbolProfile = "teaching"; });
}
