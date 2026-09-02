import type { Diagram, DiagramNode, Pipe } from "./types";
import { uid } from "./types";
import { createNode } from "./symbols";
import { parseDiagramJSON } from "./export";
import msy2Demo from "../MSY2.json";

function portOn(node: DiagramNode, position: string): string {
  const p = node.ports.find((pp) => pp.position === position);
  return p ? p.id : node.ports[0]?.id ?? "";
}

/** 在指定 index 位置追加一个端口（如果已有则返回已有端口） */
function ensurePort(node: DiagramNode, position: "top" | "bottom" | "left" | "right", offset: number): string {
  const existing = node.ports.find((p) => p.position === position && Math.abs((p.offset ?? 0.5) - offset) < 0.01);
  if (existing) return existing.id;
  const port = { id: uid("p"), nodeId: node.id, position, offset };
  node.ports.push(port);
  return port.id;
}

function basePipe(overrides: Partial<Pipe> = {}): Omit<Pipe, "id" | "label" | "fromPortId" | "toPortId" | "points" | "fluidColor"> {
  return {
    nominalDiameter: "DN25",
    visualDiameter: 10,
    wallColor: "#5b6b7d",
    fluidOpacity: 0.92,
    direction: "forward",
    flowSpeed: 1.2,
    particleDensity: "medium",
    animated: true,
    showArrow: true,
    fluidType: "coldWater",
    material: "custom",
    wallOpacity: 1,
    ...overrides
  };
}

function pipe(
  label: string, fromPortId: string, toPortId: string,
  fluidColor: string, points: Array<{ x: number; y: number }> = [],
  extra: Partial<Pipe> = {}
): Pipe {
  return { id: uid("pipe"), label, fromPortId, toPortId, points, fluidColor, ...basePipe(extra) };
}

export function createCoffeeMachineDiagram(): Diagram {
  // ============================================================
  //  1. 节点创建
  // ============================================================
  const pump = createNode("pump", 120, 540, "进水水泵 P-01");
  const tee = createNode("tee", 360, 540, "三通分水阀 T-01");

  const hotWaterBoiler = createNode("hotWaterBoiler", 330, 380, "热水锅炉 B-01");
  // 热水锅炉顶部加 5 个出口（对应 5 个两通电磁阀）
  ensurePort(hotWaterBoiler, "top", 0.15);
  ensurePort(hotWaterBoiler, "top", 0.30);
  ensurePort(hotWaterBoiler, "top", 0.50);
  ensurePort(hotWaterBoiler, "top", 0.70);
  ensurePort(hotWaterBoiler, "top", 0.85);

  const steamBoiler = createNode("steamBoiler", 780, 400, "蒸汽锅炉 B-02");
  // 蒸汽锅炉顶部加端口：来水、安全阀、2 个三通电磁阀
  ensurePort(steamBoiler, "top", 0.20);
  ensurePort(steamBoiler, "top", 0.40);
  ensurePort(steamBoiler, "top", 0.60);
  ensurePort(steamBoiler, "top", 0.80);

  // 5 个两通电磁阀（热水锅炉顶部）
  const s2Cleaning = createNode("solenoid2", 140, 270, "清洗阀 S2-1");
  s2Cleaning.valveState = "open";
  const s2HWWand = createNode("solenoid2", 255, 270, "热水杆阀 S2-2");
  s2HWWand.valveState = "open";
  const s2ToSteam = createNode("solenoid2", 370, 270, "蒸汽锅炉阀 S2-3");
  s2ToSteam.valveState = "closed";
  const s2Brewer = createNode("solenoid2", 485, 270, "冲泡器阀 S2-4");
  s2Brewer.valveState = "open";
  const s2Relief = createNode("solenoid2", 600, 270, "泄压阀 S2-5");
  s2Relief.valveState = "closed";

  // 顶部输出设备
  const cleaningBox = createNode("shape", 140, 50, "清洗水路", "rect");
  cleaningBox.fontSize = 13;
  const hwWand = createNode("hotWaterWand", 255, 40, "热水杆 HW-01");
  const brewerBox = createNode("shape", 485, 50, "冲泡器出口", "rect");
  brewerBox.fontSize = 13;
  const steamWand = createNode("steamWand", 730, 40, "蒸汽杆 SW-01");
  const milkPump = createNode("milkPump", 930, 40, "奶泵模组 MP-01");

  // 蒸汽锅炉顶部附件
  const safetyValve = createNode("safetyValve", 930, 120, "安全阀 SV-01");
  const sv3_1 = createNode("solenoid3", 730, 170, "蒸汽分配阀 SV3-1");
  sv3_1.valvePath = "A";
  const sv3_2 = createNode("solenoid3", 930, 170, "奶路分配阀 SV3-2");
  sv3_2.valvePath = "A";

  // 蒸汽锅炉底部泄压
  const s2SteamRelief = createNode("solenoid2", 940, 660, "蒸汽泄压阀 S2-6");
  s2SteamRelief.valveState = "closed";
  const reliefOutlet = createNode("outlet", 1120, 660, "疏水出口");

  const nodes = [
    pump, tee,
    hotWaterBoiler, steamBoiler,
    s2Cleaning, s2HWWand, s2ToSteam, s2Brewer, s2Relief,
    cleaningBox, hwWand, brewerBox, steamWand, milkPump,
    safetyValve, sv3_1, sv3_2,
    s2SteamRelief, reliefOutlet
  ];

  // ============================================================
  //  2. 管路连接
  // ============================================================
  const pipes: Pipe[] = [];

  // ---- 进水主干 ----
  // 水泵 → 三通
  pipes.push(pipe("主供水管",
    portOn(pump, "right"), portOn(tee, "left"),
    "#2f7fd6", [], { visualDiameter: 12, wallColor: "#2b2e33", wallOpacity: 1, material: "blackPTFE", flowSpeed: 1.8 }));

  // 三通上 → 热水锅炉下端进水
  pipes.push(pipe("锅炉进水",
    portOn(tee, "top"), portOn(hotWaterBoiler, "bottom"),
    "#2f7fd6", [{ x: 430, y: 480 }], { fluidType: "coldWater", visualDiameter: 11, flowSpeed: 1.5 }));

  // 三通下 → 蒸汽锅炉上端进水
  pipes.push(pipe("蒸汽锅炉进水",
    portOn(tee, "bottom"), ensurePort(steamBoiler, "top", 0.20),
    "#2f7fd6", [{ x: 430, y: 610 }, { x: 860, y: 610 }, { x: 860, y: 400 }],
    { fluidType: "coldWater", visualDiameter: 11, flowSpeed: 1.4 }));

  // ---- 热水锅炉上端 → 5 个两通电磁阀 ----
  // 注意：热水锅炉 top 端口依次对应 5 个 solenoid2
  const boilerTopPorts = hotWaterBoiler.ports.filter(p => p.position === "top").sort((a, b) => (a.offset ?? 0.5) - (b.offset ?? 0.5));
  const s2list = [s2Cleaning, s2HWWand, s2ToSteam, s2Brewer, s2Relief];

  for (let i = 0; i < 5; i++) {
    const s2 = s2list[i];
    const label = ["去清洗", "热水杆", "去蒸汽锅炉", "去冲泡器", "泄压"][i];
    const colors = ["#e2542f", "#e2542f", "#e2542f", "#e2542f", "#e8964a"];
    const bp = boilerTopPorts[i];
    pipes.push(pipe(label, bp.id, portOn(s2, "left"),
      colors[i], [], { fluidType: "hotWater", visualDiameter: 8, flowSpeed: 1.2 }));
  }

  // ---- 5 个电磁阀出口 ----
  // S2-1 清洗
  pipes.push(pipe("清洗管路",
    portOn(s2Cleaning, "right"), portOn(cleaningBox, "left"),
    "#e2542f", [{ x: 260, y: 323 }], { fluidType: "hotWater", visualDiameter: 8 }));

  // S2-2 热水杆
  pipes.push(pipe("热水杆管路",
    portOn(s2HWWand, "right"), portOn(hwWand, "top"),
    "#e2542f", [{ x: 330, y: 323 }, { x: 330, y: 100 }], { fluidType: "hotWater", visualDiameter: 8 }));

  // S2-3 去蒸汽锅炉（从热水锅炉上端引热水入蒸汽锅炉）
  pipes.push(pipe("热水入蒸汽锅炉",
    portOn(s2ToSteam, "right"), ensurePort(steamBoiler, "top", 0.40),
    "#e2542f",
    [{ x: 480, y: 323 }, { x: 480, y: 360 }, { x: 870, y: 360 }, { x: 870, y: 400 }],
    { fluidType: "hotWater", visualDiameter: 8, flowSpeed: 1.3 }));

  // S2-4 冲泡器
  pipes.push(pipe("冲泡器管路",
    portOn(s2Brewer, "right"), portOn(brewerBox, "left"),
    "#e2542f", [{ x: 600, y: 323 }], { fluidType: "hotWater", visualDiameter: 8 }));

  // S2-5 泄压
  const reliefOut1Node = createNode("outlet", 700, 310, "泄压口");
  nodes.push(reliefOut1Node);
  pipes.push(pipe("泄压管路",
    portOn(s2Relief, "right"), portOn(reliefOut1Node, "left"),
    "#e8964a", [], { fluidType: "wasteLiquid", visualDiameter: 8 }));

  // ---- 蒸汽锅炉顶部附件 ----
  // 安全阀
  pipes.push(pipe("安全阀连接",
    portOn(safetyValve, "bottom"), ensurePort(steamBoiler, "top", 0.60),
    "#ef8aa0", [{ x: 940, y: 330, }], { fluidType: "steam", visualDiameter: 7 }));

  // SV3-1 左端接蒸汽锅炉顶部（蒸汽出口）
  pipes.push(pipe("蒸汽出口至分配阀",
    ensurePort(steamBoiler, "top", 0.80), portOn(sv3_1, "left"),
    "#ef8aa0", [{ x: 870, y: 310 }, { x: 765, y: 310 }], { fluidType: "steam", visualDiameter: 8, flowSpeed: 1.5 }));

  // SV3-1 右端 → 蒸汽杆
  pipes.push(pipe("蒸汽杆供汽",
    portOn(sv3_1, "right"), portOn(steamWand, "top"),
    "#ef8aa0", [{ x: 800, y: 220 }, { x: 770, y: 220 }, { x: 770, y: 110 }], { fluidType: "steam", visualDiameter: 8, flowSpeed: 1.8 }));

  // SV3-2 左端接蒸汽锅炉顶部
  pipes.push(pipe("蒸汽至奶路阀",
    ensurePort(steamBoiler, "top", 0.90), portOn(sv3_2, "left"),
    "#ef8aa0", [{ x: 995, y: 350 }, { x: 965, y: 350 }], { fluidType: "steam", visualDiameter: 8, flowSpeed: 1.5 }));

  // 为 SV3-2 加一个右端口（默认只有 left/bottom/right 三个），SV3-2 right 对应 A 路
  // SV3-2 右端 → 奶泵模组
  pipes.push(pipe("奶路供汽",
    portOn(sv3_2, "right"), portOn(milkPump, "left"),
    "#ef8aa0", [{ x: 1000, y: 220 }, { x: 1000, y: 100 }], { fluidType: "steam", visualDiameter: 8, flowSpeed: 1.6 }));

  // ---- 蒸汽下端泄压 ----
  pipes.push(pipe("蒸汽锅底排水",
    portOn(steamBoiler, "bottom"), portOn(s2SteamRelief, "left"),
    "#8a9ba8", [{ x: 880, y: 650 }], { fluidType: "wasteLiquid", visualDiameter: 8 }));

  pipes.push(pipe("疏水出口",
    portOn(s2SteamRelief, "right"), portOn(reliefOutlet, "left"),
    "#8a9ba8", [{ x: 1015, y: 713 }], { fluidType: "wasteLiquid", visualDiameter: 8 }));

  const reduceMotion =
    typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return {
    id: uid("diagram"),
    name: "商用咖啡机水路系统图",
    nodes,
    pipes,
    settings: {
      showGrid: true,
      background: "#eef2f7",
      globalAnimationPlaying: !reduceMotion,
      crossoverHops: true,
      layers: [{ id: "layer_default", name: "默认层", visible: true }]
    }
  };
}

export function createSampleDiagram(): Diagram {
  return createMinimalBrewDiagram();
}

/** 最简起步图：水泵 → 冲泡缸 → 咖啡出口（教学工作台默认打开） */
export function createMinimalBrewDiagram(): Diagram {
  const pump = createNode("pump", 120, 120, "水泵");
  pump.pumpOn = true;
  const brew = createNode("brewChamber", 320, 110, "冲泡缸");
  const out = createNode("coffeeOutlet", 520, 120, "咖啡出口");
  return {
    id: uid("diagram"),
    name: "最简冲泡示意",
    nodes: [pump, brew, out],
    pipes: [
      pipe("供水", portOn(pump, "right"), portOn(brew, "bottom"), "#2f7fd6", [], { fluidType: "coldWater" }),
      pipe("咖啡", portOn(brew, "top"), portOn(out, "top"), "#7b4a2d", [], { fluidType: "coffee" }),
    ],
    settings: { showGrid: true, background: "#eef2f7", globalAnimationPlaying: true, crossoverHops: true, appVersion: "1.23.0" },
  };
}

export function createEmptyDiagram(): Diagram {
  return {
    id: uid("diagram"),
    name: "未命名液路图",
    nodes: [],
    pipes: [],
    settings: { showGrid: true, background: "#eef2f7", globalAnimationPlaying: true, crossoverHops: true }
  };
}

/** 蒸汽系统：热水锅炉 → 蒸汽阀 → 蒸汽杆；锅炉顶安全阀；冷凝排水 */
export function createSteamSystemDiagram(): Diagram {
  const boiler = createNode("hotWaterBoiler", 120, 320, "热水锅炉 B-01");
  const pump = createNode("pump", 120, 500, "进水水泵 P-01");
  const inlet = createNode("inlet", 30, 515, "水源");
  const steamValve = createNode("valve", 320, 220, "蒸汽阀 SV-01");
  const steamWand = createNode("steamWand", 420, 180, "蒸汽杆 SW-01");
  const safety = createNode("safetyValve", 320, 420, "安全阀 SA-01");
  const drainValve = createNode("solenoid2", 320, 560, "排水阀 DV-01");
  drainValve.valveState = "closed";
  const drain = createNode("outlet", 440, 570, "冷凝排水口");
  const press = createNode("pressureGauge", 120, 180, "压力表 PG-01");

  const nodes = [inlet, pump, boiler, steamValve, steamWand, safety, drainValve, drain, press];

  const pipes: Pipe[] = [];
  // 水源 → 水泵 → 锅炉进水
  pipes.push(pipe("进水",
    portOn(inlet, "right"), portOn(pump, "left"),
    "#2f7fd6", [], { fluidType: "coldWater", visualDiameter: 9, wallColor: "#2b2e33", material: "blackPTFE" }));
  pipes.push(pipe("泵送",
    portOn(pump, "right"), portOn(boiler, "bottom"),
    "#2f7fd6", [{ x: 260, y: 545 }], { fluidType: "coldWater", visualDiameter: 9, wallColor: "#2b2e33", material: "blackPTFE" }));
  // 压力表
  pipes.push(pipe("压力检测",
    ensurePort(boiler, "top", 0.2), portOn(press, "bottom"),
    "#2f7fd6", [{ x: 160, y: 240 }], { fluidType: "steam", visualDiameter: 5, showArrow: false, flowSpeed: 0.6 }));
  // 蒸汽：锅炉顶 → 蒸汽阀 → 蒸汽杆
  pipes.push(pipe("蒸汽引出",
    ensurePort(boiler, "top", 0.55), portOn(steamValve, "left"),
    "#ef8aa0", [{ x: 355, y: 330 }], { fluidType: "steam", visualDiameter: 8, wallColor: "#e9ebee", material: "whitePTFE", flowSpeed: 1.6 }));
  pipes.push(pipe("蒸汽杆供汽",
    portOn(steamValve, "right"), portOn(steamWand, "top"),
    "#ef8aa0", [{ x: 460, y: 260 }], { fluidType: "steam", visualDiameter: 8, wallColor: "#e9ebee", material: "whitePTFE", flowSpeed: 1.8 }));
  // 安全阀
  pipes.push(pipe("安全阀连接",
    ensurePort(boiler, "top", 0.85), portOn(safety, "bottom"),
    "#ef8aa0", [{ x: 355, y: 440 }], { fluidType: "steam", visualDiameter: 7, flowSpeed: 1.2 }));
  // 排水
  pipes.push(pipe("锅炉排水",
    ensurePort(boiler, "bottom", 0.7), portOn(drainValve, "left"),
    "#8a9ba8", [{ x: 260, y: 600 }], { fluidType: "wasteLiquid", visualDiameter: 8, wallColor: "#2b2e33", material: "blackPTFE" }));
  pipes.push(pipe("冷凝排放",
    portOn(drainValve, "right"), portOn(drain, "left"),
    "#8a9ba8", [], { fluidType: "wasteLiquid", visualDiameter: 8, wallColor: "#2b2e33", material: "blackPTFE" }));

  return {
    id: uid("diagram"),
    name: "蒸汽系统",
    nodes,
    pipes,
    settings: { showGrid: true, background: "#eef2f7", globalAnimationPlaying: true, crossoverHops: true, layers: [{ id: "layer_default", name: "默认层", visible: true }] }
  };
}

/** 牛奶发泡系统：奶泵 → 换热/蒸汽混合 → 奶沫出口；蒸汽经三通分配阀 */
export function createMilkFoamDiagram(): Diagram {
  const milkTank = createNode("tank", 40, 100, "鲜奶罐 M-01");
  const milkPump = createNode("milkPump", 180, 120, "奶泵 MP-01");
  const tee = createNode("tee", 320, 120, "混合三通 T-01");
  const steamSrc = createNode("inlet", 320, 20, "蒸汽源");
  const steamValve = createNode("solenoid3", 460, 90, "蒸汽分配阀 SV3-1");
  steamValve.valvePath = "A";
  const mixer = createNode("heatExchanger", 600, 120, "奶泡混合器 HX-01");
  const milkOutlet = createNode("milkOutlet", 780, 130, "奶沫出口", "double");
  const drain = createNode("outlet", 620, 300, "废液出口");
  const drainValve = createNode("solenoid2", 520, 300, "冲洗阀 DV-01");
  drainValve.valveState = "closed";

  const nodes = [milkTank, milkPump, tee, steamSrc, steamValve, mixer, milkOutlet, drainValve, drain];

  const pipes: Pipe[] = [];
  // 鲜奶 → 奶泵 → 三通
  pipes.push(pipe("鲜奶吸入",
    portOn(milkTank, "right"), portOn(milkPump, "left"),
    "#f3ead6", [], { fluidType: "milk", visualDiameter: 8, wallColor: "#cfdeea", material: "silicone", wallOpacity: 0.5 }));
  pipes.push(pipe("奶泵送出",
    portOn(milkPump, "right"), portOn(tee, "left"),
    "#f3ead6", [], { fluidType: "milk", visualDiameter: 8, wallColor: "#cfdeea", material: "silicone", wallOpacity: 0.5, flowSpeed: 1.5 }));
  // 蒸汽 → 三通分配阀 → 混合器
  pipes.push(pipe("蒸汽输入",
    portOn(steamSrc, "right"), portOn(steamValve, "left"),
    "#ef8aa0", [{ x: 500, y: 40 }], { fluidType: "steam", visualDiameter: 7, wallColor: "#e9ebee", material: "whitePTFE", flowSpeed: 1.6 }));
  pipes.push(pipe("蒸汽混合",
    portOn(steamValve, "right"), portOn(mixer, "top"),
    "#ef8aa0", [{ x: 650, y: 140 }], { fluidType: "steam", visualDiameter: 7, wallColor: "#e9ebee", material: "whitePTFE", flowSpeed: 1.6 }));
  // 三通混合 → 换热器 → 奶沫出口
  pipes.push(pipe("奶汽混合",
    portOn(tee, "right"), portOn(mixer, "left"),
    "#f5e6d0", [{ x: 520, y: 160 }, { x: 520, y: 175 }], { fluidType: "hotMilkFoam", visualDiameter: 9, wallColor: "#cfdeea", material: "silicone", wallOpacity: 0.5, flowSpeed: 1.6 }));
  pipes.push(pipe("奶沫输出",
    portOn(mixer, "right"), portOn(milkOutlet, "top"),
    "#f8efe0", [], { fluidType: "hotMilkFoam", visualDiameter: 9, wallColor: "#cfdeea", material: "silicone", wallOpacity: 0.5, flowSpeed: 1.4 }));
  // 冲洗/废液：三通下方 → 冲洗阀 → 废液
  pipes.push(pipe("冲洗支路",
    portOn(tee, "bottom"), portOn(drainValve, "left"),
    "#8a9ba8", [{ x: 360, y: 240 }, { x: 360, y: 300 }, { x: 520, y: 300 }], { fluidType: "wasteLiquid", visualDiameter: 7, wallColor: "#2b2e33", material: "blackPTFE" }));
  pipes.push(pipe("废液排出",
    portOn(drainValve, "right"), portOn(drain, "left"),
    "#8a9ba8", [], { fluidType: "wasteLiquid", visualDiameter: 7, wallColor: "#2b2e33", material: "blackPTFE" }));

  return {
    id: uid("diagram"),
    name: "牛奶发泡系统",
    nodes,
    pipes,
    settings: { showGrid: true, background: "#eef2f7", globalAnimationPlaying: true, crossoverHops: true, layers: [{ id: "layer_default", name: "默认层", visible: true }] }
  };
}


/**
 * 商用咖啡机整机模板：完整双锅炉拓扑
 * 冷水 → 三通分路 → 热水锅炉/蒸汽锅炉
 * 热水锅炉顶部 5 阀（清洗/热水杆/蒸汽补水/冲泡/泄压）
 * 蒸汽锅炉顶部 安全阀 + 蒸汽三通（蒸汽杆/牛奶加热）
 * 牛奶链：奶泵 → 牛奶加热三通（蒸汽混合）→ 牛奶出口
 * 全链路介质：冷水/热水/蒸汽/咖啡/牛奶/热牛奶/废液
 */
export function createCommercialMachineDiagram(): Diagram {
  const inlet = createNode("inlet", 20, 420, "水源");
  const pump = createNode("pump", 160, 400, "进水水泵 P-01");
  const supplyTee = createNode("tee", 340, 400, "分水三通 T-01");

  const hotBoiler = createNode("hotWaterBoiler", 300, 180, "热水锅炉 HB-01");
  const steamBoiler = createNode("steamBoiler", 560, 420, "蒸汽锅炉 SB-01");

  // 热水锅炉顶部加 5 个出口端口（对应 5 个两通电磁阀）
  ensurePort(hotBoiler, "top", 0.12);
  ensurePort(hotBoiler, "top", 0.30);
  ensurePort(hotBoiler, "top", 0.50);
  ensurePort(hotBoiler, "top", 0.70);
  ensurePort(hotBoiler, "top", 0.88);
  // 蒸汽锅炉顶部加端口：来水、安全阀、蒸汽三通、牛奶加热三通
  ensurePort(steamBoiler, "top", 0.30);
  ensurePort(steamBoiler, "top", 0.60);
  ensurePort(steamBoiler, "top", 0.85);

  // 热水锅炉顶部 5 阀
  const vCleaning = createNode("solenoid2", 120, 60, "清洗阀 SV-1"); vCleaning.valveState = "closed";
  const vHotWand = createNode("solenoid2", 235, 60, "热水杆阀 SV-2"); vHotWand.valveState = "open";
  const vSteamFeed = createNode("solenoid2", 350, 60, "蒸汽补水阀 SV-3"); vSteamFeed.valveState = "open";
  const vBrewer = createNode("solenoid2", 465, 60, "冲泡器阀 SV-4"); vBrewer.valveState = "open";
  const vRelief = createNode("solenoid2", 580, 60, "泄压阀 SV-5"); vRelief.valveState = "closed";

  const cleaningBox = createNode("shape", 120, 10, "清洗水路", "rect"); cleaningBox.fontSize = 12;
  const hotWand = createNode("hotWaterWand", 235, 0, "热水杆 HW-01");
  const brewBox = createNode("shape", 465, 10, "冲泡器", "rect"); brewBox.fontSize = 12;
  const reliefOut = createNode("outlet", 640, 60, "泄压口");

  // 蒸汽锅炉顶部附件
  const safety = createNode("safetyValve", 620, 250, "安全阀 SA-01");
  const steam3way = createNode("solenoid3", 760, 300, "蒸汽分配三通 SV3-1"); steam3way.valvePath = "A";
  const steamWand = createNode("steamWand", 900, 250, "蒸汽杆 SW-01");
  const milkHeat3way = createNode("solenoid3", 900, 460, "牛奶加热三通 SV3-2"); milkHeat3way.valvePath = "A";
  // 三通无 top 端口，补一个用于牛奶进料
  ensurePort(milkHeat3way, "top", 0.5);

  // 牛奶链
  const milkTank = createNode("tank", 780, 620, "奶箱 MK-01");
  const milkPump = createNode("milkPump", 920, 620, "奶泵 MP-01");
  const milkOutlet = createNode("milkOutlet", 1080, 460, "牛奶出口 MO-01");

  // 排废
  const wasteValve = createNode("solenoid2", 620, 680, "排废阀 WV-01"); wasteValve.valveState = "closed";
  const wasteOut = createNode("outlet", 760, 690, "废液口");

  const nodes = [inlet, pump, supplyTee, hotBoiler, steamBoiler,
    vCleaning, vHotWand, vSteamFeed, vBrewer, vRelief,
    cleaningBox, hotWand, brewBox, reliefOut,
    safety, steam3way, steamWand, milkHeat3way,
    milkTank, milkPump, milkOutlet, wasteValve, wasteOut];

  const pipes: Pipe[] = [];
  // 供水
  pipes.push(pipe("水源", portOn(inlet, "right"), portOn(pump, "left"), "#2f7fd6", [], { fluidType: "coldWater", visualDiameter: 9, wallColor: "#2b2e33", material: "blackPTFE" }));
  pipes.push(pipe("泵出", portOn(pump, "right"), portOn(supplyTee, "left"), "#2f7fd6", [{ x: 300, y: 445 }], { fluidType: "coldWater", visualDiameter: 9, wallColor: "#2b2e33", material: "blackPTFE" }));
  pipes.push(pipe("锅炉进水", portOn(supplyTee, "top"), portOn(hotBoiler, "bottom"), "#2f7fd6", [{ x: 380, y: 320 }], { fluidType: "coldWater", visualDiameter: 8 }));
  pipes.push(pipe("蒸汽补水", portOn(supplyTee, "bottom"), ensurePort(steamBoiler, "top", 0.3), "#2f7fd6", [{ x: 380, y: 480 }, { x: 620, y: 480 }, { x: 620, y: 420 }], { fluidType: "coldWater", visualDiameter: 8 }));

  // 热水锅炉 5 阀
  const hbTop = hotBoiler.ports.filter((p) => p.position === "top").sort((a, b) => (a.offset ?? 0.5) - (b.offset ?? 0.5));
  const svList = [vCleaning, vHotWand, vSteamFeed, vBrewer, vRelief];
  const labels = ["去清洗", "热水杆", "蒸汽补水", "去冲泡", "泄压"];
  for (let i = 0; i < 5; i++) {
    pipes.push(pipe(labels[i], hbTop[i].id, portOn(svList[i], "left"), "#e2542f", [], { fluidType: "hotWater", visualDiameter: 7, flowSpeed: 1.3 }));
  }
  pipes.push(pipe("清洗管路", portOn(vCleaning, "right"), portOn(cleaningBox, "left"), "#e2542f", [{ x: 200, y: 100 }], { fluidType: "hotWater", visualDiameter: 7 }));
  pipes.push(pipe("热水输出", portOn(vHotWand, "right"), portOn(hotWand, "top"), "#e2542f", [{ x: 310, y: 100 }, { x: 310, y: 60 }], { fluidType: "hotWater", visualDiameter: 7 }));
  pipes.push(pipe("冲泡供水", portOn(vBrewer, "right"), portOn(brewBox, "left"), "#e2542f", [{ x: 550, y: 100 }], { fluidType: "hotWater", visualDiameter: 7 }));
  pipes.push(pipe("泄压排出", portOn(vRelief, "right"), portOn(reliefOut, "left"), "#8a9ba8", [{ x: 640, y: 100 }], { fluidType: "wasteLiquid", visualDiameter: 7 }));

  // 蒸汽锅炉顶部：安全阀 + 蒸汽三通
  pipes.push(pipe("安全阀连接", ensurePort(steamBoiler, "top", 0.6), portOn(safety, "bottom"), "#ef8aa0", [{ x: 660, y: 300 }], { fluidType: "steam", visualDiameter: 6 }));
  pipes.push(pipe("蒸汽引出", ensurePort(steamBoiler, "top", 0.85), portOn(steam3way, "left"), "#ef8aa0", [{ x: 720, y: 330 }], { fluidType: "steam", visualDiameter: 8, wallColor: "#e9ebee", material: "whitePTFE", flowSpeed: 1.6 }));
  pipes.push(pipe("蒸汽杆供汽", portOn(steam3way, "right"), portOn(steamWand, "top"), "#ef8aa0", [{ x: 830, y: 320 }, { x: 830, y: 250 }], { fluidType: "steam", visualDiameter: 8, wallColor: "#e9ebee", material: "whitePTFE", flowSpeed: 1.8 }));
  pipes.push(pipe("牛奶加热蒸汽", portOn(steam3way, "bottom"), portOn(milkHeat3way, "left"), "#ef8aa0", [{ x: 810, y: 430 }, { x: 860, y: 430 }], { fluidType: "steam", visualDiameter: 7, wallColor: "#e9ebee", material: "whitePTFE", flowSpeed: 1.4 }));

  // 牛奶链
  pipes.push(pipe("牛奶吸入", portOn(milkTank, "right"), portOn(milkPump, "left"), "#f3ead6", [{ x: 870, y: 660 }], { fluidType: "milk", visualDiameter: 8, wallColor: "#cfdeea", material: "silicone", wallOpacity: 0.5 }));
  pipes.push(pipe("牛奶泵送", portOn(milkPump, "right"), portOn(milkHeat3way, "top"), "#f3ead6", [{ x: 1000, y: 620 }, { x: 1000, y: 470 }], { fluidType: "milk", visualDiameter: 8, wallColor: "#cfdeea", material: "silicone", wallOpacity: 0.5 }));
  pipes.push(pipe("热牛奶输出", portOn(milkHeat3way, "right"), portOn(milkOutlet, "top"), "#f5e6d0", [{ x: 980, y: 480 }, { x: 980, y: 460 }], { fluidType: "hotMilk", visualDiameter: 8, wallColor: "#cfdeea", material: "silicone", wallOpacity: 0.5, flowSpeed: 1.5 }));

  // 排废
  pipes.push(pipe("废液收集", portOn(steamBoiler, "bottom"), portOn(wasteValve, "left"), "#8a9ba8", [{ x: 600, y: 700 }], { fluidType: "wasteLiquid", visualDiameter: 7, wallColor: "#2b2e33", material: "blackPTFE" }));
  pipes.push(pipe("废液排出", portOn(wasteValve, "right"), portOn(wasteOut, "left"), "#8a9ba8", [{ x: 690, y: 690 }], { fluidType: "wasteLiquid", visualDiameter: 7, wallColor: "#2b2e33", material: "blackPTFE" }));

  return {
    id: uid("diagram"),
    name: "商用咖啡机整机水路",
    nodes,
    pipes,
    settings: { showGrid: true, background: "#eef2f7", globalAnimationPlaying: true, crossoverHops: true, layers: [{ id: "layer_default", name: "默认层", visible: true }] }
  };
}

/** 演示用咖啡机整机示例：与「演示模式」内置场景（冲泡咖啡/热牛奶）的节点一一对应 */
export function createDemoMachineDiagram(): Diagram {
  const d = parseDiagramJSON(JSON.stringify(msy2Demo));
  if (!d.name) d.name = "咖啡机整机示例（演示）";
  return d;
}

// ===== 半自动咖啡机（双锅炉 + OPV + 冲煮头）=====
export function createSemiAutoMachineDiagram(): Diagram {
  const tank = createNode("tank", 40, 480, "水箱 WT-01", undefined, "sa_tank");
  const pump = createNode("pump", 170, 500, "进水水泵 P-01", undefined, "sa_pump");
  const teePump = createNode("tee", 300, 500, "泵后分水 T-01", undefined, "sa_teePump");
  const check = createNode("checkValve", 430, 490, "单向阀 CV-01", undefined, "sa_check");
  const teeBoiler = createNode("tee", 560, 500, "锅炉分水 T-02", undefined, "sa_teeBoiler");
  const opv = createNode("opv", 300, 640, "OPV 泄压阀", undefined, "sa_opv");
  const brewBoiler = createNode("hotWaterBoiler", 560, 220, "冲泡锅炉 BB-01", undefined, "sa_brewBoiler");
  const steamBoiler = createNode("steamBoiler", 560, 680, "蒸汽锅炉 SB-01", undefined, "sa_steamBoiler");
  const brewV3 = createNode("solenoid3", 760, 220, "冲泡三通阀 SV3-1", undefined, "sa_brewV3");
  const groupHead = createNode("groupHead", 920, 230, "冲煮头 GH-01", undefined, "sa_groupHead");
  const steamWand = createNode("steamWand", 720, 760, "蒸汽杆 SW-01", undefined, "sa_steamWand");
  const safety = createNode("safetyValve", 620, 60, "安全阀 RV-01", undefined, "sa_safety");
  const drainValve = createNode("solenoid2", 760, 420, "排废阀 DV-01", undefined, "sa_drain");
  const drainOut = createNode("outlet", 920, 430, "排废口", undefined, "sa_drainOut");

  ensurePort(teeBoiler, "top", 0.5);
  ensurePort(steamBoiler, "top", 0.75);
  ensurePort(steamBoiler, "top", 0.9);

  const nodes = [tank, pump, teePump, check, teeBoiler, opv, brewBoiler, steamBoiler, brewV3, groupHead, steamWand, safety, drainValve, drainOut];

  const pipes: Pipe[] = [];
  // 供水主干：水箱 → 泵 → 泵后分水（正常供水 + OPV 旁通）
  pipes.push(pipe("水箱进水", portOn(tank, "right"), portOn(pump, "left"), "#2f7fd6", [], { fluidType: "coldWater", visualDiameter: 9, wallColor: "#2b2e33", material: "blackPTFE" }));
  pipes.push(pipe("泵出", portOn(pump, "right"), portOn(teePump, "left"), "#2f7fd6", [], { fluidType: "coldWater", visualDiameter: 9, wallColor: "#2b2e33", material: "blackPTFE" }));
  pipes.push(pipe("正常供水", portOn(teePump, "right"), portOn(check, "left"), "#2f7fd6", [], { fluidType: "coldWater", visualDiameter: 9, wallColor: "#2b2e33", material: "blackPTFE" }));
  pipes.push(pipe("OPV 进水", portOn(teePump, "bottom"), portOn(opv, "bottom"), "#8a9ba8", [{ x: 332, y: 640 }], { fluidType: "coldWater", visualDiameter: 5, showArrow: false }));
  pipes.push(pipe("OPV 回流", portOn(opv, "right"), portOn(tank, "left"), "#8a9ba8", [{ x: 380, y: 700 }, { x: 20, y: 700 }, { x: 20, y: 545 }], { fluidType: "coldWater", visualDiameter: 5, showArrow: false }));
  // 单向阀 → 锅炉分水 → 双锅炉
  pipes.push(pipe("单向阀出", portOn(check, "right"), portOn(teeBoiler, "left"), "#2f7fd6", [{ x: 500, y: 500 }], { fluidType: "coldWater", visualDiameter: 9, wallColor: "#2b2e33", material: "blackPTFE" }));
  pipes.push(pipe("冲泡锅炉进水", portOn(teeBoiler, "top"), portOn(brewBoiler, "bottom"), "#2f7fd6", [{ x: 592, y: 380 }], { fluidType: "coldWater", visualDiameter: 8 }));
  pipes.push(pipe("蒸汽锅炉进水", portOn(teeBoiler, "bottom"), portOn(steamBoiler, "top"), "#2f7fd6", [{ x: 592, y: 620 }], { fluidType: "coldWater", visualDiameter: 8 }));
  // 冲泡锅炉 → 冲泡三通 → 冲煮头
  pipes.push(pipe("冲泡热水", portOn(brewBoiler, "top"), portOn(brewV3, "left"), "#e2542f", [{ x: 720, y: 250 }], { fluidType: "hotWater", visualDiameter: 8 }));
  pipes.push(pipe("冲煮供水", portOn(brewV3, "right"), portOn(groupHead, "top"), "#e2542f", [{ x: 950, y: 240 }], { fluidType: "hotWater", visualDiameter: 8, flowSpeed: 1.6 }));
  // 蒸汽锅炉 → 蒸汽杆 + 安全阀
  pipes.push(pipe("蒸汽杆供汽", ensurePort(steamBoiler, "top", 0.75), portOn(steamWand, "top"), "#ef8aa0", [{ x: 700, y: 700 }], { fluidType: "steam", visualDiameter: 7, wallColor: "#e9ebee", material: "whitePTFE", flowSpeed: 1.7 }));
  pipes.push(pipe("安全阀泄放", ensurePort(steamBoiler, "top", 0.9), portOn(safety, "bottom"), "#ef8aa0", [{ x: 640, y: 120 }], { fluidType: "steam", visualDiameter: 6, showArrow: false }));
  // 排废：冲泡三通底部 → 排废阀 → 排废口
  pipes.push(pipe("排废支路", portOn(brewV3, "bottom"), portOn(drainValve, "left"), "#8a9ba8", [{ x: 790, y: 420 }], { fluidType: "wasteLiquid", visualDiameter: 7, wallColor: "#2b2e33", material: "blackPTFE" }));
  pipes.push(pipe("排废排出", portOn(drainValve, "right"), portOn(drainOut, "left"), "#8a9ba8", [], { fluidType: "wasteLiquid", visualDiameter: 7, wallColor: "#2b2e33", material: "blackPTFE" }));

  return {
    id: uid("diagram"),
    name: "半自动咖啡机（双锅炉）",
    nodes,
    pipes,
    settings: { showGrid: true, background: "#eef2f7", globalAnimationPlaying: true, crossoverHops: true, layers: [{ id: "layer_default", name: "默认层", visible: true }] }
  };
}

// ===== 全自动商用咖啡机（定量 + 奶路）=====
export function createFullAutoMachineDiagram(): Diagram {
  const tank = createNode("tank", 40, 420, "水箱 WT-01", undefined, "fa_tank");
  const flowMeter = createNode("flowMeter", 170, 410, "流量计 FM-01", undefined, "fa_flowMeter");
  const pump = createNode("pump", 290, 420, "进水水泵 P-01", undefined, "fa_pump");
  const check = createNode("checkValve", 410, 410, "单向阀 CV-01", undefined, "fa_check");
  const tee = createNode("tee", 520, 410, "分水三通 T-01", undefined, "fa_tee");
  const brewBoiler = createNode("hotWaterBoiler", 520, 200, "冲泡锅炉 BB-01", undefined, "fa_brewBoiler");
  const steamBoiler = createNode("steamBoiler", 520, 580, "蒸汽锅炉 SB-01", undefined, "fa_steamBoiler");
  const brewUnit = createNode("groupHead", 720, 220, "冲泡器 BR-01", undefined, "fa_brewUnit");
  const coffeeOut = createNode("coffeeOutlet", 900, 240, "咖啡出口", "single", "fa_coffeeOut");
  const steamWand = createNode("steamWand", 720, 640, "蒸汽杆 SW-01", undefined, "fa_steamWand");
  const hotWand = createNode("hotWaterWand", 900, 340, "热水杆 HW-01", undefined, "fa_hotWand");
  const milkTank = createNode("tank", 900, 460, "奶箱 MK-01", undefined, "fa_milkTank");
  const milkPump = createNode("milkPump", 1040, 470, "奶泵 MP-01", undefined, "fa_milkPump");
  const milkMixer = createNode("heatExchanger", 1160, 420, "奶泡器 HX-01", undefined, "fa_milkMixer");
  const milkOut = createNode("milkOutlet", 1300, 430, "牛奶出口", "single", "fa_milkOut");
  const drainValve = createNode("solenoid2", 720, 760, "排废阀 DV-01", undefined, "fa_drain");
  const drainOut = createNode("outlet", 860, 770, "废液口", undefined, "fa_drainOut");

  ensurePort(steamBoiler, "top", 0.75);
  ensurePort(brewBoiler, "top", 0.75);

  const nodes = [tank, flowMeter, pump, check, tee, brewBoiler, steamBoiler, brewUnit, coffeeOut, steamWand, hotWand, milkTank, milkPump, milkMixer, milkOut, drainValve, drainOut];

  const pipes: Pipe[] = [];
  // 供水主干（定量：流量计）
  pipes.push(pipe("水箱进水", portOn(tank, "right"), portOn(flowMeter, "left"), "#2f7fd6", [], { fluidType: "coldWater", visualDiameter: 9, wallColor: "#2b2e33", material: "blackPTFE" }));
  pipes.push(pipe("定量供水", portOn(flowMeter, "right"), portOn(pump, "left"), "#2f7fd6", [], { fluidType: "coldWater", visualDiameter: 9, wallColor: "#2b2e33", material: "blackPTFE" }));
  pipes.push(pipe("泵出", portOn(pump, "right"), portOn(check, "left"), "#2f7fd6", [], { fluidType: "coldWater", visualDiameter: 9, wallColor: "#2b2e33", material: "blackPTFE" }));
  pipes.push(pipe("分水", portOn(check, "right"), portOn(tee, "left"), "#2f7fd6", [{ x: 470, y: 410 }], { fluidType: "coldWater", visualDiameter: 9, wallColor: "#2b2e33", material: "blackPTFE" }));
  pipes.push(pipe("冲泡锅炉进水", portOn(tee, "right"), portOn(brewBoiler, "bottom"), "#2f7fd6", [{ x: 560, y: 280 }], { fluidType: "coldWater", visualDiameter: 8 }));
  pipes.push(pipe("蒸汽锅炉进水", portOn(tee, "bottom"), portOn(steamBoiler, "top"), "#2f7fd6", [{ x: 560, y: 540 }], { fluidType: "coldWater", visualDiameter: 8 }));
  // 冲泡锅炉 → 冲泡器 → 咖啡出口
  pipes.push(pipe("冲泡热水", portOn(brewBoiler, "top"), portOn(brewUnit, "top"), "#e2542f", [{ x: 680, y: 240 }], { fluidType: "hotWater", visualDiameter: 8 }));
  pipes.push(pipe("咖啡液", portOn(brewUnit, "bottom"), portOn(coffeeOut, "top"), "#7b4a2d", [{ x: 780, y: 300 }, { x: 940, y: 300 }], { fluidType: "coffee", visualDiameter: 8, flowSpeed: 1.3 }));
  // 蒸汽 + 热水
  pipes.push(pipe("蒸汽杆供汽", ensurePort(steamBoiler, "top", 0.75), portOn(steamWand, "top"), "#ef8aa0", [{ x: 700, y: 600 }], { fluidType: "steam", visualDiameter: 7, wallColor: "#e9ebee", material: "whitePTFE", flowSpeed: 1.7 }));
  pipes.push(pipe("热水输出", ensurePort(brewBoiler, "top", 0.75), portOn(hotWand, "top"), "#e2542f", [{ x: 610, y: 300 }, { x: 923, y: 300 }], { fluidType: "hotWater", visualDiameter: 7 }));
  // 奶路
  pipes.push(pipe("鲜奶吸入", portOn(milkTank, "right"), portOn(milkPump, "left"), "#f3ead6", [{ x: 1000, y: 480 }], { fluidType: "milk", visualDiameter: 8, wallColor: "#cfdeea", material: "silicone", wallOpacity: 0.5 }));
  pipes.push(pipe("奶泵送出", portOn(milkPump, "right"), portOn(milkMixer, "left"), "#f3ead6", [{ x: 1110, y: 440 }], { fluidType: "milk", visualDiameter: 8, wallColor: "#cfdeea", material: "silicone", wallOpacity: 0.5, flowSpeed: 1.4 }));
  pipes.push(pipe("热奶输出", portOn(milkMixer, "right"), portOn(milkOut, "top"), "#f5e6d0", [{ x: 1280, y: 430 }], { fluidType: "hotMilk", visualDiameter: 8, wallColor: "#cfdeea", material: "silicone", wallOpacity: 0.5, flowSpeed: 1.4 }));
  // 排废
  pipes.push(pipe("排废收集", portOn(steamBoiler, "bottom"), portOn(drainValve, "left"), "#8a9ba8", [{ x: 559, y: 760 }], { fluidType: "wasteLiquid", visualDiameter: 7, wallColor: "#2b2e33", material: "blackPTFE" }));
  pipes.push(pipe("排废排出", portOn(drainValve, "right"), portOn(drainOut, "left"), "#8a9ba8", [], { fluidType: "wasteLiquid", visualDiameter: 7, wallColor: "#2b2e33", material: "blackPTFE" }));

  return {
    id: uid("diagram"),
    name: "全自动商用咖啡机",
    nodes,
    pipes,
    settings: { showGrid: true, background: "#eef2f7", globalAnimationPlaying: true, crossoverHops: true, layers: [{ id: "layer_default", name: "默认层", visible: true }] }
  };
}
