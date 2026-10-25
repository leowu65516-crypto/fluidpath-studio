# FluidPath Studio & CAYE 全自动咖啡机 · 完全参考手册

> 本文档是理解 **FluidPath Studio 应用** 与 **CAYE 咖啡机图纸（`/Users/leo/Desktop/BCMTS.json`）** 的第一参考：应用架构、技术栈、流体仿真引擎原理、咖啡机整机原理（做咖啡 / 热牛奶 / 蒸汽 / 热水 / 清洗 / 排废），以及操作与维护纪律。
> 最后更新：2026-10-25（v1.32.1）。版本、测试、Schema、AI 边界和已知限制以 [`docs/current-state.md`](docs/current-state.md) 为准。

---

## 1. 总览

**FluidPath Studio** 是一个液路动态示意图编辑器（教学/演示用途），用于绘制全自动咖啡机的水路、奶路、蒸汽、排废系统，并**实时仿真"停流 / 流动"状态**：改阀位、开泵关泵，画面上的管路立即对应变化。

- 项目路径：`/Users/leo/Documents/Fluidpath studio`
- **已 git 初始化**（2026-08-18 起，每个版本一个 commit，历史可回退）；改前仍建议 `cp` 备份到 `/tmp`
- 技术栈：Electron（主进程 CJS）+ React 18 + TypeScript（strict）+ Vite 5 + Vitest（jsdom）
- 打包：electron-builder（未签名，arm64）；当前产物以 `release/` 中的最新版本为准
- **网页版（已上线）**：https://leowu65516-crypto.github.io/fluidpath-studio/ （密码门固定密码 800866，见 §9）
- Node 路径：`/Users/leo/.workbuddy/binaries/node/versions/22.22.2/bin`（**每条命令都要先 `export PATH=.../bin:$PATH`**）

### 关键文件地图

| 文件 | 作用 |
|---|---|
| `electron/main.cjs` / `electron/preload.cjs` | Electron 主进程 / 预加载（窗口、文件读写、菜单） |
| `src/types.ts` | 数据模型：Diagram / DiagramNode / Port / Pipe、全部节点与流体枚举 |
| `src/geometry.ts` | **核心**：流体仿真引擎（停流传播 + 需求域），见 §3 |
| `src/store.ts` | 状态管理（`useSyncExternalStore`）、撤销/重做、场景演示状态机（角色自适应+快照还原） |
| `src/export.ts` | `parseDiagramJSON`（加载图纸）、SVG/PNG/JPG/PDF 导出、分享链接 |
| `src/scenarios.ts` | 内置场景演示：冲泡咖啡 / 热牛奶 / 美式咖啡 / 热水杆 / 牛奶清洗 / 排废（角色匹配定义 + `resolveScenarioRoles`） |
| `src/knowledge.ts` | 元件教学知识库（选中元件时右侧面板显示作用/原理/注意点） |
| `src/advice.ts` | **回路诊断唯一数据源**：分层建议（结构/工况）+ 停流因果链 + 一键修复动作 |
| `src/diagnostics.ts` | 诊断报告的只读派生视图（状态栏徽章计数，只统计结构问题） |
| `src/bom.ts` | BOM/元件清单导出（Markdown） |
| `src/fluidRules.ts` | 流体类型规则检查（如奶路混入蒸汽） |
| `src/presets.ts` | **预设状态原语**（PresetState + 快照/应用/差异），演示步骤与工况快照共用 |
| `src/functionalChain.ts` | 元件→整机功能链追踪（按当前阀位），画布高亮 + Inspector 展示 |
| `src/version.ts` | 版本号 APP_VERSION + 版本历史 CHANGELOG（预留） |
| `docs/ai-protocol.md` | `fluidpath.ai-operations 0.2-draft` 外部 AI 协议规范：包络、组件/介质目录、5 类操作、错误语义、完整示例与提示词模板 |
| `src/smart-draw/` | 智能绘图：模板（水路/咖啡/奶路/蒸汽/组合）、参数化 build、块定义、咖啡机领域自由文本解析 |
| `src/components/SmartDrawingWizard.tsx` / `SmartDrawingPanel.tsx` | 三步生成向导（居中 Modal）与生成后的「继续完善」右栏（功能块/接点/关键词/检查/自动布线） |
| `src/components/SaveStatusPill.tsx` / `SaveNudge.tsx` | 保存状态胶囊（本机草稿 vs 文件保存）与首次修改/插入/导出的保存教练 |
| `src/components/` | UI：CanvasView（画布）、Inspector（属性）、Toolbar、ScenarioPanel、ConditionPanel（工况）、LayerPanel（图层）、PromptDialog（应用内输入弹窗）、AdvicePanel（诊断）、MiniMap、Library 等 24+ 组件 |
| `src/__tests__/` | 71 个测试文件 / 481 通过 + 4 跳过（共 485），见 §6 |
| `/Users/leo/Desktop/Fluidpath studio/` | 机型图纸与协议文档目录（含统超定制系列图纸、图纸规范 v0.2 及增补），见 §4.7 |
| `BCMTS.json`（项目根） | CAYE 咖啡机图纸**当前快照**（63 节点 / 74 管路），供回归测试 import |
| `/Users/leo/Desktop/BCMTS.json` | 用户实际使用的图纸（与项目根快照保持同步） |
| `BCTMS.json`（项目根） | 另一台机型 BCTMS 快照（62/70，供 flow-isolation 测试） |
| `MSY2.json`（项目根） | Smart Y 结构与介质检查快照（62/71） |

### 备份清单

- `BCMTS.backup-20260817-pre-reflux.json` — 加回流管之前的 BCMTS
- `BCTMS.backup-20260817.json`、`BCTMS.backup-pre-coffeefix.json` — BCTMS 历次备份

---

## 2. 应用架构

### 2.1 进程结构

- **主进程** `electron/main.cjs`：创建 BrowserWindow、打开/保存文件对话框、错误弹窗。加载的是 `dist/index.html`（**必须先 `npm run build`**）。
- **预加载** `electron/preload.cjs`：暴露受限的文件/对话框桥接。
- **渲染进程**：React 应用，入口 `src/main.tsx` → `src/App.tsx`。

### 2.2 数据模型（src/types.ts）

- `Diagram { nodes: DiagramNode[]; pipes: Pipe[]; settings }`
- `DiagramNode`：`id / type / label / x / y / w / h / ports / valveState / valvePath / pumpOn / disabled / fault / forceFlow...`
  - `NodeType` 全集约 46 种：`tank`、`hotWaterBoiler`、`steamBoiler`、`pump`、`milkPump`、`solenoid2`（两通电磁阀）、`solenoid3`（三通电磁阀）、`checkValve`（单向阀）、`safetyValve`、`opv`、`metalFilter`、`tee`（三通/接头）、`flowMeter`、`pressureGauge`、`inlet`、`outlet`、`coffeeOutlet`、`milkOutlet`、`hotWaterOutlet`、`hotWaterWand`、`steamWand`、`groupHead`、`brewChamber`（冲泡缸：下进水上出咖啡）、`cross`（十字四通）、`heatExchanger`、`powderMixer`、`shape`（自定义图形）……
  - 阀状态：`solenoid2.valveState = "open" | "closed"`；`solenoid3.valvePath = "A" | "B" | "off"`；泵：`pumpOn: boolean`。
  - 故障标记：`fault = "pumpStuck" | "valveStuckOpen" | "valveStuckClosed"`；管路 `pipeBlocked`。
- `Pipe`：`id / label / fluidType / fromPortId / toPortId / direction("forward"|"reverse") / points(折线) / visualDiameter / fluidColor / animated / showArrow / forceFlow / forceStop / disabled / fault`
  - **管路以端口连接**（不是节点）：`fromPortId`/`toPortId` 指向节点上的端口 id。
  - `fluidType`：`steam / coldWater / hotWater / coffee / air / milk / coldMilk / hotMilk / coldMilkFoam / hotMilkFoam / wasteLiquid / cleanWaste(清洗废液) / custom`
- `Port`：`id / position(top|right|bottom|left) / direction("in"|"out"|"bidirectional")`

### 2.3 状态与交互（src/store.ts）

- 单一 store + `useSyncExternalStore`；`updateDiagram(mutator)` 支持撤销/重做（history 栈）。
- **场景演示（角色自适应）**：`src/scenarios.ts` 当前提供「冲泡咖啡」「热牛奶」「美式咖啡」「热水杆」「牛奶清洗」「排废」六个内置场景（半自动/全自动已删除）。场景步骤引用**元件角色**（waterPump / brewV3 / milkPump / cleanV3…），由 `resolveScenarioRoles(diagram)` 按「类型 + 标签关键词」在**当前加载的图纸**中实时解析元件；缺少对应元件的机器（如无奶泵）会自动隐藏不适用场景，不会虚构元件。完整步骤与可用性规则以 `src/scenarios.ts` 为准。
- 演示机制（store.ts `enterScenario`/`exitScenario`）：
  1. 首次进入**快照**当前图纸，并把所有泵/阀复位到中性基线（泵停、两通关、三通 off）——演示不被图纸存档阀位干扰；
  2. 按步骤累积应用阀/泵状态；
  3. 高亮节点 = 种子元件 + **经接头类元件（tee/滤网/单向阀/流量计…）自动向外补齐**，高亮管 = 两端都在激活集内——链条中间段不再被淡化漏管；
  4. 退出时**还原进入前的图纸快照**（不再把全图打成全开污染用户阀位）。
- 管路标签自动命名 `管路 N`（**逻辑不依赖标签值**，靠 id/端口拓扑）。

#### 工况快照（workConditions / ConditionPanel）

- 工况 = **记住一套阀门/泵的「开/关」状态并起个名**，之后一键「恢复」变回。存在 `settings.workConditions`，**随图纸 JSON / 分享码一起保存**（不是单独文件）。
- 面板三步：① 图上摆好开关 → ② 输入名字点「记住」→ ③ 点方案「▶ 恢复」。
- **差异对比**：切换工况只高亮本次真正变化的元件（橙色闪烁）+ 变化摘要 toast；一致时提示"没有变化"。`presets.diffStateIds`。
- 演示「冲泡咖啡」步骤可一键「存为工况」。

#### 图层（layers）

- 每节点有 `layerId`；新建元件自动归入当前图层。隐藏图层 → 该层节点与其相连管路不显示。
- 图层面板：👁 显示/隐藏 · 点名=当前图层 · 点数字=选中本层并定位 · 双击=改名 · ×=删除（本层元件归入剩余图层）。

#### 自动保存 / 崩溃恢复（版本历史）

- 编辑后 800ms 防抖自动保存到 localStorage（按图纸 id 隔离，**最多 5 份版本历史**）；退出前 beforeunload 强制落盘。
- 启动检测到比最近保存更新的备份 → 恢复横幅（恢复最新 / 查看历史 / 丢弃）。

#### 元件→整机功能链（functionalChain.ts）

- 选中单个元件/管路 → 按**当前阀位/泵态**追踪所在功能链（上游回溯到真源、下游到出口，关阀/停泵处截断），画布软蓝高亮 + Inspector「🔗 所在功能链」路径摘要。

#### 预设状态原语（presets.ts）

- 演示步骤、工况快照、模板共用同一套 `PresetState`（快照/应用/差异），只保留一份逻辑，避免漂移。

### 2.4 图纸 JSON 格式要点

- 原始 JSON：顶层 `{ nodes: [...], pipes: [...] }`；节点用 `type` 字段（不是 `kind`）；管路用 `fromPortId`/`toPortId`。
- `parseDiagramJSON`（src/export.ts）会归一化：补默认 `kind/type`、推断缺失端口方向、生成规范结构。**测试里用 `parseDiagramJSON(JSON.stringify(raw))` 还原。**

### 2.5 回路诊断（advice.ts / diagnostics.ts / AdvicePanel）

- **分层模型**：`structure`（结构问题：端口多连、单向阀装反、孤立/游离、介质冲突——永远有效，参与状态栏徽章计数）与 `state`（工况提示：泵停/阀关/出液口停流/故障模拟——教学演示中多为有意为之，面板默认折叠、不参与徽章）。
- **停流因果链** `traceStopCause(pipe, diagram)`：沿供液侧递归（直通件跨端口、阀/泵沿入侧端口）定位根因元件（关阀/停泵/堵管/禁用），出液口停流建议据此给出「打开阀门/启动泵」修复，**已删除「强制流动」危险建议**；带故障标记的元件不给出误导性修复。
- 面板：**总览视图**（结构/工况计数卡、出口流停、泵/锅炉状态，一键返回总览）↔ **问题列表**（结构/工况分组折叠、严重度筛选、序号列表、**每条附「为什么」教学解释**、悬停/点击 → 画布闪烁定位、**停流类沿因果链点亮橙色路径** chain-glow、一键修改 / 确认 / 撤回修改）；演示进行中工况提示自动折叠。状态栏徽章可点击打开面板；**场景步骤切换时本步新增元件自动闪烁定位**（store.blinkElements，2.4s 自动熄灭）。
- Inspector：选中停流管路时显示「🔍 停流原因」块与根因链（根因：泵 → 管 → …）。

---
---

## 3. 流体仿真引擎原理（src/geometry.ts）——最重要的领域知识

### 3.1 判定总览：一根管为何"流 / 停"

```
pipeEffectiveDisabled(pipe) 依次短路：
  forceFlow（临时强制流）            → 流
  forceStop（临时强制停）            → 停
  disabled / fault=pipeBlocked       → 停
  _cachedDisabled（BFS 相位层命中）   → 停
  递归兜底层（供液侧判定）             → 停（若判停）
  需求域（_demand 不含该管）          → 停（供液到达但下游全关 = 死路）
  否则                                → 流
```

- 缓存由 `setCachedPipes(pipes, nodes)` 触发计算：`_cachedDisabled = computeDisabledPipes(...)`（BFS 层）+ `_demand = computeDemandPipes(...)`（需求域）。**节点状态变化后必须重算缓存。**

### 3.2 BFS 相位模型（computeDisabledPipes）

| 相位 | 种子 | 传播方向 | 语义 |
|---|---|---|---|
| `suck` | 停泵 in 口管 | 逆流向（向上游追溯） | 关泵 → 供液链停；可逆向穿单向元件 |
| `push` | 停泵 out 口管 | 顺流向（向下游） | 不穿任何泵；不逆穿单向件（须经 in 口进入） |
| `both` | disabled 节点 | 双向；在分支接头（三通/四通）处停止 | 工程禁用只断它所在的那条支路，不把同一接头上的其他支路一起判停 |

- 种子规则：`solenoid2` 关闭只停**直接出侧管**（保基线，不扩散）；`solenoid3` off/非激活支路 → `isolatedDisabled`（只停本身不扩散）；管路 fault 不进 BFS 种子（递归层直接判该管）。
- **suck 边界三规则**（防多泵交叉污染）：
  1. 到达泵节点：任何相位不穿越（泵 = 独立动力源/断点）。
  2. suck 到达锅炉类节点：不逆行穿越（下游停流由 push 顺向负责）。
  3. **压力域护栏**：预计算所有运行泵出侧顺流向可达管路集合，suck 不得污染压力域内管路。

### 3.3 递归兜底层（pipeEffectiveDisabledRecursive）

- 三通/直通节点 **AND 汇流**：出侧管仅当**全部**入侧管停流才停（任一入侧有供即供）。
- **储液罐（tank）按液源处理**（1.29.2）：罐出侧管**不因入侧全停而判停**（如罐入侧只有一根关闭的润湿阀时，出奶管仍可流）；是否流动由需求域（下游开放去处）与阀态决定。与 §3.4 tank 兼作“回流终点+奶源”、知识库“稳定供给”语义一致。历史踩坑：旧行为把 tank 当普通直通件，导致新图纸（如 Smart X BCM2TS）奶泵抽奶时整条奶路显示停流。
- 泵/阀出侧依赖入侧供液（`upstreamPortsState`，汇流语义）。**三通（1.29.3）**：激活出侧按**全部入侧口**判定——任一路有来流即出侧有介质，全部有管入侧口断供才判停（支持“咖啡+热水汇集”两进一出用法；单入侧阀行为不变）。off 档时多入侧口的停流隔离一并处理。
- **换热器（heatExchanger）双通道隔离**（1.29.3）：对置端口两两成对形成独立通道（left↔right、top↔bottom，优先“入配出”）；出侧管的供液只由**同通道**另一端的入侧管决定——另一条通道（如水侧）不得串供。停流相位、压力域、需求域三层同步按通道隔离（见 §3.4）。背景：低温盘管＝两条金属管盘绕的换热器，两侧介质互不混合（知识库同源）。
- `solenoid3` 端口推断：优先 `direction`，缺失按位置（left=in, right=A, bottom=B）；`outA = position right ?? outPorts[0]`，`outB = bottom ?? outPorts[1]`。
- `direction="reverse"` 管路：有效流向与存储方向相反（from/to 对调），递归层入侧分类与 curIsOut 都尊重有效流向。
- 深度护栏：visited > 200 返回不判停（防环回栈溢出）。

### 3.4 需求域（computeDemandPipes）——"下游有没有开放去处"

- **需求根（sink）** `DEMAND_SINK_TYPES`：`boiler / hotWaterBoiler / steamBoiler / coffeeOutlet / milkOutlet / hotWaterOutlet / hotWaterWand / steamWand / outlet / tank / brewChamber`，外加标签含「排废」或「冲泡」的 shape（冲泡缸/自定义图形 = 萃取消费端）、运行中的泵（吸入口）。
- **源/动力边界** `DEMAND_BOUNDARY_TYPES`：`pump / milkPump / tank / pressureTank / syrupBottle / inlet / boiler类`（需求倒推不穿越）。
- **算法：按需求根独立 BFS，取并集。** 从 sink 逆流向倒推，穿越门控：两通阀须开、三通仅激活支路、泵须运行、单向件顺向；到达边界即停。
- **每根树跳过「根自身作为上游源」的回环管**（`e.u.node.id === root.id && DEMAND_BOUNDARY_TYPES`）：tank 既是回流终点又是奶源，若不跳过，回流需求会经 回流管→三通→出奶管(68)→tank 回环把出奶管拉进需求域造成假流。该管仍可由其他根（如牛奶出口）的需求树正常拉入，正常出奶不受影响。
- **tank 作为 sink 的意义**：清洗/润湿水以储液罐为合法回流终点，回流管得以显示流动。
- **换热器通道隔离**（1.29.3）：需求倒推进入换热器后只在**同通道**内继续（按到达端口找配对端口），另一通道的管路不会被本通道需求拉入（如咖啡出口需求不会把水侧进管拉进需求域）。

### 3.5 门控规则速查

| 元件 | 放流条件 |
|---|---|
| 水泵 / 奶泵 | `pumpOn === true`（`pumpEffectiveOn`，含 fault 卡死判定） |
| 两通电磁阀 / 脉冲空气阀 | `valveState === "open"`（`valveEffectiveOpen`）；脉冲空气阀只控制空气支路 |
| 三通电磁阀 | `valvePath === "A"/"B"` 且该支路为激活出侧；in 侧供液管任一激活支路即可 |
| 单向阀 | 仅顺向（有效流向由 edgeOf 保证） |
| 直通/三通/容器/罐 | 放行（不拦截） |

### 3.6 诊断技巧（实战验证有效）

- **分层归因**：`computeDisabledPipes`（BFS 集合）vs `pipeEffectiveDisabled`（全集）→ 定位停流来自哪层。
- **逐段链式评估**：从源端逐管评估，第一个 ⛔ 即断点。
- **对照实验**：泵开/关、阀 A/B 切换对比 BFS 集合差异；备份文件 vs 当前文件 diff。
- **临时插桩**：在 BFS queue.push 处加 console.log（node + carrier），追传播路径，用完即删。
- **注意**：`solenoid3` 的状态字段是 `valvePath`（不是 `valveState`），赋错字段静默无效。

### 3.7 停流因果链归因（1.31.4）

- 归因分层：**本管自身 → 上游供液 → 下游去处**。先判断上游是否仍有来液；只要汇流点还有一条来路在供液，就不能把停流归咎于关闭的旁支阀（如快速冲洗阀）。
- 上游全断时才逐步追溯；多条来路都断时汇总所有不同的阻断点（`上游有 N 处阻断：①…；②…`），不再只报第一条支路。
- 下游直接断点（关闭的阀、停转的泵、工程禁用元件）优先于“上游无供液”话术；储液罐按液源处理，不报「上游无供液」。
- 两通阀关闭只说明“它所在的这条支路停流”，并联主路仍可由自己的泵/阀供液；判断出口停流根因要看因果链，不能只看某个阀关着。
- 辅助 API：`pipeSupplyBlocked`（纯供液、忽略需求域/停流缓存、只看上游端）、`pipeDemandBlocked`、`pipeInStopCache`。

---

### 3.8 智能绘图与保存状态（1.32.0）

- **入口**：工具栏「智能绘图」或空画布主按钮；生成阶段为居中 Modal（三步：选场景→选配置→预览插入），生成后右栏切到「继续完善」。高级协议面板保留在右栏底部「高级：结构化指令」。
- **模板**：`src/smart-draw/templates.ts` 5 个咖啡机液路模板（基础水路/咖啡冲泡/奶路/蒸汽/咖啡+奶路组合）；`smart-draw/builders.ts` 统一 `createNode`/`connect`，管路 `points: []` 交给 `autoRoute` 障碍物避让。模板默认待机（泵停/两通阀关/三通阀 off），自带「待机/萃取/奶路/蒸汽/排废」工况；已补泵出口单向阀、锅炉出口十字四通 + 压力表 + OPV/安全阀 + 泄压排废。
- **工程检查**：`smart-draw/engineering.ts` 检查蒸汽锅炉安全阀、锅炉压力表/OPV、泵出口单向阀、泵死堵、蒸汽注入奶路单向阀、奶路清洗、默认待机、缺少待机工况；向导预览与「继续完善」面板可展开并点击定位。
- **自由描述**：`smart-draw/intent.ts` 用咖啡机领域词典 + 否定词（无蒸汽/单奶罐）映射模板与选项；不做跨领域任意拓扑，也不调用外部模型。
- **插入**：`insertSmartDrawing(result, "replace"|"append", anchorPortId?, medium?)`；replace 用于空画布并标记 dirty；append 追加到右侧、一次撤销；有锚点时自动生成「智能连接」管。
- **继续完善**：块定义在 `smart-draw/blocks.ts`（蒸汽杆/清洗旁通/排废/奶路子系统）；`SmartBlockDialog` 列出可用接点；「自动布线全部管路」调用 `batchReroutePipes`。
- **保存模型**：`ui.dirty` 仍表示“未保存到文件”；`ui.lastAutosaveAt` 由 autosave 写入；`ui.fileSavedAt` 在 `markSaved` 写入。状态栏 `SaveStatusPill` 区分本机草稿/文件未保存/已保存；`SaveNudge` 在首次修改、插入、加块、导出后提示保存文件；关闭窗口只有 dirty 时才询问。
- **测试**：`smart-drawing.test.ts` 8 例（模板结构/选项/自由文本/追加撤销/锚点连接）、`save-ux.test.tsx` 2 例（状态胶囊/保存事件）、`ai-panel-activation.test.tsx` 3 例（入口/挂载/英文）。全量 70 文件/477 通过 + 4 跳过。

## 4. CAYE 咖啡机（BCMTS.json）完全解析

> 机型：四功能全自动咖啡机 —— 咖啡、牛奶、热水（热水杆/美式）、蒸汽（蒸汽杆/奶加热），含清洗/润湿/快冲/降温/排废辅助回路。
> 图纸规模：**63 节点 / 74 管路**；8 只三通电磁阀、9 只两通电磁阀、双泵（水泵+奶泵）、双锅炉（热水+蒸汽）、储液罐。

### 4.1 部件清单

| 类别 | 元件（标签） | 存档状态 |
|---|---|---|
| 动力 | 水泵 `n_ms7jr4mj2wu7sw` | 开 |
| 动力 | 奶泵（milkPump）`n_msvz8pbq71ca` | **关** |
| 锅炉 | 热水锅炉 `n_ms7jxr3dguuffi` | — |
| 锅炉 | 蒸汽锅炉 `n_ms7k2qjpyth9jc` | — |
| 罐 | 储液罐 `n_msw0gh0n7h3a`（双回流入口 p_reflux_in / p_reflux_in2） | — |
| 进水 | 进水口 `n_fix_inlet`、空气入口端 `n_msbymtbfmmltl3`（forceStop 禁用） | — |
| 两通阀 | 两通电磁阀（**进水总阀**）`n_ms7jsb6764ggp8` | 开 |
| 两通阀 | 常温水两通电磁阀（美式勾兑）`n_ms7jyyn0kfcobx` | 关 |
| 两通阀 | 锅炉蒸汽排废两通电磁阀 `n_ms7kxxr4x9iyye` | 关 |
| 两通阀 | 进奶两通电磁阀 `n_ms92b8rm798rfd` | 开 |
| 两通阀 | 旁通热水电磁阀 `n_msbwna7o9ske` | 开 |
| 两通阀 | 蒸汽锅炉补水两通电磁阀 `n_msbxbxyeayob` | 开 |
| 两通阀 | 牛奶常温水润湿两通电磁阀 `n_msbyfj71l363q0` | 关 |
| 两通阀 | 常温快速冲洗两通电磁阀 `n_msbykiz9c83f14` | 关 |
| 两通阀 | 蒸汽锅炉降温两通电磁阀 `n_mscgzs5q8goc` | 关 |
| 三通阀 | 咖啡冲泡三通电磁阀 `n_ms7jyj8djmqrnd` | A |
| 三通阀 | 美式热水三通电磁阀 `n_ms7jykvnjrrpsi` | A |
| 三通阀 | 热水杆三通电磁阀 `n_ms7jz840mbho5m` | A |
| 三通阀 | 咖啡排废三通电磁阀 `n_ms7ksq2xg2m96s` | A |
| 三通阀 | 牛奶排废三通电磁阀 `n_ms91h2kcr16ehn` | A |
| 三通阀 | 牛奶清洗三通电磁阀 `n_ms91xxps4wsawx` | **A** |
| 三通阀 | 牛奶加热三通电磁阀 `n_msbx5rtiafzs` | off |
| 三通阀 | 蒸汽杆三通电磁阀 `n_msbx9j5qap9b` | off |
| 单向阀 | 水源单向阀 `n_ms7jtscc7uipv7`（进水口后） | — |
| 单向阀 | 牛奶加热单向阀 `n_msby18r21iozbv`（蒸汽注入奶路前） | — |
| 单向阀 | 快冲单向阀 `n_msbykruidm65ml`（快冲阀后） | — |
| 单向阀 | 空气单向阀 `n_msbyn4byoiv9fr`（forceStop 禁用） | — |
| 滤网 | 泵前滤网 `n_msvyy0jr6stw`、泵后滤网 `n_msvyx7ad6ns6` | — |
| 仪表 | 流量计 `n_ms7jwqfhcudv49`、供水压力表 `n_ms7jxeskfxsdzn`、蒸汽压力表 `n_ms7kqpl79cp0c3` | — |
| 安全 | 供水安全阀 `n_ms7k09s1oqr5bi`（管路2 forceStop）、蒸汽安全阀 `n_ms7kdhm1m31goj`（泄放口未接管） | — |
| 出口 | 咖啡出口 `n_ms7kjrfbg554uu`、牛奶出口 `n_ms91fm8kiq9nkv`、热水出口(杆) `n_ms7koeegloxby`、美式水出口 `n_ms8kmrswc1uan`、蒸汽杆 `n_ms7kfh4hus3q2b`、蒸汽排废出口 `n_msbxxzlutegtb8`、出口排废 `n_msbxji2uvegu` | — |
| 容器 | 冲泡缸（shape）`n_ms7kiabc84vfmg`、排废接口（shape）`n_msbxj99gpfe6` | — |

### 4.2 五大管网

**A. 冷水源与分配网**
```
进水口 → 水源进水管 → 单向阀 → 管路6 → 进水总阀(开) → 管路60 → 泵前滤网 → 管路59
  → 水泵 → 管路61 → 泵后滤网 → 管路62 → 分配三通
       ├─ 管路4 → 流量计 → 管路5 → 三通 → { 管路3 → 热水锅炉补水；供水压力 → 压力表；管路19 → … }
       ├─ 管路26 → 三通 → { 管路27 → 补水阀 → 管路25 → 蒸汽锅炉补水；管路52 → 润湿/快冲/降温支路 }
       └─ 管路2 → 供水安全阀（forceStop 禁用）
```
- 热水锅炉**常压补水**（无阀，靠进水总阀+水泵）；蒸汽锅炉补水有**补水阀**。
- 润湿/快冲/降温支路：管路52 → 三通 → { 管路54 → T型三通 → {管路40→润湿阀, 管路43→快冲阀}；管路53 → 降温阀 }。

**B. 热水网（热水锅炉出口，三路选择）**
```
热水锅炉 → 管路1 → 咖啡冲泡三通(A) → 管路8 → 冲泡缸                        （咖啡）
热水锅炉 → 管路9 → 牛奶清洗三通(B) → 管路12 → 热水杆三通
              ├─ (A) → 管路10 → 热水出口                                      （热水杆）
              └─ (B) → 管路7 → 美式热水三通(A) → 管路15 → 三通 → 管路18 → 美式水出口（美式）
                           美式热水三通(B) → 管路14 → 旁通热水阀 → 管路58 → 同一三通
                           常温水阀 → 管路16 → 同一三通（常温勾兑）
```
- 热水分配是**串联选择**：清洗阀 B 之后热水杆阀选 热水杆/美式，美式阀再选出口/旁通。三个热水出口**同时只能通一个**。

**C. 蒸汽网**
```
蒸汽锅炉 → 管路22 → 蒸汽杆三通(A) → 管路20 → 蒸汽杆                          （蒸汽杆）
蒸汽锅炉 → 管路21 → 牛奶加热三通(A) → 管路32 → 加热单向阀 → 管路33 → 奶路三通注入（热牛奶）
蒸汽锅炉 → 管路23 → 蒸汽压力表；管路24 → 蒸汽安全阀（泄放口未接）
蒸汽锅炉 → 管路11 → 排废侧三通（pipeBlocked，教学故障标记）
蒸汽杆三通(B) → 管路31 → 三通 → 管路66 → 蒸汽排废出口                        （冷凝/泄汽）
牛奶加热三通(B) → 管路67 → 同一三通 → 蒸汽排废出口
```

**D. 奶路与清洗/润湿/快冲/回流**
```
出奶：储液罐 → 管路68 → T型三通 → 管路41 → 进奶阀 → 管路49 → T型三通 → 管路50
      → T型三通(奶/快冲汇合) → 管路46 → 三通接头 → 管路63 → 奶泵 → 管路64
      → T型三通(奶/蒸汽汇合) → 管路34 → 牛奶排废三通(A) → 管路35 → 牛奶出口
热奶：蒸汽经 加热三通A → 32 → 33 在「管路64/34 之间」的 T 型三通注入奶路
清洗：热水锅炉 → 管路9 → 清洗三通(A) → 管路51 → T型三通 → 清洗热水回流管 → 储液罐
润湿：管路52 → 54 → T型三通 → 40 → 润湿阀 → 42 → T型三通 → 清洗回流管 → 储液罐
快冲：管路52 → 54 → T型三通 → 43 → 快冲阀 → 44 → 快冲单向阀 → 45 → 奶路汇合三通 → 奶泵
空气注气：空气入口端 → 48 → 单向阀 → 47 → 三通接头（forceStop 禁用，用户保留）
```
- 两条回流管（本方案新增）：`清洗回流管`（润湿水回罐，coldWater）接储液罐 `p_reflux_in`；`清洗热水回流管`（清洗热水回罐，hotWater）接 `p_reflux_in2`（两个独立回流入口，避免端口多连）。

**E. 排废网**
```
咖啡侧：冲泡缸 → 56 → 三通 → 57 → 咖啡排废三通(B) → 37 → 三通 → 39 → 汇合三通
奶侧：  奶泵 → 64 → 34 → 牛奶排废三通(B) → 36 → 三通 → 70 → 汇合三通
锅炉侧：降温水 55 → 三通 → 38 → 汇合三通（蒸汽锅炉排汽管路11 也汇于此）
汇合 → 管路28 → 锅炉蒸汽排废两通阀(须开) → 管路30 → 排废接口 → 管路29 → 出口排废
蒸汽冷凝：蒸汽杆三通B/加热三通B → 31/67 → 三通 → 66 → 蒸汽排废出口（独立于废液排废）
```

### 4.3 功能场景总表（引擎逐场景验证过）

| 场景 | 阀位编排 | 完整流动链 |
|---|---|---|
| **做咖啡** | 冲泡A + 咖啡排废A（+进水总阀开、水泵开） | 进水口→水源进水管→单向阀→6→进水总阀→60→滤网→59→水泵→61→滤网→62→4→流量计→5→3→热水锅炉→1→冲泡三通A→8→冲泡缸→56→57→咖啡排废A→17→咖啡出口 |
| **美式** | 清洗B + 热水杆B + 美式A（常温阀开 = 勾兑；旁通热水阀开 = 旁通） | 热水锅炉→9→清洗B→12→热水杆B→7→美式A→15→三通→18→美式水出口；常温阀→65/16 或 美式B→14→旁通阀→58 汇入同一三通 |
| **热水杆** | 清洗B + 热水杆A | 热水锅炉→9→清洗B→12→热水杆A→10→热水出口 |
| **热牛奶** | 奶泵开 + 进奶开 + 奶排废A（蒸汽混热：加热A） | 储液罐→68→41→进奶阀→49→50→46→63→奶泵→64→(33 蒸汽注入)→34→奶排废A→35→牛奶出口；蒸汽：锅炉→21→加热A→32→单向阀→33 |
| **蒸汽杆** | 蒸汽杆三通A | 蒸汽锅炉→22→蒸汽杆三通A→20→蒸汽杆 |
| **牛奶清洗** | 清洗A + 奶泵关 | 热水锅炉→9→清洗A→51→T型三通→清洗热水回流管→储液罐（热水倒灌奶路回罐溶化药丸） |
| **润湿** | 润湿阀开 + 进奶关 + 奶泵关 | 水泵→…→62→52→54→T型三通→40→润湿阀→42→T型三通→清洗回流管→储液罐（冷水反推回罐约2s） |
| **快冲** | 快冲阀开 + **奶泵开** | …→52→54→T型三通→43→快冲阀→44→单向阀→45→46→63→奶泵→64→34→奶排废A→35→牛奶出口（或奶排废B→36→排废） |
| **排废** | 咖啡排废B + 奶排废B + 蒸汽排废阀开（咖啡侧需冲泡A给料；奶侧需奶泵开） | 咖啡：冲泡缸→56→57→咖啡排废B→37→39；奶：64→34→奶排废B→36→70；降温/锅炉排汽→38 → 汇合→28→蒸汽排废阀→30→排废接口→29→出口排废 |
| **蒸汽锅炉补水** | 补水阀开（+进水总阀、水泵开） | 进水口→…→62→26→27→补水阀→25→蒸汽锅炉 |
| **蒸汽锅炉降温** | 降温阀开 + **蒸汽排废阀开** | …→62→52→53→降温阀→55→三通→38→28→蒸汽排废阀→30→排废接口→29→出口排废（冷水注入锅炉汽侧冷却，废液经排废阀泄走） |
| **蒸汽泄压/冷凝** | 蒸汽杆三通B 或 加热三通B | 22→蒸汽杆三通B→31→三通→66→蒸汽排废出口；21→加热三通B→67→同一三通→66 |

### 4.4 咖啡机工作原理串讲（教学叙述）

1. **供水**：市政水经进水口、单向阀、进水总阀进机；泵前滤网粗滤 → 水泵增压 → 泵后滤网精滤 → 分配三通分四路：热水锅炉补水（经流量计计量）、蒸汽锅炉补水（经补水阀）、润湿/快冲/降温支路、压力表与安全阀。
2. **热水锅炉**：补水入炉加热至萃取温度。热水有三条出路：① 咖啡（冲泡三通 A → 冲泡缸萃取 → 咖啡排废三通 A → 咖啡出口）；② 热水杆/美式（须先经**清洗三通 B**，再经热水杆三通选 A 热水杆 或 B 美式；美式三通 A 出热水、B 经旁通阀、可混常温水勾兑）。
3. **蒸汽锅炉**：补水阀开时进水，加热产生蒸汽。蒸汽出路：① 蒸汽杆三通 A → 蒸汽杆；② 牛奶加热三通 A → 加热单向阀 → 注入奶路加热牛奶；③ 各阀 B 位 → 蒸汽排废出口（冷凝泄放）。
4. **奶路**：储液罐 → 进奶阀 → 奶泵吸送 → 与蒸汽汇合加热 → 牛奶排废三通 A → 牛奶出口（B → 排废）。奶路单向阀（加热单向阀、快冲单向阀）保证蒸汽/冲洗水不错误逆流。
5. **清洗与冲洗**：清洗三通 A = 热水倒入奶路回罐溶化药丸；润湿阀 = 冷水经奶路三通回罐润湿管道；快冲阀 = 冷水经快冲单向阀进奶路，由奶泵打出冲洗奶路。
6. **排废**：三条排废支路（咖啡 B、奶 B、锅炉降温/排汽）汇合后统一经**锅炉蒸汽排废两通阀**（总闸）到排废接口、出口排废；蒸汽侧冷凝单独走蒸汽排废出口。

### 4.5 特殊标记与基线

- `forceStop`（用户明确保留）：管路2（供水安全阀支路）、管路47/48（空气注气路径）。
- `pipeBlocked`：管路11（蒸汽锅炉 → 排废三通，疑似故意埋的教学故障，**未确认前勿动**）。
- 两只安全阀泄放出口未接管路（用户决定不补）。
- **存档阀位就是基线显示**：当前存档 = 冲泡A + 咖啡排废A + 清洗A + 热水杆A + 进水总阀/进奶阀/旁通阀/补水阀开 + 奶泵关 → 基线显示：咖啡链通、清洗热水回流管流动（清洗A 的物理一致表现）、供水网全通、奶路因奶泵关而停。**改阀位会直接改变下次打开的基线，改前先确认用户意图。**

### 4.6 已知近似与注意事项（勿再过度工程）

1. **正常制奶时两条回流管仍显示流动**：tank 是无条件需求终点，奶泵开着时回流侧三通有供液，回流管在需求域内。已与用户确认接受，属引擎简化。
2. **快冲需要奶泵开**：奶泵关时快冲水到达奶泵死路（快冲单向阀挡回罐），引擎正确显示全停。
3. 排废场景中咖啡侧要有料（冲泡 A 给料）才会流动；排废总管受蒸汽排废阀总控。
4. 三通阀 A/B 端口位约定：left=in、right=A、bottom=B（牛奶排废阀端口镜像，引擎按 direction 推断已处理）。
5. **汇流保护（1.7 已修）**：BFS push 到达非定向汇流接头时，若存在另一条未停流的入侧管，不再把单一停流支路扩散到公共出管；递归层仍在所有入侧均停时判停。

### 4.7 统超定制系列图纸（X 修订版 / Y BCTM2）与阀位语义（2026-10-11）

- **系列位置**：桌面 `/Users/leo/Desktop/Fluidpath studio/`。`Smart X BCMT-统超定制-修订.json`（65 节点/74 管；用户 20:07 手工修订后的当前版）；`Smart Y BCTM2（统超定制）.json`（用户二次加工版，AI 初版 69/79 可由会话工作台 `build-y-bctm2.cjs` 重跑）。
- **定制核心（相对标准机型）**：①进水管改经低温盘管（进水口→盘管→单向阀→滤网）；②咖啡路插「汇流三通（缸+清洗/旁通水汇集）→ 盘管选择三通（A 直通 / B 进盘管）→ 低温盘管（咖啡通道）→ 咖啡排废阀 → 合流 Y → 咖啡出口」；③牛奶出口加两通阀（按机型）；④热水链按机型差异重排（hotWater 口径）。
- **引擎支撑（v1.29.3）**：换热器双通道隔离 + 三通汇流语义——规则与回归见 §3.3/§3.4 与测试 `heat-exchanger-channel` / `solenoid3-merge`；图纸协议对应条款见桌面《FluidPath-图纸规范与AI绘图协议-v0.2.md》§16（v0.2.2 增补）。
- **阀位语义提醒（易误操作点）**：单出路汇流阀（如咖啡汇流三通）三档中 **A=工作位、B=死位（无输出）、关=全关**；盘管选择阀 **A=直通（绕开盘管）、B=下路（进盘管）**；咖啡排废阀必须 A（出口方向）全链才通。画布节点下方 [A|关|B] 徽标可直接点选。排障先查这三处，再看上游供液（注水/泵）。
- **脉冲空气阀（2026-10-22）**：位于「空气入口 → 脉冲空气阀 → 单向阀 → 奶泵前汇流三通」旁支，只控制进气量。工程禁用或阀关闭只停这条空气支路，**不会切断奶罐 → 奶泵 → 牛奶出口的液体主路**；诊断若把奶路停流归因于它，按引擎缺陷处理。

---

## 5. 操作手册

### 5.1 常用命令（项目目录 `/Users/leo/Documents/Fluidpath studio`）

```bash
export PATH="/Users/leo/.workbuddy/binaries/node/versions/22.22.2/bin:$PATH"  # 每条命令前必加
npx tsc --noEmit                 # 类型检查
npm run check                    # tsc + 全量测试（当前 481 通过 + 4 跳过，71 文件）
npm run build                    # 构建前端（dist/，Electron 必须）
npx electron-builder --mac --config.electronDist=node_modules/electron/dist   # 打包 DMG（本地 Electron，免下载）
npx electron scripts/verify-asar.cjs   # 入包验证
npm run smoke                    # 构建 + Electron 冒烟（无控制台错误才算过）
git status && git add -A && git commit -m "..."   # 每版一个 commit（见 §5.5 版本纪律）
```

### 5.2 打包流程

1. `npm run build`（Vite 构建 dist）
2. `npx electron-builder --mac --config.electronDist=node_modules/electron/dist`
3. `npx electron scripts/verify-asar.cjs` → `ASAR_LOAD_RESULT hasApp:true hasCanvas:true`
4. 产物：`release/FluidPath Studio-1.11.0-arm64.dmg`（版本号随 `package.json`；未签名；macOS 首次打开需右键 → 打开）

### 5.3 环境坑（全部实测）

- **Grep 工具对中文路径报 `spawn ENOTDIR`** → 一律用 Bash 里的 node/grep 代替。
- 系统有多个名为 "Electron" 的进程 → 用 bundle id `com.github.Electron` 定位 FluidPath。
- 不 export PATH 时 `node`/`npx`/`npm` 全部 command not found。
- 改完 `src/` 后必须重新 `npm run build` + 重新打包 DMG 才影响已安装应用；只改测试不须重打包。
- 打包后验证入包：解包 asar（`npx asar extract`）或 `@electron/asar` 提取 bundle 后 grep **字符串字面量**（注释会被 minify 剥离，别 grep 注释）；最可靠是对比 asar 内 bundle 与 `dist/` 的 sha1。
- **Electron 不支持 `window.prompt()`**（点击静默返回空）→ 一律用 `PromptDialog` 应用内弹窗或内联输入框；`confirm()`/`alert()` 可用。
- vitest 单文件运行：`npx vitest run src/__tests__/xxx.test.ts`；临时诊断测试用完即删。

### 5.4 诊断脚本模板（读图纸拓扑）

```js
const d = JSON.parse(fs.readFileSync("图纸.json", "utf8"));
const portNode = {};
d.nodes.forEach(n => (n.ports || []).forEach(p => (portNode[p.id] = n)));
// 管路由端口定位节点：fromPortId/toPortId → portNode[id]
// 方向错配扫描：正向管从 in 口流出 / 流入 out 口（reverse 管取反）
// 悬空端口：不在任何 pipe from/to 中的端口
// 引擎场景验证：写临时 vitest，import { pipeEffectiveDisabled, setCachedPipes, computeDisabledPipes } from "../geometry"
```

### 5.5 修改引擎/图纸的纪律

1. **已 git 管理**：每完成一个版本 `git add -A && git commit`（历史可回退）；改引擎/图纸前仍建议 `cp` 备份到 `/tmp`。
2. 改引擎必跑 `npx vitest run` 全量；新增行为要同步补回归测试（放 `src/__tests__/`）。
3. 引擎判定分三层（BFS 相位 / 递归 / 需求域），改一处先确认影响哪层（§3.6 分层归因）；BFS 与递归是"并集"语义，修一层想清楚另一层会不会掩盖/冲突。
4. 图纸结构问题（悬空端口、反向滤网、重复标签）用 `src/diagnostics.ts` 的只读诊断先查，用 `src/advice.ts` 的一键修复改。
5. 桌面图纸改动后同步项目根快照：`cp /Users/leo/Desktop/BCMTS.json BCMTS.json`（回归测试依赖它）。
6. **版本纪律（每次更新必做）**：① 升 `src/version.ts` 的 APP_VERSION 并在 CHANGELOG 头部追加条目；② 同步 `package.json` 的 version（打包文件名依赖）；③ `src/sample.ts` 里 `appVersion` 一并更新；④ 更新本手册 §8 版本历史表；⑤ 打包后 git commit。

---

## 6. 回归测试地图（src/__tests__/）

| 文件 | 覆盖内容 |
|---|---|
| `reflux-bcmts.test.ts` | **BCMTS 回流六场景矩阵**（两阀全关/润湿回罐/清洗回罐/快冲正冲/快冲死路/正常出奶） |
| `flow-isolation.test.ts` | BCTMS 双泵拓扑：停流不跨流源污染 + 排废 A/B 工况 + reverse 反向管 + 需求域死路 |
| `tank-source-supply.test.ts` | 储液罐液源：罐出侧不因入侧全停判停（1.29.2，5 例） |
| `heat-exchanger-channel.test.ts` | 换热器双通道：两侧互不串供（供液/停流相位/需求域，1.29.3，5 例） |
| `solenoid3-merge.test.ts` | 三通汇流（两进一出）：任一路入侧有供即出流 + 单入侧零回归（1.29.3，7 例） |
| `geometry.test.ts` | 引擎基础单元测试 |
| `scenario.test.tsx` / `scenario-verify.test.tsx` | 场景演示（角色解析/基线复位/链式高亮/快照还原 + BCMTS 引擎流动验证） |
| `msy2.test.tsx` / `b2c-json.test.tsx` / `fixed-diagram.test.tsx` / `fix-optimized.test.tsx` / `fix62.test.tsx` / `distribute.test.tsx` 等 | 各示例图纸加载/渲染回归（fix-optimized 导入 MSY2.json） |
| `diag-causality.test.ts` | 停流因果链定位 + 分层去噪 + 徽章结构计数 + 诊断/建议同源 |
| `conditions.test.ts` | 工况快照：保存/应用/删除/随图纸持久化 |
| `cross-ports.test.ts` | 十字四通四路贯通 + 端口上限（MAX_PORTS_PER_NODE=8） |
| `functional-chain-autosave.test.ts` | 元件→整机功能链追踪 + 自动保存/版本恢复 |
| `minimal-startup.test.ts` | 启动默认空白图 + 最简图生成器全链流动 + 工况数据流 |
| `layer.test.ts` | 图层：删除归入默认层、改名 |
| `e2e-workflow.test.ts` | 关键流程 E2E（启动→工况→演示→诊断→导出/分享往返） |
| `propagation.test.ts`、`fluidRules.test.ts`、`bom-fault-guide.test.ts`、`knowledge-diagnostics.test.ts` 等 | 引擎传播、流体规则、BOM/知识库/诊断 |

**当前全量：71 文件（69 通过 + 2 本机专属跳过）/ 485 用例（481 通过 + 4 跳过），tsc 无错误。**

---

## 7. 经验总结（可迁移的方法论）

1. **先诊断后动手**：结论 + 归因 + 方案 + 下一步，确认后再改。分层归因（哪层停的）→ 对照实验（改一个变量看 diff）→ 最小复现（合成拓扑）三步法极有效。
2. **引擎语义要物理自洽**：多流源系统里"泵 = 独立动力源/域边界"是核心不变量；suck/push 是方向语义，压力域是归属语义，二者正交。
3. **并集架构的代价**：BFS∪递归 让保守层的过度停流无法被精确层纠正 → 宁可收紧 BFS 扩散边界（护栏），也别指望递归兜底。
4. **教学覆盖与工程状态分离（1.7）**：`teachingOverride` 只影响画面动画；诊断使用工程有效状态，工程 JSON 导出会剔除教学覆盖。旧版 `forceFlow` / `forceStop` 加载时自动迁移。
5. **标签会重复，ID 不会**：一切程序化引用用 id，标签仅用于展示。
6. **图纸修复与引擎修复分清**：同一现象可能是图纸接错、也可能是引擎 bug——用引擎跑标准工况对照，别急着改错一边。
7. **Electron 没有 window.prompt**：任何"弹窗让用户输入"都要用应用内组件，别用浏览器 prompt——它静默返回空，表现为"点了没反应"。
8. **下拉菜单会被 tool 行 overflow 裁剪**：`position:absolute` 的下拉若祖先有 `overflow-y:hidden` 会被裁掉，改用 `position:fixed` 定位。
9. **概念复用比重复实现好**：演示步骤 / 工况快照 / 模板本质是同一套"开关状态"，抽成共享原语（presets.ts）后改一处全生效。
10. **git 是最大保险**：每次可跑版本即 commit；比任何手工备份都可靠。

---

*文档结束。接手后建议第一步：`npx vitest run` 确认 292 绿，再读 `src/geometry.ts` 的 `computeDisabledPipes`（相位 BFS + 压域）与 `computeDemandPipes`（需求域 per-root BFS）。*


---

## 8. 版本历史（预留）

> 结构已预留：`src/version.ts`（APP_VERSION + CHANGELOG）、`DiagramSettings.appVersion`、`package.json` version（打包文件名依赖）。
> 每次发布：更新 version.ts 的 APP_VERSION 并在 CHANGELOG 头部追加条目，同步 package.json 版本，再打包。
> 注：1.25.0–1.29.1 的发布记录见 git log 与根目录 HANDOFF 文件（待回填本表）。

| 版本 | 日期 | 主要变更 |
|---|---|---|
| 1.32.1 | 2026-10-25 | 工程/设计 P0+部分 P1：模板默认待机+推荐工况；安全附件（泵出口单向阀、锅炉十字四通+压力表+OPV/安全阀+泄压排废）；工程检查规则（安全阀/压力表/单向阀/泵死堵/蒸汽注入奶路/奶路清洗/默认状态/待机工况）并在预览/右栏可定位；空画布三步清单、模板标签+大预览、插入后高亮不选、右栏建议下一步+折叠、inline 保存条；向导焦点陷阱/aria；71 文件/481 通过+4 跳过。 |
| 1.32.0 | 2026-10-25 | 智能绘图 P0+P1：三步向导（5 个咖啡机液路模板）、自由描述、空画布加载/非空追加、一次撤销、自动适应；生成后「继续完善」功能块/接点/关键词/结构检查/自动布线；保存信心系统（本机草稿 vs 文件保存、首次修改教练、插入/导出提示、关闭三选一）；高级结构化指令保留；70 文件/477 通过+4 跳过。 |
| 1.31.5 | 2026-10-25 | 激活 AI 绘图面板：工具栏「AI 绘图」入口 + 右栏挂载（此前 AiDrawingPanel 无人引用）；新增 docs/ai-protocol.md（0.2-draft 包络/目录/5 类操作/错误语义/示例/提示词模板）；App 右栏改为显式分支并联动模式；新增管路编号 Linter（自动编号重复检测 + 一键重排，保留自定义名称）；AI 面板激活回归 3 例 + 编号重排 1 例，68 文件/467 通过+4 跳过。 |
| 1.31.4 | 2026-10-22 | 工程禁用旁支停流止于三通/四通：脉冲空气阀禁用或关闭只停空气支路，奶泵仍可从奶罐吸奶；「为什么停流」改为分层归因（本管→上游供液→下游去处），汇流点不再误报关闭的清洗旁支，多阻断汇总并补下游阀/泵/禁用件/储液罐液源说明；脉冲空气阀支持开/关（属性、画布徽标、工况快照、故障模拟）；67 文件/463 通过+4 跳过。 |
| 1.30.7 | 2026-10-13 | 工况自定义命名（✏️/双击重命名）；工况快照以当前设置为准（含管路介质类型+颜色，切回时还原）；演示步骤闪烁改为「与上一步相比的变化项」；验收功能与模式入口暂不展示（代码保留）。 |
| 1.30.6 | 2026-10-13 | 修复演示模式：自定义演示（从工况创建）选择后不进入步骤讲述界面（1/2/3 步骤导航缺失）——ScenarioPanel 的 getScenario 补传图纸上下文；新增回归测试。 |
| 1.30.5 | 2026-10-13 | 全局「显示」组（元器件/管路名称、管径 DN 可单独开关、介质标签、介质颜色、元器件文字大小、重置全部文字位置）；元器件文字可在画布拖拽微调 + 单点/全局重置；移除量感粒子密度、压力域着色与管路相对流量手填；专项测试 6 例。 |
| 1.30.4 | 2026-10-12 | 元件库新增即热加热块（Thermoblock，冷水进/热水出校验）与球阀（开/关、画布拨动、工程停流、功能链、诊断、验收、故障教学联动）；进水组件语义完善（减压阀命名、压力罐单接口双向、RO 稳压提示）；状态一致性修复（新建两通/三通/球阀显式默认阀位；模式横幅仅切换后短暂显示）；setCachedPipes 无节点缓存失效修复；回归测试 +5（435 用例）。 |
| 1.30.3 | 2026-10-11 | 新建连线 P0/P1：松手接近吸附（16px，精确优先）+ 落空提示；拖动中绿/红端口合法性与预览线吸附变色；专项测试 6 例。 |
| 1.30.2 | 2026-10-11 | 导出预览工作台：滚轮缩放/平移/缩放条、悬停高亮、双击改文字+字号、添加自由文字（稳定 id）；专项 11 例，全量 424 用例。 |
| 1.30.1 | 2026-10-11 | 导出文字增强补全：全类文字可拖拽（含开关徽标整组）、双击逐条改字（仅导出物生效、可重置）；修复预览拖拽/双击在留白布局下的坐标偏差；专项测试 8 例。 |
| 1.30.0 | 2026-10-11 | 导出文字增强（分类）：管路/阀门/元器件/开关状态/图例/自定义文字六类独立放大（1×–2.5×）+ 描边光晕/白底板 + 预览拖拽偏移（仅导出物生效）；修复导出克隆误剥节点/管路标签；测试 64 文件/419 用例。 |
| 1.29.3 | 2026-10-11 | 换热器双通道隔离（对置端口成对，供液/停流相位/压力域/需求域四层按通道判定）+ 三通“汇流”语义（两进一出任一路有供即出流）；新增回归测试 12 例；5 图纸×全工况对比仅目标图纸按预期变化。 |
| 1.29.2 | 2026-10-11 | 储液罐液源修复：供液递归不再把 tank 当直通件（罐出侧不因入侧全停判停）；修复 “奶泵开+进奶阀开时牛奶路整段显示停流”；新增回归测试 5 例（tank-source-supply）。 |
| 1.24.0 | 2026-09-03 | 英文界面导出物去中文（管路默认名渲染为 Pipe N，新建管路按语言命名）；登录页初始可选中/EN；网页密码改为当日动态密码（年月日反转拼接）；管路默认名语言化（createPipe）。 |
| 1.23.0 | 2026-09-02 | 三态模式操作权限：演示/验收锁定拓扑编辑（拖动/连线/缩放/删除/粘贴/标签编辑/撤销重做），保留拨阀/平移/选择；画布模式提示条；App 订阅 store 修复模式联动不刷新。 |
| 1.22.0 | 2026-09-01 | 自定义演示场景（从工况多选合成多步，随图纸保存可删除）；顶栏精简（删图纸名编辑框与暗色按钮）；加载提示 1s；演示高亮固定跟随流动；使用指南细化（三模式/量感/微调保存/自定义演示/导出预览）。 |
| 1.21.0 | 2026-09-01 | 演示微调持久化：saveScenarioOverridesToStep 写入 settings.scenarioOverrides（随图纸/JSON/机型包），「从此步生效」；setScenarioStep 改为快照重建（每步状态确定）；快照恢复保留已存微调；面板显示/清除本步已存微调。 |
| 1.20.0 | 2026-09-01 | 演示微调叠加层：演示中拨阀/泵跨步骤保留（overrideScenarioNode，退出/切场景清空并还原快照）+ 场景面板微调计数/重置 + 高亮模式开关（按步骤/跟随流动）。 |
| 1.19.0 | 2026-09-01 | 量感层：相对流量级联衰减（relativeFlow.ts，分流均分/汇流相加，手填 override）+ 压力域着色（含停流带压管段，默认关）+ 出视区 skip 渲染（200px 缓冲）。 |
| 1.18.0 | 2026-08-30 | 导出预览对话框（实时预览+背景/缩放/留白/文件名/仅选中）；导出覆盖层（文字增强/状态徽标样式/图例开关，画布零污染）；图例状态颜色说明段（legend.ts 独立模块）；自定义文字层（标题/说明/水印/日期，可写回图纸）；GIF 帧间隔与暗色导出（修复导出文字变黑）；机型包按钮文字化+引导+指南讲解；状态徽标视觉增强。 |
| 1.17.0 | 2026-08-29 | i18n 全面扫尾（双语 + 无中文残留测试）；诊断/验收 Markdown 报告导出；新增美式/热水杆/牛奶清洗/排废 4 场景；三态工作模式；机型包 MachinePack；Schema 校验/迁移注册表；连接前校验 + 泵出入口 Linter + 缓存失效回归/埋点；讲师旁白/标注/小测验；store 拆分（autosave 模块）；大图基准/分享阈值测试；无头验收 CLI；CI workflow（check.yml）。 |
| 1.16.0 | 2026-08-24 | 网页版支持新窗口及跨窗口复制/粘贴；网页保存 JSON 优先使用原生文件保存器选择存储位置。 |
| 1.15.0 | 2026-08-23 | 新增桌面多窗口；窗口间可复制/粘贴选中元器件及内部管路；保存 JSON 统一弹出系统路径选择窗口。 |
| 1.14.0 | 2026-08-20 | 元件库动力组新增「空气泵」（淡绿、三叶风扇图标；接入引擎泵判定/介质规则 air/知识库） |
| 1.13.0 | 2026-08-19 | 移除工具栏自动保存按钮；桌面版关闭窗口时弹窗询问是否另存（保存/不保存/取消，§9.6） |
| 1.12.0 | 2026-08-19 | 启动即空白图 + 默认英文 + 自动打开使用指南；工具栏图纸名可编辑（保存文件名跟随）；网页版部署 GitHub Pages（密码门 800866，§9） |
| 1.11.0 | 2026-08-19 | （此前版本按环境实际演进记录，见 git log） |
| 1.8.0 | 2026-08-18 | 新增图纸工况验收矩阵：记录泵阀状态及管路应流/应停断言，一键运行且不改动当前画布；BCMTS 内置断水停泵案例 |
| 1.7.1 | 2026-08-18 | 停流管不再显示流动粒子与箭头；新增 BCMTS「总进水阀关 + 水泵停」锅炉补水链全停流回归 |
| 1.7.0 | 2026-08-18 | 修复共享汇流处停流误传播；教学显示覆盖与工程状态分离；新增工程 JSON 导出与旧覆盖字段自动迁移 |
| 1.6.0 | 2026-08-18 | 新增元件「冲泡缸」（处理组，简笔密闭腔+上下活塞）；接入介质规则/需求终点/场景角色/启动最简图 |
| 1.5.0 | 2026-08-18 | 工况切换差异对比高亮；管路箭头颜色跟随介质；选中管路两端端口高亮+连接关系提示 |
| 1.4.0 | 2026-08-18 | 新增介质「清洗废液」；元件悬停浮动提示（名称+类型+状态） |
| 1.3.0 | 2026-08-18 | 工程化：git 基线提交、统一预设状态原语（presets.ts）、关键流程 E2E、i18n 补全工况/图层/弹窗 |
| 1.2.0 | 2026-08-18 | 工况改清晰面板（记住开关/恢复，内联输入）；图层面板修复裁剪+选中本层/双击改名/删除归默认层；启动默认最简图；移除全部 window.prompt（Electron 不支持），改用应用内输入弹窗/内联输入 |
| 1.1.0 | 2026-08-18 | 诊断分层/因果链/教学解释/总览；功能链联动；场景↔工况；自动保存+版本历史（5 份）；十字四通/端口上限 8/stub 延长/进出口可视化；演示角色自适应；移除透明按钮；修复工具栏下拉被裁剪；工况改为独立面板（大保存按钮+三步引导）；启动默认改为最简「水泵→冲泡缸→咖啡出口」 |
| 1.0.0 | 2026-08-17 | 初始发布（含 BCMTS 回流修复、per-root 需求域） |

---

## 9. 在线部署（GitHub Pages / 网页版）

> 现状（2026-08-19）：应用是 React + Vite 纯前端，`npm run build` 产出静态 `dist/`（浏览器直接运行）。
> Electron 只是桌面壳（文件对话框）；核心画布 / 仿真 / 诊断 / 工况 / 演示全部浏览器可跑。
> 已核实兼容点：文件打开用 `<input type=file>`、保存/导出用浏览器下载、分享码/链接为网页设计、`vite base:"./"` 已配好 → 可直接部署 GitHub Pages。

### 9.1 为什么能网页化（已核实的兼容点）

- 工具栏「打开 JSON」= 隐藏的 `<input type=file>`（非 Electron 原生对话框）；App 欢迎页同款。
- 导出 JSON/PNG/SVG/PDF/GIF 用 Blob 下载（浏览器原生）。
- 分享码/分享链接有 `location.protocol === "file:"` 分支，网页版走 `buildShareLink`。
- 渲染进程不依赖 `window.electronAPI`（preload 仅桌面用）。
- 自动保存 / 崩溃恢复用 localStorage（浏览器原生）。

### 9.2 部署架构

```
GitHub 仓库（public）
  └─ .github/workflows/deploy.yml   # push 到 main → 自动 build → 部署 Pages
  └─ dist/ 由 vite build 生成（base:"./" 已配好，子路径可跑）
GitHub Pages URL: https://<user>.github.io/<repo>/
```

### 9.3 密码门（重要限制，如实记录）

- **GitHub Pages 本身不支持密码**；免费 Pages 只支持 public 仓库。
- 用户选择：public 仓库 + **客户端固定密码门**（进入应用前先输固定密码，密码混淆存储于 JS）。
- **强度说明**：防"路人 / 误点链接"级别，**不是真正安全**——public 仓库源码与 JS 里都能找到密码，懂行的人可提取。
- 若将来要真密码 / 私有源码 → 私有仓库 + 付费托管（Vercel / Netlify Pro）或 Cloudflare Access。
- 配套：`robots.txt` 禁止收录，降低被搜索引擎索引的概率。

### 9.4 后续更新流程（易用性）

1. 本地开发 → `npx vitest run` 全绿 → 升版本号（见 §5.5 纪律）→ `npm run build`（本地可先验 dist）。
2. `git add -A && git commit && git push origin main`。
3. **GitHub Actions 自动**：build → 部署 Pages → 数分钟后线上更新。
4. 改密码：改密码门配置 + push 即可。
5. 网页版用户数据在各自浏览器 localStorage；跨设备靠分享码 / 链接。

### 9.5 待办（2026-08-19，接手 AI 从这里继续）

- [x] 用户已提供 GitHub 用户名：`leowu65516-crypto`（LeoWU65）
- [x] 仓库名：`fluidpath-studio`
- [x] 密码门固定密码：`800866`
- [x] 待用户提供：Personal Access Token（已提供并完成部署）
- [x] 创建 `.github/workflows/deploy.yml`（Actions：checkout → node22 → build → upload-pages → deploy-pages）
- [x] 客户端密码门（`src/gate.ts` 固定密码 800866，仅网页版启用，Electron/测试跳过）+ `public/robots.txt` 禁收录
- [x] 发布并验证：**https://leowu65516-crypto.github.io/fluidpath-studio/**（HTTP 200，密码门已确认在线上包中）
- [x] 线上地址 https://leowu65516-crypto.github.io/fluidpath-studio/ 已上线（密码 800866）；更新流程：改代码 → vitest → 升版本 → push main → Actions 自动部署
- [ ] **提醒用户撤销 Token**（`github.com/settings/tokens`；撤销后后续推送需重新授权）
- [ ] 创建 `.github/workflows/deploy.yml`（Actions：checkout → node → build → deploy-pages）
- [ ] 加客户端密码门（入口页 + 固定密码配置 + 混淆）
- [ ] `robots.txt` 禁收录；发布并验证线上可打开
- [ ] 本地 `package.json` 版本与线上说明同步


### 9.6 桌面版关闭时询问另存（v1.13.0）

- 主进程拦截窗口 `close` 事件 → 通知渲染进程弹「是否另存图纸到本地？」（另存 / 不保存 / 取消）。
- 另存 → 主进程 `dialog.showSaveDialog` 写 JSON（preload 暴露 `saveJsonDialog`）；不保存 → `confirmClose` 直接关；取消 → 留在界面。
- 空白且未修改时直接关闭、不弹窗。
- 网页版浏览器无法拦截关闭，沿用 beforeunload 自动保存（崩溃恢复）。

### 9.7 发布记录（滚动最近一条）

- 2026-10-13 发布 **1.30.7**（工况重命名 + 快照含介质 + 演示闪烁差异 + 隐藏验收入口）：`origin/main` = `be5a61f`；Check + Deploy 均 **success**；线上 bundle `assets/index-CqMUD0l-.js` 与本地构建 sha256 一致（`ce21260b…`，完整下载比对），线上版本常量 1.30.7；DMG：`release/FluidPath Studio-1.30.7-arm64.dmg`（包内提取 bundle sha256 与本地一致，`verify:asar` 通过）。注：当晚 GitHub 连接仍间歇不通，推送与核对均经重试完成。
- 2026-10-13 发布 **1.30.6**（修复演示模式自定义场景不进入步骤界面）：线上 bundle `assets/index-07jXpuuG.js`（`48670206…`）；网页端 + DMG 均已发布。
- 2026-10-12 发布 **1.30.4**（即热加热块 + 球阀）：`origin/main` = `5045af6`；线上 bundle `assets/index-kuRzbC89.js`（`fd65c610…`）；网页端 + DMG 均已发布。
- 2026-10-11 发布 **1.30.3**（新建连线 P0/P1）：`origin/main` = `0b9d806`；线上 bundle `assets/index-CFsjFzy6.js`（`316a9e1c…`）；网页端 + DMG 均已发布。
- 2026-10-11 发布 **1.30.2**（导出预览工作台：缩放/平移/加字/字号）：`origin/main` = `80a1a46`；线上 bundle `assets/index-DFJVW2rI.js`（`0d997f52…`）；网页端 + DMG 均已发布。
- 2026-10-11 发布 **1.30.1**（导出文字增强补全：全类可拖拽 + 双击逐条改字）：`origin/main` = `cf5bf4c`；线上 bundle `assets/index-BeXJYwBL.js`（`5ad11ccd…`）；网页端 + DMG 均已发布。
- 同日更早发布 **1.30.0**（导出文字增强·分类放大，`a669aeb`）—— 输入第一半迭代，已被 1.30.1 取代。
- 2026-10-11 发布 **1.29.3**（换热器双通道 + 三通汇流）：`origin/main` = `c50f1a9`；线上 bundle `assets/index-BuCigIWr.js`（`bedee3d8…`）；网页端 + DMG 均已发布。
- 前一版 **1.29.2**（储液罐液源）同日已发网页 + DMG（`release/FluidPath Studio-1.29.2-arm64.dmg`，线上 bundle `index-DBrLFsF3.js`）。
- 网络事实更新（2026-10-11 实测）：本机 **直连 github.com 可用**（`git push` 直连成功）；旧记录的 `http.proxy=127.0.0.1:10808` 方式当前不通（该端口为 xray，HTTP 代理协议下无响应）。PAT 仍在钥匙串有效。
- 附带发现（未修，待排期）：超大图纸的分享链接（如 Smart X，≈89K 分享码）会因超长 URL/Referer 在通用服务器触发 431、页面空白；建议后续改用 URL fragment 或压缩编码。
