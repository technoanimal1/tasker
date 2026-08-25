import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

export type Role = 'designer' | 'client'

/** Loads the signed-in user's role. Defaults to 'client' when unknown. */
export function useProfile() {
  const { session } = useAuth()
  const [role, setRole] = useState<Role | null>(null)

  useEffect(() => {
    let alive = true
    if (!session) {
      setRole(null)
      return
    }
    supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (alive) setRole((data?.role as Role) ?? 'client')
      })
    return () => {
      alive = false
    }
  }, [session])

  return { role, isDesigner: role === 'designer', loading: role === null }
}
