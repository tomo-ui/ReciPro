// Krok 2/3: tłumaczy angielskie nazwy produktów USDA na polski (Gemini), wznawialnie.
// Wynik: plik JSON { "<fdc_id>": "polska nazwa" }. Klucz GEMINI_API_KEY z .env (tylko lokalnie, nigdzie nie trafia).
// Użycie: node scripts/foods/translate.mjs <raw.json z extract.mjs> <plik z tłumaczeniami .json>
import { existsSync, readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'

const [rawFile, outFile] = process.argv.slice(2)
if (!rawFile || !outFile) {
  console.error('Użycie: node scripts/foods/translate.mjs <raw.json> <tłumaczenia.json>')
  process.exit(1)
}

const env = Object.fromEntries(
  existsSync('.env')
    ? readFileSync('.env', 'utf8')
        .split(/\r?\n/)
        .map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/))
        .filter(Boolean)
        .map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')])
    : [],
)
const KEY = process.env.GEMINI_API_KEY ?? env.GEMINI_API_KEY
const MODELS = (process.env.FOODS_MODELS ?? 'gemini-flash-lite-latest,gemini-3.1-flash-lite,gemini-3.5-flash-lite').split(',')
if (!KEY) throw new Error('Brak GEMINI_API_KEY w .env')

const foods = JSON.parse(readFileSync(rawFile, 'utf8'))
const done = existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf8')) : {}
const todo = foods.filter((f) => !done[f.id])
const BATCH = 60
const CONCURRENCY = 3

const SYSTEM = `You translate USDA food descriptions into Polish for a cooking app.
- Translate each description into natural Polish, keeping the comma-separated structure ("Egg, whole, raw, fresh" -> "Jajko, całe, surowe, świeże").
- Use the everyday Polish name of the ingredient first (e.g. "Mąka pszenna", "Masło", "Pierś z kurczaka"), then the qualifiers.
- Keep brand names as they are. Keep units and numbers. Do not add explanations.
- Return exactly one entry per input id.`

const schema = {
  type: 'ARRAY',
  items: { type: 'OBJECT', properties: { id: { type: 'INTEGER' }, pl: { type: 'STRING' } }, required: ['id', 'pl'] },
}

async function callGemini(items, model) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: JSON.stringify(items.map((f) => ({ id: f.id, en: f.en }))) }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.1 },
    }),
  })
  if (!res.ok) throw Object.assign(new Error(`${model}: HTTP ${res.status}`), { status: res.status, body: (await res.text()).slice(0, 300) })
  const json = await res.json()
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
  return JSON.parse(text)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let modelIdx = 0
let saved = 0

async function translateBatch(items) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const model = MODELS[modelIdx % MODELS.length]
    try {
      const out = await callGemini(items, model)
      let ok = 0
      for (const r of out) {
        if (typeof r.pl === 'string' && r.pl.trim() && items.some((f) => f.id === r.id)) {
          done[r.id] = r.pl.trim()
          ok++
        }
      }
      return ok
    } catch (e) {
      if (e.status === 429 || e.status === 404) modelIdx++ // kolejny model z listy
      const wait = Math.min(60_000, 2000 * 2 ** attempt)
      console.warn(`  próba ${attempt + 1}: ${e.message} ${e.body ?? ''} — czekam ${Math.round(wait / 1000)} s`)
      await sleep(wait)
    }
  }
  return 0
}

const batches = []
for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH))
console.log(`Do przetłumaczenia: ${todo.length} produktów w ${batches.length} paczkach (już gotowe: ${Object.keys(done).length})`)

let next = 0
async function worker() {
  while (next < batches.length) {
    const b = batches[next++]
    const ok = await translateBatch(b)
    saved += ok
    await writeFile(outFile, JSON.stringify(done))
    console.log(`paczka ${next}/${batches.length}: ${ok}/${b.length}, łącznie ${Object.keys(done).length}`)
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker))
console.log(`Koniec. Przetłumaczone: ${Object.keys(done).length}/${foods.length}`)
