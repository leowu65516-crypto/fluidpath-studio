import { describe, it, expect } from "vitest";
import { parseDiagramJSON } from "../export";
import { pipePolyline } from "../geometry";
import { render } from "@testing-library/react";
import App from "../App";
import b2c from "../../MSY2.json";

const text = JSON.stringify(b2c);

describe("B2C 咖啡机流体系统图 JSON 加载", () => {
  it("可被 parseDiagramJSON 解析", () => {
    const d = parseDiagramJSON(text);
    expect(d.nodes.length).toBe(62);
    expect(d.pipes.length).toBe(71);
  });

  it("所有管路都能计算出有效折线（端口引用正确）", () => {
    const d = parseDiagramJSON(text);
    for (const p of d.pipes) {
      const pts = pipePolyline(p, d.nodes);
      expect(pts, `管路 ${p.id} 折线无效`).toBeTruthy();
      expect(pts!.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("端口唯一占用（避免渲染冲突）", () => {
    const d = parseDiagramJSON(text);
    const used = new Map<string, number>();
    for (const p of d.pipes) {
      for (const ref of [p.fromPortId, p.toPortId]) {
        if (!ref) continue;
        used.set(ref, (used.get(ref) ?? 0) + 1);
      }
    }
    for (const [ref, n] of used) expect(n, `端口 ${ref} 被 ${n} 根管路占用`).toBe(1);
  });

  it("React 渲染 App 不抛错", () => {
    expect(() => render(<App />)).not.toThrow();
  });
});
