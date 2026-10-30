/**
 * 0.3 知识库部件组 ↔ 画布对象的绑定辅助（纯函数，1.46.0）。
 *
 * 背景：MILK-KB 等知识库迁移自手册，部件组本身不带本机图纸的 node/pipe id，
 * 导入后必须把「部件组」落到「本图元件/管路」上才能显示概率描边。
 * 这里提供：未绑定清单、按名称的落点建议（只建议、不偷偷绑定）。
 */
import type { Diagram } from "../types";
import type { HighlightGroup } from "./types";

/** 去掉手册编号前缀与括号注释，得到用于匹配的部件名核心（如「16. 进奶管路」→「进奶管路」）。 */
export function normalizePartLabel(label: { zh?: string; en?: string }): string {
  const raw = (label.zh || label.en || "").trim();
  return raw
    .replace(/^\s*\d+\s*[.、)]\s*/u, "")
    .replace(/[（(][^）)]*[）)]/gu, "")
    .replace(/\s+/gu, "")
    .toLowerCase();
}

/** 尚未绑定任何画布对象的部件组。 */
export function unboundGroups(profile: { highlightGroups: HighlightGroup[] }): HighlightGroup[] {
  return profile.highlightGroups.filter(g => g.nodeIds.length === 0 && g.pipeIds.length === 0);
}

export interface GroupTargetSuggestion {
  nodes: string[];
  pipes: string[];
}

/**
 * 按名称建议落点：部件组标签核心与元件/管路标签做「相等 > 包含」匹配。
 * 返回空数组表示没有可自动建议的落点（如「配方与软件设置」这类手册类别），
 * 调用方必须让用户显式确认后再绑定，绝不静默写入。
 */
export function suggestGroupTargets(diagram: Diagram, group: HighlightGroup): GroupTargetSuggestion {
  const core = normalizePartLabel(group.label);
  if (core.length < 2) return { nodes: [], pipes: [] };
  const score = (label: string): number => {
    const text = label.replace(/\s+/gu, "").toLowerCase();
    if (!text) return 0;
    if (text === core) return 3;
    if (text.includes(core)) return 2;
    if (text.length >= 2 && core.includes(text)) return 2;
    return 0;
  };
  const rank = <T extends { id: string; label: string }>(items: T[]): string[] => items
    .map(item => ({ id: item.id, score: score(item.label), length: item.label.length }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.length - b.length || a.id.localeCompare(b.id))
    .slice(0, 12)
    .map(item => item.id);
  return {
    nodes: rank(diagram.nodes.map(n => ({ id: n.id, label: n.label }))),
    pipes: rank(diagram.pipes.map(p => ({ id: p.id, label: p.label }))),
  };
}
