// Składa plik z polskimi produktami Open Food Facts dla aplikacji (src/data/off-products.json).
// Użycie: node scripts/foods/off-build.mjs <off-raw.json z off-extract.mjs> <wyjście, np. src/data/off-products.json>
import { readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'

const [rawFile, out] = process.argv.slice(2)
if (!rawFile || !out) {
  console.error('Użycie: node scripts/foods/off-build.mjs <off-raw.json> <wyjście.json>')
  process.exit(1)
}

const raw = JSON.parse(readFileSync(rawFile, 'utf8'))
// Czyścimy nazwy: zbędne spacje, wielokrotne kropki; pierwsza litera wielka
const tidy = (s) => s.replace(/\s+/g, ' ').replace(/^[\s.,;:-]+|[\s.,;:-]+$/g, '')
// NAZWY WERSALIKAMI zamieniamy na zwykłe zdanie
const sentence = (s) => (s === s.toUpperCase() && /[A-ZĄĆĘŁŃÓŚŹŻ]/.test(s) ? s.charAt(0) + s.slice(1).toLowerCase() : s)
const products = raw
  .map(([code, name, brand, n]) => [code, sentence(tidy(name)), tidy(brand), n])
  .filter(([, name]) => name.length >= 3)

await writeFile(
  out,
  JSON.stringify({
    v: 1,
    source: 'Open Food Facts (https://world.openfoodfacts.org), licencja bazy ODbL 1.0; zawartość rekordów: DbCL 1.0.',
    // kolejność wartości w n[]: patrz src/lib/nutrients.ts
    products,
  }),
)
console.log(`Zapisano ${products.length} produktów do ${out}`)
