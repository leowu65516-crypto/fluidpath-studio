/**
 * 设备教学知识库：面向「工程师教学」导向，为每个元件提供
 * 作用（role）、原理（principle）与常见故障/注意点（common）。
 *
 * 选中元件时在右侧属性检查器展示，是教学工作台的核心资产。
 */

export interface DeviceKnowledge {
  /** 一句话作用 */
  role: string;
  /** 原理说明（1-2 句） */
  principle: string;
  /** 常见位置 / 常见故障 / 教学要点 */
  common?: string;
}

export const KNOWLEDGE: Record<string, DeviceKnowledge> = {
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

export function knowledgeOf(type: string): DeviceKnowledge | undefined {
  return KNOWLEDGE[type];
}
