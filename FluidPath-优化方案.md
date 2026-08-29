# FluidPath Studio · 分方向优化方案

> 基于 `FluidPath-交接文档.md`、源码结构（v1.16.0）与 CAYE/BCMTS 实机图纸的完整审读，对照液路/P&ID 教学与工业制图竞品结构，给出可落地的优化方向。
>
> **定位锚点**：FluidPath 不是通用画图工具，也不是 CFD 仿真；它是「咖啡机/液路教学示意 + 阀位工况实时语义仿真」编辑器。优化应强化这一差异化，而不是盲目追赶 AutoCAD P&ID 的工程深度。
>
> 文档日期：2026-08-26  
> 对照版本：APP 1.16.0 · 引擎三层（BFS / 递归 / 需求域）· 240+ 测试 · 网页版 GitHub Pages

---

## 0. 现状快照与竞品坐标

### 0.1 已具备的核心优势（应保留、勿推倒）

| 能力 | 现状 | 竞品中少见之处 |
|------|------|----------------|
| 实时停流/流动语义 | BFS 相位 + 递归兜底 + 需求域 | FluidSIM 有仿真但偏气动/液压通用；draw.io/Lucid 无物理语义 |
| 教学覆盖 vs 工程状态分离 | `teachingOverride` 与工程导出分离 | 多数示意工具混为一谈 |
| 停流因果链 + 分层诊断 | structure / state 分层、一键修复 | 通用画板几乎没有 |
| 场景角色自适应演示 | 按类型+标签解析角色，换机型跟随 | 多为写死脚本 |
| 工况快照 + 验收矩阵 | 随 JSON 持久化、可交付 | 接近测试用例内嵌图纸 |
| 桌面 + 网页双端 | Electron + GH Pages | 同类教学工具多为单端 |

### 0.2 主要结构债（代码体量信号）

| 模块 | 规模 | 风险 |
|------|------|------|
| `store.ts` | ~1930 行 / 108 export | 上帝对象：状态、历史、场景、工况、剪贴板、图层、批量编辑全堆一处 |
| `CanvasView.tsx` | ~1372 行 | 交互状态机巨大，难测难扩展 |
| `geometry.ts` | ~1056 行 | 几何 + 仿真混文件，职责边界模糊 |
| `symbols.tsx` | ~1081 行 | 符号渲染单体 |
| `styles.css` | ~1723 行 | 无模块化/设计 token |
| `Inspector.tsx` | ~957 行 | 属性面板膨胀 |
| 依赖 | React + gifenc 极轻 | 无状态库/路由/组件库——轻是优点，但协作与扩展会痛 |

### 0.3 竞品结构参考（按「可借鉴层」）

| 竞品类型 | 代表 | 可借鉴 | 不宜照搬 |
|----------|------|--------|----------|
| 教学流体仿真 | FluidSIM、Automation Studio | 工况库、分步实验、成绩/检查点、元件参数面板 | 完整液压/气动库、数值求解器 |
| 工业 P&ID | AutoCAD P&ID、SmartPlant、AVEVA | 符号标准（ISA/ISO）、线路编号规范、数据驱动属性、一致性检查 | 重型数据库、多用户工程库 |
| 通用示意图 | draw.io、Lucidchart、Miro | 布局/对齐、连接器路由、模板市场、评论协作 | 弱化领域语义 |
| 节点图/工作流 | Node-RED、Figma、Excalidraw | 画布性能、快捷键体系、插件扩展、多选批量 | 过度抽象失去液路隐喻 |
| 在线 CAD 轻量 | Onshape（版本）、tldraw | 版本树、分支对比、实时光标 | 云端重依赖 |
| 嵌入式 HMI/PLC 教学 | CODESYS、TIA Portal 教学模式 | 运行态/编辑态切换、I/O 映射表 | 工业授权与协议栈 |

---

## 1. 产品定位与信息架构

### 1.1 问题

- 启动即空白 + 自动弹出使用指南：对「懂行工程师」友好，对「第一次打开的售后/学员」冷启动弱。
- 工具栏功能密度高（导出/图层/工况/演示/诊断/验收/分享…），缺少**按角色的工作模式**。
- 场景仅「冲泡咖啡 / 热牛奶」，与 BCMTS 已验证的 10+ 功能场景（美式、热水杆、清洗、润湿、快冲、排废、补水、降温…）严重不对齐。

### 1.2 竞品结构

- FluidSIM：**编辑模式 / 仿真模式**硬切换；实验向导按课程章节。
- Lucid：**模板启动页** + 最近文件 + 团队空间。
- TIA Portal：**项目视图 / 设备视图 / 网络视图** 分栏。

### 1.3 方案

**P0 — 三种工作模式（信息架构骨架）**

```
编辑 Edit     → 画图、接线、图层、BOM、结构诊断
演示 Present  → 场景步骤、聚焦高亮、教学覆盖、演讲全屏
验收 Verify   → 工况快照、验收矩阵、对比 diff、导出报告
```

- 模式切换改变：可见面板、快捷键优先级、是否允许改拓扑。
- 状态栏明确显示当前模式；演示/验收退出时还原（已有场景快照机制可复用）。

**P0 — 冷启动「项目入口」**

- 最近图纸（localStorage + 桌面最近路径）
- 机型模板：空白 / 最简咖啡链 / BCMTS 教学副本 / BCTMS / 自定义模板
- 「打开验收包」：JSON + 内嵌 validationCases 一键进入验收模式

**P1 — 场景库与机型对齐**

将交接文档 §4.3 功能场景总表产品化：

| 场景 ID | 优先级 | 说明 |
|---------|--------|------|
| coffee | 已有 | 扩展旁白/知识点锚点 |
| milk | 已有 | 同上 |
| americano / hotWand / steamWand | P0 | 热水侧选择链教学 |
| milkClean / wet / quickFlush | P0 | 清洗回路是售后痛点 |
| drain / steamRefill / steamCool | P1 | 辅助回路 |
| fault-demo-* | P1 | 绑定 pipeBlocked / 阀卡死教学案例 |

**P2 — 角色工作区预设**

| 角色 | 默认模式 | 默认面板 |
|------|----------|----------|
| 研发接线 | 编辑 | 库 + Inspector + 结构诊断 |
| 培训讲师 | 演示 | 场景 + 知识卡 + 全屏 |
| 测试/质量 | 验收 | 工况 + 验收矩阵 + 报告导出 |
| 售后排障 | 编辑+诊断 | 因果链 + 故障注入 |

### 1.4 验收标准

- 新用户 3 分钟内能：打开 BCMTS 副本 → 跑通「冲泡咖啡」演示 → 看懂一条停流因果链。
- 场景数量 ≥ 机型主功能 80% 覆盖（BCMTS ≥ 8 个可演示场景）。

---

## 2. 仿真引擎与领域模型

### 2.1 问题

1. **已知近似**（交接 §4.6）：正常制奶时回流管仍显示流动——教学可接受，但缺少「近似说明」产品化入口。
2. 引擎三层并集语义复杂；`geometry.ts` 同时承担路由几何与停流判定。
3. 无**压力/流量/温度数值**，只有布尔流停——对高级培训与设计评审不够。
4. 介质传播靠手动/链式同步（`syncFluidThroughChain`），缺「从源自动推导介质」可选策略。
5. `solenoid3` 端口约定（left=in, right=A, bottom=B）与镜像阀依赖 direction 推断，新用户易画错。

### 2.2 竞品结构

- FluidSIM：元件参数（开度、设定压力）+ 仿真时间轴。
- P&ID 工具：线路介质/规格属性驱动，不跑动态，但有**一致性规则引擎**。
- Modelica/Simscape：连续系统——过重，不建议作为主路径。

### 2.3 方案

**P0 — 引擎模块拆分（不改语义，先改边界）**

```
src/engine/
  disabledBfs.ts      # computeDisabledPipes
  demand.ts           # computeDemandPipes
  effective.ts        # pipeEffectiveDisabled 合成
  gates.ts            # pump/valve 有效状态
  causality.ts        # 从 advice 迁入 traceStopCause
src/geometry/
  ports.ts / route.ts / path.ts / snap.ts
```

- 保持现有导出 API 兼容一层 re-export，测试不炸。
- 文档化「三层判定」为正式 Engine Spec（从交接 §3 提炼为 `docs/engine-spec.md`）。

**P0 — 近似与引擎假设的 UI 可见化**

- 设置中「仿真保真度」：`教学简化`（当前）/ `严格需求域`（未来可关掉 tank 无条件 sink 等）
- 诊断 info 级提示：「回流管在制奶时显示流动属已知简化」——绑定 elementIds，可一键「仅教学隐藏动画」。

**P1 — 可选「介质自动推导」模式**

- 从 inlet/tank/boiler 种子介质，沿开阀路径 BFS 染色；冲突标红（复用 fluidRules）。
- 默认关闭，验收/教学可开；不覆盖用户 `custom`。

**P1 — 端口语义可视化**

- 编辑态：in=蓝三角、out=橙三角、A/B 字母刻在端口；三通阀预览激活支路高亮。
- 库中拖出三通时附「标准朝向」吸附模板，减少镜像踩坑。

**P2 — 轻量定量层（勿上 CFD）**

| 量 | 做法 | 用途 |
|----|------|------|
| 相对流量 0/1/级联衰减 | 串联阀系数乘积 | 动画粒子密度、教学「半开」 |
| 压力域着色 | 已有运行泵出侧集合 | 画布背景热力/图例 |
| 时序步骤时钟 | 场景步 + 可选延时自动下一步 | 接近真实清洗 2s 润湿 |

**P2 — 故障与边界条件库**

- 扩展 `NodeFault`：泄漏（支路分流示意）、传感器失效、滤网堵塞程度。
- 每条故障带：现象描述、期望停流集、推荐排查步骤（接 knowledge）。

### 2.4 风险与纪律

- 任何引擎改动：**全量 vitest + BCMTS 回流六场景 + flow-isolation** 必绿。
- 遵守交接经验：收紧 BFS 边界，不要指望递归纠正过度停流。

---

## 3. 编辑器 UX / 画布交互

### 3.1 问题

- Canvas 交互全集中在单文件状态机（connect/node/port/vertex/marquee…），扩展成本高。
- 正交路由、跨线跳线已有，但缺：**自动布线避障、批量对齐分布增强、连接点磁吸预览一致性**。
- 大图（60+ 节点）仅 MiniMap，缺鸟瞰导航书签、区域框选缩放。
- 符号为手绘 SVG 路径，风格不统一；无 ISA/ISO 风格切换。

### 3.2 竞品结构

- draw.io：连接器路由算法、图层、草图/正式风格。
- Figma：Multiplayer cursor 非必须；**Auto Layout / 对齐网络** 与组件变体。
- Lucid P&ID shape library：标准阀符号 + 数据面板。

### 3.3 方案

**P0 — 画布交互拆分**

```
canvas/
  tools/select.ts | connect.ts | pan.ts | vertex.ts
  hooks/useDragMachine.ts
  overlays/AlignmentGuides.tsx | ConnectPreview.tsx
  CanvasView.tsx  # 只编排
```

**P0 — 连接体验**

- 拉线时显示合法端口（介质/方向 hint）
- 松手前预览将创建的正交路径
- 双击管路插入弯点；`Shift` 约束轴向（部分已有可统一文档化）
- 端口占用：多连结构诊断升级为「连接时即时拦截 + toast」

**P1 — 布局与美化**

| 能力 | 说明 |
|------|------|
| 对齐/分布 | 左中右、顶中底、水平/垂直等距（选中 ≥3） |
| 一键整理 | 选中子图：正交化 + 最小交叉启发 |
| 统一管径/材质 | 按流体类型样式主题（水/奶/汽皮肤） |
| 导航书签 | 保存视口（缩放+平移）为「咖啡区/奶路/排废」 |

**P1 — 符号体系 2.0**

- 符号元数据：`symbolId / category / standard( "fluidpath" \| "isa-lite") / portsDefault`
- 双风格：`教学简笔`（当前）/ `工程示意`（更接近 P&ID）
- 自定义符号：SVG 上传 + 端口打点向导（高级）

**P2 — 性能**

- 节点/管路虚拟化或分层 canvas：静态层缓存、动画层仅流动管
- `React.memo` 管路粒子；停流管跳过 rAF 工作
- 大图（>150 管）自动降粒子密度

### 3.4 验收标准

- 新建「泵-阀-出口」链 ≤ 15 秒（含吸附）。
- 60 节点图 60fps 动画（M 系列芯片基准）；交互延迟主观 < 100ms。

---

## 4. 教学、知识库与演示

### 4.1 问题

- `knowledge.ts` 体量小，元件覆盖不完整；与 Inspector 教学块、Advice「为什么」三套文案可能漂移。
- 场景步骤只有 title/desc，无**旁白时间轴、画中标注、讲师备注、学员问题**。
- 无「课程包」概念：多场景 + 验收 + 讲义导出。

### 4.2 竞品结构

- FluidSIM / 教材：实验指导书 + 检查表。
- Coursera 类：单元 → 视频/交互 → quiz。
- Miro 教学：帧（frame）顺序演示。

### 4.3 方案

**P0 — 知识单一数据源**

```
knowledge/
  devices/*.md 或 *.ts   # 每元件：作用/原理/注意/常见故障
  index.ts               # knowledgeOf(type)
```

- Advice 的 `why`、Inspector 卡片、Help 全部引用同一条目。
- 支持 i18n 字段 `zh` / `en`。

**P0 — 场景步骤增强**

```ts
interface ScenarioStep {
  title: string;
  desc: string;
  narrator?: string;          // 讲师讲稿
  callouts?: { elementIdRole: string; text: string }[];
  valves?: Record<string, ValveAction>;
  addNodes?: string[];
  autoAdvanceMs?: number;     // 自动下一步
  quiz?: { q: string; options: string[]; answer: number };
}
```

**P1 — 演示全屏 Presenter**

- 隐藏库/Inspector；大号步骤条；激光笔（blink）；快捷键 N/P/空格。
- 导出「演示 PDF/PPT 截图序列」（复用 PNG 导出 + 步骤自动切换）。

**P1 — 课程包格式 `.fluidcourse.json`**

```json
{
  "title": "CAYE 全自动售后培训 L1",
  "diagram": "embedded or url",
  "scenarios": ["coffee", "milk", "milkClean"],
  "validationCases": ["..."],
  "handoutMarkdown": "..."
}
```

**P2 — 学员模式**

- 只读拓扑 + 可拨阀/泵 → 提交「我的工况」与标准验收对比 → 得分报告。
- 本地即可，无需账号（网页版 session）。

---

## 5. 诊断、验收与质量交付

### 5.1 问题

- 诊断强，但**报告导出**弱（BOM 有 Markdown，诊断报告未形成交付物）。
- 验收矩阵好，缺：批量跑所有 case 的 CI 钩子、失败 diff 可视化、与 git 工作流结合。
- 结构问题与「绘图规范」（标签命名、线路编号）未体系化。

### 5.2 竞品结构

- 工业工具：Data Integrity Check 报告 PDF。
- 测试平台：JUnit 式用例列表 + 红绿。

### 5.3 方案

**P0 — 诊断报告导出**

- 一键导出 Markdown/HTML：结构问题列表、因果链摘要、出口流停表、BOM、appVersion、图纸名。
- 验收运行报告：每个 case 的 pass/fail 管段表 + 截图可选。

**P0 — 验收运行器增强**

- 「运行全部」进度条；失败项画布跳转；与 `vitest` 共享断言函数（`assertFlowState(diagram, case)`），避免双重实现。

**P1 — 绘图规范 Linter**

| 规则 | 级别 |
|------|------|
| 标签重名 | warn |
| 泵出口未接 | error |
| 单向阀方向与主流介质冲突 | error |
| 安全阀泄放口未接管 | info（BCMTS 已知） |
| 线路编号缺失（可选规范模式） | warn |
| 跨流体误接（奶-蒸汽无单向） | error（部分已有） |

**P1 — CLI 无头验收（工程化）**

```bash
npx fluidpath-check BCMTS.json --cases all
# exit code 0/1，供 CI
```

- 可先做 `scripts/check-diagram.mjs` 调用打包后的 engine。

**P2 — 「设计评审」视图**

- 左右 diff：工况 A vs B 的流停集合差（已有 diffStateIds，扩展到管路流停集）。

---

## 6. 架构与工程化

### 6.1 问题

- `store.ts` 上帝对象；无领域分层。
- 无路径别名/feature 目录；中文路径导致工具链摩擦（交接已记录）。
- Electron 未签名；release 目录 2.1G 历史包堆积。
- 版本纪律人工（version.ts + package.json + sample + 手册）。
- 密码门明文 `GATE_PASSWORD`（已知限制）。
- 交接文档与代码双源，易过时（§9.5 待办checkbox 仍有残留矛盾项）。

### 6.2 竞品/业界结构

- 现代编辑器：`state (zustand/jotai) + domain commands + view`
- VS Code：command palette + contribution points
- 开源画板 tldraw：editor 核心与 UI 分离

### 6.3 方案

**P0 — 状态与命令分层**

```
src/
  domain/          # 纯函数：diagram 变更、无 UI
    commands/      # addNode, connectPorts, applyPreset...
    selectors/     # selection bounds, diagnosisSummary
  app/
    store.ts       # 薄：history + subscribe + 调用 commands
    history.ts
    autosave.ts
    clipboard.ts
    scenarioSession.ts
  engine/
  ui/
```

- 迁移策略：按命令切片搬迁，每搬一刀保持测试绿；禁止大爆炸重写。

**P0 — 版本与发布自动化**

```bash
npm run release -- --bump minor --notes "..."
```

- 自动改 version.ts / package.json / sample appVersion / CHANGELOG
- 生成手册版本表片段
- `release/` 只保留最近 3 个 DMG，旧包进 archive 或 git-lfs 策略说明

**P1 — 工程卫生**

| 项 | 动作 |
|----|------|
| 仓库路径 | 长期迁到纯英文路径（如 `~/Projects/fluidpath-studio`），中文路径作 junction 兼容 |
| ESLint + Prettier | 统一；CI 跑 check |
| GitHub Actions | 已有 deploy；补 `test.yml`：tsc + vitest |
| Electron 签名/公证 | 苹果分发必备；未签名写清企业内部分发流程 |
| 依赖审计 | `npm audit`；Electron 大版本跟踪 |

**P1 — 安全与网页版**

| 级别 | 方案 |
|------|------|
| 现状保留 | 密码门防路人 + robots.txt |
| 增强 | Cloudflare Access / 私有 Pages + SSO |
| 分享链接 | 可选加密压缩包（密码派生 key 解密 diagram），避免 URL 明文巨型 payload |
| Token 纪律 | 交接 §9.5：确保 PAT 已撤销（流程清单化） |

**P2 — 插件/扩展点（预留）**

```ts
interface FluidPathPlugin {
  id: string;
  commands?: Command[];
  inspectorWidgets?: ...;
  engineHooks?: { afterDisableCompute?: ... };
}
```

- 先内部用（厂商定制机型包），不急着开放。

---

## 7. 数据模型、互通与资产

### 7.1 问题

- JSON schema 无正式 JSON Schema / 版本迁移框架（仅 `_version: 3` 与字段 deprecate 迁移）。
- 无与外部工具互通（Excel BOM、SVG 符号包、简易 DXF）。
- 分享码 Base64 塞 URL，大图易超浏览器长度限制。
- 多机型（BCMTS/BCTMS/MSY2）缺少「机型包」元数据（名称、场景、验收、缩略图）。

### 7.2 方案

**P0 — Diagram Schema 正式化**

- `schema/diagram.v3.json` + 加载时 Ajv 校验（dev/test）
- `migrations/v2-to-v3.ts` 注册表；拒绝未知重大版本并提示升级 App

**P0 — 机型包 `MachinePack`**

```ts
interface MachinePack {
  id: "BCMTS";
  title: string;
  diagram: Diagram;
  scenarios: Scenario[];
  validationCases: ValidationCase[];
  thumbnail?: string;
  docs?: string; // markdown
}
```

- 打开机型包 = 图纸 + 场景 + 验收一次就绪。

**P1 — 导入导出矩阵**

| 格式 | 方向 | 用途 |
|------|------|------|
| JSON v3 | 双向 | 主格式 |
| 工程 JSON | 导出 | 去教学覆盖 |
| Markdown BOM | 导出 | 已有，增强规格列 |
| CSV 点表 | 导出 | 阀/泵 I/O 列表给电气 |
| SVG 符号包 | 导入 | 定制元件 |
| PNG/SVG/PDF/GIF | 导出 | 已有 |
| 分享链接 | 双向 | 大图改「短链服务」或「文件附件码」 |

**P1 — 短链/附件分享**

- 网页：gist / r2 / 自建静态上传 → 短 id
- 桌面：`.fluidpack` zip（json + png 预览）

**P2 — 线路编号与属性字典**

- `pipe.tag = "CW-01"` 工业风；按流体自动编号规则。
- 节点 `meta: { manufacturer, partNo, spec }` 供 BOM。

---

## 8. 协作、多窗口与云

### 8.1 问题

- 已有桌面多窗口 + 网页 BroadcastChannel 剪贴板，但是**单机协作**。
- 无评论、无变更归属、无实时双人编辑（对培训现场多人改图可能需要，对核心用户未必）。

### 8.2 竞品结构

- Miro/Lucid：实时协作 + 评论钉。
- Git：异步协作真相源——更适合工程师。

### 8.3 方案（务实路线）

**推荐默认：Git 异步协作，而不是上 CRDT**

**P0 — 「可 diff 的图纸」**

- 导出 pretty JSON 稳定键序；`fluidpath-diff a.json b.json` 显示节点/管/阀位差异。
- 培训现场：讲师发机型包，学员交 validation 结果 JSON。

**P1 — 评论钉（本地）**

- `annotation` 增强：可绑定 elementId、作者名、已解决状态；导出评审报告。

**P2 — 实时协作（仅当明确有多租户需求）**

- yjs/Automerge 绑定 diagram ops；成本高，排期靠后。
- 更轻：「只读观摩链」——讲师广播阀位状态（WebRTC/火堆），学员不改拓扑。

---

## 9. 国际化、无障碍与文案

### 9.1 问题

- i18n 已有中英，但 Inspector/部分 aria 仍硬编码中文。
- a11y 仅少量 `aria-label`；画布对键盘/读屏不友好。
- 术语表未统一（冲泡缸/酿造室、排废/排水）。

### 9.2 方案

**P0**

- 术语表 `i18n/glossary.ts`；全 UI 扫尾硬编码。
- 快捷键面板与设置已有，补「命令面板」Cmd/Ctrl+K 搜索命令（竞品标配）。

**P1**

- 焦点管理：面板 Esc 关闭、焦点返回画布。
- 高对比主题；色觉安全的流停配色（不只靠红绿）。

**P2**

- 日语/德语音译包（若出口培训）；元件符号不依赖文字。

---

## 10. 性能、稳定性与可观测

### 10.1 方案

| 优先级 | 项 |
|--------|-----|
| P0 | ErrorBoundary 已有 → 上报可选（本地 log 环缓） |
| P0 | 引擎缓存失效点审计：任何阀位变更必 `setCachedPipes` |
| P1 | Performance mark：disable 计算耗时 > 16ms 警告 |
| P1 | 自动化 smoke（已有）扩展截图对比（关键场景像素 diff） |
| P2 | OpenReplay/自建仅内网 |

---

## 11. 测试策略优化

### 11.1 现状

- 36+ 文件 / 240+ 用例，领域覆盖强，是项目护城河。

### 11.2 缺口与方案

| 缺口 | 方案 |
|------|------|
| 视觉回归 | Playwright 截场景步骤关键帧 |
| 组件交互测偏少 | Canvas 连接/撤销用 testing-library + 假指针事件 |
| 引擎属性测试 | fast-check：随机小拓扑不变量（泵边界不穿越等） |
| 快照图纸漂移 | BCMTS.json 变更必须附场景矩阵说明（PR 模板） |
| 手册与测试双源 | 场景表从 `scenarios.ts` 生成 Markdown 片段 |

---

## 12. 商业化与产品形态（若走向对外）

> 若仅内部教学可跳过；若对外 SaaS/授权则需要。

| 方向 | 说明 |
|------|------|
| 授权 | 桌面序列号 / 网页座位；机型包加密分发 |
| 版本 | Free（基础编辑+演示）/ Pro（验收 CLI、课程包、符号标准、无密码门品牌） |
| 厂商白牌 | 换肤 + 预置机型包 + 培训门户 |
| 内容市场 | 课程包/机型包分享（审核后） |

---

## 13. 优先路线图（建议排期）

### 第 1 阶段 · 加固与对齐（1–2 周）

1. 引擎/几何/store **文件级拆分**（无行为变化）+ CI test workflow  
2. 场景补齐 BCMTS 主功能（清洗/美式/蒸汽/排废等）  
3. 诊断/验收报告导出 Markdown  
4. 工作模式三态（编辑/演示/验收）信息架构  
5. 交接文档 §9.5 清理 + Token 检查清单  

### 第 2 阶段 · 教学产品化（2–4 周）

1. 知识库单一数据源 + 场景旁白/callout  
2. Presenter 全屏 + 课程包格式  
3. 机型包 MachinePack  
4. 端口语义可视化 + 连接即时校验  
5. Schema 校验与迁移注册表  

### 第 3 阶段 · 专业增强（1–2 月）

1. 命令面板 + 布局工具增强  
2. 符号双风格 / ISA-lite  
3. CLI `fluidpath-check`  
4. 分享短链 / `.fluidpack`  
5. 轻量定量（相对流量）与仿真保真度开关  
6. Electron 签名与发布自动化  

### 第 4 阶段 · 平台化（按需）

1. 插件 API  
2. 学员模式计分  
3. 实时观摩链  
4. 云端题库与授权  

---

## 14. 明确「不建议做」的清单

避免范围爆炸与引擎过度工程（呼应交接 §4.6）：

1. **不上完整 CFD / 两相流数值求解**——偏离产品定位。  
2. **不在未拆分 store 前做实时 CRDT 协作**——复杂度不可控。  
3. **不把 forceFlow 危险建议加回诊断**——已删除有理。  
4. **不在 public Pages 上追求真安全密码**——应换托管与 Access。  
5. **不为了「像 AutoCAD」重做一套工业数据库**——用机型包 + 规范 Linter 足够。  
6. **不在中文路径问题上硬刚所有工具**——迁英文路径收益更高。

---

## 15. 方案对照总表（执行看板）

| 方向 | P0 | P1 | P2 | 主要价值 |
|------|----|----|----|----------|
| 信息架构 | 三模式、冷启动、场景补齐 | 角色预设 | 课程平台 | 降低学习成本 |
| 引擎 | 拆分、近似可见 | 介质推导、端口可视化 | 轻量定量、故障库 | 可信与可教 |
| 画布 UX | 交互拆分、连接预览 | 布局/书签/符号2.0 | 虚拟化 | 绘制效率 |
| 教学 | 知识单源、步骤增强 | Presenter、课程包 | 学员计分 | 培训交付 |
| 诊断验收 | 报告导出、跑全 case | Linter、CLI | 评审 diff 视图 | 质量与交付 |
| 工程化 | store 分层、CI、release 脚本 | 路径/签名/安全升级 | 插件 | 可维护 |
| 数据资产 | Schema、机型包 | 导入导出矩阵、短链 | 属性字典 | 生态 |
| 协作 | JSON diff 工作流 | 本地评论钉 | 实时观摩 | 团队 |
| i18n/a11y | 术语表、命令面板 | 焦点/色觉 | 多语言 | 专业感 |
| 商业 | — | 授权与版本 | 白牌/市场 | 收入 |

---

## 16. 建议的「下一刀」最小闭环

若只选一个迭代（约 3–5 天可感知）：

1. **补 4 个演示场景**（美式、热水杆、牛奶清洗、排废）复用现有 role + presets。  
2. **验收/诊断一键导出 Markdown 报告**。  
3. **UI 三模式切换**（先做面板显隐与顶部 Segmented Control，不深改引擎）。  
4. **CI：push 跑 `tsc + vitest`**。  

这四项不碰引擎深水区，但能立刻让产品从「强引擎的示意编辑器」变成「可交付的培训与验收工具」——与竞品结构中 FluidSIM 的实验层、工业工具的检查报告层对齐，同时保持 FluidPath 的实时液路语义差异化。

---

## 附录 A · 关键源码锚点

| 主题 | 路径 |
|------|------|
| 仿真核心 | `src/geometry.ts` |
| 状态/场景/工况 | `src/store.ts` `src/scenarios.ts` `src/presets.ts` |
| 诊断 | `src/advice.ts` `src/diagnostics.ts` |
| 画布 | `src/components/CanvasView.tsx` |
| 导出分享 | `src/export.ts` |
| 知识 | `src/knowledge.ts` |
| 桌面壳 | `electron/main.cjs` |
| 机型快照 | `BCMTS.json` `BCTMS.json` `MSY2.json` |
| 手册 | `FluidPath-交接文档.md` |

## 附录 B · 竞品能力映射（摘要）

```
                    FluidPath 现状    目标态（本方案后）
实时阀位语义            ★★★★★           ★★★★★（保持）
教学分步                ★★☆☆☆           ★★★★☆
验收/测试交付           ★★★☆☆           ★★★★★
标准符号/工业规范       ★★☆☆☆           ★★★☆☆
协作                    ★★☆☆☆           ★★★☆☆（Git 向）
云与权限                ★☆☆☆☆           ★★★☆☆
定量仿真                ★☆☆☆☆           ★★☆☆☆（有节制）
绘制效率/自动布局       ★★★☆☆           ★★★★☆
工程可维护性            ★★☆☆☆           ★★★★☆
```

---

*本文为优化方案，不直接改代码。实施时按第 13 节阶段切片，每切片遵循：先诊断 → 最小改动 → 全量 vitest → 版本纪律 → 更新本方案进度。*

---

## 17. 复审增补（2026-08-27 二次深查）

> 项目自首版方案后无代码变更（仍 v1.16.0 / git ec24309 / tsc 0 错误 / scenario 测试 12 绿）。本节为二次深查的**增量发现与修正**，含对首版方案的勘误。

### 17.1 勘误：知识库覆盖实为 100%

- 首版 §4.1 称「knowledge.ts 体量小、覆盖不完整」——**不准确**。
- 实测：`KNOWLEDGE` 共 **47 条**，与 `NodeType` 全集 **47 种一一对应，零缺口**（含 shape/label/annotation 等非流控件）。
- 知识库的真实问题是另外两个：
  1. **无 i18n**：全部条目纯中文，英文模式下教学卡仍是中文；
  2. **三套文案未打通**：knowledge 的 `common`、advice 的 `why`、HelpPanel 的内容各自成文，同一元件的注意点可能漂移（首版判断正确，此处维持）。

### 17.2 新发现：i18n 缺口是 bug 级别，而非「待完善」

以「剥离 `t("…")` 调用后仍含中文」为口径实测组件（不含注释的行）：

| 位置 | 未翻译行数 | 用户影响 |
|------|-----------|----------|
| `CanvasView.tsx` 右键菜单 | ~59 | **右键菜单整体无 i18n**（「📋 复制节点」「🎨 复制样式」等全是硬编码中文） |
| `Inspector.tsx` | ~60 | 批量替换标签 placeholder、分区标题等 |
| `AdvicePanel.tsx` | ~32 | 诊断面板部分文案 |
| `PortEditor.tsx` | ~12 | 「端口（N）」「流向」上/右/下/左 |
| `PasswordGate.tsx` | ~5 | **网页版第一屏**「请输入访问密码」——英文用户进门前就见中文 |
| `ErrorBoundary.tsx` | ~2 | 崩溃界面「⚠️ 发生错误」（最狼狈的时刻露出中文） |
| `HelpPanel / LayerPanel / MiniMap / PipeView / ConditionPanel / ScenarioPanel / ShortcutSettings / ColorSwatch / Library / ContextMenu` | 各 1–17 | 零散 title/aria-label/占位文案 |

- **与 v1.12.0「默认英文」承诺直接矛盾**：切到英文后，右键菜单、密码门、端口编辑器、错误页仍是中文。
- 建议升为 **P0**：新建 `fluidpath.i18n.audit` 清单（上述行号已定位），一次性扫尾；并加一条组件测试——「英文模式下渲染主要面板，断言无中文字符」（防回归，比人工清单更可靠）。

### 17.3 新发现：App.tsx 已在「自发长出」模式切换

现状代码（App.tsx L123）：

```tsx
{showAdvice ? <AdvicePanel/> : showValidation ? <ValidationPanel/> : <Inspector/>}
```

- 右侧槽位三选一靠嵌套三元；`showScenario / showSearch / showHelp / showShortcuts / showValidation` 五个布尔各自为政。
- **这正是 §1.3 三模式提案的最强现状证据**：代码已经用布尔标志手工模拟「互斥工作现场」，缺的只是把布尔组合收敛为 `mode → 面板可见性/快捷键/画布权限` 的一张映射表。
- 实施路径因此更清晰：**不是新增概念，而是收敛既有布尔**——`setMode("edit"|"present"|"verify")` 内部驱动这批 show 标志 + 三栏折叠 + 快捷键优先级。改动面集中在 App.tsx 一个文件，零引擎风险。

### 17.4 新发现：项目根目录杂散文件（8月25日晚生成）

6 个 untracked 文件，均为 2026-08-25 23:25 左右生成（首次分析之后）：

- `tee-01-angled.svg` / `tee-02-digital.svg` / `tee-03-ghost.svg` / `tee-04-instrument.svg` / `tee-concepts-overview.svg`（T 恤/三通概念图，1800×1200）
- `02-33-38-tshirt-prompt.txt`（对应 prompt 文本）

建议：与 FluidPath 无关 → 移出项目根（`~/Documents` 其他目录）或删除；与元件符号设计相关 → 挪入 `design/` 目录并 git 提交。勿留在根目录污染交接视图。

### 17.5 维持不变的结论（复核后确认）

- 场景角色解析对 BCMTS 健康工作（`scenario.test.tsx` 12 用例全绿）；场景数量缺口仍是 2/10+。
- tsc 零错误；`store.ts` ~1930 行 / `CanvasView.tsx` ~1372 行的体量风险判断不变。
- release/ 2.1G 历史包堆积不变。
- 首版路线图优先级全部维持，仅 §17.2 的 i18n 扫尾从 P0 建议升级为「P0 且加自动化防回归」。

### 17.6 复审后的「下一刀」微调

首版 §16 四项维持，追加第 5 项（半天可完成、用户可感知度高）：

5. **i18n 扫尾**：右键菜单 + PasswordGate + ErrorBoundary + PortEditor 四处硬编码中文一次性接入 `t()`；加「英文模式无中文残留」组件测试。这是当前唯一「承诺了但没做到」的功能缺口，修复成本最低、观感提升最直接。
