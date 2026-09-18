import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useRecipes } from '@/hooks/useRecipes'
import { useSession } from '@/hooks/useSession'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { spring } from '@/lib/ui'
import { Sheet } from '@/components/Sheet'
import { RecipeListScreen } from '@/screens/RecipeListScreen'
import { RecipeDetailScreen } from '@/screens/RecipeDetailScreen'
import { AddRecipeScreen } from '@/screens/AddRecipeScreen'
import { LoginScreen } from '@/screens/LoginScreen'

export default function App() {
  const session = useSession()

  if (isSupabaseConfigured) {
    if (session === undefined) return <div className="fixed inset-0 bg-bg" /> // sprawdzamy zapisaną sesję
    if (!session) return <LoginScreen />
  }

  // key = użytkownik: po zmianie konta stan biblioteki startuje od zera
  return (
    <Library
      key={session?.user.id ?? 'local'}
      onSignOut={isSupabaseConfigured ? () => supabase?.auth.signOut() : undefined}
    />
  )
}

function Library({ onSignOut }: { onSignOut?: () => void }) {
  const { recipes, loading, error, reload, add, remove } = useRecipes()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const selected = recipes.find((r) => r.id === selectedId) ?? null

  return (
    <div className="fixed inset-0 overflow-hidden bg-bg">
      {/* Lista „cofa się” w lewo pod ekran szczegółów — paralaksa jak w UINavigationController */}
      <motion.div
        className="h-full"
        animate={{ x: selected ? '-28%' : 0, opacity: selected ? 0.6 : 1 }}
        transition={spring}
      >
        <RecipeListScreen
          recipes={recipes}
          loading={loading}
          error={error}
          onRetry={reload}
          onOpen={setSelectedId}
          onAdd={() => setAdding(true)}
          onSignOut={onSignOut}
        />
      </motion.div>

      <AnimatePresence>
        {selected && (
          <RecipeDetailScreen
            key={selected.id}
            recipe={selected}
            onBack={() => setSelectedId(null)}
            onDelete={async () => {
              try {
                await remove(selected.id)
                setSelectedId(null)
              } catch (e) {
                alert(e instanceof Error ? e.message : 'Nie udało się usunąć przepisu.')
              }
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {adding && (
          <Sheet key="add" onClose={() => setAdding(false)}>
            <AddRecipeScreen onClose={() => setAdding(false)} onSave={add} />
          </Sheet>
        )}
      </AnimatePresence>
    </div>
  )
}
