import { createClient } from '@supabase/supabase-js'

// Public project config for the thumbs-store Supabase project.
// These are the fallback values; environment variables (VITE_SUPABASE_URL /
// VITE_SUPABASE_ANON_KEY) override them when provided. Baking them into the
// source guarantees the app boots even on a host that doesn't inject the .env
// files at build time. The anon key is a *publishable* client key — it already
// ships in the browser bundle, so this is not a secret leak.
const FALLBACK_URL = 'https://udvbjvwavgrjwsziqtxl.supabase.co'
const FALLBACK_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkdmJqdndhdmdyandzemlxdHhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMxODczNjMsImV4cCI6MjA3ODc2MzM2M30.vMVho6zIi4jshNEG81yQ3-Je7lREoLflCANtPa0dGwc'

const url = import.meta.env.VITE_SUPABASE_URL || FALLBACK_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || FALLBACK_ANON_KEY

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
})

export const SUPABASE_URL = url
export const BRAND_BUCKET = 'brand-assets'

/** Public URL for a path inside the brand-assets bucket. */
export function storageUrl(path: string | null | undefined): string | null {
  return path ? `${url}/storage/v1/object/public/${BRAND_BUCKET}/${path}` : null
}
