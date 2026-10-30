import type { DiagnosticProfile } from "./fault-codes/types";

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
  | "diaphragmValve2" // 两通隔膜阀：开 / 关
  | "diaphragmValve3" // 三口两位隔膜切换阀：两个双向通路共享一个可配置公共端
  | "pulseAirValve" // 脉冲空气电磁阀
  | "safetyValve"
  | "opv" // OPV 过压保护阀（泄压/限压）
  | "pressureRegulator" // 减压阀（pressure-reducing valve）
  | "ballValve" // 手动球阀（工程开关阀）
  | "coupling"
  | "metalCoupling"
  | "tee"
  | "teeY"
  | "teeF" // F 型三通
  | "cross" // 十字四通
  | "elbow"
  | "heatExchanger"
  | "thermoblock" // 即热加热块：水流经过即加热，不储水
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

/** Visual expression only. It never changes port semantics, topology or engine state. */
export type SymbolProfile = "teaching" | "engineering";

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
  /** 元器件标签手动偏移（画布上拖动文字微调位置，避免与元件/其它文字重叠） */
  labelOffset?: { x: number; y: number };
  /** 元器件标签背景；未设置时保持无底板。 */
  labelBackground?: string;
  /** 元器件标签背景透明度（0..1）。 */
  labelBackgroundOpacity?: number;
  /** 咖啡出口：是否显示出液（咖啡滴落）动画 */
  dispensing?: boolean;
  /** 组 ID：同组节点选中时联动、一起移动 */
  groupId?: string;
  /** 导出附加节点分类（仅导出管线用：legend=图例文字 / custom=自定义文字层） */
  exportKind?: "legend" | "custom";
  /** 工程禁用：参与液路判定；不是画布淡化。 */
  disabled?: boolean;
  /** 仅画布显示淡化，不改变工程状态、验收结果或导出。 */
  displayDisabled?: boolean;
  /** 智能绘图生成图中的二级系统（奶路/蒸汽/排废/安全附件）；主链视图据此隐藏，工程导出剔除。 */
  smartSecondary?: boolean;
  /** 两通电磁阀状态：开 / 关 */
  valveState?: "open" | "closed";
  /** 三通状态。对隔膜切换阀而言 A/B 是内部稳定状态槽，不表示端口方位或流向。 */
  valvePath?: "A" | "B" | "off";
  /** 三口隔膜切换阀的公共端口 ID；两条有效通路均经过此端口。缺失时兼容旧图纸。 */
  valveCommonPortId?: string;
  /** 电磁阀：是否在画布上直接显示开关状态并可点击切换 */
  showStateOnDiagram?: boolean;
  /** 水泵/奶泵：是否运行（关闭时前后液路停流） */
  pumpOn?: boolean;
  /** 故障模拟（教学用）：泵卡死 / 阀卡开 / 阀卡关 */
  fault?: NodeFault;
  /** 标注节点：引线指向的目标世界坐标 */
  pointerTarget?: Pt;
  /** 标注引线颜色与透明度。 */
  annotationLineColor?: string;
  annotationLineOpacity?: number;
  /** 标注框填充与边框透明度。 */
  annotationFillOpacity?: number;
  annotationStrokeOpacity?: number;
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
  /**
   * 走线来源：用户拖过折点 = manual，其余（模板/整理/新建）= auto。
   * 缺省按「有折点视为 manual」推断，避免旧图纸的手工布线被智能整理误清。
   */
  routeMode?: "manual" | "auto";
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
  /** AI/协议声明的介质；仅为声明，不等同于已解析的工程介质。 */
  declaredMedium?: FluidType;
  /** 引擎已解析的介质；缺失表示当前没有可证明的解析结果。 */
  resolvedMedium?: FluidType;
  /** 管材（决定默认管壁颜色/透明度） */
  material?: PipeMaterial;
  /** 管壁透明度（透明硅胶管 < 1） */
  wallOpacity?: number;
  /** 走线方式：直角折线（默认）/ 平滑曲线。曲线模式下折点自由移动 */
  routing?: "orthogonal" | "curved";
  /** 直角折线模式的拐角圆角半径（px），0 为直角 */
  cornerRadius?: number;
  /** 工程禁用：参与液路判定并使管路停流。 */
  disabled?: boolean;
  /** 仅画布显示淡化，不改变工程状态、验收结果或导出。 */
  displayDisabled?: boolean;
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
  /** Successfully applied AI request IDs; retained on round-trip for idempotency. */
  aiAppliedRequestIds?: string[];
  /** Optional, independently versioned diagnostic module; simulation/selection stays in memory. */
  diagnosticProfile?: DiagnosticProfile;
  showGrid: boolean;
  background: string;
  /** 画布底色跟随明暗主题（只影响显示与导出底色，不回写 background） */
  backgroundFollowTheme?: boolean;
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
  /** 演示微调持久化：scenarioId → stepIndex → nodeId → 阀/泵状态。「从此步生效」，随图纸保存/分享/机型包 */
  scenarioOverrides?: Record<string, Record<number, Record<string, { pumpOn?: boolean; valveState?: "open" | "closed"; valvePath?: "A" | "B" | "off" }>>>;
  /** 自定义演示场景（从工况导入或用户创建），随图纸保存 */
  customScenarios?: SceneScenario[];
  /** 是否在管路上自动显示介质名称 */
  showFluidLabels?: boolean;
  /** 导出整理：是否显示元器件名称、管路编号与介质颜色。 */
  showNodeLabels?: boolean;
  showPipeLabels?: boolean;
  /** 管路中段标签：是否显示管径（DNxx），与编号可分开开关。 */
  showPipeDiameters?: boolean;
  showFluidColors?: boolean;
  /** 诊断角标的纯显示筛选；不改变诊断结果、工程状态或验收。 */
  diagnosticMarkerMode?: "all" | "errors" | "hidden";
  /** 全局元器件名称字号（单个元件未设置专属字号时使用）。 */
  nodeLabelFontSize?: number;
  /** 背景样式：点阵/方格/纯色 */
  backgroundType?: "dot" | "grid" | "solid";
  /** 记录保存时的应用版本（预留：版本历史/兼容迁移用） */
  appVersion?: string;
  /** 图纸级符号表达。缺失时按 teaching 处理，确保历史 JSON 的原样显示。 */
  symbolProfile?: SymbolProfile;
  /** 工况快照：命名的工程/教学显示状态；以保存时的当前设置为准，随图纸保存/分享。 */
  workConditions?: WorkCondition[];
  /** 智能绘图分区提示；只影响画布辅助标注，不影响工程判定。 */
  smartZones?: SmartZone[];
  /** 是否显示智能绘图系统分区提示（默认显示）。 */
  smartZonesVisible?: boolean;
  /** 是否显示压力表/安全阀/OPV 等安全附件（默认显示）。 */
  smartAccessoriesVisible?: boolean;
  /** 图纸验收工况：预设泵阀状态 + 必须流动/停止的管路，用于回归验证。 */
  validationCases?: ValidationCase[];
  /** 从哪张原图创建的编辑副本；仅用于标识，原图内容不会被覆盖。 */
  workingCopyOf?: string;
  /** 编辑副本的创建时间。 */
  workingCopyStartedAt?: string;
}

/** 演示场景类型（内置场景与自定义场景共用；自定义场景的 allNodes/addNodes/valves 键直接用 nodeId） */
export type SceneValveAction = "pump-run" | "pump-stop" | "open" | "closed" | "A" | "B" | "off";

export interface SceneScenarioStep {
  title: string;
  desc: string;
  /**
   * 自定义演示步骤引用的工况名称。存在时，演示进入此步会应用完整工况快照，
   * 不只应用阀位；内置场景不使用此字段。
   */
  conditionName?: string;
  addNodes?: string[];
  valves?: Record<string, SceneValveAction>;
  autoAdvanceMs?: number;
  /** 讲师旁白（双语） */
  narrator?: { zh: string; en: string };
  /** 画布标注说明 */
  callouts?: { role: string; text: { zh: string; en: string } }[];
  /** 学员小测验 */
  quiz?: { q: { zh: string; en: string }; options: { zh: string; en: string }[]; answer: number };
}

export interface SceneScenario {
  id: string;
  title: string;
  icon: string;
  /** 全流程元件（角色名或 nodeId） */
  allNodes: string[];
  steps: SceneScenarioStep[];
  /** 自定义场景标记（可删除） */
  custom?: boolean;
  createdAt?: string;
}

/**
 * 工况恢复的是“状态与展示”，不是图纸拓扑：不会新增/删除对象，也不会改端口连接。
 * 这样图纸之后继续编辑结构时，旧工况仍可安全切换。
 */
export type WorkConditionNodeProperties = Omit<DiagramNode, "id" | "type" | "ports">;
export type WorkConditionPipeProperties = Omit<Pipe, "id" | "fromPortId" | "toPortId" | "fromPoint" | "toPoint">;
export type WorkConditionDisplaySettings = Pick<DiagramSettings,
  "showGrid" | "background" | "globalAnimationPlaying" | "crossoverHops" | "layers" |
  "currentLayerId" | "snapToGrid" | "showAlignmentGuides" | "flowScale" |
  "showFluidLabels" | "showNodeLabels" | "showPipeLabels" | "showPipeDiameters" |
  "showFluidColors" | "diagnosticMarkerMode" | "nodeLabelFontSize" | "backgroundType"
>;

export interface WorkCondition {
  name: string;
  /** 兼容旧图纸及验收/高亮逻辑的泵阀状态摘要。 */
  state: Record<string, { pumpOn?: boolean; valveState?: "open" | "closed"; valvePath?: "A" | "B" | "off" }>;
  /** v1.30.7 旧快照兼容字段：仅管路介质。 */
  pipes?: Record<string, { fluidType?: FluidType; fluidColor?: string }>;
  /** v1.31：所有已存在元器件的可编辑属性，含工程禁用和教学显示属性。 */
  componentProperties?: Record<string, WorkConditionNodeProperties>;
  /** v1.31：所有已存在管路的可编辑属性，含介质、动画和教学显示覆盖。 */
  pipeProperties?: Record<string, WorkConditionPipeProperties>;
  /** v1.31：画布和图层等展示设置；不含验收、模板、演示定义等元数据。 */
  displaySettings?: Partial<WorkConditionDisplaySettings>;
}

export interface ValidationCase {
  id: string;
  name: string;
  state: Record<string, { pumpOn?: boolean; valveState?: "open" | "closed"; valvePath?: "A" | "B" | "off" }>;
  mustFlowPipeIds: string[];
  mustStopPipeIds: string[];
}

/** 智能绘图模板的分区提示（仅画布背景标注，不参与工程拓扑）。 */
export interface SmartZone {
  id: string;
  labelZh: string;
  labelEn: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color?: string;
  /** 分区显隐；只影响背景提示，不影响工程。 */
  visible?: boolean;
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
  /** 重排全部的幽灵预览（存在即表示正在预览；结构定义在 store，避免 types 反向依赖） */
  routePreview?: { routes: Array<{ id: string; pts: Pt[] }>; rerouted: number; skippedCurved: number; manualCleared: number } | null;
  panX: number;
  panY: number;
  selection: Selection;
  mouseWorld: Pt;
  dirty: boolean;
  /** 最近一次本机自动保存时间（ms） */
  lastAutosaveAt?: number;
  /** 最近一次保存为文件的时间（ms） */
  fileSavedAt?: number;
  /** 工作模式：编辑 / 演示 / 验收 / 故障排查（面板显隐由 App 联动） */
  mode?: "edit" | "present" | "verify" | "fault";
  clipboard?: { nodes: DiagramNode[]; pipes: Pipe[] } | null;
  /** 样式刷模式是否开启 */
  styleBrush?: boolean;
  /** 0.4 故障演练绑定向导：队列与当前位置（null = 未开启）。 */
  kbBinding?: { queue: string[]; index: number } | null;
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
  /** 导出面板打开时临时关闭视口裁剪，保证快照包含完整图纸；不写入 JSON。 */
  exportFullRender?: boolean;
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
