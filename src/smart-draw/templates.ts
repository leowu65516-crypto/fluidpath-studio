import type { DiagramNode, Pipe } from "../types";
import { connect, makeNode, mergeResults, offsetNodes } from "./builders";
import type { SmartBuildResult, SmartOption, SmartOptionValue, SmartTemplate } from "./types";

const isEn = () => typeof document !== "undefined" && document.documentElement.lang === "en";
const L = (zh: string, en: string) => (isEn() ? en : zh);

function buildWater(): SmartBuildResult {
  const inlet = makeNode("inlet", 80, 140, L("进水口", "Water inlet"));
  const pump = makeNode("pump", 220, 130, L("水泵", "Water pump"));
  const boiler = makeNode("hotWaterBoiler", 400, 110, L("热水锅炉", "Hot-water boiler"));
  const outlet = makeNode("hotWaterOutlet", 640, 90, L("热水出口", "Hot-water outlet"));
  const pipes: Pipe[] = [
    connect(inlet, "right", pump, "left", "coldWater", L("进水", "Feed")),
    connect(pump, "right", boiler, "bottom", "coldWater", L("泵出", "Pump out")),
    connect(boiler, "top", outlet, "top", "hotWater", L("热水", "Hot water")),
  ];
  return { nodes: [inlet, pump, boiler, outlet], pipes };
}

function buildCoffee(): SmartBuildResult {
  const inlet = makeNode("inlet", 80, 240, L("进水口", "Water inlet"));
  const pump = makeNode("pump", 220, 230, L("水泵", "Water pump"));
  const boiler = makeNode("hotWaterBoiler", 400, 210, L("热水锅炉", "Hot-water boiler"));
  const brewValve = makeNode("solenoid3", 600, 220, L("咖啡冲泡三通阀", "Brew 3-way valve"));
  const chamber = makeNode("brewChamber", 780, 190, L("冲泡缸", "Brew chamber"));
  const coffee = makeNode("coffeeOutlet", 960, 120, L("咖啡出口", "Coffee outlet"));
  const drain = makeNode("outlet", 600, 420, L("咖啡排废", "Coffee drain"));
  const pipes: Pipe[] = [
    connect(inlet, "right", pump, "left", "coldWater", L("进水", "Feed")),
    connect(pump, "right", boiler, "bottom", "coldWater", L("泵出", "Pump out")),
    connect(boiler, "top", brewValve, "left", "hotWater", L("热水", "Hot water")),
    connect(brewValve, "right", chamber, "bottom", "hotWater", L("冲泡进水", "Brew feed")),
    connect(chamber, "top", coffee, "top", "coffee", L("咖啡液", "Coffee")),
    connect(brewValve, "bottom", drain, "left", "wasteLiquid", L("排废", "Drain")),
  ];
  return { nodes: [inlet, pump, boiler, brewValve, chamber, coffee, drain], pipes };
}

function buildSteam(): SmartBuildResult {
  const inlet = makeNode("inlet", 80, 200, L("蒸汽补水口", "Steam water inlet"));
  const boiler = makeNode("steamBoiler", 280, 180, L("蒸汽锅炉", "Steam boiler"));
  const valve = makeNode("solenoid3", 500, 200, L("蒸汽三通阀", "Steam 3-way valve"));
  const wand = makeNode("steamWand", 700, 150, L("蒸汽杆", "Steam wand"));
  const drain = makeNode("outlet", 500, 400, L("蒸汽排废", "Steam drain"));
  const pipes: Pipe[] = [
    connect(inlet, "right", boiler, "top", "coldWater", L("蒸汽补水", "Steam feed")),
    connect(boiler, "bottom", valve, "left", "steam", L("蒸汽", "Steam")),
    connect(valve, "right", wand, "top", "steam", L("蒸汽杆", "Steam wand")),
    connect(valve, "bottom", drain, "left", "wasteLiquid", L("排废", "Drain")),
  ];
  return { nodes: [inlet, boiler, valve, wand, drain], pipes };
}

function buildMilk(options: Record<string, SmartOptionValue>): SmartBuildResult {
  const doubleTank = options.doubleTank !== false;
  const withSteam = options.steam !== false;
  const tankA = makeNode("tank", 80, 120, L("奶罐 A", "Milk tank A"));
  const nodes: DiagramNode[] = [tankA];
  const pipes: Pipe[] = [];
  const pump = makeNode("milkPump", 400, 180, L("奶泵", "Milk pump"));
  nodes.push(pump);

  if (doubleTank) {
    const tankB = makeNode("tank", 80, 330, L("奶罐 B", "Milk tank B"));
    const selective = makeNode("diaphragmValve3", 250, 180, L("选择阀", "Selector"));
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
    return { nodes, pipes };
  }

  const tee = makeNode("tee", 580, 180, L("混合三通", "Mixing tee"));
  nodes.push(tee);
  pipes.push(connect(pump, "right", tee, "left", "coldMilk", L("奶泵出", "Pump out")));
  pipes.push(connect(tee, "right", outlet, "top", "coldMilk", L("奶路", "Milk line")));

  const steamInlet = makeNode("inlet", 180, 470, L("蒸汽补水口", "Steam water inlet"));
  const steamBoiler = makeNode("steamBoiler", 400, 420, L("蒸汽锅炉", "Steam boiler"));
  const heatValve = makeNode("solenoid3", 600, 420, L("牛奶加热三通阀", "Milk heat valve"));
  const check = makeNode("checkValve", 760, 420, L("加热单向阀", "Heat check valve"));
  const waste = makeNode("outlet", 600, 580, L("加热排废", "Heat drain"));
  nodes.push(steamInlet, steamBoiler, heatValve, check, waste);
  pipes.push(connect(steamInlet, "right", steamBoiler, "top", "coldWater", L("蒸汽补水", "Steam feed")));
  pipes.push(connect(steamBoiler, "bottom", heatValve, "left", "steam", L("蒸汽", "Steam")));
  pipes.push(connect(heatValve, "right", check, "left", "steam", L("加热蒸汽", "Heat steam")));
  pipes.push(connect(check, "right", tee, "bottom", "steam", L("混合加热", "Heat mix")));
  pipes.push(connect(heatValve, "bottom", waste, "left", "wasteLiquid", L("加热排废", "Heat drain")));
  return { nodes, pipes };
}

function buildFull(options: Record<string, SmartOptionValue>): SmartBuildResult {
  const coffee = buildCoffee();
  const milk = buildMilk({ ...options, doubleTank: true, steam: true });
  offsetNodes(milk.nodes, 0, 520);
  return mergeResults([coffee, milk]);
}

const optionsDoubleTank: SmartOption[] = [
  { key: "doubleTank", labelZh: "双奶罐（选择阀）", labelEn: "Two milk tanks (selector)", kind: "boolean", default: true },
];
const optionsSteam: SmartOption[] = [
  { key: "steam", labelZh: "蒸汽加热支路", labelEn: "Steam heating branch", kind: "boolean", default: true },
];

export const SMART_TEMPLATES: SmartTemplate[] = [
  {
    id: "water",
    titleZh: "基础水路",
    titleEn: "Basic water circuit",
    descZh: "进水口 → 水泵 → 热水锅炉 → 热水出口",
    descEn: "Inlet → pump → hot-water boiler → outlet",
    keywords: ["水", "水路", "锅炉", "泵", "water", "boiler", "pump"],
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
    options: [],
    build: buildCoffee,
  },
  {
    id: "milk",
    titleZh: "奶路",
    titleEn: "Milk line",
    descZh: "奶罐 → 选择阀 → 奶泵 → 混合/加热 → 牛奶出口",
    descEn: "Tank → selector → milk pump → mix/heat → milk outlet",
    keywords: ["奶", "牛奶", "milk", "奶路", "奶泡"],
    options: [...optionsDoubleTank, ...optionsSteam],
    build: buildMilk,
  },
  {
    id: "steam",
    titleZh: "蒸汽系统",
    titleEn: "Steam system",
    descZh: "蒸汽补水口 → 蒸汽锅炉 → 蒸汽三通阀 → 蒸汽杆 + 排废",
    descEn: "Steam inlet → steam boiler → steam 3-way valve → steam wand + drain",
    keywords: ["蒸汽", "steam", "蒸汽杆", "蒸汽系统"],
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

