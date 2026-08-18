import { describe, it, expect } from "vitest";
import { store } from "../store";
import { render } from "@testing-library/react";
import { LangProvider } from "../i18n";
import App from "../App";
import fixedJson from "../../MSY2.json";
import type { Diagram } from "../types";

const toDiagram = (json: any): Diagram =>
  JSON.parse(JSON.stringify(json)) as Diagram;

function renderApp() {
  return render(
    <LangProvider>
      <App />
    </LangProvider>
  );
}

describe("锅炉循环液路示例_理论修复 验证", () => {
  it("可被加载且结构完整", () => {
    const d = toDiagram(fixedJson);
    expect(d.nodes.length).toBe(62);
    expect(d.pipes.length).toBe(71);
    // 端口无冲突
    const used = new Map<string, number>();
    for (const p of d.pipes) {
      for (const ref of [p.fromPortId, p.toPortId]) {
        if (!ref) continue;
        used.set(ref, (used.get(ref) ?? 0) + 1);
      }
    }
    for (const [ref, cnt] of used) expect(cnt, `端口 ${ref} 冲突`).toBe(1);
  });

  it("三通阀状态合理：主路 A 导通，off 阀为默认关闭的分支", () => {
    const d = toDiagram(fixedJson);
    const valves = d.nodes.filter((n) => n.type === "solenoid3");
    // 主路咖啡/牛奶/蒸汽阀为 A
    expect(d.nodes.find((n) => n.label === "咖啡冲泡三通电磁阀")?.valvePath).toBe("A");
    expect(d.nodes.find((n) => n.label === "咖啡排废三通电磁阀")?.valvePath).toBe("A");
    expect(d.nodes.find((n) => n.label === "牛奶排废三通电磁阀")?.valvePath).toBe("A");
    expect(d.nodes.find((n) => n.label === "蒸汽三通电磁阀")?.valvePath).toBe("A");
    expect(d.nodes.find((n) => n.label === "牛奶加热三通电磁阀")?.valvePath).toBe("A");
    // off 分支阀（美式热水/热水杆/牛奶清洗）按设计默认关闭
    expect(d.nodes.find((n) => n.label === "美式热水三通电磁阀")?.valvePath).toBe("off");
    expect(d.nodes.find((n) => n.label === "热水杆三通电磁阀")?.valvePath).toBe("off");
    expect(d.nodes.find((n) => n.label === "牛奶清洗三通电磁阀")?.valvePath).toBe("off");
    expect(valves.length).toBeGreaterThan(3);
  });

  it("蒸汽锅炉顶部输出全部为蒸汽（无热水错标）", () => {
    const d = toDiagram(fixedJson);
    const portToNode = new Map<string, { node: any; port: any }>();
    d.nodes.forEach((n) => n.ports.forEach((p) => portToNode.set(p.id, { node: n, port: p })));
    const sbTopPipes = d.pipes.filter((p) => {
      const f = p.fromPortId ? portToNode.get(p.fromPortId) : null;
      return f?.node.type === "steamBoiler" && f.port.position === "top";
    });
    for (const p of sbTopPipes) {
      expect(p.fluidType, `蒸汽锅炉顶部 ${p.label} 介质应为 steam`).toBe("steam");
    }
  });

  it("奶泵端口方向修正为 left=out/right=in", () => {
    const d = toDiagram(fixedJson);
    const mp = d.nodes.find((n) => n.type === "milkPump")!;
    const left = mp.ports.find((p) => p.position === "left");
    const right = mp.ports.find((p) => p.position === "right");
    expect(left?.direction).toBe("out");
    expect(right?.direction).toBe("in");
  });

  it("悬空设备已接线（压力表1、美式热水出口）", () => {
    const d = toDiagram(fixedJson);
    const portToNode = new Map<string, { node: any; port: any }>();
    d.nodes.forEach((n) => n.ports.forEach((p) => portToNode.set(p.id, { node: n, port: p })));
    // 无任何完全悬空的节点
    const dangling = d.nodes.filter((n) => {
      const connected = d.pipes.some((p) => n.ports.some((pp) => pp.id === p.fromPortId || pp.id === p.toPortId));
      return !connected;
    });
    expect(dangling.length).toBe(0);
  });

  it("React 渲染修复版不抛错", () => {
    renderApp();
    const diagram = toDiagram(fixedJson);
    store.get().diagram = diagram;
    expect(store.get().diagram.nodes.length).toBe(62);
  });

  it("介质链纯净：奶泵吸牛奶、咖啡出口出咖啡、牛奶出口热牛奶", () => {
    const d = toDiagram(fixedJson);
    // 奶泵吸入端介质 = milk
    const mp = d.nodes.find((n) => n.type === "milkPump")!;
    const mpIn = mp.ports.find((p) => p.direction === "in")!;
    const mpInPipe = d.pipes.find((p) => p.toPortId === mpIn.id);
    expect(mpInPipe?.fluidType).toBe("milk");

    // 咖啡出口入端介质 = coffee
    const cof = d.nodes.find((n) => n.type === "coffeeOutlet")!;
    const cofInPipe = d.pipes.find((p) => p.toPortId && cof.ports.some((pp) => pp.id === p.toPortId));
    expect(cofInPipe?.fluidType).toBe("coffee");

    // 牛奶出口入端 = hotMilk
    const milkOut = d.nodes.find((n) => n.type === "milkOutlet")!;
    const milkOutPipe = d.pipes.find((p) => p.toPortId && milkOut.ports.some((pp) => pp.id === p.toPortId));
    expect(milkOutPipe?.fluidType).toBe("hotMilk");

    // 牛奶加热三通出侧 = steam（加热用）
    const heat = d.nodes.find((n) => n.label === "牛奶加热三通电磁阀")!;
    const heatOut = d.pipes.filter((p) => p.fromPortId && heat.ports.some((pp) => pp.id === p.fromPortId));
    expect(heatOut.length).toBeGreaterThan(0);
    expect(heatOut.every((p) => p.fluidType === "steam")).toBe(true);
  });

  it("无咖啡链混入热水：咖啡出口入端只有咖啡介质", () => {
    const d = toDiagram(fixedJson);
    const cof = d.nodes.find((n) => n.type === "coffeeOutlet")!;
    const cofPipes = d.pipes.filter((p) => cof.ports.some((pp) => pp.id === p.fromPortId || pp.id === p.toPortId));
    for (const p of cofPipes) {
      expect(p.fluidType, `${p.label} 介质`).toBe("coffee");
    }
  });
});
