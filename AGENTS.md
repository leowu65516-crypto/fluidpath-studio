# AGENTS.md · FluidPath Studio 项目地图

> 面向在该仓库工作的 AI/人类协作者的入口说明。**事实来源**是 [`FluidPath-交接文档.md`](./FluidPath-交接文档.md)（版本历史/引擎原理/操作手册）与 [`docs/current-state.md`](./docs/current-state.md)（当前版本事实/测试数/已知限制）；本文件只写“怎么干活”，不重复细节。
>
> 最近核验：2026-10-30（v1.46.0）

## 1. 项目速览

- **是什么**：纯前端液路示意图编辑器（React 18 + TypeScript + 自研 SVG 画布），用于咖啡机/液路设备的绘制、工况演示、回路诊断与工程交付；Electron 打包为 macOS App。
- **没有后端**：所有数据在浏览器/本机；不接外部模型；AI 协议由外部模型产出 JSON，应用只做应用与校验。
- **核心资产**：真实机型图纸（`BCMTS.json` / `BCTMS.json` / `MSY2.json` 三份根目录样例，测试直接依赖，**不要删**）。
- **位置**：`/Users/leo/Documents/Fluidpath studio`（中文路径，bash 工具链敏感；`grep`/`rg` 请用 bash，不要用某些只认 ASCII 路径的工具）。
- **线上**：https://leowu65516-crypto.github.io/fluidpath-studio/ （GitHub Pages，从 `main` 自动构建部署）。

## 2. 常用命令

```text
npm run check        # tsc --noEmit + 全量 vitest（提交前必跑）
npm run build        # vite build → dist/（线上与 DMG 的实际产物）
npm run smoke        # 构建 + Electron 冒烟（控制台零错误才算过）
npm run dev          # 本地开发（HMR 会重置 store，验证状态类交互请用 build + preview）
npm run preview      # 静态预览 dist/（推荐用于浏览器走查）

# DMG（本机 Electron 已在 node_modules 里，必须带 electronDist，否则会去下载）
npx electron-builder --mac --config.electronDist=node_modules/electron/dist

npx electron scripts/verify-asar.cjs    # 校验 asar 能加载
```

## 3. 发版纪律（每次发布照做，缺一步就会“线上不是最新”）

1. **版本四件套**必须同值：`src/version.ts`（`APP_VERSION` + `CHANGELOG` 头部新增条目）、`package.json`、`package-lock.json`（根 + `packages[""]` 两处）、`src/sample.ts`（`appVersion`）。
2. 文档同步：`docs/current-state.md`（版本号/测试数/新增事实）、`FluidPath-交接文档.md`（版本表 + 测试数）。
3. 验证：`npm run check` → `npm run build` → `npm run smoke`。
4. 提交并推送；确认 GitHub Actions 的 **Check** 与 **Deploy** 都 success。
5. **线上产物核对**：下载 `https://leowu65516-crypto.github.io/fluidpath-studio/assets/index-*.js`，与 `dist/assets/` 同名文件比对 `shasum -a 256`，并用 `grep -o "1\.4x\.[0-9]"` 确认版本串。两者一致才算发布完成。
6. DMG：`release/FluidPath Studio-<version>-arm64.dmg`；挂载后核对 `CFBundleShortVersionString`，并比对 `app.asar` 内 `dist/assets/index-*.js` 与本地 SHA 一致。未签名，首次打开需右键 → 打开。

## 4. 代码地图（改哪里）

| 关注点 | 入口 |
| --- | --- |
| 状态与动作 | `src/store.ts`（单 store + 模块级 action；`updateDiagram` 是唯一写入口，默认记撤销） |
| 画布渲染 | `src/components/CanvasView.tsx`（rAF 驱动流动、视区剔除、视图投影、右键菜单） |
| 管路几何/走线 | `src/geometry.ts`（`autoRoute`、`ROUTE_CLEARANCE`、`pipePolyline`、`computeDisabledPipes`、`pipeEffectiveDisabled`） |
| 流动视觉参数 | `src/flow.ts`（虚线节距/速度/拖尾配色；画布与三条导出链路共用） |
| 工程符号 | `src/symbols.tsx`（教学）+ `src/symbols-engineering.tsx`（工程，线宽随缩放补偿） |
| 画布底色解析 | `src/canvasTheme.ts`（跟随主题 vs 自定义，导出同源） |
| 智能绘图 | `src/smart-draw/`（模板 `templates.ts`、工程检查 `engineering.ts`、意图 `intent.ts`、视图投影 `view.ts`、重合检测 `overlap.ts`） |
| 导出 | `src/export.ts`（PNG/JPG/SVG/PDF/GIF + 主题/符号/文字增强） |
| 桌面壳 | `electron/main.cjs`（窗口、关闭拦截、asar 打包规则） |

## 5. 不可违反的工程纪律

- **工程判定与显示分离**：停流/流动由 `geometry` 的引擎决定；`teachingOverride`、`displayDisabled`、`symbolProfile` 只改显示。任何“看起来在流”都不能影响工程结果。
- **安全阀/OPV 常闭**：`safetyValve`/`opv` 在引擎里恒停流（`isReliefValve`），教学覆盖只改画面。
- **别用中文标签做逻辑判断**：一律按 `node.type` / `port.id` / `pipe.id` 查找。历史上因中文 label 正则导致英文构建崩溃两次。
- **停流管不得有任何流动动画**；减弱动效（`prefers-reduced-motion`）下画布由 JS 停帧，不能只靠 CSS。
- **手工布线受保护**：`Pipe.routeMode`（缺省按“有折点即 manual”推断）。批量整理只能清 `auto` 管；清手工折点必须走显式「重排全部」+ 预览确认。
- **图纸数据是用户资产**：显示偏好（如 `backgroundFollowTheme`）不得回写 `settings.background`；导出按解析后的实际值。
- **不要提交** `docs/FluidPath-评估报告-2026-10.md`（用户私有评估，保持未跟踪）。

## 6. 测试基线

- 当前：**91 个测试文件 / 604 通过 + 4 跳过（共 608）**（2026-10-30，v1.46.0）。
- 覆盖面重点：引擎停流与归因、几何走线不变量、模板零交叉/零重叠、导出管线、符号 profile、演示场景、保存/撤销。
- 新增行为请配“不变量断言”（不写坐标快照）：例如“整理后手工管数量不变、重合对不高于整理前”。

## 7. 已知坑

- **`git push` 经常超时**（`Failed to connect to github.com port 443`），与 token 无关。兜底通道：GitHub REST API 建 blob → tree → commit → PATCH ref，再本地 `git update-ref` 对齐（注意 commit 对象重建时用 `+0800`、消息不带尾随换行）。
- 本机 Python `urllib` 走系统代理会 SSL 握手超时；调 GitHub API 用 `curl`。token 在钥匙串（`security find-internet-password -s github.com -w`），**不要写进任何文件**。
- Vite HMR 会重置 store：验证“需要保持状态的交互”（整理、预览、演示）请用 `npm run build` + `npm run preview`。
- 网页版有访问门（每日动态密码 = 反转的 yy/MM/dd，见 `src/gate.ts`）；它只防路人，不是安全边界。

## 8. 文档与记忆维护

- **文档索引**：`docs/README.md`（现行 vs 归档）。
- **归档**：`docs/archive/` 存放已被实现覆盖的旧方案（只读参考，不再更新）。
- **项目记忆**：`/Users/leo/.proma/agent-workspaces/fluidpath-studio/memory/MEMORY.md`（索引）与同目录 `fluidpath-project.md`（项目状态与纪律）、`user-workflow.md`（协作偏好）。
- **全局画像**：`/Users/leo/.proma/memory/user_profile.md`。
- **维护时机**：①版本/测试数/发布状态变化；②新增长期约束或踩坑；③项目结构或命令改变；④发现旧记录与代码不符。写入时标注日期；只写可复用结论，不写流水账。每次维护先 `MemoryInspect` 读版本，再 `MemoryUpdate` 提交并校验。
- **不要**把记忆写在项目内的 `.claude/memory/` 或临时文件里。
