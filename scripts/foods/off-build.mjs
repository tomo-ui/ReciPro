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

// Górne granice sensownej wartości na 100 g (kolejność jak w src/lib/nutrients.ts) — powyżej tego to błąd źródła
// (pomylone jednostki, literówka w eksporcie itp.), więc taką pojedynczą wartość traktujemy jako brakującą (0),
// zamiast wyrzucać cały, poza tym poprawny produkt. Progi z zapasem ponad najbardziej skoncentrowane produkty
// (oleje, przyprawy, suplementy), nie zwykłe dzienne racje.
const CAPS = [
  902, 100, 100, 100, 100, 100, 100, // kcal, protein, fat, carbs, sugars, fiber, satfat (g/100g, już capowane wcześniej)
  40000, // sód (mg) — czysta sól ≈ 39 300 mg/100 g
  3100, // cholesterol (mg) — proszek z żółtek ≈ 2600
  3000, // wapń (mg)
  200, // żelazo (mg)
  1000, // magnez (mg)
  5000, // potas (mg)
  100, // cynk (mg)
  2000, // fosfor (mg)
  5000, // selen (µg)
  30000, // witamina A (µg) — tran ≈ 30 000
  3000, // witamina C (mg) — proszek z dzikiej róży ≈ 2000
  250, // witamina D (µg) — tran ≈ 250
  150, // witamina E (mg) — olej z kiełków pszenicy ≈ 150
  1500, // witamina K (µg)
  100, // witamina B12 (µg)
  50, // witamina B6 (mg)
  3000, // kwas foliowy (µg)
]
const clampNutrients = (n) => n.map((v, i) => (Number.isFinite(v) && v >= 0 && v <= (CAPS[i] ?? Infinity) ? v : 0))

const products = raw
  .map(([code, name, brand, n, p]) => [code, sentence(tidy(name)), tidy(brand), clampNutrients(n), p || 0])
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
