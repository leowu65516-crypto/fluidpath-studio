import { describe, it, expect } from "vitest";
import { render, act } from "@testing-library/react";
import { LangProvider } from "../i18n";
import App from "../App";
import { loadDiagram, store } from "../store";
import { pipePolyline } from "../geometry";
import fs from "fs";

describe("修复后文件验证", () => {
  const P = "/Users/leo/Downloads/最新水路图(可打开)_副本.json";
  const json = JSON.parse(fs.readFileSync(P, "utf8"));

  it("加载不抛错且节点数正确", () => {
    render(<LangProvider><App /></LangProvider>);
    expect(() => {
      act(() => { loadDiagram(json); });
    }).not.toThrow();
    expect(store.get().diagram.nodes.length).toBe(62);
    expect(store.get().diagram.pipes.length).toBe(71);
  });

  it("所有管路字段完整可计算折线", () => {
    render(<LangProvider><App /></LangProvider>);
    act(() => { loadDiagram(json); });
    const d = store.get().diagram;
    for (const p of d.pipes) {
      expect(typeof p.visualDiameter, `管路 ${p.id} visualDiameter`).toBe("number");
      expect(typeof p.flowSpeed, `管路 ${p.id} flowSpeed`).toBe("number");
      expect(typeof p.fluidOpacity, `管路 ${p.id} fluidOpacity`).toBe("number");
      expect(pipePolyline(p, d.nodes), `管路 ${p.id} 折线`).toBeTruthy();
    }
  });

  it("无端口冲突", () => {
    render(<LangProvider><App /></LangProvider>);
    act(() => { loadDiagram(json); });
    const d = store.get().diagram;
    const used = new Map<string, number>();
    for (const p of d.pipes) {
      for (const ref of [p.fromPortId, p.toPortId]) {
        if (!ref) continue;
        used.set(ref, (used.get(ref) ?? 0) + 1);
      }
    }
    for (const [ref, cnt] of used) expect(cnt, `端口 ${ref}`).toBe(1);
  });
});
