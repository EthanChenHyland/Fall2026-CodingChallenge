import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RefreshCcw } from 'lucide-react'
import { BrandMark } from './BrandMark'

type Props = { children: ReactNode }
type State = { failed: boolean }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Mosaic UI crashed', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="crash-page">
        <BrandMark />
        <span className="eyebrow">MOSAIC HIT A SNAG</span>
        <h1>Your collections are still safe.</h1>
        <p>Reload the app to reconnect to your workspace.</p>
        <button className="primary-button" onClick={() => window.location.reload()}><RefreshCcw size={16} /> Reload Mosaic</button>
      </main>
    )
  }
}
