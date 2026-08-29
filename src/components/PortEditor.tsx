import type { DiagramNode, PortPosition } from "../types";
import { addPort, patchPort, removePort, MAX_PORTS_PER_NODE } from "../store";
import { useT } from "../i18n";

const BOILER_TYPES = new Set(["boiler", "hotWaterBoiler", "steamBoiler"]);

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="insp-section">
      <div className="insp-section-title">{title}</div>
      {children}
    </div>
  );
}

export function PortEditor({ node }: { node: DiagramNode }) {
  const { t } = useT();
  const isBoiler = BOILER_TYPES.has(node.type);
  const SIDE_LABEL: Record<PortPosition, string> = { top: t("上"), right: t("右"), bottom: t("下"), left: t("左") };
  return (
    <Section title={`${t("端口")}（${node.ports.length}）`}>
      {node.ports.map((port, i) => (
        <div className="port-row" key={port.id}>
          <span className="port-idx">{i + 1}</span>
          <select
            value={port.direction ?? "bidirectional"}
            title={t("流向")}
            onChange={(e) => patchPort(node.id, port.id, { direction: e.target.value as never })}
          >
            <option value="in">{t("进")}</option>
            <option value="out">{t("出")}</option>
            <option value="bidirectional">{t("双向")}</option>
          </select>
          <select
            value={port.position}
            title={t("所在边")}
            onChange={(e) => patchPort(node.id, port.id, { position: e.target.value as PortPosition })}
          >
            {((isBoiler ? ["top", "bottom"] : Object.keys(SIDE_LABEL)) as PortPosition[]).map((s) => (
              <option key={s} value={s}>{SIDE_LABEL[s]}</option>
            ))}
          </select>
          <input
            type="range"
            min={5}
            max={95}
            title={t("沿边位置")}
            value={Math.round((port.offset ?? 0.5) * 100)}
            onChange={(e) => patchPort(node.id, port.id, { offset: Number(e.target.value) / 100 }, false)}
            onMouseUp={() => patchPort(node.id, port.id, {}, true)}
          />
          <button className="btn sq danger" title={t("删除端口（连带删除所连管路）")} onClick={() => removePort(node.id, port.id)}>×</button>
        </div>
      ))}
      <div className="port-add">
        <button className="btn" disabled={node.ports.length >= MAX_PORTS_PER_NODE} onClick={() => addPort(node.id, "in")}>＋{isBoiler ? t("进水口") : t("进口")}</button>
        <button className="btn" disabled={node.ports.length >= MAX_PORTS_PER_NODE} onClick={() => addPort(node.id, "out")}>＋{isBoiler ? t("出水口") : t("出口")}</button>
      </div>
      <div className="insp-tip">{t("Alt + 在画布上拖动端口可改所在边与位置；端口上限")} {MAX_PORTS_PER_NODE} {t("个")}。{isBoiler ? t("锅炉仅上/下端可接管（进水在下、出水在上），端口增多时尺寸自动增大") : ""}</div>
    </Section>
  );
}
