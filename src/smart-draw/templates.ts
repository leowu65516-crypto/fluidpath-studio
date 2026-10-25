import type { DiagramNode, Pipe, PortPosition } from "../types";
import { applyIdleStates, connect, makeCondition, makeNode, mergeResults, offsetNodes, portOf } from "./builders";
import type { SmartBuildResult, SmartOption, SmartOptionValue, SmartTemplate } from "./types";

const isEn = () => typeof document !== "undefined" && document.documentElement.lang === "en";
const L = (zh: string, en: string) => (isEn() ? en : zh);

function removeDirectPipe(pipes: Pipe[], from: DiagramNode, fromPos: PortPosition, to: DiagramNode, toPos: PortPosition) {
  const fromId = portOf(from, fromPos).id;
  const toId = portOf(to, toPos).id;
  const idx = pipes.findIndex((p) => p.fromPortId === fromId && p.toPortId === toId);
  if (idx >= 0) pipes.splice(idx, 1);
}

/** 在锅炉出口线上插入十字四通 + 压力表 + 安全阀/OPV + 泄压排废。 */
function addBoilerSafety(opts: {
  nodes: DiagramNode[];
  pipes: Pipe[];
  boiler: DiagramNode;
  boilerPort: PortPosition;
  next: DiagramNode;
  nextPort: PortPosition;
  fluid: "hotWater" | "steam";
  kind: "opv" | "safetyValve";
  cross: { x: number; y: number };
}) {
  const { nodes, pipes, boiler, boilerPort, next, nextPort, fluid, kind, cross } = opts;
  removeDirectPipe(pipes, boiler, boilerPort, next, nextPort);
  const junction = makeNode("cross", cross.x, cross.y, "");
  const gauge = makeNode("pressureGauge", cross.x, cross.y - 120, L("压力表", "Pressure gauge"));
  const relief = makeNode(kind, cross.x, cross.y + 110, kind === "opv" ? L("OPV 泄压", "OPV relief") : L("安全阀", "Safety valve"));
  const waste = makeNode("outlet", cross.x + 140, cross.y + 130, kind === "opv" ? L("泄压排废", "Relief drain") : L("安全排废", "Safety drain"));
  nodes.push(junction, gauge, relief, waste);
  pipes.push(connect(boiler, boilerPort, junction, "left", fluid));
  pipes.push(connect(junction, "right", next, nextPort, fluid));
  pipes.push(connect(junction, "top", gauge, "bottom", fluid));
  pipes.push(connect(junction, "bottom", relief, "bottom", fluid));
  pipes.push(connect(relief, "right", waste, "left", "wasteLiquid"));
  return { junction };
}

/** 在泵与下游之间插入单向阀。 */
function addPumpCheck(opts: {
  nodes: DiagramNode[];
  pipes: Pipe[];
  pump: DiagramNode;
  next: DiagramNode;
  nextPort: PortPosition;
  fluid: "coldWater" | "coldMilk";
  x: number;
  y: number;
}) {
  const { nodes, pipes, pump, next, nextPort, fluid, x, y } = opts;
  removeDirectPipe(pipes, pump, "right", next, nextPort);
  const check = makeNode("checkValve", x, y, L("泵出口单向阀", "Pump check valve"));
  nodes.push(check);
  pipes.push(connect(pump, "right", check, "left", fluid));
  pipes.push(connect(check, "right", next, nextPort, fluid));
}

function buildWater(): SmartBuildResult {
  const inlet = makeNode("inlet", 80, 140, L("进水口", "Water inlet"));
  const pump = makeNode("pump", 220, 130, L("水泵", "Water pump"));
  const boiler = makeNode("hotWaterBoiler", 400, 110, L("热水锅炉", "Hot-water boiler"));
  const outlet = makeNode("hotWaterOutlet", 640, 90, L("热水出口", "Hot-water outlet"));
  const nodes = [inlet, pump, boiler, outlet];
  const pipes: Pipe[] = [
    connect(inlet, "right", pump, "left", "coldWater", L("进水", "Feed")),
    connect(pump, "right", boiler, "bottom", "coldWater", L("泵出", "Pump out")),
    connect(boiler, "top", outlet, "top", "hotWater", L("热水", "Hot water")),
  ];
  addPumpCheck({ nodes, pipes, pump, next: boiler, nextPort: "bottom", fluid: "coldWater", x: 310, y: 160 });
  addBoilerSafety({ nodes, pipes, boiler, boilerPort: "top", next: outlet, nextPort: "top", fluid: "hotWater", kind: "opv", cross: { x: 520, y: 130 } });
  applyIdleStates(nodes);
  return {
    nodes,
    pipes,
    conditions: [
      makeCondition(L("待机", "Idle"), nodes),
      makeCondition(L("供水", "Water feed"), nodes, { [pump.id]: { pumpOn: true } }),
    ],
  };
}

function buildCoffee(options: Record<string, SmartOptionValue> = {}): SmartBuildResult {
  const inlet = makeNode("inlet", 80, 240, L("进水口", "Water inlet"));
  const pump = makeNode("pump", 220, 230, L("水泵", "Water pump"));
  const boiler = makeNode("hotWaterBoiler", 400, 210, L("热水锅炉", "Hot-water boiler"));
  const brewValve = makeNode("solenoid3", 600, 220, L("咖啡冲泡三通阀", "Brew 3-way valve"));
  const chamber = makeNode("brewChamber", 780, 190, L("冲泡缸", "Brew chamber"));
  const coffee = makeNode("coffeeOutlet", 960, 120, L("咖啡出口", "Coffee outlet"));
  const drain = makeNode("outlet", 760, 460, L("咖啡排废", "Coffee drain"));
  const nodes = [inlet, pump, boiler, brewValve, chamber, coffee, drain];
  const pipes: Pipe[] = [
    connect(inlet, "right", pump, "left", "coldWater", L("进水", "Feed")),
    connect(pump, "right", boiler, "bottom", "coldWater", L("泵出", "Pump out")),
    connect(boiler, "top", brewValve, "left", "hotWater", L("热水", "Hot water")),
    connect(brewValve, "right", chamber, "bottom", "hotWater", L("冲泡进水", "Brew feed")),
    connect(chamber, "top", coffee, "top", "coffee", L("咖啡液", "Coffee")),
    connect(brewValve, "bottom", drain, "left", "wasteLiquid", L("排废", "Drain")),
  ];
  addPumpCheck({ nodes, pipes, pump, next: boiler, nextPort: "bottom", fluid: "coldWater", x: 310, y: 260 });
  const safety = addBoilerSafety({ nodes, pipes, boiler, boilerPort: "top", next: brewValve, nextPort: "left", fluid: "hotWater", kind: "opv", cross: { x: 520, y: 230 } });
  let steamValve: DiagramNode | undefined;
  if (options.steam === true) {
    // 单锅炉：同一锅炉在“萃取/蒸汽”之间切换，蒸汽支路从锅炉出口三通分出
    const steamTee = makeNode("teeF", 460, 230, L("蒸汽分支三通", "Steam branch tee"));
    steamValve = makeNode("solenoid2", 440, 60, L("蒸汽阀", "Steam valve"));
    const steamWand = makeNode("steamWand", 620, 40, L("蒸汽杆", "Steam wand"));
    nodes.push(steamTee, steamValve, steamWand);
    removeDirectPipe(pipes, boiler, "top", safety.junction, "left");
    pipes.push(connect(boiler, "top", steamTee, "bottom", "hotWater", L("锅炉出水", "Boiler out")));
    pipes.push(connect(steamTee, "right", safety.junction, "left", "hotWater"));
    pipes.push(connect(steamTee, "top", steamValve, "left", "steam", L("蒸汽", "Steam")));
    pipes.push(connect(steamValve, "right", steamWand, "top", "steam", L("蒸汽杆", "Steam wand")));
  }
  applyIdleStates(nodes);
  return {
    nodes,
    pipes,
    conditions: [
      makeCondition(L("待机", "Idle"), nodes),
      makeCondition(L("萃取", "Brew"), nodes, { [pump.id]: { pumpOn: true }, [brewValve.id]: { valvePath: "A" } }),
      makeCondition(L("排废", "Drain"), nodes, { [pump.id]: { pumpOn: true }, [brewValve.id]: { valvePath: "B" } }),
      ...(steamValve ? [makeCondition(L("蒸汽", "Steam"), nodes, { [pump.id]: { pumpOn: true }, [steamValve.id]: { valveState: "open" }, [brewValve.id]: { valvePath: "off" } })] : []),
    ],
  };
}

function buildThermoblock(): SmartBuildResult {
  const inlet = makeNode("inlet", 80, 240, L("进水口", "Water inlet"));
  const pump = makeNode("pump", 220, 230, L("水泵", "Water pump"));
  const heater = makeNode("thermoblock", 400, 250, L("即热加热块", "Thermoblock"));
  const brewValve = makeNode("solenoid3", 600, 220, L("咖啡冲泡三通阀", "Brew 3-way valve"));
  const chamber = makeNode("brewChamber", 780, 190, L("冲泡缸", "Brew chamber"));
  const coffee = makeNode("coffeeOutlet", 960, 120, L("咖啡出口", "Coffee outlet"));
  const drain = makeNode("outlet", 760, 460, L("咖啡排废", "Coffee drain"));
  const nodes = [inlet, pump, heater, brewValve, chamber, coffee, drain];
  const pipes: Pipe[] = [
    connect(inlet, "right", pump, "left", "coldWater", L("进水", "Feed")),
    connect(pump, "right", heater, "left", "coldWater", L("泵出", "Pump out")),
    connect(heater, "right", brewValve, "left", "hotWater", L("即热出水", "Heater out")),
    connect(brewValve, "right", chamber, "bottom", "hotWater", L("冲泡进水", "Brew feed")),
    connect(chamber, "top", coffee, "top", "coffee", L("咖啡液", "Coffee")),
    connect(brewValve, "bottom", drain, "left", "wasteLiquid", L("排废", "Drain")),
  ];
  addPumpCheck({ nodes, pipes, pump, next: heater, nextPort: "left", fluid: "coldWater", x: 310, y: 260 });
  addBoilerSafety({ nodes, pipes, boiler: heater, boilerPort: "right", next: brewValve, nextPort: "left", fluid: "hotWater", kind: "opv", cross: { x: 520, y: 230 } });
  applyIdleStates(nodes);
  return {
    nodes,
    pipes,
    conditions: [
      makeCondition(L("待机", "Idle"), nodes),
      makeCondition(L("萃取", "Brew"), nodes, { [pump.id]: { pumpOn: true }, [brewValve.id]: { valvePath: "A" } }),
      makeCondition(L("排废", "Drain"), nodes, { [pump.id]: { pumpOn: true }, [brewValve.id]: { valvePath: "B" } }),
    ],
  };
}

function buildSteam(): SmartBuildResult {
  const inlet = makeNode("inlet", 80, 200, L("蒸汽补水口", "Steam water inlet"));
  const boiler = makeNode("steamBoiler", 280, 180, L("蒸汽锅炉", "Steam boiler"));
  const valve = makeNode("solenoid3", 500, 200, L("蒸汽三通阀", "Steam 3-way valve"));
  const wand = makeNode("steamWand", 700, 150, L("蒸汽杆", "Steam wand"));
  const drain = makeNode("outlet", 700, 520, L("蒸汽排废", "Steam drain"));
  const nodes = [inlet, boiler, valve, wand, drain];
  const pipes: Pipe[] = [
    connect(inlet, "right", boiler, "top", "coldWater", L("蒸汽补水", "Steam feed")),
    connect(boiler, "bottom", valve, "left", "steam", L("蒸汽", "Steam")),
    connect(valve, "right", wand, "top", "steam", L("蒸汽杆", "Steam wand")),
    connect(valve, "bottom", drain, "left", "wasteLiquid", L("排废", "Drain")),
  ];
  const check = makeNode("checkValve", 180, 220, L("补水单向阀", "Fill check valve"));
  removeDirectPipe(pipes, inlet, "right", boiler, "top");
  nodes.push(check);
  pipes.push(connect(inlet, "right", check, "left", "coldWater", L("蒸汽补水", "Steam feed")));
  pipes.push(connect(check, "right", boiler, "top", "coldWater", L("锅炉补水", "Boiler feed")));
  addBoilerSafety({ nodes, pipes, boiler, boilerPort: "bottom", next: valve, nextPort: "left", fluid: "steam", kind: "safetyValve", cross: { x: 390, y: 270 } });
  applyIdleStates(nodes);
  return {
    nodes,
    pipes,
    conditions: [
      makeCondition(L("待机", "Idle"), nodes),
      makeCondition(L("蒸汽", "Steam"), nodes, { [valve.id]: { valvePath: "A" } }),
      makeCondition(L("排废", "Drain"), nodes, { [valve.id]: { valvePath: "B" } }),
    ],
  };
}

function buildMilk(options: Record<string, SmartOptionValue>): SmartBuildResult {
  const doubleTank = options.doubleTank !== false;
  const withSteam = options.steam !== false;
  const tankA = makeNode("tank", 80, 120, L("奶罐 A", "Milk tank A"));
  const nodes: DiagramNode[] = [tankA];
  const pipes: Pipe[] = [];
  const pump = makeNode("milkPump", 400, 180, L("奶泵", "Milk pump"));
  nodes.push(pump);
  let selective: DiagramNode | undefined;

  if (doubleTank) {
    const tankB = makeNode("tank", 80, 330, L("奶罐 B", "Milk tank B"));
    selective = makeNode("diaphragmValve3", 250, 180, L("选择阀", "Selector"));
    nodes.push(tankB, selective);
    pipes.push(connect(tankA, "top", selective, "left", "coldMilk", L("奶罐 A 出液", "Tank A out")));
    pipes.push(connect(tankB, "top", selective, "bottom", "coldMilk", L("奶罐 B 出液", "Tank B out")));
    pipes.push(connect(selective, "right", pump, "left", "coldMilk", L("选奶", "Milk select")));
  } else {
    pipes.push(connect(tankA, "top", pump, "left", "coldMilk", L("奶罐出液", "Tank out")));
  }

  const outlet = makeNode("milkOutlet", 760, 110, L("牛奶出口", "Milk outlet"));
  nodes.push(outlet);

  if (!withSteam) {
    pipes.push(connect(pump, "right", outlet, "top", "coldMilk", L("奶路", "Milk line")));
    addPumpCheck({ nodes, pipes, pump, next: outlet, nextPort: "top", fluid: "coldMilk", x: 520, y: 200 });
    applyIdleStates(nodes);
    return {
      nodes,
      pipes,
      conditions: [
        makeCondition(L("待机", "Idle"), nodes),
        makeCondition(L("奶路", "Milk line"), nodes, { [pump.id]: { pumpOn: true }, ...(doubleTank ? { [selective!.id]: { valvePath: "A" } } : {}) }),
      ],
    };
  }

  const tee = makeNode("cross", 580, 180, "");
  const cleaningValve = makeNode("solenoid2", 500, 40, L("奶路清洗阀", "Milk cleaning valve"));
  const cleaningDrain = makeNode("outlet", 640, 20, L("奶路清洗排废", "Milk cleaning drain"));
  nodes.push(tee, cleaningValve, cleaningDrain);
  pipes.push(connect(pump, "right", tee, "left", "coldMilk", L("奶泵出", "Pump out")));
  pipes.push(connect(tee, "right", outlet, "top", "coldMilk", L("奶路", "Milk line")));
  pipes.push(connect(tee, "top", cleaningValve, "left", "coldWater", L("奶路清洗", "Milk cleaning")));
  pipes.push(connect(cleaningValve, "right", cleaningDrain, "left", "wasteLiquid", L("清洗排废", "Cleaning drain")));
  addPumpCheck({ nodes, pipes, pump, next: tee, nextPort: "left", fluid: "coldMilk", x: 480, y: 200 });

  const steamInlet = makeNode("inlet", 180, 470, L("蒸汽补水口", "Steam water inlet"));
  const steamBoiler = makeNode("steamBoiler", 400, 420, L("蒸汽锅炉", "Steam boiler"));
  const heatValve = makeNode("solenoid3", 600, 420, L("牛奶加热三通阀", "Milk heat valve"));
  const check = makeNode("checkValve", 760, 420, L("加热单向阀", "Heat check valve"));
  const waste = makeNode("outlet", 760, 620, L("加热排废", "Heat drain"));
  nodes.push(steamInlet, steamBoiler, heatValve, check, waste);
  pipes.push(connect(steamInlet, "right", steamBoiler, "top", "coldWater", L("蒸汽补水", "Steam feed")));
  pipes.push(connect(steamBoiler, "bottom", heatValve, "left", "steam", L("蒸汽", "Steam")));
  pipes.push(connect(heatValve, "right", check, "left", "steam", L("加热蒸汽", "Heat steam")));
  pipes.push(connect(check, "right", tee, "bottom", "steam", L("混合加热", "Heat mix")));
  pipes.push(connect(heatValve, "bottom", waste, "left", "wasteLiquid", L("加热排废", "Heat drain")));
  addBoilerSafety({ nodes, pipes, boiler: steamBoiler, boilerPort: "bottom", next: heatValve, nextPort: "left", fluid: "steam", kind: "safetyValve", cross: { x: 510, y: 470 } });
  applyIdleStates(nodes);
  return {
    nodes,
    pipes,
    conditions: [
      makeCondition(L("待机", "Idle"), nodes),
      makeCondition(L("奶路", "Milk line"), nodes, {
        [pump.id]: { pumpOn: true },
        ...(doubleTank ? { [selective!.id]: { valvePath: "A" } } : {}),
        [heatValve.id]: { valvePath: "A" },
      }),
      makeCondition(L("蒸汽加热", "Steam heat"), nodes, { [heatValve.id]: { valvePath: "A" } }),
    ],
  };
}

function buildFull(options: Record<string, SmartOptionValue>): SmartBuildResult {
  const coffee = buildCoffee();
  const milk = buildMilk({ ...options, doubleTank: true, steam: true });
  offsetNodes(milk.nodes, 0, 520);
  const merged = mergeResults([coffee, milk]);
  const all = merged.nodes;
  const coffeeNodes = coffee.nodes;
  const milkNodes = milk.nodes;
  const coffeePump = coffeeNodes.find((n) => n.type === "pump")!;
  const brewValve = coffeeNodes.find((n) => n.type === "solenoid3")!;
  const milkPump = milkNodes.find((n) => n.type === "milkPump")!;
  const selector = milkNodes.find((n) => n.type === "diaphragmValve3");
  const heatValve = milkNodes.filter((n) => n.type === "solenoid3").find((n) => n.id !== brewValve.id);
  applyIdleStates(all);
  return {
    ...merged,
    conditions: [
      makeCondition(L("待机", "Idle"), all),
      makeCondition(L("萃取", "Brew"), all, { [coffeePump.id]: { pumpOn: true }, [brewValve.id]: { valvePath: "A" } }),
      makeCondition(L("奶路", "Milk line"), all, {
        [milkPump.id]: { pumpOn: true },
        ...(selector ? { [selector.id]: { valvePath: "A" } } : {}),
        ...(heatValve ? { [heatValve.id]: { valvePath: "A" } } : {}),
      }),
    ],
  };
}

const optionsDoubleTank: SmartOption[] = [
  { key: "doubleTank", labelZh: "双奶罐（选择阀）", labelEn: "Two milk tanks (selector)", kind: "boolean", default: true },
];
const optionsSteam: SmartOption[] = [
  { key: "steam", labelZh: "蒸汽加热支路", labelEn: "Steam heating branch", kind: "boolean", default: true },
];

const optionsCoffeeSteam: SmartOption[] = [
  { key: "steam", labelZh: "带蒸汽杆（单锅炉切换）", labelEn: "With steam wand (single-boiler switch)", kind: "boolean", default: false },
];

export const SMART_TEMPLATES: SmartTemplate[] = [
  {
    id: "water",
    titleZh: "基础水路",
    titleEn: "Basic water circuit",
    descZh: "进水口 → 水泵 → 热水锅炉 → 热水出口",
    descEn: "Inlet → pump → hot-water boiler → outlet",
    keywords: ["水", "水路", "锅炉", "泵", "water", "boiler", "pump"],
    tagsZh: ["基础", "单锅炉", "4 元件"],
    tagsEn: ["Basic", "Single boiler", "4 parts"],
    options: [],
    build: buildWater,
  },
  {
    id: "coffee",
    titleZh: "咖啡冲泡",
    titleEn: "Coffee brew",
    descZh: "水路 → 锅炉 → 冲泡三通阀 → 冲泡缸 → 咖啡出口 + 排废",
    descEn: "Water → boiler → brew valve → chamber → coffee outlet + drain",
    keywords: ["咖啡", "冲泡", "coffee", "brew", "espresso"],
    tagsZh: ["咖啡", "冲泡", "带排废"],
    tagsEn: ["Coffee", "Brew", "With drain"],
    options: optionsCoffeeSteam,
    build: buildCoffee,
  },
  {
    id: "milk",
    titleZh: "奶路",
    titleEn: "Milk line",
    descZh: "奶罐 → 选择阀 → 奶泵 → 混合/加热 → 牛奶出口",
    descEn: "Tank → selector → milk pump → mix/heat → milk outlet",
    keywords: ["奶", "牛奶", "milk", "奶路", "奶泡"],
    tagsZh: ["奶路", "双奶罐", "蒸汽加热"],
    tagsEn: ["Milk", "Two tanks", "Steam heat"],
    options: [...optionsDoubleTank, ...optionsSteam],
    build: buildMilk,
  },
  {
    id: "thermoblock",
    titleZh: "即热咖啡机",
    titleEn: "Thermoblock coffee",
    descZh: "进水 → 泵 → 即热加热块 → 冲泡三通阀 → 冲泡缸 → 咖啡出口 + 排废",
    descEn: "Inlet → pump → thermoblock → brew valve → chamber → coffee outlet + drain",
    keywords: ["即热", "热块", "thermoblock", "instant"],
    tagsZh: ["即热", "无锅炉", "带排废"],
    tagsEn: ["Thermoblock", "No boiler", "With drain"],
    options: [],
    build: buildThermoblock,
  },
  {
    id: "steam",
    titleZh: "蒸汽系统",
    titleEn: "Steam system",
    descZh: "蒸汽补水口 → 蒸汽锅炉 → 蒸汽三通阀 → 蒸汽杆 + 排废",
    descEn: "Steam inlet → steam boiler → steam 3-way valve → steam wand + drain",
    keywords: ["蒸汽", "steam", "蒸汽杆", "蒸汽系统"],
    tagsZh: ["蒸汽", "带安全阀"],
    tagsEn: ["Steam", "Safety valve"],
    options: [],
    build: buildSteam,
  },
  {
    id: "full",
    titleZh: "咖啡 + 奶路组合",
    titleEn: "Coffee + milk combo",
    descZh: "咖啡冲泡与奶路两套子系统组合，适合整机起步草图",
    descEn: "Coffee brew plus milk subsystem for a full-machine starter draft",
    keywords: ["整机", "全自动", "双锅炉", "咖啡机", "full", "combo", "dual boiler"],
    tagsZh: ["整机", "双系统", "咖啡+奶路"],
    tagsEn: ["Full machine", "Dual system", "Coffee + milk"],
    options: [],
    build: buildFull,
  },
];

export function smartTemplateById(id: string): SmartTemplate | undefined {
  return SMART_TEMPLATES.find((t) => t.id === id);
}

export function buildSmartTemplate(template: SmartTemplate, options: Record<string, SmartOptionValue>): SmartBuildResult {
  const merged: Record<string, SmartOptionValue> = {};
  for (const opt of template.options) merged[opt.key] = options[opt.key] ?? opt.default;
  return template.build(merged);
}

/** 供预览/卡片使用的元件/管路计数 */
export function smartTemplateCounts(template: SmartTemplate): { nodes: number; pipes: number } {
  const result = buildSmartTemplate(template, {});
  return { nodes: result.nodes.length, pipes: result.pipes.length };
}

/** 暴露入口端口，便于未来块级连接 */
export function smartTemplateInlet(result: SmartBuildResult): string | undefined {
  return result.inletPortId ?? result.nodes.find((n) => n.type === "inlet")?.ports.find((p) => p.direction === "out")?.id;
}

