import { Component, type ReactNode } from 'react'

/**
 * Catches render/runtime errors anywhere in the tree and shows a reload prompt
 * instead of a blank screen. Also the natural place to surface the error text.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    // Surface for debugging; the boundary UI handles the user-facing part.
    console.error('App crashed:', error)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="grid min-h-screen place-items-center bg-page p-6 text-center">
          <div className="max-w-sm space-y-3">
            <p className="text-sm font-medium text-white">Something went wrong.</p>
            <p className="break-words text-xs text-dim">{this.state.error.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="rounded-pill bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-yellow"
            >
              Reload
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
