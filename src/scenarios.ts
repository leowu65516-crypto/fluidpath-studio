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

export type ScenarioStep = import("./types").SceneScenarioStep;

export type Scenario = import("./types").SceneScenario;

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
  { role: "brewChamber", types: ["shape", "brewChamber"], keywords: ["冲泡缸"] },
  { role: "coffeeDrainV3", types: ["solenoid3"], keywords: ["咖啡排废"] },
  { role: "coffeeOut", types: ["coffeeOutlet"], keywords: [] },
  { role: "milkTank", types: ["tank"], keywords: [] },
  { role: "milkInValve", types: ["solenoid2"], keywords: ["进奶"] },
  { role: "milkPump", types: ["milkPump"], keywords: [] },
  { role: "cleanV3", types: ["solenoid3"], keywords: ["清洗"] },
  { role: "milkDrainV3", types: ["solenoid3"], keywords: ["牛奶排废"] },
  { role: "heatV3", types: ["solenoid3"], keywords: ["牛奶加热"] },
  { role: "milkOut", types: ["milkOutlet"], keywords: [] },
  // 热水侧与排废（美式/热水杆/清洗/排废场景）
  { role: "hotWandV3", types: ["solenoid3"], keywords: ["热水杆"] },
  { role: "americanoV3", types: ["solenoid3"], keywords: ["美式"] },
  { role: "hotWandOut", types: ["hotWaterWand"], keywords: [] },
  { role: "americanoOut", types: ["hotWaterOutlet"], keywords: ["美式"] },
  { role: "coldWaterValve", types: ["solenoid2"], keywords: ["常温水两通"] },
  { role: "bypassValve", types: ["solenoid2"], keywords: ["旁通"] },
  { role: "steamDrainV2", types: ["solenoid2"], keywords: ["蒸汽排废"] },
  { role: "wasteOut", types: ["outlet"], keywords: ["出口排废"] },
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
  {
    id: "americano",
    title: "美式咖啡",
    icon: "🫖",
    allNodes: ["waterInlet", "inletValve", "waterPump", "hotBoiler", "cleanV3", "hotWandV3", "americanoV3", "americanoOut"],
    steps: [
      {
        title: "供水启动",
        desc: "水泵运转，常温水经进水总阀与滤网送入热水锅炉；清洗三通阀导通 B 路，把热水引向热水杆侧选择链。",
        addNodes: ["waterInlet", "inletValve", "waterPump", "hotBoiler", "cleanV3"],
        valves: { waterPump: "pump-run", inletValve: "open", cleanV3: "B" },
      },
      {
        title: "热水杆三通选美式",
        desc: "热水杆三通阀导通 B 路，热水流向美式支路；美式热水三通阀导通 A 路，热水从美式水出口流出。",
        addNodes: ["hotWandV3", "americanoV3", "americanoOut"],
        valves: { hotWandV3: "B", americanoV3: "A" },
      },
      {
        title: "常温水勾兑（可选）",
        desc: "打开常温水两通电磁阀，冷水汇入美式热水，兑出温度适口的常温美式；旁通热水阀可按需补充热水量。",
        addNodes: ["coldWaterValve"],
        valves: { coldWaterValve: "open" },
      },
    ],
  },
  {
    id: "hotWand",
    title: "热水杆",
    icon: "🚰",
    allNodes: ["waterInlet", "inletValve", "waterPump", "hotBoiler", "cleanV3", "hotWandV3", "hotWandOut"],
    steps: [
      {
        title: "供水启动",
        desc: "水泵运转并向热水锅炉供水；清洗三通阀导通 B 路打开热水杆侧通路。",
        addNodes: ["waterInlet", "inletValve", "waterPump", "hotBoiler", "cleanV3"],
        valves: { waterPump: "pump-run", inletValve: "open", cleanV3: "B" },
      },
      {
        title: "热水杆出热水",
        desc: "热水杆三通阀导通 A 路，高温热水直接从热水杆流出，可用于泡茶或冲饮。",
        addNodes: ["hotWandV3", "hotWandOut"],
        valves: { hotWandV3: "A" },
      },
    ],
  },
  {
    id: "milkClean",
    title: "牛奶清洗",
    icon: "🧼",
    allNodes: ["waterInlet", "inletValve", "waterPump", "hotBoiler", "cleanV3", "milkTank"],
    steps: [
      {
        title: "供水与锅炉加热",
        desc: "水泵供水，热水锅炉加热至清洗温度。奶泵保持关闭，奶路静止。",
        addNodes: ["waterInlet", "inletValve", "waterPump", "hotBoiler"],
        valves: { waterPump: "pump-run", inletValve: "open" },
      },
      {
        title: "热水倒灌奶路回罐",
        desc: "牛奶清洗三通阀导通 A 路，热水从锅炉侧倒灌进奶路，沿管路回流到储液罐，溶化奶路中的清洗药丸并消毒管路。",
        addNodes: ["cleanV3", "milkTank"],
        valves: { cleanV3: "A" },
      },
    ],
  },
  {
    id: "drain",
    title: "排废",
    icon: "🗑️",
    allNodes: ["waterInlet", "inletValve", "waterPump", "hotBoiler", "brewV3", "coffeeDrainV3", "milkPump", "milkInValve", "milkDrainV3", "steamDrainV2", "wasteOut"],
    steps: [
      {
        title: "咖啡侧排废",
        desc: "冲泡三通阀保持 A 路给料，咖啡排废三通阀导通 B 路，残液从冲泡缸下方流入排废网。",
        addNodes: ["brewV3", "coffeeDrainV3"],
        valves: { waterPump: "pump-run", inletValve: "open", brewV3: "A", coffeeDrainV3: "B" },
      },
      {
        title: "奶侧与总排废阀",
        desc: "奶泵运转、牛奶排废三通阀导通 B 路，奶侧残液汇入排废网；打开锅炉蒸汽排废总阀，三路废液统一经排废接口排出。",
        addNodes: ["milkPump", "milkInValve", "milkDrainV3", "steamDrainV2", "wasteOut"],
        valves: { milkPump: "pump-run", milkInValve: "open", milkDrainV3: "B", steamDrainV2: "open" },
      },
    ],
  },
];

/** 当前图纸实际可以讲述的场景。关键角色缺失时不显示该场景，避免误报演示元件。 */
export function availableScenariosForDiagram(diagram: Diagram): Scenario[] {
  const { nodes } = resolveScenarioRoles(diagram);
  const nodeIds = new Set(diagram.nodes.map((n) => n.id));
  const has = (...roles: string[]) => roles.every((role) => Boolean(nodes[role]));
  const builtin = SCENARIOS.filter((scenario) => {
    if (scenario.id === "coffee") {
      return has("waterPump", "brewChamber", "coffeeOut");
    }
    if (scenario.id === "milk") {
      return has("milkPump", "heatV3", "milkOut");
    }
    if (scenario.id === "americano") {
      return has("waterPump", "cleanV3", "hotWandV3", "americanoV3", "americanoOut");
    }
    if (scenario.id === "hotWand") {
      return has("waterPump", "cleanV3", "hotWandV3", "hotWandOut");
    }
    if (scenario.id === "milkClean") {
      return has("waterPump", "cleanV3", "milkTank");
    }
    if (scenario.id === "drain") {
      return has("waterPump", "coffeeDrainV3", "milkDrainV3", "steamDrainV2", "wasteOut");
    }
    return scenario.allNodes.some((role) => Boolean(nodes[role]) || nodeIds.has(role));
  });
  const customs = (diagram.settings.customScenarios ?? []).filter((s) => s.steps.length > 0);
  return [...builtin, ...customs];
}

export function getScenario(id: string, diagram?: Diagram): Scenario | undefined {
  const builtin = SCENARIOS.find((s) => s.id === id);
  if (builtin) return builtin;
  return diagram?.settings.customScenarios?.find((s) => s.id === id);
}

/** 删除自定义场景 */
export function deleteCustomScenario(diagram: Diagram, id: string): boolean {
  const list = diagram.settings.customScenarios ?? [];
  const next = list.filter((s) => s.id !== id);
  if (next.length === list.length) return false;
  diagram.settings.customScenarios = next;
  return true;
}

// ===== 讲师内容增强（narrator / callouts / quiz，启动时合并进场景步骤） =====

const STEP_ENRICHMENTS: Record<string, Record<number, Partial<ScenarioStep>>> = {
  coffee: {
    0: {
      narrator: {
        zh: "先看供水：水从进水口进来，经过单向阀和进水总阀，由水泵增压、两级滤网过滤后送往锅炉。请注意流量计——它负责定量，保证每杯咖啡水量一致。",
        en: "Start with the water supply: water enters at the inlet, passes the check valve and main valve, is pressurized by the pump and filtered twice before reaching the boiler. Note the flow meter — it doses water for a consistent cup.",
      },
      callouts: [{ role: "waterPump", text: { zh: "全机动力核心：水路增压", en: "Core power source: pressurizes the water line" } }],
    },
    1: {
      narrator: {
        zh: "热水锅炉把水加热到 90 度以上。冲泡三通阀现在导通 A 路——只有这一路通，热水才能精准进入冲泡缸，其余出口都拿不到热水。",
        en: "The boiler heats water above 90°C. The brew valve routes path A — only this path is open, so hot water goes precisely into the brew chamber while all other outlets get nothing.",
      },
      callouts: [{ role: "brewChamber", text: { zh: "密闭腔萃取：水自下而上穿过粉饼", en: "Sealed extraction: water flows up through the puck" } }],
    },
    2: {
      narrator: {
        zh: "萃取完成后咖啡液必须走咖啡出口——咖啡排废三通阀导通 A 路就是通路。想想看：如果此时导通 B 路会发生什么？",
        en: "After extraction, coffee must exit via the coffee outlet — the drain valve at path A opens that route. Think: what would happen at path B?",
      },
      quiz: {
        q: { zh: "咖啡排废三通阀在 B 位时，咖啡液会去哪里？", en: "Where does the coffee go when the drain valve is at path B?" },
        options: [
          { zh: "流向排废网（废液管）", en: "To the waste network (drain)" },
          { zh: "仍流向咖啡出口", en: "Still to the coffee outlet" },
          { zh: "流回热水锅炉", en: "Back to the hot-water boiler" },
        ],
        answer: 0,
      },
    },
  },
  milk: {
    0: {
      narrator: {
        zh: "做奶咖前蒸汽锅炉要先蓄热：补水阀打开，冷水注入蒸汽锅炉。注意奶泵此时还是关的——先把蒸汽准备好。",
        en: "Before a milk drink, the steam boiler preheats: the refill valve opens and cold water fills it. Note the milk pump is still off — get the steam ready first.",
      },
    },
    1: {
      narrator: {
        zh: "两条路同时工作：奶泵抽牛奶走奶路，蒸汽锅炉的蒸汽经加热单向阀注入奶路混合加热。单向阀在这里很关键——它防止牛奶倒灌进蒸汽锅炉。",
        en: "Two paths work together: the milk pump drives milk through the line while steam injects through the heating check valve to mix and heat. The check valve matters here — it stops milk flowing back into the steam boiler.",
      },
      callouts: [{ role: "heatV3", text: { zh: "蒸汽与奶路的混合点上游", en: "Upstream of the steam/milk mixing point" } }],
    },
  },
  americano: {
    0: {
      narrator: {
        zh: "美式和咖啡共用热水锅炉，但热水的去向由三通阀链决定。注意清洗三通阀必须先导通 B 路——它是热水杆侧选择链的总开关。",
        en: "Americano shares the hot-water boiler, but routing depends on the valve chain. The clean valve must be at path B first — it gates the whole wand-side selection chain.",
      },
    },
    1: {
      narrator: {
        zh: "热水杆三通阀选 B 路（放弃热水杆），美式三通阀选 A 路——热水就走美式水出口。三个热水出口同时只能通一个，这就是串联选择链的语义。",
        en: "The wand valve picks path B (giving up the wand) and the americano valve picks path A — hot water exits at the americano outlet. Only one hot-water outlet is live at a time: that's the series selection chain.",
      },
      callouts: [{ role: "americanoV3", text: { zh: "串联选择链的末级开关", en: "The last switch of the series chain" } }],
    },
    2: {
      narrator: {
        zh: "想喝温度适口的美式？打开常温水阀兑一点冷水。旁通热水阀则相反——不降温反而补更多热水。",
        en: "Want a milder americano? Open the cold-water valve to blend in cold water. The bypass valve does the opposite — adds more hot water instead.",
      },
    },
  },
  hotWand: {
    0: {
      narrator: {
        zh: "和美式一样，热水杆也要先经清洗三通阀 B 路——这是这台机器热水分配的「必经之路」。",
        en: "Like the americano, the wand route also passes the clean valve at path B — the mandatory gateway for hot-water distribution on this machine.",
      },
    },
    1: {
      narrator: {
        zh: "热水杆三通阀导通 A 路，热水直达热水杆。对比美式场景：同一个阀，A/B 两个选择，出口完全不同。",
        en: "The wand valve at path A sends hot water straight to the wand. Compare with americano: the same valve, two paths, two very different outlets.",
      },
    },
  },
  milkClean: {
    0: {
      narrator: {
        zh: "清洗的关键前提：奶泵必须关。否则奶泵会把清洗热水顶进牛奶出口而不是让它循环。",
        en: "Key precondition for cleaning: the milk pump must be OFF. Otherwise it would push the hot rinse toward the milk outlet instead of letting it circulate.",
      },
    },
    1: {
      narrator: {
        zh: "牛奶清洗三通阀 A 路：热水从锅炉侧倒灌进奶路，流回储液罐，一路溶掉清洗药丸、消毒管路。两条回流管就是为这个场景设计的合法回流终点。",
        en: "Clean valve at path A: hot water back-fills the milk line from the boiler side and returns to the tank, dissolving the cleaning tablet and sanitizing the line. The two reflux pipes exist as legal return endpoints for this scenario.",
      },
      callouts: [{ role: "milkTank", text: { zh: "回流终点：清洗废液最终回罐", en: "Return endpoint: rinse fluid ends back in the tank" } }],
      quiz: {
        q: { zh: "牛奶清洗时为什么必须关闭奶泵？", en: "Why must the milk pump be OFF during cleaning?" },
        options: [
          { zh: "让热水靠水压自然倒灌回罐", en: "So hot water back-flows to the tank by line pressure" },
          { zh: "省电", en: "To save power" },
          { zh: "防止牛奶冻结", en: "To keep milk from freezing" },
        ],
        answer: 0,
      },
    },
  },
  drain: {
    0: {
      narrator: {
        zh: "排废前要先给料：冲泡三通阀保持 A 路，残液才有来源。咖啡排废三通阀切到 B 路，废液改道流向排废网。",
        en: "Before draining you need material: the brew valve stays at path A so there is something to drain. The coffee drain valve at path B diverts residue into the waste network.",
      },
    },
    1: {
      narrator: {
        zh: "三条排废支路（咖啡、奶、锅炉降温）全部汇合后，受锅炉蒸汽排废总阀统一控制——它是排废网的总闸。总闸不开，谁也排不出去。",
        en: "Three waste branches (coffee, milk, boiler cooling) merge and are all gated by the main steam-drain valve — the master switch of the waste network. Nothing drains until it opens.",
      },
      callouts: [{ role: "steamDrainV2", text: { zh: "排废总闸：三路废液统一出口", en: "Master drain valve: single outlet for all three branches" } }],
      quiz: {
        q: { zh: "为什么三条排废支路要共用一个总阀？", en: "Why do the three waste branches share one master valve?" },
        options: [
          { zh: "统一管控排废时机，防止误排", en: "Centralized control prevents accidental draining" },
          { zh: "为了省一个传感器", en: "To save a sensor" },
          { zh: "没有特别原因", en: "No particular reason" },
        ],
        answer: 0,
      },
    },
  },
};

for (const sc of SCENARIOS) {
  const enrich = STEP_ENRICHMENTS[sc.id];
  if (!enrich) continue;
  for (const [idx, patch] of Object.entries(enrich)) {
    const step = sc.steps[Number(idx)];
    if (step) Object.assign(step, patch);
  }
}

/**
 * 收集 steps[0..stepIndex] 的激活元件（角色 → 已解析节点 id）与全部阀状态。
 * @param resolved 由 resolveScenarioRoles(diagram).nodes 提供
 */
export function collectScenarioState(
  scenario: Scenario,
  stepIndex: number,
  resolved: Record<string, string | undefined>,
  nodeIds?: Set<string>
) {
  const activeNodes = new Set<string>();
  const valves: Record<string, ValveAction> = {};
  for (let i = 0; i <= stepIndex && i < scenario.steps.length; i++) {
    const step = scenario.steps[i];
    step.addNodes?.forEach((role) => {
      // 角色名经 resolved 解析；自定义场景的 allNodes/addNodes 直接用 nodeId
      const id = resolved[role] ?? (nodeIds?.has(role) ? role : undefined);
      if (id) activeNodes.add(id);
    });
    for (const [role, action] of Object.entries(step.valves ?? {})) {
      const id = resolved[role] ?? (nodeIds?.has(role) ? role : undefined);
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
