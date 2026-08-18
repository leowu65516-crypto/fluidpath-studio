import { useEffect, useRef } from "react";

interface MenuItem {
  label: string;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** 分隔线 */
  divider?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // 延时一帧，避免触发自身的右键
    setTimeout(() => document.addEventListener("mousedown", handle), 0);
    return () => document.removeEventListener("mousedown", handle);
  }, [onClose]);

  // 边界碰撞修正
  const mx = Math.min(x, window.innerWidth - 180);
  const my = Math.min(y, window.innerHeight - items.length * 32 - 16);

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        left: mx,
        top: my,
        zIndex: 9999,
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        boxShadow: "0 4px 16px rgba(0,0,0,0.16)",
        padding: "4px 0",
        minWidth: 150,
        fontSize: 13,
        fontFamily: "system-ui, -apple-system, sans-serif",
        color: "var(--text)",
      }}
    >
      {items.map((item, i) =>
        item.divider ? (
          <div key={i} style={{ height: 1, background: "var(--border)", margin: "4px 8px" }} />
        ) : (
          <div
            key={i}
            onClick={() => { if (!item.disabled && item.onClick) { item.onClick(); onClose(); } }}
            style={{
              padding: "6px 16px",
              cursor: item.disabled ? "default" : "pointer",
              opacity: item.disabled ? 0.35 : 1,
              color: item.danger ? "var(--danger)" : "var(--text)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
            onMouseEnter={(e) => { if (!item.disabled) (e.currentTarget as HTMLElement).style.background = "var(--surface-2)"; }}
            onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = "transparent"}
          >
            {item.label}
          </div>
        )
      )}
    </div>
  );
}
