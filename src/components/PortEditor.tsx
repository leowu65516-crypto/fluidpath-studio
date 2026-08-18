import type { DiagramNode, PortPosition } from "../types";
import { addPort, patchPort, removePort, MAX_PORTS_PER_NODE } from "../store";

const SIDE_LABEL: Record<PortPosition, string> = { top: "上", right: "右", bottom: "下", left: "左" };
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
  const isBoiler = BOILER_TYPES.has(node.type);
  return (
    <Section title={`端口（${node.ports.length}）`}>
      {node.ports.map((port, i) => (
        <div className="port-row" key={port.id}>
          <span className="port-idx">{i + 1}</span>
          <select
            value={port.direction ?? "bidirectional"}
            title="流向"
            onChange={(e) => patchPort(node.id, port.id, { direction: e.target.value as never })}
          >
            <option value="in">进</option>
            <option value="out">出</option>
            <option value="bidirectional">双向</option>
          </select>
          <select
            value={port.position}
            title="所在边"
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
            title="沿边位置"
            value={Math.round((port.offset ?? 0.5) * 100)}
            onChange={(e) => patchPort(node.id, port.id, { offset: Number(e.target.value) / 100 }, false)}
            onMouseUp={() => patchPort(node.id, port.id, {}, true)}
          />
          <button className="btn sq danger" title="删除端口（连带删除所连管路）" onClick={() => removePort(node.id, port.id)}>×</button>
        </div>
      ))}
      <div className="port-add">
        <button className="btn" disabled={node.ports.length >= MAX_PORTS_PER_NODE} onClick={() => addPort(node.id, "in")}>＋{isBoiler ? "进水口" : "进口"}</button>
        <button className="btn" disabled={node.ports.length >= MAX_PORTS_PER_NODE} onClick={() => addPort(node.id, "out")}>＋{isBoiler ? "出水口" : "出口"}</button>
      </div>
      <div className="insp-tip">Alt + 在画布上拖动端口可改所在边与位置；端口上限 {MAX_PORTS_PER_NODE} 个。{isBoiler ? "锅炉仅上/下端可接管（进水在下、出水在上），端口增多时尺寸自动增大" : ""}</div>
    </Section>
  );
}
