# FluidPath Studio · 开发建议与落地实现

> 文档定位：以 `FluidPath-交接文档.md` 与 `FluidPath-优化方案.md` 为项目基准，结合 **GitHub 竞品深度调研（4 条线、2026-09-01 实测）**，输出可直接指导开发落地的《竞品对比 + 差异化机会 + 优先级功能建议 + 分阶段实现方案》。
>
> 调研方法：3 条线由调研子代理执行（WebSearch + GitHub API 实测），第 4 线（管网求解库）因子代理限流由主流程直接完成。所有 star 数 / 许可 / 活跃度均来自 GitHub REST API 或 npm registry 实测；未核实项已明确标注，未编造任何数据。
>
> 阅读顺序：§1 现状 → §2 竞品对比结论 → §3 差异化机会 → §4 功能建议（P0/P1/P2）→ §5 分阶段方案 → §6 关键技术决策 → §7 不做清单 → §8 风险纪律 → 附录竞品速查。

---

## 1. 项目现状快照（基于交接文档，精炼）

### 1.1 一句话定位

**FluidPath Studio 是一个"液路教学示意 + 阀位工况实时布尔语义仿真"编辑器**——不是 CFD，不是通用 CAD。它画全自动咖啡机（CAYE）的水/奶/蒸汽/排废管路，改阀位、开停泵，画布上的管路**实时**从"流动"变"停流"，并给出"为什么不出水"的停流因果链。

### 1.2 技术栈与体量（v1.18.0）

| 项 | 现状 |
|---|---|
| 主进程 | Electron（CJS，未签名，arm64 DMG） |
| 前端 | React 18 + TypeScript（strict）+ Vite 5 |
| 测试 | Vitest（jsdom），**300+ 用例 / 50+ 测试文件**，tsc 零错误 |
| 网页版 | GitHub Pages 部署，固定密码门 `800866`（`src/gate.ts`，仅网页启用） |
| 核心资产 | 自研 SVG 画布（单文件 `CanvasView.tsx` ~6.5k 行）+ 仿真引擎（`geometry.ts` ~46k）+ 46 种领域元件符号（`symbols.tsx` ~65k） |
| 领域模型 | 46 种 `NodeType`、13 种 `fluidType`、以端口（port）连接管路（非节点连接） |
| 样板图纸 | BCMTS（63 节点 / 74 管路）、BCTMS（62 / 70）、MSY2；含回流/快冲/排废等验证场景 |

### 1.3 现有核心能力（护城河，应保留）

- **三层布尔流/停引擎**：BFS 相位传播（suck 逆流向 / push 顺流向 / both 双向）+ 递归 AND 汇流兜底 + 需求域（per-root BFS）。物理自洽，是项目最强差异点。
- **停流因果链诊断**：`advice.ts` 分层（structure 永远有效 / state 教学提示），"为什么"教学解释、一键修复、沿因果链点亮。
- **场景角色自适应演示**：`resolveScenarioRoles` 按"类型+标签"解析元件，换机型 JSON 自动跟随。
- **工况快照 + 验收矩阵**：随 JSON 持久化、可交付、可批量运行。
- **教学/工程状态分离**：`teachingOverride` 不影响工程导出（已删除危险的"强制流动"建议）。
- **桌面 + 网页双端**、BOM Markdown 导出、SVG/PNG/PDF/GIF 导出、分享链接。

### 1.4 已知缺口（来自两份内部文档，归并）

| 维度 | 缺口 |
|---|---|
| 信息架构 | App.tsx 已"自发长出"模式切换（5 个布尔各自为政）；启动冷启动弱；场景仅 2 个（coffee/milk），但机型已验证 10+ 功能场景 |
| i18n | **承诺了却没做到**：英文模式下右键菜单、密码门、端口编辑器、错误页仍是硬编码中文（优化方案 §17.2 定为 P0） |
| 引擎 | 已知近似（制奶时回流管显流动）缺「近似可见」入口；无压力/流量/温度数值 |
| 画布 | 交互状态机集中单文件，扩展成本高；缺自动布线避障、批量对齐分布、视口书签、虚拟化 |
| 测试 | 视觉回归、组件交互测偏少 |
| 工程化 | `store.ts` ~68k"上帝对象"；版本纪律人工；中文路径摩擦；Electron 未签名 |
| 数据 | JSON schema 无正式 JSON Schema；分享码 Base64 易超 URL 长度 |

---

## 2. 竞品对比分析（四线调研）

> 说明：FluidPath 的"竞品"分两类——**产品竞品**（抢同一批用户）与**能力参照**（技术选型/功能对标）。下文按四条调研线分别给出结论，能力映射总表见 §2.5。

### 2.1 线 1：教学/培训向流体回路仿真工具

| 名称 | 仓库 | Stars | 许可 | 形态 | 与 FluidPath 可比点 |
|---|---|---|---|---|---|
| FluidSIM（Festo） | 无公开仓库（闭源） | — | 商业 | 液压/气动原理教学，ISO 符号 + 拖放建回路 + 实时动画 + 电气联动 + 故障模拟 + 教材 | 唯一"改阀位→画面立刻变"的成熟教学产品 |
| Automation Studio（Famic） | 闭源 | — | 商业(教育免费) | 机电液气 PLC 联合仿真 | 学科覆盖广 |
| Hopsan | github.com/Hopsan/hopsan | 230 | Apache-2.0 | 多域 1D 仿真（TLM） | "拓扑→流动状态"求解范式 |
| OpenModelica | github.com/OpenModelica/OpenModelica | 1392 | NOASSERTION | Modelica 通用建模仿真 | 非因果连接语义（FluidPath 相位传播的"祖先"） |
| ModelicaStandardLibrary | github.com/modelica/ModelicaStandardLibrary | 610 | BSD-3 | Modelica.Fluid 流体库 | 流体连接器思想 |
| OpenHydraulics | github.com/modelica-3rdparty/OpenHydraulics | 56 | BSD-3 | 液压回路元件库 | 元件库复用 |
| SimulIDE | github.com/Arcachofo/SimulIDE-dev | 318 | AGPL-3.0 | 电子/MCU 实时仿真 | 低延迟实时交互渲染 |
| picuino/neumatic | github.com/picuino/neumatic | 8 | GPL-3.0 | 在线气动回路教学（配教程） | **交互形态最接近**（拖放→立刻看到流动） |
| FluidForge / WalFlow / Moray | 各 0~1 star | — | 未声明 | 浏览器内气动/液压/PFD 教学 | 纯前端零安装分发、拓扑静态校验 |

**线 1 结论**：**无直接竞品**。这条线上的工具服务"流体动力学科教学"（换向阀/油缸/气马达，职校师生），而 FluidPath 服务"CAYE 具体机型的售后培训"（水泵/电磁阀/蒸汽锅炉，厂商技术支持）。用户群、元件库、语义层都不重叠。浏览器小工具（picuino/WalFlow）交互形态一致，但它是"通用原理演示"，不是"某台机器的故障教学"——这本身说明 FluidPath 站在一个没有现成对手的窄位上。

### 2.2 线 2：P&ID / 管路设计工业工具

| 名称 | 仓库 | Stars | 许可 | 核心能力 | 与 FluidPath 可比点 |
|---|---|---|---|---|---|
| **IPD Studio** | github.com/Coldbari/IPD-Studio | 4 | AGPL-3.0 | 浏览器 P&ID，**ISA-5.1 符号 + tag 解析校验 + 回路号自动派生 + 仪表索引/管线表自动生成 + HMI 实时培训仿真（故障注入）** | **形态最接近**：浏览器+领域语义+实时仿真 |
| pnid_houbolt | github.com/SpaceTeam/pnid_houbolt | 4 | LGPL-3.0 | 解析 KiCad `.sch` → 可交互 HTML P&ID，点击改值 | "实时状态回写+点击即控"交互范式 |
| DWSIM | github.com/DanWBR/dwsim | 538 | GPL-3.0 | 化工流程模拟（稳态+动态），PFD 绘制即求解 | 最成熟的"图带语义求解"开源 |
| pyDEXPI | github.com/process-intelligence-research/pyDEXPI | 217 | AGPL-3.0 | DEXPI 数据模型 Python 实现 | 语义数据模型层 |
| IDAES-PSE | github.com/IDAES/idaes-pse | 344 | NOASSERTION | 过程建模框架 | 工况参数化建模思路 |
| QElectroTech | github.com/qelectrotech/qelectrotech-source-mirror | 531 | GPL-2.0 | 电气/气液原理图，**8200+ 符号库 + 元件编辑器 + 自动明细表** | 符号库与元件元数据管理 |
| FreeCAD / Flamingo | github.com/FreeCAD/FreeCAD (33k) / oddtopus/flamingo (38) | — | LGPL | 3D CAD + `pype-line` 管路对象 + PartsList | 管路属性继承 + BOM |
| draw.io | github.com/jgraph/drawio | 7824 | Apache-2.0 | 通用绘图，含 P&ID 图库 + libavoid 避障路由 | 符号库来源 + 本地优先哲学 |
| 商业坐标 | Bentley OpenPlant PID / AutoCAD Plant 3D / AVEVA Diagrams | — | 商业 | 数据驱动智能 P&ID + 企业级工程库 | "工业规范/图纸交付"天花板成本 |

**线 2 结论**：最接近 FluidPath 形态的是 **IPD Studio**（tag 驱动 + HMI 培训 + 故障注入）与 **QElectroTech**（符号库 + 自动明细表）。最该抄的三件事：① IPD Studio 的 **tag 解析校验 + 回路号自动派生 + 自动生成 line list / 仪表索引**；② IPD Studio 的 **HMI 培训模式 + 故障注入**（与售后培训场景完全重合）；③ Flamingo 的 **整段管路属性继承（`pype-line`）+ PartsList 直出 BOM**。绝不该追的是：工业级工程数据库、多用户工程库、DEXPI/ISO 15926 全量合规、DWSIM 式连续量物性求解。

### 2.3 线 3：通用画布 / 图编辑框架（能力参照，非产品竞品）

| 名称 | 仓库 | Stars | 许可 | 关键点 | 对 FluidPath 适用性 |
|---|---|---|---|---|---|
| React Flow / xyflow | github.com/xyflow/xyflow | 38208 | MIT | 自定义节点(DOM)/边、`Handle` 端口、`isValidConnection`/`connectionRadius` 校验钩子 | **迁移价值低**（DOM 渲染与 SVG 导出根本冲突），但 API 形态值得抄 |
| tldraw | github.com/tldraw/tldraw | 50054 | **source-available（非 OSI）** | `ShapeUtil`/`BindingUtil` 插件范式最干净 | **扩展点设计教科书**，不是迁移候选 |
| Excalidraw | github.com/excalidraw/excalidraw | 130864 | MIT | 绑定用"归一化 fixedPoint + gap"、肘形箭头 A* 路由 | 抄绑定数据结构 + 肘形路由 |
| draw.io | github.com/jgraph/drawio | 7824 | Apache-2.0 | **libavoid 避障正交路由 + P&ID 图库** | 算法与图库双参照，可 iframe 嵌入 |
| AntV X6 | github.com/antvis/X6 | 6686 | MIT | SVG 引擎 + `manhattan` 避障 + `exportSVG` + 对齐线 + **3.0 虚拟渲染** | 能力清单最贴合，但命令式 API 与 React 声明式世界观冲突 |
| LogicFlow | github.com/didi/LogicFlow | 11675 | Apache-2.0 | 中文流程编排，节点/边注册 | 交互模式参照 |
| GoJS | github.com/NorthwoodsSoftware/GoJS | 8470 | 商业闭源 | 工业图定制案例，按开发者数授权（约 $4k~$12k） | "付费能买到什么"的标尺 |
| Node-RED | github.com/node-red/node-red | 23603 | Apache-2.0 | 纯 SVG + D3 画布，`mouse_mode` 状态机 | 1372 行状态机拆分的参照 |
| BaklavaJS / Rete.js | 2091 / 12229 | MIT | `setPort()` 端口vs配置项 / 可插拔连接预设 | 端口语义与连接交互抽象 |

**线 3 结论（立场明确）**：**不迁移，只反向移植算法**。理由：① 渲染模型冲突——React Flow 节点是 DOM，官方明确答复"无法整图导出 SVG"，而 SVG 导出是 FluidPath 核心交付；② 规模不匹配——FluidPath 是 60 节点小图，用不上框架的虚拟化长板，正撞其 DOM 渲染 / 无避障 / 无矢量导出短板；③ X6 道同术不同，迁移 = 重写渲染层 + 46 符号注册 + 300+ 测试重接。最划算的 5 个反向移植：① **libavoid WASM 避障路由**（Worker 中跑，手动画点优先级高于自动）；② **React Flow 连接语义 API 形态**（`isValidConnection` 统一磁吸预览与落点判定）；③ **X6 的 router/connector 分离**（路由点数组与样式解耦）；④ **X6 3.0 性能四件套**（出视区真卸载 DOM / rAF 帧合并 / `translate3d` GPU 合成 / 网格吸附降频）；⑤ **tldraw 扩展点 + Excalidraw 绑定数据结构**（归一化 fixedPoint 连接）。

### 2.4 线 4：管网水力求解开源库（能否加"定量"）

| 名称 | 仓库 | Stars | 许可 | 解稳态/瞬态 | 能否 WASM/JS 前端跑 |
|---|---|---|---|---|---|
| **EPANET / OWA-EPANET** | github.com/OpenWaterAnalytics/EPANET | ~ (USEPA 开发，公共领域；OWA 社区 MIT 分支) | MIT 分支 | 稳态 + 延时(EPS) 水力/水质 | **能**：`epanet-js`（npm 0.9.0，MIT）是 Emscripten→WASM 全量移植，122 函数，`model.solveH()`，标准版把 WASM 以 Base64 内联，**可直接 CDN/纯 HTML 跑** |
| WNTR | github.com/USEPA/WNTR | ~456 | Revised BSD | 灾害情景管网韧性 | **否**：Python，需后端 |
| OpenPNM | github.com/PMEAL/OpenPNM | — | BSD | 多孔介质网络（**错误领域，排除**） | 否 |
| CoolProp | github.com/CoolProp/CoolProp | — | BSD-3 | 流体物性查询 | 有 WASM 构建，但非管网求解器，仅做物性查表 |
| Modelica.Fluid / OpenModelica | — | 610 / 1392 | BSD / NOASSERTION | 动态，需 FMI | 需编译/FMU，重 |

**线 4 结论（立场明确）**：

- **技术上可行**：`epanet-js`（WASM，MIT）证明纯前端能跑 EPANET 2.2/2.3 全量水力求解。
- **但现阶段不值得做实时/物理求解**。原因：FluidPath 图纸里**一条物理参数都没有**（无节点标高、管径、粗糙度、泵曲线、需求流量），要跑通 EPANET 必须为每个节点/管补一份"物理属性"数据层——这是巨大的数据录入负担，且会稀释"简单即教学示意"的核心价值。
- **推荐中间路线（不引入求解器也能给"量感"）**：
  - 相对流量级联衰减：串联阀/管系数乘积 → 粒子密度 / "半开"视觉；
  - 压力域着色：复用已有"运行泵出侧集合"；
  - 每条管路可编辑 `relativeFlow%`（0–100，用户手填），仅驱动动画密度，无求解。
- **若未来确有工程校验需求**：把 `epanet-js` 作为 **OPT-IN 的"工程分析"模块**——从图纸自动派生 INP（叠加用户填写的物理属性覆盖层），`solveH()` 跑一次，结果写回为只读叠加层。严格不在默认路径。

### 2.5 竞品能力映射总表

```
能力维度                 FluidPath 现状  目标态(本方案后)   最强外部对标
实时阀位布尔语义         ★★★★★        ★★★★★(保持)       FluidSIM / picuino
教学分步演示             ★★☆☆☆        ★★★★☆            IPD Studio HMI
验收/测试交付            ★★★☆☆        ★★★★★            IPD Studio 验收
工业符号/规范(tag/编号)  ★★☆☆☆        ★★★☆☆            IPD Studio tag+Linter
绘制效率/自动布局        ★★★☆☆        ★★★★☆            X6 manhattan / drawio libavoid
画布性能/虚拟化          ★★☆☆☆        ★★★★☆            X6 3.0 性能四件套
知识库/教学文案          ★★★★☆        ★★★★★(单源)      FluidSIM 教材
多语言完备度             ★★☆☆☆        ★★★★★            —(自身债务)
协作                    ★★☆☆☆        ★★★☆☆(Git向)      Miro/Lucid
云与权限                ★☆☆☆☆        ★★★☆☆            Cloudflare Access
定量仿真                ☆☆☆☆☆        ★★☆☆☆(启发式)     epanet-js(可选)
工程可维护性            ★★☆☆☆        ★★★★☆            —(自身重构)
```

### 2.6 竞品对比总结论

1. **FluidPath 处于一个"无直接产品竞品"的窄位**：上接教学仿真（FluidSIM 太重且闭源、通用），下接工业 P&ID（OpenPlant 太重且要后端），中间浏览器小工具（picuino/WalFlow/IPD Studio）要么通用演示、要么 4-star 半成品。**护城河 = 预置真实机型拓扑 + 布尔工况语义 + 停流因果链 + 厂商私有机型库闭环**，这些通用工具做不了也不打算做。
2. **最该抄的能力**（已落实为 §4 的 P0/P1）：IPD Studio 的 tag/回路号/验收 + HMI 故障注入、QElectroTech 的符号库/明细表、X6/drawio 的避障路由与性能做法、Excalidraw/tldraw 的绑定与扩展点模型、epanet-js 作为 OPT-IN 定量后路。
3. **绝不该追的陷阱**：工业工程数据库、DEXPI 全量合规、DWSIM 式物性求解、React Flow 整图迁移、实时 CRDT 协作。

---

## 3. 基于用户场景的差异化机会点

### 3.1 用户场景建模（CAYE 真实语境）

| 场景 | 角色 | 当前体验 | 痛点 |
|---|---|---|---|
| S1 售后工程师排故 | 海外经销商技术员 | 看静态 PDF 图纸，靠经验猜 | "为什么不出奶""哪个阀没开"无交互验证 |
| S2 机型交付与验收 | CAYE 研发/质量 | 手动画图 + 人工核对阀位 | 无"一键验收 10 个功能场景全流"的自动化 |
| S3 培训讲师授课 | 内部/外部讲师 | 只 2 个演示场景，无讲义 | 场景不全、无旁白、无学员练习与评分 |
| S4 跨语言培训 | 60+ 国家客户 | 英文模式仍满屏中文 | i18n 半成品直接损害海外可用性 |
| S5 图纸评审/规范 | 研发接线 | 无 tag、无 Linter、报告弱 | 无法生成可交付的诊断/BOM 报告 |
| S6 学员自学自测 | 海外学员 | 无 | 无"拨阀→提交→对比标准→得分"闭环 |

### 3.2 差异化机会点矩阵

| 机会点 | 来自竞品洞察 | 对应场景 | 差异化强度 |
|---|---|---|---|
| O1 厂商机型包闭环（机型库+场景+验收一次就绪） | IPD Studio 无机型库；通用工具无私有机型 | S1/S2/S3 | ★★★★★（独占领地） |
| O2 阀位工况"可操作培训"（拨阀/泵→实时变→故障注入） | IPD Studio HMI + pnid_houbolt 实时回写 | S1/S3 | ★★★★☆ |
| O3 验收矩阵即交付物（一键导出 Markdown/HTML 验收报告） | 工业工具 Data Integrity 报告 | S2/S5 | ★★★★☆ |
| O4 完整多语言（英/中/未来日德，符号不依赖文字） | 自身 i18n 债务 + 海外 60 国 | S4 | ★★★★☆（紧迫） |
| O5 启发式"量感"而非物理求解 | epanet-js 太重；自身零参数 | S1/S3 | ★★★☆☆ |
| O6 可 diff 的图纸 + Git 异步协作 | 工程师协作真相源 | S2/S5 | ★★★☆☆ |
| O7 绘制效率与性能（避障路由/对齐/虚拟化） | X6/drawio 算法 | S5 | ★★★☆☆ |

---

## 4. 功能开发建议（按优先级排列）

> 每条含：**用户场景 / 价值说明 / 功能描述 / 竞品对标 / 实现要点**。优先级 P0（立刻做、低风险高感知）/ P1（核心产品化）/ P2（专业增强/可选）。

### P0 — 立刻做、低风险高感知

#### P0-1 · i18n 扫尾与防回归
- **用户场景**：S4——英文用户打开网页版，密码门、右键菜单、错误页仍是中文，第一眼即"未完成"。
- **价值**：当前唯一"承诺了却没做到"的功能缺口；修复成本最低、观感提升最直接；是出海 60 国的前提。
- **功能**：将右键菜单、PasswordGate、ErrorBoundary、PortEditor、HelpPanel 等硬编码中文一次性接入 `t()`；加一条组件测试"英文模式下渲染主要面板，断言无中文字符"。
- **竞品对标**：无直接对标（这是自身债务）。
- **实现要点**：复用现有 `i18n.tsx` 机制；新增 `src/__tests__/no-hardcoded-zh.test.tsx` 防回归；知识库 `knowledge.ts` 47 条补全 `en` 字段（优化方案 §17.1 确认覆盖 100%，只缺翻译）。

#### P0-2 · 场景库补齐（对齐机型 10+ 功能场景）
- **用户场景**：S3——讲师只能演示"冲泡咖啡/热牛奶"，但机型已验证美式/热水杆/蒸汽杆/牛奶清洗/润湿/快冲/排废/补水/降温共 10+ 场景。
- **价值**：复用现有 `resolveScenarioRoles` + `presets` 原语，几乎零引擎改动即可把产品从"2 场景"升级为"机型全覆盖教学工具"。
- **功能**：新增 americano / hotWand / steamWand / milkClean / wet / quickFlush / drain / steamRefill / steamCool 等场景（参考交接文档 §4.3 场景总表）。
- **竞品对标**：FluidSIM 实验向导、IPD Studio HMI 场景。
- **实现要点**：每个场景只声明"阀/泵角色动作集合"；从 `scenarios.ts` 自动生成 Markdown 场景表，避免手册与代码双源漂移。

#### P0-3 · 三模式信息架构（编辑/演示/验收收敛）
- **用户场景**：S1/S2/S3——当前 App.tsx 用 5 个布尔手工模拟互斥工作现场。
- **价值**：把已有布尔收敛为 `setMode("edit"|"present"|"verify")` 映射表（面板可见性/快捷键/画布权限），改动集中在 App.tsx 一个文件，**零引擎风险**。
- **功能**：顶部分段控件 + 状态栏模式标识；演示/验收退出还原。
- **竞品对标**：FluidSIM 编辑/仿真硬切换、Lucid 模板启动页。
- **实现要点**：新增 `src/modes.ts` 映射表；不深改引擎。

#### P0-4 · 验收/诊断报告一键导出（Markdown/HTML）
- **用户场景**：S2/S5——质量/研发需要可交付的"结构问题+因果链+出口流停+BOM+版本"报告。
- **价值**：把已有的诊断与验收能力变成**交付物**，直接对齐工业工具 Data Integrity 报告层。
- **功能**：复用 `report.ts`（v1.17 已有诊断报告导出），扩展为"验收运行报告"（每个 case pass/fail 管段表 + 截图可选）。
- **竞品对标**：IPD Studio 验收交付、工业工具 PDF 报告。
- **实现要点**：与 `vitest` 共享 `assertFlowState(diagram, case)` 断言函数，避免双重实现。

#### P0-5 · 引擎/几何/store 文件级拆分 + CI test workflow
- **用户场景**：S5/工程健康——`store.ts` 68k、`CanvasView.tsx` 6.5k、`geometry.ts` 46k 均为"上帝文件"，扩展与协作痛。
- **价值**：不行为变更，先改边界，降低后续所有改动的回归风险；CI 自动跑 tsc+vitest 防止回归。
- **功能**：`geometry.ts` 拆为 `engine/{disabledBfs,demand,effective,gates,causality}.ts` 并以 re-export 兼容；`store.ts` 拆 `domain/commands`、`domain/selectors`、`app/{history,autosave,clipboard,scenarioSession}`。
- **竞品对标**：现代编辑器 state+domain+view 分层（VS Code command palette 思路）。
- **实现要点**：**每搬一刀保持测试绿**；禁止大爆炸重写；新增 `.github/workflows/test.yml`。

### P1 — 核心产品化

#### P1-1 · 知识库单数据源 + 场景步骤增强
- **用户场景**：S3——同一元件的"注意点"在 knowledge/common、advice/why、HelpPanel 三套文案可能漂移。
- **价值**：消除漂移；场景步骤加旁白/标注/小测验，教学交付升级。
- **功能**：`knowledge/index.ts` 统一 `knowledgeOf(type)`；`ScenarioStep` 增加 `narrator / callouts / quiz / autoAdvanceMs`。
- **竞品对标**：FluidSIM 教材、Coursera 单元式。
- **实现要点**：三套文案全部引用同一条目；支持 `zh/en` 字段。

#### P1-2 · 演示 Presenter 全屏 + 课程包 `.fluidcourse.json`
- **用户场景**：S3——讲师需要全屏、大步骤条、快捷键 N/P/空格、激光笔（blink）、导出演示序列。
- **价值**：把"强引擎的示意编辑器"变成"可交付的培训工具"。
- **功能**：Presenter 模式隐藏库/Inspector；课程包格式聚合 多场景+验收+讲义 Markdown。
- **竞品对标**：Miro 帧顺序演示、FluidSIM 实验指导书。
- **实现要点**：复用 PNG 导出 + 步骤自动切换生成 PDF/PPT 截图序列。

#### P1-3 · tag/线路编号 + 一致性 Linter
- **用户场景**：S5——研发画完图无规范检查，标签重名、泵出口未接、单向阀方向错。
- **价值**：把"绘图规范"体系化，对齐 IPD Studio 的 tag 驱动 + 自动派生，提升图纸专业度与可交付性。
- **功能**：`pipe.tag = "CW-01"` 按流体自动编号；Linter 规则（标签重名 warn / 泵出口未接 error / 单向阀方向错 error / 安全阀泄放口未接 info）。
- **竞品对标**：IPD Studio tag 解析校验 + 回路号自动派生。
- **实现要点**：Linter 与诊断结构层打通；规则可配置（教学/工程两档）。

#### P1-4 · 端口语义可视化 + 连接即时校验
- **用户场景**：S1/S5——新用户画三通阀易错（left=in/right=A/bottom=B）；连接时才知道多连。
- **价值**：降低建模门槛；把"连接后报错"提前到"连接时拦截"。
- **功能**：编辑态 in=蓝三角/out=橙三角/A·B 字母刻端口；拖线时显示合法端口 hint + 预览正交路径；连接时即时拦截并 toast。
- **竞品对标**：React Flow `isValidConnection` + `connectionRadius` 形态、IPD Studio tag 即时校验。
- **实现要点**：磁吸预览与最终落点**调用同一个** `isValidConnection`，从架构上消灭"预览与结果不一致"。

#### P1-5 · 画布交互拆分 + 自动布线避障（libavoid WASM）
- **用户场景**：S5——连接体验弱、无避障、无批量对齐。
- **价值**：直接提升绘制效率（新链 ≤15s 目标）；避障路由是工业图编辑器标配。
- **功能**：`canvas/tools/{select,connect,pan,vertex}.ts` + `useDragMachine`；libavoid 编译为 WASM 跑 Web Worker（主线程零阻塞）；手动画点优先级高于自动；`mxParallelEdgeLayout` 自动分开平行连线。
- **竞品对标**：drawio libavoid、X6 `manhattan`、React Flow 连接语义。
- **实现要点**：**手动折点 > 自动路由**；路由点数组(router) 与样式(connector) 分离（抄 X6）。

#### P1-6 · 启发式"量感"层（不引入求解器）
- **用户场景**：S1/S3——学员想知道"这条管流量大不大""泵后压力高不高"，但图纸无物理参数。
- **价值**：给"量感"而不背负物性库/收敛性成本，守住教学示意定位。
- **功能**：相对流量级联衰减（串联阀系数乘积→粒子密度）、压力域着色（复用运行泵出侧集合）、每条管可编辑 `relativeFlow%`。
- **竞品对标**：epanet-js 太重，故用启发式替代。
- **实现要点**：纯 UI 叠加，不改引擎语义；设置里可关。

#### P1-7 · 机型包 MachinePack + 冷启动项目入口
- **用户场景**：S1/S2——新用户冷启动弱；机型需手动配场景/验收。
- **价值**："打开机型包 = 图纸+场景+验收一次就绪"，强化厂商私有机型库闭环（O1）。
- **功能**：`MachinePack{id,title,diagram,scenarios,validationCases,thumbnail,docs}`；启动页含最近图纸/机型模板/打开验收包。
- **竞品对标**：IPD Studio 无机型库（差异化）；Lucid 模板启动页。
- **实现要点**：复用现有 `machinePack.ts`（v1.17 已引入）。

#### P1-8 · 可 diff 的图纸 + 无头验收 CLI
- **用户场景**：S2/S5——培训现场讲师发机型包，学员交验收结果 JSON；CI 想自动跑验收。
- **价值**：Git 异步协作真相源，比实时 CRDT 务实。
- **功能**：pretty JSON 稳定键序 + `fluidpath-diff a.json b.json`；`npx fluidpath-check BCMTS.json --cases all`（exit code 0/1 供 CI）。
- **竞品对标**：Git 工作流、JUnit 式用例。
- **实现要点**：CLI 调用打包后的 engine；先做 `scripts/check-diagram.mjs`。

### P2 — 专业增强（可选 / 按需）

#### P2-1 · 符号双风格（教学简笔 / 工程 ISA-lite）
- **用户场景**：S5——出口客户可能要更"工程感"的符号。
- **价值**：一套数据双呈现，不增加建模成本。
- **功能**：`symbolId/category/standard("fluidpath"|"isa-lite")/portsDefault` 元数据；双风格 SVG。
- **竞品对标**：QElectroTech 符号库、drawio P&ID 图库。
- **实现要点**：符号元数据驱动，不改连接拓扑。

#### P2-2 · 画布性能四件套（虚拟化/帧合并/GPU 合成/吸附降频）
- **用户场景**：S5——大图（>150 管）性能。
- **价值**：为后续更大图纸铺路。
- **功能**：出视区**真卸载 DOM**（非 display:none）、rAF 帧合并、`translate3d` GPU 合成、网格吸附降 state 频率。
- **竞品对标**：X6 3.0 性能实测做法。
- **实现要点**：视区外扩固定缓冲边距（~120px）防抖动；最小图无需启用。

#### P2-3 · 学员模式计分
- **用户场景**：S6——海外学员自学。
- **用户价值**：只读拓扑 + 拨阀/泵 → 提交"我的工况"与标准验收对比 → 得分报告（纯前端 session，无需账号）。
- **竞品对标**：FluidSIM 对错判定、Coursera quiz。
- **实现要点**：复用验收矩阵 + diffStateIds。

#### P2-4 · 短链/附件分享 + Schema 正式化
- **用户场景**：S2——大图分享码超 URL 长度。
- **价值**：分享可靠性。
- **功能**：网页 gist/r2 短 id 或桌面 `.fluidpack` zip；`schema/diagram.v3.json` + Ajv 校验 + 迁移注册表。
- **竞品对标**：通用工具分享机制。
- **实现要点**：分享链接可选加密压缩（密码派生 key）。

#### P2-5 · OPT-IN 工程分析模块（epanet-js）
- **用户场景**：S5（未来）——真实机型工程校验需求。
- **价值**：当确有需求时，纯前端跑 EPANET 全量水力（WASM，MIT）。
- **功能**：从图纸派生 INP（叠加用户填写的物理属性覆盖层）→ `solveH()` 一次 → 结果写回只读叠加层。
- **竞品对标**：epanet-js（npm 0.9.0，MIT，浏览器直跑）。
- **实现要点**：**严格 OPT-IN，不在默认路径**；物理属性覆盖层与示意图解耦。

#### P2-6 · 插件/扩展点（预留）
- **用户场景**：S1（厂商白牌）——厂商定制机型包/符号。
- **价值**：内部先用，不急着开放。
- **功能**：`FluidPathPlugin{id,commands,inspectorWidgets,engineHooks}`。
- **竞品对标**：tldraw `ShapeUtil`/`BindingUtil` 范式。
- **实现要点**：先内部用，定义清晰 hook 边界。

---

## 5. 分阶段实现方案

> 每阶段遵循交接文档纪律：**先诊断 → 最小改动 → 全量 vitest → 版本纪律 → 更新手册**。每阶段结束可独立交付、可回退（git 已管理）。

### 阶段一 · 加固与对齐（约 2–3 周）
**目标**：把"强引擎的示意编辑器"变成"可信、可交付"的基础，消除已知债务。

| 项 | 技术思路 | 模块划分 | 里程碑 | 验收标准 |
|---|---|---|---|---|
| P0-1 i18n 扫尾 | 接入 `t()` + 组件测试防回归 | `i18n.tsx` + 各组件 + `no-hardcoded-zh.test.tsx` | 英文模式零中文残留 | 组件测试通过；英文模式手动走查无中文 |
| P0-2 场景补齐 | 复用 `scenarios.ts` 角色解析 | `scenarios.ts` + 场景表生成 | 10+ 场景可演示 | 每个新增场景引擎流动验证绿；场景表自动生成 |
| P0-3 三模式 | 收敛现有布尔为 `setMode` 映射 | 新增 `src/modes.ts` + `App.tsx` | 编辑/演示/验收切换 | 模式切换面板显隐正确；退出还原 |
| P0-4 报告导出 | 扩展 `report.ts` | `report.ts` + `ValidationPanel` | Markdown/HTML 验收报告 | 导出含结构问题+因果链+BOM+版本 |
| P0-5 拆分+CI | 文件级拆分 + re-export 兼容 | `engine/*` `domain/*` `app/*` + `.github/workflows/test.yml` | 无行为变更；CI 绿 | tsc+vitest 全绿；CI 自动跑；拆分后测试不炸 |

### 阶段二 · 教学产品化（约 3–5 周）
**目标**：从"示意工具"升级为"培训与验收交付工具"。

| 项 | 技术思路 | 模块划分 | 里程碑 | 验收标准 |
|---|---|---|---|---|
| P1-1 知识单源 | 统一 `knowledgeOf` + 步骤增强 | `knowledge/index.ts` + `scenarios.ts` | 三套文案零漂移 | 同一元件三处文案同源；旁白/quiz 可配 |
| P1-2 Presenter+课程包 | 全屏模式 + `.fluidcourse.json` | `Presenter` 组件 + `coursePack.ts` | 课程包一次就绪 | 导出演示序列；课程包可加载 |
| P1-3 tag+Linter | tag 自动派生 + 规范规则 | `linter.ts` + `Inspector` + `PipeView` | 规范可查 | 重名/未接/方向错自动报错 |
| P1-7 机型包+冷启动 | 复用 `machinePack.ts` | `WelcomePanel` + `machinePack.ts` | 启动入口 | 打开机型包=图+场景+验收 |
| P1-5 连接校验(preview) | `isValidConnection` 形态 | `CanvasView` 连接子系统 | 预览=落点 | 磁吸预览与落点一致；即时拦截 |

### 阶段三 · 专业增强（约 6–10 周）
**目标**：绘制效率、性能、规范深度对齐工业参照。

| 项 | 技术思路 | 模块划分 | 里程碑 | 验收标准 |
|---|---|---|---|---|
| P1-4 端口可视化 | 端口语义渲染 | `symbols.tsx` + `PortEditor` | 端口可辨 | 三通朝向不再画错 |
| P1-5 避障路由 | libavoid WASM in Worker | `canvas/routing.ts` + worker | 自动布线 | 新建链 ≤15s；自动路由不穿节点 |
| P1-6 量感层 | 启发式叠加 | `engine/relativeFlow.ts` + UI | 量感可选 | 粒子密度随级联衰减；可关 |
| P1-8 diff+CLI | pretty JSON + 无头校验 | `scripts/check-diagram.mjs` | CI 可跑验收 | `fluidpath-check` exit code 正确 |
| P2-2 性能四件套 | 虚拟化/帧合并/GPU | `CanvasView` 渲染层 | 大图流畅 | 150 管 ≥30fps；出视区真卸载 |
| P2-1 符号双风格 | 元数据驱动 | `symbols.tsx` + symbol meta | 双呈现 | 同一数据两套符号 |

### 阶段四 · 平台化（按需，不明确排期）
**目标**：协作、计分、插件、OPT-IN 定量。

| 项 | 技术思路 | 验收标准 |
|---|---|---|
| P2-3 学员计分 | 复用验收矩阵 | 提交工况→对比→得分报告 |
| P2-4 短链/附件+Schema | gist/r2 或 `.fluidpack` | 大图分享可靠；Ajv 校验 |
| P2-5 epanet-js 模块 | OPT-IN，派生 INP→solveH | 严格不在默认路径 |
| P2-6 插件 API | `FluidPathPlugin` | 内部白牌可用 |

---

## 6. 关键技术决策（明确立场）

1. **画布：不迁移框架，只反向移植算法**（§2.3）。React Flow 的 DOM 渲染与 SVG 导出冲突、规模不匹配；X6 命令式与声明式世界观冲突。抄 libavoid 避障、X6 性能四件套、Excalidraw/tldraw 绑定与扩展点。
2. **定量层：现阶段不做物理求解，用启发式"量感"**（§2.4）。epanet-js 证明纯前端可行，但图纸零物理参数，引入求解器 = 巨大数据录入 + 稀释定位。epanet-js 仅作 P2-5 OPT-IN 后路。
3. **i18n：P0 必做且加防回归测试**（§2.1 线1 无竞品，但自身债务直接损害出海）。
4. **性能：出视区真卸载 DOM 是铁律**（X6 实测教训：display:none 仍吃 CPU，DOM 膨胀不可逆）。
5. **状态：先拆文件再加大特性**（P0-5 优先于一切新功能）。

---

## 7. 明确「不做」清单（范围边界）

1. **不上完整 CFD / 两相流数值求解**——偏离定位。
2. **不在未拆分 store 前做实时 CRDT 协作**——复杂度不可控。
3. **不把"强制流动"危险建议加回诊断**——已删除有理。
4. **不在 public Pages 追求真安全密码**——应换 Cloudflare Access / 私有托管。
5. **不追工业工程数据库 / 多用户工程库 / DEXPI 全量合规**——local-first 与离线可用是核心。
6. **不迁 React Flow / X6**——自研 SVG 资产是强项，迁移是资产降级。
7. **不为了"像 AutoCAD"重做工业数据库**——机型包 + 规范 Linter 足够。
8. **不硬刚中文路径所有工具**——长期迁英文路径（`~/Projects/fluidpath-studio`）收益更高。

---

## 8. 风险与纪律（沿用交接文档）

1. **git 是最大保险**：每完成一个版本 `git add -A && git commit`；改引擎/图纸前 `cp` 备份到 `/tmp`。
2. **引擎改动**：全量 vitest + BCMTS 回流六场景 + flow-isolation 必绿；遵守"收紧 BFS 边界，不指望递归纠正"。
3. **版本纪律**：升 `src/version.ts` APP_VERSION + CHANGELOG、同步 `package.json` version、`sample.ts` appVersion、手册版本表；打包后 git commit。
4. **中文路径坑**：Grep 工具对中文路径报 `spawn ENOTDIR` → 用 Bash 内 node/grep；改完 `src/` 必须重新 `npm run build` + 重打包 DMG。
5. **Electron 无 `window.prompt`**：任何用户输入用 `PromptDialog`/内联输入。
6. **手册与测试双源**：场景表、验收断言从代码生成，避免漂移。

---

## 附录 A · 竞品清单速查表

| 名称 | 仓库 | Stars | 许可 | 归类 |
|---|---|---|---|---|
| FluidSIM | (闭源) | — | 商业 | 教学仿真(产品竞品坐标) |
| Automation Studio | (闭源) | — | 商业 | 教学仿真 |
| Hopsan | Hopsan/hopsan | 230 | Apache-2.0 | 教学/多域仿真 |
| OpenModelica | OpenModelica/OpenModelica | 1392 | NOASSERTION | 教学/Modelica |
| ModelicaStandardLibrary | modelica/ModelicaStandardLibrary | 610 | BSD-3 | 流体库 |
| OpenHydraulics | modelica-3rdparty/OpenHydraulics | 56 | BSD-3 | 液压库 |
| SimulIDE | Arcachofo/SimulIDE-dev | 318 | AGPL-3.0 | 实时仿真 |
| picuino/neumatic | picuino/neumatic | 8 | GPL-3.0 | 在线气动教学 |
| FluidForge / WalFlow / Moray | 各 0~1 | — | 未声明 | 浏览器教学 |
| IPD Studio | Coldbari/IPD-Studio | 4 | AGPL-3.0 | **P&ID+培训(最像)** |
| pnid_houbolt | SpaceTeam/pnid_houbolt | 4 | LGPL-3.0 | 交互 P&ID |
| DWSIM | DanWBR/dwsim | 538 | GPL-3.0 | 流程模拟 |
| pyDEXPI | process-intelligence-research/pyDEXPI | 217 | AGPL-3.0 | DEXPI 模型 |
| IDAES-PSE | IDAES/idaes-pse | 344 | NOASSERTION | 过程框架 |
| QElectroTech | qelectrotech/qelectrotech-source-mirror | 531 | GPL-2.0 | 符号库/制图 |
| FreeCAD / Flamingo | FreeCAD/FreeCAD(33k)/oddtopus/flamingo(38) | — | LGPL | 3D/管路 |
| draw.io | jgraph/drawio | 7824 | Apache-2.0 | 通用绘图+libavoid |
| React Flow | xyflow/xyflow | 38208 | MIT | 图框架(参照) |
| tldraw | tldraw/tldraw | 50054 | source-available | 画布 SDK(参照) |
| Excalidraw | excalidraw/excalidraw | 130864 | MIT | 手绘白板(参照) |
| AntV X6 | antvis/X6 | 6686 | MIT | 图编辑器(参照) |
| LogicFlow | didi/LogicFlow | 11675 | Apache-2.0 | 流程编排(参照) |
| GoJS | NorthwoodsSoftware/GoJS | 8470 | 商业 | 工业图(标尺) |
| Node-RED | node-red/node-red | 23603 | Apache-2.0 | 流编辑器(参照) |
| EPANET/OWA | OpenWaterAnalytics/EPANET | — | MIT 分支 | 管网求解(基线) |
| epanet-js | npm: epanet-js (0.9.0) | — | MIT | **WASM 前端求解** |
| WNTR | USEPA/WNTR | ~456 | Revised BSD | Python 韧性(非前端) |
| OpenPNM | PMEAL/OpenPNM | — | BSD | 多孔介质(排除) |

---

*文档结束。本建议不与任何现有代码改动绑定；实施时按 §5 阶段切片，每切片遵循 §8 纪律。竞品数据截至 2026-09-01 实测，star 数会随时间变化，引用时建议复核。*
