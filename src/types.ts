export type PortPosition = "top" | "right" | "bottom" | "left";
export type PortDirection = "in" | "out" | "bidirectional";

export interface Port {
  id: string;
  nodeId: string;
  position: PortPosition;
  offset?: number; // 0..1 along the side, default 0.5
  direction?: PortDirection;
}

export type NodeType =
  | "tank"
  | "hotWaterBoiler"
  | "steamBoiler"
  | "boiler" // 旧版兼容，等同热水锅炉
  | "pump"
  | "milkPump"
  | "airPump" // 空气泵（气路动力）
  | "valve"
  | "checkValve"
  | "solenoid2"
  | "solenoid3"
  | "pulseAirValve" // 脉冲空气电磁阀
  | "safetyValve"
  | "opv" // OPV 过压保护阀（泄压/限压）
  | "pressureRegulator" // 节流阀 / 减压阀（pressure regulator）
  | "coupling"
  | "metalCoupling"
  | "tee"
  | "teeY"
  | "teeF" // F 型三通
  | "cross" // 十字四通
  | "elbow"
  | "heatExchanger"
  | "filter"
  | "metalFilter" // 矩形金属滤网（过滤大颗粒）
  | "powderMixer" // 粉料搅拌器
  | "inlet"
  | "outlet"
  | "connector"
  | "hotWaterWand"
  | "steamWand"
  | "coffeeOutlet"
  | "groupHead" // 冲煮头（Group Head）
  | "brewChamber" // 冲泡缸（密闭腔 + 上下活塞萃取）
  | "milkOutlet"
  | "hotWaterOutlet"
  | "flowMeter"
  | "pressureGauge"
  | "pressureSensor"
  | "pressureSwitch" // 进水压力开关
  | "pressureTank" // 外置进水压力罐
  | "syrupBottle" // 糖浆瓶
  | "ntcProbe"
  | "sensor"
  | "shape"
  | "label"
  | "arrow"
  | "annotation"
  | "image";

/** 节点变体：自定义图形（rect/ellipse/diamond）或咖啡出口（single/double 出液口） */
export type ShapeVariant = "rect" | "ellipse" | "diamond" | "triangle" | "single" | "double";

export interface DiagramNode {
  id: string;
  type: NodeType;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number; // degrees
  fill: string;
  stroke: string;
  ports: Port[];
  /** 自定义图形的形状（type === "shape" 时有效） */
  variant?: ShapeVariant;
  /** 自定义图形内文字大小 */
  fontSize?: number;
  /** 咖啡出口：是否显示出液（咖啡滴落）动画 */
  dispensing?: boolean;
  /** 组 ID：同组节点选中时联动、一起移动 */
  groupId?: string;
  /** 置灰（讲解聚焦用）：节点淡化，相连管路停止流动 */
  disabled?: boolean;
  /** 两通电磁阀状态：开 / 关 */
  valveState?: "open" | "closed";
  /** 三通电磁阀导通路径：A=右侧出口 / B=底部出口 / off=关闭 */
  valvePath?: "A" | "B" | "off";
  /** 电磁阀：是否在画布上直接显示开关状态并可点击切换 */
  showStateOnDiagram?: boolean;
  /** 水泵/奶泵：是否运行（关闭时前后液路停流） */
  pumpOn?: boolean;
  /** 故障模拟（教学用）：泵卡死 / 阀卡开 / 阀卡关 */
  fault?: NodeFault;
  /** 标注节点：引线指向的目标世界坐标 */
  pointerTarget?: Pt;
  /** 图片节点：base64 数据 URL */
  imageData?: string;
  /** 图层 ID（未分配时为空） */
  layerId?: string;
}

/** 节点故障（教学模拟用） */
export type NodeFault = "pumpStuck" | "valveStuckOpen" | "valveStuckClosed";

export type FlowDirection = "forward" | "reverse";
export type ParticleDensity = "low" | "medium" | "high";

export type FluidType = "steam" | "coldWater" | "hotWater" | "coffee" | "air" | "milk" | "coldMilk" | "hotMilk" | "coldMilkFoam" | "hotMilkFoam" | "wasteLiquid" | "cleanWaste" | "custom";
export type PipeMaterial = "blackPTFE" | "whitePTFE" | "silicone" | "reinforced" | "custom";
/** 仅用于讲解画面的人工覆盖，不参与工程液路判定。 */
export type TeachingFlowOverride = "flow" | "stop";

export interface Pipe {
  id: string;
  label: string;
  /** 起点所连端口；为空表示起点为游离端点（见 fromPoint） */
  fromPortId?: string;
  /** 终点所连端口；为空表示终点为游离端点（见 toPoint） */
  toPortId?: string;
  /** 起点游离时的世界坐标（未连任何端口） */
  fromPoint?: { x: number; y: number };
  /** 终点游离时的世界坐标（未连任何端口） */
  toPoint?: { x: number; y: number };
  /** 手动调整后的中间路径点（世界坐标）。为空表示自动走线 */
  points: Array<{ x: number; y: number }>;
  nominalDiameter: string; // e.g. DN25
  visualDiameter: number; // px
  wallColor: string;
  fluidColor: string;
  fluidOpacity: number; // 0..1
  direction: FlowDirection;
  flowSpeed: number; // 0.1 .. 3.0 m/s
  particleDensity: ParticleDensity;
  animated: boolean;
  showArrow: boolean;
  /** 介质类型（决定默认液体颜色） */
  fluidType?: FluidType;
  /** 管材（决定默认管壁颜色/透明度） */
  material?: PipeMaterial;
  /** 管壁透明度（透明硅胶管 < 1） */
  wallOpacity?: number;
  /** 走线方式：直角折线（默认）/ 平滑曲线。曲线模式下折点自由移动 */
  routing?: "orthogonal" | "curved";
  /** 直角折线模式的拐角圆角半径（px），0 为直角 */
  cornerRadius?: number;
  /** 置灰（讲解聚焦用）：管路淡化并停止流动，其他管路保持正常 */
  disabled?: boolean;
  /** 故障模拟（教学用）：管路堵塞 */
  fault?: "pipeBlocked";
  /** 讲解画面覆盖：只改变动画显示，不改变工程有效状态或工程导出。 */
  teachingOverride?: TeachingFlowOverride;
  /** @deprecated 旧版教学覆盖字段；加载时自动迁移为 teachingOverride。 */
  forceFlow?: boolean;
  /** @deprecated 旧版教学覆盖字段；加载时自动迁移为 teachingOverride。 */
  forceStop?: boolean;
  /** 管路中段标注文字（如直径/介质/编号） */
  annotation?: string;
  /** 相对流量手填 override（0–100；未设置时由量感层自动计算） */
  relativeFlow?: number;
}

export interface FluidPreset {
  key: FluidType;
  label: string;
  color: string;
}

export const FLUID_PRESETS: FluidPreset[] = [
  { key: "coldWater", label: "常温水", color: "#2f7fd6" },
  { key: "hotWater", label: "热水", color: "#e2542f" },
  { key: "steam", label: "蒸汽", color: "#ef8aa0" },
  { key: "coffee", label: "咖啡", color: "#7b4a2d" },
  { key: "milk", label: "牛奶", color: "#f3ead6" },
  { key: "coldMilk", label: "冷牛奶", color: "#e8f0f8" },
  { key: "hotMilk", label: "热牛奶", color: "#f5e6d0" },
  { key: "coldMilkFoam", label: "冷奶沫", color: "#f0f4f8" },
  { key: "hotMilkFoam", label: "热奶沫", color: "#f8efe0" },
  { key: "wasteLiquid", label: "废液", color: "#8a9ba8" },
  { key: "cleanWaste", label: "清洗废液", color: "#7d8a5a" },
  { key: "air", label: "空气", color: "#93c2c9" },
  { key: "custom", label: "其他/自定义", color: "#2f7fd6" }
];

export interface MaterialPreset {
  key: PipeMaterial;
  label: string;
  wallColor: string;
  wallOpacity: number;
}

export const MATERIAL_PRESETS: MaterialPreset[] = [
  { key: "blackPTFE", label: "黑色铁氟龙", wallColor: "#2b2e33", wallOpacity: 1 },
  { key: "whitePTFE", label: "白色铁氟龙", wallColor: "#e9ebee", wallOpacity: 1 },
  { key: "silicone", label: "透明硅胶管", wallColor: "#cfdeea", wallOpacity: 0.5 },
  { key: "reinforced", label: "白色加强管", wallColor: "#f4f6f8", wallOpacity: 1 },
  { key: "custom", label: "自定义", wallColor: "#5b6b7d", wallOpacity: 1 }
];

export interface DiagramSettings {
  showGrid: boolean;
  background: string;
  globalAnimationPlaying: boolean;
  crossoverHops?: boolean;
  layers?: { id: string; name: string; visible: boolean }[];
  /** 当前活动图层：新建元件自动分配到此图层 */
  currentLayerId?: string;
  /** 是否吸附到网格 */
  snapToGrid?: boolean;
  /** 是否显示对齐辅助线 */
  showAlignmentGuides?: boolean;
  /** 全局流速倍率（0.5–2.5，仅影响动画播放速度） */
  flowScale?: number;
  /** 量感层：相对流量级联衰减驱动粒子密度（默认开启） */
  flowSense?: boolean;
  /** 压力域着色：运行泵/锅炉出侧可达管加淡色 halo（默认关闭） */
  pressureShading?: boolean;
  /** 演示微调持久化：scenarioId → stepIndex → nodeId → 阀/泵状态。「从此步生效」，随图纸保存/分享/机型包 */
  scenarioOverrides?: Record<string, Record<number, Record<string, { pumpOn?: boolean; valveState?: "open" | "closed"; valvePath?: "A" | "B" | "off" }>>>;
  /** 是否在管路上自动显示介质名称 */
  showFluidLabels?: boolean;
  /** 导出整理：是否显示元器件名称、管路编号与介质颜色。 */
  showNodeLabels?: boolean;
  showPipeLabels?: boolean;
  showFluidColors?: boolean;
  /** 全局元器件名称字号（单个元件未设置专属字号时使用）。 */
  nodeLabelFontSize?: number;
  /** 背景样式：点阵/方格/纯色 */
  backgroundType?: "dot" | "grid" | "solid";
  /** 记录保存时的应用版本（预留：版本历史/兼容迁移用） */
  appVersion?: string;
  /** 工况快照：命名的阀位/泵态组合，一键恢复做「按工况验证」（随图纸保存/分享） */
  workConditions?: Array<{
    name: string;
    state: Record<string, { pumpOn?: boolean; valveState?: "open" | "closed"; valvePath?: "A" | "B" | "off" }>;
  }>;
  /** 图纸验收工况：预设泵阀状态 + 必须流动/停止的管路，用于回归验证。 */
  validationCases?: ValidationCase[];
  /** 从哪张原图创建的编辑副本；仅用于标识，原图内容不会被覆盖。 */
  workingCopyOf?: string;
  /** 编辑副本的创建时间。 */
  workingCopyStartedAt?: string;
}

export interface ValidationCase {
  id: string;
  name: string;
  state: Record<string, { pumpOn?: boolean; valveState?: "open" | "closed"; valvePath?: "A" | "B" | "off" }>;
  mustFlowPipeIds: string[];
  mustStopPipeIds: string[];
}

export interface Diagram {
  id: string;
  name: string;
  nodes: DiagramNode[];
  pipes: Pipe[];
  settings: DiagramSettings;
}

export interface Pt {
  x: number;
  y: number;
}

export interface Selection {
  nodes: string[];
  pipes: string[];
}

export interface UIState {
  zoom: number;
  panX: number;
  panY: number;
  selection: Selection;
  mouseWorld: Pt;
  dirty: boolean;
  /** 三态工作模式：编辑 edit / 演示 present / 验收 verify（面板显隐由 App 联动） */
  mode?: "edit" | "present" | "verify";
  clipboard?: { nodes: DiagramNode[]; pipes: Pipe[] } | null;
  /** 样式刷模式是否开启 */
  styleBrush?: boolean;
  /** 撤销历史列表（供面板使用） */
  undoCount?: number;
  redoCount?: number;
  /** 演示/讲述模式状态 */
  scenario?: {
    scenarioId: string;
    stepIndex: number;
    /** 激活的高亮节点 id */
    activeNodes: string[];
    /** 激活的高亮管路 id */
    activePipes: string[];
    /** 演示微调叠加层：手动改动的阀/泵状态，跨步骤保留（退出/切场景清空） */
    overrides?: Record<string, { pumpOn?: boolean; valveState?: "open" | "closed"; valvePath?: "A" | "B" | "off" }>;
    /** 高亮模式：step=按场景步骤种子 / flow=跟随实际流动的管路发光 */
    highlightMode?: "step" | "flow";
  } | null;
  /** 定位闪烁：回路诊断/场景演示点击关联元素时短暂脉冲高亮（stamp 变化重启动画） */
  blink?: { ids: string[]; stamp: number } | null;
  /** 因果链路径：停流根因 → 该管的管路链在画布上点亮（橙色发光路径） */
  chainPath?: { pipeIds: string[]; stamp: number } | null;
}

export interface AppState {
  diagram: Diagram;
  ui: UIState;
}

let counter = 0;
export function uid(prefix: string): string {
  counter = (counter + 1) % 1679616;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.floor(
    Math.random() * 1296
  ).toString(36)}`;
}
