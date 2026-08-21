import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { withDefaults, type Template, type TemplateParams } from '../lib/thumb'

export function useTemplate() {
  const [template, setTemplate] = useState<Template | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from('thumb_templates')
      .select('*')
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data) {
      setTemplate({ ...(data as Template), params: withDefaults((data as Template).params) })
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const save = useCallback(
    async (params: TemplateParams) => {
      if (!template) return
      await supabase
        .from('thumb_templates')
        .update({ params, updated_at: new Date().toISOString() })
        .eq('id', template.id)
      setTemplate((t) => (t ? { ...t, params } : t))
    },
    [template],
  )

  return { template, loading, refresh, save }
}
