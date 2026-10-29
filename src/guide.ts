/**
 * 使用指南内容：分章节的教学指引，面向「工程师教学」导向，
 * 覆盖从快速开始到高级校验、故障模拟的完整工作流。
 */

export interface GuideBlock {
  type: "p" | "list" | "tip";
  text?: string;
  items?: string[];
  textEn?: string;
  itemsEn?: string[];
}

export interface GuideSection {
  id: string;
  icon: string;
  title: string;
  blocks: GuideBlock[];
  titleEn?: string;
}

export const GUIDE: GuideSection[] = [
  {
    id: "quickstart",
    icon: "🚀",
    title: "快速开始",
    blocks: [
      { type: "p", text: "FluidPath Studio 是一个「液路动态示意图」教学工作台，用于绘制、仿真、讲解商用咖啡机等设备的液路原理，并可导出为图片/文档或分享给他人。" },
      { type: "list", items: [
        "最快开始：点工具栏「✨ 智能绘图」——用一句中文描述（如「双锅炉全自动咖啡机，带奶泵和蒸汽杆」）或选一张模板卡，三步得到一张结构/工程双检查通过的可编辑图纸。",
        "新建：点击工具栏「新建」从空白画布开始。",
        "套模板：右侧「项目设置 → 插入模板」，选择「☕ 咖啡机水路」「♨️ 蒸汽系统」「🥛 牛奶发泡系统」或「🔄 循环回路」快速进入实战案例。",
        "打开文件：支持 .json 工程文件拖入画布，或工具栏「打开 JSON」；macOS 双击 .json 也会自动打开。",
        "示例讲解：工具栏「演示」选择内置场景，按步骤高亮讲解液路工作过程。",
        "三态工作模式：工具栏「✏️ 编辑 / 🎬 演示 / ⚠ 故障」一键切换工作现场——编辑画图、演示投屏（侧栏自动收起）、故障排障演练；后两者锁定拓扑编辑。",
        "工况快照：把当前的泵/阀开关状态存成命名工况，一键恢复对比；演示步骤也可一键「存为工况」。",
        "机型包：工具栏「📦 导入/导出机型包」——把图纸、场景和说明一次打包成单个 .fluidpack.json，对方导入即可打开完整工作现场（图打开、演示可用），适合向同事或厂商交付机型资料。",
        "自动保存：打开同路径自动保存后，桌面版每分钟写入原 JSON 路径的备份副本；浏览器版会下载备份，不会覆盖原文件。状态栏随时显示「本机已保存 / 文件未保存」。",
        "中英文：点工具栏「EN / 中」立即切换界面和指南语言；当前图纸名称、元件标签和用户自定义文本保持原样。",
        "完整闭环：先确认结构，再切换演示讲解；教学展示不应代替工程状态，停流/流动以工程判定为准。",
      ]},
      { type: "tip", text: "第一次使用建议先插入「☕ 咖啡机水路」模板，再点「演示」看一遍完整萃取流程。" },
    ],
  },
  {
    id: "smart",
    icon: "✨",
    title: "智能绘图",
    blocks: [
      { type: "p", text: "「智能绘图」把「我想画什么」变成一张可编辑的起步图：场景模板 + 少量选项 + 工程检查，全程不出现协议术语，生成结果可继续编辑。" },
      { type: "list", items: [
        "三步向导：选场景（支持中文描述，如「带两个奶罐和清洗旁通」）→ 选配置 → 预览插入；预览页实时显示结构与工程检查结果。",
        "内置 7 张机型模板：水路 / 咖啡冲泡 / 即热 / 奶路 / 蒸汽 / 组合 / 双锅炉骨架，均自带安全附件（安全阀、OPV、泵出口单向阀、压力表）与推荐工况（待机 + 可运行）。",
        "继续完善：插入后右栏告诉你「这张图还缺什么」——分区显隐、只看主链、工程检查点击定位、快捷功能块（蒸汽杆/清洗旁通/排废支路…）、「我想加…」关键词添加。",
        "智能整理：「修复重合，保留手工布线」只重排有视觉重合的管路；「重排全部」才会清除手工折点（有确认）。",
        "安全边界：智能绘图只生成可编辑图纸，不宣称工程验收；自由文本限于咖啡机液路领域，不连接外部模型。",
      ]},
      { type: "tip", text: "生成后先用「只看主链」看主流程，再按分区逐条检查；不满意的部分选中后用 Inspector 批量调整。" },
    ],
  },
  {
    id: "library",
    icon: "🧰",
    title: "元件库",
    blocks: [
      { type: "p", text: "左侧元件库按「容器 / 动力 / 控制 / 处理 / 连接 / 出口 / 传感器 / 其他 / 注释」分组，包含水泵、锅炉、电磁阀、三通、换热器、流量计、咖啡/奶/蒸汽出口等 30+ 工业元件。" },
      { type: "list", items: [
        "拖拽元件到画布即可添加；双击元件库条目可快速添加。",
        "顶部搜索框可按名称过滤元件（Ctrl+F 也可打开全局搜索）。",
        "点击分组标题可折叠/展开该组。",
        "符号双风格：右侧「符号表达」可切换教学/工程两套画法——教学符号给学员，工程符号（ISO/ISA 惯例启用的黑白线条）给海外交付；元件库始终用教学符号方便选件。",
      ]},
      { type: "tip", text: "OPV 泄压阀与冲煮头（Group Head）是商用咖啡机的关键元件，详见「☕ 咖啡机水路」模板。" },
    ],
  },
  {
    id: "canvas",
    icon: "🖱️",
    title: "画布操作",
    blocks: [
      { type: "list", items: [
        "平移：空格/中键/右键拖拽，或右下角缩略图导航。",
        "缩放：滚轮；工具栏 +/- 与「适应画布」。",
        "选择：点击选中；框选多选；Shift 加选。",
        "移动：拖动节点；拖动时自动对齐其他节点并显示洋红参考线，按住 Alt 临时关闭吸附。",
        "缩放/旋转：选中单个节点拖四角手柄缩放，按住 Shift 拖动旋转。",
        "对齐/分布/镜像/排版：多选后在右侧面板批量操作。",
        "定位：Ctrl+F 搜索元件，Enter 或点击结果后视口平滑飞到目标并闪烁提示；画布右键菜单、搜索等浮层同刻只开一个，Esc 可关闭。",
      ]},
      { type: "tip", text: "在「项目设置」可开关吸附网格与对齐辅助线。" },
    ],
  },
  {
    id: "pipes",
    icon: "🔗",
    title: "管路编辑",
    blocks: [
      { type: "p", text: "管路是液路图的核心。把鼠标悬停在节点上会显示端口，从端口拖到另一个端口即生成管路。" },
      { type: "list", items: [
        "连线：端口拖拽到目标端口；一个端口只能接一条管路，分路请用三通接头。",
        "走线：自动避障走线；选中管路点击可插入折点，拖动折点调形，右键折点删除；右键菜单可「重置走线」恢复自动。",
        "整理管路：工具栏「智能整理」只重排有视觉重合的管路并保留手工布线；「重排全部」才清空手工折点（会先确认，可撤销）。",
        "端子：选中管路后拖两端蓝色手柄可重连端口或拖成游离端点。",
        "样式：右侧面板设置介质、管材、管径、颜色、流速、流向、颗粒密度、拐角圆角。",
        "跨线拱桥：交叉管路自动用半圆拱起，避免误认为连通（可在项目设置关闭）。",
      ]},
      { type: "tip", text: "改介质时「独立修改」只影响当前这条管路；如需整条直通链同步，右键管路选「沿直通链同步介质」。" },
    ],
  },
  {
    id: "fluid-check",
    icon: "🧪",
    title: "介质与校验",
    blocks: [
      { type: "p", text: "工作台内置「液路介质物理常识」规则：热水锅炉之前只能是常温水、蒸汽锅炉出蒸汽、咖啡出口出咖啡、蒸汽杆出蒸汽……明显的介质错误会被实时标出。" },
      { type: "list", items: [
        "介质冲突：错误管路上方出现橙色「!」感叹号，点击可逐条选择正确介质修复；右侧面板也会显示冲突警告与修复按钮。",
        "回路诊断：右侧「🔍 回路诊断」一键检查孤立元件、介质冲突、端口多连、故障状态。",
        "状态栏：右下角实时显示 ⛔ 错误 / ⚠ 警告计数。",
      ]},
      { type: "tip", text: "教学场景：故意把「热水锅炉进水」标成蒸汽，观察感叹号如何提示，再点「改为常温水」修复。" },
    ],
  },
  {
    id: "demo",
    icon: "🎬",
    title: "演示 / 讲述模式",
    blocks: [
      { type: "p", text: "「演示模式」按步骤高亮讲解液路工作过程，适合上课或向客户讲解。场景按当前图纸自动匹配：冲泡咖啡、热牛奶、美式咖啡、热水杆、牛奶清洗、排废。" },
      { type: "list", items: [
        "工具栏点「演示」，选择与当前图纸匹配的场景（缺元件的场景自动隐藏）：冲泡咖啡 / 热牛奶 / 美式咖啡 / 热水杆 / 牛奶清洗 / 排废。",
        "用「上一步 / 下一步」逐步推进，激活元件高亮黄色光环、相关管路发光、非激活部分淡化。",
        "场景会同步切换泵/阀状态，直观展示介质如何流动；退出时还原进入前的阀位。",
        "细节微调：演示中直接点画布上的阀/泵开关调整表达——微调跨步骤保留，点「💾 保存到本步」可固化进图纸，下次演示自动生效。",
        "高亮跟随流动：微调阀位后，新变为流动的管路自动发光，与场景种子高亮并存。",
        "自定义演示：面板点「⭐ 从工况新建演示」，勾选多个工况（按点选顺序编排步骤）即可生成专属演示流程，随图纸保存，可删除。",
        "视图聚焦：「只看主链」淡出二级系统与安全附件，只留主流程；分区（供水/咖啡/蒸汽奶路/排废）可单独显隐、改色、重命名。演示中固定使用教学符号，讲解语言与画面一致。",
      ]},
      { type: "tip", text: "若当前图纸与内置场景不匹配，面板会提示并可一键加载对应示例图。" },
    ],
  },
  {
    id: "fault",
    icon: "🔧",
    title: "故障模拟与故障码",
    blocks: [
      { type: "p", text: "两条故障教学路径：元件级故障注入（改变真实流动）与故障码库（E01 编码 + 信号 + 排查步骤），可配合使用。" },
      { type: "list", items: [
        "元件级注入：选中泵/阀/管路，在右侧「故障模拟」面板设置——泵卡死（前后管路停流）、阀卡开/卡关、管路堵塞；故障元件显示红色「!」标记。",
        "故障模式：工具栏「⚠ 故障」进入专属工作现场（拓扑锁定）——新建故障码、绑定关联水路（画布高亮）、配置逐步排查线索。",
        "检测规则：为故障码配置信号阈值、保持时间与滞回，用面板内的虚拟信号模拟触发；这是教学数值，不是实机读数。",
        "代码库管理：故障码随图纸保存，支持导入/导出代码库与 Markdown 故障报告。",
      ]},
      { type: "tip", text: "典型教学流程：注入一个阀卡关 → 回路诊断看到停流因果链 → 切到故障模式按步骤排查 → 导出报告。" },
    ],
  },
  {
    id: "export",
    icon: "📤",
    title: "导出与分享",
    blocks: [
      { type: "list", items: [
        "PNG / JPG：高清位图。",
        "SVG：矢量图，可无限缩放、二次编辑。",
        "GIF：含流动动画的动态图。",
        "PDF：适合打印的文档。",
        "JSON：工程文件，可再次打开编辑。",
        "BOM 清单：一键导出设备编号清单（Markdown）。",
        "诊断报告：诊断面板右上角「⬇ MD」一键导出 Markdown 报告（结构问题、工况提示、因果链、出口状态）。",
        "机型包：图纸 + 场景 + 元数据一次打包，导入即用。",
        "分享：生成分享码/链接，接收方在 FluidPath 中「导入分享码」即可打开。",
        "符号风格：导出对话框可选「跟随图纸 / 教学 / 工程」——给海外工程师的交付图一键切换工程符号，导出期间临时生效、不改动图纸设置。",
        "导出预览：点 PNG/JPG/SVG/PDF/GIF 会先打开预览对话框——可调背景/透明、缩放倍率、边界留白、文字增强、状态徽标样式、图例（介质/管径/状态颜色说明）、标题水印等，所见即所得。",
      ]},
      { type: "tip", text: "Ctrl+E 按上次格式快速导出。" },
    ],
  },
  {
    id: "shortcuts",
    icon: "⌨️",
    title: "快捷键",
    blocks: [
      { type: "list", items: [
        "Ctrl+Z / Ctrl+Y — 撤销 / 重做",
        "Ctrl+D — 原位复制；Ctrl+C / Ctrl+V — 复制 / 粘贴",
        "Ctrl+G / Ctrl+Shift+G — 成组 / 解散组",
        "Ctrl+F — 搜索并定位元件；? — 快捷键帮助",
        "Ctrl+E — 快速导出；Ctrl+Shift+T — 切换明暗主题",
        "方向键 — 微调 1px；Shift+方向键 — 10px",
        "Esc — 关闭右键菜单、搜索等命令浮层",
        "Delete / Backspace — 删除选中",
      ]},
      { type: "tip", text: "工具栏「快捷键」可自定义绑定；方向键微调为固定快捷键。" },
    ],
  },
];

/** English display copy is kept separate from the source-language guide so the
 * tutorial can follow the active UI language without mutating persisted data. */
export const GUIDE_EN: Record<string, GuideSection> = {
  quickstart: {
    id: "quickstart", icon: "🚀", title: "Quick start", titleEn: "Quick start",
    blocks: [
      { type: "p", text: "FluidPath Studio is a liquid-path teaching workspace for drawing, inspecting, presenting and validating equipment circuits. It models qualitative flow; it is not a CFD solver or a substitute for machine commissioning." },
      { type: "list", items: [
        "Fastest start: click \"✨ Intelligent drawing\" in the toolbar — describe the machine in one sentence (e.g. \"dual-boiler coffee machine with milk pump and steam wand\") or pick a template card, and get an editable drawing with structure and engineering checks in three steps.",
        "Open or create: use New for a blank drawing, or Open JSON to load an existing project.",
        "Build the topology: drag a component from the library, then drag one port to another. Keep tees explicit; a crossing line is not a connection.",
        "Set the state: turn pumps on/off and choose valve paths. These are engineering states, separate from teaching-only display overrides.",
        "Present: open Presentation, choose a matching scenario, and step through the highlighted flow. Missing optional hardware should not be invented.",
        "Three work modes: Edit / Demo / Fault in the toolbar switch the working surface — drawing, presenting (side panels collapse) and fault-drill rehearsal; topology editing is locked in Demo and Fault.",
        "Save conditions: use Conditions to capture named pump/valve combinations for repeatable demonstrations and troubleshooting.",
        "Validate: select critical pipes as Must flow or Must stop, save the case, then Run all. A failure is evidence to inspect the drawing or rule.",
        "Simulate faults: use Fault codes or the Inspector to inject a seized pump, stuck valve, blocked pipe or custom signal threshold.",
        "Export and share: export PNG/SVG/PDF/JSON, a Markdown diagnosis report, or a machine pack containing the drawing, scenarios and validations.",
        "Auto-save: desktop same-folder auto-save writes a backup copy every minute; browser mode downloads a backup and never silently overwrites the source. The status bar always shows local vs file save state.",
        "Language: use EN / 中 in the toolbar. The UI and guide change immediately; user-authored drawing labels remain unchanged.",
        "Recommended loop: inspect structure -> present a scenario -> run validation -> export the evidence. Do not use force-flow/force-stop to make an engineering case pass.",
      ]},
      { type: "tip", text: "For a first run, open a known JSON, fit the canvas, inspect the pump-to-outlet path, run the saved validations, then switch to Presentation." },
    ],
  },
  smart: {
    id: "smart", icon: "✨", title: "Intelligent drawing", titleEn: "Intelligent drawing",
    blocks: [
      { type: "p", text: "Intelligent drawing turns \"what I want to draw\" into an editable starter drawing: scenario templates, a few options and engineering checks — no protocol jargon, and the result stays fully editable." },
      { type: "list", items: [
        "Three steps: pick a scene (describe it in plain words) -> configure -> preview and insert. The preview page shows live structure and engineering checks.",
        "Seven machine templates: water, coffee brew, thermoblock, milk, steam, combo and a dual-boiler skeleton — each ships safety accessories (safety valve, OPV, pump check valve, gauges) and recommended conditions (Idle plus runnable states).",
        "Continue building: after insert, the side panel tells you what the drawing still needs — zone visibility, main-chain focus, clickable engineering findings, quick blocks (steam wand, cleaning bypass, drain branch…) and keyword adding.",
        "Smart tidy: \"fix overlaps only, keep manual routes\" re-routes only visually overlapping pipes; \"reroute all\" clears manual waypoints (with confirmation and undo).",
        "Safety boundary: intelligent drawing produces editable drawings, never engineering PASS claims; free-text understanding is scoped to coffee-machine fluid paths and connects to no external model.",
      ]},
      { type: "tip", text: "After inserting, use \"Main chain only\" to read the primary flow first, then review zone by zone; batch-edit anything off with the Inspector." },
    ],
  },
  library: {
    id: "library", icon: "🧰", title: "Component library", titleEn: "Component library",
    blocks: [
      { type: "p", text: "The library groups containers, power, controls, process parts, connectors, outlets, sensors and notes. Each component has stable identity and named ports." },
      { type: "list", items: [
        "Drag an item to the canvas or double-click it to add it.",
        "Search by the displayed name; collapse groups when the canvas needs more room.",
        "Use the Inspector to edit labels, ports, state, faults and presentation properties.",
        "Two symbol expressions: switch Teaching/Engineering in the Inspector — teaching symbols for learners, monochrome ISO/ISA-inspired engineering symbols for international deliverables; the library always shows teaching symbols for easy picking.",
      ]},
      { type: "tip", text: "Choose a real component type before editing its appearance: geometry is not a substitute for port semantics." },
    ],
  },
  canvas: {
    id: "canvas", icon: "🖱️", title: "Canvas operations", titleEn: "Canvas operations",
    blocks: [{ type: "list", items: [
      "Pan with Space/middle/right drag; zoom with the wheel, +/- or Fit.",
      "Click to select, Shift-click to add, or drag a selection box for multiple objects.",
      "Move, resize and rotate nodes; snapping and alignment guides are controlled in Project settings.",
      "Use multi-select actions to align, distribute, mirror or batch-edit objects.",
      "Use the minimap to navigate large drawings.",
      "Locate: Ctrl+F searches components; Enter or clicking a result glides the viewport to the target and blinks it. Command popups (context menu, search) are mutually exclusive; Esc closes them.",
    ]}, { type: "tip", text: "Stable IDs and port endpoints carry the engineering meaning; screen position only affects presentation." }],
  },
  pipes: {
    id: "pipes", icon: "🔗", title: "Pipe editing", titleEn: "Pipe editing",
    blocks: [
      { type: "p", text: "Pipes express a connection between two ports and carry medium, direction, diameter and visual flow properties." },
      { type: "list", items: [
        "Drag port-to-port to create a pipe; use a tee for a branch. One port cannot be occupied twice.",
        "The router avoids components. Add or move waypoints when the drawing needs a deliberate route.",
        "Smart tidy: re-route only visually overlapping pipes while keeping manual routes; full re-route clears manual waypoints and asks first.",
        "Drag endpoint handles to reconnect a pipe; record intentional reconnections in the drawing change log.",
        "Edit medium, material, diameter, color, direction, speed and particle density in the Inspector.",
        "Bridge crossings make non-connections visible; they do not change topology.",
      ]},
      { type: "tip", text: "A visual line is not proof of flow. Use state and validation to check whether the engineering path is actually open." },
    ],
  },
  "fluid-check": {
    id: "fluid-check", icon: "🧪", title: "Medium and diagnostics", titleEn: "Medium and diagnostics",
    blocks: [
      { type: "p", text: "Diagnostics combine topology, port semantics, medium hints, pump/valve state and fault state. They are qualitative engineering checks, not measured pressure or temperature." },
      { type: "list", items: [
        "Orange warnings identify medium conflicts or outlet conditions that need review.",
        "Circuit diagnostics checks isolated components, duplicate port connections, medium conflicts and faults.",
        "Particle density and pressure-domain shading are visual aids; they never override engineering state.",
        "The status bar summarizes structural errors and operating-condition hints.",
      ]},
      { type: "tip", text: "When a result looks wrong, inspect the stop-cause chain and the relevant ports before changing colors or animation." },
    ],
  },
  demo: {
    id: "demo", icon: "🎬", title: "Presentation mode", titleEn: "Presentation mode",
    blocks: [
      { type: "p", text: "Presentation mode turns a saved scenario into a guided explanation. It highlights the active components and pipes while locking topology edits." },
      { type: "list", items: [
        "Open Presentation and choose a scenario supported by the current drawing; unavailable optional scenarios are hidden.",
        "Use Previous/Next to explain each step. Pump and valve states are restored when the presentation ends.",
        "Small teaching adjustments may be saved to a step, but they must not be confused with engineering overrides.",
        "Create a custom presentation from named Conditions when the machine needs a local procedure.",
        "View focus: \"Main chain only\" dims secondary systems and safety accessories; zones can be toggled, recolored and renamed. Presentation always renders teaching symbols so the spoken language matches the picture.",
      ]},
      { type: "tip", text: "Presentation is for explaining a known state. Use Validation when the goal is to prove a rule across states." },
    ],
  },
  fault: {
    id: "fault", icon: "🔧", title: "Fault simulation and fault codes", titleEn: "Fault simulation and fault codes",
    blocks: [
      { type: "p", text: "Two fault-teaching paths work together: component-level fault injection (changes the real flow) and the fault-code library (E01 codes with signals and troubleshooting steps)." },
      { type: "list", items: [
        "Component injection: select a pump, valve or pipe and set the fault in the Inspector — seized pump, valve stuck open/closed, blocked pipe; faulty parts show a red marker.",
        "Fault mode: the ⚠ Fault toolbar mode opens a dedicated surface (topology locked) to create fault codes, bind related circuits for highlighting and write step-by-step troubleshooting notes.",
        "Detection rules: attach signal thresholds, hold times and hysteresis to a code and trigger it with the built-in signal simulator — teaching values, not live machine readings.",
        "Code libraries travel with the drawing and support import/export plus a Markdown fault report.",
      ]},
      { type: "tip", text: "Typical drill: inject a stuck-closed valve, read the stop-cause chain in diagnostics, then rehearse the troubleshooting steps in Fault mode and export the report." },
    ],
  },
  export: {
    id: "export", icon: "📤", title: "Export and share", titleEn: "Export and share",
    blocks: [{ type: "list", items: [
      "PNG/JPG for images; SVG for scalable vector output; PDF for printable documents.",
      "JSON preserves the editable drawing; a machine pack bundles drawing, scenarios, validations and metadata.",
      "BOM exports the component list; diagnosis/validation exports Markdown with causes, outlets, pass/fail and failed pipes.",
      "Share codes let another FluidPath workspace open the drawing without changing the source file.",
      "Symbol style: the export dialog offers follow-drawing / teaching / engineering — switch international deliverables to engineering symbols for one export without touching the drawing.",
      "Export cleanup controls component labels, pipe labels, medium labels, color and status overlays.",
    ]}, { type: "tip", text: "Run validation before exporting evidence so the report records the actual result instead of a manually staged animation." }],
  },
  shortcuts: {
    id: "shortcuts", icon: "⌨️", title: "Shortcuts", titleEn: "Shortcuts",
    blocks: [{ type: "list", items: [
      "Ctrl/Cmd+Z and Ctrl/Cmd+Y: undo and redo.",
      "Ctrl/Cmd+D: duplicate; Ctrl/Cmd+C/V: copy and paste.",
      "Ctrl/Cmd+G and Ctrl/Cmd+Shift+G: group and ungroup.",
      "Ctrl/Cmd+F: search; ?: shortcut help; Delete/Backspace: remove selection.",
      "Ctrl/Cmd+E: quick export; arrow keys nudge; Shift+arrow nudges by 10px.",
      "Esc: close the context menu, search or other command popups.",
    ]}, { type: "tip", text: "Use the toolbar Shortcuts panel to review or customize bindings." }],
  },
};
