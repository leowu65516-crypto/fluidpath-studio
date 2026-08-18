import { useEffect, useRef, useState } from "react";

/**
 * 应用内文本输入弹窗（Electron 不支持 window.prompt，统一用它替代）。
 * 支持单行（输入名）与多行（粘贴分享码）。
 */
export function PromptDialog(props: {
  title: string;
  label?: string;
  defaultValue?: string;
  multiline?: boolean;
  placeholder?: string;
  submitLabel?: string;
  onSubmit: (text: string) => void;
  onClose: () => void;
}) {
  const { title, label, defaultValue = "", multiline = false, placeholder, submitLabel = "确定", onSubmit, onClose } = props;
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select?.();
  }, []);

  function submit() {
    const t = value.trim();
    if (t) onSubmit(t);
    onClose();
  }

  return (
    <div className="prompt-overlay" data-ui="1" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="prompt-dialog">
        <div className="prompt-title">{title}</div>
        {label && <div className="prompt-label">{label}</div>}
        {multiline ? (
          <textarea
            ref={(el) => { inputRef.current = el; }}
            value={value}
            placeholder={placeholder}
            rows={4}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(); }}
          />
        ) : (
          <input
            ref={(el) => { inputRef.current = el; }}
            value={value}
            placeholder={placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") onClose(); }}
          />
        )}
        <div className="prompt-actions">
          <button className="btn" onClick={submit}>{submitLabel}</button>
          <button className="btn ghost" onClick={onClose}>取消</button>
        </div>
      </div>
    </div>
  );
}
