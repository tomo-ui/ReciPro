import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Lokalnie `vite dev` nie uruchamia funkcji z /api (robi to Vercel).
 * Ten plugin montuje je jako middleware, żeby `npm run dev` działał bez `vercel dev`.
 */
function apiDevServer(): Plugin {
  return {
    name: 'api-dev-server',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
        const match = pathname.match(/^\/api\/([a-z0-9-]+)$/)
        if (!match) return next()

        try {
          const mod = await server.ssrLoadModule(`/api/${match[1]}.ts`)

          let raw = ''
          for await (const chunk of req) raw += chunk
          let body: unknown
          try {
            body = raw ? JSON.parse(raw) : undefined
          } catch {
            body = undefined
          }

          // Minimalna atrapa VercelResponse (status/json/setHeader)
          const vres = Object.assign(res, {
            status(code: number) {
              res.statusCode = code
              return vres
            },
            json(data: unknown) {
              res.setHeader('content-type', 'application/json')
              res.end(JSON.stringify(data))
              return vres
            },
          })
          await mod.default(Object.assign(req, { body }), vres)
        } catch (e) {
          console.error('[api-dev]', e)
          res.statusCode = 500
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: 'Błąd lokalnego serwera API.', code: 'internal' }))
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // Zmienne bez prefiksu VITE_ (np. GEMINI_API_KEY) tylko dla lokalnego API — nie trafiają do bundla
  const env = loadEnv(mode, process.cwd(), '')
  for (const key of ['GEMINI_API_KEY', 'GEMINI_MODEL', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']) {
    if (env[key]) process.env[key] = env[key]
  }

  return {
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    plugins: [
      react(),
      tailwindcss(),
      apiDevServer(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png'],
        manifest: {
          name: 'Przepisy',
          short_name: 'Przepisy',
          description: 'Twoja kolekcja przepisów kulinarnych',
          lang: 'pl',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#f2f2f7',
          theme_color: '#f2f2f7',
          icons: [
            { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
            { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
          globIgnores: ['splash/**'], // ekrany startowe czyta system, nie trzeba ich w cache
          // baza składników (~1,8 MB) też ma być dostępna offline
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          // /api/* zawsze idzie do sieci (serverless functions), nigdy do fallbacku SPA
          navigateFallbackDenylist: [/^\/api\//],
        },
        devOptions: { enabled: false },
      }),
    ],
    server: {
      // pozwala testować na telefonie w tej samej sieci
      host: true,
    },
  }
})
