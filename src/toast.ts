/** 轻量非阻塞提示条（替代 alert 用于非致命通知） */

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
    window.setTimeout(() => el.remove(), 320);
  }, 3200);
}
