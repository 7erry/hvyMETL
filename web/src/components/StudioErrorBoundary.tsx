import { Component, type ErrorInfo, type ReactNode } from 'react';

type StudioErrorBoundaryProps = {
  children: ReactNode;
  /** Short label for the panel that failed (shown in the fallback). */
  label: string;
};

type StudioErrorBoundaryState = {
  error: Error | null;
};

/** Catches render errors in a sidebar/canvas panel so one failure does not blank the whole app. */
export class StudioErrorBoundary extends Component<StudioErrorBoundaryProps, StudioErrorBoundaryState> {
  state: StudioErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): StudioErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[${this.props.label}]`, error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="panel studio-error-boundary" role="alert">
          <strong>{this.props.label} failed to render</strong>
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', opacity: 0.9 }}>
            {this.state.error.message}
          </p>
          <button
            type="button"
            className="secondary"
            style={{ marginTop: '0.65rem' }}
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
