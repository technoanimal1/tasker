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
        <div className="grid min-h-screen place-items-center bg-[#0a0b0d] p-6 text-center">
          <div className="max-w-sm space-y-3">
            <p className="text-sm font-medium text-zinc-200">Something went wrong.</p>
            <p className="break-words text-xs text-zinc-500">{this.state.error.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-dark"
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
