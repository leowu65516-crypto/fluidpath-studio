import type { DiagramNode, NodeType, Port, PortDirection, PortPosition, ShapeVariant } from "./types";
import { uid } from "./types";

interface PortTemplate {
  position: PortPosition;
  offset?: number;
  direction?: PortDirection;
}

export interface NodeDef {
  type: NodeType;
  variant?: ShapeVariant;
  label: string;
  group: string;
  width: number;
  height: number;
  fill: string;
  stroke: string;
  ports: PortTemplate[];
}

export const NODE_DEFS: NodeDef[] = [
  // ===== 容器 =====
  { type: "tank", label: "储液罐", group: "容器", width: 110, height: 140, fill: "#ffffff", stroke: "#3d4c5e", ports: [{ position: "left", direction: "in" }, { position: "right", direction: "out" }, { position: "top", direction: "in" }, { position: "bottom", direction: "out" }] },
  { type: "pressureTank", label: "外置进水压力罐", group: "容器", width: 84, height: 110, fill: "#f0f4f9", stroke: "#3d4c5e", ports: [{ position: "bottom", direction: "in" }] },
  { type: "syrupBottle", label: "糖浆瓶", group: "容器", width: 70, height: 100, fill: "#fff7f0", stroke: "#3d4c5e", ports: [{ position: "bottom", direction: "out" }] },
  // 锅炉：管路连接只使用上/下两端（热水锅炉进水在下、出水在上；蒸汽锅炉进水在上、出水在下）
  { type: "hotWaterBoiler", label: "热水锅炉", group: "容器", width: 120, height: 150, fill: "#fff7f2", stroke: "#3d4c5e", ports: [{ position: "bottom", offset: 0.3, direction: "in" }, { position: "top", offset: 0.5, direction: "out" }] },
  { type: "steamBoiler", label: "蒸汽锅炉", group: "容器", width: 130, height: 150, fill: "#fdf3f3", stroke: "#3d4c5e", ports: [{ position: "top", offset: 0.5, direction: "in" }, { position: "bottom", offset: 0.3, direction: "out" }] },
  // 旧版兼容（不在元件库分组中显示）
  { type: "boiler", label: "锅炉（旧）", group: "", width: 120, height: 150, fill: "#fff7f2", stroke: "#3d4c5e", ports: [{ position: "bottom", offset: 0.3, direction: "in" }, { position: "top", offset: 0.5, direction: "out" }] },
  // ===== 动力 =====
  { type: "pump", label: "水泵", group: "动力", width: 90, height: 90, fill: "#eef4fb", stroke: "#3d4c5e", ports: [{ position: "left", direction: "in" }, { position: "right", direction: "out" }] },
  { type: "milkPump", label: "奶泵", group: "动力", width: 90, height: 90, fill: "#fdf8ee", stroke: "#3d4c5e", ports: [{ position: "left", direction: "in" }, { position: "right", direction: "out" }] },
  // ===== 控制 =====
  { type: "valve", label: "截止阀", group: "控制", width: 70, height: 54, fill: "#ffffff", stroke: "#3d4c5e", ports: [{ position: "left", offset: 0.72, direction: "in" }, { position: "right", offset: 0.72, direction: "out" }] },
  { type: "checkValve", label: "单向阀", group: "控制", width: 70, height: 48, fill: "#ffffff", stroke: "#3d4c5e", ports: [{ position: "left", direction: "in" }, { position: "right", direction: "out" }] },
  { type: "solenoid2", label: "两通电磁阀", group: "控制", width: 74, height: 66, fill: "#ffffff", stroke: "#3d4c5e", ports: [{ position: "left", offset: 0.76, direction: "in" }, { position: "right", offset: 0.76, direction: "out" }] },
  { type: "solenoid3", label: "三通电磁阀", group: "控制", width: 78, height: 74, fill: "#ffffff", stroke: "#3d4c5e", ports: [{ position: "left", offset: 0.62, direction: "in" }, { position: "right", offset: 0.62, direction: "out" }, { position: "bottom", offset: 0.5, direction: "out" }] },
  { type: "pulseAirValve", label: "脉冲空气电磁阀", group: "控制", width: 74, height: 66, fill: "#f6fbff", stroke: "#3d4c5e", ports: [{ position: "left", offset: 0.76, direction: "in" }, { position: "right", offset: 0.76, direction: "out" }] },
  { type: "safetyValve", label: "安全阀", group: "控制", width: 64, height: 84, fill: "#ffffff", stroke: "#3d4c5e", ports: [{ position: "bottom", direction: "in" }, { position: "right", offset: 0.4, direction: "out" }] },
  { type: "opv", label: "OPV 泄压阀", group: "控制", width: 64, height: 84, fill: "#fff4ec", stroke: "#3d4c5e", ports: [{ position: "bottom", direction: "in" }, { position: "right", offset: 0.35, direction: "out" }] },
  { type: "pressureRegulator", label: "节流阀/减压阀", group: "控制", width: 74, height: 54, fill: "#ffffff", stroke: "#3d4c5e", ports: [{ position: "left", offset: 0.72, direction: "in" }, { position: "right", offset: 0.72, direction: "out" }] },
  { type: "tee", label: "三通接头", group: "控制", width: 64, height: 64, fill: "#ffffff", stroke: "#3d4c5e", ports: [{ position: "left", direction: "bidirectional" }, { position: "right", direction: "bidirectional" }, { position: "bottom", direction: "bidirectional" }] },
  { type: "teeY", label: "Y型三通", group: "控制", width: 64, height: 64, fill: "#ffffff", stroke: "#3d4c5e", ports: [{ position: "left", direction: "bidirectional" }, { position: "right", offset: 0.25, direction: "bidirectional" }, { position: "bottom", offset: 0.75, direction: "bidirectional" }] },
  { type: "teeF", label: "F型三通", group: "控制", width: 64, height: 80, fill: "#ffffff", stroke: "#3d4c5e", ports: [{ position: "top", direction: "bidirectional" }, { position: "bottom", direction: "bidirectional" }, { position: "right", offset: 0.25, direction: "bidirectional" }, { position: "right", offset: 0.75, direction: "bidirectional" }] },
  { type: "cross", label: "十字四通", group: "控制", width: 64, height: 64, fill: "#ffffff", stroke: "#3d4c5e", ports: [{ position: "left", direction: "bidirectional" }, { position: "right", direction: "bidirectional" }, { position: "top", direction: "bidirectional" }, { position: "bottom", direction: "bidirectional" }] },
  { type: "elbow", label: "直角接头", group: "控制", width: 56, height: 56, fill: "#ffffff", stroke: "#3d4c5e", ports: [{ position: "left", offset: 0.35, direction: "bidirectional" }, { position: "bottom", offset: 0.35, direction: "bidirectional" }] },
  { type: "coupling", label: "两通接头", group: "控制", width: 64, height: 32, fill: "#ffffff", stroke: "#3d4c5e", ports: [{ position: "left", direction: "bidirectional" }, { position: "right", direction: "bidirectional" }] },
  { type: "metalCoupling", label: "金属两通接头", group: "控制", width: 64, height: 36, fill: "#d9dde3", stroke: "#3d4c5e", ports: [{ position: "left", direction: "bidirectional" }, { position: "right", direction: "bidirectional" }] },
  // ===== 处理 =====
  { type: "heatExchanger", label: "换热器", group: "处理", width: 140, height: 110, fill: "#f2f9f5", stroke: "#3d4c5e", ports: [{ position: "left", direction: "in" }, { position: "right", direction: "out" }, { position: "top", direction: "in" }, { position: "bottom", direction: "out" }] },
  { type: "filter", label: "过滤器", group: "处理", width: 84, height: 96, fill: "#ffffff", stroke: "#3d4c5e", ports: [{ position: "left", offset: 0.3, direction: "in" }, { position: "right", offset: 0.3, direction: "out" }] },
  { type: "metalFilter", label: "矩形金属滤网", group: "处理", width: 96, height: 56, fill: "#f3f5f7", stroke: "#3d4c5e", ports: [{ position: "left", direction: "in" }, { position: "right", direction: "out" }] },
  { type: "brewChamber", label: "冲泡缸", group: "处理", width: 96, height: 140, fill: "#ffffff", stroke: "#3d4c5e", ports: [{ position: "top", direction: "in" }, { position: "bottom", direction: "out" }] },
  { type: "powderMixer", label: "粉料搅拌器", group: "处理", width: 100, height: 120, fill: "#fdf9f0", stroke: "#3d4c5e", ports: [{ position: "top", direction: "in" }, { position: "bottom", direction: "out" }] },
  // ===== 连接 =====
  { type: "inlet", label: "入口端", group: "连接", width: 72, height: 36, fill: "#eef4fb", stroke: "#3d4c5e", ports: [{ position: "right", direction: "out" }] },
  { type: "outlet", label: "出口端", group: "连接", width: 72, height: 36, fill: "#eef4fb", stroke: "#3d4c5e", ports: [{ position: "left", direction: "in" }] },
  { type: "connector", label: "普通接头", group: "连接", width: 36, height: 36, fill: "#ffffff", stroke: "#3d4c5e", ports: [{ position: "left" }, { position: "right" }, { position: "top" }, { position: "bottom" }] },
  // ===== 出口 =====
  { type: "hotWaterWand", label: "热水出口", group: "出口", width: 46, height: 100, fill: "#ffffff", stroke: "#3d4c5e", ports: [{ position: "top", direction: "in" }] },
  { type: "steamWand", label: "蒸汽杆", group: "出口", width: 44, height: 126, fill: "#ffffff", stroke: "#3d4c5e", ports: [{ position: "top", direction: "in" }] },
  { type: "groupHead", label: "冲煮头", group: "出口", width: 96, height: 120, fill: "#ffffff", stroke: "#3d4c5e", ports: [{ position: "top", direction: "in" }, { position: "bottom", direction: "out" }] },
  { type: "coffeeOutlet", variant: "single", label: "咖啡出口（单）", group: "出口", width: 84, height: 78, fill: "#ffffff", stroke: "#3d4c5e", ports: [{ position: "top", direction: "in" }] },
  { type: "coffeeOutlet", variant: "double", label: "咖啡出口（双）", group: "出口", width: 92, height: 78, fill: "#ffffff", stroke: "#3d4c5e", ports: [{ position: "top", direction: "in" }] },
  { type: "milkOutlet", variant: "single", label: "牛奶出口（单）", group: "出口", width: 84, height: 78, fill: "#f8f9fc", stroke: "#3d4c5e", ports: [{ position: "top", direction: "in" }] },
  { type: "milkOutlet", variant: "double", label: "牛奶出口（双）", group: "出口", width: 92, height: 78, fill: "#f8f9fc", stroke: "#3d4c5e", ports: [{ position: "top", direction: "in" }] },
  { type: "hotWaterOutlet", variant: "single", label: "美式热水出口", group: "出口", width: 84, height: 78, fill: "#eef4fb", stroke: "#3d4c5e", ports: [{ position: "top", direction: "in" }] },
  // ===== 传感器 / 仪表 =====
  { type: "flowMeter", label: "流量计", group: "传感器/仪表", width: 76, height: 76, fill: "#ffffff", stroke: "#3d4c5e", ports: [{ position: "left", direction: "in" }, { position: "right", direction: "out" }] },
  { type: "pressureGauge", label: "压力表", group: "传感器/仪表", width: 70, height: 86, fill: "#ffffff", stroke: "#3d4c5e", ports: [{ position: "bottom", direction: "in" }] },
  { type: "pressureSensor", label: "压力传感器", group: "传感器/仪表", width: 64, height: 82, fill: "#ffffff", stroke: "#3d4c5e", ports: [{ position: "bottom", direction: "in" }] },
  { type: "pressureSwitch", label: "进水压力开关", group: "传感器/仪表", width: 70, height: 86, fill: "#ffffff", stroke: "#3d4c5e", ports: [{ position: "bottom", direction: "in" }] },
  { type: "ntcProbe", label: "NTC 探针", group: "传感器/仪表", width: 40, height: 92, fill: "#ffffff", stroke: "#3d4c5e", ports: [{ position: "top", direction: "bidirectional" }] },
  { type: "sensor", label: "传感器", group: "传感器/仪表", width: 80, height: 60, fill: "#f8faff", stroke: "#3d4c5e", ports: [{ position: "left", direction: "in" }, { position: "right", direction: "out" }] },
  // ===== 其他（自定义图形） =====
  { type: "shape", variant: "rect", label: "自定义矩形", group: "其他", width: 140, height: 90, fill: "#ffffff", stroke: "#3d4c5e", ports: [{ position: "left" }, { position: "right" }, { position: "top" }, { position: "bottom" }] },
  { type: "shape", variant: "ellipse", label: "自定义圆形", group: "其他", width: 120, height: 120, fill: "#ffffff", stroke: "#3d4c5e", ports: [{ position: "left" }, { position: "right" }, { position: "top" }, { position: "bottom" }] },
  { type: "shape", variant: "diamond", label: "自定义菱形", group: "其他", width: 130, height: 100, fill: "#ffffff", stroke: "#3d4c5e", ports: [{ position: "left" }, { position: "right" }, { position: "top" }, { position: "bottom" }] },
  { type: "shape", variant: "triangle", label: "自定义三角形", group: "其他", width: 120, height: 110, fill: "#ffffff", stroke: "#3d4c5e", ports: [{ position: "left" }, { position: "right" }, { position: "bottom" }] },
  // ===== 注释 =====
  { type: "label", label: "文本标签", group: "注释", width: 120, height: 34, fill: "#00000000", stroke: "#3d4c5e", ports: [] },
  { type: "arrow", label: "流向箭头", group: "注释", width: 90, height: 32, fill: "#3d4c5e", stroke: "#3d4c5e", ports: [] },
  { type: "annotation", label: "标注", group: "注释", width: 160, height: 44, fill: "#ffffff", stroke: "#3d4c5e", ports: [] },
  { type: "image", label: "图片", group: "注释", width: 160, height: 120, fill: "#ffffff", stroke: "#3d4c5e", ports: [] }
];

export const NODE_GROUPS = ["容器", "动力", "控制", "处理", "连接", "出口", "传感器/仪表", "其他", "注释"];

export function defOf(type: NodeType, variant?: ShapeVariant): NodeDef {
  if (type === "shape" || type === "coffeeOutlet" || type === "milkOutlet" || type === "hotWaterOutlet") {
    const fallback = type === "shape" ? "rect" : "single";
    return (
      NODE_DEFS.find((d) => d.type === type && d.variant === (variant ?? fallback)) ??
      NODE_DEFS.find((d) => d.type === type)!
    );
  }
  return NODE_DEFS.find((d) => d.type === type) ?? NODE_DEFS[0];
}

export function createNode(type: NodeType, x: number, y: number, label?: string, variant?: ShapeVariant, id?: string): DiagramNode {
  const def = defOf(type, variant);
  const nodeId = id ?? uid("n");
  const ports: Port[] = def.ports.map((p) => ({
    id: uid("p"),
    nodeId,
    position: p.position,
    offset: p.offset,
    direction: p.direction
  }));
  return {
    id: nodeId,
    type,
    label: label ?? (type === "shape" ? "自定义" : def.label),
    x,
    y,
    width: def.width,
    height: def.height,
    rotation: 0,
    fill: def.fill,
    stroke: def.stroke,
    ports,
    ...(type === "shape" ? { variant: variant ?? "rect", fontSize: 15 } : {}),
    ...(type === "coffeeOutlet" ? { variant: variant ?? "single", dispensing: true } : {}),
    ...(type === "milkOutlet" ? { variant: variant ?? "single", dispensing: true } : {}),
    ...(type === "hotWaterOutlet" ? { variant: "single", dispensing: true } : {}),
    ...(type === "groupHead" ? { dispensing: true } : {}),
    ...(type === "annotation" ? { pointerTarget: { x: x + def.width / 2 + 30, y: y + def.height + 60 } } : {}),
    // 阀/泵默认在画布上显示开关（可在属性中关闭）
    ...(["solenoid2", "solenoid3", "pump", "milkPump"].includes(type) ? { showStateOnDiagram: true } : {})
  };
}

/** 咖啡出口出液嘴的局部坐标（用于滴液动画定位） */
export function spoutTips(node: DiagramNode): Array<{ x: number; y: number }> {
  if (node.type === "groupHead") {
    return [{ x: node.width / 2, y: node.height - 2 }];
  }
  if (node.type !== "coffeeOutlet" && node.type !== "milkOutlet" && node.type !== "hotWaterOutlet") return [];
  const { width: w, height: h } = node;
  return (node.variant ?? "single") === "double"
    ? [
        { x: w * 0.32, y: h - 2 },
        { x: w * 0.68, y: h - 2 }
      ]
    : [{ x: w / 2, y: h - 2 }];
}


/** 火焰符号 */
function Flame({ cx, cy, s }: { cx: number; cy: number; s: number }) {
  return (
    <path
      d={`M ${cx} ${cy + s * 0.5} C ${cx - s * 0.62} ${cy + s * 0.05} ${cx - s * 0.25} ${cy - s * 0.3} ${cx - s * 0.25} ${cy - s * 0.62} C ${cx + s * 0.18} ${cy - s * 0.38} ${cx + s * 0.55} ${cy - s * 0.1} ${cx + s * 0.32} ${cy + s * 0.22} C ${cx + s * 0.58} ${cy + s * 0.16} ${cx + s * 0.62} ${cy} ${cx + s * 0.62} ${cy - s * 0.12} C ${cx + s * 0.88} ${cy + s * 0.22} ${cx + s * 0.6} ${cy + s * 0.62} ${cx} ${cy + s * 0.5} Z`}
      fill="#e2694a"
      stroke="none"
      opacity={0.9}
    />
  );
}

/** 电磁线圈盒（电磁阀顶部） */
function Coil({ x, y, w, h, stroke }: { x: number; y: number; w: number; h: number; stroke: string }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="#eef2f7" stroke={stroke} strokeWidth={1.8} />
      {[0.25, 0.5, 0.75].map((t) => (
        <line key={t} x1={x + w * t} y1={y + 2.5} x2={x + w * t} y2={y + h - 2.5} stroke={stroke} strokeWidth={1.3} opacity={0.75} />
      ))}
    </g>
  );
}

/** 折线文字（自定义图形内多行文本） */
function CenterText({ node, w, h }: { node: DiagramNode; w: number; h: number }) {
  const fs = node.fontSize ?? 15;
  const lines = (node.label || "").split(/\n/);
  const startY = h / 2 - ((lines.length - 1) * fs * 1.25) / 2;
  return (
    <text textAnchor="middle" fontSize={fs} fill={node.stroke} fontFamily="system-ui, sans-serif" fontWeight={500} transform={node.rotation ? `rotate(${-node.rotation} ${w / 2} ${h / 2})` : undefined}>
      {lines.map((ln, i) => (
        <tspan key={i} x={w / 2} y={startY + i * fs * 1.25 + fs * 0.35}>{ln}</tspan>
      ))}
    </text>
  );
}

/** 各设备的 2D 工业符号（在 0..w × 0..h 局部坐标系内绘制） */
export function NodeSymbol({ node }: { node: DiagramNode }) {
  const { width: w, height: h, fill, stroke } = node;
  const sw = 2;
  const common = { fill, stroke, strokeWidth: sw } as const;
  switch (node.type) {
    case "tank":
      return (
        <g>
          <rect x={1} y={1} width={w - 2} height={h - 2} rx={14} {...common} />
          <path d={`M 6 ${h * 0.42} C ${w * 0.3} ${h * 0.36}, ${w * 0.7} ${h * 0.48}, ${w - 6} ${h * 0.42}`} fill="none" stroke={stroke} strokeWidth={1.5} opacity={0.7} />
          <path d={`M 6 ${h * 0.42} C ${w * 0.3} ${h * 0.36}, ${w * 0.7} ${h * 0.48}, ${w - 6} ${h * 0.42} L ${w - 6} ${h - 10} Q ${w - 6} ${h - 4} ${w - 14} ${h - 3} L 14 ${h - 3} Q 6 ${h - 4} 6 ${h - 10} Z`} fill={stroke} opacity={0.08} stroke="none" />
        </g>
      );
    case "pressureTank": {
      const cx = w / 2;
      return (
        <g>
          {/* 顶部接口 */}
          <rect x={cx - 7} y={2} width={14} height={12} rx={3} {...common} />
          {/* 罐体 */}
          <rect x={6} y={14} width={w - 12} height={h - 22} rx={12} {...common} />
          {/* 气囊分隔线 */}
          <path d={`M 12 ${h * 0.5} C ${w * 0.35} ${h * 0.44}, ${w * 0.65} ${h * 0.56}, ${w - 12} ${h * 0.5}`} fill="none" stroke={stroke} strokeWidth={1.4} opacity={0.6} />
          {/* 蓄压水区 */}
          <path d={`M 12 ${h * 0.5} C ${w * 0.35} ${h * 0.44}, ${w * 0.65} ${h * 0.56}, ${w - 12} ${h * 0.5} L ${w - 12} ${h - 14} Q ${w - 12} ${h - 6} ${w - 6} ${h - 6} L 6 ${h - 6} Q 12 ${h - 6} 12 ${h - 14} Z`} fill="#2f7fd6" opacity={0.08} stroke="none" />
        </g>
      );
    }
    case "syrupBottle": {
      const cx = w / 2;
      return (
        <g>
          {/* 瓶颈 */}
          <rect x={cx - 7} y={2} width={14} height={16} rx={2} {...common} />
          <rect x={cx - 5} y={16} width={10} height={4} fill={stroke} stroke="none" />
          {/* 瓶身 */}
          <path d={`M ${w * 0.16} 20 L ${w * 0.84} 20 Q ${w - 2} 20 ${w - 2} ${h * 0.55} L ${w - 2} ${h - 12} Q ${w - 2} ${h - 2} ${w - 12} ${h - 2} L 12 ${h - 2} Q 2 ${h - 2} 2 ${h - 12} L 2 ${h * 0.55} Q 2 20 ${w * 0.16} 20 Z`} {...common} strokeLinejoin="round" />
          {/* 糖浆液面 */}
          <path d={`M 4 ${h * 0.62} L ${w - 4} ${h * 0.62} L ${w - 4} ${h - 12} Q ${w - 4} ${h - 4} ${w - 12} ${h - 4} L 12 ${h - 4} Q 4 ${h - 4} 4 ${h - 12} Z`} fill="#d98a3d" opacity={0.22} stroke="none" />
        </g>
      );
    }
    case "boiler":
    case "hotWaterBoiler":
      return (
        <g>
          {/* 平整罐体：上下端无突出接管座，便于在其上方安装泄压阀/三通电磁阀/压力表等附件 */}
          <rect x={2} y={2} width={w - 4} height={h - 4} rx={12} {...common} />
          {/* 水位波浪线 */}
          <path d={`M 10 ${h * 0.34} C ${w * 0.3} ${h * 0.3}, ${w * 0.42} ${h * 0.38}, ${w * 0.56} ${h * 0.34} C ${w * 0.7} ${h * 0.3}, ${w * 0.84} ${h * 0.38}, ${w - 10} ${h * 0.34}`} fill="none" stroke={stroke} strokeWidth={1.5} opacity={0.6} />
          <path d={`M 10 ${h * 0.34} C ${w * 0.3} ${h * 0.3}, ${w * 0.42} ${h * 0.38}, ${w * 0.56} ${h * 0.34} C ${w * 0.7} ${h * 0.3}, ${w * 0.84} ${h * 0.38}, ${w - 10} ${h * 0.34} L ${w - 10} ${h - 26} L 10 ${h - 26} Z`} fill="#e2694a" opacity={0.1} stroke="none" />
          <Flame cx={w * 0.5} cy={h * 0.82} s={Math.min(w, h) * 0.18} />
        </g>
      );
    case "steamBoiler":
      return (
        <g>
          {/* 平整罐体：上下端无突出接管座 */}
          <rect x={2} y={2} width={w - 4} height={h - 4} rx={12} {...common} />
          {/* 蒸汽波浪（罐体上部） */}
          {[0, 1, 2].map((i) => (
            <path
              key={i}
              d={`M ${w * (0.22 + i * 0.22)} ${h * 0.42} C ${w * (0.18 + i * 0.22)} ${h * 0.36} ${w * (0.26 + i * 0.22)} ${h * 0.32} ${w * (0.22 + i * 0.22)} ${h * 0.26}`}
              fill="none"
              stroke={stroke}
              strokeWidth={1.6}
              strokeLinecap="round"
              opacity={0.65}
            />
          ))}
          {/* 水位线 */}
          <path d={`M 10 ${h * 0.56} C ${w * 0.3} ${h * 0.52}, ${w * 0.7} ${h * 0.6}, ${w - 10} ${h * 0.56}`} fill="none" stroke={stroke} strokeWidth={1.5} opacity={0.6} />
          <path d={`M 10 ${h * 0.56} C ${w * 0.3} ${h * 0.52}, ${w * 0.7} ${h * 0.6}, ${w - 10} ${h * 0.56} L ${w - 10} ${h - 26} L 10 ${h - 26} Z`} fill="#2f7fd6" opacity={0.08} stroke="none" />
          <Flame cx={w * 0.5} cy={h * 0.85} s={Math.min(w, h) * 0.16} />
        </g>
      );
    case "pump": {
      const r = Math.min(w, h) / 2 - 3;
      const cx = w / 2;
      const cy = h / 2;
      const running = node.pumpOn !== false;
      return (
        <g opacity={running ? 1 : 0.55}>
          {/* 泵体 - 外圈 */}
          <circle cx={cx} cy={cy} r={r} fill={fill} stroke={stroke} strokeWidth={sw} />
          {/* 齿轮（运行才旋转） */}
          <g className={running ? "fp-gear" : undefined}>
            <circle cx={cx} cy={cy} r={r * 0.6} fill="none" stroke={stroke} strokeWidth={sw} />
            {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
              const rad = (a * Math.PI) / 180;
              return (
                <line
                  key={a}
                  x1={(cx + r * 0.6 * Math.cos(rad)).toFixed(1)}
                  y1={(cy + r * 0.6 * Math.sin(rad)).toFixed(1)}
                  x2={(cx + r * 0.76 * Math.cos(rad)).toFixed(1)}
                  y2={(cy + r * 0.76 * Math.sin(rad)).toFixed(1)}
                  stroke={stroke}
                  strokeWidth={sw + 1}
                  strokeLinecap="round"
                />
              );
            })}
          </g>
          {/* 中心轮毂 + 轴孔 */}
          <circle cx={cx} cy={cy} r={r * 0.2} fill={stroke} stroke="none" />
          <circle cx={cx} cy={cy} r={r * 0.07} fill="#ffffff" stroke="none" />
          {/* 状态指示：泵体正上方 */}
          <circle cx={cx} cy={cy - r - 2} r={4.5} fill={running ? "#3fae6a" : "#d9534f"} stroke="#fff" strokeWidth={1.5} />
        </g>
      );
    }
    case "milkPump": {
      const r = Math.min(w, h) / 2 - 3;
      const cx = w / 2;
      const cy = h / 2;
      const running = node.pumpOn !== false;
      return (
        <g opacity={running ? 1 : 0.55}>
          <circle cx={cx} cy={cy} r={r} fill={fill} stroke={stroke} strokeWidth={sw} />
          <g className={running ? "fp-gear" : undefined}>
            <circle cx={cx} cy={cy} r={r * 0.6} fill="none" stroke={stroke} strokeWidth={sw} />
            {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
              const rad = (a * Math.PI) / 180;
              return (
                <line
                  key={a}
                  x1={(cx + r * 0.6 * Math.cos(rad)).toFixed(1)}
                  y1={(cy + r * 0.6 * Math.sin(rad)).toFixed(1)}
                  x2={(cx + r * 0.76 * Math.cos(rad)).toFixed(1)}
                  y2={(cy + r * 0.76 * Math.sin(rad)).toFixed(1)}
                  stroke={stroke}
                  strokeWidth={sw + 1}
                  strokeLinecap="round"
                />
              );
            })}
          </g>
          {/* 中心奶滴标识 */}
          <path
            d={`M ${cx} ${(cy - r * 0.16).toFixed(1)} C ${(cx + r * 0.11).toFixed(1)} ${(cy - r * 0.02).toFixed(1)} ${(cx + r * 0.11).toFixed(1)} ${(cy + r * 0.1).toFixed(1)} ${cx} ${(cy + r * 0.1).toFixed(1)} C ${(cx - r * 0.11).toFixed(1)} ${(cy + r * 0.1).toFixed(1)} ${(cx - r * 0.11).toFixed(1)} ${(cy - r * 0.02).toFixed(1)} ${cx} ${(cy - r * 0.16).toFixed(1)} Z`}
            fill="#e8b84b" stroke={stroke} strokeWidth={1}
          />
          <circle cx={cx} cy={cy - r - 2} r={4.5} fill={running ? "#3fae6a" : "#d9534f"} stroke="#fff" strokeWidth={1.5} />
        </g>
      );
    }
    case "valve": {
      const cy = h * 0.72;
      return (
        <g>
          <path d={`M 2 ${cy - 16} L ${w / 2} ${cy} L 2 ${cy + 16} Z`} {...common} />
          <path d={`M ${w - 2} ${cy - 16} L ${w / 2} ${cy} L ${w - 2} ${cy + 16} Z`} {...common} />
          <line x1={w / 2} y1={cy} x2={w / 2} y2={8} stroke={stroke} strokeWidth={sw} />
          <line x1={w / 2 - 12} y1={8} x2={w / 2 + 12} y2={8} stroke={stroke} strokeWidth={sw + 1} strokeLinecap="round" />
        </g>
      );
    }
    case "checkValve": {
      const cy = h / 2;
      return (
        <g>
          <path d={`M 2 ${cy - 15} L ${w / 2} ${cy} L 2 ${cy + 15} Z`} {...common} />
          <line x1={w / 2} y1={cy - 16} x2={w / 2} y2={cy + 16} stroke={stroke} strokeWidth={sw + 1} />
          <path d={`M ${w / 2 + 8} ${cy} L ${w - 4} ${cy}`} stroke={stroke} strokeWidth={sw} fill="none" />
          <path d={`M ${w - 12} ${cy - 6} L ${w - 4} ${cy} L ${w - 12} ${cy + 6}`} stroke={stroke} strokeWidth={sw} fill="none" strokeLinejoin="round" />
        </g>
      );
    }
    case "solenoid2": {
      const cy = h * 0.76;
      const open = node.valveState !== "closed";
      return (
        <g>
          <path d={`M 2 ${cy - 14} L ${w / 2} ${cy} L 2 ${cy + 14} Z`} {...common} />
          <path d={`M ${w - 2} ${cy - 14} L ${w / 2} ${cy} L ${w - 2} ${cy + 14} Z`} {...common} />
          <line x1={w / 2} y1={cy} x2={w / 2} y2={h * 0.3} stroke={stroke} strokeWidth={sw} />
          <Coil x={w / 2 - 15} y={2} w={30} h={h * 0.3 - 2} stroke={stroke} />
          {/* 开/关状态指示 */}
          <circle cx={w - 8} cy={7} r={4} fill={open ? "#3fae6a" : "#d9534f"} stroke="#fff" strokeWidth={1.2} />
          <text x={w - 8} y={20} textAnchor="middle" fontSize={9} fill={open ? "#3fae6a" : "#d9534f"} fontFamily="system-ui, sans-serif" fontWeight={600}>{open ? "开" : "关"}</text>
        </g>
      );
    }
    case "solenoid3": {
      const cy = h * 0.62;
      const path = node.valvePath ?? "A";
      const color = path === "A" ? "#3fae6a" : path === "B" ? "#2f7fd6" : "#d9534f";
      const label = path === "A" ? "A" : path === "B" ? "B" : "关";
      return (
        <g>
          <path d={`M 2 ${cy - 13} L ${w / 2} ${cy} L 2 ${cy + 13} Z`} {...common} />
          <path d={`M ${w - 2} ${cy - 13} L ${w / 2} ${cy} L ${w - 2} ${cy + 13} Z`} {...common} />
          <path d={`M ${w / 2 - 13} ${h - 2} L ${w / 2} ${cy} L ${w / 2 + 13} ${h - 2} Z`} {...common} />
          <line x1={w / 2} y1={cy} x2={w / 2} y2={h * 0.26} stroke={stroke} strokeWidth={sw} />
          <Coil x={w / 2 - 14} y={2} w={28} h={h * 0.26 - 2} stroke={stroke} />
          {/* 导通路径高亮 + 状态指示 */}
          {path === "A" && <path d={`M ${w - 2} ${cy - 13} L ${w / 2} ${cy} L ${w - 2} ${cy + 13} Z`} fill="none" stroke={color} strokeWidth={3} opacity={0.5} strokeLinejoin="round" />}
          {path === "B" && <path d={`M ${w / 2 - 13} ${h - 2} L ${w / 2} ${cy} L ${w / 2 + 13} ${h - 2} Z`} fill="none" stroke={color} strokeWidth={3} opacity={0.5} strokeLinejoin="round" />}
          <circle cx={w - 8} cy={7} r={4} fill={color} stroke="#fff" strokeWidth={1.2} />
          <text x={w - 8} y={20} textAnchor="middle" fontSize={9} fill={color} fontFamily="system-ui, sans-serif" fontWeight={600}>{label}</text>
        </g>
      );
    }
    case "pulseAirValve": {
      const cy = h * 0.76;
      return (
        <g>
          {/* 阀体（与两通阀一致） */}
          <path d={`M 2 ${cy - 14} L ${w / 2} ${cy} L 2 ${cy + 14} Z`} {...common} />
          <path d={`M ${w - 2} ${cy - 14} L ${w / 2} ${cy} L ${w - 2} ${cy + 14} Z`} {...common} />
          <line x1={w / 2} y1={cy} x2={w / 2} y2={h * 0.3} stroke={stroke} strokeWidth={sw} />
          <Coil x={w / 2 - 15} y={2} w={30} h={h * 0.3 - 2} stroke={stroke} />
          {/* 脉冲标识：闪电 + 气流点 */}
          <path d={`M ${w / 2 + 3} ${h * 0.14} L ${w / 2 - 5} ${h * 0.2} L ${w / 2 + 0} ${h * 0.2} L ${w / 2 - 6} ${h * 0.28} L ${w / 2 + 6} ${h * 0.28}`} fill="none" stroke="#2f7fd6" strokeWidth={1.5} strokeLinejoin="round" />
        </g>
      );
    }
    case "pressureRegulator": {
      const cy = h * 0.72;
      return (
        <g>
          {/* 阀体（上下三角，与截止阀一致） */}
          <path d={`M 2 ${cy - 16} L ${w / 2} ${cy} L 2 ${cy + 16} Z`} {...common} />
          <path d={`M ${w - 2} ${cy - 16} L ${w / 2} ${cy} L ${w - 2} ${cy + 16} Z`} {...common} />
          {/* 弹簧 + 调压旋钮 */}
          <line x1={w / 2} y1={cy} x2={w / 2} y2={h * 0.3} stroke={stroke} strokeWidth={sw} />
          <path d={`M ${w / 2 - 7} ${h * 0.3} L ${w / 2 + 7} ${h * 0.3} L ${w / 2 + 5} ${h * 0.2} L ${w / 2 - 5} ${h * 0.2} Z`} {...common} />
          {/* 减压箭头（下游压力降低） */}
          <path d={`M ${w - 10} ${cy - 8} L ${w - 2} ${cy} L ${w - 10} ${cy + 8}`} fill="none" stroke="#c94f3d" strokeWidth={1.6} strokeLinejoin="round" />
        </g>
      );
    }
    case "safetyValve": {
      const cx = w / 2;
      const vy = h * 0.66;
      // 弹簧 zigzag
      const zig: string[] = [`M ${cx} ${vy - 10}`];
      const n = 5;
      for (let i = 0; i < n; i++) {
        const y = vy - 12 - ((vy - 18) / n) * (i + 0.5);
        zig.push(`L ${cx + (i % 2 === 0 ? 9 : -9)} ${y}`);
      }
      zig.push(`L ${cx} 6`);
      return (
        <g>
          <path d={`M ${cx - 14} ${h - 2} L ${cx} ${vy} L ${cx + 14} ${h - 2} Z`} {...common} />
          <path d={`M ${cx} ${vy} L ${w - 4} ${vy - 12}`} stroke={stroke} strokeWidth={sw} fill="none" />
          <path d={`M ${w - 11} ${vy - 19} L ${w - 3} ${vy - 12} L ${w - 13} ${vy - 8}`} fill={stroke} stroke="none" />
          <path d={zig.join(" ")} fill="none" stroke={stroke} strokeWidth={1.8} strokeLinejoin="round" />
          <line x1={cx - 10} y1={6} x2={cx + 10} y2={6} stroke={stroke} strokeWidth={sw + 0.5} strokeLinecap="round" />
        </g>
      );
    }
    case "opv": {
      const cx = w / 2;
      const vy = h * 0.66;
      const zig: string[] = [`M ${cx} ${vy - 8}`];
      const n = 4;
      for (let i = 0; i < n; i++) {
        const y = vy - 10 - ((vy - 16) / n) * (i + 0.5);
        zig.push(`L ${cx + (i % 2 === 0 ? 8 : -8)} ${y}`);
      }
      zig.push(`L ${cx} 8`);
      return (
        <g>
          <path d={`M ${cx - 13} ${h - 2} L ${cx} ${vy} L ${cx + 13} ${h - 2} Z`} {...common} />
          <path d={`M ${cx} ${vy} L ${w - 4} ${vy - 10}`} stroke={stroke} strokeWidth={sw} fill="none" />
          <path d={`M ${w - 10} ${vy - 16} L ${w - 3} ${vy - 10} L ${w - 12} ${vy - 6}`} fill={stroke} stroke="none" />
          <path d={zig.join(" ")} fill="none" stroke={stroke} strokeWidth={1.7} strokeLinejoin="round" />
          <line x1={cx - 9} y1={8} x2={cx + 9} y2={8} stroke={stroke} strokeWidth={sw + 0.5} strokeLinecap="round" />
          {/* 旁通回流箭头提示 */}
          <path d={`M ${w - 10} ${vy + 6} h 6 M ${w - 7} ${vy + 3} l 3 3 l -3 3`} fill="none" stroke="#c94f3d" strokeWidth={1.4} />
        </g>
      );
    }
    case "tee": {
      const t = 12;
      const cx = w / 2;
      const cy = h / 2;
      return (
        <path
          d={`M 2 ${cy - t / 2} L ${w - 2} ${cy - t / 2} L ${w - 2} ${cy + t / 2} L ${cx + t / 2} ${cy + t / 2} L ${cx + t / 2} ${h - 2} L ${cx - t / 2} ${h - 2} L ${cx - t / 2} ${cy + t / 2} L 2 ${cy + t / 2} Z`}
          {...common}
          strokeLinejoin="round"
        />
      );
    }
    case "teeY": {
      const cx = w * 0.5;
      const cy = h * 0.5;
      return (
        <g>
          {/* 主干（水平） */}
          <line x1={2} y1={cy} x2={cx} y2={cy} stroke={stroke} strokeWidth={sw + 4} strokeLinecap="round" />
          {/* 上分叉 */}
          <line x1={cx} y1={cy} x2={w - 2} y2={cy - h * 0.22} stroke={stroke} strokeWidth={sw + 4} strokeLinecap="round" />
          {/* 下分叉（与上分叉对称） */}
          <line x1={cx} y1={cy} x2={w - 2} y2={cy + h * 0.22} stroke={stroke} strokeWidth={sw + 4} strokeLinecap="round" />
          {/* 交会圆盘 */}
          <circle cx={cx} cy={cy} r={6} fill={fill} stroke={stroke} strokeWidth={sw} />
        </g>
      );
    }
    case "cross": {
      // 十字四通：横竖主管交汇，四端各一口
      const cx = w * 0.5;
      const cy = h * 0.5;
      const armW = sw + 4;
      return (
        <g>
          <line x1={2} y1={cy} x2={w - 2} y2={cy} stroke={stroke} strokeWidth={armW} strokeLinecap="round" />
          <line x1={cx} y1={2} x2={cx} y2={h - 2} stroke={stroke} strokeWidth={armW} strokeLinecap="round" />
          <circle cx={cx} cy={cy} r={armW / 2 + 1} fill={stroke} />
          {[["left", 2, cy], ["right", w - 2, cy], ["top", cx, 2], ["bottom", cx, h - 2]].map(([, px, py], i) => (
            <circle key={i} cx={px as number} cy={py as number} r={4} fill={fill} stroke={stroke} strokeWidth={sw} />
          ))}
        </g>
      );
    }
    case "teeF": {
      // F 型三通：竖直主管（上下直通）+ 上/下两条水平支管（形似 F，对称）
      const cx = w * 0.5;
      const armW = sw + 4;
      const topY = h * 0.25;
      const botY = h * 0.75;
      return (
        <g>
          {/* 竖直主管 */}
          <line x1={cx} y1={2} x2={cx} y2={h - 2} stroke={stroke} strokeWidth={armW} strokeLinecap="round" />
          {/* 上水平支管 */}
          <path d={`M ${cx} ${topY} L ${w - 2} ${topY}`} stroke={stroke} strokeWidth={armW} strokeLinecap="round" />
          {/* 下水平支管（对称） */}
          <path d={`M ${cx} ${botY} L ${w - 2} ${botY}`} stroke={stroke} strokeWidth={armW} strokeLinecap="round" />
          {/* 主管与支管交会焊接点 */}
          <circle cx={cx} cy={topY} r={armW / 2 + 1} fill={stroke} />
          <circle cx={cx} cy={botY} r={armW / 2 + 1} fill={stroke} />
          {/* 支管末端端口圆点 */}
          <circle cx={w - 3} cy={topY} r={4} fill={fill} stroke={stroke} strokeWidth={sw} />
          <circle cx={w - 3} cy={botY} r={4} fill={fill} stroke={stroke} strokeWidth={sw} />
        </g>
      );
    }
    case "elbow": {
      const px = w * 0.35;
      const py = h * 0.35;
      return (
        <path
          d={`M 2 ${py} L ${px - 9} ${py} Q ${px} ${py} ${px} ${py + 9} L ${px} ${h - 2}`}
          fill="none" stroke={stroke} strokeWidth={sw + 3} strokeLinecap="round"
        />
      );
    }
    case "coupling": {
      const cy = h / 2;
      return (
        <g>
          {/* 接头主体 */}
          <rect x={2} y={2} width={w - 4} height={h - 4} rx={5} {...common} />
          {/* 左右管螺纹（竖线纹理） */}
          {[0.12, 0.2, 0.28].map((t) => (
            <line key={`l${t}`} x1={w * t} y1={5} x2={w * t} y2={h - 5} stroke={stroke} strokeWidth={1.2} opacity={0.4} />
          ))}
          {[0.72, 0.8, 0.88].map((t) => (
            <line key={`r${t}`} x1={w * t} y1={5} x2={w * t} y2={h - 5} stroke={stroke} strokeWidth={1.2} opacity={0.4} />
          ))}
          {/* 中间六角螺母 */}
          <rect x={w / 2 - 8} y={3} width={16} height={h - 6} rx={2} fill="none" stroke={stroke} strokeWidth={1.6} />
          <line x1={w / 2 - 8} y1={h * 0.3} x2={w / 2 + 8} y2={h * 0.3} stroke={stroke} strokeWidth={1} opacity={0.4} />
          <line x1={w / 2 - 8} y1={h * 0.7} x2={w / 2 + 8} y2={h * 0.7} stroke={stroke} strokeWidth={1} opacity={0.4} />
          <circle cx={w / 2} cy={cy} r={3} fill={stroke} stroke="none" opacity={0.7} />
        </g>
      );
    }
    case "metalCoupling": {
      const cy = h / 2;
      const r = Math.min(w, h) / 2 - 3;
      return (
        <g>
          {/* 镀锌金属管接头：灰色金属质感 */}
          <rect x={2} y={2} width={w - 4} height={h - 4} rx={4} fill={fill} stroke={stroke} strokeWidth={sw} />
          {/* 金属光泽高光 */}
          <rect x={4} y={3} width={w - 8} height={h / 2 - 3} rx={3} fill="rgba(255,255,255,0.3)" stroke="none" />
          {/* 滚花防滑纹路 */}
          {[0.3, 0.45, 0.6, 0.75].map((t, i) => (
            <line key={i} x1={w * 0.15} y1={h * t} x2={w * 0.85} y2={h * t} stroke={stroke} strokeWidth={1.2} opacity={0.3} />
          ))}
          {/* 六角螺帽轮廓 */}
          <rect x={w / 2 - 8} y={h * 0.2} width={16} height={h * 0.6} rx={2} fill="none" stroke={stroke} strokeWidth={1.5} opacity={0.5} />
          <circle cx={w / 2} cy={cy} r={r * 0.25} fill="none" stroke={stroke} strokeWidth={1.5} opacity={0.6} />
        </g>
      );
    }
    case "heatExchanger": {
      const zig: string[] = [`M 10 ${h / 2}`];
      const n = 6;
      const span = (w - 20) / n;
      for (let i = 0; i < n; i++) {
        const x0 = 10 + span * i;
        zig.push(`L ${x0 + span / 2} ${i % 2 === 0 ? h * 0.24 : h * 0.76}`);
        zig.push(`L ${x0 + span} ${h / 2}`);
      }
      return (
        <g>
          <rect x={2} y={2} width={w - 4} height={h - 4} rx={10} {...common} />
          <path d={zig.join(" ")} fill="none" stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
        </g>
      );
    }
    case "brewChamber": {
      // 冲泡缸：矩形机体 + 中部密闭腔（萃取咖啡）+ 上下活塞挤压（简笔）
      const cx = w / 2;
      return (
        <g>
          <rect x={2} y={2} width={w - 4} height={h - 4} rx={8} {...common} />
          {/* 密闭腔（中部萃取区） */}
          <rect x={16} y={h * 0.3} width={w - 32} height={h * 0.4} rx={6} fill="none" stroke={stroke} strokeWidth={1.5} strokeDasharray="3 2" />
          {/* 上活塞：杆 + 板 */}
          <line x1={cx} y1={5} x2={cx} y2={h * 0.3 - 2} stroke={stroke} strokeWidth={2} />
          <rect x={16} y={h * 0.3 - 5} width={w - 32} height={7} rx={3} fill={stroke} />
          {/* 下活塞：杆 + 板 */}
          <line x1={cx} y1={h * 0.7 + 2} x2={cx} y2={h - 5} stroke={stroke} strokeWidth={2} />
          <rect x={16} y={h * 0.7 - 2} width={w - 32} height={7} rx={3} fill={stroke} />
          {/* 咖啡粉示意 */}
          <circle cx={cx - 12} cy={h * 0.5} r={2.2} fill={stroke} opacity={0.5} />
          <circle cx={cx} cy={h * 0.5 + 5} r={2.2} fill={stroke} opacity={0.5} />
          <circle cx={cx + 12} cy={h * 0.5} r={2.2} fill={stroke} opacity={0.5} />
        </g>
      );
    }
    case "filter":
      return (
        <g>
          <rect x={2} y={2} width={w - 4} height={h - 4} rx={8} {...common} />
          {[0, 1, 2, 3].map((i) => (
            <line key={i} x1={12} y1={h * 0.35 + i * 12} x2={w - 12} y2={h * 0.35 + i * 12 - 8} stroke={stroke} strokeWidth={1.6} opacity={0.75} />
          ))}
        </g>
      );
    case "metalFilter":
      return (
        <g>
          {/* 矩形金属滤网壳体 */}
          <rect x={2} y={2} width={w - 4} height={h - 4} rx={4} fill={fill} stroke={stroke} strokeWidth={sw} />
          {/* 金属高光 */}
          <rect x={5} y={4} width={w - 10} height={h * 0.28} rx={2} fill="rgba(255,255,255,0.35)" stroke="none" />
          {/* 内部滤网网格 */}
          <line x1={16} y1={h * 0.38} x2={w - 16} y2={h * 0.38} stroke={stroke} strokeWidth={1.4} opacity={0.7} />
          <line x1={16} y1={h * 0.58} x2={w - 16} y2={h * 0.58} stroke={stroke} strokeWidth={1.4} opacity={0.7} />
          {[0.3, 0.5, 0.7].map((t) => (
            <line key={t} x1={w * t} y1={h * 0.34} x2={w * t} y2={h * 0.66} stroke={stroke} strokeWidth={1.2} opacity={0.55} />
          ))}
          {/* 大颗粒拦截示意 */}
          {[0.35, 0.55].map((t, i) => (
            <circle key={i} cx={w * t} cy={h * 0.42 + i * 0.1 * h} r={2.4} fill="#c94f3d" stroke="none" opacity={0.7} />
          ))}
        </g>
      );
    case "powderMixer":
      return (
        <g>
          {/* 料斗（上宽下窄） */}
          <path d={`M ${w * 0.18} 2 L ${w * 0.82} 2 L ${w * 0.7} ${h * 0.32} L ${w * 0.3} ${h * 0.32} Z`} {...common} strokeLinejoin="round" />
          {/* 搅拌罐体 */}
          <rect x={w * 0.22} y={h * 0.32} width={w * 0.56} height={h * 0.4} rx={8} {...common} />
          {/* 搅拌叶片（十字） */}
          <g className="fp-gear">
            <line x1={w / 2} y1={h * 0.42} x2={w / 2} y2={h * 0.62} stroke={stroke} strokeWidth={2.2} strokeLinecap="round" />
            <line x1={w * 0.34} y1={h * 0.52} x2={w * 0.66} y2={h * 0.52} stroke={stroke} strokeWidth={2.2} strokeLinecap="round" />
          </g>
          <circle cx={w / 2} cy={h * 0.52} r={3} fill={stroke} stroke="none" />
          {/* 粉料颗粒 */}
          {[[0.3, 0.42], [0.68, 0.44], [0.34, 0.6], [0.66, 0.58]].map(([x, y], i) => (
            <circle key={i} cx={w * (x as number)} cy={h * (y as number)} r={1.6} fill="#c9974d" stroke="none" opacity={0.85} />
          ))}
          {/* 出料口 */}
          <path d={`M ${w * 0.38} ${h * 0.72} L ${w * 0.62} ${h * 0.72} L ${w * 0.58} ${h - 2} L ${w * 0.42} ${h - 2} Z`} {...common} strokeLinejoin="round" />
        </g>
      );
    case "inlet":
      return (
        <g>
          <path d={`M 2 2 L ${w * 0.62} 2 L ${w - 2} ${h / 2} L ${w * 0.62} ${h - 2} L 2 ${h - 2} Z`} {...common} strokeLinejoin="round" />
          <text x={w * 0.32} y={h / 2 + 4} textAnchor="middle" fontSize={12} fill={stroke} fontFamily="system-ui, sans-serif">入</text>
        </g>
      );
    case "outlet":
      return (
        <g>
          <path d={`M ${w - 2} 2 L ${w * 0.38} 2 L 2 ${h / 2} L ${w * 0.38} ${h - 2} L ${w - 2} ${h - 2} Z`} {...common} strokeLinejoin="round" />
          <text x={w * 0.62} y={h / 2 + 4} textAnchor="middle" fontSize={12} fill={stroke} fontFamily="system-ui, sans-serif">出</text>
        </g>
      );
    case "connector": {
      const r = Math.min(w, h) / 2 - 3;
      return (
        <g>
          <circle cx={w / 2} cy={h / 2} r={r} {...common} />
          <circle cx={w / 2} cy={h / 2} r={r * 0.35} fill={stroke} stroke="none" opacity={0.7} />
        </g>
      );
    }
    case "hotWaterWand": {
      const cx = w / 2;
      return (
        <g>
          {/* 顶部安装法兰 */}
          <rect x={cx - 13} y={2} width={26} height={12} rx={3} {...common} />
          <line x1={cx - 6} y1={2} x2={cx - 6} y2={14} stroke={stroke} strokeWidth={1.2} opacity={0.55} />
          <line x1={cx + 6} y1={2} x2={cx + 6} y2={14} stroke={stroke} strokeWidth={1.2} opacity={0.55} />
          {/* 杆体（上粗下细） */}
          <path d={`M ${cx - 7} 14 L ${cx + 7} 14 L ${cx + 4.5} ${h * 0.72} L ${cx - 4.5} ${h * 0.72} Z`} {...common} strokeLinejoin="round" />
          {/* 出水嘴（扩口） */}
          <path d={`M ${cx - 4.5} ${h * 0.72} L ${cx + 4.5} ${h * 0.72} L ${cx + 8} ${h - 6} L ${cx + 8} ${h - 2} L ${cx - 8} ${h - 2} L ${cx - 8} ${h - 6} Z`} {...common} strokeLinejoin="round" />
          {/* 热水标识点 */}
          <circle cx={cx} cy={h * 0.4} r={3.2} fill="#e2542f" stroke="none" opacity={0.85} />
        </g>
      );
    }
    case "steamWand": {
      const cx = w / 2;
      return (
        <g>
          {/* 顶部安装法兰 */}
          <rect x={cx - 12} y={2} width={24} height={11} rx={3} {...common} />
          {/* 万向球关节 */}
          <circle cx={cx} cy={20} r={7.5} {...common} />
          {/* 长杆（比热水杆更长更细，微向下收窄） */}
          <path d={`M ${cx - 5} 27 L ${cx + 5} 27 L ${cx + 3.5} ${h - 20} L ${cx - 3.5} ${h - 20} Z`} {...common} strokeLinejoin="round" />
          {/* 蒸汽喷头（四孔头） */}
          <path d={`M ${cx - 6} ${h - 20} L ${cx + 6} ${h - 20} L ${cx + 5} ${h - 4} Q ${cx + 5} ${h - 2} ${cx + 3} ${h - 2} L ${cx - 3} ${h - 2} Q ${cx - 5} ${h - 2} ${cx - 5} ${h - 4} Z`} {...common} strokeLinejoin="round" />
          <circle cx={cx - 2.4} cy={h - 6.5} r={1.1} fill={stroke} stroke="none" opacity={0.8} />
          <circle cx={cx + 2.4} cy={h - 6.5} r={1.1} fill={stroke} stroke="none" opacity={0.8} />
          {/* 蒸汽标识点 */}
          <circle cx={cx} cy={h * 0.45} r={3} fill="#ef8aa0" stroke="none" opacity={0.9} />
        </g>
      );
    }
    case "groupHead": {
      const cx = w / 2;
      const bodyH = h * 0.44;
      return (
        <g>
          {/* 顶部进水管座 */}
          <rect x={cx - 9} y={2} width={18} height={10} fill={fill} stroke={stroke} strokeWidth={1.6} />
          {/* 冲煮头主体（圆顶 + 法兰） */}
          <path d={`M ${w * 0.16} 12 L ${w * 0.84} 12 Q ${w * 0.84} ${bodyH * 0.9} ${w * 0.72} ${bodyH} L ${w * 0.28} ${bodyH} Q ${w * 0.16} ${bodyH * 0.9} ${w * 0.16} 12 Z`} {...common} strokeLinejoin="round" />
          {/* 分水网示意 */}
          <line x1={w * 0.24} y1={bodyH * 0.5} x2={w * 0.76} y2={bodyH * 0.5} stroke={stroke} strokeWidth={1.2} opacity={0.4} />
          <line x1={w * 0.3} y1={bodyH * 0.68} x2={w * 0.7} y2={bodyH * 0.68} stroke={stroke} strokeWidth={1} opacity={0.3} />
          {/* 粉碗 + 出液口 */}
          <path d={`M ${w * 0.32} ${bodyH} L ${w * 0.68} ${bodyH} L ${w * 0.6} ${bodyH + 14} L ${w * 0.4} ${bodyH + 14} Z`} {...common} strokeLinejoin="round" />
          <path d={`M ${cx - 5} ${bodyH + 14} L ${cx + 5} ${bodyH + 14} L ${cx + 6} ${h - 10} L ${cx + 6} ${h - 2} L ${cx - 6} ${h - 2} L ${cx - 6} ${h - 10} Z`} {...common} strokeLinejoin="round" />
          <circle cx={cx} cy={bodyH * 0.72} r={3} fill="#7b4a2d" stroke="none" opacity={0.85} />
        </g>
      );
    }
    case "coffeeOutlet": {
      const double = (node.variant ?? "single") === "double";
      const cx = w / 2;
      const bodyH = h * 0.5;
      return (
        <g>
          {/* 顶部接管座 */}
          <rect x={cx - 10} y={2} width={20} height={8} fill={fill} stroke={stroke} strokeWidth={1.6} />
          {/* 主体（冲煮头造型） */}
          <path d={`M ${w * 0.12} 10 L ${w * 0.88} 10 L ${w * 0.88} ${bodyH * 0.7} Q ${w * 0.88} ${bodyH} ${w * 0.76} ${bodyH} L ${w * 0.24} ${bodyH} Q ${w * 0.12} ${bodyH} ${w * 0.12} ${bodyH * 0.7} Z`} {...common} strokeLinejoin="round" />
          <line x1={w * 0.2} y1={bodyH * 0.42} x2={w * 0.8} y2={bodyH * 0.42} stroke={stroke} strokeWidth={1.2} opacity={0.4} />
          {/* 分液座 */}
          <path d={`M ${w * 0.3} ${bodyH} L ${w * 0.7} ${bodyH} L ${w * 0.62} ${bodyH + 12} L ${w * 0.38} ${bodyH + 12} Z`} {...common} strokeLinejoin="round" />
          {/* 出液嘴：单嘴居中 / 双嘴八字张开 */}
          {double ? (
            <g>
              <path d={`M ${w * 0.44} ${bodyH + 12} L ${w * 0.36} ${h - 8} L ${w * 0.36} ${h - 2} L ${w * 0.28} ${h - 2} L ${w * 0.28} ${h - 8} L ${w * 0.4} ${bodyH + 12} Z`} {...common} strokeLinejoin="round" />
              <path d={`M ${w * 0.56} ${bodyH + 12} L ${w * 0.64} ${h - 8} L ${w * 0.64} ${h - 2} L ${w * 0.72} ${h - 2} L ${w * 0.72} ${h - 8} L ${w * 0.6} ${bodyH + 12} Z`} {...common} strokeLinejoin="round" />
            </g>
          ) : (
            <path d={`M ${cx - 5} ${bodyH + 12} L ${cx + 5} ${bodyH + 12} L ${cx + 6.5} ${h - 8} L ${cx + 6.5} ${h - 2} L ${cx - 6.5} ${h - 2} L ${cx - 6.5} ${h - 8} Z`} {...common} strokeLinejoin="round" />
          )}
          {/* 咖啡标识点 */}
          <circle cx={cx} cy={bodyH * 0.72} r={3} fill="#7b4a2d" stroke="none" opacity={0.85} />
        </g>
      );
    }
    case "milkOutlet": {
      const double = (node.variant ?? "single") === "double";
      const cx = w / 2;
      const bodyH = h * 0.5;
      return (
        <g>
          <rect x={cx - 10} y={2} width={20} height={8} fill={fill} stroke={stroke} strokeWidth={1.6} />
          <path d={`M ${w * 0.12} 10 L ${w * 0.88} 10 L ${w * 0.88} ${bodyH * 0.7} Q ${w * 0.88} ${bodyH} ${w * 0.76} ${bodyH} L ${w * 0.24} ${bodyH} Q ${w * 0.12} ${bodyH} ${w * 0.12} ${bodyH * 0.7} Z`} {...common} strokeLinejoin="round" />
          <line x1={w * 0.2} y1={bodyH * 0.42} x2={w * 0.8} y2={bodyH * 0.42} stroke={stroke} strokeWidth={1.2} opacity={0.4} />
          <path d={`M ${w * 0.3} ${bodyH} L ${w * 0.7} ${bodyH} L ${w * 0.62} ${bodyH + 12} L ${w * 0.38} ${bodyH + 12} Z`} {...common} strokeLinejoin="round" />
          {double ? (
            <g>
              <path d={`M ${w * 0.44} ${bodyH + 12} L ${w * 0.36} ${h - 8} L ${w * 0.36} ${h - 2} L ${w * 0.28} ${h - 2} L ${w * 0.28} ${h - 8} L ${w * 0.4} ${bodyH + 12} Z`} {...common} strokeLinejoin="round" />
              <path d={`M ${w * 0.56} ${bodyH + 12} L ${w * 0.64} ${h - 8} L ${w * 0.64} ${h - 2} L ${w * 0.72} ${h - 2} L ${w * 0.72} ${h - 8} L ${w * 0.6} ${bodyH + 12} Z`} {...common} strokeLinejoin="round" />
            </g>
          ) : (
            <path d={`M ${cx - 5} ${bodyH + 12} L ${cx + 5} ${bodyH + 12} L ${cx + 6.5} ${h - 8} L ${cx + 6.5} ${h - 2} L ${cx - 6.5} ${h - 2} L ${cx - 6.5} ${h - 8} Z`} {...common} strokeLinejoin="round" />
          )}
          <circle cx={cx} cy={bodyH * 0.72} r={3} fill="#f3ead6" stroke="none" opacity={0.85} />
        </g>
      );
    }
    case "hotWaterOutlet": {
      const cx = w / 2;
      const bodyH = h * 0.5;
      return (
        <g>
          <rect x={cx - 10} y={2} width={20} height={8} fill={fill} stroke={stroke} strokeWidth={1.6} />
          <path d={`M ${w * 0.12} 10 L ${w * 0.88} 10 L ${w * 0.88} ${bodyH * 0.7} Q ${w * 0.88} ${bodyH} ${w * 0.76} ${bodyH} L ${w * 0.24} ${bodyH} Q ${w * 0.12} ${bodyH} ${w * 0.12} ${bodyH * 0.7} Z`} {...common} strokeLinejoin="round" />
          <line x1={w * 0.2} y1={bodyH * 0.42} x2={w * 0.8} y2={bodyH * 0.42} stroke={stroke} strokeWidth={1.2} opacity={0.4} />
          <path d={`M ${w * 0.3} ${bodyH} L ${w * 0.7} ${bodyH} L ${w * 0.62} ${bodyH + 12} L ${w * 0.38} ${bodyH + 12} Z`} {...common} strokeLinejoin="round" />
          <path d={`M ${cx - 5} ${bodyH + 12} L ${cx + 5} ${bodyH + 12} L ${cx + 6.5} ${h - 8} L ${cx + 6.5} ${h - 2} L ${cx - 6.5} ${h - 2} L ${cx - 6.5} ${h - 8} Z`} {...common} strokeLinejoin="round" />
          <circle cx={cx} cy={bodyH * 0.72} r={3} fill="#2f7fd6" stroke="none" opacity={0.85} />
        </g>
      );
    }
    case "flowMeter": {
      const r = Math.min(w, h) / 2 - 3;
      const cx = w / 2;
      const cy = h / 2;
      return (
        <g>
          <circle cx={cx} cy={cy} r={r} {...common} />
          {/* 涡轮叶片 */}
          {[0, 90, 180, 270].map((a) => (
            <path
              key={a}
              d={`M ${cx} ${cy} L ${cx + r * 0.62} ${cy - r * 0.2} L ${cx + r * 0.62} ${cy + r * 0.12} Z`}
              fill={stroke}
              opacity={0.7}
              stroke="none"
              transform={`rotate(${a} ${cx} ${cy})`}
            />
          ))}
          <circle cx={cx} cy={cy} r={r * 0.16} fill={fill} stroke={stroke} strokeWidth={1.5} />
        </g>
      );
    }
    case "pressureGauge": {
      const r = Math.min(w, h * 0.72) / 2 - 3;
      const cx = w / 2;
      const cy = r + 4;
      return (
        <g>
          <line x1={cx} y1={cy + r} x2={cx} y2={h - 2} stroke={stroke} strokeWidth={sw + 1} />
          <circle cx={cx} cy={cy} r={r} {...common} />
          {/* 刻度 */}
          {[-135, -90, -45, 0, 45].map((a) => {
            const rad = ((a - 90) * Math.PI) / 180;
            return (
              <line
                key={a}
                x1={cx + Math.cos(rad) * r * 0.78}
                y1={cy + Math.sin(rad) * r * 0.78}
                x2={cx + Math.cos(rad) * r * 0.92}
                y2={cy + Math.sin(rad) * r * 0.92}
                stroke={stroke}
                strokeWidth={1.4}
                opacity={0.8}
              />
            );
          })}
          {/* 指针 */}
          <line x1={cx} y1={cy} x2={cx + r * 0.55} y2={cy - r * 0.5} stroke="#c94f3d" strokeWidth={2.2} strokeLinecap="round" />
          <circle cx={cx} cy={cy} r={2.6} fill={stroke} />
        </g>
      );
    }
    case "pressureSensor": {
      const bw = w - 8;
      return (
        <g>
          <line x1={w / 2} y1={h * 0.62} x2={w / 2} y2={h - 2} stroke={stroke} strokeWidth={sw + 1} />
          <rect x={4} y={4} width={bw} height={h * 0.58} rx={7} {...common} />
          {/* 膜片 */}
          <path d={`M 10 ${h * 0.44} C ${w * 0.35} ${h * 0.38} ${w * 0.65} ${h * 0.5} ${w - 10} ${h * 0.44}`} fill="none" stroke={stroke} strokeWidth={1.6} opacity={0.8} />
          {/* 电信号折线 */}
          <path d={`M 12 ${h * 0.22} L ${w * 0.38} ${h * 0.22} L ${w * 0.5} ${h * 0.12} L ${w * 0.62} ${h * 0.3} L ${w * 0.72} ${h * 0.22} L ${w - 12} ${h * 0.22}`} fill="none" stroke={stroke} strokeWidth={1.6} strokeLinejoin="round" opacity={0.85} />
        </g>
      );
    }
    case "pressureSwitch": {
      const r = Math.min(w, h * 0.72) / 2 - 3;
      const cx = w / 2;
      const cy = r + 4;
      return (
        <g>
          <line x1={cx} y1={cy + r} x2={cx} y2={h - 2} stroke={stroke} strokeWidth={sw + 1} />
          <circle cx={cx} cy={cy} r={r} {...common} />
          {/* 刻度 */}
          {[-135, -90, -45, 0].map((a) => {
            const rad = ((a - 90) * Math.PI) / 180;
            return (
              <line key={a} x1={cx + Math.cos(rad) * r * 0.78} y1={cy + Math.sin(rad) * r * 0.78} x2={cx + Math.cos(rad) * r * 0.92} y2={cy + Math.sin(rad) * r * 0.92} stroke={stroke} strokeWidth={1.4} opacity={0.8} />
            );
          })}
          <line x1={cx} y1={cy} x2={cx + r * 0.55} y2={cy - r * 0.5} stroke="#c94f3d" strokeWidth={2.2} strokeLinecap="round" />
          <circle cx={cx} cy={cy} r={2.6} fill={stroke} />
          {/* 电开关触点（右下） */}
          <circle cx={cx + r * 0.6} cy={cy + r * 0.6} r={2.4} fill="#3fae6a" stroke="none" />
          <path d={`M ${cx + r * 0.6 - 5} ${cy + r * 0.6} h 3.4 M ${cx + r * 0.6 + 1.6} ${cy + r * 0.6} h 3.4`} stroke="#3fae6a" strokeWidth={1.4} />
        </g>
      );
    }
    case "ntcProbe": {
      const cx = w / 2;
      return (
        <g>
          {/* 接线端 */}
          <rect x={cx - 7} y={2} width={14} height={14} rx={3} {...common} />
          {/* 六角螺母 */}
          <path d={`M ${cx - 13} ${h * 0.24} L ${cx + 13} ${h * 0.24} L ${cx + 13} ${h * 0.38} L ${cx - 13} ${h * 0.38} Z`} {...common} />
          <line x1={cx - 5} y1={h * 0.24} x2={cx - 5} y2={h * 0.38} stroke={stroke} strokeWidth={1.2} opacity={0.6} />
          <line x1={cx + 5} y1={h * 0.24} x2={cx + 5} y2={h * 0.38} stroke={stroke} strokeWidth={1.2} opacity={0.6} />
          {/* 探针杆 */}
          <path d={`M ${cx - 4.5} ${h * 0.38} L ${cx + 4.5} ${h * 0.38} L ${cx + 4.5} ${h - 8} Q ${cx + 4.5} ${h - 2} ${cx} ${h - 2} Q ${cx - 4.5} ${h - 2} ${cx - 4.5} ${h - 8} Z`} {...common} />
          {/* 感温点 */}
          <circle cx={cx} cy={h - 8} r={2.4} fill="#c94f3d" stroke="none" />
        </g>
      );
    }
    case "sensor": {
      return (
        <g>
          <rect x={2} y={2} width={w - 4} height={h - 4} rx={6} {...common} />
          {/* 传感器菱形标识 */}
          <path d={`M ${w / 2} ${h * 0.22} L ${w * 0.76} ${h / 2} L ${w / 2} ${h * 0.78} L ${w * 0.24} ${h / 2} Z`} fill="none" stroke={stroke} strokeWidth={1.8} />
          <circle cx={w / 2} cy={h / 2} r={4} fill={stroke} stroke="none" opacity={0.7} />
          {/* 左右信号箭头 */}
          <path d={`M 8 ${h / 2 - 5} L 4 ${h / 2} L 8 ${h / 2 + 5}`} fill="none" stroke={stroke} strokeWidth={1.4} strokeLinejoin="round" />
          <path d={`M ${w - 8} ${h / 2 - 5} L ${w - 4} ${h / 2} L ${w - 8} ${h / 2 + 5}`} fill="none" stroke={stroke} strokeWidth={1.4} strokeLinejoin="round" />
        </g>
      );
    }
    case "shape": {
      const v = node.variant ?? "rect";
      const bumpR = 7;
      const bumps = node.ports.map((p) => {
        const off = p.offset ?? 0.5;
        let bx: number, by: number, dx: number, dy: number;
        switch (p.position) {
          case "top":
            bx = w * off; by = 2; dx = 0; dy = -bumpR; break;
          case "bottom":
            bx = w * off; by = h - 2; dx = 0; dy = bumpR; break;
          case "left":
            bx = 2; by = h * off; dx = -bumpR; dy = 0; break;
          case "right":
            bx = w - 2; by = h * off; dx = bumpR; dy = 0; break;
        }
        const tipX = bx! + dx!;
        const tipY = by! + dy!;
        return { bx: bx!, by: by!, tipX, tipY, dx: dx!, dy: dy!, key: p.id, active: p.direction !== "bidirectional" };
      });
      return (
        <g>
          {/* 端口凸起先绘制在图形下层 */}
          {bumps.map((b) => (
            <g key={b.key}>
              <rect
                x={Math.min(b.bx, b.tipX)}
                y={Math.min(b.by, b.tipY)}
                width={Math.abs(b.dx) + 2}
                height={Math.abs(b.dy) + 2}
                rx={3}
                fill={node.fill}
                stroke={node.stroke}
                strokeWidth={1.8}
              />
              <circle cx={b.tipX} cy={b.tipY} r={3.5} fill={b.active ? "#3fae6a" : "#2f7fd6"} stroke="#fff" strokeWidth={1.2} />
            </g>
          ))}
          {v === "rect" && <rect x={2} y={2} width={w - 4} height={h - 4} rx={10} {...common} />}
          {v === "ellipse" && <ellipse cx={w / 2} cy={h / 2} rx={w / 2 - 2} ry={h / 2 - 2} {...common} />}
          {v === "diamond" && (
            <path d={`M ${w / 2} 2 L ${w - 2} ${h / 2} L ${w / 2} ${h - 2} L 2 ${h / 2} Z`} {...common} strokeLinejoin="round" />
          )}
          {v === "triangle" && (
            <path d={`M ${w / 2} 2 L ${w - 2} ${h - 2} L 2 ${h - 2} Z`} {...common} strokeLinejoin="round" />
          )}
          <CenterText node={node} w={w} h={h} />
        </g>
      );
    }
    case "label":
      return (
        <text x={w / 2} y={h / 2 + 5} textAnchor="middle" fontSize={16} fill={node.stroke} fontFamily="system-ui, sans-serif" fontWeight={500}>
          {node.label}
        </text>
      );
    case "arrow":
      return (
        <path
          d={`M 2 ${h * 0.36} L ${w * 0.62} ${h * 0.36} L ${w * 0.62} ${h * 0.12} L ${w - 2} ${h / 2} L ${w * 0.62} ${h - h * 0.12} L ${w * 0.62} ${h * 0.64} L 2 ${h * 0.64} Z`}
          fill={node.fill}
          stroke={node.stroke}
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
      );
    case "annotation":
      return (
        <g>
          {/* 阴影 */}
          <rect x={4} y={4} width={w - 4} height={h - 4} rx={8} fill="rgba(0,0,0,0.08)" stroke="none" />
          {/* 主体 */}
          <rect x={2} y={2} width={w - 4} height={h - 4} rx={8} fill={fill} stroke={stroke} strokeWidth={1.8} />
          {/* 折角标记 */}
          <path d={`M ${w - 18} 2 L ${w - 2} ${18} L ${w - 2} ${h - 4} Q ${w - 2} ${h - 2} ${w - 4} ${h - 2} L ${w - 18} ${h - 2} Z`} stroke="none" fill={stroke} opacity={0.06} />
          <text x={w / 2} y={h / 2 + 5} textAnchor="middle" fontSize={14} fill={stroke} fontFamily="system-ui, sans-serif" fontWeight={500} pointerEvents="none">
            {node.label}
          </text>
        </g>
      );
    case "image":
      return (
        <g>
          {/* 图片区域 */}
          {node.imageData ? (
            <image href={node.imageData} x={2} y={2} width={w - 4} height={h - 4} preserveAspectRatio="xMidYMid slice" />
          ) : (
            <>
              {/* 无图片占位 */}
              <rect x={2} y={2} width={w - 4} height={h - 4} rx={4} fill="#eef2f7" stroke="#b9c6d4" strokeWidth={1.8} strokeDasharray="6 4" />
              <text x={w / 2} y={h / 2 - 6} textAnchor="middle" fontSize={13} fill="#7a8794" fontFamily="system-ui, sans-serif">点击上传图片</text>
              <text x={w / 2} y={h / 2 + 14} textAnchor="middle" fontSize={11} fill="#9aa7b5" fontFamily="system-ui, sans-serif">或拖拽图片到此处</text>
            </>
          )}
        </g>
      );
  }
}
