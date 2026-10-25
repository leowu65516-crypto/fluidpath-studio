import type { Diagram, DiagramNode, Pipe } from "../types";

export type EngineeringSeverity = "error" | "warning";

export interface EngineeringIssue {
  id: string;
  severity: EngineeringSeverity;
  titleZh: string;
  titleEn: string;
  messageZh: string;
  messageEn: string;
  nodeIds: string[];
  pipeIds: string[];
}

const isEn = () => typeof document !== "undefined" && document.documentElement.lang === "en";
const L = (zh: string, en: string) => (isEn() ? en : zh);

function buildGraph(diagram: Diagram) {
  const portToNode = new Map<string, DiagramNode>();
  for (const n of diagram.nodes) for (const p of n.ports) portToNode.set(p.id, n);
  const nodePipes = new Map<string, Pipe[]>();
  for (const n of diagram.nodes) nodePipes.set(n.id, []);
  for (const pipe of diagram.pipes) {
    for (const portId of [pipe.fromPortId, pipe.toPortId]) {
      const node = portId ? portToNode.get(portId) : undefined;
      if (node) nodePipes.get(node.id)!.push(pipe);
    }
  }
  return { portToNode, nodePipes };
}

/** 从节点出发，沿管路在 maxDepth 内查找某类节点 */
function nearbyNode(
  diagram: Diagram,
  start: DiagramNode,
  types: string[],
  maxDepth = 4,
): DiagramNode | undefined {
  const { portToNode, nodePipes } = buildGraph(diagram);
  const queue: Array<{ node: DiagramNode; depth: number }> = [{ node: start, depth: 0 }];
  const seen = new Set<string>([start.id]);
  while (queue.length) {
    const { node, depth } = queue.shift()!;
    if (depth > 0 && types.includes(node.type)) return node;
    if (depth >= maxDepth) continue;
    for (const pipe of nodePipes.get(node.id) ?? []) {
      const otherPortId = pipe.fromPortId && portToNode.get(pipe.fromPortId)?.id === node.id ? pipe.toPortId : pipe.fromPortId;
      const other = otherPortId ? portToNode.get(otherPortId) : undefined;
      if (!other || seen.has(other.id)) continue;
      seen.add(other.id);
      queue.push({ node: other, depth: depth + 1 });
    }
  }
  return undefined;
}

function downstreamNodes(diagram: Diagram, start: DiagramNode, maxDepth = 4): DiagramNode[] {
  const { portToNode, nodePipes } = buildGraph(diagram);
  const out: DiagramNode[] = [];
  const queue: Array<{ node: DiagramNode; depth: number }> = [{ node: start, depth: 0 }];
  const seen = new Set<string>([start.id]);
  while (queue.length) {
    const { node, depth } = queue.shift()!;
    if (depth > 0) out.push(node);
    if (depth >= maxDepth) continue;
    for (const pipe of nodePipes.get(node.id) ?? []) {
      // 只沿有效流向向下游走：pipe.fromPort 在 node 上
      const from = pipe.fromPortId ? portToNode.get(pipe.fromPortId) : undefined;
      if (!from || from.id !== node.id) continue;
      const to = pipe.toPortId ? portToNode.get(pipe.toPortId) : undefined;
      if (!to || seen.has(to.id)) continue;
      seen.add(to.id);
      queue.push({ node: to, depth: depth + 1 });
    }
  }
  return out;
}

function issue(
  id: string,
  severity: EngineeringSeverity,
  titleZh: string,
  titleEn: string,
  messageZh: string,
  messageEn: string,
  nodes: DiagramNode[] = [],
  pipes: Pipe[] = [],
): EngineeringIssue {
  return { id, severity, titleZh, titleEn, messageZh, messageEn, nodeIds: nodes.map((n) => n.id), pipeIds: pipes.map((p) => p.id) };
}

function hasMilkCleanPath(diagram: Diagram, milk: DiagramNode): boolean {
  const { portToNode, nodePipes } = buildGraph(diagram);
  const queue: Array<{ node: DiagramNode; depth: number }> = [{ node: milk, depth: 0 }];
  const seen = new Set<string>([milk.id]);
  while (queue.length) {
    const { node, depth } = queue.shift()!;
    if (depth > 0 && (node.type === "tee" || node.type === "cross")) {
      for (const pipe of nodePipes.get(node.id) ?? []) {
        const otherPortId = pipe.fromPortId && portToNode.get(pipe.fromPortId)?.id === node.id ? pipe.toPortId : pipe.fromPortId;
        const other = otherPortId ? portToNode.get(otherPortId) : undefined;
        if (!other) continue;
        // 奶路清洗必须是“从奶路节点分出的两通阀 → 排出口”，不能把蒸汽加热排废算进来
        if (!["solenoid2", "ballValve", "diaphragmValve2"].includes(other.type)) continue;
        if (downstreamNodes(diagram, other, 3).some((n) => n.type === "outlet")) return true;
      }
    }
    if (depth >= 4) continue;
    for (const pipe of nodePipes.get(node.id) ?? []) {
      const otherPortId = pipe.fromPortId && portToNode.get(pipe.fromPortId)?.id === node.id ? pipe.toPortId : pipe.fromPortId;
      const other = otherPortId ? portToNode.get(otherPortId) : undefined;
      if (!other || seen.has(other.id)) continue;
      seen.add(other.id);
      queue.push({ node: other, depth: depth + 1 });
    }
  }
  return false;
}

/**
 * 咖啡机液路工程检查（启发式，不做 CFD）：
 * 安全件、泵出口单向阀、奶路清洗、默认状态、可运行工况。
 * 这些规则面向“起步草图”，用于提示工程师下一步要补什么，不替代实机评审。
 */
export function engineeringIssues(diagram: Diagram): EngineeringIssue[] {
  const out: EngineeringIssue[] = [];
  const nodes = diagram.nodes;
  const pipes = diagram.pipes;
  const steamBoilers = nodes.filter((n) => n.type === "steamBoiler");
  const hotBoilers = nodes.filter((n) => n.type === "hotWaterBoiler" || n.type === "boiler");
  const pumps = nodes.filter((n) => n.type === "pump" || n.type === "milkPump" || n.type === "airPump");
  const milkOutlets = nodes.filter((n) => n.type === "milkOutlet");

  for (const boiler of steamBoilers) {
    if (!nearbyNode(diagram, boiler, ["safetyValve"], 4)) {
      out.push(issue(
        `safety-steam-${boiler.id}`, "error",
        "蒸汽锅炉缺安全阀",
        "Steam boiler has no safety valve",
        "蒸汽锅炉必须配置安全阀（超压泄放），否则不满足基本安全要求。",
        "A steam boiler requires a safety valve for over-pressure relief.",
        [boiler],
      ));
    }
    if (!nearbyNode(diagram, boiler, ["pressureGauge"], 4)) {
      out.push(issue(
        `gauge-steam-${boiler.id}`, "warning",
        "蒸汽锅炉缺压力表",
        "Steam boiler has no pressure gauge",
        "建议在蒸汽锅炉出口加压力表，便于观察锅炉压力与排查。",
        "Add a pressure gauge at the steam boiler outlet for monitoring and troubleshooting.",
        [boiler],
      ));
    }
  }

  for (const boiler of hotBoilers) {
    if (!nearbyNode(diagram, boiler, ["opv", "safetyValve"], 4)) {
      out.push(issue(
        `opv-${boiler.id}`, "warning",
        "咖啡/热水锅炉缺 OPV 或泄压",
        "Coffee/hot-water boiler has no OPV or relief",
        "建议加 OPV/膨胀泄压，避免加热膨胀导致管路超压。",
        "Add an OPV/expansion relief to avoid over-pressure from heating.",
        [boiler],
      ));
    }
    if (!nearbyNode(diagram, boiler, ["pressureGauge"], 4)) {
      out.push(issue(
        `gauge-${boiler.id}`, "warning",
        "咖啡/热水锅炉缺压力表",
        "Coffee/hot-water boiler has no pressure gauge",
        "建议在锅炉出口或泵后加压力表，便于观察萃取/供水压力。",
        "Add a pressure gauge at the boiler outlet or after the pump.",
        [boiler],
      ));
    }
  }

  for (const pump of pumps) {
    const downstream = downstreamNodes(diagram, pump, 8);
    if (!downstream.some((n) => n.type === "checkValve")) {
      out.push(issue(
        `check-${pump.id}`, "warning",
        "泵出口缺单向阀",
        "Pump outlet has no check valve",
        "建议在泵出口加单向阀，防止停泵/锅炉压力回流。",
        "Add a check valve after the pump to prevent backflow when the pump stops.",
        [pump],
      ));
    }
    if (!downstream.some((n) => ["outlet", "coffeeOutlet", "milkOutlet", "hotWaterOutlet", "hotWaterWand", "steamWand", "boiler", "hotWaterBoiler", "steamBoiler", "brewChamber"].includes(n.type))) {
      out.push(issue(
        `deadhead-${pump.id}`, "error",
        "泵出口没有去处（死堵）",
        "Pump outlet is dead-headed",
        "泵运行但没有到达出口/锅炉/冲泡腔，长时间会憋压；请检查下游阀门或补一个去处。",
        "The pump has no downstream destination; it would dead-head. Check downstream valves or add an outlet.",
        [pump],
      ));
    }
  }

  if (milkOutlets.length && steamBoilers.length) {
    const hasCheck = nodes.some((n) => n.type === "checkValve");
    if (!hasCheck) {
      out.push(issue(
        "milk-steam-check", "error",
        "蒸汽注入奶路缺单向阀",
        "Steam injection into milk has no check valve",
        "蒸汽支路必须在汇入奶路前加单向阀，防止牛奶倒灌蒸汽锅炉。",
        "A check valve is required before steam joins the milk line to prevent milk backflow.",
        [...milkOutlets, ...steamBoilers],
      ));
    }
  }

  for (const milk of milkOutlets) {
    // 不信标签：从奶路拓扑找“分出的两通阀 → 排出口”，而不是看名称里有没有“清洗”
    const hasClean = hasMilkCleanPath(diagram, milk);
    if (!hasClean) {
      out.push(issue(
        `milk-clean-${milk.id}`, "warning",
        "奶路缺清洗/排空路径",
        "Milk line has no clean/drain path",
        "建议加清洗阀与排废口，保证奶路可冲洗、可排空。",
        "Add a cleaning valve and drain so the milk line can be flushed and emptied.",
        [milk],
      ));
    }
  }

  // 默认状态：生成图应是待机态（泵停、两通阀关、三通阀 off）
  const runningPump = pumps.find((p) => p.pumpOn !== false);
  if (runningPump) {
    out.push(issue(
      `idle-pump-${runningPump.id}`, "warning",
      "生成图不是待机状态",
      "Generated draft is not in idle state",
      "模板应默认泵停/阀关，避免一插入就显示整机运行。",
      "Templates should start with pumps off and valves closed.",
      [runningPump],
    ));
  }
  const openValve = nodes.find((n) =>
    (n.type === "solenoid2" || n.type === "ballValve" || n.type === "pulseAirValve") ? n.valveState === "open"
      : n.type === "solenoid3" ? n.valvePath === "A" || n.valvePath === "B"
        : false);
  if (openValve) {
    out.push(issue(
      `idle-valve-${openValve.id}`, "warning",
      "生成图有阀门处于打开位",
      "Generated draft has an open valve",
      "待机模板应默认阀门关闭/三通 off；需要动作时由工况切换。",
      "Idle templates should default to closed valves/off three-way paths.",
      [openValve],
    ));
  }

  const conditions = diagram.settings.workConditions ?? [];
  if (conditions.length === 0) {
    out.push(issue(
      "conditions-missing", "warning",
      "没有推荐工况",
      "No recommended conditions",
      "建议至少提供「待机」与一个可运行工况，方便新手切换观察。",
      "Provide at least an Idle and one runnable condition.",
    ));
  } else if (!conditions.some((c) => /待机|idle/i.test(c.name))) {
    out.push(issue(
      "conditions-idle", "warning",
      "缺少「待机」工况",
      "No Idle condition",
      "建议提供「待机」工况，作为安全默认状态。",
      "Add an Idle condition as the safe default.",
    ));
  }

  void pipes;
  return out;
}

export function engineeringSummary(diagram: Diagram) {
  const issues = engineeringIssues(diagram);
  return {
    issues,
    errors: issues.filter((i) => i.severity === "error").length,
    warnings: issues.filter((i) => i.severity === "warning").length,
  };
}

export function engineeringIssueLabel(i: EngineeringIssue): { title: string; message: string } {
  return { title: L(i.titleZh, i.titleEn), message: L(i.messageZh, i.messageEn) };
}
