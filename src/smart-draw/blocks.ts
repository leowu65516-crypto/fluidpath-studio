import type { SmartBlock } from "./types";
import { applyIdleStates, connect, makeNode } from "./builders";

const isEn = () => typeof document !== "undefined" && document.documentElement.lang === "en";
const L = (zh: string, en: string) => (isEn() ? en : zh);

export const SMART_BLOCKS: SmartBlock[] = [
  {
    id: "steam-wand",
    titleZh: "蒸汽杆",
    titleEn: "Steam wand",
    descZh: "蒸汽阀 + 蒸汽杆；接现有蒸汽锅炉或蒸汽支路",
    descEn: "Steam valve + wand; connect to an existing steam boiler or branch",
    keywords: ["蒸汽", "蒸汽杆", "steam", "wand"],
    medium: "steam",
    build: () => {
      const valve = makeNode("solenoid2", 0, 0, L("蒸汽阀", "Steam valve"));
      const wand = makeNode("steamWand", 200, 0, L("蒸汽杆", "Steam wand"));
      const nodes = [valve, wand];
      applyIdleStates(nodes);
      return {
        nodes,
        pipes: [connect(valve, "right", wand, "top", "steam", L("蒸汽", "Steam"))],
        inletPortId: valve.ports.find((p) => p.direction === "in")?.id,
      };
    },
  },
  {
    id: "cleaning-bypass",
    titleZh: "清洗旁通",
    titleEn: "Cleaning bypass",
    descZh: "清洗阀 + 排废口；从热水/水路接一条清洗支路",
    descEn: "Cleaning valve + drain; branch from a hot-water/water line",
    keywords: ["清洗", "旁通", "cleaning", "bypass"],
    medium: "coldWater",
    build: () => {
      const valve = makeNode("solenoid2", 0, 0, L("清洗阀", "Cleaning valve"));
      const drain = makeNode("outlet", 200, 0, L("清洗排废", "Cleaning drain"));
      const nodes = [valve, drain];
      applyIdleStates(nodes);
      return {
        nodes,
        pipes: [connect(valve, "right", drain, "left", "coldWater", L("清洗水", "Cleaning water"))],
        inletPortId: valve.ports.find((p) => p.direction === "in")?.id,
      };
    },
  },
  {
    id: "drain",
    titleZh: "排废支路",
    titleEn: "Drain branch",
    descZh: "排废阀 + 出口；接现有管路或三通",
    descEn: "Drain valve + outlet; connect to an existing line or tee",
    keywords: ["排废", "排水", "drain", "waste"],
    medium: "wasteLiquid",
    build: () => {
      const valve = makeNode("solenoid2", 0, 0, L("排废阀", "Drain valve"));
      const drain = makeNode("outlet", 200, 0, L("排废口", "Drain outlet"));
      const nodes = [valve, drain];
      applyIdleStates(nodes);
      return {
        nodes,
        pipes: [connect(valve, "right", drain, "left", "wasteLiquid", L("排废", "Drain"))],
        inletPortId: valve.ports.find((p) => p.direction === "in")?.id,
      };
    },
  },
  {
    id: "pressure-gauge",
    titleZh: "压力表支路",
    titleEn: "Pressure gauge tap",
    descZh: "十字四通 + 压力表；接在现有管路上测压",
    descEn: "Cross + pressure gauge; tap into an existing line",
    keywords: ["压力表", "压力", "pressure", "gauge"],
    medium: "coldWater",
    build: () => {
      const cross = makeNode("cross", 0, 0, "");
      const gauge = makeNode("pressureGauge", 0, -110, L("压力表", "Pressure gauge"));
      const nodes = [cross, gauge];
      applyIdleStates(nodes);
      return { nodes, pipes: [connect(cross, "top", gauge, "bottom", "coldWater")], inletPortId: cross.ports.find((p) => p.position === "left")?.id, outletPortId: cross.ports.find((p) => p.position === "right")?.id };
    },
  },
  {
    id: "check-valve",
    titleZh: "单向阀",
    titleEn: "Check valve",
    descZh: "串联单向阀；按箭头方向导通",
    descEn: "Inline check valve; conducts in the arrow direction",
    keywords: ["单向阀", "止回", "check", "check valve"],
    medium: "coldWater",
    build: () => {
      const node = makeNode("checkValve", 0, 0, L("单向阀", "Check valve"));
      return { nodes: [node], pipes: [], inletPortId: node.ports.find((p) => p.direction === "in")?.id, outletPortId: node.ports.find((p) => p.direction === "out")?.id };
    },
  },
  {
    id: "tee",
    titleZh: "三通接头",
    titleEn: "Tee fitting",
    descZh: "三通分支；接入后可再连两个出口",
    descEn: "Tee branch; connect one inlet and two outlets",
    keywords: ["三通", "tee", "分支"],
    medium: "coldWater",
    build: () => {
      const node = makeNode("tee", 0, 0, L("三通接头", "Tee"));
      return { nodes: [node], pipes: [], inletPortId: node.ports.find((p) => p.position === "left")?.id, outletPortId: node.ports.find((p) => p.position === "right")?.id };
    },
  },
  {
    id: "boiler",
    titleZh: "热水锅炉",
    titleEn: "Hot-water boiler",
    descZh: "单台热水/咖啡锅炉；下进上出",
    descEn: "Single hot-water/coffee boiler; bottom in, top out",
    keywords: ["锅炉", "boiler", "热水锅炉"],
    medium: "hotWater",
    build: () => {
      const node = makeNode("hotWaterBoiler", 0, 0, L("热水锅炉", "Hot-water boiler"));
      return { nodes: [node], pipes: [], inletPortId: node.ports.find((p) => p.direction === "in")?.id, outletPortId: node.ports.find((p) => p.direction === "out")?.id };
    },
  },
  {
    id: "pump",
    titleZh: "水泵",
    titleEn: "Water pump",
    descZh: "串联水泵；默认停机",
    descEn: "Inline water pump; stopped by default",
    keywords: ["水泵", "泵", "pump"],
    medium: "coldWater",
    build: () => {
      const node = makeNode("pump", 0, 0, L("水泵", "Water pump"));
      applyIdleStates([node]);
      return { nodes: [node], pipes: [], inletPortId: node.ports.find((p) => p.direction === "in")?.id, outletPortId: node.ports.find((p) => p.direction === "out")?.id };
    },
  },
  {
    id: "milk-line",
    titleZh: "奶路子系统",
    titleEn: "Milk subsystem",
    descZh: "奶罐 → 奶泵 → 牛奶出口；独立子系统，放到右侧",
    descEn: "Tank → milk pump → milk outlet; standalone subsystem placed to the right",
    keywords: ["奶", "牛奶", "milk", "奶路"],
    medium: "coldMilk",
    build: () => {
      const tank = makeNode("tank", 0, 0, L("奶罐", "Milk tank"));
      const pump = makeNode("milkPump", 220, 20, L("奶泵", "Milk pump"));
      const outlet = makeNode("milkOutlet", 440, 0, L("牛奶出口", "Milk outlet"));
      const nodes = [tank, pump, outlet];
      applyIdleStates(nodes);
      return {
        nodes,
        pipes: [
          connect(tank, "top", pump, "left", "coldMilk", L("奶罐出液", "Tank out")),
          connect(pump, "right", outlet, "top", "coldMilk", L("奶路", "Milk line")),
        ],
      };
    },
  },
];

export function smartBlockById(id: string): SmartBlock | undefined {
  return SMART_BLOCKS.find((b) => b.id === id);
}
