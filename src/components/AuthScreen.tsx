import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

type Mode = 'signin' | 'signup'

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setNotice(null)
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        if (!data.session) {
          setNotice('Check your inbox to confirm your email, then sign in.')
          setMode('signin')
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-2 inline-flex items-center gap-2 text-2xl font-semibold">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand text-white">◧</span>
            Design Studio
          </div>
          <p className="text-sm text-slate-400">thumbs.store — scalable client design system</p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl">
          <div className="mb-5 flex rounded-lg bg-slate-800 p-1 text-sm">
            <button
              type="button"
              onClick={() => setMode('signin')}
              className={`flex-1 rounded-md py-1.5 transition ${mode === 'signin' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => setMode('signup')}
              className={`flex-1 rounded-md py-1.5 transition ${mode === 'signup' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}
            >
              Sign up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@studio.com"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Password</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}
            {notice && <p className="text-sm text-emerald-400">{notice}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-brand py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
            >
              {loading ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
