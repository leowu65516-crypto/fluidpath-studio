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

function stopTeaching(pipe: Pipe): Pipe {
  pipe.teachingOverride = "stop";
  return pipe;
}

/** 咖啡/即热的冲泡排废：先向左下绕开冲泡进水竖管，再进入排废口。 */
function routeBrewDrain(pipes: Pipe[], valve: DiagramNode, drain: DiagramNode): void {
  const fromId = portOf(valve, "bottom").id;
  const toId = portOf(drain, "left").id;
  const pipe = pipes.find((p) => p.fromPortId === fromId && p.toPortId === toId);
  if (!pipe) return;
  const laneX = valve.x - 400;
  const downY = valve.y + valve.height + 240;
  pipe.points = [
    { x: valve.x + valve.width / 2, y: downY },
    { x: laneX, y: downY },
    { x: laneX, y: drain.y + drain.height / 2 },
  ];
}

/** 将一组节点标记为二级系统（主链视图折叠时隐藏）。 */
function markSecondary(nodes: DiagramNode[]): void {
  for (const n of nodes) n.smartSecondary = true;
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
  waste?: { x: number; y: number };
}) {
  const { nodes, pipes, boiler, boilerPort, next, nextPort, fluid, kind, cross, waste: wasteAt } = opts;
  removeDirectPipe(pipes, boiler, boilerPort, next, nextPort);
  const junction = makeNode("cross", cross.x, cross.y, "");
  const gauge = makeNode("pressureGauge", cross.x, cross.y - 120, L("压力表", "Pressure gauge"));
  const relief = makeNode(kind, cross.x, cross.y + 110, kind === "opv" ? L("OPV 泄压", "OPV relief") : L("安全阀", "Safety valve"));
  const waste = makeNode("outlet", wasteAt?.x ?? cross.x + 140, wasteAt?.y ?? cross.y + 130, kind === "opv" ? L("泄压排废", "Relief drain") : L("安全排废", "Safety drain"));
  markSecondary([gauge, relief, waste]);
  nodes.push(junction, gauge, relief, waste);
  const tag = boiler.label;
  pipes.push(connect(boiler, boilerPort, junction, "left", fluid, L(`${tag}出口`, `${tag} out`)));
  pipes.push(connect(junction, "right", next, nextPort, fluid, L(`${tag}安全附件后`, `${tag} after safety`)));
  const gaugePipe = connect(junction, "top", gauge, "bottom", fluid, L(`${tag}表压`, `${tag} gauge`));
  gaugePipe.annotation = L("传压不流过", "Pressure only");
  pipes.push(gaugePipe);
  pipes.push(stopTeaching(connect(junction, "bottom", relief, "bottom", fluid, L(`${tag}泄压`, `${tag} relief`))));
  const wastePipe = stopTeaching(connect(relief, "right", waste, "left", "wasteLiquid", L(`${tag}泄压排废`, `${tag} relief drain`)));
  if (wasteAt && wasteAt.x < cross.x) {
    // 泄压口放在十字四通左侧时，先向下绕到安全阀下方再折左，避免穿过阀体与泄压管。
    const yLine = cross.y + 210;
    wastePipe.points = [{ x: cross.x + 64, y: yLine }, { x: wasteAt.x, y: yLine }];
  }
  pipes.push(wastePipe);
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
  pipes.push(connect(pump, "right", check, "left", fluid, L(`${pump.label}出口`, `${pump.label} out`)));
  pipes.push(connect(check, "right", next, nextPort, fluid, L(`${pump.label}单向阀后`, `${pump.label} after check`)));
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
  const safety = addBoilerSafety({ nodes, pipes, boiler, boilerPort: "top", next: brewValve, nextPort: "left", fluid: "hotWater", kind: "opv", cross: { x: 520, y: 230 }, waste: { x: 270, y: 380 } });
  let steamValve: DiagramNode | undefined;
  routeBrewDrain(pipes, brewValve, drain);
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
  addBoilerSafety({ nodes, pipes, boiler: heater, boilerPort: "right", next: brewValve, nextPort: "left", fluid: "hotWater", kind: "opv", cross: { x: 520, y: 230 }, waste: { x: 270, y: 380 } });
  routeBrewDrain(pipes, brewValve, drain);
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
  const boiler = makeNode("steamBoiler", 340, 180, L("蒸汽锅炉", "Steam boiler"));
  const valve = makeNode("solenoid3", 560, 300, L("蒸汽三通阀", "Steam 3-way valve"));
  const wand = makeNode("steamWand", 780, 270, L("蒸汽杆", "Steam wand"));
  const drain = makeNode("outlet", 700, 560, L("蒸汽排废", "Steam drain"));
  const nodes = [inlet, boiler, valve, wand, drain];
  const pipes: Pipe[] = [
    connect(inlet, "right", boiler, "top", "coldWater", L("蒸汽补水", "Steam feed")),
    connect(boiler, "bottom", valve, "left", "steam", L("蒸汽", "Steam")),
    connect(valve, "right", wand, "top", "steam", L("蒸汽杆", "Steam wand")),
    connect(valve, "bottom", drain, "left", "wasteLiquid", L("排废", "Drain")),
  ];
  const check = makeNode("checkValve", 180, 220, L("补水单向阀", "Fill check valve"));
  const fillValve = makeNode("solenoid2", 250, 220, L("蒸汽补水阀", "Steam fill valve"));
  removeDirectPipe(pipes, inlet, "right", boiler, "top");
  nodes.push(check, fillValve);
  pipes.push(connect(inlet, "right", check, "left", "coldWater", L("蒸汽补水", "Steam feed")));
  pipes.push(connect(check, "right", fillValve, "left", "coldWater", L("补水阀前", "Before fill valve")));
  pipes.push(connect(fillValve, "right", boiler, "top", "coldWater", L("锅炉补水", "Boiler feed")));
  addBoilerSafety({ nodes, pipes, boiler, boilerPort: "bottom", next: valve, nextPort: "left", fluid: "steam", kind: "safetyValve", cross: { x: 470, y: 300 }, waste: { x: 600, y: 540 } });
  applyIdleStates(nodes);
  return {
    nodes,
    pipes,
    conditions: [
      makeCondition(L("待机", "Idle"), nodes),
      makeCondition(L("蒸汽", "Steam"), nodes, { [valve.id]: { valvePath: "A" }, [fillValve.id]: { valveState: "open" } }),
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
    markSecondary([tankB, selective]);
    nodes.push(tankB, selective);
    pipes.push(connect(tankA, "top", selective, "left", "coldMilk", L("奶罐 A 出液", "Tank A out")));
    pipes.push(connect(tankB, "top", selective, "bottom", "coldMilk", L("奶罐 B 出液", "Tank B out")));
    pipes.push(connect(selective, "right", pump, "left", "coldMilk", L("选奶", "Milk select")));
  } else {
    pipes.push(connect(tankA, "top", pump, "left", "coldMilk", L("奶罐出液", "Tank out")));
  }

  // 真机牛奶出口前有一个奶排废三通：A 出奶，B 排废/清洗，off 待机隔离。
  const outletValve = makeNode("solenoid3", 680, 110, L("牛奶出口三通阀", "Milk outlet 3-way valve"));
  const outlet = makeNode("milkOutlet", 840, 110, L("牛奶出口", "Milk outlet"));
  const milkDrain = makeNode("outlet", 680, 300, L("牛奶排废", "Milk drain"));
  nodes.push(outletValve, outlet, milkDrain);
  pipes.push(connect(outletValve, "right", outlet, "top", "coldMilk", L("牛奶出口", "Milk outlet")));
  pipes.push(connect(outletValve, "bottom", milkDrain, "left", "wasteLiquid", L("牛奶排废", "Milk drain")));

  if (!withSteam) {
    pipes.push(connect(pump, "right", outletValve, "left", "coldMilk", L("奶路", "Milk line")));
    addPumpCheck({ nodes, pipes, pump, next: outletValve, nextPort: "left", fluid: "coldMilk", x: 520, y: 200 });
    applyIdleStates(nodes);
    return {
      nodes,
      pipes,
      conditions: [
        makeCondition(L("待机", "Idle"), nodes),
        makeCondition(L("奶路", "Milk line"), nodes, {
          [pump.id]: { pumpOn: true },
          ...(doubleTank ? { [selective!.id]: { valvePath: "A" } } : {}),
          [outletValve.id]: { valvePath: "A" },
        }),
      ],
    };
  }

  const tee = makeNode("cross", 580, 180, "");
  const cleaningValve = makeNode("solenoid2", 500, 40, L("奶路清洗阀", "Milk cleaning valve"));
  const cleaningDrain = makeNode("outlet", 640, 20, L("奶路清洗排废", "Milk cleaning drain"));
  markSecondary([tee, cleaningValve, cleaningDrain, outletValve, outlet, milkDrain]);
  nodes.push(tee, cleaningValve, cleaningDrain);
  pipes.push(connect(pump, "right", tee, "left", "coldMilk", L("奶泵出", "Pump out")));
  pipes.push(connect(tee, "right", outletValve, "left", "coldMilk", L("奶路", "Milk line")));
  pipes.push(connect(tee, "top", cleaningValve, "left", "coldWater", L("奶路清洗", "Milk cleaning")));
  pipes.push(connect(cleaningValve, "right", cleaningDrain, "left", "wasteLiquid", L("清洗排废", "Cleaning drain")));
  addPumpCheck({ nodes, pipes, pump, next: tee, nextPort: "left", fluid: "coldMilk", x: 500, y: 200 });

  // 蒸汽锅炉补水：补水口 → 单向阀 → 补水电磁阀 → 锅炉，待机时阀关，避免“永远在补水”。
  const steamInlet = makeNode("inlet", 380, 460, L("蒸汽补水口", "Steam water inlet"));
  const fillCheck = makeNode("checkValve", 480, 460, L("补水单向阀", "Fill check valve"));
  const fillValve = makeNode("solenoid2", 560, 440, L("蒸汽补水阀", "Steam fill valve"));
  const steamBoiler = makeNode("steamBoiler", 560, 520, L("蒸汽锅炉", "Steam boiler"));
  const heatValve = makeNode("solenoid3", 760, 430, L("牛奶加热三通阀", "Milk heat valve"));
  const check = makeNode("checkValve", 620, 320, L("加热单向阀", "Heat check valve"));
  check.rotation = 90; // 单向阀竖放：下进上出，蒸汽从下方汇入奶路三通
  const waste = makeNode("outlet", 900, 560, L("加热排废", "Heat drain"));
  markSecondary([steamInlet, fillCheck, fillValve, steamBoiler, heatValve, check, waste, pump, tankA]);
  if (selective) markSecondary([selective]);
  nodes.push(steamInlet, fillCheck, fillValve, steamBoiler, heatValve, check, waste);
  pipes.push(connect(steamInlet, "right", fillCheck, "left", "coldWater", L("蒸汽补水", "Steam feed")));
  pipes.push(connect(fillCheck, "right", fillValve, "left", "coldWater", L("补水阀前", "Before fill valve")));
  pipes.push(connect(fillValve, "right", steamBoiler, "top", "coldWater", L("锅炉补水", "Boiler feed")));
  pipes.push(connect(heatValve, "right", check, "left", "steam", L("加热蒸汽", "Heat steam")));
  pipes.push(connect(check, "right", tee, "bottom", "steam", L("混合加热", "Heat mix")));
  pipes.push(connect(heatValve, "bottom", waste, "left", "wasteLiquid", L("加热排废", "Heat drain")));
  addBoilerSafety({ nodes, pipes, boiler: steamBoiler, boilerPort: "bottom", next: heatValve, nextPort: "left", fluid: "steam", kind: "safetyValve", cross: { x: 610, y: 800 }, waste: { x: 750, y: 950 } });
  applyIdleStates(nodes);
  return {
    nodes,
    pipes,
    conditions: [
      makeCondition(L("待机", "Idle"), nodes),
      makeCondition(L("奶路", "Milk line"), nodes, {
        [pump.id]: { pumpOn: true },
        ...(doubleTank ? { [selective!.id]: { valvePath: "A" } } : {}),
        [outletValve.id]: { valvePath: "A" },
      }),
      // 真机热牛奶：奶泵开 + 选奶 A + 加热阀 A + 出口 A；补水阀维持锅炉水位。
      makeCondition(L("热牛奶", "Hot milk"), nodes, {
        [pump.id]: { pumpOn: true },
        ...(doubleTank ? { [selective!.id]: { valvePath: "A" } } : {}),
        [heatValve.id]: { valvePath: "A" },
        [fillValve.id]: { valveState: "open" },
        [outletValve.id]: { valvePath: "A" },
      }),
      // 蒸汽吹扫：奶泵停，蒸汽经加热阀和单向阀进入奶路，从出口三通 B 档排废。
      makeCondition(L("蒸汽吹扫", "Steam purge"), nodes, {
        [heatValve.id]: { valvePath: "A" },
        [fillValve.id]: { valveState: "open" },
        [outletValve.id]: { valvePath: "B" },
      }),
      makeCondition(L("清洗", "Cleaning"), nodes, {
        [pump.id]: { pumpOn: true },
        ...(doubleTank ? { [selective!.id]: { valvePath: "A" } } : {}),
        [cleaningValve.id]: { valveState: "open" },
        [outletValve.id]: { valvePath: "B" },
      }),
    ],
  };
}

function buildFull(options: Record<string, SmartOptionValue>): SmartBuildResult {
  const coffee = buildCoffee();
  const milk = buildMilk({ ...options, doubleTank: true, steam: true });
  offsetNodes(milk.nodes, 0, 520);
  const merged = mergeResults([coffee, milk]);
  const all = merged.nodes;
  const pipes = merged.pipes;
  const coffeeNodes = coffee.nodes;
  const coffeePump = coffeeNodes.find((n) => n.type === "pump")!;
  const coffeeCheck = coffeeNodes.find((n) => n.type === "checkValve")!;
  const coffeeBoiler = coffeeNodes.find((n) => n.type === "hotWaterBoiler")!;
  const brewValve = coffeeNodes.find((n) => n.type === "solenoid3")!;
  const milkPump = milk.nodes.find((n) => n.type === "milkPump")!;
  const selector = milk.nodes.find((n) => n.type === "diaphragmValve3");
  const heatValve = milk.nodes.find((n) => n.type === "solenoid3" && /加热|heat/i.test(n.label))!;
  const fillValve = milk.nodes.find((n) => n.type === "solenoid2" && /补水|fill/i.test(n.label))!;
  const fillCheck = milk.nodes.find((n) => n.type === "checkValve" && /补水|fill/i.test(n.label))!;
  const milkValve = milk.nodes.find((n) => n.type === "solenoid3" && /出口|outlet/i.test(n.label))!;
  const cleaningValve = milk.nodes.find((n) => n.type === "solenoid2" && /清洗|clean/i.test(n.label))!;
  const steamInlet = milk.nodes.find((n) => n.type === "inlet")!;

  // 共用供水网：去掉奶路的独立补水口，把咖啡泵出口的来水经流量计和分配三通送到两座锅炉。
  const removeNode = (node: DiagramNode) => {
    const portIds = new Set(node.ports.map((p) => p.id));
    const idx = all.findIndex((n) => n.id === node.id);
    if (idx >= 0) all.splice(idx, 1);
    for (let i = pipes.length - 1; i >= 0; i--) {
      if ((pipes[i].fromPortId && portIds.has(pipes[i].fromPortId!)) || (pipes[i].toPortId && portIds.has(pipes[i].toPortId!))) pipes.splice(i, 1);
    }
  };
  removeNode(steamInlet);
  removeDirectPipe(pipes, coffeeCheck, "right", coffeeBoiler, "bottom");

  const meter = makeNode("flowMeter", 360, 390, L("供水流量计", "Supply flow meter"));
  const supplyTee = makeNode("tee", 450, 390, L("双锅炉分配三通", "Dual-boiler supply tee"));
  all.push(meter, supplyTee);
  pipes.push(connect(coffeeCheck, "right", meter, "left", "coldWater", L("泵出口计量", "Pump out to meter")));
  pipes.push(connect(meter, "right", supplyTee, "left", "coldWater", L("计量后供水", "Metered supply")));
  pipes.push(connect(supplyTee, "right", coffeeBoiler, "bottom", "coldWater", L("咖啡锅炉补水", "Coffee boiler feed")));
  const steamFeed = connect(supplyTee, "bottom", fillCheck, "left", "coldWater", L("蒸汽锅炉补水", "Steam boiler feed"));
  // 预填走线：从供水三通底部沿最左侧通道直下，避开奶泵/选择阀与安全排废横管。
  const steamLaneX = fillCheck.x - 450;
  steamFeed.points = [
    { x: steamLaneX, y: supplyTee.y + supplyTee.height },
    { x: steamLaneX, y: fillCheck.y + fillCheck.height / 2 },
  ];
  pipes.push(steamFeed);

  // 咖啡锅炉泄压排废移到右侧，让共用供水左侧的蒸汽补水通道保持干净。
  const coffeeReliefDrain = all.find((n) => n.type === "outlet" && /relief|泄压/i.test(n.label) && !/safety|安全/i.test(n.label));
  if (coffeeReliefDrain) {
    coffeeReliefDrain.x = 500;
    coffeeReliefDrain.y = 500;
    for (const p of pipes) {
      if (p.fromPortId && coffeeReliefDrain.ports.some((port) => port.id === p.fromPortId)) p.points = [];
      if (p.toPortId && coffeeReliefDrain.ports.some((port) => port.id === p.toPortId)) p.points = [];
    }
  }

  // 排废总网：咖啡排废 + 奶路排废 + 加热排废汇入总排废阀，避免三路直接散落。
  const drainOutlets = all.filter((n) => n.type === "outlet"
    && /(咖啡|牛奶|加热|coffee|milk|heat)/i.test(n.label)
    && !/(清洗|clean|安全|safety|relief)/i.test(n.label));
  const drainSources: Array<{ node: DiagramNode; port: PortPosition; label: string }> = [];
  for (const outlet of drainOutlets) {
    const outletPortIds = new Set(outlet.ports.map((p) => p.id));
    const outletPipe = pipes.find((p) => (p.fromPortId && outletPortIds.has(p.fromPortId)) || (p.toPortId && outletPortIds.has(p.toPortId)));
    if (!outletPipe) continue;
    const outletPortId = outletPipe.fromPortId && outletPortIds.has(outletPipe.fromPortId) ? outletPipe.fromPortId : outletPipe.toPortId;
    const sourcePortId = outletPipe.fromPortId === outletPortId ? outletPipe.toPortId : outletPipe.fromPortId;
    const sourceRef = sourcePortId ? all.flatMap((n) => n.ports.map((p) => ({ n, p }))).find((x) => x.p.id === sourcePortId) : undefined;
    if (!sourceRef) continue;
    removeNode(outlet);
    drainSources.push({ node: sourceRef.n, port: sourceRef.p.position, label: outlet.label });
  }
  let drainValve: DiagramNode | undefined;
  if (drainSources.length >= 2) {
    const header = makeNode("cross", 1000, 760, L("排废汇流", "Drain header"));
    drainValve = makeNode("solenoid2", 1120, 760, L("排废总阀", "Main drain valve"));
    const drainOut = makeNode("outlet", 1240, 760, L("总排废口", "Main drain outlet"));
    markSecondary([header, drainValve, drainOut]);
    all.push(header, drainValve, drainOut);
    const ports: PortPosition[] = ["left", "top", "bottom"];
    drainSources.slice(0, 3).forEach((source, i) => {
      const drainPipe = connect(source.node, source.port, header, ports[i], "wasteLiquid", L(`${source.label}汇流`, `${source.label} to header`));
      // 预填走线：咖啡排废走右侧直下，奶排废走底部汇流，避免三路在排废总网处交叉。
      if (/咖啡|coffee/i.test(source.label)) drainPipe.points = [{ x: 639, y: 380 }, { x: 980, y: 380 }, { x: 980, y: 840 }, { x: 1000, y: 840 }];
      if (/牛奶|milk/i.test(source.label)) drainPipe.points = [{ x: 880, y: 704 }, { x: 880, y: 1160 }, { x: 1032, y: 1160 }];
      if (/加热|heat/i.test(source.label)) drainPipe.points = [{ x: 799, y: 1200 }, { x: 1032, y: 1200 }];
      pipes.push(drainPipe);
    });
    pipes.push(connect(header, "right", drainValve, "left", "wasteLiquid", L("排废总阀前", "Before main drain valve")));
    pipes.push(connect(drainValve, "right", drainOut, "left", "wasteLiquid", L("总排废", "Main drain")));
  }

  applyIdleStates(all);
  return {
    nodes: all,
    pipes,
    zones: [
      { id: "supply", labelZh: "共用供水", labelEn: "Shared supply", x: 30, y: 140, w: 560, h: 300, color: "#2f7fd6" },
      { id: "coffee", labelZh: "咖啡主链", labelEn: "Coffee chain", x: 560, y: 30, w: 720, h: 400, color: "#b9770e" },
      { id: "steam-milk", labelZh: "蒸汽 / 奶路", labelEn: "Steam / milk", x: 290, y: 520, w: 720, h: 990, color: "#7a5cc4" },
      { id: "drain", labelZh: "排废总网", labelEn: "Drain header", x: 940, y: 700, w: 400, h: 220, color: "#4f7d63" },
    ],
    conditions: [
      makeCondition(L("待机", "Idle"), all),
      makeCondition(L("萃取", "Brew"), all, { [coffeePump.id]: { pumpOn: true }, [brewValve.id]: { valvePath: "A" } }),
      makeCondition(L("奶路", "Milk line"), all, {
        [milkPump.id]: { pumpOn: true },
        ...(selector ? { [selector.id]: { valvePath: "A" } } : {}),
        [milkValve.id]: { valvePath: "A" },
      }),
      makeCondition(L("热牛奶", "Hot milk"), all, {
        [coffeePump.id]: { pumpOn: true },
        [milkPump.id]: { pumpOn: true },
        ...(selector ? { [selector.id]: { valvePath: "A" } } : {}),
        ...(heatValve ? { [heatValve.id]: { valvePath: "A" } } : {}),
        [fillValve.id]: { valveState: "open" },
        [milkValve.id]: { valvePath: "A" },
      }),
      makeCondition(L("蒸汽吹扫", "Steam purge"), all, {
        [coffeePump.id]: { pumpOn: true },
        ...(heatValve ? { [heatValve.id]: { valvePath: "A" } } : {}),
        [fillValve.id]: { valveState: "open" },
        [milkValve.id]: { valvePath: "B" },
        ...(drainValve ? { [drainValve.id]: { valveState: "open" } } : {}),
      }),
      makeCondition(L("排废", "Drain"), all, {
        [coffeePump.id]: { pumpOn: true },
        [brewValve.id]: { valvePath: "B" },
        ...(drainValve ? { [drainValve.id]: { valveState: "open" } } : {}),
      }),
      makeCondition(L("清洗", "Cleaning"), all, {
        [milkPump.id]: { pumpOn: true },
        ...(selector ? { [selector.id]: { valvePath: "A" } } : {}),
        [cleaningValve.id]: { valveState: "open" },
        [milkValve.id]: { valvePath: "B" },
        ...(drainValve ? { [drainValve.id]: { valveState: "open" } } : {}),
      }),
    ],
  };
}

function buildDualBoiler(): SmartBuildResult {
  const full = buildFull({});
  const nodes = full.nodes;
  const pipes = full.pipes;
  const inlet = nodes.find((n) => n.type === "inlet")!;
  const pump = nodes.find((n) => n.type === "pump")!;
  inlet.x = 60;
  removeDirectPipe(pipes, inlet, "right", pump, "left");
  const mainValve = makeNode("solenoid2", 140, 240, L("进水总阀", "Main water valve"));
  mainValve.valveState = "closed";
  nodes.push(mainValve);
  pipes.push(connect(inlet, "right", mainValve, "left", "coldWater", L("总阀前进水", "Inlet before main valve")));
  pipes.push(connect(mainValve, "right", pump, "left", "coldWater", L("总阀后进水", "Feed after main valve")));
  const conditions = (full.conditions ?? []).map((condition) => ({
    ...condition,
    state: {
      ...condition.state,
      [mainValve.id]: { valveState: /待机|idle/i.test(condition.name) ? ("closed" as const) : ("open" as const) },
    },
  }));
  return { nodes, pipes, conditions, zones: full.zones };
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
    tagsZh: ["基础", "单锅炉"],
    tagsEn: ["Basic", "Single boiler"],
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
    id: "dual-boiler",
    titleZh: "双锅炉真机骨架",
    titleEn: "Dual-boiler machine skeleton",
    descZh: "BCMTS-lite：总进水阀 → 泵 → 流量计 → 分配三通 → 咖啡/蒸汽双锅炉 + 奶路 + 排废总阀",
    descEn: "BCMTS-lite: main valve → pump → flow meter → supply tee → coffee/steam boilers + milk line + main drain valve",
    keywords: ["真机", "骨架", "bcmts", "双锅炉骨架", "machine skeleton"],
    tagsZh: ["真机骨架", "共用供水", "排废总网"],
    tagsEn: ["Machine skeleton", "Shared supply", "Drain header"],
    options: [],
    build: buildDualBoiler,
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

/**
 * 模板间距扩展：参考真机图纸的疏密，只放大节点坐标与管路折点，不放大节点尺寸。
 * 这样元件之间的“留白”变大，但拓扑、端口、工程语义完全不变。
 */
const TEMPLATE_SPACING = 1.65;

function expandTemplateLayout(result: SmartBuildResult): SmartBuildResult {
  const xs = result.nodes.map((n) => n.x);
  const ys = result.nodes.map((n) => n.y);
  const minX = xs.length ? Math.min(...xs) : 0;
  const minY = ys.length ? Math.min(...ys) : 0;
  const sx = (x: number) => minX + (x - minX) * TEMPLATE_SPACING;
  const sy = (y: number) => minY + (y - minY) * TEMPLATE_SPACING;
  for (const n of result.nodes) {
    n.x = sx(n.x);
    n.y = sy(n.y);
  }
  for (const p of result.pipes) {
    p.points = p.points.map((pt) => ({ x: sx(pt.x), y: sy(pt.y) }));
  }
  if (result.zones) {
    result.zones = result.zones.map((z) => ({
      ...z,
      x: sx(z.x),
      y: sy(z.y),
      w: z.w * TEMPLATE_SPACING,
      h: z.h * TEMPLATE_SPACING,
    }));
  }
  return result;
}

export function buildSmartTemplate(template: SmartTemplate, options: Record<string, SmartOptionValue>): SmartBuildResult {
  const merged: Record<string, SmartOptionValue> = {};
  for (const opt of template.options) merged[opt.key] = options[opt.key] ?? opt.default;
  return expandTemplateLayout(template.build(merged));
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

