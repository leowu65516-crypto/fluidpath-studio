/** 演示/讲述模式：场景定义（按元件角色自适应匹配当前图纸） */

import type { Diagram, DiagramNode, NodeType } from "./types";
import type { PresetState, PresetStateMap } from "./presets";

export type ValveAction =
  | "pump-run"   // 泵运行
  | "pump-stop"  // 泵停止
  | "open"       // 两通阀开
  | "closed"     // 两通阀关
  | "A"          // 三通阀 A（右侧通）
  | "B"          // 三通阀 B（下方通）
  | "off";       // 三通阀关闭

export interface ScenarioStep {
  title: string;
  desc: string;
  /** 此步新增激活的元件角色（累积到本步） */
  addNodes?: string[];
  /** 此步要设置的泵/阀状态（key = 元件角色） */
  valves?: Record<string, ValveAction>;
}

export interface Scenario {
  id: string;
  title: string;
  icon: string;
  /** 场景全流程元件角色（用于匹配检查与退出还原边界） */
  allNodes: string[];
  steps: ScenarioStep[];
}

// ===== 元件角色匹配规则 =====
// 按「类型 + 标签关键词」在当前加载的图纸中解析元件：
// 换机型（BCMTS / BCTMS / MSY2 等）演示自动跟随图纸；缺少对应元件的机器（如无奶泵）跳过对应步骤。

export interface RoleRule {
  role: string;
  types: NodeType[];
  /** 标签关键词：完全相等记 2 分，包含记 1 分，取最高分；无关键词则只按类型匹配 */
  keywords: string[];
}

const ROLE_RULES: RoleRule[] = [
  { role: "waterInlet", types: ["inlet"], keywords: ["进水口"] },
  { role: "waterPump", types: ["pump"], keywords: ["水泵"] },
  { role: "inletValve", types: ["solenoid2"], keywords: ["两通电磁阀", "进水"] },
  { role: "hotBoiler", types: ["hotWaterBoiler"], keywords: [] },
  { role: "steamBoiler", types: ["steamBoiler"], keywords: [] },
  { role: "refillValve", types: ["solenoid2"], keywords: ["补水"] },
  { role: "brewV3", types: ["solenoid3"], keywords: ["冲泡"] },
  { role: "brewChamber", types: ["shape"], keywords: ["冲泡缸"] },
  { role: "coffeeDrainV3", types: ["solenoid3"], keywords: ["咖啡排废"] },
  { role: "coffeeOut", types: ["coffeeOutlet"], keywords: [] },
  { role: "milkTank", types: ["tank"], keywords: [] },
  { role: "milkInValve", types: ["solenoid2"], keywords: ["进奶"] },
  { role: "milkPump", types: ["milkPump"], keywords: [] },
  { role: "cleanV3", types: ["solenoid3"], keywords: ["清洗"] },
  { role: "milkDrainV3", types: ["solenoid3"], keywords: ["牛奶排废"] },
  { role: "heatV3", types: ["solenoid3"], keywords: ["牛奶加热"] },
  { role: "milkOut", types: ["milkOutlet"], keywords: [] },
];

export function resolveScenarioRoles(diagram: Diagram): {
  nodes: Record<string, string | undefined>;
  missing: string[];
} {
  const nodes: Record<string, string | undefined> = {};
  const missing: string[] = [];
  for (const rule of ROLE_RULES) {
    let best: DiagramNode | undefined;
    let bestScore = 0;
    for (const n of diagram.nodes) {
      if (n.disabled) continue;
      if (!rule.types.includes(n.type)) continue;
      if (rule.keywords.length === 0) {
        if (!best) best = n;
        continue;
      }
      const label = n.label || "";
      for (const kw of rule.keywords) {
        const score = label === kw ? 2 : label.includes(kw) ? 1 : 0;
        if (score > bestScore) { bestScore = score; best = n; }
      }
    }
    nodes[rule.role] = best?.id;
    if (!best) missing.push(rule.role);
  }
  return { nodes, missing };
}

// ===== 场景定义 =====

export const SCENARIOS: Scenario[] = [
  {
    id: "coffee",
    title: "冲泡咖啡",
    icon: "☕",
    allNodes: ["waterInlet", "inletValve", "waterPump", "hotBoiler", "brewV3", "brewChamber", "coffeeDrainV3", "coffeeOut"],
    steps: [
      {
        title: "供水启动",
        desc: "水泵开始运转，常温水经进水口 → 单向阀 → 进水总阀 → 泵前滤网 → 水泵 → 泵后滤网 → 流量计，送入热水锅炉。",
        addNodes: ["waterInlet", "inletValve", "waterPump", "hotBoiler"],
        valves: { waterPump: "pump-run", inletValve: "open" },
      },
      {
        title: "热水进冲泡缸",
        desc: "热水锅炉加热至 90°C+，冲泡三通阀导通 A 路，热水注入冲泡缸浸润咖啡粉。",
        addNodes: ["brewV3", "brewChamber"],
        valves: { brewV3: "A" },
      },
      {
        title: "萃取冲泡",
        desc: "咖啡排废三通阀导通 A 路，萃取出的咖啡液经冲泡缸下方管路流向咖啡出口，连续出液。",
        addNodes: ["coffeeDrainV3", "coffeeOut"],
        valves: { coffeeDrainV3: "A" },
      },
    ],
  },
  {
    id: "milk",
    title: "热牛奶",
    icon: "🥛",
    allNodes: ["waterInlet", "inletValve", "waterPump", "hotBoiler", "steamBoiler", "refillValve", "milkTank", "milkInValve", "milkPump", "cleanV3", "milkDrainV3", "heatV3", "milkOut"],
    steps: [
      {
        title: "供水与锅炉补水",
        desc: "水泵供水 → 热水锅炉加热；同时蒸汽锅炉补水阀打开，常温水注入蒸汽锅炉蓄热，为蒸汽混合加热做准备。",
        addNodes: ["waterInlet", "inletValve", "waterPump", "hotBoiler", "steamBoiler", "refillValve"],
        valves: { waterPump: "pump-run", inletValve: "open", refillValve: "open" },
      },
      {
        title: "奶泵与蒸汽加热",
        desc: "奶泵启动，鲜牛奶从储液罐抽出送往牛奶出口；同时牛奶加热三通阀导通 A 路，蒸汽锅炉的高温蒸汽经加热单向阀注入奶路充分混合加热，输出热牛奶。清洗三通阀保持关闭。",
        addNodes: ["milkTank", "milkInValve", "milkPump", "milkDrainV3", "milkOut", "heatV3"],
        valves: { milkPump: "pump-run", milkInValve: "open", milkDrainV3: "A", heatV3: "A", cleanV3: "off" },
      },
    ],
  },
];

export function getScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

/**
 * 收集 steps[0..stepIndex] 的激活元件（角色 → 已解析节点 id）与全部阀状态。
 * @param resolved 由 resolveScenarioRoles(diagram).nodes 提供
 */
export function collectScenarioState(
  scenario: Scenario,
  stepIndex: number,
  resolved: Record<string, string | undefined>
) {
  const activeNodes = new Set<string>();
  const valves: Record<string, ValveAction> = {};
  for (let i = 0; i <= stepIndex && i < scenario.steps.length; i++) {
    const step = scenario.steps[i];
    step.addNodes?.forEach((role) => {
      const id = resolved[role];
      if (id) activeNodes.add(id);
    });
    for (const [role, action] of Object.entries(step.valves ?? {})) {
      const id = resolved[role];
      if (id) valves[id] = action;
    }
  }
  return { activeNodes, valves };
}

/** 单个阀动作 → 预设状态原语 */
export function valveActionToPreset(action: ValveAction): PresetState {
  switch (action) {
    case "pump-run": return { pumpOn: true };
    case "pump-stop": return { pumpOn: false };
    case "open": return { valveState: "open" };
    case "closed": return { valveState: "closed" };
    case "A": return { valvePath: "A" };
    case "B": return { valvePath: "B" };
    case "off": return { valvePath: "off" };
  }
}

/** 一组节点级阀动作 → 预设状态（演示步骤与工况共用同一套状态原语） */
export function valveActionsToPreset(valves: Record<string, ValveAction>): PresetStateMap {
  const out: PresetStateMap = {};
  for (const [nodeId, action] of Object.entries(valves)) out[nodeId] = valveActionToPreset(action);
  return out;
}
