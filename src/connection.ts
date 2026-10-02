import type { Diagram } from "./types";
import { findPort } from "./geometry";

export type ConnectionError = "missing-port" | "same-port" | "same-node" | "both-in" | "both-out" | "occupied";

/** 新建管路和重连端点共用同一规则；游离端点可省略其中一个端口。 */
export function validatePipeConnection(
  diagram: Diagram,
  fromPortId?: string,
  toPortId?: string,
  currentPipeId?: string
): ConnectionError | null {
  if (!fromPortId && !toPortId) return "missing-port";
  if (fromPortId && fromPortId === toPortId) return "same-port";
  const from = fromPortId ? findPort(diagram.nodes, fromPortId) : null;
  const to = toPortId ? findPort(diagram.nodes, toPortId) : null;
  if ((fromPortId && !from) || (toPortId && !to)) return "missing-port";
  if (from && to && from.node.id === to.node.id) return "same-node";
  if (from && to && from.port.direction === "in" && to.port.direction === "in") return "both-in";
  if (from && to && from.port.direction === "out" && to.port.direction === "out") return "both-out";
  if (diagram.pipes.some((pipe) => pipe.id !== currentPipeId && [fromPortId, toPortId].some((id) => id && (pipe.fromPortId === id || pipe.toPortId === id)))) {
    return "occupied";
  }
  return null;
}

export function connectionErrorMessage(error: ConnectionError, lang: "zh" | "en"): string {
  const messages: Record<ConnectionError, [string, string]> = {
    "missing-port": ["端口不存在，请重新选择端口。", "Port not found. Select another port."],
    "same-port": ["不能连接同一个端口。", "A port cannot connect to itself."],
    "same-node": ["不能连接同一元件的两个端口。", "Cannot connect two ports on the same component."],
    "both-in": ["两个入口不能直连：至少一端应为出口（out）", "Two inlet ports cannot be connected directly."],
    "both-out": ["两个出口不能直连：下游应为入口（in）", "Two outlet ports cannot be connected directly."],
    occupied: ["此端口已被占用，请使用三通接头（T型/Y型）进行分路。", "This port is already used — split with a tee (T/Y) fitting."],
  };
  return messages[error][lang === "en" ? 1 : 0];
}
