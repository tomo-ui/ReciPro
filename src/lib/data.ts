import type { Backend } from './backend'
import { localBackend } from './localBackend'
import { usesSupabase } from './supabase'
import { supabaseBackend } from './supabaseBackend'

/** Wybór backendu — jedyne miejsce w aplikacji. Bez Supabase (albo w trybie `?demo=1`) działa tryb lokalny. */
export { usesSupabase }
export const backend: Backend = usesSupabase ? supabaseBackend : localBackend
