import { useMemo, useState } from "react";
import {
  deleteSelection,
  duplicateSelection,
  groupSelection,
  ungroupSelection,
  patchNode,
  patchPipe,
  setSelectionDisabled,
  updateDiagram,
  useAppState,
  alignSelection,
  distributeSelection,
  addLayer,
  removeLayer,
  toggleLayerVisibility,
  setNodeLayer,
  bringToFront,
  sendToBack,
  moveUp,
  moveDown,
  getUndoCount,
  getRedoCount,
  generateLegend,
  insertTemplate,
  applyStylePreset,
  getStylePresets,
  copyPipeStyle,
  pastePipeStyle,
  hasPipeStyle,
  patchPipes,
  mirrorSelection,
  autoLayout,
  batchReplaceLabels,
  batchReroutePipes,
  distributePipes,
  setPipesForceFlow,
  setPipesForceStop,
} from "../store";
import { defOf, NodeSymbol } from "../symbols";
import { findPort, portWorldPos, pipeEffectiveDisabled } from "../geometry";
import { traceStopCause } from "../advice";
import { traceFunctionalChain, chainPathSummary } from "../functionalChain";
import { FLUID_PRESETS, MATERIAL_PRESETS } from "../types";
import type { NodeFault } from "../types";
import { PortEditor } from "./PortEditor";
import { exportSelectedPNG } from "../export";
import { useT } from "../i18n";
import { checkPipeFluid, fluidLabel, fluidColor } from "../fluidRules";
import { knowledgeOf } from "../knowledge";
import { ColorSwatch } from "./ColorSwatch";
import { downloadBom } from "../bom";

// 色板预设：管壁色（管材）与液体色（介质）
const WALL_COLOR_PRESETS = MATERIAL_PRESETS.map((m) => m.wallColor);
const FLUID_COLOR_PRESETS = FLUID_PRESETS.map((f) => f.color);

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="insp-row">
      <label>{label}</label>
      <div className="insp-ctrl">{children}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="insp-section">
      <div className="insp-section-title" onClick={() => setOpen((o) => !o)} title={open ? "折叠分组" : "展开分组"}>
        <span className={`insp-caret${open ? "" : " closed"}`}>▾</span>
        {title}
      </div>
      {open && children}
    </div>
  );
}

/** 批量替换标签小组件 */
function BatchReplace({ nodeIds, pipeIds }: { nodeIds: string[]; pipeIds: string[] }) {
  const { t } = useT();
  const [mode, setMode] = useState<"prefix" | "suffix" | "replace" | "clear">("prefix");
  const [text, setText] = useState("");
  const [from, setFrom] = useState("");
  const hasSel = nodeIds.length + pipeIds.length > 0;
  return (
    <div>
      <Row label={t("方式")}>
        <select value={mode} onChange={(e) => setMode(e.target.value as never)}>
          <option value="prefix">{t("前缀")}</option>
          <option value="suffix">{t("后缀")}</option>
          <option value="replace">{t("替换")}</option>
          <option value="clear">{t("清空")}</option>
        </select>
      </Row>
      {mode !== "clear" && (
        <Row label={mode === "replace" ? t("替换为") : t("文本")}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={mode === "replace" ? "新文本" : "输入文本"} />
        </Row>
      )}
      {mode === "replace" && (
        <Row label={t("查找")}>
          <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="被替换文本" />
        </Row>
      )}
      <button
        className="btn wide"
        disabled={!hasSel}
        onClick={() => batchReplaceLabels(mode, text, from, nodeIds, pipeIds)}
      >{t("应用")}</button>
    </div>
  );
}

export function Inspector({ collapsed = false, onToggle }: { collapsed?: boolean; onToggle?: () => void }) {
  const { diagram, ui } = useAppState();
  const { t } = useT();
  const node = ui.selection.nodes.length === 1 ? diagram.nodes.find((n) => n.id === ui.selection.nodes[0]) : undefined;
  const pipe = !node && ui.selection.pipes.length === 1 ? diagram.pipes.find((p) => p.id === ui.selection.pipes[0]) : undefined;
  const multi = ui.selection.nodes.length + ui.selection.pipes.length > 1;
  const pipeIssues = pipe ? checkPipeFluid(pipe, diagram.nodes) : [];
  const pipeStallCause = useMemo(() => {
    if (!pipe || pipe.forceFlow) return null;
    if (!pipeEffectiveDisabled(pipe, diagram.nodes)) return null;
    return traceStopCause(pipe, diagram);
  }, [pipe, diagram]);
  // 元件→整机功能链（单选时展示所在链）
  const funcChain = useMemo(() => {
    if (multi) return null;
    if (node) return traceFunctionalChain(diagram, node.id);
    if (pipe) return traceFunctionalChain(diagram, undefined, pipe.id);
    return null;
  }, [diagram, node, pipe, multi]);

  return (
    <div className={`inspector${collapsed ? " collapsed" : ""}`}>
      <div className={`panel-title${collapsed ? " vertical" : ""}`}>
        <button className="panel-toggle" onClick={onToggle} title={collapsed ? "展开属性检查器" : "折叠属性检查器"} aria-label={collapsed ? "展开属性检查器" : "折叠属性检查器"}>
          {collapsed ? "◀" : "▶"}
        </button>
        {!collapsed && <span>{t("属性检查器")}</span>}
        {collapsed && <span className="vertical-text">{t("属性")}</span>}
      </div>
      {!collapsed && (
      <div className="insp-scroll">
        {multi && (
          <Section title={`已选中 ${ui.selection.nodes.length} 个节点、${ui.selection.pipes.length} 条管路`}>
            {ui.selection.nodes.length > 1 && (
              <button className="btn wide" onClick={groupSelection}>{t("成组")}</button>
            )}
            {ui.selection.nodes.some((id) => diagram.nodes.find((n) => n.id === id)?.groupId) && (
              <button className="btn wide" onClick={ungroupSelection}>{t("解散组")}</button>
            )}
            {ui.selection.nodes.length > 0 && (
              <button className="btn wide" onClick={duplicateSelection}>{t("复制节点")}</button>
            )}
            <div className="btn-row">
              <button className="btn wide" onClick={() => setSelectionDisabled(true)}>{t("置灰选中")}</button>
              <button className="btn wide" onClick={() => setSelectionDisabled(false)}>{t("取消置灰")}</button>
            </div>
            <button className="btn danger wide" onClick={deleteSelection}>{t("删除所选")}</button>
            {ui.selection.nodes.length > 1 && (
              <>
                <Section title={t("对齐")}>
                  <div className="btn-row">
                    <button className="btn sq" title={t("左对齐")} onClick={() => alignSelection("left")}>⬅</button>
                    <button className="btn sq" title={t("右对齐")} onClick={() => alignSelection("right")}>➡</button>
                    <button className="btn sq" title={t("上对齐")} onClick={() => alignSelection("top")}>⬆</button>
                    <button className="btn sq" title={t("下对齐")} onClick={() => alignSelection("bottom")}>⬇</button>
                    <button className="btn sq" title={t("水平居中")} onClick={() => alignSelection("centerH")}>↔</button>
                    <button className="btn sq" title={t("垂直居中")} onClick={() => alignSelection("centerV")}>↕</button>
                  </div>
                  {ui.selection.nodes.length > 2 && (
                    <div className="btn-row">
                      <button className="btn wide" title={t("水平等距分布")} onClick={() => distributeSelection("horizontal")}>{t("⇔ 水平等距")}</button>
                      <button className="btn wide" title={t("垂直等距分布")} onClick={() => distributeSelection("vertical")}>{t("⇕ 垂直等距")}</button>
                    </div>
                  )}
                </Section>
                <Section title={t("Z 轴顺序")}>
                  <div className="btn-row">
                    <button className="btn sq" title={t("置顶")} onClick={bringToFront}>{t("⬆顶端")}</button>
                    <button className="btn sq" title={t("置底")} onClick={sendToBack}>{t("⬇底端")}</button>
                    <button className="btn sq" title={t("上移一层")} onClick={moveUp}>{t("↑一层")}</button>
                    <button className="btn sq" title={t("下移一层")} onClick={moveDown}>{t("↓一层")}</button>
                  </div>
                </Section>
                <Section title={t("镜像翻转")}>
                  <div className="btn-row">
                    <button className="btn wide" title="水平镜像（左右翻转）" onClick={() => mirrorSelection(true)}>↔ 水平镜像</button>
                    <button className="btn wide" title="垂直镜像（上下翻转）" onClick={() => mirrorSelection(false)}>↕ 垂直镜像</button>
                  </div>
                </Section>
                <Section title={t("自动排版")}>
                  <div className="btn-row">
                    <button className="btn wide" onClick={() => autoLayout("leftright")}>➡ 水平排列</button>
                    <button className="btn wide" onClick={() => autoLayout("topdown")}>⬇ 垂直排列</button>
                  </div>
                  <div className="btn-row">
                    <button className="btn wide" onClick={() => autoLayout("grid")}>▦ 网格排列</button>
                    <button className="btn wide" onClick={() => autoLayout("tree")}>🌳 按连接分层</button>
                  </div>
                </Section>
                <Section title={t("批量替换标签")}>
                  <BatchReplace
                    nodeIds={ui.selection.nodes}
                    pipeIds={ui.selection.pipes}
                  />
                </Section>
              </>
            )}
            {ui.selection.pipes.length > 1 && (() => {
              const first = diagram.pipes.find((p) => p.id === ui.selection.pipes[0]);
              if (!first) return null;
              const ids = ui.selection.pipes;
              return (
                <Section title={`批量编辑 ${ids.length} 条管路`}>
                  <Row label={t("介质类型")}>
                    <select value={first.fluidType ?? "custom"} onChange={(e) => {
                      const preset = FLUID_PRESETS.find((f) => f.key === e.target.value);
                      if (!preset) return;
                      patchPipes(ids, { fluidType: preset.key, ...(preset.key !== "custom" ? { fluidColor: preset.color } : {}) });
                    }}>
                      {FLUID_PRESETS.map((f) => (<option key={f.key} value={f.key}>{f.label}</option>))}
                    </select>
                  </Row>
                  <Row label={t("管材")}>
                    <select value={first.material ?? "custom"} onChange={(e) => {
                      const preset = MATERIAL_PRESETS.find((m) => m.key === e.target.value);
                      if (!preset) return;
                      patchPipes(ids, { material: preset.key, ...(preset.key !== "custom" ? { wallColor: preset.wallColor, wallOpacity: preset.wallOpacity } : {}) });
                    }}>
                      {MATERIAL_PRESETS.map((m) => (<option key={m.key} value={m.key}>{m.label}</option>))}
                    </select>
                  </Row>
                  <Row label={t("管径")}>
                    <select value={first.nominalDiameter} onChange={(e) => patchPipes(ids, { nominalDiameter: e.target.value })}>
                      {["DN6", "DN8", "DN10", "DN15", "DN20", "DN25", "DN32", "DN40", "DN50", "DN65", "DN80"].map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </Row>
                  <Row label={t("管壁颜色")}>
                    <ColorSwatch value={first.wallColor} presets={WALL_COLOR_PRESETS} onChange={(c) => patchPipes(ids, { wallColor: c, material: "custom" })} />
                  </Row>
                  <Row label={t("液体颜色")}>
                    <ColorSwatch value={first.fluidColor} presets={FLUID_COLOR_PRESETS} onChange={(c) => patchPipes(ids, { fluidColor: c, fluidType: "custom" })} />
                  </Row>
                  <Row label={`流速 ${first.flowSpeed.toFixed(1)} m/s`}>
                    <input type="range" min={1} max={30} value={Math.round(first.flowSpeed * 10)}
                      onChange={(e) => patchPipes(ids, { flowSpeed: Number(e.target.value) / 10 }, false)}
                      onMouseUp={() => patchPipes(ids, {}, true)} />
                  </Row>
                  <Row label={t("流向")}>
                    <div className="seg">
                      <button className={first.direction === "forward" ? "on" : ""} onClick={() => patchPipes(ids, { direction: "forward" })}>{t("正向")}</button>
                      <button className={first.direction === "reverse" ? "on" : ""} onClick={() => patchPipes(ids, { direction: "reverse" })}>{t("反向")}</button>
                    </div>
                  </Row>
                  <Row label={t("流动动画")}>
                    <input type="checkbox" checked={first.animated} onChange={(e) => patchPipes(ids, { animated: e.target.checked })} />
                  </Row>
                  <Row label={t("流向箭头")}>
                    <input type="checkbox" checked={first.showArrow} onChange={(e) => patchPipes(ids, { showArrow: e.target.checked })} />
                  </Row>
                  <div className="btn-row" style={{ marginTop: 6 }}>
                    <button className="btn wide" title={t("清除手动折点，让自动走线重新计算（避开障碍）")} onClick={() => batchReroutePipes(ids)}>🔄 {t("批量重路由")}</button>
                    <button className="btn wide" title={t("将平行同向的选中管路在垂直方向等距排列")} onClick={() => distributePipes(ids)}>📐 {t("等距排列")}</button>
                  </div>
                  <div className="btn-row" style={{ marginTop: 6 }}>
                    <button className="btn wide" title="临时强制这些管路流动（忽略停流判定）" onClick={() => setPipesForceFlow(ids, true)}>▶ 强制流动</button>
                    <button className="btn wide" title="取消强制流动" onClick={() => setPipesForceFlow(ids, false)}>↺ 取消流动</button>
                  </div>
                  <div className="btn-row" style={{ marginTop: 6 }}>
                    <button className="btn wide" title="临时强制这些管路停止流动" onClick={() => setPipesForceStop(ids, true)}>⏸ 强制停止</button>
                    <button className="btn wide" title="取消强制停止" onClick={() => setPipesForceStop(ids, false)}>↺ 取消停止</button>
                  </div>
                  <div className="insp-tip">{t("此处修改将一次性应用到所有选中的管路。")}</div>
                </Section>
              );
            })()}
            {ui.selection.nodes.length > 0 && (
              <button className="btn wide" onClick={() => {
                const svg = document.querySelector(".main-canvas") as SVGSVGElement | null;
                if (svg) exportSelectedPNG(svg, diagram, ui.selection.nodes, ui.selection.pipes);
              }}>{t("导出选区为 PNG")}</button>
            )}
          </Section>
        )}

        {!multi && node && (() => {
          const kn = knowledgeOf(node.type);
          return (
          <>
            {/* 元件→整机角色联动：所在功能链 */}
            {funcChain && funcChain.nodeIds.length > 0 && (
              <Section title="🔗 所在功能链">
                <div className="chain-summary">{chainPathSummary(diagram, funcChain)}</div>
                <div className="insp-tip">按当前阀位/泵态追踪，与实际流动一致；画布上已用蓝色光环标出该链。关闭阀门会在此处截断。</div>
              </Section>
            )}
            {/* 设备信息卡：图标 + 类型徽章 + 作用 */}
            <div className="node-card">
              <svg className="node-card-icon" viewBox={`0 0 ${node.width} ${node.height}`} preserveAspectRatio="xMidYMid meet">
                <NodeSymbol node={node} />
              </svg>
              <div className="node-card-body">
                <span className="node-card-type">{defOf(node.type, node.variant).label}</span>
                {kn && <div className="node-card-role">{kn.role}</div>}
              </div>
            </div>
            <Section title={t("节点")}>
              <Row label={node.type === "shape" ? "文字内容" : "名称"}>
                {node.type === "shape" ? (
                  <textarea
                    rows={3}
                    value={node.label}
                    placeholder="支持多行文字"
                    onChange={(e) => patchNode(node.id, { label: e.target.value })}
                  />
                ) : (
                  <input value={node.label} onChange={(e) => patchNode(node.id, { label: e.target.value })} />
                )}
              </Row>
              <Row label={t("类型")}>
                <span className="insp-static">{defOf(node.type, node.variant).label}（{node.type}）</span>
              </Row>
              {node.type === "annotation" && (
                <>
                  <Row label={t("文字内容")}>
                    <textarea
                      rows={3}
                      value={node.label}
                      placeholder="标注文字"
                      onChange={(e) => patchNode(node.id, { label: e.target.value })}
                    />
                  </Row>
                  <Row label={t("引线目标 X")}>
                    <input
                      type="number"
                      value={Math.round(node.pointerTarget?.x ?? 0)}
                      onChange={(e) => patchNode(node.id, { pointerTarget: { x: Number(e.target.value) || 0, y: node.pointerTarget?.y ?? 0 } })}
                      style={{ width: 80 }}
                    />
                    <span style={{ color: "var(--text-dim)", fontSize: 11, marginLeft: 4 }}>{t("也可在画布上拖动目标点")}</span>
                  </Row>
                  <Row label={t("引线目标 Y")}>
                    <input
                      type="number"
                      value={Math.round(node.pointerTarget?.y ?? 0)}
                      onChange={(e) => patchNode(node.id, { pointerTarget: { x: node.pointerTarget?.x ?? 0, y: Number(e.target.value) || 0 } })}
                      style={{ width: 80 }}
                    />
                  </Row>
                </>
              )}
              {node.type === "coffeeOutlet" && (
                <>
                  <Row label={t("出液口")}>
                    <select value={node.variant ?? "single"} onChange={(e) => patchNode(node.id, { variant: e.target.value as never })}>
                      <option value="single">{t("单出液口")}</option>
                      <option value="double">{t("双出液口")}</option>
                    </select>
                  </Row>
                  <Row label={t("出液动画")}>
                    <input
                      type="checkbox"
                      checked={node.dispensing !== false}
                      onChange={(e) => patchNode(node.id, { dispensing: e.target.checked })}
                    />
                  </Row>
                  <div className="insp-tip">{t("出液时显示咖啡色水滴从出液嘴向下滴落；受全局播放开关控制")}</div>
                </>
              )}
              {node.type === "milkOutlet" && (
                <>
                  <Row label={t("出液口")}>
                    <select value={node.variant ?? "single"} onChange={(e) => patchNode(node.id, { variant: e.target.value as never })}>
                      <option value="single">{t("单出液口")}</option>
                      <option value="double">{t("双出液口")}</option>
                    </select>
                  </Row>
                  <Row label={t("出液动画")}>
                    <input
                      type="checkbox"
                      checked={node.dispensing !== false}
                      onChange={(e) => patchNode(node.id, { dispensing: e.target.checked })}
                    />
                  </Row>
                  <div className="insp-tip">{t("出液时显示乳白色水滴从出液嘴向下滴落；受全局播放开关控制")}</div>
                </>
              )}
              {node.type === "hotWaterOutlet" && (
                <>
                  <Row label={t("出液动画")}>
                    <input
                      type="checkbox"
                      checked={node.dispensing !== false}
                      onChange={(e) => patchNode(node.id, { dispensing: e.target.checked })}
                    />
                  </Row>
                  <div className="insp-tip">{t("出液时显示蓝色水滴从出液嘴向下滴落；受全局播放开关控制")}</div>
                </>
              )}
              {node.type === "shape" && (
                <>
                  <Row label={t("形状")}>
                    <select value={node.variant ?? "rect"} onChange={(e) => patchNode(node.id, { variant: e.target.value as never })}>
                      <option value="rect">{t("矩形")}</option>
                      <option value="ellipse">{t("椭圆")}</option>
                      <option value="diamond">{t("菱形")}</option>
                    </select>
                  </Row>
                  <Row label={`文字大小 ${node.fontSize ?? 15}px`}>
                    <input
                      type="range"
                      min={10}
                      max={48}
                      value={node.fontSize ?? 15}
                      onChange={(e) => patchNode(node.id, { fontSize: Number(e.target.value) }, false)}
                      onMouseUp={() => patchNode(node.id, {}, true)}
                    />
                  </Row>
                </>
              )}
              {node.type === "image" && (
                <Row label={t("上传图片")}>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
                    style={{ fontSize: 12, width: 160 }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        patchNode(node.id, { imageData: reader.result as string, width: Math.max(80, node.width), height: Math.max(60, node.height) });
                      };
                      reader.readAsDataURL(f);
                      e.target.value = "";
                    }}
                  />
                </Row>
              )}
              <Row label={t("填充色")}>
                <input type="color" value={node.fill.length === 9 ? node.fill.slice(0, 7) : node.fill} onChange={(e) => patchNode(node.id, { fill: e.target.value })} />
              </Row>
              <Row label={t("边框色")}>
                <input type="color" value={node.stroke} onChange={(e) => patchNode(node.id, { stroke: e.target.value })} />
              </Row>
              <Row label={t("宽度")}>
                <input type="number" min={20} max={800} value={Math.round(node.width)} onChange={(e) => patchNode(node.id, { width: Number(e.target.value) || node.width })} />
              </Row>
              <Row label={t("高度")}>
                <input type="number" min={20} max={800} value={Math.round(node.height)} onChange={(e) => patchNode(node.id, { height: Number(e.target.value) || node.height })} />
              </Row>
              <Row label={t("旋转角度")}>
                <input type="number" step={15} value={node.rotation} onChange={(e) => patchNode(node.id, { rotation: Number(e.target.value) || 0 })} />
                <button className="btn sq" title={t("旋转 90°")} onClick={() => patchNode(node.id, { rotation: (node.rotation + 90) % 360 })}>⟳90°</button>
              </Row>
              <Row label={t("讲解置灰")}>
                <input type="checkbox" checked={!!node.disabled} onChange={(e) => patchNode(node.id, { disabled: e.target.checked })} />
              </Row>
              {node.type === "shape" && (
                <div className="insp-tip">{t("选中后拖动四角手柄可直接调整大小与比例")}</div>
              )}
            </Section>
            {node.type !== "label" && node.type !== "arrow" && <PortEditor node={node} />}
            {node.type === "solenoid2" && (
              <Section title={t("两通电磁阀")}>
                <Row label={t("阀状态")}>
                  <div className="seg">
                    <button className={node.valveState !== "closed" ? "on" : ""} onClick={() => patchNode(node.id, { valveState: "open" })}>{t("开")}</button>
                    <button className={node.valveState === "closed" ? "on" : ""} onClick={() => patchNode(node.id, { valveState: "closed" })}>{t("关")}</button>
                  </div>
                </Row>
                <Row label={t("画布显示")}>
                  <input type="checkbox" checked={!!node.showStateOnDiagram} onChange={(e) => patchNode(node.id, { showStateOnDiagram: e.target.checked })} />
                  <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{t("在画布上直接切换")}</span>
                </Row>
                <div className="insp-tip">{t("关闭时，串联的下游管路自动置灰、停止流动。勾选「画布显示」后，电磁阀下方出现可点击开关。")}</div>
              </Section>
            )}
            {node.type === "solenoid3" && (
              <Section title={t("三通电磁阀")}>
                <Row label={t("导通路径")}>
                  <div className="seg">
                    <button className={(node.valvePath ?? "A") === "A" ? "on" : ""} onClick={() => patchNode(node.id, { valvePath: "A" })}>{t("右侧 (A)")}</button>
                    <button className={node.valvePath === "B" ? "on" : ""} onClick={() => patchNode(node.id, { valvePath: "B" })}>{t("下方 (B)")}</button>
                    <button className={node.valvePath === "off" ? "on" : ""} onClick={() => patchNode(node.id, { valvePath: "off" })}>{t("关闭")}</button>
                  </div>
                </Row>
                <Row label={t("画布显示")}>
                  <input type="checkbox" checked={!!node.showStateOnDiagram} onChange={(e) => patchNode(node.id, { showStateOnDiagram: e.target.checked })} />
                  <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{t("在画布上直接切换")}</span>
                </Row>
                <div className="insp-tip">{t("仅导通所选路径：右侧(A) / 下方(B)；未选中的出口所连管路自动置灰、停止流动。勾选「画布显示」后，电磁阀下方出现可点击三档选择。")}</div>
              </Section>
            )}
            {(node.type === "pump" || node.type === "milkPump") && (
              <Section title={t("泵控制")}>
                <Row label={t("运行状态")}>
                  <div className="seg">
                    <button className={node.pumpOn !== false ? "on" : ""} onClick={() => patchNode(node.id, { pumpOn: true })}>{t("运行")}</button>
                    <button className={node.pumpOn === false ? "on" : ""} onClick={() => patchNode(node.id, { pumpOn: false })}>{t("停止")}</button>
                  </div>
                </Row>
                <Row label={t("画布显示")}>
                  <input type="checkbox" checked={node.showStateOnDiagram !== false} onChange={(e) => patchNode(node.id, { showStateOnDiagram: e.target.checked })} />
                  <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{t("在画布上直接切换")}</span>
                </Row>
                <div className="insp-tip">{t("泵停止时，其前后相连的管路自动停止流动（与电磁阀关闭同理）。")}</div>
              </Section>
            )}
            <Section title={t("操作")}>
              <button className="btn wide" onClick={duplicateSelection}>{t("复制节点")}</button>
              {node.groupId && (
                <button className="btn wide" onClick={ungroupSelection}>{t("解散组")}</button>
              )}
              <button className="btn danger wide" onClick={deleteSelection}>{t("删除节点")}</button>
            </Section>
            {(node.type === "pump" || node.type === "milkPump" || node.type === "solenoid2" || node.type === "solenoid3") && (
              <Section title="🔧 故障模拟（教学）">
                <Row label="故障状态">
                  <select
                    value={node.fault ?? "none"}
                    onChange={(e) => patchNode(node.id, { fault: e.target.value === "none" ? undefined : e.target.value as NodeFault })}
                  >
                    <option value="none">无故障</option>
                    {(node.type === "pump" || node.type === "milkPump") && <option value="pumpStuck">泵卡死（不运转）</option>}
                    {(node.type === "solenoid2" || node.type === "solenoid3") && (
                      <>
                        <option value="valveStuckOpen">阀卡开（无法关闭）</option>
                        <option value="valveStuckClosed">阀卡关（无法打开）</option>
                      </>
                    )}
                  </select>
                </Row>
                <div className="insp-tip">注入故障后，观察下游哪些管路停流，再配合「回路诊断」定位故障点。</div>
              </Section>
            )}
            {kn && (
              <Section title="📖 原理讲解">
                <div className="knowledge">
                  <div className="knowledge-item"><b>{t("作用")}</b>{kn.role}</div>
                  <div className="knowledge-item"><b>{t("原理")}</b>{kn.principle}</div>
                  {kn.common && <div className="knowledge-item"><b>{t("要点")}</b>{kn.common}</div>}
                </div>
              </Section>
            )}
          </>
          );
        })()}

        {!multi && pipe && (
          <>
            {funcChain && funcChain.nodeIds.length > 0 && (
              <Section title="🔗 所在功能链">
                <div className="chain-summary">{chainPathSummary(diagram, funcChain)}</div>
                <div className="insp-tip">按当前阀位/泵态追踪，与实际流动一致；画布上已用蓝色光环标出该链。</div>
              </Section>
            )}
            {pipeIssues.length > 0 && (
              <div className="fluid-warning">
                <div className="fluid-warning-title">⚠️ {t("介质异常")}（{pipeIssues.length} 处）</div>
                {pipeIssues.map((issue, i) => (
                  <div key={i} className="fluid-warning-row">
                    <div className="fluid-warning-msg">{issue.message}</div>
                    <div className="btn-row">
                      {issue.allowed.map((ft) => (
                        <button key={ft} className="btn" onClick={() => patchPipe(pipe.id, { fluidType: ft, fluidColor: fluidColor(ft) })}>
                          {t("改为")}「{fluidLabel(ft)}」
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {pipeStallCause && (
              <div className="fluid-warning">
                <div className="fluid-warning-title">🔍 {t("停流原因")}</div>
                <div className="fluid-warning-row">
                  <div className="fluid-warning-msg">{pipeStallCause.reason}</div>
                  <div className="btn-row" style={{ flexWrap: "wrap", gap: 4 }}>
                    {pipeStallCause.ids.map((id, i) => {
                      const nd = diagram.nodes.find((n) => n.id === id);
                      const pp = diagram.pipes.find((x) => x.id === id);
                      const label = nd?.label ?? pp?.label ?? id.slice(0, 8);
                      return (
                        <span key={i} className="cause-chip">
                          {i === 0 ? "根因：" : "→ "}{label}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
            <Section title={t("管路")}>
              <Row label={t("名称")}>
                <input value={pipe.label} onChange={(e) => patchPipe(pipe.id, { label: e.target.value })} />
              </Row>
              <Row label={t("标注文字")}>
                <input value={pipe.annotation ?? ""} placeholder="如 DN25 / 热水管路" onChange={(e) => patchPipe(pipe.id, { annotation: e.target.value })} />
              </Row>
              <div className="insp-tip">{t("标注文字显示在管路中段下方（黄色小标签），适合标注管径、介质或编号。")}</div>
              <Row label={t("两端连接")}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                  <span>
                    起点：{pipe.fromPortId ? (diagram.nodes.flatMap((n) => n.ports).find((p) => p.id === pipe.fromPortId)?.direction === "in" ? "已连端口(进)" : "已连端口(出)") : "游离端点"}
                    {pipe.fromPortId && (() => {
                      const ref = findPort(diagram.nodes, pipe.fromPortId!);
                      const pt = ref ? portWorldPos(ref.node, ref.port) : { x: 0, y: 0 };
                      return <button className="mini" style={{ marginLeft: 6 }} onClick={() => patchPipe(pipe.id, { fromPortId: undefined, fromPoint: pt })}>{t("断开")}</button>;
                    })()}
                  </span>
                  <span>
                    {pipe.toPortId ? (diagram.nodes.flatMap((n) => n.ports).find((p) => p.id === pipe.toPortId)?.direction === "in" ? "已连端口(进)" : "已连端口(出)") : "游离端点"}
                    {pipe.toPortId && (() => {
                      const ref = findPort(diagram.nodes, pipe.toPortId!);
                      const pt = ref ? portWorldPos(ref.node, ref.port) : { x: 0, y: 0 };
                      return <button className="mini" style={{ marginLeft: 6 }} onClick={() => patchPipe(pipe.id, { toPortId: undefined, toPoint: pt })}>{t("断开")}</button>;
                    })()}
                  </span>
                  <span style={{ color: "#7a8696" }}>{t("提示：拖动画布上管路端点的蓝色手柄即可重连或拖成游离端点")}</span>
                </div>
              </Row>
              <Section title={t("走线")}>
                <Row label={t("走线方式")}>
                  <select
                    value={pipe.routing ?? "orthogonal"}
                    onChange={(e) => patchPipe(pipe.id, { routing: e.target.value as "orthogonal" | "curved" })}
                  >
                    <option value="orthogonal">{t("直角折线")}</option>
                    <option value="curved">{t("平滑曲线")}</option>
                  </select>
                </Row>
                {pipe.routing !== "curved" && (
                  <Row label={`拐角圆角 ${Math.round(pipe.cornerRadius ?? 0)}px`}>
                    <input
                      type="range"
                      min={0}
                      max={40}
                      value={pipe.cornerRadius ?? 0}
                      onChange={(e) => patchPipe(pipe.id, { cornerRadius: Number(e.target.value) }, false)}
                      onMouseUp={() => patchPipe(pipe.id, {}, true)}
                    />
                  </Row>
                )}
                <div className="insp-tip">{t("选中管路后点击管路任意位置可插入折点并拖动；拖动已有折点可调形，右键折点删除。曲线模式下折点自由移动，折线模式下落在网格。")}</div>
              </Section>
              <Row label={t("介质类型")}>
                <select
                  value={pipe.fluidType ?? "custom"}
                  onChange={(e) => {
                    const preset = FLUID_PRESETS.find((f) => f.key === e.target.value);
                    if (!preset) return;
                    patchPipe(pipe.id, {
                      fluidType: preset.key,
                      ...(preset.key !== "custom" ? { fluidColor: preset.color } : {})
                    });
                  }}
                >
                  {FLUID_PRESETS.map((f) => (
                    <option key={f.key} value={f.key}>{f.label}</option>
                  ))}
                </select>
              </Row>
              <Row label={t("管材")}>
                <select
                  value={pipe.material ?? "custom"}
                  onChange={(e) => {
                    const preset = MATERIAL_PRESETS.find((m) => m.key === e.target.value);
                    if (!preset) return;
                    patchPipe(pipe.id, {
                      material: preset.key,
                      ...(preset.key !== "custom" ? { wallColor: preset.wallColor, wallOpacity: preset.wallOpacity } : {})
                    });
                  }}
                >
                  {MATERIAL_PRESETS.map((m) => (
                    <option key={m.key} value={m.key}>{m.label}</option>
                  ))}
                </select>
              </Row>
              <Row label={t("管径")}>
                <select
                  value={pipe.nominalDiameter}
                  onChange={(e) => patchPipe(pipe.id, { nominalDiameter: e.target.value })}
                >
                  {["DN6", "DN8", "DN10", "DN15", "DN20", "DN25", "DN32", "DN40", "DN50", "DN65", "DN80"].map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </Row>
              <Row label={`显示线宽 ${pipe.visualDiameter}px`}>
                <input
                  type="range"
                  min={3}
                  max={30}
                  value={pipe.visualDiameter}
                  onChange={(e) => patchPipe(pipe.id, { visualDiameter: Number(e.target.value) }, false)}
                  onMouseUp={() => patchPipe(pipe.id, {}, true)}
                />
              </Row>
              <Row label={t("管壁颜色")}>
                <ColorSwatch value={pipe.wallColor} presets={WALL_COLOR_PRESETS} onChange={(c) => patchPipe(pipe.id, { wallColor: c, material: "custom" })} />
              </Row>
              <Row label={`管壁透明度 ${Math.round((pipe.wallOpacity ?? 1) * 100)}%`}>
                <input
                  type="range"
                  min={20}
                  max={100}
                  value={Math.round((pipe.wallOpacity ?? 1) * 100)}
                  onChange={(e) => patchPipe(pipe.id, { wallOpacity: Number(e.target.value) / 100 }, false)}
                  onMouseUp={() => patchPipe(pipe.id, {}, true)}
                />
              </Row>
              <Row label={t("液体颜色")}>
                <ColorSwatch value={pipe.fluidColor} presets={FLUID_COLOR_PRESETS} onChange={(c) => patchPipe(pipe.id, { fluidColor: c, fluidType: "custom" })} />
              </Row>
              <Row label={`液体透明度 ${Math.round(pipe.fluidOpacity * 100)}%`}>
                <input
                  type="range"
                  min={20}
                  max={100}
                  value={Math.round(pipe.fluidOpacity * 100)}
                  onChange={(e) => patchPipe(pipe.id, { fluidOpacity: Number(e.target.value) / 100 }, false)}
                  onMouseUp={() => patchPipe(pipe.id, {}, true)}
                />
              </Row>
            </Section>
            <Section title={t("样式复制")}>
              <div className="btn-row">
                <button className="btn wide" title={t("复制当前管路的颜色/管径/流速等样式")} onClick={() => copyPipeStyle(pipe.id)}>{t("📋 复制样式")}</button>
                <button className="btn wide" title={t("将复制的样式应用到当前管路")} disabled={!hasPipeStyle()} onClick={() => pastePipeStyle(pipe.id)}>{t("📌 粘贴样式")}</button>
              </div>
              <div className="insp-tip">{t("复制某条管路样式后，选中另一条管路点「粘贴样式」即可快速套用相同的外观与流动参数。")}</div>
            </Section>
            <Section title={t("流动")}>
              <Row label={t("流向")}>
                <div className="seg">
                  <button className={pipe.direction === "forward" ? "on" : ""} onClick={() => patchPipe(pipe.id, { direction: "forward" })}>{t("正向")}</button>
                  <button className={pipe.direction === "reverse" ? "on" : ""} onClick={() => patchPipe(pipe.id, { direction: "reverse" })}>{t("反向")}</button>
                </div>
              </Row>
              <Row label={`流速 ${pipe.flowSpeed.toFixed(1)} m/s`}>
                <input
                  type="range"
                  min={1}
                  max={30}
                  value={Math.round(pipe.flowSpeed * 10)}
                  onChange={(e) => patchPipe(pipe.id, { flowSpeed: Number(e.target.value) / 10 }, false)}
                  onMouseUp={() => patchPipe(pipe.id, {}, true)}
                />
              </Row>
              <Row label={t("流动动画")}>
                <input type="checkbox" checked={pipe.animated} onChange={(e) => patchPipe(pipe.id, { animated: e.target.checked })} />
              </Row>
              <Row label={t("颗粒密度")}>
                <div className="seg">
                  <button className={pipe.particleDensity === "low" ? "on" : ""} onClick={() => patchPipe(pipe.id, { particleDensity: "low" })}>{t("稀疏")}</button>
                  <button className={pipe.particleDensity === "medium" ? "on" : ""} onClick={() => patchPipe(pipe.id, { particleDensity: "medium" })}>{t("标准")}</button>
                  <button className={pipe.particleDensity === "high" ? "on" : ""} onClick={() => patchPipe(pipe.id, { particleDensity: "high" })}>{t("密集")}</button>
                </div>
              </Row>
              <Row label={t("流向箭头")}>
                <input type="checkbox" checked={pipe.showArrow} onChange={(e) => patchPipe(pipe.id, { showArrow: e.target.checked })} />
              </Row>
              <Row label={t("讲解置灰")}>
                <input type="checkbox" checked={!!pipe.disabled} onChange={(e) => patchPipe(pipe.id, { disabled: e.target.checked })} />
              </Row>
              <Row label="🔧 故障模拟">
                <input type="checkbox" checked={pipe.fault === "pipeBlocked"} onChange={(e) => patchPipe(pipe.id, { fault: e.target.checked ? "pipeBlocked" : undefined })} />
                <span style={{ fontSize: 12, color: "var(--text-dim)" }}>管路堵塞（停止流动）</span>
              </Row>
              <Row label="▶ 强制流动">
                <input type="checkbox" checked={!!pipe.forceFlow} onChange={(e) => patchPipe(pipe.id, { forceFlow: e.target.checked || undefined })} />
                <span style={{ fontSize: 12, color: "var(--text-dim)" }}>临时强制流动（忽略停流判定）</span>
              </Row>
              <Row label="⏹ 强制停止">
                <input type="checkbox" checked={!!pipe.forceStop} onChange={(e) => patchPipe(pipe.id, { forceStop: e.target.checked || undefined })} />
                <span style={{ fontSize: 12, color: "var(--text-dim)" }}>临时强制停止（无视其他状态）</span>
              </Row>
              <Row label={t("路径")}>
                <button className="btn" title={t("清除手动调整的路径点，恢复自动走线")} onClick={() => patchPipe(pipe.id, { points: [] })}>{t("重置走线")}</button>
              </Row>
            </Section>
            <Section title={t("操作")}>
              <button className="btn danger wide" onClick={deleteSelection}>{t("删除管路")}</button>
            </Section>
          </>
        )}

        {!multi && !node && !pipe && (
          <Section title={t("项目设置")}>
            <Row label={t("项目名称")}>
              <input
                value={diagram.name}
                onChange={(e) =>
                  updateDiagram((d) => {
                    d.name = e.target.value;
                  }, false)
                }
              />
            </Row>
            <Row label={t("画布背景")}>
              <input
                type="color"
                value={diagram.settings.background}
                onChange={(e) =>
                  updateDiagram((d) => {
                    d.settings.background = e.target.value;
                  }, false)
                }
              />
            </Row>
            <Row label={t("显示网格")}>
              <input
                type="checkbox"
                checked={diagram.settings.showGrid}
                onChange={(e) =>
                  updateDiagram((d) => {
                    d.settings.showGrid = e.target.checked;
                  }, false)
                }
              />
            </Row>
            <Row label={t("背景样式")}>
              <select
                value={diagram.settings.backgroundType ?? "dot"}
                onChange={(e) =>
                  updateDiagram((d) => {
                    d.settings.backgroundType = e.target.value as "dot" | "grid" | "solid";
                  }, false)
                }
              >
                <option value="dot">{t("点阵")}</option>
                <option value="grid">{t("方格")}</option>
                <option value="solid">{t("纯色")}</option>
              </select>
            </Row>
            <Row label={t("交叉跨线")}>
              <input
                type="checkbox"
                title={t("管路交叉处用拱桥绕过，避免误解为连通")}
                checked={diagram.settings.crossoverHops !== false}
                onChange={(e) =>
                  updateDiagram((d) => {
                    d.settings.crossoverHops = e.target.checked;
                  }, false)
                }
              />
            </Row>
            <Row label={t("全局动画")}>
              <input type="checkbox" checked={diagram.settings.globalAnimationPlaying} onChange={(e) => updateDiagram((d) => { d.settings.globalAnimationPlaying = e.target.checked; }, false)} />
            </Row>
            <Row label={t("吸附到网格")}>
              <input type="checkbox" checked={diagram.settings.snapToGrid !== false} onChange={(e) => updateDiagram((d) => { d.settings.snapToGrid = e.target.checked; }, false)} />
            </Row>
            <Row label={t("对齐辅助线")}>
              <input type="checkbox" checked={diagram.settings.showAlignmentGuides !== false} onChange={(e) => updateDiagram((d) => { d.settings.showAlignmentGuides = e.target.checked; }, false)} />
            </Row>
            <Row label={t("介质标签")}>
              <input type="checkbox" checked={diagram.settings.showFluidLabels === true} onChange={(e) => updateDiagram((d) => { d.settings.showFluidLabels = e.target.checked; }, false)} />
            </Row>
            <Section title={t("操作")}>
              <div className="btn-row">
                <button className="btn wide" onClick={() => generateLegend(100, 100)}>{t("📊 生成图例")}</button>
                <button className="btn wide" onClick={() => downloadBom(diagram)}>{t("📋 导出 BOM 清单")}</button>
              </div>
              <Row label={t("插入模板")}>
                <select
                  value=""
                  onChange={(e) => { if (e.target.value) { insertTemplate(e.target.value); e.target.value = ""; } }}
                >
                  <option value="">{t("选择模板…")}</option>
                  <option value="循环回路">{t("🔄 循环回路")}</option>
                  <option value="咖啡机水路">{t("☕ 咖啡机水路")}</option>
                  <option value="蒸汽系统">{t("♨️ 蒸汽系统")}</option>
                  <option value="牛奶发泡系统">{t("🥛 牛奶发泡系统")}</option>
                  <option value="商用咖啡机整机">{t("☕ 商用咖啡机整机")}</option>
                  <option value="半自动咖啡机（双锅炉）">{t("☕ 半自动咖啡机（双锅炉）")}</option>
                  <option value="全自动商用咖啡机">{t("☕ 全自动商用咖啡机")}</option>
                  <option value="咖啡机整机示例（演示）">{t("🎬 咖啡机整机示例（演示）")}</option>
                </select>
              </Row>
            </Section>
            <Section title={t("撤销历史")}>
              <div className="insp-row">
                <span style={{ color: "var(--text-dim)", fontSize: 12 }}>可撤销 {getUndoCount()} 步 · 可重做 {getRedoCount()} 步</span>
              </div>
            </Section>
            <div className="insp-tip">{t("提示：")}<br />{t("· 悬停节点显示端口，从端口拖拽到另一端口生成管路")}<br />{t("· 拖动节点时自动对齐其他节点，出现洋红参考线；按住 Alt 可临时关闭吸附")}<br />{t("· 方向键微调 1px，Shift + 方向键 10px")}<br />{t("· Ctrl+G 成组、Ctrl+Shift+G 解散组")}<br />{t("· Alt + 拖动端口可改变端口位置")}<br />{t("· 选中节点拖四角手柄可调整大小")}<br />{t("· 空格/中键/右键拖拽平移画布，滚轮缩放")}<br />{t("· Delete 删除，Ctrl+Z 撤销，Ctrl+D 复制")}<br />{t("· Ctrl+C/V 复制粘贴")}<br />{t("· ? 键查看全部快捷键")}<br />{t("· 液路问题请用工具栏「回路诊断」一键检查并修复")}</div>
          </Section>
        )}
        {node && (
          <Section title={t("样式预设")}>
            <Row label={t("快速应用")}>
              <select
                value=""
                onChange={(e) => { if (e.target.value) { applyStylePreset(e.target.value, [node.id]); e.target.value = ""; } }}
              >
                <option value="">{t("选择样式…")}</option>
                {getStylePresets().map((name) => (<option key={name} value={name}>{name}</option>))}
              </select>
            </Row>
          </Section>
        )}
        <Section title={t("图层管理")}>
          {(diagram.settings.layers ?? []).map((layer) => (
            <div key={layer.id} className="insp-row" style={{ marginBottom: 6, alignItems: "center" }}>
              <span style={{ display: "inline-block", width: 14, height: 14, borderRadius: 3, background: layer.visible ? "#2f7fd6" : "#d7dee7", cursor: "pointer", marginRight: 6, flexShrink: 0 }} onClick={() => toggleLayerVisibility(layer.id)} title={layer.visible ? "隐藏" : "显示"} />
              <span style={{ flex: 1, fontSize: 12, color: layer.visible ? "var(--text)" : "var(--text-dim)" }}>{layer.name}</span>
              {(diagram.settings.layers?.length ?? 0) > 1 && (
                <button className="btn sq danger" title={t("删除图层")} onClick={() => removeLayer(layer.id)} style={{ width: 20, height: 20, fontSize: 11, padding: 0, lineHeight: "18px" }}>×</button>
              )}
            </div>
          ))}
          {node && (
            <Row label={t("分配到图层")}>
              <select value={node.layerId ?? ""} onChange={(e) => setNodeLayer(node.id, e.target.value || undefined)}>
                <option value="">{t("无")}</option>
                {(diagram.settings.layers ?? []).map((l) => (<option key={l.id} value={l.id}>{l.name}</option>))}
              </select>
            </Row>
          )}
          <button className="btn wide" onClick={() => addLayer(`图层 ${(diagram.settings.layers?.length ?? 0) + 1}`)}>{t("＋ 新建图层")}</button>
        </Section>
      </div>
      )}
    </div>
  );
}
