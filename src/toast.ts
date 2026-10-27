/** 轻量非阻塞提示条（替代 alert 用于非致命通知） */
import { MOTION } from "./motion";

let container: HTMLDivElement | null = null;

export function toast(message: string, kind: "info" | "error" = "info") {
  if (typeof document === "undefined") return;
  if (!container) {
    container = document.createElement("div");
    container.className = "fp-toast-container";
    document.body.appendChild(container);
  }
  const el = document.createElement("div");
  el.className = `fp-toast fp-toast-${kind}`;
  el.textContent = message;
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  window.setTimeout(() => {
    el.classList.remove("show");
    // 与 CSS 的退出过渡共用同一令牌，避免「已淡出但仍占位」的空档
    window.setTimeout(() => el.remove(), MOTION.slow);
  }, 3200);
}
