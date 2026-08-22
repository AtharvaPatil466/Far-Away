import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /**
   * Render a compact inline card instead of taking over the viewport.
   *
   * Full-page takeover is right for an app-level failure and wrong for one row
   * of a timeline: during a live demo a single bad record should cost that row,
   * not the whole view. Inline boundaries let the operator keep moving.
   */
  inline?: boolean
  /** What failed, so the inline card names it rather than saying "something". */
  label?: string
}

interface State {
  error: Error | null
}

/**
 * App-level error boundary. Without one, a runtime error in any component
 * unmounts the entire React tree and the page goes black. This catches the
 * error, logs it, and renders a recoverable fallback card instead.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface to the console for debugging; never swallow silently.
    console.error('[ErrorBoundary] caught a render error:', error, info.componentStack)
  }

  handleReset = (): void => {
    this.setState({ error: null })
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    if (this.props.inline) {
      return (
        <div
          role="alert"
          style={{
            border: '1px solid currentColor', borderRadius: 4, padding: '0.5rem 0.7rem',
            font: '0.78rem ui-monospace, monospace', opacity: 0.85,
            display: 'flex', gap: '0.6rem', alignItems: 'baseline', flexWrap: 'wrap',
          }}
        >
          <strong>⚠ {this.props.label ?? 'this item'} failed to render</strong>
          <span style={{ opacity: 0.7 }}>{error.message}</span>
          <button
            type="button"
            onClick={this.handleReset}
            style={{ background: 'none', color: 'inherit', border: '1px solid currentColor',
                     borderRadius: 3, padding: '0.05rem 0.4rem', cursor: 'pointer', font: 'inherit' }}
          >
            retry
          </button>
        </div>
      )
    }

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0b0d10',
          color: '#e6e6e6',
          fontFamily: 'system-ui, sans-serif',
          padding: '2rem',
        }}
      >
        <div
          style={{
            maxWidth: 560,
            border: '1px solid #3a3f47',
            borderRadius: 12,
            padding: '1.75rem',
            background: '#14181d',
          }}
        >
          <div style={{ fontSize: 13, letterSpacing: 1, textTransform: 'uppercase', color: '#ff8a8a' }}>
            Console error
          </div>
          <h1 style={{ fontSize: 20, margin: '0.5rem 0 0.75rem' }}>Something rendered incorrectly</h1>
          <p style={{ color: '#9aa3ad', fontSize: 14, lineHeight: 1.5, margin: 0 }}>
            A component threw while rendering — the rest of the console is fine. Details below; use
            Retry to re-render.
          </p>
          <pre
            style={{
              marginTop: '1rem',
              padding: '0.75rem',
              background: '#0b0d10',
              borderRadius: 8,
              fontSize: 12,
              color: '#ff9c9c',
              overflowX: 'auto',
              whiteSpace: 'pre-wrap',
            }}
          >
            {error.message}
          </pre>
          <button
            onClick={this.handleReset}
            style={{
              marginTop: '1rem',
              padding: '0.5rem 1rem',
              borderRadius: 8,
              border: '1px solid #3a3f47',
              background: '#1f262d',
              color: '#e6e6e6',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            Retry
          </button>
        </div>
      </div>
    )
  }
}
