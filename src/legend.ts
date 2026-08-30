/**
 * 图例构建（从 store.ts 拆出的纯函数模块，v1.18）：
 * - 供画布「生成图例」与导出预览对话框共用（单一数据源）；
 * - 状态段解释阀/泵红绿语义，解决导出图自解释问题；
 * - 不依赖 store，可安全被 export.ts 引用。
 */

import type { Diagram, DiagramNode } from "./types";
import { FLUID_PRESETS } from "./types";
import { createNode } from "./symbols";

export interface LegendOpts {
  fluid: boolean;
  diameter: boolean;
  status: boolean;
}

/**
 * 构建图例节点（纯函数，不修改画布）：
 * - fluid/diameter：按图纸实际出现的介质与管径动态生成；
 * - status：按图纸出现的元件类型生成「状态颜色说明」（绿=开/运行/A 路、红=关/停止、蓝=B 路）。
 * 图例文字按当前 UI 语言生成（导出物随界面语言）。
 */
export function buildLegendNodes(diagram: Diagram, x: number, y: number, opts: LegendOpts, lang: "zh" | "en" = "zh"): DiagramNode[] {
  const L = (zh: string, en: string) => (lang === "zh" ? zh : en);
  const { pipes, nodes } = diagram;
  const fluidSet = new Map<string, { color: string; label: string }>();
  const diamSet = new Set<string>();
  for (const p of pipes) {
    const ft = p.fluidType && p.fluidType !== "custom" ? p.fluidType : null;
    if (ft) fluidSet.set(ft, { color: p.fluidColor, label: FLUID_PRESETS.find((f) => f.key === ft)?.label ?? ft });
    diamSet.add(p.nominalDiameter);
  }
  const hasType = (t: string) => nodes.some((n) => n.type === t);
  const hasPump = nodes.some((n) => n.type === "pump" || n.type === "milkPump" || n.type === "airPump");
  const legendNodes: DiagramNode[] = [];
  let ly = y;
  const push = (n: DiagramNode) => { legendNodes.push(n); };
  const capsule = (text: string, color: string, textColor = "#ffffff") => {
    const box = createNode("shape", x, ly, text, "rect");
    box.width = 130; box.height = 28; box.fill = color; box.fontSize = 13; box.stroke = textColor;
    push(box);
    ly += 34;
  };
  const section = (text: string) => {
    const lbl = createNode("label", x, ly, text);
    lbl.fontSize = 13;
    push(lbl);
    ly += 22;
  };
  // 标题
  const title = createNode("label", x, ly, L("图例", "Legend"));
  title.fontSize = 16;
  push(title);
  ly += 28;
  // 介质
  if (opts.fluid && fluidSet.size > 0) {
    section(L("【介质】", "[Fluids]"));
    fluidSet.forEach((v) => capsule(v.label, v.color, "#1f2c3d"));
    ly += 6;
  }
  // 管径
  if (opts.diameter && diamSet.size > 0) {
    section(L("【管径】", "[Diameters]"));
    diamSet.forEach((d2) => {
      const t = createNode("label", x, ly, d2);
      t.fontSize = 13;
      push(t);
      ly += 22;
    });
    ly += 6;
  }
  // 阀/泵状态
  if (opts.status) {
    const rows: Array<{ text: string; color: string }> = [];
    if (hasType("solenoid2")) {
      rows.push({ text: L("两通阀：开（导通）", "2-way valve: open"), color: "#3fae6a" });
      rows.push({ text: L("两通阀：关（切断）", "2-way valve: closed"), color: "#d9534f" });
    }
    if (hasType("solenoid3")) {
      rows.push({ text: L("三通阀：A 路导通", "3-way valve: path A"), color: "#3fae6a" });
      rows.push({ text: L("三通阀：B 路导通", "3-way valve: path B"), color: "#2f7fd6" });
      rows.push({ text: L("三通阀：关闭", "3-way valve: off"), color: "#d9534f" });
    }
    if (hasPump) {
      rows.push({ text: L("泵：运行", "Pump: running"), color: "#3fae6a" });
      rows.push({ text: L("泵：停止", "Pump: stopped"), color: "#d9534f" });
    }
    if (rows.length > 0) {
      section(L("【状态】", "[States]"));
      for (const r of rows) capsule(r.text, r.color);
    }
  }
  return legendNodes;
}
