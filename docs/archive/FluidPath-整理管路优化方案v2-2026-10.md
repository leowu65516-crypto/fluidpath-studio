# FluidPath Studio · 「整理管路」深度优化方案 v2

> 日期：2026-10-27 · 对照版本：v1.36.2（git `576d978`）
> 性质：在《评估报告 2026-10》初版建议基础上的**深挖更新版**——所有建议均经真实图纸量化模拟或合成场景验证，附可直接粘贴的实施提示词
> 方法：7 份真实机型图（519 条管路）策略模拟 + 合成场景算法验证 + 工业布线算法对标（libavoid / yFiles / VLSI 通道分配）
> 关联文档：`docs/FluidPath-评估报告-2026-10.md`（初版建议）、`docs/current-state.md`（功能事实）

---

## 0. TL;DR

**用 7 份真实图纸跑了策略模拟，结论推翻了"全图整理"的合理性：**

1. **全图整理在 7 份真实机型图上 6 份越整越差**——重合对净增（BCMTS 1→2、MSY2 **0→4**、Smart Y BCTMS 0→3……），同时**摧毁全部 294 条手工布线**。它唯一稳定的用途是整理模板生成的规整图。
2. **选择性整理（只碰重叠管）实测零破坏修复**：BCMTS / BCTMS 各只需重排 2 条管即可把重合清零，其余 5 份图重合管本来就没有手工折点，整理对它们是零成本。
3. **"同通道错层"算法在合成场景验证有效**：3 根管避同一障碍，当前算法会抢同一走廊，错层后各占一档（间距 = 1×净空），0 重合、代价仅多 2 个弯。
4. 因此 v2 的核心主张从初版"补 A* 避障"调整为：**先改整理策略（保护手工布线 + 只修重叠 + 错层），再谈更深算法**。A* 降级为 P1 且仅在候选全败时触发。
5. 附带发现两个真 bug：**无端口游离管完全不走避障**（直连分支）；**三份项目根图纸共用 id `diagram_optimized`**，autosave 按图 id 隔离会互相覆盖。

---

## 1. 实测证据

### 1.1 模拟方法

对每份图纸执行三种策略并统计：`findPipeOverlaps`（应用现有重合检测）× 整理前 / 全图整理（全部 `points=[]` 模拟现有按钮）/ 选择性整理（仅清空重合检测涉及的管）。

### 1.2 数据（7 份真实机型图，2026-10-27 实测）

| 图纸 | 管路 | 手工折点管 | 重合 before | 全图整理后 | 选择性整理后 | 全图破坏 | 选择性只碰 |
|---|---:|---:|---:|---:|---:|---:|---:|
| BCMTS | 74 | 47 | 1 | 2 ⬆ | **0** | 47 | **2** |
| BCTMS | 70 | 46 | 1 | 1 → | **0** | 46 | **2** |
| MSY2 | 71 | 39 | 0 | **4** ⬆ | 0（本无） | 39 | 0 |
| Smart X BCMT-统超定制 | 73 | 41 | 0 | 2 ⬆ | 0（本无） | 41 | 0 |
| Smart X BCTM2SY-Eng | 80 | 49 | 0 | 2 ⬆ | 0（本无） | 49 | 0 |
| Smart Y BCTM2 | 66 | 39 | 0 | 2 ⬆ | 0（本无） | 39 | 0 |
| Smart Y BCTMS | 72 | 33 | 0 | 3 ⬆ | 0（本无） | 33 | 0 |
| **合计** | **519** | **294** | **2** | **16** | **0** | **294** | **4** |

**三个硬结论：**

1. **全图整理是重合的制造者而非修复者**：7 图合计重合对 2 → 16，唯一不恶化的 BCTMS 也只是持平。原因：单管贪心 + 候选集有限 → 多管抢同一条贴障碍走廊（同通道叠线），清掉手工通道后该效应暴露。
2. **破坏面 = 294/519（57%）**：用户手工维护的机型图（这正是 FluidPath 的核心资产）被一键清空，撤销虽可用但用户不感知。
3. **选择性整理的修复成本极低**：有重合的两份图各只碰 2 条管；无重合的五份图天然零成本。"保护手工布线"与"消除重合"不冲突。

### 1.3 合成场景验证（错层算法）

构造 3 根水平管（y=110/140/160）横穿同一障碍（100×100），两侧绕行：

- **错层算法**（占用感知候选 + 占用惩罚，见 §3.2）：三管分别落到走廊 y=82 / 64 / 218——各占一档，**重合对 = 0**；相比抢同一走廊，代价仅为 B 管多 2 段短折线。
- 附带发现：把无端口的游离管喂给真实 `pipePolyline` 时输出**直连**（不走避障分支）——游离管场景避障缺失（§3.4）。

### 1.4 工业算法对标（定位差距）

| 参照 | 机制 | 与 FluidPath 的差距 |
|---|---|---|
| [libavoid / Adaptagrams](https://github.com/mjwybrow/adaptagrams)（[论文](https://www.researchgate.net/publication/285461531_Seeing_Around_Corners_Fast_Orthogonal_Connector_Routing)，2026-02 仍在维护） | A* 可见性图搜索，代价 = 长度 + 弯折 + 穿越惩罚，**全局最优** | FluidPath 是"有限候选枚举 + 贪心"，密集障碍场可能无好候选 |
| [yFiles 正交布线](https://docs.yfiles.com/yfiles-layout-reactflow/types/orthogonallayoutoptions) | 通道/流网络式**全局**正交布线，最小化弯折与交叉 | FluidPath 完全没有管间协调层 |
| VLSI 通道分配（left-edge 算法） | 同一通道内多线段分配互不重叠的轨道 | 对应 FluidPath 缺的"同走廊错层"，这正是 §3.2 的理论依据 |
| [Syncfusion EJ2](https://ej2.syncfusion.com/javascript/documentation/diagram/connectors/connector-segments/connector-orthogonal)、[ortho-graph](https://github.com/ThomasAstley/ortho-graph) | 正交段自动重排避让 | 产品级先例：避让重排是图编辑器标配 |

**定位结论**：不需要（也不应该现在）上 libavoid 级全局求解器——FluidPath 图纸规模（≤100 管）与"手工布线为主、自动布线为辅"的使用方式，决定了**策略层修复（选择性 + 错层）的收益/成本比远高于换算法**。

---

## 2. 设计总纲：「零重工」原则

所有方案对齐一条用户价值主线——**任何自动行为不得让用户重画手工布线**：

```
整理的四级火力（从保守到激进）：
① 微调（nudge）：把重叠对中的一条垂直/水平平移 k×净空，两端布线全保留
② 选择性整理：只清空"自动布线且参与重合"的管
③ 选区整理：只清空用户选中的管（已有：Inspector 批量重路由）
④ 全图整理：需确认弹窗 + 整理后常驻"撤销本次整理"
手工布线的管（routeMode=manual）永远不被 ①–④ 自动触碰
```

---

## 3. 优化方案（v2 更新版）

> 与初版差异：A1/A2 合并升级为"策略分级 + 错层"双 P0（实测数据支撑）；初版 P1 的 A\* 降级为触发式兜底；新增 4 个实测发现的修复项；全部给出实施提示词。

### A1 · 整理策略分级 + routeMode 标记 【P0】

**问题**：现在"整理管路"四档火力只有一档（全图清空），且不区分手工/自动。
**方案**：

1. `Pipe` 增加可选字段 `routeMode?: "manual" | "auto"`：用户拖出折点时置 `manual`，`batchReroutePipes`/模板生成置 `auto`（省缺 = auto，旧图纸兼容）。
2. 工具栏/右键"整理管路"改为**智能整理**：只清空 `routeMode!=="manual"` 且参与重合的管（复用 `findPipeOverlaps` 的 pipeIds）；无重合时提示"无需整理"。
3. 全图重排收进"更多操作"改名"重排全部（清空手工折点）"，点击弹 `confirm` 说明破坏面（可顺手报出"将清空 N 条手工布线"）。
4. 重叠警告（SmartDrawingPanel）的按钮从"整理管路"改为"修复这 N 处重合"→ 走 ①+② 火力。
5. 整理执行后 toast 常驻"撤销整理"按钮 8s（复用 SaveNudge 模式），替代目前一闪而过的 toast。

**验收**：模拟脚本指标固化进 vitest——对 7 份样例图纸断言"智能整理后手工折点管数量不变、重合对 ≤ before"。

### A2 · 同通道错层（占用感知候选）【P0，合成场景已验证】

**问题**：多管避同一障碍时全选同一条贴边走廊 → 叠线（真实图全图整理后重合净增的直接原因）。
**方案**（改 `autoRoute`，约 +30 行）：

```ts
// 模块级占用表：key = `h:${y}` / `v:${x}`（长段 >40px 才记），value = 已占用次数
// 1) 候选生成处：对每个障碍边缘走廊 y（或 x），额外生成 ±k×ROUTE_CLEARANCE (k=1,2) 的错层档
// 2) 代价评估处：候选主段的走廊键若已被占用，cost += occupiedCount × 400（介于拐点 60 与穿模 1e6 之间）
// 3) batchReroutePipes 按管序串行评估（贪心，无需全局求解），结束后清空占用表
```

**验收**：合成用例——3 管同避 1 障碍，断言 3 条主段走廊坐标互不相同且间距 ≥ ROUTE_CLEARANCE；真实图纸回归——全图重排后 `findPipeOverlaps` 计数不高于整理前（当前是 2→16，目标 ≤2）。

### A3 · `autoRoute` 直接单测【P0】

`geometry.test.ts` 目前对 `autoRoute`/`routeCost`/`ROUTE_CLEARANCE` **零覆盖**（已核实）。补四组合成用例：单障碍 L 绕行、两障碍间穿通道、死角绕行、平行管错层。改净空或候选集时才有报警。

### A4 · 修复实测发现的两个 bug【P1】

1. **无端口游离管不走避障**：`pipePolyline` 的 `!fromPort || !toPort` 分支直接 `autoMids` 直连。游离端（拖了一半的管、旧数据）会直穿元件。修复：该分支也走障碍检测（把 `fromPoint/toPoint` 当伪端口处理）。
2. **图纸 id 冲突**：项目根三份样例 `BCMTS/BCTMS/MSY2.json` 的 id 全是 `diagram_optimized`，而 autosave/崩溃恢复按图 id 隔离 → 互相覆盖。修复：样例文件改唯一 id（一次性迁移），或 `loadDiagram` 检测 id 冲突时重生成。

### B1 · 触发式 A* 网格兜底【P1，降级自初版 P1】

仅当所有候选 cost 都含穿越（`bestCost ≥ 1e6`）时，以 `ROUTE_CLEARANCE` 为格距、障碍外扩为禁行格跑一次 A*（代价 = 长度 + 60×转弯）。常规路径零开销，密集死角有解可寻。对标 libavoid 的可见性图思想但只做网格近似，控制在 ~120 行。

### B2 · 整理预览（ghost）【P1】

全图重排（唯一的高危操作）先以虚线 40% 透明度渲染新布线 + 底部确认条（"应用 / 放弃"），复用 AI 计划"校验并预览 → 应用"的交互哲学。智能整理（A1）因零破坏可直接执行免预览。

### B3 · curved 管跳过【P1】

`routing:"curved"` 的管清 points 后会被正交候选拉直（当前行为，未在 UI 提示）。智能整理与全图重排均跳过 curved 管。

### B4 · 大图性能缓存【P2】

无 points 的管在节点拖动中每帧全量重算（每管 O(候选×障碍)）。74 管实测无感；**触发条件**：>150 管或 `getEnginePerfStats` 超 16ms 频次上升时，拖动中用拖起前缓存、松手才重算。现在不做。

### C · 正交通道系统（libavoid 级）【不做，写明触发条件】

工程量 2–4 周且改变布线手感。**触发条件**（满足其一再评估）：单图 >150 管；或 A1+A2 落地后重合对仍 >5/图；或用户反馈自动布线仍不可用。

---

## 4. 实施提示词（按序粘贴给编码 AI）

> 每条已内嵌实测数据、文件锚点与验收标准；执行纪律沿用交接手册 §5.5。

**① routeMode + 智能整理（A1）**

```
为 FluidPath Studio 实现"智能整理"替代现全图整理。背景实测：7 份真实图纸全图整理使重合对从 2 增至 16 并摧毁 294 条手工布线。
改动：① src/types.ts 的 Pipe 增加可选 routeMode?: "manual"|"auto"；② 用户拖管折点（CanvasView vertex 拖动结束处）置 "manual"；③ src/store.ts 新增 smartTidyPipes()：用 src/smart-draw/overlap.ts 的 findPipeOverlaps 找重叠管，仅清空其中 routeMode!=="manual" 且 points 为可清状态的管（一次 undo 记录），返回 {fixed, untouchedManual}；④ Toolbar.tsx 的 tidy-pipes 按钮（data-testid="tidy-pipes"）与 CanvasView 右键菜单项改调 smartTidyPipes，toast 显示"已修复 N 处重合（保留 M 条手工布线）"，无重合时 toast"未发现管路重合"；⑤ 原 batchReroutePipes 全图调用收进 SmartDrawingPanel"更多操作"改名"重排全部管路（将清空手工折点）"，onClick 加 confirm 报出将清空的手工管数量；⑥ 重叠警告项的点击改为调 smartTidyPipes。
验收：新增 vitest——加载根目录 BCMTS.json 断言 smartTidyPipes 后手工折点管数不变且重合对为 0；diagnostics/e2e-workflow 等现有测试全绿；npm run check 通过。
```

**② 同通道错层（A2）**

```
为 FluidPath Studio 的 src/geometry.ts autoRoute 增加占用感知错层，消除多管同走廊叠线（真实图全图重排重合 2→16 的根因）。
实现：① geometry.ts 模块级 Map<string,number> 走廊占用表，batchReroutePipes 开始时清空；② autoRoute 候选生成：对每个障碍（已外扩 ROUTE_CLEARANCE）边缘走廊线，追加 ±1、±2×ROUTE_CLEARANCE 的平行错层候选；③ routeCost 增加占用惩罚：候选的 >40px 水平长段按 key=`h:${round(y)}`、垂直按 `v:${round(x)}` 查占用表，occupiedCount×400 计入 cost（不得高于穿模 1e6）；④ 选中后把该候选的长段键写入占用表（+1）；⑤ pipePolyline 对 routeMode==="manual" 的管完全走 points 不进 autoRoute（保持现状逻辑，显式短路）。
验收：新增合成 vitest——同障碍 3 平行管依次布线断言三条水平主段 y 互异且相邻差 ≥ ROUTE_CLEARANCE、互相不 segHitsRect；对根目录 7 图纸样例断言全量 points=[] 重算后 findPipeOverlaps 计数 ≤ 原始值；既有 reflux/flow-isolation/smart-layout 回归全绿。
```

**③ autoRoute 单测（A3）**

```
为 src/geometry.ts 的自动走线补直接单测（src/__tests__/autoroute.test.ts）：合成节点+无折点管路（用 fromPoint/toPoint 或构造带端口节点），断言：① 单障碍 L 绕行路径任何段不与障碍外扩盒相交；② 两障碍间通道走行取更短走廊；③ 死角场景仍有解且不穿模；④ 同走廊多管在占用表下互不叠线（与②共用场景）；⑤ ROUTE_CLEARANCE 常量改动会影响以上断言（作为守护）。用例不依赖具体坐标快照，只断言不变量。
```

**④ 游离管避障 + 图纸 id 唯一化（A4）**

```
修复两个实测问题：① src/geometry.ts pipePolyline 中 !fromPort||!toPort 分支当前直连不走避障——改为：任一端游离时仍收集障碍（不排除端点节点），用与主路径相同的候选+代价逻辑生成 mids，仅当两端都游离时退回 autoMids；② 根目录 BCMTS.json/BCTMS.json/MSY2.json 的 id 均为 "diagram_optimized"，autosave 按图 id 隔离会互相覆盖——三份样例 id 改为唯一值（bcmts-sample/bctms-sample/msy2-sample），同步更新引用这些 id 的测试与文档；loadDiagram 对导入的重复 id 不做破坏性变更（本次只改样例文件）。
验收：新增 vitest 覆盖游离管避障；全量 npm run check 绿；autosave 恢复横幅在依次打开三份样例时不再串图。
```

**⑤ A* 兜底 + 整理预览 + curved 跳过（B1/B2/B3，一个版本打包）**

```
为 FluidPath 整理管路补三件套：① geometry.ts 在 autoRoute 所有候选 bestCost≥1e6（全穿模）时，以 ROUTE_CLEARANCE 为格距生成网格、障碍外扩盒为禁行格跑一次 A*（cost=曼哈顿长度+60×转弯），取最短正交路径，失败回退现有 best；② Toolbar/右键的"重排全部管路"加 ghost 预览：先计算全部新折线并以 stroke-dasharray 虚线 40% 透明度叠加渲染（新组件 RoutePreviewOverlay），底部固定条"应用 / 放弃"，应用才写 points；③ 智能整理与重排全部跳过 routing==="curved" 的管并在 toast 注明跳过数量。
验收：A* 用例（死角合成图）断言有解不穿模；预览期间按 Esc/放弃画布无残留；curved 管折点保持不变；npm run check + smoke 绿。
```

---

## 5. 排期与预期收益

| 批次 | 内容 | 量级 | 预期收益（对照 §1.2 基线） |
|---|---|---|---|
| 第 1 批 | ①+②+③ | 2–3 天 | 重合对 16→≤2（重排后）；手工布线破坏 294→0；算法改动有测试护栏 |
| 第 2 批 | ④ | 1 天 | 游离管不再穿模；样例 autosave 串图消除 |
| 第 3 批 | ⑤ | 2–3 天 | 高危操作可预览可放弃；死角有解 |
| 暂缓 | 通道系统 | — | 触发条件见 §3.C |

**对"避免重工"的直接兑现**：第 1 批落地后，用户 294 条手工布线永久受保护；重合修复只碰 2–4 条管；即使触发全图重排也有预览与放弃双保险。

---

## 6. 附录

- 模拟脚本：本轮临时 vitest（已按项目纪律用后即删），复现方式见 §1.1 方法描述 + §4-② 的验收用例。
- 算法来源：[libavoid/Adaptagrams（ Seeing Around Corners: Fast Orthogonal Connector Routing）](https://www.researchgate.net/publication/285461531_Seeing_Around_Corners_Fast_Orthogonal_Connector_Routing) · [Orthogonal connector routing (2009)](https://scispace.com/papers/orthogonal-connector-routing-1win6bglo1) · [yFiles OrthogonalLayoutOptions](https://docs.yfiles.com/yfiles-layout-reactflow/types/orthogonallayoutoptions) · [Syncfusion EJ2 正交连接线](https://ej2.syncfusion.com/javascript/documentation/diagram/connectors/connector-segments/connector-orthogonal) · [ortho-graph](https://github.com/ThomasAstley/ortho-graph) · [KIT 正交布线优化论文](https://i11www.iti.kit.edu/_media/teaching/theses/ba-gehring-14.pdf)
- 现状事实：`docs/current-state.md`（1.36.2 整理管路入口三处）、初版建议 `docs/FluidPath-评估报告-2026-10.md`
