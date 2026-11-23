import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  error: string | null;
}

/** Any render crash shows a recoverable screen instead of a blank panel. Data lives in IndexedDB, so a reload loses nothing. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(err: unknown): State {
    return { error: err instanceof Error ? err.message : String(err) };
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error("[OrionHUD] render error", err, info);
  }

  render() {
    if (this.state.error === null) return this.props.children;
    return (
      <div className="fatal">
        <strong>OrionHUD hit a snag</strong>
        <p>Your tasks and save points are stored safely. Reloading usually fixes this.</p>
        <code>{this.state.error}</code>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>
          Reload panel
        </button>
      </div>
    );
  }
}
