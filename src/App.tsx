import { AuthProvider, useAuth } from './hooks/useAuth'
import { AuthScreen } from './components/AuthScreen'
import { Dashboard } from './components/Dashboard'
import { Spinner } from './components/Spinner'

function Gate() {
  const { session, loading } = useAuth()
  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center text-zinc-400">
        <Spinner size={28} />
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
