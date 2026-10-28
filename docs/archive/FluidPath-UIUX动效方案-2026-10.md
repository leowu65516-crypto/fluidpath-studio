# FluidPath Studio · UI/UX 动效升级方案与提示词手册

> 版本：2026-10-25 · 对照版本：v1.32.1（git `18a44e8`）
> 范围：视觉（UI）、体验（UX）、动画（动效）三个层面的灵感转化与落地实施
> 灵感来源：美叶 meiye.art（瑜伽冥想品类，实测浏览）+ Dribbble（三个方向实搜）
> 性质：设计方案 + 可直接复制的 AI 实现提示词，供后续逐项排期执行
> 纪律基线：所有改动遵循项目现有工程纪律（`FluidPath-交接文档.md` §5.5）——动画只动视觉层、每步 `npm run check` + smoke 全绿、深浅双主题验证

---

## 1. 背景与调研方法

FluidPath Studio 的核心体验是"**液体在管路里流动**"——改一个阀位，画面上的水路立刻变化。这个产品本体决定了它的动效语言天然属于"流体、连续、有生命感"的词库，而当前实现（等距粒子圆点、2.4s 闪烁定位、橙色因果链点亮）已有正确的词汇表雏形，但缺**质感**与**体系化**。

本次调研实地浏览了两个设计库：

| 来源 | 实际浏览内容 |
|---|---|
| 美叶 meiye.art | 瑜伽冥想行业分类案例网格（2 屏）+ 代表性案例详情（冥想 App 全套界面） |
| Dribbble | `fluid-animation`、`dashboard-motion-design`、`flow-line-animation` 三个搜索方向的结果页 |

结论先说：**两个库都能用，但用法完全不同**——Dribbble 的流体/流线方向与产品主题天然同构，直接对标管路动画；美叶的 wellness 视觉基因提供"温度感"与"呼吸感"，适合注入容错层与产品脸面（向导、空态、状态反馈），不适合全面铺开。

---

## 2. 两个库的视觉基因（现场证据）

### 2.1 美叶 · 瑜伽冥想品类

- **色彩**：大地色系——米白 / 沙色 / 鼠尾草绿 / 陶土 / 暖灰；无高饱和撞色
- **形态**：大圆角卡片（16–24px）、高留白的"呼吸感"排版
- **动效词汇**：**呼吸圆环**（breathing circle）是品类核心交互元素；进度呈现为柔和圆环 / 波纹，而非硬数字条
- **装饰**：柔和自然摄影、细线图标、人文衬线标题 + 温和无衬线正文
- **美叶站自身的流行筛选体系**：渐变、毛玻璃模糊、大圆角、插画、手绘、大字排版

### 2.2 Dribbble 三个实搜方向

| 搜索词 | 看到的趋势 | 与 FluidPath 的关系 |
|---|---|---|
| `fluid-animation` | 流体模拟可视化、液态渐变 mesh、波浪流动曲线、流体粒子 | **天然同构**——产品主题就是"液路" |
| `dashboard-motion-design` | 深色仪表盘、渐变数据卡、玻璃拟态、折线图绘制动效、柔和多层阴影 | 对标深色主题 + 诊断面板 |
| `flow-line-animation` | 沿路径的流光 / 光点、路径描边动画、波纹扩散 | **直接对标管路粒子动画** |

---

## 3. 核心策略：分层应用，而非整体风格化

"瑜伽冥想"对一个咖啡机图纸工具不是跑题——wellness 品类的动效语言（呼吸、波纹、流光、渐变过渡）描述的正是"连续、柔和、有生命感的介质运动"，与液路工具在**动效语义上是同一个词库**。但工程工具的效率与语义稳定性不可让步，因此采用三层策略：

```
内容层（画布里的水/奶/蒸汽/仪表）→ 尽情柔美：流光、呼吸、波纹、渐变、慢节奏（600ms–3s）
容器层（工具栏/面板/弹窗/按钮）  → 保持克制：150–250ms、效率优先、统一缓动
语义层（介质色/状态色/诊断色）    → 绝对稳定：工程语义不可被风格侵蚀
```

这条线是全部取舍的判据：任何灵感先问"它落在哪一层"。

---

## 4. 匹配矩阵

### 4.1 适合引入（8 项，按价值排序）

| # | 灵感来源 | 落地位置 | 层 |
|---|---|---|---|
| 1 | Dribbble 流线光点 / 路径描边动画 | **管路粒子 2.0**：等距圆点 → 拖尾流光（stroke-dashoffset + 渐变描边），流动质感质变 | 内容 |
| 2 | Dribbble 液态渐变 | **介质过渡渐变**：锅炉进出段冷水蓝→热水橙自然过渡，而非硬切 | 内容 |
| 3 | 美叶呼吸圆环 | **锅炉呼吸光环 / 压力表微波动**：供水链流动时锅炉外圈 3s 呼吸光环；复用现有 fault breathe 机制扩展 | 内容 |
| 4 | Dribbble 波纹扩散 | **出口事件涟漪**：出咖啡 / 喷蒸汽瞬间出口符号处一圈 600ms ripple，强化"事件发生"感知 | 内容 |
| 5 | 美叶毛玻璃 + 大圆角 | **智能绘图向导升级**：产品对外第一屏，最值得先做；保存 pill 同步 | 容器 |
| 6 | Dribbble 深色发光管路 | **深色主题运行管路微光**（≤12% 不透明度 glow），一眼分辨整机流态 | 内容 |
| 7 | 美叶空态插画 | **空画布引导卡**加"一杯咖啡 + 三条介质曲线"极简线条插画 | 容器 |
| 8 | 两库共通的微动效体系 | **Motion Tokens**：统一时长 / 缓动 / 位移尺度，toast / 横幅 / pill 用同一套曲线 | 容器 |

### 4.2 必须回避（4 项）

| 回避项 | 原因 |
|---|---|
| 高饱和撞色 / 大字排版 | 介质色与状态色是工程语义，风格化破坏可读性 |
| >300ms 的容器过渡 | 编辑器高频操作，慢动画即灾难（画布内容动画不受此限） |
| 大面积毛玻璃 | SVG 大画布上 backdrop-filter 是性能杀手，仅模态 / pill 小面积允许 |
| 手绘插画全面铺开 | 与 46 种工程符号体系冲突，仅限空态 / 引导页 |

---

## 5. 提示词手册

### 5.1 灵感库深挖搜索词

**美叶（站内中文搜索）：**

```
呼吸动画 圆环 ｜ 毛玻璃 弹窗 ｜ 渐变 卡片 ｜ 空状态 插画 ｜ 健康数据可视化 ｜ 深色 冥想 ｜ 进度圆环 柔和
```

**Dribbble（站内英文搜索）：**

```
liquid gradient animation ｜ flow line animation SVG ｜ pipeline animation ｜
node-based editor dark theme ｜ breathing circle animation ｜ engineering dashboard motion ｜
particle path animation ｜ water ripple micro-interaction ｜ onboarding illustration minimal line art ｜
glassmorphism modal subtle
```

### 5.2 AI 实现提示词（6 条，按实施顺序）

> 使用方式：整条复制给编码 AI（如 ZCode / Proma）。每条已内嵌技术上下文、约束与验收标准，无需改写即可执行；执行时遵守项目纪律——先诊断、最小改动、全量 vitest、版本纪律。

**① Motion Tokens 体系（地基，先于一切微动效）**

```
为 FluidPath Studio 建立 CSS 设计令牌层的 motion tokens（src/styles.css 的 :root 变量）：
--motion-fast: 150ms、--motion-base: 220ms、--motion-slow: 320ms（仅限画布内容层）；
统一缓动 --ease-out-soft: cubic-bezier(0.22, 0.61, 0.36, 1) 与 --ease-spring: cubic-bezier(0.34, 1.3, 0.64, 1)。
用它们重写四处现有微动效使体系一致：toast 进出、模式横幅消失（现为 4.2s 定时，加 240ms 淡出）、
保存状态 pill 状态切换（"本机已保存→文件未保存"用颜色渐变过渡而非跳变）、面板折叠动画。
约束：所有容器层动画 ≤250ms；@media (prefers-reduced-motion: reduce) 全局降级为即时切换；
不新增依赖。验收：work-mode / save-ux / ui-buttons 现有测试不回归，vitest 全绿。
```

**② 管路流动动画 2.0（核心体验，最高价值）**

```
为 FluidPath Studio（Electron + React 18 + 自研 SVG 画布，src/components/PipeView.tsx）升级管路流动动画：
把现有"等距粒子圆点"改为"拖尾流光"效果——用 stroke-dasharray + CSS stroke-dashoffset 动画沿管路
polyline 生成一段 8–14px 的流光带（渐变描边：头部亮、尾部透明），叠加保留低密度粒子作介质颗粒感。
流光颜色跟随 pipe.fluidColor，速度沿用 flowSpeed（全局速度滑杆 ×0.2–3 生效）。
约束：①动画纯视觉，禁止触碰 pipeEffectiveDisabled 与任何工程判定（遵循 teachingOverride 分层哲学）；
②停流管（disabled）必须无任何动画且视觉暗淡；③支持 prefers-reduced-motion：降级为静态渐变描边；
④必须联动现有"暂停全部动画"全局开关；⑤仅对视区内管路渲染（沿用现有 200px 缓冲跳过机制），
74 管路规模下稳 60fps，用 transform/opacity 属性动画避免 layout；⑥深浅双主题各截图验证。
验收：npm run check 全绿 + smoke 无控制台错误 + GIF 导出仍正常（导出路径复用同一 dashoffset 状态）。
```

**③ 智能绘图向导视觉升级（产品脸面）**

```
重构 FluidPath 的 SmartDrawingWizard 模态视觉（src/components/SmartDrawingWizard.tsx + styles.css），
参考 wellness 品类的高级感：①背景遮罩加 8px 背景模糊（仅遮罩层，模态本体不模糊）；
②模态卡片 20px 大圆角 + 0.04–0.08 多层柔和阴影（不要描边）；③顶部标题区加一条 2px 的
水蓝→暖橙介质渐变饰线（呼应冷/热介质色）；④模板卡 hover：translateY(-2px) + 阴影加深 + 200ms
--ease-out-soft，选中态用 2px 介质蓝描边 + 左上角小对勾徽标；⑤步骤指示器当前步加柔和脉冲
（2s 周期、不透明度 0.6→1，reduced-motion 时关闭）；⑥意图 chips（"我理解到"标签）改为
浅底圆角药丸 + 逐个 60ms 交错入场。
约束：焦点陷阱与全部 ARIA 属性必须保留；不改动任何业务逻辑与 parseSmartText；
双语（中/英）下排版都要验证；对比度满足 WCAG AA。
验收：smart-drawing / ai-panel-activation 测试全绿 + 两种语言截图走查。
```

**④ 锅炉呼吸光环与出口涟漪（画布内容层）**

```
为 FluidPath 画布（src/components/CanvasView.tsx + symbols.tsx）新增两个纯教学显示层动画：
①锅炉"工作中"呼吸光环：hotWaterBoiler/steamBoiler 在其供水链有流动时，符号外围一圈
4px 半透明光环做 3s 周期的缩放+不透明度呼吸（0.35→0.6），颜色用介质色 30% 透明度；
停炉（供水链停流）时无光环。判定"供水链流动"复用现有引擎缓存（入侧管是否停流），只读不写。
②出口事件涟漪：coffeeOutlet/milkOutlet/steamWand/hotWaterOutlet 在其入侧管从停流转为流动的瞬间，
触发一圈 600ms 扩散涟漪（r 从 0.6× 到 1.6× 符号尺寸、透明度 0.5→0，单次播放不循环）。
约束：两者都挂在现有 teachingOverride 显示体系下（工程导出 JSON 自动剔除）；
reduced-motion 全关；演示模式高亮淡化逻辑不受影响。
验收：新增 vitest 用例覆盖"泵开→锅炉光环出现、泵停→消失"，reflux-bcmts 六场景回归全绿。
```

**⑤ 深色主题发光管路**

```
为 FluidPath 深色主题（body[data-theme="dark"]）增加"流动管路微光"：流动中的管路在流光带下方
叠一层同色 8–12% 不透明度、blur 3px 的宽描边（SVG filter 或双 path 实现），形成低强度的
"运行中发光"；停流管保持现有暗灰无光。效果对标 Dribbble 深色工程仪表盘的 active-line glow，
但发光强度必须克制（不透明度 ≤12%），保证白天投影仪可读。
约束：仅深色主题启用；导出 PNG/SVG/PDF/GIF 时该发光层默认关闭（导出追求印刷清晰，可在导出
面板加"保留发光"可选项）；性能：每帧只更新视区内管路，74 管规模 60fps。
验收：深浅主题各跑一遍五大场景截图对比；export-preview 测试全绿。
```

**⑥ 空画布引导插画（温度感收尾）**

```
为 FluidPath 空画布引导卡（src/App.tsx 的 canvas-empty-card）增加一张 240×160 的极简线条插画：
一杯咖啡侧视 + 从杯口延伸出的三条柔和曲线（水蓝=水路、奶白=奶路、暖橙=蒸汽），线条 1.5px、
端点渐隐，风格对标 wellness 品类的 minimal line art（圆角、无锐角、大地色底）。
插画用内联 SVG 实现（不用图片资源），三色分别取自应用现有介质色板（coldWater/coldMilk/steam）
以保证语义一致。动画：三条曲线做 12s 一轮的极缓 dashoffset 流动（reduced-motion 静态）。
约束：插画可点击=打开智能绘图向导（与"开始智能绘图"按钮同效）并加 focus 样式；
深浅主题各一版描边色。验收：minimal-startup 测试全绿；键盘 Tab 可达。
```

---

## 6. 实施路线

| 顺序 | 项 | 提示词 | 量级 | 依赖 |
|---|---|---|---|---|
| 1 | Motion Tokens | ① | 0.5 天 | 无（其余全部的地基） |
| 2 | 管路流光动画 2.0 | ② | 1–2 天 | ① |
| 3 | 智能绘图向导升级 | ③ | 1 天 | ① |
| 4 | 锅炉呼吸 + 出口涟漪 | ④ | 1 天 | ①② |
| 5 | 深色发光管路 | ⑤ | 1 天 | ② |
| 6 | 空态插画 | ⑥ | 0.5 天 | ① |

排序理由：①是所有微动效的地基必须先行；②是用户每天看 8 小时的核心体验，性价比最高；③是产品对外第一屏。4.1 表中的"介质过渡渐变"（#2 灵感项）合并在 ② 中一并实现，不单列。

---

## 7. 全局纪律（每项实施都必须遵守）

1. **动画只在视觉层**：一切新增动画禁止触碰 `pipeEffectiveDisabled` 与工程判定，显示覆盖挂 `teachingOverride` 体系（工程导出自动剔除）——这是项目自 1.7 起的分层哲学。
2. **可访问性**：`@media (prefers-reduced-motion: reduce)` 全覆盖降级；色觉安全（状态不只靠红绿区分）；焦点陷阱与 ARIA 不回退。
3. **性能红线**：74 管规模 60fps；仅视区内渲染（沿用 200px 缓冲）；只用 transform/opacity；毛玻璃仅限遮罩与小面积组件。
4. **验收闭环**：每项 `npm run check` 全绿 + `npm run smoke` 无控制台错误 + 深浅双主题截图对比；涉及引擎判定读取的（④）必须带回归用例。
5. **版本纪律**：按交接手册 §5.5——升 version.ts / package.json / sample.appVersion、CHANGELOG、打包 commit。

---

## 附录 · 本次调研证据索引

| 证据 | 内容 |
|---|---|
| 美叶浏览 | `meiye.art/inspiration?industry=瑜伽冥想` 案例网格 2 屏 + 1 个冥想 App 案例详情（全套界面） |
| Dribbble 搜索 | `fluid-animation` / `dashboard-motion-design` / `flow-line-animation` 三结果页 |
| 现状对照 | 1.32.1 实机走查截图（工作台 / 智能绘图向导三步 / 继续完善面板 / 保存 pill）+ PipeView / styles.css / SmartDrawingWizard 源码 |
| 相关文档 | `docs/PRD-智能绘图-2026-10.md`、`docs/FluidPath-评估报告-2026-10.md` |
