// Wyciąga polskie produkty z eksportu Open Food Facts (CSV, ODbL) i zostawia najpopularniejsze.
// Dane: https://world.openfoodfacts.org/data  (plik en.openfoodfacts.org.products.csv.gz, ok. 1,3 GB)
// Użycie (strumieniowo, bez zapisu całego pliku):
//   curl -sL https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz | gunzip | node scripts/foods/off-extract.mjs <wyjście.json> [limit]
import { createInterface } from 'node:readline'
import { writeFile } from 'node:fs/promises'

const [out, limitArg] = process.argv.slice(2)
if (!out) {
  console.error('Użycie: ... | node scripts/foods/off-extract.mjs <wyjście.json> [limit]')
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

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity })
let header
let idx = {}
const kept = []
const seen = new Set()
let lines = 0
let polish = 0

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
    for (const c of ['code', 'product_name', 'brands', 'countries_tags', 'unique_scans_n', 'completeness', 'energy-kcal_100g', 'proteins_100g', 'fat_100g', 'carbohydrates_100g']) {
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
  kept.push({ score: scans * 3 + completeness * 100, code, name, brand, n })
}

kept.sort((a, b) => b.score - a.score)
const top = kept.slice(0, LIMIT).map((p) => [p.code, p.name, p.brand, p.n])
await writeFile(out, JSON.stringify(top))
console.error(`Koniec: ${lines} linii, polskich: ${polish}, poprawnych: ${kept.length}, zapisano: ${top.length}`)
