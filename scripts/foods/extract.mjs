// Krok 1/3 budowy bazy składników: wyciąga z USDA FoodData Central (SR Legacy, domena publiczna / CC0)
// listę produktów z wartościami odżywczymi na 100 g oraz wagami typowych porcji.
//
// Pobranie danych:
//   https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip
// Użycie: node scripts/foods/extract.mjs <katalog z rozpakowanymi CSV> <plik wyjściowy .json>
import { createReadStream } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { join } from 'node:path'

const [dir, out] = process.argv.slice(2)
if (!dir || !out) {
  console.error('Użycie: node scripts/foods/extract.mjs <katalog CSV> <wyjście.json>')
  process.exit(1)
}

/** Kolejność wartości w tablicy `n` (zapisana też w src/lib/nutrients.ts) */
export const NUTRIENT_IDS = [
  1008, // 0 energia kcal
  1003, // 1 białko g
  1004, // 2 tłuszcz g
  1005, // 3 węglowodany g
  2000, // 4 cukry g
  1079, // 5 błonnik g
  1258, // 6 tłuszcze nasycone g
  1093, // 7 sód mg
  1253, // 8 cholesterol mg
  1087, // 9 wapń mg
  1089, // 10 żelazo mg
  1090, // 11 magnez mg
  1092, // 12 potas mg
  1095, // 13 cynk mg
  1091, // 14 fosfor mg
  1103, // 15 selen µg
  1106, // 16 witamina A (RAE) µg
  1162, // 17 witamina C mg
  1114, // 18 witamina D µg
  1109, // 19 witamina E mg
  1185, // 20 witamina K µg
  1178, // 21 witamina B12 µg
  1175, // 22 witamina B6 mg
  1177, // 23 folian µg
]
const ENERGY_FALLBACK = [2047, 2048]

/** Parser jednej linii CSV z polami w cudzysłowach ("" = cudzysłów) */
function parseCsv(line) {
  const fields = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else quoted = false
      } else cur += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      fields.push(cur)
      cur = ''
    } else cur += ch
  }
  fields.push(cur)
  return fields
}

async function* rows(file) {
  const rl = createInterface({ input: createReadStream(join(dir, file), 'utf8'), crlfDelay: Infinity })
  let header
  for await (const line of rl) {
    if (!line) continue
    const f = parseCsv(line)
    if (!header) {
      header = f
      continue
    }
    yield Object.fromEntries(header.map((h, i) => [h, f[i]]))
  }
}

const categories = new Map()
for await (const r of rows('food_category.csv')) categories.set(r.id, r.description)

const foods = new Map()
for await (const r of rows('food.csv')) {
  foods.set(r.fdc_id, { id: Number(r.fdc_id), en: r.description.trim(), cat: categories.get(r.food_category_id) ?? '', n: new Array(NUTRIENT_IDS.length).fill(null), energy2: null, portions: [] })
}

const index = new Map(NUTRIENT_IDS.map((id, i) => [String(id), i]))
for await (const r of rows('food_nutrient.csv')) {
  const food = foods.get(r.fdc_id)
  if (!food) continue
  const i = index.get(r.nutrient_id)
  const amount = Number(r.amount)
  if (!Number.isFinite(amount)) continue
  if (i !== undefined) food.n[i] = amount
  else if (ENERGY_FALLBACK.includes(Number(r.nutrient_id)) && food.energy2 === null) food.energy2 = amount
}

// Wagi porcji: opis w `modifier`, np. "cup", "tbsp", "large", "slice"
const units = new Map()
for await (const r of rows('measure_unit.csv')) units.set(r.id, r.name)
for await (const r of rows('food_portion.csv')) {
  const food = foods.get(r.fdc_id)
  if (!food) continue
  const amount = Number(r.amount)
  const grams = Number(r.gram_weight)
  if (!(amount > 0) || !(grams > 0)) continue
  const label = `${units.get(r.measure_unit_id) ?? ''} ${r.modifier} ${r.portion_description}`.toLowerCase().trim()
  food.portions.push({ label, gramsPerUnit: grams / amount })
}

const list = [...foods.values()].map((f) => ({ ...f, n: f.n.map((v, i) => (i === 0 && v === null ? f.energy2 : v)) }))
for (const f of list) delete f.energy2
await writeFile(out, JSON.stringify(list))
const withKcal = list.filter((f) => f.n[0] !== null).length
console.log(`Produkty: ${list.length}, z kaloriami: ${withKcal}, z porcjami: ${list.filter((f) => f.portions.length).length}`)
