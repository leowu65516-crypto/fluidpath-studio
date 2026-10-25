# FluidPath AI 绘图协议（0.2-draft）

> 面向外部 AI / 脚本的 FluidPath Studio v3 图纸修改协议。
> 本文档与 `src/ai/operations.ts`、`src/ai/actions.ts` 同步；若文档与代码冲突，以代码为准。
> 协议版本：`fluidpath.ai-operations` / `0.2-draft`；目标 Schema：`3`；目录：`fluidpath-legacy-catalog/1`。

## 1. 定位与非目标

这是 **v3 legacy 图纸的受限结构化改图子集**，不是完整的 v4 语义协议，也不是流体求解器。

- AI 只能提交白名单操作；每个字段都会被逐项校验，未知字段直接拒绝整包请求。
- 只能在现有图纸右侧追加新元件/新管段，或重命名、改泵阀状态、声明故障码。
- 不能删除/移动/重连已有元件，不能批量改管路属性，不能跨图复制，不能写任意属性和教学显示覆盖。
- 不支持 CFD、精确混合、温度/压力/流量求解；`declaredMedium` 是声明介质，不代表已完成工程解析。
- 协议不提供“自然语言 → 指令”的翻译；自然语言由外部 LLM 完成，本协议只接收最终 JSON。

## 2. 在应用内使用

1. 工具栏点击「AI 绘图」打开右栏面板（仅编辑模式可应用）。
2. 点「下载 AI 上下文」得到包含 `base.diagramSha256`、组件目录、当前图纸和示例的 JSON。
3. 把上下文交给外部 AI（ChatGPT / Claude / 本地模型），附带第 10 节提示词模板。
4. 把 AI 返回的 JSON 粘贴回面板，点「校验并预览」。
5. 检查变更列表和缩略预览，点「应用全部变更」；一次应用 = 一个撤销步骤。
6. 图纸在预览后发生变化、或同一 `requestId` 已应用过，都会被拒绝。

## 3. 请求包络

```json
{
  "protocol": "fluidpath.ai-operations",
  "protocolVersion": "0.2-draft",
  "targetSchemaVersion": 3,
  "catalogVersion": "fluidpath-legacy-catalog/1",
  "requestId": "request-20261025-001",
  "base": { "diagramSha256": "<当前图纸的 SHA-256>" },
  "intent": "可选：人类可读的修改意图",
  "operations": []
}
```

| 字段 | 必填 | 约束 |
|---|---|---|
| `protocol` | 是 | 固定 `fluidpath.ai-operations` |
| `protocolVersion` | 是 | 固定 `0.2-draft` |
| `targetSchemaVersion` | 是 | 固定 `3` |
| `catalogVersion` | 是 | 固定 `fluidpath-legacy-catalog/1` |
| `requestId` | 是 | 非空字符串，≤500 字符；全局唯一，重复应用会被拒绝 |
| `base.diagramSha256` | 是 | 与当前图纸 JSON 的 SHA-256 完全一致；不一致说明图纸已变，需重新生成 |
| `intent` | 否 | 允许出现，不参与校验/执行 |
| `operations` | 是 | 1–200 条；完整请求 ≤250 KB |

顶层、`base`、每个操作及其嵌套对象都只允许列出的字段；多一个字段即整包拒绝。

## 4. 安全与生命周期

- **哈希绑定**：`base.diagramSha256` 在编译预览时校验一次，应用前再次校验；预览后图纸被编辑则旧预览失效。
- **重放保护**：`requestId` 会写入 `settings.aiAppliedRequestIds`（随图纸保存/重开/复制保留）；同一 ID 只能成功应用一次，历史上限 10000 条。
- **原子性**：任何一条操作失败都会抛错，整个请求不落地；错误信息带 `operations[i]:` 前缀。
- **模式限制**：只有 `edit` 模式可应用；预览阶段可以生成计划，但应用前会再次检查模式。
- **单步撤销**：应用是一次 `updateDiagram` 原子提交，并在应用后选中新增元件/管段；一次撤销即可回退。
- **不部分应用**：不会出现“前三条成功、第四条失败”的半成品图纸。

## 5. 组件目录

`addComponent.type` 只能取下列 24 种。端口键 `P1/P2/...` 只用于**本次请求新增的元件**；已有元件必须使用其永久端口 ID。

| type | 端口（键：能力/位置） |
|---|---|
| `inlet` | P1: out/right |
| `outlet` | P1: in/left |
| `pump` | P1: in/left；P2: out/right |
| `milkPump` | P1: in/left；P2: out/right |
| `airPump` | P1: in/left；P2: out/right |
| `solenoid2` | P1: in/left；P2: out/right |
| `solenoid3` | P1: in/left；P2: out/right；P3: out/bottom |
| `pulseAirValve` | P1: in/left；P2: out/right |
| `checkValve` | P1: in/left；P2: out/right |
| `safetyValve` | P1: in/bottom；P2: out/right |
| `flowMeter` | P1: in/left；P2: out/right |
| `pressureGauge` | P1: in/bottom |
| `metalFilter` | P1: in/left；P2: out/right |
| `hotWaterBoiler` | P1: in/bottom；P2: out/top |
| `steamBoiler` | P1: in/top；P2: out/bottom |
| `brewChamber` | P1: in/bottom；P2: out/top |
| `coffeeOutlet` | P1: in/top |
| `hotWaterOutlet` | P1: in/top |
| `hotWaterWand` | P1: in/top |
| `steamWand` | P1: in/top |
| `milkOutlet` | P1: in/top |
| `tank` | P1: in/left；P2: out/right；P3: in/top；P4: out/bottom |
| `tee` | P1: bidirectional/left；P2: bidirectional/right；P3: bidirectional/bottom |
| `teeF` | P1: bidirectional/top；P2: bidirectional/bottom；P3: bidirectional/right；P4: bidirectional/right |
| `shape` | P1: bidirectional/left；P2: bidirectional/right；P3: bidirectional/top；P4: bidirectional/bottom |

注意：编辑器里还有球阀、两通隔膜阀、三口两位隔膜切换阀、热交换器等类型，但**当前 AI 白名单不包含它们**。需要这些元件时，先在编辑器手工添加，再由 AI 连接或改名。

## 6. 介质目录

`connectPorts.declaredMedium` 必须是下列键之一：

| key | 含义 |
|---|---|
| `coldWater` | 常温水 |
| `hotWater` | 热水 |
| `steam` | 蒸汽 |
| `coffee` | 咖啡 |
| `milk` | 牛奶 |
| `coldMilk` | 冷牛奶 |
| `hotMilk` | 热牛奶 |
| `coldMilkFoam` | 冷奶沫 |
| `hotMilkFoam` | 热奶沫 |
| `wasteLiquid` | 废液 |
| `cleanWaste` | 清洗废液 |
| `air` | 空气 |
| `custom` | 其他/自定义 |

不允许根据颜色或上下文推断介质；必须显式声明。

## 7. 操作参考

### 7.1 `addComponent`

```json
{ "op": "addComponent", "tempId": "supply", "type": "inlet", "label": "新进水口", "layout": { "column": 0, "row": 0 } }
```

| 字段 | 必填 | 约束 |
|---|---|---|
| `op` | 是 | `addComponent` |
| `tempId` | 是 | 本请求内唯一；不能与已有节点/管路 ID 或已用 tempId 冲突 |
| `type` | 是 | 第 5 节目录中的类型 |
| `label` | 否 | 非空、≤500 字符；与图中现有元件标签不区分大小写重复时拒绝 |
| `layout.column` / `layout.row` | 否 | 0–40 的整数；省略时自动按 5 列排布（240×260 网格） |

新元件统一放在现有图纸最右侧（`max(x+width)+200`），再按 `layout` 偏移。与已有元件坐标完全重叠时拒绝。

### 7.2 `connectPorts`

```json
{
  "op": "connectPorts", "tempId": "feed",
  "from": { "component": "supply", "port": "P1" },
  "to": { "component": "pump", "port": "P1" },
  "declaredMedium": "coldWater"
}
```

| 字段 | 必填 | 约束 |
|---|---|---|
| `op` | 是 | `connectPorts` |
| `tempId` | 是 | 本请求内唯一；不能与节点/管路/已用 tempId 冲突 |
| `from` | 是 | `{ component, port }`；`component` 是已有节点 ID 或本请求的 tempId |
| `to` | 是 | 同上 |
| `declaredMedium` | 是 | 第 6 节的介质键 |

端口解析规则：

- 新元件：`P1/P2/...` 按第 5 节顺序取端口。
- 已有元件：必须使用永久端口 ID（从上下文图纸的 `nodes[].ports[].id` 读取），不能用 `P1` 猜测。
- `from` 端口的 `direction` 不能是 `in`；`to` 端口的 `direction` 不能是 `out`；否则视为方向矛盾。
- 不允许自连（同一个元件两端）；一个端口只能接一根管，已占用则拒绝；需要分支时先加 `tee`。
- 新管段自动命名 `Pipe N`，并写入声明介质、颜色和正交走线默认值。

### 7.3 `setComponentProperty`

```json
{ "op": "setComponentProperty", "component": "pump", "label": "新水泵" }
```

| 字段 | 必填 | 约束 |
|---|---|---|
| `op` | 是 | `setComponentProperty` |
| `component` | 是 | 已有节点 ID 或本请求 tempId |
| `label` | 是 | 非空、≤500 字符；与图中其他元件标签不区分大小写重复时拒绝 |

当前只支持改 `label`，不能改坐标、尺寸、颜色、端口或任意工程属性。

### 7.4 `setOperatingCondition`

```json
{ "op": "setOperatingCondition", "component": "valve", "state": { "valveState": "open" } }
```

| 字段 | 必填 | 约束 |
|---|---|---|
| `op` | 是 | `setOperatingCondition` |
| `component` | 是 | 已有节点 ID 或本请求 tempId |
| `state` | 是 | 非空对象，只允许下列键 |

`state` 允许的键：

| 键 | 适用类型 | 取值 |
|---|---|---|
| `pumpOn` | `pump` / `milkPump` / `airPump` | `true` / `false` |
| `valveState` | `solenoid2` / `pulseAirValve` | `"open"` / `"closed"` |
| `valvePath` | `solenoid3` | `"A"` / `"B"` / `"off"` |

注意：`pulseAirValve` 现在支持开/关；关闭只停空气支路，不影响并联液体主路。球阀/隔膜阀不在 AI 白名单内，不能通过本操作改状态。

### 7.5 `defineFaultCode`

```json
{
  "op": "defineFaultCode",
  "code": "DEMO-SUPPLY",
  "label": { "zh": "供水回路排查示例", "en": "Supply inspection example" },
  "targets": { "components": ["supply", "pump", "valve"], "pipes": ["feed", "delivery"] }
}
```

| 字段 | 必填 | 约束 |
|---|---|---|
| `op` | 是 | `defineFaultCode` |
| `code` | 是 | 非空、≤500 字符 |
| `label.zh` / `label.en` | 是 | 两个非空字符串 |
| `targets.components` | 是 | 数组；元素为已有节点 ID 或本请求 tempId |
| `targets.pipes` | 是 | 数组；元素为已有管路 ID 或本请求 tempPipeId |

效果：新增一个高亮组（`resolution: "explicit"`）和一条用户声明的诊断（`definitionStatus: "userDeclared"`、`rootCauseStatus: "notDetermined"`、样式 `outline` / `#d97706`）。它不证明故障已定位，也不产生工程 PASS 结论。

## 8. 错误语义

- 整包拒绝，不部分应用。
- 操作错误统一加前缀：`operations[i]: <reason>`。
- 常见错误：
  - `Unsupported protocol, diagram schema or catalog version`
  - `The drawing changed. Generate a new request for the current snapshot`
  - `This request was already applied`
  - `Expected 1–200 operations` / `AI request exceeds 250 KB`
  - `Unsupported field: <name>`（任何层级出现未声明字段）
  - `Unregistered component type`
  - `Duplicate temporary ID` / `Duplicate component label`
  - `Unknown component` / `Unknown port` / `Unknown pipe target`
  - `Port occupied or self-connection; insert a junction to branch`
  - `Declared connection contradicts port capability; no implicit direction override`
  - `Declare a registered medium; do not infer one from color`
  - `Invalid two-port valve state` / `Invalid three-port valve state` / `Invalid pump state`
  - `Layout requires column/row from 0 to 40` / `Overlapping layout cells`

## 9. 完整示例

```json
{
  "protocol": "fluidpath.ai-operations",
  "protocolVersion": "0.2-draft",
  "targetSchemaVersion": 3,
  "catalogVersion": "fluidpath-legacy-catalog/1",
  "requestId": "request-demo-001",
  "base": { "diagramSha256": "<复制上下文中的值，不要改写>" },
  "intent": "Add a simple supply circuit with an editable inspection code",
  "operations": [
    { "op": "addComponent", "tempId": "supply", "type": "inlet" },
    { "op": "addComponent", "tempId": "pump", "type": "pump" },
    { "op": "addComponent", "tempId": "valve", "type": "solenoid2" },
    { "op": "addComponent", "tempId": "outlet", "type": "outlet" },
    { "op": "connectPorts", "tempId": "feed", "from": { "component": "supply", "port": "P1" }, "to": { "component": "pump", "port": "P1" }, "declaredMedium": "coldWater" },
    { "op": "connectPorts", "tempId": "delivery", "from": { "component": "pump", "port": "P2" }, "to": { "component": "valve", "port": "P1" }, "declaredMedium": "coldWater" },
    { "op": "connectPorts", "tempId": "drain", "from": { "component": "valve", "port": "P2" }, "to": { "component": "outlet", "port": "P1" }, "declaredMedium": "coldWater" },
    { "op": "defineFaultCode", "code": "DEMO-SUPPLY", "label": { "zh": "供水回路排查示例", "en": "Supply inspection example" }, "targets": { "components": ["supply", "pump", "valve"], "pipes": ["feed", "delivery"] } }
  ]
}
```

## 10. 外部模型提示词模板

```text
You are editing a FluidPath Studio v3 diagram through the fluidpath.ai-operations 0.2-draft protocol.

Return ONLY one JSON object. No markdown fences, no explanation.

Rules:
- Copy protocol, protocolVersion, targetSchemaVersion, catalogVersion and base.diagramSha256 unchanged from the supplied context.
- Generate a new unique requestId.
- Use only these operations: addComponent, connectPorts, setComponentProperty (label only), setOperatingCondition, defineFaultCode.
- Use only component types and media keys listed in the context catalog.
- For newly added components use port keys P1, P2, ... in catalog order.
- For existing components use their permanent port IDs from the context diagram; never guess P1.
- Do not self-connect, do not reuse an occupied port, and do not connect into an "in" port as "from" or out of an "out" port as "to".
- Declare a registered medium for every new pipe; never infer it from color.
- Do not add fields not defined by the protocol. Unknown fields reject the whole request.
- If the drawing has changed or you are unsure, return an empty operations array with a new requestId and explain in "intent" — do not invent ports.
- Do not claim engineering PASS or solved root causes.

User request:
<在这里写自然语言需求，例如：在奶路加一个清洗旁通>
```

## 11. 已知限制

- 只能新增/改名/改泵阀状态/声明故障码；不能删除、移动、重连或批量改管路属性。
- 新增元件固定在现有内容右侧，不能自由放到任意坐标。
- 不包含球阀、隔膜阀、隔膜切换阀、热交换器、即热加热块等类型的白名单。
- 不校验物理可行性（压力、流量、温度、混合比例）；只校验协议、端口、介质声明和拓扑约束。
- 不产生验收结论；故障码是用户声明，不是已定位根因。
- 协议版本变化会拒绝旧版本请求；外部提示词应始终从当前上下文读取版本与目录。
