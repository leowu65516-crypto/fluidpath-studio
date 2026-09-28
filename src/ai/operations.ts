import type { Diagram, DiagramNode, NodeType, Pipe } from "../types";
import { FLUID_PRESETS, uid } from "../types";
import { NODE_DEFS, createNode } from "../symbols";
import { EMPTY_PROFILE, parseDiagnosticProfile } from "../fault-codes/profile";

/** Safe, bounded editor for v3 diagrams; this is not the complete v4 semantic protocol or a fluid solver. */
export const AI_PROTOCOL_VERSION = "0.2-draft" as const;
export const AI_TARGET_SCHEMA_VERSION: number = 3;
export const AI_CATALOG_VERSION = "fluidpath-legacy-catalog/1" as const;
export const AI_TYPES: NodeType[] = ["inlet", "outlet", "pump", "milkPump", "airPump", "solenoid2", "solenoid3", "pulseAirValve", "checkValve", "safetyValve", "flowMeter", "pressureGauge", "metalFilter", "hotWaterBoiler", "steamBoiler", "brewChamber", "coffeeOutlet", "hotWaterOutlet", "hotWaterWand", "steamWand", "milkOutlet", "tank", "tee", "teeF", "shape"];
export interface AiPlan {
  requestId: string;
  baseHash: string;
  diagram: Diagram;
  addedNodes: string[];
  addedPipes: string[];
  changes: string[];
}
export async function diagramFingerprint(diagram: Diagram): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(diagram));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}
function obj(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected an object");
  return value as Record<string, unknown>;
}
function keys(o: Record<string, unknown>, allowed: string[]) {
  for (const k of Object.keys(o)) if (!allowed.includes(k)) throw new Error(`Unsupported field: ${k}`);
}
function text(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 500) throw new Error(`Invalid ${name}`);
  return value;
}
function reference(value: unknown, mapping: Map<string, string>): string { const id = text(value, "reference"); return mapping.get(id) ?? id; }

export function aiCatalog() {
  return AI_TYPES.map(type => {
    const def = NODE_DEFS.find(d => d.type === type)!;
    return { type, ports: def.ports.map((p, i) => ({ key: `P${i + 1}`, capability: p.direction ?? "bidirectional", position: p.position })) };
  });
}

export async function compileAiOperations(json: string, current: Diagram): Promise<AiPlan> {
  if (json.length > 250_000) throw new Error("AI request exceeds 250 KB");
  const request = obj(JSON.parse(json));
  keys(request, ["protocol", "protocolVersion", "targetSchemaVersion", "catalogVersion", "requestId", "base", "intent", "operations"]);
  if (request.protocol !== "fluidpath.ai-operations" || request.protocolVersion !== AI_PROTOCOL_VERSION || request.targetSchemaVersion !== AI_TARGET_SCHEMA_VERSION || request.catalogVersion !== AI_CATALOG_VERSION) throw new Error("Unsupported protocol, diagram schema or catalog version");
  const requestId = text(request.requestId, "requestId");
  if (current.settings.aiAppliedRequestIds?.includes(requestId)) throw new Error("This request was already applied");
  const base = obj(request.base); keys(base, ["diagramSha256"]);
  const baseHash = await diagramFingerprint(current);
  if (base.diagramSha256 !== baseHash) throw new Error("The drawing changed. Generate a new request for the current snapshot");
  if (!Array.isArray(request.operations) || request.operations.length < 1 || request.operations.length > 200) throw new Error("Expected 1–200 operations");
  const diagram = structuredClone(current), nodeMap = new Map<string, string>(), pipeMap = new Map<string, string>();
  const addedNodes: string[] = [], addedPipes: string[] = [], changes: string[] = [];
  const left = diagram.nodes.length ? Math.max(...diagram.nodes.map(n => n.x + n.width)) + 200 : 100;
  const occupied = new Set(diagram.pipes.flatMap(p => [p.fromPortId, p.toPortId].filter((x): x is string => !!x)));
  function nodeAt(ref: unknown): DiagramNode {
    const node = diagram.nodes.find(n => n.id === reference(ref, nodeMap));
    if (!node) throw new Error(`Unknown component: ${String(ref)}`);
    return node;
  }
  function portAt(raw: unknown) {
    const endpoint = obj(raw); keys(endpoint, ["component", "port"]);
    const node = nodeAt(endpoint.component), portRef = text(endpoint.port, "port");
    // Permanent IDs on existing nodes; catalog-stable P1/P2 keys only on this request's new nodes.
    const port = addedNodes.includes(node.id) && /^P\d+$/.test(portRef) ? node.ports[Number(portRef.slice(1)) - 1] : node.ports.find(p => p.id === portRef);
    if (!port) throw new Error(`Unknown port ${portRef} on ${node.id}`);
    return { node, port };
  }
  for (const [i, raw] of request.operations.entries()) {
    const op = obj(raw);
    try {
      if (op.op === "addComponent") {
        keys(op, ["op", "tempId", "type", "label", "layout"]);
        const tempId = text(op.tempId, "tempId");
        if (nodeMap.has(tempId) || diagram.nodes.some(n => n.id === tempId) || pipeMap.has(tempId)) throw new Error("Duplicate temporary ID");
        if (!AI_TYPES.includes(op.type as NodeType)) throw new Error("Unregistered component type");
        const layout = op.layout === undefined ? { column: addedNodes.length % 5, row: Math.floor(addedNodes.length / 5) } : obj(op.layout);
        keys(layout, ["column", "row"]);
        for (const dimension of ["column", "row"]) if (typeof layout[dimension] !== "number" || !Number.isInteger(layout[dimension]) || (layout[dimension] as number) < 0 || (layout[dimension] as number) > 40) throw new Error("Layout requires column/row from 0 to 40");
        const label = op.label === undefined ? undefined : text(op.label, "label");
        if (label && diagram.nodes.some((n) => n.label.trim().toLowerCase() === label.trim().toLowerCase())) throw new Error("Duplicate component label");
        const node = createNode(op.type as NodeType, left + (layout.column as number) * 240, 120 + (layout.row as number) * 260, label);
        if (diagram.nodes.some(n => n.x === node.x && n.y === node.y)) throw new Error("Overlapping layout cells");
        nodeMap.set(tempId, node.id); diagram.nodes.push(node); addedNodes.push(node.id); changes.push(`+ ${node.label} (${node.type})`);
      } else if (op.op === "connectPorts") {
        keys(op, ["op", "tempId", "from", "to", "declaredMedium"]);
        const tempId = text(op.tempId, "tempId");
        if (pipeMap.has(tempId) || nodeMap.has(tempId) || diagram.pipes.some(p => p.id === tempId)) throw new Error("Duplicate temporary ID");
        const from = portAt(op.from), to = portAt(op.to);
        if (from.node.id === to.node.id || occupied.has(from.port.id) || occupied.has(to.port.id)) throw new Error("Port occupied or self-connection; insert a junction to branch");
        if (from.port.direction === "in" || to.port.direction === "out") throw new Error("Declared connection contradicts port capability; no implicit direction override");
        const medium = FLUID_PRESETS.find(f => f.key === op.declaredMedium);
        if (!medium) throw new Error("Declare a registered medium; do not infer one from color");
        const pipe: Pipe = { id: uid("pipe"), label: `Pipe ${diagram.pipes.length + 1}`, fromPortId: from.port.id, toPortId: to.port.id, points: [], nominalDiameter: "", visualDiameter: 10, wallColor: "#5b6b7d", fluidColor: medium.color, fluidOpacity: .92, direction: "forward", flowSpeed: 1.2, particleDensity: "medium", animated: true, showArrow: true, fluidType: medium.key, declaredMedium: medium.key, material: "custom", wallOpacity: 1, routing: "orthogonal" };
        diagram.pipes.push(pipe); pipeMap.set(tempId, pipe.id); addedPipes.push(pipe.id); occupied.add(from.port.id); occupied.add(to.port.id);
        changes.push(`+ ${from.node.label} → ${to.node.label} (${medium.key})`);
      } else if (op.op === "setComponentProperty") {
        keys(op, ["op", "component", "label"]);
        const node = nodeAt(op.component), nextLabel = text(op.label, "label");
        if (diagram.nodes.some((n) => n.id !== node.id && n.label.trim().toLowerCase() === nextLabel.trim().toLowerCase())) throw new Error("Duplicate component label");
        node.label = nextLabel; changes.push(`label: ${node.id} → ${node.label}`);
      } else if (op.op === "setOperatingCondition") {
        keys(op, ["op", "component", "state"]);
        const node = nodeAt(op.component), state = obj(op.state); keys(state, ["pumpOn", "valveState", "valvePath"]);
        if (!Object.keys(state).length) throw new Error("Empty operating state");
        if (state.pumpOn !== undefined && (typeof state.pumpOn !== "boolean" || !["pump", "milkPump", "airPump"].includes(node.type))) throw new Error("Invalid pump state");
        if (state.valveState !== undefined && (!["open", "closed"].includes(String(state.valveState)) || !["solenoid2", "pulseAirValve"].includes(node.type))) throw new Error("Invalid two-port valve state");
        if (state.valvePath !== undefined && (!["A", "B", "off"].includes(String(state.valvePath)) || node.type !== "solenoid3")) throw new Error("Invalid three-port valve state");
        Object.assign(node, state); changes.push(`state: ${node.label} ${JSON.stringify(state)}`);
      } else if (op.op === "defineFaultCode") {
        keys(op, ["op", "code", "label", "targets"]);
        const code = text(op.code, "code"), label = obj(op.label); keys(label, ["zh", "en"]);
        if (typeof label.zh !== "string" || typeof label.en !== "string") throw new Error("Bilingual label required");
        const targets = obj(op.targets); keys(targets, ["components", "pipes"]);
        if (!Array.isArray(targets.components) || !Array.isArray(targets.pipes)) throw new Error("Explicit target arrays required");
        const nodes = targets.components.map(ref => nodeAt(ref).id);
        const pipes = targets.pipes.map(ref => reference(ref, pipeMap));
        if (pipes.some(id => !diagram.pipes.some(p => p.id === id))) throw new Error("Unknown pipe target");
        const profile = diagram.settings.diagnosticProfile ?? structuredClone(EMPTY_PROFILE), groupId = uid("circuit");
        profile.highlightGroups.push({ id: groupId, label: { zh: label.zh, en: label.en }, resolution: "explicit", nodeIds: [...new Set(nodes)], pipeIds: [...new Set(pipes)] });
        profile.diagnostics.push({ id: uid("fault"), code, label: { zh: label.zh, en: label.en }, definitionStatus: "userDeclared", highlightBindings: [{ groupId, meaning: "inspectionScope" }], presentation: { style: "outline", color: "#d97706", animation: "none" }, controlActions: [], rootCauseStatus: "notDetermined" });
        diagram.settings.diagnosticProfile = parseDiagnosticProfile(profile); changes.push(`+ ${code} (${nodes.length} / ${pipes.length})`);
      } else throw new Error(`Unsupported operation: ${String(op.op)}`);
    } catch (error) { throw new Error(`operations[${i}]: ${(error as Error).message}`); }
  }
  // Persist request IDs so save/reopen and window copy cannot replay the same request accidentally.
  diagram.settings.aiAppliedRequestIds = [...(diagram.settings.aiAppliedRequestIds ?? []), requestId];
  if (diagram.settings.aiAppliedRequestIds.length > 10000) throw new Error("AI request history limit exceeded");
  return { requestId, baseHash, diagram, addedNodes, addedPipes, changes };
}

export async function aiExample(diagram: Diagram) {
  return {
    protocol: "fluidpath.ai-operations", protocolVersion: AI_PROTOCOL_VERSION, targetSchemaVersion: AI_TARGET_SCHEMA_VERSION,
    catalogVersion: AI_CATALOG_VERSION, requestId: uid("request"), base: { diagramSha256: await diagramFingerprint(diagram) },
    intent: "Add a simple supply circuit with an editable inspection code",
    operations: [
      { op: "addComponent", tempId: "supply", type: "inlet" },
      { op: "addComponent", tempId: "pump", type: "pump" },
      { op: "addComponent", tempId: "valve", type: "solenoid2" },
      { op: "addComponent", tempId: "outlet", type: "outlet" },
      { op: "connectPorts", tempId: "feed", from: { component: "supply", port: "P1" }, to: { component: "pump", port: "P1" }, declaredMedium: "coldWater" },
      { op: "connectPorts", tempId: "delivery", from: { component: "pump", port: "P2" }, to: { component: "valve", port: "P1" }, declaredMedium: "coldWater" },
      { op: "connectPorts", tempId: "drain", from: { component: "valve", port: "P2" }, to: { component: "outlet", port: "P1" }, declaredMedium: "coldWater" },
      { op: "defineFaultCode", code: "DEMO-SUPPLY", label: { zh: "供水回路排查示例", en: "Supply inspection example" }, targets: { components: ["supply", "pump", "valve"], pipes: ["feed", "delivery"] } },
    ],
  };
}
