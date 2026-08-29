import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/** class 组件无法用 hook：从 localStorage 直接读取当前语言（与 i18n.tsx 的存储 key 一致） */
function currentLang(): "zh" | "en" {
  try { return localStorage.getItem("fluidpath.lang") === "zh" ? "zh" : "en"; } catch { return "en"; }
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      const lang = currentLang();
      const title = lang === "zh" ? "⚠️ 发生错误" : "⚠️ Something went wrong";
      const retry = lang === "zh" ? "重试" : "Retry";
      return (
        this.props.fallback ?? (
          <div style={{
            padding: 32,
            fontFamily: "system-ui, sans-serif",
            color: "#2b3644",
            textAlign: "center",
            marginTop: 60
          }}>
            <h2 style={{ color: "#d64545", marginBottom: 12 }}>{title}</h2>
            <pre style={{
              background: "#f4f7fb",
              padding: 16,
              borderRadius: 8,
              fontSize: 13,
              maxWidth: 600,
              margin: "0 auto",
              overflow: "auto"
            }}>{this.state.error?.message}</pre>
            <button
              style={{ marginTop: 20, padding: "8px 20px", cursor: "pointer" }}
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              {retry}
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
