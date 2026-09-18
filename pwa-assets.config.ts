import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// `npm run generate-pwa-assets` generuje z public/logo.svg:
// favicon.ico, pwa-64/192/512, maskable-icon-512, apple-touch-icon-180
export default defineConfig({
  preset: {
    ...minimal2023Preset,
    // iOS nie lubi przezroczystości — tło pod apple-touch-icon
    apple: {
      ...minimal2023Preset.apple,
      resizeOptions: { background: '#ff6b35', fit: 'contain' },
    },
    maskable: {
      ...minimal2023Preset.maskable,
      resizeOptions: { background: '#ff6b35', fit: 'contain' },
    },
  },
  images: ['public/logo.svg'],
})
