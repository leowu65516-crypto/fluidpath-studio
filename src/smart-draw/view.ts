import type { DiagramNode, Pipe } from "../types";

/** 画布/缩略图共用的智能绘图视图模式。 */
export type SmartViewMode = "all" | "main";

export interface SmartViewProjection {
  hiddenNodeIds: Set<string>;
  hiddenPortIds: Set<string>;
  visibleNodes: DiagramNode[];
  visiblePipes: Pipe[];
}

/**
 * 智能绘图的“主链视图”投影：缩略图与插入后的画布必须走同一套规则，
 * 否则同一根管在缩略图里和画布里会算出不同折线，看起来像两张图。
 *
 * 规则：
 * - 压力表、安全阀、OPV 是分支附件，主链视图隐藏；
 * - 咖啡机整机里，模板标记为 smartSecondary 的奶路/蒸汽/排废节点隐藏；
 * - 所有相连管路都被隐藏的接头（空标签三通/四通）一并隐藏，避免悬空；
 * - 串联件（单向阀、流量计、分配三通）保留，主链不断开。
 * - 非咖啡机模板（水路/咖啡/奶路/蒸汽/即热）不因 smartSecondary 隐藏自身主链。
 */
export function smartViewProjection(nodes: DiagramNode[], pipes: Pipe[], mode: SmartViewMode): SmartViewProjection {
  const hiddenNodeIds = new Set<string>();
  if (mode === "main") {
    const accessory = new Set(["pressureGauge", "safetyValve", "opv"]);
    const hasCoffee = nodes.some((n) => n.type === "coffeeOutlet");
    for (const n of nodes) {
      if (accessory.has(n.type)) hiddenNodeIds.add(n.id);
      else if (hasCoffee && n.smartSecondary) hiddenNodeIds.add(n.id);
      else if (n.type === "outlet" && /排废|清洗|relief|drain|clean|safety/i.test(n.label)) hiddenNodeIds.add(n.id);
    }
  }

  const hiddenPortIds = new Set<string>();
  for (const n of nodes) {
    if (hiddenNodeIds.has(n.id)) for (const p of n.ports) hiddenPortIds.add(p.id);
  }

  // 第二遍：只剩“所有相连管都被隐藏”的接头时，连节点一起藏掉。
  if (mode === "main") {
    for (const node of nodes) {
      if (hiddenNodeIds.has(node.id)) continue;
      const ownPorts = new Set(node.ports.map((p) => p.id));
      const incident = pipes.filter((p) => ownPorts.has(p.fromPortId ?? "") || ownPorts.has(p.toPortId ?? ""));
      if (!incident.length) {
        hiddenNodeIds.add(node.id);
        for (const p of node.ports) hiddenPortIds.add(p.id);
        continue;
      }
      const anyVisible = incident.some((p) => {
        const other = [p.fromPortId, p.toPortId].find((pid) => pid && !ownPorts.has(pid));
        return other !== undefined && !hiddenPortIds.has(other);
      });
      if (!anyVisible) {
        hiddenNodeIds.add(node.id);
        for (const p of node.ports) hiddenPortIds.add(p.id);
      }
    }
  }

  const visibleNodes = nodes.filter((n) => !hiddenNodeIds.has(n.id));
  const visiblePipes = pipes.filter((p) => {
    if (p.fromPortId && hiddenPortIds.has(p.fromPortId)) return false;
    if (p.toPortId && hiddenPortIds.has(p.toPortId)) return false;
    return true;
  });
  return { hiddenNodeIds, hiddenPortIds, visibleNodes, visiblePipes };
}
