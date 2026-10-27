import { useEffect, useRef } from "react";

/**
 * 底部动作条：用于「可撤销」类反馈（整理管路）与「待确认」类操作（重排预览）。
 * 与 toast 的区别：它有按钮、可停留更久、同一时间只有一条，避免多条整理提示叠在一起。
 */
export function ActionBar(props: {
  message: string;
  detail?: string;
  actionLabel?: string;
  onAction?: () => void;
  onClose: () => void;
  /** 毫秒；0 表示不自动关闭（等待用户决策） */
  timeout?: number;
  tone?: "info" | "warn";
  testId?: string;
}) {
  const { message, detail, actionLabel, onAction, onClose, timeout = 8000, tone = "info", testId } = props;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!timeout) return;
    const timer = window.setTimeout(() => closeRef.current(), timeout);
    return () => window.clearTimeout(timer);
  }, [timeout, message]);

  return (
    <div className={`action-bar action-bar-${tone}`} data-ui="1" role="status" aria-live="polite" data-testid={testId}>
      <div className="action-bar-text">
        <span className="action-bar-msg">{message}</span>
        {detail && <span className="action-bar-detail">{detail}</span>}
      </div>
      {actionLabel && onAction && (
        <button type="button" className="btn primary mini" onClick={onAction}>{actionLabel}</button>
      )}
      <button type="button" className="btn ghost mini" onClick={onClose} aria-label="关闭">×</button>
    </div>
  );
}
