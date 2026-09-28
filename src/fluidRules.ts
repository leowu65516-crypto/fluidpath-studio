/**
 * 液路介质物理常识规则引擎。
 *
 * 目标：当图中的管路介质明显违反设备物理常识时（如「热水锅炉之前」出现了
 * 蒸汽/牛奶/热水），给出可定位、可逐一修复的提示，而不是静默地把整条
 * 直通链的介质一起改掉。
 *
 * 规则只约束「介质确定性」设备（会改变介质或对介质有明确要求的设备），
 * 对直通元件（阀/三通/接头/过滤器/换热器/仪表等）与标签承载语义的
 * inlet/outlet 不做约束，避免误报。
 */

import type { Diagram, DiagramNode, FluidType, Pipe } from "./types";
import type { Lang } from "./i18n";
import { FLUID_PRESETS } from "./types";

/** 介质英文名（fluidLabel 双语用） */
const FLUID_LABEL_EN: Record<string, string> = {
  coldWater: "Cold water",
  hotWater: "Hot water",
  steam: "Steam",
  coffee: "Coffee",
  milk: "Milk",
  coldMilk: "Cold milk",
  hotMilk: "Hot milk",
  coldMilkFoam: "Cold milk foam",
  hotMilkFoam: "Hot milk foam",
  wasteLiquid: "Waste",
  cleanWaste: "Cleaning waste",
  air: "Air",
  custom: "Custom",
};

/** 介质集合 */
const WATER: FluidType[] = ["coldWater", "hotWater"];
const MILK: FluidType[] = ["milk", "coldMilk", "hotMilk", "coldMilkFoam", "hotMilkFoam"];

interface DeviceFluidRule {
  type: string;
  /** 流入该设备（管路 toPortId 连设备端口）允许的介质 */
  in?: FluidType[];
  /** 流出该设备（管路 fromPortId 连设备端口）允许的介质 */
  out?: FluidType[];
  /** 修复时优先建议的流入介质 */
  inPreferred?: FluidType;
  /** 修复时优先建议的流出介质 */
  outPreferred?: FluidType;
}

const RULES: DeviceFluidRule[] = [
  // 热水锅炉：冷水从底部进、热水从顶部出；之前不可能是蒸汽/牛奶/热水
  { type: "hotWaterBoiler", in: ["coldWater"], inPreferred: "coldWater", out: ["hotWater"], outPreferred: "hotWater" },
  // 蒸汽锅炉：冷水/热水补给进、蒸汽出
  { type: "steamBoiler", in: ["coldWater", "hotWater"], inPreferred: "coldWater", out: ["steam"], outPreferred: "steam" },
  // 出口类
  { type: "coffeeOutlet", in: ["coffee"], inPreferred: "coffee" },
  { type: "groupHead", in: ["hotWater"], inPreferred: "hotWater", out: ["coffee"], outPreferred: "coffee" },
  { type: "brewChamber", in: ["hotWater"], inPreferred: "hotWater", out: ["coffee"], outPreferred: "coffee" },
  { type: "milkOutlet", in: MILK, inPreferred: "hotMilk" },
  { type: "hotWaterOutlet", in: ["hotWater"], inPreferred: "hotWater" },
  { type: "hotWaterWand", in: ["hotWater"], inPreferred: "hotWater" },
  { type: "steamWand", in: ["steam"], inPreferred: "steam" },
  // 泵：水泵只走水，奶泵只走奶
  { type: "pump", in: WATER, inPreferred: "coldWater", out: WATER, outPreferred: "coldWater" },
  { type: "milkPump", in: MILK, inPreferred: "milk", out: MILK, outPreferred: "milk" },
  { type: "airPump", in: ["air"], inPreferred: "air", out: ["air"], outPreferred: "air" },
  // OPV 泄压阀：旁通泵出的水（未加热）
  { type: "opv", in: WATER, inPreferred: "coldWater", out: WATER, outPreferred: "coldWater" },
];

function ruleFor(type: string): DeviceFluidRule | undefined {
  return RULES.find((r) => r.type === type);
}

/** 介质名称（lang=en 时返回英文，默认中文） */
export function fluidLabel(ft: FluidType | undefined | null, lang: Lang = "zh"): string {
  if (!ft) return "";
  if (lang === "en") return FLUID_LABEL_EN[ft] ?? ft;
  return FLUID_PRESETS.find((f) => f.key === ft)?.label ?? ft;
}

/** 介质默认颜色 */
export function fluidColor(ft: FluidType): string {
  return FLUID_PRESETS.find((f) => f.key === ft)?.color ?? "#2f7fd6";
}

export interface FluidIssue {
  pipeId: string;
  /** 冲突侧：in=流入设备 / out=流出设备 */
  side: "in" | "out";
  nodeId: string;
  nodeLabel: string;
  nodeType: string;
  actual: FluidType;
  allowed: FluidType[];
  preferred: FluidType;
  message: string;
}

function makeIssue(
  pipe: Pipe,
  side: "in" | "out",
  node: DiagramNode,
  allowed: FluidType[],
  preferred: FluidType | undefined,
  lang: Lang = "zh"
): FluidIssue {
  const expect = preferred ?? allowed[0];
  const verb = side === "in"
    ? (lang === "zh" ? "进入" : "entering")
    : (lang === "zh" ? "流出" : "leaving");
  const allowedStr = allowed.map((f) => fluidLabel(f, lang)).join(" / ");
  return {
    pipeId: pipe.id,
    side,
    nodeId: node.id,
    nodeLabel: node.label || node.type,
    nodeType: node.type,
    actual: pipe.fluidType!,
    allowed,
    preferred: expect,
    message: lang === "zh"
      ? `「${node.label || node.type}」${verb}的介质不应是「${fluidLabel(pipe.fluidType)}」（应为「${allowedStr}」）`
      : `Fluid ${verb} "${node.label || node.type}" should not be "${fluidLabel(pipe.fluidType, "en")}" (expected "${allowedStr}")`,
  };
}

/** 检查单条管路的介质冲突（两端各查一次） */
export function checkPipeFluid(pipe: Pipe, nodes: DiagramNode[], lang: Lang = "zh"): FluidIssue[] {
  const issues: FluidIssue[] = [];
  if (!pipe.fluidType || pipe.fluidType === "custom" || pipe.fluidType === "wasteLiquid" || pipe.fluidType === "cleanWaste") return issues;

  const portToNode = new Map<string, DiagramNode>();
  for (const n of nodes) for (const p of n.ports) portToNode.set(p.id, n);

  // 流入设备端：管路 toPortId 连设备端口
  const toNode = pipe.toPortId ? portToNode.get(pipe.toPortId) : undefined;
  if (toNode) {
    const rule = ruleFor(toNode.type);
    if (rule?.in && !rule.in.includes(pipe.fluidType)) {
      issues.push(makeIssue(pipe, "in", toNode, rule.in, rule.inPreferred, lang));
    }
  }

  // 流出设备端：管路 fromPortId 连设备端口
  const fromNode = pipe.fromPortId ? portToNode.get(pipe.fromPortId) : undefined;
  if (fromNode) {
    const rule = ruleFor(fromNode.type);
    if (rule?.out && !rule.out.includes(pipe.fluidType)) {
      issues.push(makeIssue(pipe, "out", fromNode, rule.out, rule.outPreferred, lang));
    }
  }

  return issues;
}

/** 检查整张图的介质冲突，返回按管路分组后的映射 */
export function checkDiagramFluid(diagram: Diagram, lang: Lang = "zh"): Map<string, FluidIssue[]> {
  const map = new Map<string, FluidIssue[]>();
  for (const p of diagram.pipes) {
    const issues = checkPipeFluid(p, diagram.nodes, lang);
    if (issues.length) map.set(p.id, issues);
  }
  return map;
}

/** 返回某条管路冲突里「最优建议介质」（首个冲突的首选） */
export function suggestedFix(issues: FluidIssue[]): FluidType | null {
  return issues[0]?.preferred ?? null;
}

export type FluidAssessmentStatus = "DECLARED" | "QUALITATIVE_MIXED" | "UNKNOWN";

export interface FluidAssessment {
  pipeId: string;
  status: FluidAssessmentStatus;
  sources: FluidType[];
  sourceLabels: string[];
  explanation: string;
}

/**
 * Conservative explanation for a pipe's medium. It deliberately reports only
 * declared sources and qualitative mixing; temperature, pressure and ratios
 * remain unknown until the drawing provides the required measurements.
 */
export function explainPipeFluid(pipe: Pipe, diagram: Diagram, lang: Lang = "zh"): FluidAssessment {
  const nodeForPort = (portId?: string) => portId ? diagram.nodes.find((n) => n.ports.some((p) => p.id === portId)) : undefined;
  const upstreamNode = pipe.direction === "reverse" ? nodeForPort(pipe.toPortId) : nodeForPort(pipe.fromPortId);
  const sourcePipes = diagram.pipes.filter((candidate) => {
    if (candidate.id === pipe.id || !upstreamNode) return false;
    return upstreamNode.ports.some((port) => port.id === candidate.fromPortId || port.id === candidate.toPortId);
  });
  const sources = [...new Set([pipe.declaredMedium ?? pipe.fluidType, ...sourcePipes.map((p) => p.declaredMedium ?? p.fluidType)].filter((v): v is FluidType => !!v && v !== "custom"))];
  const sourceLabels = [pipe.label || pipe.id, ...sourcePipes.map((p) => p.label || p.id)];
  if (!sources.length) {
    return { pipeId: pipe.id, status: "UNKNOWN", sources: [], sourceLabels, explanation: lang === "zh" ? "没有可解析的介质声明；当前结果未知。" : "No resolvable medium declaration; result is unknown." };
  }
  if (sources.length > 1) {
    const names = sources.map((source) => fluidLabel(source, lang)).join(lang === "zh" ? " + " : " + ");
    return { pipeId: pipe.id, status: "QUALITATIVE_MIXED", sources, sourceLabels, explanation: lang === "zh" ? `当前有效输入：${names}；输出介质定性为多来源混合，温度/比例未知。` : `Effective inputs: ${names}; qualitative multi-source mixture, temperature and ratio unknown.` };
  }
  return { pipeId: pipe.id, status: "DECLARED", sources, sourceLabels, explanation: lang === "zh" ? `来源：${sourceLabels[0]}；声明介质：${fluidLabel(sources[0], lang)}；未推导温度、压力或比例。` : `Source: ${sourceLabels[0]}; declared medium: ${fluidLabel(sources[0], lang)}; temperature, pressure and ratio are not inferred.` };
}

export function explainDiagramFluid(diagram: Diagram, lang: Lang = "zh"): FluidAssessment[] {
  return diagram.pipes.map((pipe) => explainPipeFluid(pipe, diagram, lang));
}
