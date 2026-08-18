/**
 * BOM / 元件清单导出：按类型分组统计设备与管路，生成 Markdown 清单。
 * 面向「实战落地」——工程交付时一键生成设备编号清单。
 */

import type { Diagram } from "./types";
import { defOf } from "./symbols";

/** 纯注释类元件：不计入元件清单 */
const EXCLUDE = new Set(["label", "arrow", "annotation", "image"]);

export function buildBom(diagram: Diagram): string {
  const lines: string[] = [];
  lines.push(`# 元件清单（BOM）`);
  lines.push(`- **项目**：${diagram.name || "未命名"}`);
  lines.push(`- **生成时间**：${new Date().toLocaleString("zh-CN")}`);
  lines.push(``);

  // 元件分组（按类型 + 变体）
  const groups = new Map<string, { name: string; labels: string[] }>();
  for (const n of diagram.nodes) {
    if (EXCLUDE.has(n.type)) continue;
    const def = defOf(n.type, n.variant);
    const key = `${n.type}${n.variant ? "_" + n.variant : ""}`;
    if (!groups.has(key)) groups.set(key, { name: def.label, labels: [] });
    groups.get(key)!.labels.push(n.label || def.label);
  }
  const sortedGroups = [...groups.entries()].sort((a, b) => b[1].labels.length - a[1].labels.length);
  const totalNodes = sortedGroups.reduce((s, [, g]) => s + g.labels.length, 0);

  lines.push(`## 元件（${groups.size} 种 / ${totalNodes} 件）`);
  lines.push(``);
  lines.push(`| 序号 | 元件 | 数量 | 编号 |`);
  lines.push(`| --- | --- | --- | --- |`);
  let idx = 1;
  for (const [, g] of sortedGroups) {
    lines.push(`| ${idx++} | ${g.name} | ${g.labels.length} | ${g.labels.join("、")} |`);
  }
  lines.push(``);

  // 管路统计（按管径）
  const diamCount = new Map<string, number>();
  const materialCount = new Map<string, number>();
  for (const p of diagram.pipes) {
    const d = p.nominalDiameter || "?";
    diamCount.set(d, (diamCount.get(d) ?? 0) + 1);
    const m = p.material || "custom";
    materialCount.set(m, (materialCount.get(m) ?? 0) + 1);
  }
  lines.push(`## 管路（共 ${diagram.pipes.length} 条）`);
  lines.push(``);
  lines.push(`| 管径 | 数量 |`);
  lines.push(`| --- | --- |`);
  for (const [d, c] of [...diamCount.entries()].sort()) {
    lines.push(`| ${d} | ${c} |`);
  }
  lines.push(``);

  return lines.join("\n");
}

export function downloadBom(diagram: Diagram) {
  const text = buildBom(diagram);
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${diagram.name || "fluidpath"}_BOM清单.md`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
