import type { DiagramNode } from "./types";
import { diaphragmPortLabel, diaphragmValveRoute } from "./diaphragmValve";
import { portLocalPos } from "./geometry";

export type SymbolSurface = "canvas" | "library" | "preview" | "inspector";

const FONT = "system-ui, sans-serif";

function Mark({ node, text, y, k = 1 }: { node: DiagramNode; text: string; y?: number; k?: number }) {
  return <text x={node.width / 2} y={y ?? node.height / 2 + 4} textAnchor="middle" fontSize={Math.min(12 * k, 16, Math.max(8 * k, node.width / 7))} fill={node.stroke} fontFamily={FONT} fontWeight={700}>{text}</text>;
}

function TwoPortValve({ node, kind = "manual", k = 1 }: { node: DiagramNode; kind?: "manual" | "solenoid" | "diaphragm" | "check" | "ball" | "regulator"; k?: number }) {
  const { width: w, height: h, fill, stroke } = node;
  const cy = h * 0.68;
  const common = { fill, stroke, strokeWidth: 2 * k } as const;
  const left = <path d={`M 3 ${cy - 14} L ${w / 2} ${cy} L 3 ${cy + 14} Z`} {...common} />;
  const right = <path d={`M ${w - 3} ${cy - 14} L ${w / 2} ${cy} L ${w - 3} ${cy + 14} Z`} {...common} />;
  if (kind === "check") return <g data-symbol-feature="check-direction">{left}<line x1={w / 2} y1={cy - 16} x2={w / 2} y2={cy + 16} stroke={stroke} strokeWidth={2.5 * k} /><path d={`M ${w - 19} ${cy} H ${w - 4} M ${w - 11} ${cy - 6} L ${w - 4} ${cy} L ${w - 11} ${cy + 6}`} fill="none" stroke={stroke} strokeWidth={1.8 * k} /></g>;
  if (kind === "ball") {
    const open = node.valveState !== "closed";
    return <g data-symbol-feature="ball-valve"><circle cx={w / 2} cy={cy} r={Math.min(w, h) * 0.23} {...common} /><line x1={w * 0.12} y1={cy} x2={w * 0.27} y2={cy} stroke={stroke} strokeWidth={2 * k} /><line x1={w * 0.73} y1={cy} x2={w * 0.88} y2={cy} stroke={stroke} strokeWidth={2 * k} /><line x1={w / 2} y1={cy} x2={open ? w * 0.78 : w / 2} y2={open ? h * 0.17 : h * 0.14} stroke={stroke} strokeWidth={2.5 * k} strokeLinecap="round" /></g>;
  }
  if (kind === "regulator") return <g data-symbol-feature="pressure-regulator">{left}{right}<line x1={w / 2} y1={cy} x2={w / 2} y2={h * 0.26} stroke={stroke} strokeWidth={2 * k} /><path d={`M ${w / 2 - 8} ${h * 0.27} l 5 -5 l -10 -5 l 10 -5 l -5 -5`} fill="none" stroke={stroke} strokeWidth={1.5 * k} /><path d={`M ${w * 0.7} ${h * 0.22} L ${w * 0.9} ${h * 0.06} M ${w * 0.81} ${h * 0.06} H ${w * 0.9} V ${h * 0.15}`} fill="none" stroke={stroke} strokeWidth={1.5 * k} /></g>;
  if (kind === "solenoid" || kind === "diaphragm") return <g data-symbol-feature={kind === "solenoid" ? "solenoid-coil" : "diaphragm-actuator"}>{left}{right}{kind === "diaphragm" && <path d={`M ${w / 2 - 18} ${cy - 5} Q ${w / 2} ${cy - 14} ${w / 2 + 18} ${cy - 5}`} fill="none" stroke={stroke} strokeWidth={1.8 * k} />}<line x1={w / 2} y1={cy} x2={w / 2} y2={h * 0.29} stroke={stroke} strokeWidth={2 * k} />{kind === "solenoid" ? <rect x={w / 2 - 14} y={3} width={28} height={h * 0.22} fill="none" stroke={stroke} strokeWidth={2 * k} /> : <path d={`M ${w / 2 - 16} ${h * 0.24} Q ${w / 2} ${h * 0.05} ${w / 2 + 16} ${h * 0.24} Z`} fill="none" stroke={stroke} strokeWidth={2 * k} />}</g>;
  return <g data-symbol-feature="shutoff-valve">{left}{right}<line x1={w / 2} y1={cy} x2={w / 2} y2={8} stroke={stroke} strokeWidth={2 * k} /><line x1={w / 2 - 12} y1={8} x2={w / 2 + 12} y2={8} stroke={stroke} strokeWidth={2.5 * k} strokeLinecap="round" /></g>;
}

function Outlet({ node, kind, k = 1 }: { node: DiagramNode; kind: "coffee" | "milk" | "hotWater" | "group"; k?: number }) {
  const { width: w, height: h, fill, stroke } = node;
  const cx = w / 2, bodyY = kind === "group" ? h * 0.42 : h * 0.5, double = node.variant === "double";
  return <g data-symbol-feature={`${kind}-outlet`}>
    <rect x={cx - 10} y={2} width={20} height={8} fill={fill} stroke={stroke} strokeWidth={1.8 * k} />
    <path d={`M ${w * 0.15} 10 H ${w * 0.85} V ${bodyY - 8} Q ${w * 0.85} ${bodyY} ${w * 0.7} ${bodyY} H ${w * 0.3} Q ${w * 0.15} ${bodyY} ${w * 0.15} ${bodyY - 8} Z`} fill={fill} stroke={stroke} strokeWidth={2 * k} />
    {kind === "group" && [0.34, 0.5, 0.66].map((x) => <line key={x} x1={w * x} y1={bodyY - 13} x2={w * x} y2={bodyY - 5} stroke={stroke} strokeWidth={1.4 * k} />)}
    {kind === "milk" && <path d={`M ${cx} ${bodyY - 14} C ${cx + 7} ${bodyY - 5}, ${cx + 8} ${bodyY + 7}, ${cx} ${bodyY + 10} C ${cx - 8} ${bodyY + 7}, ${cx - 7} ${bodyY - 5}, ${cx} ${bodyY - 14} Z`} fill="none" stroke={stroke} strokeWidth={1.6 * k} />}
    {kind === "hotWater" && [0, 1, 2].map((i) => <path key={i} d={`M ${w * 0.26} ${bodyY - 16 + i * 6} q ${w * 0.12} -5 ${w * 0.24} 0 q ${w * 0.12} 5 ${w * 0.24} 0`} fill="none" stroke={stroke} strokeWidth={1.3 * k} />)}
    {kind === "coffee" && <path d={`M ${w * 0.32} ${bodyY - 14} h ${w * 0.36} M ${w * 0.32} ${bodyY - 9} h ${w * 0.36}`} fill="none" stroke={stroke} strokeWidth={1.2 * k} />}
    {double ? <g><path d={`M ${cx - 6} ${bodyY} L ${w * 0.3} ${h - 5}`} fill="none" stroke={stroke} strokeWidth={3 * k} strokeLinecap="round" /><path d={`M ${cx + 6} ${bodyY} L ${w * 0.7} ${h - 5}`} fill="none" stroke={stroke} strokeWidth={3 * k} strokeLinecap="round" /></g> : <path d={`M ${cx} ${bodyY} V ${h - 5}`} fill="none" stroke={stroke} strokeWidth={3 * k} strokeLinecap="round" />}
  </g>;
}

function ThreeWayDiaphragm({ node, surface, k = 1 }: { node: DiagramNode; surface: SymbolSurface; k?: number }) {
  const { width: w, height: h, fill, stroke } = node;
  const cy = h * 0.59, center = { x: w / 2, y: cy };
  const route = diaphragmValveRoute(node, node.valvePath === "B" ? "B" : "A");
  const portPoints = node.ports.slice(0, 3).map((port) => ({ port, point: portLocalPos(node, port) }));
  const active = route.activeBranch ? portLocalPos(node, route.activeBranch) : undefined;
  const common = route.commonPort ? portLocalPos(node, route.commonPort) : undefined;
  return <g data-symbol-feature="three-way-diaphragm">
    {portPoints.map(({ port, point }) => <line key={port.id} x1={center.x} y1={center.y} x2={point.x} y2={point.y} stroke={stroke} strokeWidth={2 * k} />)}
    <circle cx={center.x} cy={center.y} r={14} fill={fill} stroke={stroke} strokeWidth={2 * k} />
    <path d={`M ${w / 2 - 18} ${cy - 5} Q ${w / 2} ${cy - 14} ${w / 2 + 18} ${cy - 5}`} fill="none" stroke={stroke} strokeWidth={1.8 * k} />
    <path d={`M ${w / 2} ${cy - 4} V ${h * 0.2}`} stroke={stroke} strokeWidth={2 * k} />
    <path d={`M ${w / 2 - 16} ${h * 0.2} Q ${w / 2} ${h * 0.03} ${w / 2 + 16} ${h * 0.2} Z`} fill="none" stroke={stroke} strokeWidth={2 * k} />
    {common && active && <path data-symbol-feature="active-selector-route" d={`M ${common.x} ${common.y} L ${center.x} ${center.y} L ${active.x} ${active.y}`} fill="none" stroke={stroke} strokeWidth={3.2 * k} strokeLinecap="round" strokeLinejoin="round" />}
    {surface !== "library" && portPoints.map(({ port, point }) => <text key={port.id} x={point.x + (point.x < center.x ? 7 : point.x > center.x ? -7 : 0)} y={point.y + (point.y < center.y ? 11 : -7)} textAnchor={point.x < center.x ? "start" : point.x > center.x ? "end" : "middle"} fontSize={8 * k} fill={stroke} fontFamily={FONT} fontWeight={700}>{diaphragmPortLabel(node, port)}</text>)}
  </g>;
}

/**
 * 管路件（三通/四通/弯头）：用「端口驱动的粗线」表达连接拓扑。
 * 字母框在 27% 缩放下完全不可读，而 T 形/十字线在任何缩放比例下都能看出是几通。
 */
function PipeJunction({ node, k = 1 }: { node: DiagramNode; k?: number }) {
  const cx = node.width / 2;
  const cy = node.height / 2;
  const points = node.ports.length
    ? node.ports.map((port) => portLocalPos(node, port))
    : [{ x: 0, y: cy }, { x: node.width, y: cy }, { x: cx, y: 0 }];
  return (
    <g data-symbol-feature={`junction-${node.ports.length}`}>
      {points.map((pt, i) => (
        <line key={i} x1={cx} y1={cy} x2={pt.x} y2={pt.y} stroke={node.stroke} strokeWidth={3.2 * k} strokeLinecap="round" />
      ))}
      <circle cx={cx} cy={cy} r={3 * k} fill={node.stroke} />
    </g>
  );
}

/** 接头（同径/金属）：两根平行短线夹住中间短管，读作「两管对接」 */
function Coupling({ node, metal = false, k = 1 }: { node: DiagramNode; metal?: boolean; k?: number }) {
  const w = node.width;
  const h = node.height;
  const cy = h / 2;
  const stroke = node.stroke;
  return (
    <g data-symbol-feature={metal ? "coupling-metal" : "coupling"}>
      <line x1={2} y1={cy} x2={w - 2} y2={cy} stroke={stroke} strokeWidth={3.2 * k} strokeLinecap="round" />
      <line x1={w * 0.36} y1={cy - h * 0.3} x2={w * 0.36} y2={cy + h * 0.3} stroke={stroke} strokeWidth={2.4 * k} strokeLinecap="round" />
      <line x1={w * 0.64} y1={cy - h * 0.3} x2={w * 0.64} y2={cy + h * 0.3} stroke={stroke} strokeWidth={2.4 * k} strokeLinecap="round" />
      {metal && <path d={`M ${w * 0.36} ${cy - h * 0.3} L ${w * 0.64} ${cy + h * 0.3} M ${w * 0.36} ${cy + h * 0.3} L ${w * 0.64} ${cy - h * 0.3}`} stroke={stroke} strokeWidth={1.2 * k} />}
    </g>
  );
}

/** 容器族：直立罐体 + 液位线；不再用 TA/SYR/BR 字母框 */
function Vessel({ node, kind, k = 1 }: { node: DiagramNode; kind: "tank" | "pressureTank" | "syrupBottle" | "brewChamber"; k?: number }) {
  const w = node.width;
  const h = node.height;
  const { fill, stroke } = node;
  const bodyTop = kind === "syrupBottle" ? h * 0.24 : 4;
  const level = kind === "brewChamber" ? h * 0.42 : h * 0.52;
  return (
    <g data-symbol-feature={`vessel-${kind}`}>
      {/* 罐体 */}
      <path
        d={`M 4 ${bodyTop} H ${w - 4} V ${h - 6} Q ${w - 4} ${h - 2} ${w - 10} ${h - 2} H 10 Q 4 ${h - 2} 4 ${h - 6} Z`}
        fill={fill}
        stroke={stroke}
        strokeWidth={2 * k}
      />
      {/* 液位线 */}
      <line x1={6} y1={level} x2={w - 6} y2={level} stroke={stroke} strokeWidth={1.4 * k} strokeDasharray={`${5 * k} ${4 * k}`} />
      {/* 液面波纹（区分「有液体的罐」与普通方块） */}
      <path d={`M ${w * 0.16} ${level} q ${w * 0.1} ${-6 * k} ${w * 0.2} 0 t ${w * 0.2} 0 t ${w * 0.2} 0`} fill="none" stroke={stroke} strokeWidth={1.2 * k} opacity={0.75} />
      {kind === "syrupBottle" && <rect x={w * 0.36} y={4} width={w * 0.28} height={bodyTop - 4} fill={fill} stroke={stroke} strokeWidth={2 * k} />}
      {kind === "pressureTank" && <>
        <line x1={4} y1={h * 0.34} x2={w - 4} y2={h * 0.34} stroke={stroke} strokeWidth={2 * k} />
        <path d={`M ${w / 2} ${h * 0.34} V ${h * 0.16}`} stroke={stroke} strokeWidth={1.6 * k} />
        <path d={`M ${w / 2 - 5 * k} ${h * 0.16} H ${w / 2 + 5 * k}`} stroke={stroke} strokeWidth={1.6 * k} />
      </>}
      {kind === "brewChamber" && <>
        <path d={`M ${w * 0.22} ${h * 0.3} L ${w * 0.5} ${h * 0.2} L ${w * 0.78} ${h * 0.3}`} fill="none" stroke={stroke} strokeWidth={1.6 * k} />
        <path d={`M ${w * 0.24} ${h * 0.68} h ${w * 0.52}`} stroke={stroke} strokeWidth={1.6 * k} />
        <path d={`M ${w * 0.5} ${h * 0.68} V ${h * 0.82} M ${w * 0.5 - 4 * k} ${h * 0.77} L ${w * 0.5} ${h * 0.82} L ${w * 0.5 + 4 * k} ${h * 0.77}`} fill="none" stroke={stroke} strokeWidth={1.6 * k} />
      </>}
    </g>
  );
}

/** 进/出水口：箭头 + 短管，替代 IN/OUT 字母框 */
function PortArrow({ node, dir, k = 1 }: { node: DiagramNode; dir: "in" | "out"; k?: number }) {
  const w = node.width;
  const h = node.height;
  const cy = h / 2;
  const stroke = node.stroke;
  const tipX = dir === "in" ? w * 0.62 : w * 0.34;
  const tailX = dir === "in" ? w * 0.16 : w * 0.84;
  const head = 10 * k;
  return (
    <g data-symbol-feature={dir === "in" ? "port-in" : "port-out"}>
      <rect x={w * (dir === "in" ? 0.16 : 0.34)} y={cy - h * 0.3} width={w * 0.5} height={h * 0.6} fill={node.fill} stroke={stroke} strokeWidth={1.6 * k} />
      <line x1={tailX} y1={cy} x2={tipX} y2={cy} stroke={stroke} strokeWidth={2.4 * k} strokeLinecap="round" />
      <path d={`M ${tipX - (dir === "in" ? head : -head)} ${cy - head * 0.7} L ${tipX} ${cy} L ${tipX - (dir === "in" ? head : -head)} ${cy + head * 0.7}`} fill="none" stroke={stroke} strokeWidth={2.4 * k} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

/** ISO/ISA-inspired visual language only; never a change to the engineering model. */
export function EngineeringNodeSymbol({ node, surface = "canvas", zoom = 1 }: { node: DiagramNode; surface?: SymbolSurface; zoom?: number }) {
  const { width: w, height: h, fill, stroke } = node;
  // 线宽/字号补偿：27% 缩放下 2px 会缩成 0.54px 的灰雾，必须换算回屏幕像素（上限 3 倍，避免 100% 时变粗）
  const k = Math.min(3, Math.max(1, 1 / Math.max(0.2, zoom)));
  const common = { fill, stroke, strokeWidth: 2 * k } as const;
  const box = (code: string) => <g data-symbol-feature={`engineering-${node.type}`}><rect x={2} y={2} width={w - 4} height={h - 4} rx={4} {...common} /><Mark node={node} text={code} k={k} /></g>;
  switch (node.type) {
    // ===== 管路件：端口驱动线条，替代 TE/CO/ME 字母框 =====
    case "tee": case "teeY": case "teeF": case "cross": case "elbow":
      return <PipeJunction node={node} k={k} />;
    case "coupling": return <Coupling node={node} k={k} />;
    case "metalCoupling": return <Coupling node={node} metal k={k} />;
    case "connector":
      return (
        <g data-symbol-feature="connector">
          <line x1={2} y1={h / 2} x2={w - 2} y2={h / 2} stroke={stroke} strokeWidth={3.2 * k} strokeLinecap="round" />
          <circle cx={w / 2} cy={h / 2} r={Math.min(w, h) * 0.16} fill={fill} stroke={stroke} strokeWidth={2 * k} />
        </g>
      );
    // ===== 容器：直立罐体 + 液位线，替代 TA/SYR/ACC/BR 字母框 =====
    case "tank": return <Vessel node={node} kind="tank" k={k} />;
    case "pressureTank": return <Vessel node={node} kind="pressureTank" k={k} />;
    case "syrupBottle": return <Vessel node={node} kind="syrupBottle" k={k} />;
    case "brewChamber": return <Vessel node={node} kind="brewChamber" k={k} />;
    // ===== 进/出水口：箭头替代 IN/OUT =====
    case "inlet": return <PortArrow node={node} dir="in" k={k} />;
    case "outlet": return <PortArrow node={node} dir="out" k={k} />;
    case "pump": case "milkPump": case "airPump": { const r = Math.min(w, h) / 2 - 4, cx = w / 2, cy = h / 2; return <g data-symbol-feature="pump"><circle cx={cx} cy={cy} r={r} {...common} /><path d={`M ${cx - r * 0.25} ${cy - r * 0.45} L ${cx + r * 0.52} ${cy} L ${cx - r * 0.25} ${cy + r * 0.45} Z`} fill={stroke} /><Mark node={node} text={node.type === "milkPump" ? "M" : node.type === "airPump" ? "A" : "P"} y={cy + r + 14} /></g>; }
    case "valve": return <TwoPortValve node={node} k={k} />;
    case "ballValve": return <TwoPortValve node={node} kind="ball" k={k} />;
    case "checkValve": return <TwoPortValve node={node} kind="check" k={k} />;
    case "solenoid2": case "pulseAirValve": return <TwoPortValve node={node} kind="solenoid" k={k} />;
    case "diaphragmValve2": return <TwoPortValve node={node} kind="diaphragm" k={k} />;
    case "pressureRegulator": return <TwoPortValve node={node} kind="regulator" k={k} />;
    case "solenoid3": { const cy = h * 0.61, path = node.valvePath === "B" ? "B" : node.valvePath === "off" ? "off" : "A"; return <g data-symbol-feature="three-way-solenoid"><path d={`M 3 ${cy - 13} L ${w / 2} ${cy} L 3 ${cy + 13} Z`} {...common} /><path d={`M ${w - 3} ${cy - 13} L ${w / 2} ${cy} L ${w - 3} ${cy + 13} Z`} {...common} /><path d={`M ${w / 2 - 13} ${h - 3} L ${w / 2} ${cy} L ${w / 2 + 13} ${h - 3} Z`} {...common} /><rect x={w / 2 - 14} y={3} width={28} height={h * 0.2} fill="none" stroke={stroke} strokeWidth={2 * k} />{path !== "off" && <path data-symbol-feature="active-solenoid-route" d={path === "A" ? `M 3 ${cy} H ${w - 3}` : `M 3 ${cy} H ${w / 2} V ${h - 3}`} fill="none" stroke={stroke} strokeWidth={3.2 * k} strokeLinecap="round" />}</g>; }
    case "diaphragmValve3": return <ThreeWayDiaphragm node={node} surface={surface} k={k} />;
    case "safetyValve": { const cx = w / 2; return <g data-symbol-feature="safety-spring"><path d={`M ${cx - 14} ${h - 3} L ${cx} ${h * 0.62} L ${cx + 14} ${h - 3} Z`} {...common} /><path d={`M ${cx} ${h * 0.62} L ${w - 4} ${h * 0.44}`} fill="none" stroke={stroke} strokeWidth={2 * k} /><path d={`M ${cx} ${h * 0.55} l 8 -7 l -16 -7 l 16 -7 l -8 -7`} fill="none" stroke={stroke} strokeWidth={1.6 * k} /><line x1={cx - 11} y1={7} x2={cx + 11} y2={7} stroke={stroke} strokeWidth={2.5 * k} /></g>; }
    case "opv": { const cx = w / 2; return <g data-symbol-feature="opv-relief"><path d={`M ${cx - 14} ${h - 3} L ${cx} ${h * 0.62} L ${cx + 14} ${h - 3} Z`} {...common} /><rect x={cx - 12} y={8} width={24} height={15} fill={fill} stroke={stroke} strokeWidth={2 * k} /><path d={`M ${cx} ${h * 0.62} L ${w - 4} ${h * 0.44} M ${w - 9} ${h * 0.37} L ${w - 3} ${h * 0.44} L ${w - 12} ${h * 0.47} M ${cx} ${h * 0.55} V ${h * 0.33}`} fill="none" stroke={stroke} strokeWidth={2 * k} /></g>; }
    case "pressureGauge": return <g data-symbol-feature="pressure-indicator"><line x1={w / 2} y1={h * 0.7} x2={w / 2} y2={h - 2} stroke={stroke} strokeWidth={2 * k} /><circle cx={w / 2} cy={h * 0.4} r={Math.min(w, h) * 0.33} {...common} /><Mark node={node} text="PI" y={h * 0.45} /></g>;
    case "pressureSwitch": return <g data-symbol-feature="pressure-switch"><line x1={w / 2} y1={h * 0.7} x2={w / 2} y2={h - 2} stroke={stroke} strokeWidth={2 * k} /><circle cx={w / 2} cy={h * 0.4} r={Math.min(w, h) * 0.31} {...common} /><Mark node={node} text="PS" y={h * 0.44} /><path d={`M ${w * 0.68} ${h * 0.61} h 7 M ${w * 0.77} ${h * 0.61} h 7`} stroke={stroke} strokeWidth={1.6 * k} /></g>;
    case "pressureSensor": return <g data-symbol-feature="pressure-transmitter"><rect x={5} y={4} width={w - 10} height={h * 0.57} rx={4} {...common} /><Mark node={node} text="PT" y={h * 0.36} /><line x1={w / 2} y1={h * 0.61} x2={w / 2} y2={h - 2} stroke={stroke} strokeWidth={2 * k} /></g>;
    case "flowMeter": return <g data-symbol-feature="flow-transmitter"><circle cx={w / 2} cy={h / 2} r={Math.min(w, h) * 0.43} {...common} /><Mark node={node} text="FT" /></g>;
    case "hotWaterWand": return <g data-symbol-feature="hot-water-wand"><rect x={w / 2 - 11} y={2} width={22} height={10} {...common} /><path d={`M ${w / 2} 12 V ${h - 13} h 9`} fill="none" stroke={stroke} strokeWidth={4 * k} strokeLinecap="round" /><path d={`M ${w / 2 + 9} ${h - 9} C ${w / 2 + 15} ${h - 2}, ${w / 2 + 13} ${h + 4}, ${w / 2 + 9} ${h + 6} C ${w / 2 + 5} ${h + 4}, ${w / 2 + 3} ${h - 2}, ${w / 2 + 9} ${h - 9} Z`} fill="none" stroke={stroke} strokeWidth={1.4 * k} /></g>;
    case "steamWand": return <g data-symbol-feature="steam-wand"><rect x={w / 2 - 10} y={2} width={20} height={10} {...common} /><path d={`M ${w / 2} 12 V ${h - 14} h 8`} fill="none" stroke={stroke} strokeWidth={3.5 * k} strokeLinecap="round" />{[0, 1, 2].map((i) => <path key={i} d={`M ${w / 2 + 8 + i * 3} ${h - 10} q 4 4 0 8`} fill="none" stroke={stroke} strokeWidth={1.2 * k} />)}</g>;
    case "coffeeOutlet": return <Outlet node={node} kind="coffee" k={k} />;
    case "milkOutlet": return <Outlet node={node} kind="milk" k={k} />;
    case "hotWaterOutlet": return <Outlet node={node} kind="hotWater" k={k} />;
    case "groupHead": return <Outlet node={node} kind="group" k={k} />;
    case "boiler": case "hotWaterBoiler": case "steamBoiler": return <g data-symbol-feature="vessel"><rect x={3} y={3} width={w - 6} height={h - 6} rx={w * 0.14} {...common} /><Mark node={node} text={node.type === "steamBoiler" ? "SB" : "HB"} /><path d={`M ${w * 0.2} ${h * 0.74} q ${w * 0.1} -8 ${w * 0.2} 0 t ${w * 0.2} 0 t ${w * 0.2} 0`} fill="none" stroke={stroke} strokeWidth={1.3 * k} /></g>;
    case "heatExchanger": return <g data-symbol-feature="heat-exchanger"><rect x={3} y={3} width={w - 6} height={h - 6} {...common} /><path d={`M ${w * 0.18} ${h * 0.3} h ${w * 0.18} l ${w * 0.08} ${h * 0.18} l ${w * 0.08} -${h * 0.18} h ${w * 0.18} M ${w * 0.18} ${h * 0.7} h ${w * 0.18} l ${w * 0.08} -${h * 0.18} l ${w * 0.08} ${h * 0.18} h ${w * 0.18}`} fill="none" stroke={stroke} strokeWidth={2 * k} /></g>;
    case "thermoblock": return <g data-symbol-feature="thermoblock"><rect x={3} y={3} width={w - 6} height={h - 6} {...common} /><path d={`M ${w * 0.16} ${h * 0.6} q ${w * 0.08} -${h * 0.25} ${w * 0.16} 0 t ${w * 0.16} 0 t ${w * 0.16} 0 t ${w * 0.16} 0`} fill="none" stroke={stroke} strokeWidth={2 * k} /><Mark node={node} text="TB" y={h * 0.32} /></g>;
    case "filter": case "metalFilter": return <g data-symbol-feature="filter"><rect x={3} y={3} width={w - 6} height={h - 6} {...common} /><path d={`M ${w * 0.2} ${h * 0.22} L ${w * 0.8} ${h * 0.78} M ${w * 0.2} ${h * 0.42} L ${w * 0.62} ${h * 0.8} M ${w * 0.38} ${h * 0.2} L ${w * 0.8} ${h * 0.58}`} stroke={stroke} strokeWidth={1.5 * k} /></g>;
    case "shape": return <g data-symbol-feature="custom-shape">{node.variant === "ellipse" ? <ellipse cx={w / 2} cy={h / 2} rx={w / 2 - 2} ry={h / 2 - 2} {...common} /> : node.variant === "diamond" ? <path d={`M ${w / 2} 2 L ${w - 2} ${h / 2} L ${w / 2} ${h - 2} L 2 ${h / 2} Z`} {...common} /> : node.variant === "triangle" ? <path d={`M ${w / 2} 2 L ${w - 2} ${h - 2} H 2 Z`} {...common} /> : <rect x={2} y={2} width={w - 4} height={h - 4} rx={4} {...common} />}<Mark node={node} text={node.label} /></g>;
    case "label": return <text x={w / 2} y={h / 2 + (node.fontSize ?? 16) * 0.32} textAnchor="middle" fontSize={node.fontSize ?? 16} fill={stroke} fontFamily={FONT}>{node.label}</text>;
    case "arrow": return <path d={`M 2 ${h * 0.36} H ${w * 0.62} V ${h * 0.12} L ${w - 2} ${h / 2} L ${w * 0.62} ${h * 0.88} V ${h * 0.64} H 2 Z`} fill={fill} stroke={stroke} strokeWidth={1.5 * k} />;
    case "image": return <g>{node.imageData ? <image href={node.imageData} x={2} y={2} width={w - 4} height={h - 4} preserveAspectRatio="xMidYMid slice" /> : box("IMG")}</g>;
    // 兜底只留给确实没有形状语义的类型；容器/管路件/进出口已经全部线条化。
    default: {
      const rawType = node.type as string;
      return box(rawType === "powderMixer" ? "MX" : rawType === "ntcProbe" ? "T" : rawType === "sensor" ? "S" : rawType === "annotation" ? node.label : rawType.toUpperCase().slice(0, 2));
    }
  }
}
