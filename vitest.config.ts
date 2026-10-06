import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Każdy test SQL stawia całą bazę (PGlite) i wykonuje wszystkie migracje dwa razy — przy równoległych plikach to trwa
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
})
