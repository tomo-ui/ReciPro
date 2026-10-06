import type { SupabaseClient } from '@supabase/supabase-js'

const BUCKET = 'recipe-images'

/** Wszystkie pliki użytkownika (zdjęcia przepisów i awatar) leżą w folderze `<user_id>/` */
async function removeUserFiles(admin: SupabaseClient, userId: string, folder = userId): Promise<void> {
  const storage = admin.storage.from(BUCKET)
  for (;;) {
    const { data, error } = await storage.list(folder, { limit: 100 })
    if (error) throw new Error(`lista plików: ${error.message}`)
    if (!data || data.length === 0) return

    const files: string[] = []
    for (const entry of data) {
      // Wpis bez id to podfolder (obecnie ich nie tworzymy, ale sprzątamy też je)
      if (entry.id === null) await removeUserFiles(admin, userId, `${folder}/${entry.name}`)
      else files.push(`${folder}/${entry.name}`)
    }
    if (files.length === 0) return
    const { error: rmError } = await storage.remove(files)
    if (rmError) throw new Error(`usuwanie plików: ${rmError.message}`)
    if (data.length < 100) return
  }
}

/**
 * Trwale usuwa konto razem z danymi: pliki w Storage, nazwa autora w cudzych kopiach zapisanych przepisów,
 * a potem sam użytkownik Auth — resztę (profil, przepisy, komentarze, polubienia, obserwowanie, powiadomienia, diety,
 * zgody, blokady) kasują klucze obce z ON DELETE CASCADE. Błąd na którymkolwiek kroku przerywa operację przed
 * usunięciem konta, więc można ją bezpiecznie powtórzyć.
 */
export async function deleteUserAccount(admin: SupabaseClient, userId: string): Promise<void> {
  await removeUserFiles(admin, userId)

  // Cudze kopie zapisane z przepisów tego konta nie mogą zdradzać, kto był autorem (klucz obcy sam się zeruje)
  const { error: anonError } = await admin.from('recipes').update({ saved_from_username: null }).eq('saved_from_user_id', userId)
  if (anonError) throw new Error(`anonimizacja kopii: ${anonError.message}`)

  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) throw new Error(`usuwanie konta: ${error.message}`)
}
