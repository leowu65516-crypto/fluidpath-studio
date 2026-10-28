import type { DiagramNode } from "./types";
import { diaphragmPortLabel, diaphragmValveRoute } from "./diaphragmValve";
import { portLocalPos } from "./geometry";

export type SymbolSurface = "canvas" | "library" | "preview" | "inspector";

const FONT = "system-ui, sans-serif";

function Mark({ node, text, y }: { node: DiagramNode; text: string; y?: number }) {
  return <text x={node.width / 2} y={y ?? node.height / 2 + 4} textAnchor="middle" fontSize={Math.min(12, Math.max(8, node.width / 7))} fill={node.stroke} fontFamily={FONT} fontWeight={700}>{text}</text>;
}

function TwoPortValve({ node, kind = "manual" }: { node: DiagramNode; kind?: "manual" | "solenoid" | "diaphragm" | "check" | "ball" | "regulator" }) {
  const { width: w, height: h, fill, stroke } = node;
  const cy = h * 0.68;
  const common = { fill, stroke, strokeWidth: 2 } as const;
  const left = <path d={`M 3 ${cy - 14} L ${w / 2} ${cy} L 3 ${cy + 14} Z`} {...common} />;
  const right = <path d={`M ${w - 3} ${cy - 14} L ${w / 2} ${cy} L ${w - 3} ${cy + 14} Z`} {...common} />;
  if (kind === "check") return <g data-symbol-feature="check-direction">{left}<line x1={w / 2} y1={cy - 16} x2={w / 2} y2={cy + 16} stroke={stroke} strokeWidth={2.5} /><path d={`M ${w - 19} ${cy} H ${w - 4} M ${w - 11} ${cy - 6} L ${w - 4} ${cy} L ${w - 11} ${cy + 6}`} fill="none" stroke={stroke} strokeWidth={1.8} /></g>;
  if (kind === "ball") {
    const open = node.valveState !== "closed";
    return <g data-symbol-feature="ball-valve"><circle cx={w / 2} cy={cy} r={Math.min(w, h) * 0.23} {...common} /><line x1={w * 0.12} y1={cy} x2={w * 0.27} y2={cy} stroke={stroke} strokeWidth={2} /><line x1={w * 0.73} y1={cy} x2={w * 0.88} y2={cy} stroke={stroke} strokeWidth={2} /><line x1={w / 2} y1={cy} x2={open ? w * 0.78 : w / 2} y2={open ? h * 0.17 : h * 0.14} stroke={stroke} strokeWidth={2.5} strokeLinecap="round" /></g>;
  }
  if (kind === "regulator") return <g data-symbol-feature="pressure-regulator">{left}{right}<line x1={w / 2} y1={cy} x2={w / 2} y2={h * 0.26} stroke={stroke} strokeWidth={2} /><path d={`M ${w / 2 - 8} ${h * 0.27} l 5 -5 l -10 -5 l 10 -5 l -5 -5`} fill="none" stroke={stroke} strokeWidth={1.5} /><path d={`M ${w * 0.7} ${h * 0.22} L ${w * 0.9} ${h * 0.06} M ${w * 0.81} ${h * 0.06} H ${w * 0.9} V ${h * 0.15}`} fill="none" stroke={stroke} strokeWidth={1.5} /></g>;
  if (kind === "solenoid" || kind === "diaphragm") return <g data-symbol-feature={kind === "solenoid" ? "solenoid-coil" : "diaphragm-actuator"}>{left}{right}{kind === "diaphragm" && <path d={`M ${w / 2 - 18} ${cy - 5} Q ${w / 2} ${cy - 14} ${w / 2 + 18} ${cy - 5}`} fill="none" stroke={stroke} strokeWidth={1.8} />}<line x1={w / 2} y1={cy} x2={w / 2} y2={h * 0.29} stroke={stroke} strokeWidth={2} />{kind === "solenoid" ? <rect x={w / 2 - 14} y={3} width={28} height={h * 0.22} fill="none" stroke={stroke} strokeWidth={2} /> : <path d={`M ${w / 2 - 16} ${h * 0.24} Q ${w / 2} ${h * 0.05} ${w / 2 + 16} ${h * 0.24} Z`} fill="none" stroke={stroke} strokeWidth={2} />}</g>;
  return <g data-symbol-feature="shutoff-valve">{left}{right}<line x1={w / 2} y1={cy} x2={w / 2} y2={8} stroke={stroke} strokeWidth={2} /><line x1={w / 2 - 12} y1={8} x2={w / 2 + 12} y2={8} stroke={stroke} strokeWidth={2.5} strokeLinecap="round" /></g>;
}

function Outlet({ node, kind }: { node: DiagramNode; kind: "coffee" | "milk" | "hotWater" | "group" }) {
  const { width: w, height: h, fill, stroke } = node;
  const cx = w / 2, bodyY = kind === "group" ? h * 0.42 : h * 0.5, double = node.variant === "double";
  return <g data-symbol-feature={`${kind}-outlet`}>
    <rect x={cx - 10} y={2} width={20} height={8} fill={fill} stroke={stroke} strokeWidth={1.8} />
    <path d={`M ${w * 0.15} 10 H ${w * 0.85} V ${bodyY - 8} Q ${w * 0.85} ${bodyY} ${w * 0.7} ${bodyY} H ${w * 0.3} Q ${w * 0.15} ${bodyY} ${w * 0.15} ${bodyY - 8} Z`} fill={fill} stroke={stroke} strokeWidth={2} />
    {kind === "group" && [0.34, 0.5, 0.66].map((x) => <line key={x} x1={w * x} y1={bodyY - 13} x2={w * x} y2={bodyY - 5} stroke={stroke} strokeWidth={1.4} />)}
    {kind === "milk" && <path d={`M ${cx} ${bodyY - 14} C ${cx + 7} ${bodyY - 5}, ${cx + 8} ${bodyY + 7}, ${cx} ${bodyY + 10} C ${cx - 8} ${bodyY + 7}, ${cx - 7} ${bodyY - 5}, ${cx} ${bodyY - 14} Z`} fill="none" stroke={stroke} strokeWidth={1.6} />}
    {kind === "hotWater" && [0, 1, 2].map((i) => <path key={i} d={`M ${w * 0.26} ${bodyY - 16 + i * 6} q ${w * 0.12} -5 ${w * 0.24} 0 q ${w * 0.12} 5 ${w * 0.24} 0`} fill="none" stroke={stroke} strokeWidth={1.3} />)}
    {kind === "coffee" && <path d={`M ${w * 0.32} ${bodyY - 14} h ${w * 0.36} M ${w * 0.32} ${bodyY - 9} h ${w * 0.36}`} fill="none" stroke={stroke} strokeWidth={1.2} />}
    {double ? <g><path d={`M ${cx - 6} ${bodyY} L ${w * 0.3} ${h - 5}`} fill="none" stroke={stroke} strokeWidth={3} strokeLinecap="round" /><path d={`M ${cx + 6} ${bodyY} L ${w * 0.7} ${h - 5}`} fill="none" stroke={stroke} strokeWidth={3} strokeLinecap="round" /></g> : <path d={`M ${cx} ${bodyY} V ${h - 5}`} fill="none" stroke={stroke} strokeWidth={3} strokeLinecap="round" />}
  </g>;
}

function ThreeWayDiaphragm({ node, surface }: { node: DiagramNode; surface: SymbolSurface }) {
  const { width: w, height: h, fill, stroke } = node;
  const cy = h * 0.59, center = { x: w / 2, y: cy };
  const route = diaphragmValveRoute(node, node.valvePath === "B" ? "B" : "A");
  const portPoints = node.ports.slice(0, 3).map((port) => ({ port, point: portLocalPos(node, port) }));
  const active = route.activeBranch ? portLocalPos(node, route.activeBranch) : undefined;
  const common = route.commonPort ? portLocalPos(node, route.commonPort) : undefined;
  return <g data-symbol-feature="three-way-diaphragm">
    {portPoints.map(({ port, point }) => <line key={port.id} x1={center.x} y1={center.y} x2={point.x} y2={point.y} stroke={stroke} strokeWidth={2} />)}
    <circle cx={center.x} cy={center.y} r={14} fill={fill} stroke={stroke} strokeWidth={2} />
    <path d={`M ${w / 2 - 18} ${cy - 5} Q ${w / 2} ${cy - 14} ${w / 2 + 18} ${cy - 5}`} fill="none" stroke={stroke} strokeWidth={1.8} />
    <path d={`M ${w / 2} ${cy - 4} V ${h * 0.2}`} stroke={stroke} strokeWidth={2} />
    <path d={`M ${w / 2 - 16} ${h * 0.2} Q ${w / 2} ${h * 0.03} ${w / 2 + 16} ${h * 0.2} Z`} fill="none" stroke={stroke} strokeWidth={2} />
    {common && active && <path data-symbol-feature="active-selector-route" d={`M ${common.x} ${common.y} L ${center.x} ${center.y} L ${active.x} ${active.y}`} fill="none" stroke={stroke} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />}
    {surface !== "library" && portPoints.map(({ port, point }) => <text key={port.id} x={point.x + (point.x < center.x ? 7 : point.x > center.x ? -7 : 0)} y={point.y + (point.y < center.y ? 11 : -7)} textAnchor={point.x < center.x ? "start" : point.x > center.x ? "end" : "middle"} fontSize={8} fill={stroke} fontFamily={FONT} fontWeight={700}>{diaphragmPortLabel(node, port)}</text>)}
  </g>;
}

/** ISO/ISA-inspired visual language only; never a change to the engineering model. */
export function EngineeringNodeSymbol({ node, surface = "canvas" }: { node: DiagramNode; surface?: SymbolSurface }) {
  const { width: w, height: h, fill, stroke } = node;
  const common = { fill, stroke, strokeWidth: 2 } as const;
  const box = (code: string) => <g data-symbol-feature={`engineering-${node.type}`}><rect x={2} y={2} width={w - 4} height={h - 4} rx={4} {...common} /><Mark node={node} text={code} /></g>;
  switch (node.type) {
    case "pump": case "milkPump": case "airPump": { const r = Math.min(w, h) / 2 - 4, cx = w / 2, cy = h / 2; return <g data-symbol-feature="pump"><circle cx={cx} cy={cy} r={r} {...common} /><path d={`M ${cx - r * 0.25} ${cy - r * 0.45} L ${cx + r * 0.52} ${cy} L ${cx - r * 0.25} ${cy + r * 0.45} Z`} fill={stroke} /><Mark node={node} text={node.type === "milkPump" ? "M" : node.type === "airPump" ? "A" : "P"} y={cy + r + 14} /></g>; }
    case "valve": return <TwoPortValve node={node} />;
    case "ballValve": return <TwoPortValve node={node} kind="ball" />;
    case "checkValve": return <TwoPortValve node={node} kind="check" />;
    case "solenoid2": case "pulseAirValve": return <TwoPortValve node={node} kind="solenoid" />;
    case "diaphragmValve2": return <TwoPortValve node={node} kind="diaphragm" />;
    case "pressureRegulator": return <TwoPortValve node={node} kind="regulator" />;
    case "solenoid3": { const cy = h * 0.61, path = node.valvePath === "B" ? "B" : node.valvePath === "off" ? "off" : "A"; return <g data-symbol-feature="three-way-solenoid"><path d={`M 3 ${cy - 13} L ${w / 2} ${cy} L 3 ${cy + 13} Z`} {...common} /><path d={`M ${w - 3} ${cy - 13} L ${w / 2} ${cy} L ${w - 3} ${cy + 13} Z`} {...common} /><path d={`M ${w / 2 - 13} ${h - 3} L ${w / 2} ${cy} L ${w / 2 + 13} ${h - 3} Z`} {...common} /><rect x={w / 2 - 14} y={3} width={28} height={h * 0.2} fill="none" stroke={stroke} strokeWidth={2} />{path !== "off" && <path data-symbol-feature="active-solenoid-route" d={path === "A" ? `M 3 ${cy} H ${w - 3}` : `M 3 ${cy} H ${w / 2} V ${h - 3}`} fill="none" stroke={stroke} strokeWidth={3.2} strokeLinecap="round" />}</g>; }
    case "diaphragmValve3": return <ThreeWayDiaphragm node={node} surface={surface} />;
    case "safetyValve": { const cx = w / 2; return <g data-symbol-feature="safety-spring"><path d={`M ${cx - 14} ${h - 3} L ${cx} ${h * 0.62} L ${cx + 14} ${h - 3} Z`} {...common} /><path d={`M ${cx} ${h * 0.62} L ${w - 4} ${h * 0.44}`} fill="none" stroke={stroke} strokeWidth={2} /><path d={`M ${cx} ${h * 0.55} l 8 -7 l -16 -7 l 16 -7 l -8 -7`} fill="none" stroke={stroke} strokeWidth={1.6} /><line x1={cx - 11} y1={7} x2={cx + 11} y2={7} stroke={stroke} strokeWidth={2.5} /></g>; }
    case "opv": { const cx = w / 2; return <g data-symbol-feature="opv-relief"><path d={`M ${cx - 14} ${h - 3} L ${cx} ${h * 0.62} L ${cx + 14} ${h - 3} Z`} {...common} /><rect x={cx - 12} y={8} width={24} height={15} fill={fill} stroke={stroke} strokeWidth={2} /><path d={`M ${cx} ${h * 0.62} L ${w - 4} ${h * 0.44} M ${w - 9} ${h * 0.37} L ${w - 3} ${h * 0.44} L ${w - 12} ${h * 0.47} M ${cx} ${h * 0.55} V ${h * 0.33}`} fill="none" stroke={stroke} strokeWidth={2} /></g>; }
    case "pressureGauge": return <g data-symbol-feature="pressure-indicator"><line x1={w / 2} y1={h * 0.7} x2={w / 2} y2={h - 2} stroke={stroke} strokeWidth={2} /><circle cx={w / 2} cy={h * 0.4} r={Math.min(w, h) * 0.33} {...common} /><Mark node={node} text="PI" y={h * 0.45} /></g>;
    case "pressureSwitch": return <g data-symbol-feature="pressure-switch"><line x1={w / 2} y1={h * 0.7} x2={w / 2} y2={h - 2} stroke={stroke} strokeWidth={2} /><circle cx={w / 2} cy={h * 0.4} r={Math.min(w, h) * 0.31} {...common} /><Mark node={node} text="PS" y={h * 0.44} /><path d={`M ${w * 0.68} ${h * 0.61} h 7 M ${w * 0.77} ${h * 0.61} h 7`} stroke={stroke} strokeWidth={1.6} /></g>;
    case "pressureSensor": return <g data-symbol-feature="pressure-transmitter"><rect x={5} y={4} width={w - 10} height={h * 0.57} rx={4} {...common} /><Mark node={node} text="PT" y={h * 0.36} /><line x1={w / 2} y1={h * 0.61} x2={w / 2} y2={h - 2} stroke={stroke} strokeWidth={2} /></g>;
    case "flowMeter": return <g data-symbol-feature="flow-transmitter"><circle cx={w / 2} cy={h / 2} r={Math.min(w, h) * 0.43} {...common} /><Mark node={node} text="FT" /></g>;
    case "hotWaterWand": return <g data-symbol-feature="hot-water-wand"><rect x={w / 2 - 11} y={2} width={22} height={10} {...common} /><path d={`M ${w / 2} 12 V ${h - 13} h 9`} fill="none" stroke={stroke} strokeWidth={4} strokeLinecap="round" /><path d={`M ${w / 2 + 9} ${h - 9} C ${w / 2 + 15} ${h - 2}, ${w / 2 + 13} ${h + 4}, ${w / 2 + 9} ${h + 6} C ${w / 2 + 5} ${h + 4}, ${w / 2 + 3} ${h - 2}, ${w / 2 + 9} ${h - 9} Z`} fill="none" stroke={stroke} strokeWidth={1.4} /></g>;
    case "steamWand": return <g data-symbol-feature="steam-wand"><rect x={w / 2 - 10} y={2} width={20} height={10} {...common} /><path d={`M ${w / 2} 12 V ${h - 14} h 8`} fill="none" stroke={stroke} strokeWidth={3.5} strokeLinecap="round" />{[0, 1, 2].map((i) => <path key={i} d={`M ${w / 2 + 8 + i * 3} ${h - 10} q 4 4 0 8`} fill="none" stroke={stroke} strokeWidth={1.2} />)}</g>;
    case "coffeeOutlet": return <Outlet node={node} kind="coffee" />;
    case "milkOutlet": return <Outlet node={node} kind="milk" />;
    case "hotWaterOutlet": return <Outlet node={node} kind="hotWater" />;
    case "groupHead": return <Outlet node={node} kind="group" />;
    case "boiler": case "hotWaterBoiler": case "steamBoiler": return <g data-symbol-feature="vessel"><rect x={3} y={3} width={w - 6} height={h - 6} rx={w * 0.14} {...common} /><Mark node={node} text={node.type === "steamBoiler" ? "SB" : "HB"} /><path d={`M ${w * 0.2} ${h * 0.74} q ${w * 0.1} -8 ${w * 0.2} 0 t ${w * 0.2} 0 t ${w * 0.2} 0`} fill="none" stroke={stroke} strokeWidth={1.3} /></g>;
    case "heatExchanger": return <g data-symbol-feature="heat-exchanger"><rect x={3} y={3} width={w - 6} height={h - 6} {...common} /><path d={`M ${w * 0.18} ${h * 0.3} h ${w * 0.18} l ${w * 0.08} ${h * 0.18} l ${w * 0.08} -${h * 0.18} h ${w * 0.18} M ${w * 0.18} ${h * 0.7} h ${w * 0.18} l ${w * 0.08} -${h * 0.18} l ${w * 0.08} ${h * 0.18} h ${w * 0.18}`} fill="none" stroke={stroke} strokeWidth={2} /></g>;
    case "thermoblock": return <g data-symbol-feature="thermoblock"><rect x={3} y={3} width={w - 6} height={h - 6} {...common} /><path d={`M ${w * 0.16} ${h * 0.6} q ${w * 0.08} -${h * 0.25} ${w * 0.16} 0 t ${w * 0.16} 0 t ${w * 0.16} 0 t ${w * 0.16} 0`} fill="none" stroke={stroke} strokeWidth={2} /><Mark node={node} text="TB" y={h * 0.32} /></g>;
    case "filter": case "metalFilter": return <g data-symbol-feature="filter"><rect x={3} y={3} width={w - 6} height={h - 6} {...common} /><path d={`M ${w * 0.2} ${h * 0.22} L ${w * 0.8} ${h * 0.78} M ${w * 0.2} ${h * 0.42} L ${w * 0.62} ${h * 0.8} M ${w * 0.38} ${h * 0.2} L ${w * 0.8} ${h * 0.58}`} stroke={stroke} strokeWidth={1.5} /></g>;
    case "shape": return <g data-symbol-feature="custom-shape">{node.variant === "ellipse" ? <ellipse cx={w / 2} cy={h / 2} rx={w / 2 - 2} ry={h / 2 - 2} {...common} /> : node.variant === "diamond" ? <path d={`M ${w / 2} 2 L ${w - 2} ${h / 2} L ${w / 2} ${h - 2} L 2 ${h / 2} Z`} {...common} /> : node.variant === "triangle" ? <path d={`M ${w / 2} 2 L ${w - 2} ${h - 2} H 2 Z`} {...common} /> : <rect x={2} y={2} width={w - 4} height={h - 4} rx={4} {...common} />}<Mark node={node} text={node.label} /></g>;
    case "label": return <text x={w / 2} y={h / 2 + (node.fontSize ?? 16) * 0.32} textAnchor="middle" fontSize={node.fontSize ?? 16} fill={stroke} fontFamily={FONT}>{node.label}</text>;
    case "arrow": return <path d={`M 2 ${h * 0.36} H ${w * 0.62} V ${h * 0.12} L ${w - 2} ${h / 2} L ${w * 0.62} ${h * 0.88} V ${h * 0.64} H 2 Z`} fill={fill} stroke={stroke} strokeWidth={1.5} />;
    case "image": return <g>{node.imageData ? <image href={node.imageData} x={2} y={2} width={w - 4} height={h - 4} preserveAspectRatio="xMidYMid slice" /> : box("IMG")}</g>;
    default: return box(node.type === "inlet" ? "IN" : node.type === "outlet" ? "OUT" : node.type === "pressureTank" ? "ACC" : node.type === "syrupBottle" ? "SYR" : node.type === "brewChamber" ? "BR" : node.type === "powderMixer" ? "MX" : node.type === "ntcProbe" ? "T" : node.type === "sensor" ? "S" : node.type === "annotation" ? node.label : node.type === "connector" ? "" : node.type.toUpperCase().slice(0, 2));
  }
}
