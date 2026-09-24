// Wyciąga polskie produkty z eksportu Open Food Facts (CSV, ODbL) i zostawia najpopularniejsze.
// Dane: https://world.openfoodfacts.org/data  (plik en.openfoodfacts.org.products.csv.gz, ok. 1,3 GB)
// Użycie:
//   node scripts/foods/off-extract.mjs <wejście.csv> <wyjście.json> [limit]   (szybsze: czyta plik bezpośrednio)
//   curl -sL .../en.openfoodfacts.org.products.csv.gz | gunzip | node scripts/foods/off-extract.mjs <wyjście.json> [limit]
// Wersja plikowa jest dużo szybsza niż potok przez stdin (na Windows potoki między procesami są wolne);
// najpierw pobierz i rozpakuj: curl -sL <url> -o off.csv.gz && gunzip off.csv.gz
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { writeFile } from 'node:fs/promises'

const args = process.argv.slice(2)
const fileMode = args[0]?.toLowerCase().endsWith('.csv')
const [inFile, out, limitArg] = fileMode ? args : [undefined, args[0], args[1]]
if (!out) {
  console.error('Użycie: node scripts/foods/off-extract.mjs <wejście.csv> <wyjście.json> [limit]')
  console.error('   albo: ... | node scripts/foods/off-extract.mjs <wyjście.json> [limit]')
  process.exit(1)
}
const LIMIT = Number(limitArg) || 12000

// Kolumny OFF (g na 100 g) → indeks w tablicy `n` (kolejność z src/lib/nutrients.ts) i mnożnik na docelową jednostkę
const G = 1
const MG = 1000
const UG = 1_000_000
const COLUMNS = [
  ['energy-kcal_100g', 0, 1],
  ['proteins_100g', 1, G],
  ['fat_100g', 2, G],
  ['carbohydrates_100g', 3, G],
  ['sugars_100g', 4, G],
  ['fiber_100g', 5, G],
  ['saturated-fat_100g', 6, G],
  ['sodium_100g', 7, MG],
  ['cholesterol_100g', 8, MG],
  ['calcium_100g', 9, MG],
  ['iron_100g', 10, MG],
  ['magnesium_100g', 11, MG],
  ['potassium_100g', 12, MG],
  ['zinc_100g', 13, MG],
  ['phosphorus_100g', 14, MG],
  ['selenium_100g', 15, UG],
  ['vitamin-a_100g', 16, UG],
  ['vitamin-c_100g', 17, MG],
  ['vitamin-d_100g', 18, UG],
  ['vitamin-e_100g', 19, MG],
  ['vitamin-k_100g', 20, UG],
  ['vitamin-b12_100g', 21, UG],
  ['vitamin-b6_100g', 22, MG],
  ['vitamin-b9_100g', 23, UG],
]

// Miary jednej porcji (łyżka, łyżeczka, szklanka, sztuka…) — te same klucze co src/lib/foodDb.ts (PortionKey).
// Rozpoznajemy je z pola `serving_size` (np. „1 tbsp (15 g)”, „2 pieces (60 g)”, „0.25 cup (60 g)”):
// liczba na początku to ile sztuk tej miary waży `serving_quantity` gramów, więc gramy jednej sztuki = serving_quantity / liczba.
const PORTION_WORDS = [
  [/tbsp|tablespoon|łyżk(?!eczk)/, 't'],
  [/tsp|teaspoon|łyżeczk/, 's'],
  [/\bcup\b|szklank/, 'c'],
  [/slice|plaster/, 'sl'],
  [/clove|ząbe?k|zabe?k/, 'cl'],
  [/\bcan\b|puszk/, 'cn'],
  [/piece|cookie|bar\b|stick|packet|patty|sausage|scoop|sztuk/, 'pc'],
]
const SERVING_RE = /^\s*([\d.,]+)\s+([a-zżźćńółęąś .]+?)\s*\(/i

/** Miara jednej porcji z pól serving_size (tekst) i serving_quantity (gramy dla `count` sztuk z tekstu) */
function parsePortion(servingSize, servingQuantity) {
  const sq = Number(servingQuantity)
  if (!servingSize || !Number.isFinite(sq) || sq <= 0) return null
  const m = SERVING_RE.exec(servingSize)
  if (!m) return null
  const count = Number(m[1].replace(',', '.'))
  if (!Number.isFinite(count) || count <= 0) return null
  const word = m[2].toLowerCase()
  const hit = PORTION_WORDS.find(([re]) => re.test(word))
  if (!hit) return null
  const grams = sq / count
  if (grams < 0.1 || grams > 2000) return null
  return [hit[1], Math.round(grams * 100) / 100]
}

const rl = createInterface({ input: fileMode ? createReadStream(inFile, { highWaterMark: 4 * 1024 * 1024 }) : process.stdin, crlfDelay: Infinity })
let header
let idx = {}
const kept = []
const seen = new Set()
let lines = 0
let polish = 0
let withPortion = 0

const num = (s) => {
  if (s === undefined || s === '') return null
  const v = Number(s)
  return Number.isFinite(v) ? v : null
}
const norm = (s) => s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

for await (const line of rl) {
  if (!header) {
    header = line.split('\t')
    header.forEach((h, i) => (idx[h] = i))
    for (const c of ['code', 'product_name', 'brands', 'countries_tags', 'unique_scans_n', 'completeness', 'energy-kcal_100g', 'proteins_100g', 'fat_100g', 'carbohydrates_100g', 'serving_size', 'serving_quantity']) {
      if (idx[c] === undefined) throw new Error(`Brak kolumny ${c} w eksporcie`)
    }
    continue
  }
  if (++lines % 500_000 === 0) console.error(`${lines} linii, polskich produktów: ${polish}, wybranych: ${kept.length}`)
  const f = line.split('\t')
  if (!f[idx.countries_tags]?.includes('en:poland')) continue
  polish++

  const name = (f[idx.product_name] ?? '').trim()
  if (name.length < 3 || name.length > 90) continue
  const kcal = num(f[idx['energy-kcal_100g']])
  const protein = num(f[idx.proteins_100g])
  const fat = num(f[idx.fat_100g])
  const carbs = num(f[idx.carbohydrates_100g])
  if (kcal === null || protein === null || fat === null || carbs === null) continue
  if (kcal < 0 || kcal > 902 || protein > 100 || fat > 100 || carbs > 100 || protein + fat + carbs > 105) continue
  const code = Number(f[idx.code])
  if (!Number.isSafeInteger(code) || code <= 0) continue

  const brand = (f[idx.brands] ?? '').split(',')[0].trim().slice(0, 40)
  const key = `${norm(name)}|${norm(brand)}`
  if (seen.has(key)) continue
  seen.add(key)

  const n = new Array(COLUMNS.length).fill(0)
  for (const [col, i, mult] of COLUMNS) {
    const v = num(f[idx[col]])
    if (v !== null && v >= 0) n[i] = Math.round(v * mult * 100) / 100
  }
  // brak sodu, ale jest sól: sód = sól / 2,5
  if (n[7] === 0) {
    const salt = num(f[idx.salt_100g])
    if (salt) n[7] = Math.round((salt / 2.5) * MG * 100) / 100
  }
  const scans = num(f[idx.unique_scans_n]) ?? 0
  const completeness = num(f[idx.completeness]) ?? 0
  const portion = parsePortion(f[idx.serving_size], f[idx.serving_quantity])
  if (portion) withPortion++
  kept.push({ score: scans * 3 + completeness * 100, code, name, brand, n, portion })
}

kept.sort((a, b) => b.score - a.score)
const top = kept.slice(0, LIMIT).map((p) => [p.code, p.name, p.brand, p.n, p.portion ? { [p.portion[0]]: p.portion[1] } : 0])
await writeFile(out, JSON.stringify(top))
console.error(`Koniec: ${lines} linii, polskich: ${polish}, poprawnych: ${kept.length} (z miarą porcji: ${withPortion}), zapisano: ${top.length}`)
