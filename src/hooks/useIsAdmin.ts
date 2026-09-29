import { useEffect, useState } from 'react'
import { backend } from '@/lib/data'

/** Czy zalogowany jest adminem (tabela app_admins) — gate widoczności panelu admina w Ustawieniach */
export function useIsAdmin(): boolean {
  const [isAdmin, setIsAdmin] = useState(false)
  useEffect(() => {
    let alive = true
    backend
      .isAdmin()
      .then((v) => alive && setIsAdmin(v))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  return isAdmin
}
