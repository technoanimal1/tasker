import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import './index.css'

// After a deploy the previous page can reference an asset chunk that no longer
// exists; reload once to pick up the fresh build instead of a blank screen.
window.addEventListener('vite:preloadError', () => window.location.reload())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
