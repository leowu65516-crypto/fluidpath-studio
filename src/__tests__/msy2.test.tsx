import { describe, it, expect } from "vitest";
import { render, act } from "@testing-library/react";
import { LangProvider } from "../i18n";
import App from "../App";
import { loadDiagram, store, setSelection } from "../store";
import { parseDiagramJSON } from "../export";
import { pipePolyline } from "../geometry";
import msy2 from "../../MSY2.json";

const toDiagram = (json: any) =>
  parseDiagramJSON(JSON.stringify(json));

describe("MSY2 布局 + 介质传播验证", () => {
  it("MSY2 可被 parseDiagramJSON 解析", () => {
    const d = toDiagram(msy2);
    expect(d.nodes.length).toBe(62);
    expect(d.pipes.length).toBe(71);
  });

  it("所有管路能计算出有效折线（无游离死路）", () => {
    const d = toDiagram(msy2);
    for (const p of d.pipes) {
      const pts = pipePolyline(p, d.nodes);
      expect(pts, `管路 ${p.id} 折线无效`).toBeTruthy();
      expect(pts!.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("所有端口被最多一根管路占用", () => {
    const d = toDiagram(msy2);
    const used = new Map<string, number>();
    for (const p of d.pipes) {
      for (const ref of [p.fromPortId, p.toPortId]) {
        if (!ref) continue;
        used.set(ref, (used.get(ref) ?? 0) + 1);
      }
    }
    for (const [ref, n] of used) {
      expect(n, `端口 ${ref} 被 ${n} 根管路占用`).toBe(1);
    }
  });

  it("介质传播：进水线冷水、锅炉出热水、蒸汽锅炉出蒸汽、冲泡缸出咖啡、牛奶线牛奶、排废废液", () => {
    const d = toDiagram(msy2);
    // 按两端节点标签找管路
    const pipeBetween = (a: string, b: string) => {
      const nodeOf = (pid?: string) => {
        if (!pid) return undefined;
        return d.nodes.find((n) => n.ports.some((p) => p.id === pid))?.label;
      };
      return d.pipes.find((p) => {
        const fa = nodeOf(p.fromPortId);
        const ta = nodeOf(p.toPortId);
        return (fa === a && ta === b) || (fa === b && ta === a);
      })?.fluidType;
    };

    // 进水线冷水（热水锅炉由冷水经 Y型三通 → 常温水补水）
    expect(pipeBetween("进水口", "单向阀")).toBe("coldWater");
    expect(pipeBetween("水泵", "过滤器")).toBe("coldWater");

    // 热水锅炉出热水（→ 咖啡冲泡三通电磁阀、牛奶清洗三通电磁阀）
    expect(pipeBetween("热水锅炉", "咖啡冲泡三通电磁阀")).toBe("hotWater");
    expect(pipeBetween("热水锅炉", "牛奶清洗三通电磁阀")).toBe("hotWater");

    // 冲泡缸出咖啡 → 咖啡出口
    expect(pipeBetween("咖啡排废三通电磁阀", "咖啡出口（单）")).toBe("coffee");

    // 蒸汽（蒸汽锅炉→蒸汽三通电磁阀→蒸汽杆）
    expect(pipeBetween("蒸汽锅炉", "蒸汽三通电磁阀")).toBe("steam");
    expect(pipeBetween("蒸汽三通电磁阀", "蒸汽杆")).toBe("steam");

    // 牛奶出口（奶泵→牛奶链→hotMilk）
    expect(pipeBetween("奶泵", "T型三通")).toBe("milk");
    expect(pipeBetween("牛奶排废三通电磁阀", "牛奶出口（单）")).toBe("hotMilk");

    // 排废（咖啡冲泡三通 → 排废接口）
    expect(pipeBetween("咖啡冲泡三通电磁阀", "排废接口")).toBe("wasteLiquid");

    // 各类介质数量合理
    const count = (t: string) => d.pipes.filter((p) => p.fluidType === t).length;
    expect(count("coldWater")).toBeGreaterThanOrEqual(8);
    expect(count("hotWater")).toBeGreaterThanOrEqual(8);
    expect(count("milk")).toBeGreaterThanOrEqual(5);
    expect(count("steam")).toBeGreaterThanOrEqual(3);
    expect(count("coffee")).toBeGreaterThanOrEqual(2);
  });

  it("React 渲染 MSY2 不抛错", () => {
    render(
      <LangProvider>
        <App />
      </LangProvider>
    );
    act(() => {
      loadDiagram(toDiagram(msy2));
    });
    act(() => {
      const d = store.get().diagram;
      setSelection({ nodes: [d.nodes[0].id], pipes: [] });
    });
    expect(store.get().diagram.nodes.length).toBe(62);
  });
});
