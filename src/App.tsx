import { AuthProvider, useAuth } from './hooks/useAuth'
import { AuthScreen } from './components/AuthScreen'
import { Dashboard } from './components/Dashboard'

function Gate() {
  const { session, loading } = useAuth()
  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center text-slate-400">
        <div className="animate-pulse text-sm">Loading…</div>
      </div>
    )
  }
  return session ? <Dashboard /> : <AuthScreen />
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}
