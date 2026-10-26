import type { DiagramNode, FluidType, Pipe, SmartZone, WorkCondition } from "../types";

export type SmartOptionValue = boolean | string | number;

export interface SmartOption {
  key: string;
  labelZh: string;
  labelEn: string;
  kind: "boolean" | "select";
  default: SmartOptionValue;
  choices?: Array<{ value: string; labelZh: string; labelEn: string }>;
}

export interface SmartBuildResult {
  nodes: DiagramNode[];
  pipes: Pipe[];
  /** 生成图自带的推荐工况（待机/萃取/奶路/清洗等） */
  conditions?: WorkCondition[];
  /** 画布分区提示（供水/咖啡/奶路/排废） */
  zones?: SmartZone[];
  /** 供引导连接使用的入口端口（块级） */
  inletPortId?: string;
  /** 供后续连接使用的出口端口 */
  outletPortId?: string;
}

export interface SmartTemplate {
  id: string;
  titleZh: string;
  titleEn: string;
  descZh: string;
  descEn: string;
  keywords: string[];
  tagsZh: string[];
  tagsEn: string[];
  options: SmartOption[];
  build: (options: Record<string, SmartOptionValue>) => SmartBuildResult;
}

export interface SmartBlock {
  id: string;
  titleZh: string;
  titleEn: string;
  descZh: string;
  descEn: string;
  keywords: string[];
  /** 需要外部接点时，块的入口端口在 build 结果中返回 */
  build: () => SmartBuildResult;
  /** 与接点连接时使用的介质 */
  medium: FluidType;
}
