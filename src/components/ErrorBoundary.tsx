import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
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
      return (
        this.props.fallback ?? (
          <div style={{
            padding: 32,
            fontFamily: "system-ui, sans-serif",
            color: "#2b3644",
            textAlign: "center",
            marginTop: 60
          }}>
            <h2 style={{ color: "#d64545", marginBottom: 12 }}>⚠️ 发生错误</h2>
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
              重试
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
