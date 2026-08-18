export interface WelcomeAction {
  id: string;
  icon: string;
  title: string;
  desc: string;
}

export function WelcomePanel({
  onClose,
  onAction,
}: {
  onClose: () => void;
  onAction: (id: string) => void;
}) {
  const actions: WelcomeAction[] = [
    { id: "new", icon: "🆕", title: "新建空白", desc: "从零开始绘制液路图" },
    { id: "semi", icon: "☕", title: "半自动咖啡机", desc: "双锅炉 + OPV + 冲煮头实战模板" },
    { id: "full", icon: "🍵", title: "全自动商用咖啡机", desc: "定量供水 + 双锅炉 + 奶路" },
    { id: "open", icon: "📂", title: "打开 JSON", desc: "导入已有工程文件" },
    { id: "help", icon: "📖", title: "使用指南", desc: "分章节教学指引" },
  ];

  return (
    <div className="welcome-overlay">
      <div className="welcome-panel">
        <div className="welcome-hero">
          <svg width="72" height="72" viewBox="0 0 72 72">
            <rect x="2" y="2" width="68" height="68" rx="16" fill="#2f7fd6" />
            <path d="M20 46 h12 a8 8 0 0 0 8 -8 v-8" fill="none" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" />
            <path d="M40 30 h8 a8 8 0 0 1 8 8 v8" fill="none" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" opacity="0.6" />
            <circle cx="36" cy="30" r="5" fill="#ffffff" />
          </svg>
          <h1>FluidPath Studio</h1>
          <p>液路动态示意图 · 教学工作台</p>
          <p className="welcome-sub">绘制 · 仿真 · 讲解商用咖啡机等设备的液路原理</p>
        </div>

        <div className="welcome-actions">
          {actions.map((a) => (
            <button key={a.id} className="welcome-action" onClick={() => onAction(a.id)}>
              <span className="welcome-action-icon">{a.icon}</span>
              <div>
                <div className="welcome-action-title">{a.title}</div>
                <div className="welcome-action-desc">{a.desc}</div>
              </div>
            </button>
          ))}
        </div>

        <button className="welcome-skip" onClick={onClose}>直接进入工作台 →</button>
      </div>
    </div>
  );
}
