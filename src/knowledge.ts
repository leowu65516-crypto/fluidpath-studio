/**
 * 设备教学知识库：面向「工程师教学」导向，为每个元件提供
 * 作用（role）、原理（principle）与常见故障/注意点（common）。
 *
 * 选中元件时在右侧属性检查器展示，是教学工作台的核心资产。
 * 双语（zh/en）：Inspector / Help / Advice 统一只引用本条目，避免文案多源漂移。
 */

import type { Lang } from "./i18n";

export interface DeviceKnowledge {
  /** 一句话作用 */
  role: string;
  /** 原理说明（1-2 句） */
  principle: string;
  /** 常见位置 / 常见故障 / 教学要点 */
  common?: string;
}

const ZH: Record<string, DeviceKnowledge> = {
  tank: {
    role: "储液罐/水箱：储存并缓冲介质（水、牛奶等），为系统提供稳定供给",
    principle: "依靠重力或压力把介质送入下游；罐体越大，缓冲能力越强。",
    common: "教学要点：罐体应高于泵入口，避免泵空转（气蚀）。",
  },
  pressureTank: {
    role: "外置进水压力罐：蓄压并稳定进水压力，减少泵频繁启停",
    principle: "罐内气囊被压缩蓄能，压力下降时释放补充，稳定管路压力。",
    common: "常见于进水管路，配合压力开关控制泵的启停。",
  },
  syrupBottle: {
    role: "糖浆瓶：储存并定量供给糖浆/调味液",
    principle: "糖浆靠泵抽吸或重力流出，经糖浆泵定量注入饮品。",
  },
  hotWaterBoiler: {
    role: "热水锅炉：把常温水加热成高温热水（冲泡咖啡用 90–95℃）",
    principle: "底部进冷水、顶部出热水，加热棒加热后由水位/温度探针控制。",
    common: "教学要点：热水锅炉「之前」只能是常温水——不可能是蒸汽、牛奶或热水。",
  },
  steamBoiler: {
    role: "蒸汽锅炉：产生高温蒸汽（打奶泡 / 加热牛奶）",
    principle: "进水受热汽化，蒸汽从顶部引出；压力由压力开关/安全阀保护。",
    common: "蒸汽锅炉「之前」通常是冷水或热水锅炉的热水补给，输出只能是蒸汽。",
  },
  boiler: {
    role: "锅炉（旧版兼容）：等同热水锅炉",
    principle: "同热水锅炉，底部进冷水、顶部出热水。",
  },
  pump: {
    role: "水泵：为水路增压，驱动介质流动",
    principle: "叶轮旋转把机械能转为压力能，只增压、不改变介质。",
    common: "教学要点：水泵前后介质必须一致（只走水）；缺水空转会损坏。",
  },
  milkPump: {
    role: "奶泵：抽取并输送牛奶/奶沫",
    principle: "与水泵同理，但接触食品级材质，只输送奶类介质。",
    common: "奶路必须每日清洗，否则残留奶垢会滋生细菌。",
  },
  airPump: {
    role: "空气泵：气路动力源，输送空气（如注气/气辅冲泡）",
    principle: "与水泵同原理，只是输送介质为空气；运行时前后气路有流动。",
    common: "介质类型应设为「空气」；停泵时前后气路停流。",
  },
  valve: {
    role: "截止阀：手动开闭水路",
    principle: "转动手柄使阀芯升降，实现通断或节流。",
  },
  checkValve: {
    role: "单向阀：只允许介质沿一个方向流动",
    principle: "介质正向推开阀瓣、反向被压紧密封，防止倒流。",
    common: "常装在水源与泵之间，防止停泵后热水倒灌污染水源。",
  },
  solenoid2: {
    role: "两通电磁阀：电信号控制水路通断",
    principle: "线圈通电产生磁力拉动阀芯，实现开/关。",
    common: "常见故障：线圈烧毁、阀芯卡死（水垢）、常开/常闭接反。",
  },
  solenoid3: {
    role: "三通电磁阀：电信号在两路出口间切换导通",
    principle: "一路入口 + 两路出口（A/B），断电回位，用于分路或排废。",
    common: "常用于冲泡/排废切换、蒸汽分配；选型需确认常开还是常闭。",
  },
  pulseAirValve: {
    role: "脉冲空气电磁阀：短促喷气，用于清洁/吹扫",
    principle: "线圈瞬间通断产生脉冲气流，吹除残留液滴或粉料。",
    common: "全自动机常用来喷气清洁冲泡器或粉料通道。",
  },
  safetyValve: {
    role: "安全阀 / OPV 泄压阀：超压时自动泄放，保护锅炉与管路",
    principle: "压力超过设定值时克服弹簧力开启泄压，压力回落后关闭。",
    common: "教学要点：必须装在蒸汽锅炉顶部，泄放口朝安全方向。",
  },
  opv: {
    role: "OPV 过压保护阀（Over Pressure Valve）：限制冲泡压力",
    principle: "泵输出压力超过设定值（通常 9bar）时旁通泄流，把冲煮头压力稳定在目标值。",
    common: "教学要点：OPV 是半自动机稳定萃取压力的关键，常见 9bar / 11bar。",
  },
  pressureRegulator: {
    role: "节流阀 / 减压阀（pressure regulator）：稳定并降低下游压力",
    principle: "通过弹簧与阀芯的平衡，把上游高压稳定到设定低压。",
    common: "教学要点：减压阀用于把高压源降到设备可承受的压力。",
  },
  coupling: {
    role: "两通接头：连接两段管路",
    principle: "直通连接，介质不改变。",
  },
  metalCoupling: {
    role: "金属两通接头：承受更高压力/温度的金属连接",
    principle: "金属材质耐压耐温，适合蒸汽/热水段。",
  },
  tee: {
    role: "三通接头：一路分成两路",
    principle: "介质在交点分流或汇合，介质本身不变。",
    common: "分路时各支路介质一致；若混入不同介质需用「混合」类元件表达。",
  },
  teeY: {
    role: "Y 型三通：减小分流阻力的斜向三通",
    principle: "斜向分支降低局部阻力，适合流量敏感回路。",
  },
  teeF: {
    role: "F 型三通：一进一出主管 + 旁通支管（形似 F）",
    principle: "竖直主管直通，两个水平支管用于取压或旁通。",
  },
  cross: {
    role: "十字四通：四个方向的接头（十字交汇）",
    principle: "介质在交点按拓扑分流/汇合，介质本身不变；四路可任意接进/出。",
    common: "四路介质必须一致；端口数量可用属性面板端口区增减（上限 8）。",
  },
  elbow: {
    role: "直角接头：改变管路方向 90°",
    principle: "连接两个垂直方向的管路，介质不变。",
  },
  brewChamber: {
    role: "冲泡缸：密封腔体，上下活塞挤压咖啡粉完成萃取（水自下而上）",
    principle: "热水从底部注入密闭腔浸润咖啡粉，上、下活塞相对挤压，咖啡液从顶部流出（自下而上萃取）。",
    common: "萃取压力由上下活塞提供；密闭腔是咖啡粉与水混合萃取的地方；本机型水路自下而上。",
  },
  heatExchanger: {
    role: "换热器：在两种介质间传递热量（冷热两侧互不混合）",
    principle: "冷热两路通过壁面换热，两侧介质各自独立。",
    common: "教学要点：奶泡混合器/预热器两侧介质不同是正常的。",
  },
  filter: {
    role: "过滤器：拦截杂质、保护下游精密元件",
    principle: "介质流过过滤网/滤芯，颗粒被截留。",
    common: "滤芯需定期更换，堵塞会导致流量下降。",
  },
  metalFilter: {
    role: "矩形金属滤网：过滤水管中的大颗粒杂质",
    principle: "金属滤网拦截大颗粒，保护下游阀/泵；金属壳耐压耐温。",
    common: "通常装在进水端，需定期拆洗滤网。",
  },
  powderMixer: {
    role: "粉料搅拌器：把咖啡粉/奶粉等粉料与水混合均匀",
    principle: "搅拌叶片旋转，使粉料与水充分混合成浆液。",
    common: "全自动机冲煮前把粉料预混，避免结块。",
  },
  inlet: {
    role: "入口端：介质进入系统的边界（水源/蒸汽源/空气入口）",
    principle: "代表外部供给，通常为系统上游起点。",
  },
  outlet: {
    role: "出口端：介质离开系统的边界（排废/排水/出液）",
    principle: "代表排放或最终输出，通常为系统下游终点。",
  },
  connector: {
    role: "普通接头：连接端口或表示跨接",
    principle: "多端口节点，用于布线分支。",
  },
  hotWaterWand: {
    role: "热水杆/热水出口：输出高温热水（美式/泡茶）",
    principle: "热水锅炉的热水经阀控后从杆口流出。",
    common: "教学要点：热水杆上游必须是热水。",
  },
  steamWand: {
    role: "蒸汽杆：输出蒸汽，用于打发奶泡",
    principle: "蒸汽锅炉的蒸汽经蒸汽阀从喷头高速喷出。",
    common: "教学要点：蒸汽杆上游必须是蒸汽；使用后需空喷排空管内残奶。",
  },
  coffeeOutlet: {
    role: "咖啡出口/冲煮头：萃取咖啡液并从出液嘴流出",
    principle: "高压热水穿过咖啡粉饼，萃取出咖啡液，单嘴/双嘴流出。",
    common: "教学要点：咖啡出口上游必须是咖啡液（由冲泡缸/冲煮头萃取而来）。",
  },
  groupHead: {
    role: "冲煮头（Group Head）：装填粉饼并分配高压热水萃取咖啡",
    principle: "热水经分水网均匀润湿粉饼，在 9bar 下萃取，咖啡液从下方流出。",
    common: "教学要点：萃取压力由 OPV 稳定在 9bar，预浸润可提升均匀萃取。",
  },
  milkOutlet: {
    role: "牛奶出口：输出牛奶/奶沫",
    principle: "奶泵输送牛奶，经蒸汽加热/发泡后从出口流出。",
  },
  hotWaterOutlet: {
    role: "美式热水出口：输出热水",
    principle: "热水锅炉热水经控制阀输出。",
  },
  flowMeter: {
    role: "流量计：计量通过的介质流量",
    principle: "介质推动涡轮/叶轮旋转，脉冲信号换算为流量。",
    common: "教学要点：全自动机用它精确控水，实现定量萃取。",
  },
  pressureGauge: {
    role: "压力表：显示管路/锅炉压力",
    principle: "压力作用于弹性元件驱动指针。",
  },
  pressureSensor: {
    role: "压力传感器：把压力转为电信号送控制板",
    principle: "膜片受压变形，转为电信号用于 PID 控制。",
  },
  pressureSwitch: {
    role: "进水压力开关：检测进水压力，低于阈值时触发（如缺水报警/启动泵）",
    principle: "压力低于设定值闭合/断开触点，输出开关信号。",
    common: "常装在进水管路，缺水或水压不足时保护泵。",
  },
  ntcProbe: {
    role: "NTC 温度探针：测量介质温度",
    principle: "NTC 热敏电阻阻值随温度变化，用于锅炉温控。",
    common: "教学要点：PID 温控依赖 NTC，温度漂移会导致萃取不稳定。",
  },
  sensor: {
    role: "传感器：通用检测元件",
    principle: "检测介质状态并输出信号。",
  },
  shape: {
    role: "自定义图形：标注流程模块或抽象单元",
    principle: "用矩形/椭圆/菱形等表达抽象功能块。",
  },
  label: {
    role: "文本标签：添加文字说明",
    principle: "不参与流动，仅作标注。",
  },
  arrow: {
    role: "流向箭头：标注介质流动方向",
    principle: "纯标注，不参与流动。",
  },
  annotation: {
    role: "标注：带引线指向目标位置做说明",
    principle: "用于教学重点标注。",
  },
  image: {
    role: "图片：插入参考图/实物照片",
    principle: "用于对照实物或贴入结构图。",
  },
};

const EN: Record<string, DeviceKnowledge> = {
  tank: {
    role: "Tank / reservoir: stores and buffers fluid (water, milk, etc.) for a stable supply",
    principle: "Delivers fluid downstream by gravity or pressure; a larger tank means more buffering.",
    common: "Teaching note: keep the tank above the pump inlet to avoid dry running (cavitation).",
  },
  pressureTank: {
    role: "External pressure tank: buffers and stabilizes inlet pressure, reducing pump cycling",
    principle: "An internal bladder stores energy; when pressure drops it releases water to keep line pressure stable.",
    common: "Common on the inlet line, paired with a pressure switch to start/stop the pump.",
  },
  syrupBottle: {
    role: "Syrup bottle: stores and doses syrup / flavoring",
    principle: "Syrup flows by pump suction or gravity and is dosed into the drink.",
  },
  hotWaterBoiler: {
    role: "Hot-water boiler: heats cold water to brewing temperature (90–95°C for coffee)",
    principle: "Cold water enters at the bottom, hot water leaves at the top; heating is controlled by level/temperature probes.",
    common: "Teaching note: upstream of a hot-water boiler there can only be cold water — never steam, milk or hot water.",
  },
  steamBoiler: {
    role: "Steam boiler: produces high-temperature steam (for foaming / heating milk)",
    principle: "Feed water boils and steam is drawn from the top; pressure is protected by a pressure switch / safety valve.",
    common: "Upstream is usually cold water or hot-water boiler feed; the output is always steam.",
  },
  boiler: {
    role: "Boiler (legacy alias): same as hot-water boiler",
    principle: "Same as hot-water boiler: cold in at the bottom, hot out at the top.",
  },
  pump: {
    role: "Water pump: pressurizes the water circuit and drives flow",
    principle: "The impeller converts mechanical energy into pressure; it only pressurizes, never changes the fluid.",
    common: "Teaching note: fluid before and after a water pump must be water; running dry damages it.",
  },
  milkPump: {
    role: "Milk pump: draws and conveys milk / milk foam",
    principle: "Same principle as a water pump but with food-grade materials, milk only.",
    common: "The milk circuit must be cleaned daily or residue breeds bacteria.",
  },
  airPump: {
    role: "Air pump: gas power source, conveys air (injection / air-assist)",
    principle: "Same principle as a water pump but the medium is air; downstream gas lines flow while running.",
    common: "Set the fluid type to air; gas lines stop when the pump stops.",
  },
  valve: {
    role: "Manual valve: opens/closes a water line by hand",
    principle: "Turning the handle lifts the stem to switch or throttle flow.",
  },
  checkValve: {
    role: "Check valve: allows flow in one direction only",
    principle: "Forward pressure lifts the disc; reverse pressure seats it shut, preventing backflow.",
    common: "Often installed between the water source and pump to stop hot water flowing back into the supply.",
  },
  solenoid2: {
    role: "2-way solenoid valve: electrically switches a line on/off",
    principle: "Energizing the coil moves the plunger to open or close the orifice.",
    common: "Typical faults: burnt coil, stuck plunger (limescale), normally-open/normally-closed mix-up.",
  },
  solenoid3: {
    role: "3-way solenoid valve: electrically routes between two outlets",
    principle: "One inlet + two outlets (A/B); de-energized it returns to rest. Used for diverting or draining.",
    common: "Used for brew/drain switching and steam distribution; confirm NO/NC type when selecting.",
  },
  pulseAirValve: {
    role: "Pulse air valve: short air bursts for cleaning / purging",
    principle: "Rapid coil switching generates pulsed air to blow away residual drops or powder.",
    common: "Full-auto machines use it to purge the brew unit or powder channel.",
  },
  safetyValve: {
    role: "Safety valve / OPV relief: vents automatically on over-pressure to protect boiler and lines",
    principle: "Pressure above the setpoint overcomes the spring and opens the relief; it re-closes as pressure falls.",
    common: "Teaching note: mount on top of the steam boiler with the outlet facing a safe direction.",
  },
  opv: {
    role: "OPV (over-pressure valve): limits brew pressure",
    principle: "When pump pressure exceeds the setpoint (usually 9 bar) it bypasses flow, stabilizing group-head pressure.",
    common: "Teaching note: the OPV is key to stable extraction pressure; 9 bar / 11 bar are typical.",
  },
  pressureRegulator: {
    role: "Throttle / pressure regulator: stabilizes and reduces downstream pressure",
    principle: "A spring-and-diaphragm balance holds upstream high pressure down to the set low pressure.",
    common: "Teaching note: regulators step a high-pressure source down to what the machine tolerates.",
  },
  coupling: {
    role: "Straight coupling: joins two pipe segments",
    principle: "A straight-through joint; the fluid does not change.",
  },
  metalCoupling: {
    role: "Metal coupling: metal joint for higher pressure / temperature",
    principle: "Metal withstands pressure and heat; suited to steam / hot-water sections.",
  },
  tee: {
    role: "Tee: splits one line into two",
    principle: "Fluid divides or merges at the junction; the fluid itself does not change.",
    common: "Branches must carry the same fluid; mixing different fluids needs a mixer-type element.",
  },
  teeY: {
    role: "Y-tee: an angled tee that reduces split losses",
    principle: "The angled branch lowers local resistance; good for flow-sensitive loops.",
  },
  teeF: {
    role: "F-tee: one in / one out main line + bypass branch (F-shaped)",
    principle: "Vertical main line straight through; two horizontal branches for pressure take-off or bypass.",
  },
  cross: {
    role: "Cross: four-way junction (cross intersection)",
    principle: "Fluid divides/merges by topology; all four ways may connect in or out.",
    common: "All four branches must carry the same fluid; add/remove ports in the Inspector (max 8).",
  },
  elbow: {
    role: "Elbow: turns the pipe 90°",
    principle: "Joins two perpendicular pipe runs; the fluid does not change.",
  },
  brewChamber: {
    role: "Brew chamber: sealed cavity where pistons squeeze the coffee puck for extraction (water flows upward)",
    principle: "Hot water enters the sealed cavity from the bottom to wet the puck; upper and lower pistons press together and coffee exits at the top (upward extraction).",
    common: "Extraction pressure is provided by the pistons; the sealed cavity is where water and coffee mix; this machine brews bottom-up.",
  },
  heatExchanger: {
    role: "Heat exchanger: transfers heat between two fluids (hot and cold sides never mix)",
    principle: "The two circuits exchange heat through a wall; each side keeps its own fluid.",
    common: "Teaching note: different fluids on each side of a foamer/preheater are normal.",
  },
  filter: {
    role: "Filter: traps impurities and protects precision downstream parts",
    principle: "Fluid passes through a mesh/cartridge; particles are retained.",
    common: "Replace cartridges regularly; clogging reduces flow.",
  },
  metalFilter: {
    role: "Rectangular metal mesh filter: removes large particles in the water line",
    principle: "The metal mesh traps large particles, protecting downstream valves/pumps; the metal body resists pressure and heat.",
    common: "Usually at the water inlet; clean the mesh periodically.",
  },
  powderMixer: {
    role: "Powder mixer: blends coffee powder / milk powder evenly with water",
    principle: "Stirring blades rotate to mix powder and water into a slurry.",
    common: "Full-auto machines pre-mix powder before brewing to avoid clumps.",
  },
  inlet: {
    role: "Inlet: boundary where fluid enters the system (water / steam / air source)",
    principle: "Represents the external supply; usually the upstream start of the system.",
  },
  outlet: {
    role: "Outlet: boundary where fluid leaves the system (drain / waste / dispense)",
    principle: "Represents discharge or final output; usually the downstream end.",
  },
  connector: {
    role: "Connector: joins ports or represents a jumper",
    principle: "A multi-port node used for routing branches.",
  },
  hotWaterWand: {
    role: "Hot-water wand / outlet: dispenses hot water (americano / tea)",
    principle: "Hot water from the boiler flows out of the wand through valve control.",
    common: "Teaching note: upstream of the hot-water wand must be hot water.",
  },
  steamWand: {
    role: "Steam wand: outputs steam for frothing milk",
    principle: "Steam from the boiler blasts out of the nozzle through the steam valve.",
    common: "Teaching note: upstream must be steam; after use, purge the wand to clear residual milk.",
  },
  coffeeOutlet: {
    role: "Coffee outlet / spout: dispenses extracted coffee",
    principle: "High-pressure hot water passes through the coffee puck; coffee drips from single/double spouts.",
    common: "Teaching note: upstream of the coffee outlet must be coffee (extracted by the brew chamber / group head).",
  },
  groupHead: {
    role: "Group head: holds the puck and distributes high-pressure hot water for extraction",
    principle: "A dispersion screen wets the puck evenly; extraction at 9 bar and coffee flows out below.",
    common: "Teaching note: OPV stabilizes brew pressure at 9 bar; pre-infusion improves evenness.",
  },
  milkOutlet: {
    role: "Milk outlet: dispenses milk / milk foam",
    principle: "The milk pump conveys milk; after steam heating/frothing it flows out here.",
  },
  hotWaterOutlet: {
    role: "Americano hot-water outlet: dispenses hot water",
    principle: "Hot water from the boiler is dispensed through a control valve.",
  },
  flowMeter: {
    role: "Flow meter: measures the fluid volume passing through",
    principle: "Fluid spins a turbine/impeller; pulses are converted into flow volume.",
    common: "Teaching note: full-auto machines use it to dose water precisely for repeatable extraction.",
  },
  pressureGauge: {
    role: "Pressure gauge: shows line / boiler pressure",
    principle: "Pressure acts on an elastic element that drives the needle.",
  },
  pressureSensor: {
    role: "Pressure sensor: converts pressure into an electrical signal for the control board",
    principle: "A diaphragm deforms under pressure and outputs a signal used for PID control.",
  },
  pressureSwitch: {
    role: "Inlet pressure switch: detects line pressure; triggers below threshold (e.g. water-shortage alarm / pump start)",
    principle: "Contacts open/close below the set pressure, outputting a switching signal.",
    common: "Usually on the inlet line; protects the pump when water is short or pressure is low.",
  },
  ntcProbe: {
    role: "NTC temperature probe: measures fluid temperature",
    principle: "An NTC thermistor's resistance changes with temperature; used for boiler temperature control.",
    common: "Teaching note: PID control depends on the NTC; drift causes unstable extraction.",
  },
  sensor: {
    role: "Sensor: generic sensing element",
    principle: "Detects fluid state and outputs a signal.",
  },
  shape: {
    role: "Custom shape: marks a process block or abstract unit",
    principle: "Use rect/ellipse/diamond shapes to express abstract functional blocks.",
  },
  label: {
    role: "Text label: adds a text note",
    principle: "Not part of the flow; annotation only.",
  },
  arrow: {
    role: "Flow arrow: marks the direction of flow",
    principle: "Pure annotation; not part of the flow.",
  },
  annotation: {
    role: "Annotation: a leader line pointing at a target with an explanation",
    principle: "Used to highlight teaching points.",
  },
  image: {
    role: "Image: inserts a reference photo / real-product picture",
    principle: "Used to compare with the real machine or paste structural photos.",
  },
};

/** 按语言取知识条目；缺失语言回退中文。 */
export function knowledgeOf(type: string, lang: Lang = "zh"): DeviceKnowledge | undefined {
  if (lang === "en") return EN[type] ?? ZH[type];
  return ZH[type];
}

/** 中文知识表（兼容旧引用与测试） */
export const KNOWLEDGE: Record<string, DeviceKnowledge> = ZH;

/** @deprecated 兼容旧调用：请改用 knowledgeOf(type, lang)。 */
export function knowledgeOfZh(type: string): DeviceKnowledge | undefined {
  return ZH[type];
}
