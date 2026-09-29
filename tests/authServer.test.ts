import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { emailForUsername, isForeignOrigin } from '../api/_lib/supabaseServer'

/** Atrapa klienta service_role: tylko to, czego używa emailForUsername (from().select().eq().maybeSingle() + auth.admin.getUserById) */
function fakeAdmin(profileId: string | null, email: string | null): SupabaseClient {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: profileId ? { id: profileId } : null }),
        }),
      }),
    }),
    auth: {
      admin: {
        getUserById: async () =>
          email ? { data: { user: { email } }, error: null } : { data: { user: null }, error: { message: 'not found' } },
      },
    },
  } as unknown as SupabaseClient
}

describe('emailForUsername (api/login.ts, api/forgot-password.ts)', () => {
  it('zwraca e-mail dla istniejącego profilu, niezależnie od wielkości liter', async () => {
    const admin = fakeAdmin('user-1', 'anna@example.com')
    expect(await emailForUsername(admin, 'Anna_Gotuje')).toBe('anna@example.com')
  })

  it('zwraca null dla nieznanej nazwy użytkownika (bez wyjątku)', async () => {
    const admin = fakeAdmin(null, null)
    expect(await emailForUsername(admin, 'nie.ma.takiego')).toBeNull()
  })

  it('zwraca null, gdy profil istnieje, ale konto Auth już nie (niespójne dane)', async () => {
    const admin = fakeAdmin('user-1', null)
    expect(await emailForUsername(admin, 'anna_gotuje')).toBeNull()
  })

  it('pusta/białoznakowa nazwa nie woła bazy i zwraca null', async () => {
    const admin = fakeAdmin('user-1', 'anna@example.com')
    expect(await emailForUsername(admin, '   ')).toBeNull()
  })
})

describe('isForeignOrigin (ochrona endpointów /api/login, /api/forgot-password przed obcymi stronami)', () => {
  it('przepuszcza ten sam host', () => {
    expect(isForeignOrigin('https://recipro.app', 'recipro.app')).toBe(false)
  })

  it('odrzuca inny host', () => {
    expect(isForeignOrigin('https://zla-strona.pl', 'recipro.app')).toBe(true)
  })

  it('brak nagłówka Origin przepuszcza (żądania spoza przeglądarki, np. curl)', () => {
    expect(isForeignOrigin(undefined, 'recipro.app')).toBe(false)
  })

  it('nieprawidłowy Origin jest odrzucany', () => {
    expect(isForeignOrigin('nie-adres-url', 'recipro.app')).toBe(true)
  })
})
