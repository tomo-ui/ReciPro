import { describe, expect, it, vi } from 'vitest'
import { parseJsonLd } from '../api/_lib/jsonld'
import { parseHeuristic } from '../api/_lib/heuristic'
import { parseWithGemini } from '../api/_lib/gemini'
import { ParseError, parseRecipeHtml } from '../api/_lib/pipeline'
import { parseDurationMinutes, parseServings } from '../api/_lib/normalize'
import { assertPublicUrl, fetchHtml, isPrivateIp } from '../api/_lib/fetchHtml'

const URL_ = 'https://example.pl/przepisy/placki'

const ld = (json: unknown) =>
  `<html><head><title>x</title><script type="application/ld+json">${JSON.stringify(json)}</script></head><body></body></html>`

describe('normalize', () => {
  it('parsuje czasy ISO 8601', () => {
    expect(parseDurationMinutes('PT45M')).toBe(45)
    expect(parseDurationMinutes('PT1H30M')).toBe(90)
    expect(parseDurationMinutes('P0DT0H20M')).toBe(20)
    expect(parseDurationMinutes('P1DT2H')).toBe(1560)
    expect(parseDurationMinutes('PT0M')).toBeUndefined()
    expect(parseDurationMinutes('kiedyś')).toBeUndefined()
  })

  it('parsuje porcje', () => {
    expect(parseServings(4)).toBe(4)
    expect(parseServings('4 porcje')).toBe(4)
    expect(parseServings(['6', '6 servings'])).toBe(6)
    expect(parseServings('4-6')).toBe(4)
    expect(parseServings('kilka')).toBeUndefined()
  })
})

describe('warstwa 1: JSON-LD', () => {
  it('czyta Recipe z @graph, sekcje HowToSection, encje i względny obraz', () => {
    const html = ld({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebSite', name: 'Blog' },
        {
          '@type': ['Recipe'],
          name: 'Placki &amp; frytki',
          description: 'Chrupiące',
          image: [{ '@type': 'ImageObject', url: '/img/placki.jpg' }],
          recipeYield: ['4', '4 porcje'],
          prepTime: 'PT15M',
          cookTime: 'PT30M',
          keywords: 'Obiad, Szybkie',
          recipeCategory: ['danie główne'],
          recipeIngredient: ['1 kg ziemniaków', '2 jajka', '<b>sól</b>'],
          recipeInstructions: [
            {
              '@type': 'HowToSection',
              name: 'Ciasto',
              itemListElement: [
                { '@type': 'HowToStep', text: 'Zetrzyj ziemniaki.' },
                { '@type': 'HowToStep', text: 'Dodaj jajka.' },
              ],
            },
            { '@type': 'HowToStep', text: 'Smaż na złoto.' },
          ],
        },
      ],
    })
    const d = parseJsonLd(html, URL_)!
    expect(d.parse_method).toBe('json-ld')
    expect(d.title).toBe('Placki & frytki')
    expect(d.image_url).toBe('https://example.pl/img/placki.jpg')
    expect(d.servings).toBe(4)
    expect(d.total_minutes).toBe(45)
    expect(d.tags).toEqual(['obiad', 'szybkie', 'danie główne'])
    expect(d.ingredients.map((i) => i.text)).toEqual(['1 kg ziemniaków', '2 jajka', 'sól'])
    expect(d.steps).toEqual([
      { text: 'Zetrzyj ziemniaki.', group: 'Ciasto' },
      { text: 'Dodaj jajka.', group: 'Ciasto' },
      { text: 'Smaż na złoto.', group: undefined },
    ])
  })

  it('dzieli instrukcje podane jako jeden string na linie', () => {
    const d = parseJsonLd(
      ld({ '@type': 'Recipe', name: 'X', recipeIngredient: ['a', 'b'], recipeInstructions: 'Krok 1<br>Krok 2\nKrok 3' }),
      URL_,
    )!
    expect(d.steps.map((s) => s.text)).toEqual(['Krok 1', 'Krok 2', 'Krok 3'])
  })

  it('toleruje surowe nowe linie w JSON-ie i wiele bloków', () => {
    const html = `<script type="application/ld+json">{"@type":"Organization"}</script>
      <script type='application/ld+json'>{"@type":"Recipe","name":"Zupa","recipeIngredient":["woda"],"recipeInstructions":"Ugotuj\nPodaj"}</script>`
    const d = parseJsonLd(html, URL_)!
    expect(d.title).toBe('Zupa')
    expect(d.steps).toHaveLength(2)
  })

  it('zwraca null bez Recipe', () => {
    expect(parseJsonLd(ld({ '@type': 'Article', name: 'Blog' }), URL_)).toBeNull()
    expect(parseJsonLd('<html></html>', URL_)).toBeNull()
  })

  it('wybiera najbogatszy przepis, gdy jest ich kilka', () => {
    const html = ld([
      { '@type': 'Recipe', name: 'Powiązany', recipeIngredient: ['a'] },
      { '@type': 'Recipe', name: 'Główny', recipeIngredient: ['a', 'b', 'c'], recipeInstructions: ['1', '2'] },
    ])
    expect(parseJsonLd(html, URL_)!.title).toBe('Główny')
  })
})

describe('warstwa 2: heurystyki', () => {
  it('nagłówki „Składniki” / „Przygotowanie” z podnagłówkami jako grupami', () => {
    const html = `<html><head><title>Sernik | Blog</title><meta property="og:image" content="/s.jpg"></head><body>
      <nav><ul><li>Menu</li></ul></nav>
      <h1>Sernik na zimno</h1>
      <p>Przepis na 8 porcji.</p>
      <h2>Składniki</h2>
      <h3>Spód</h3>
      <ul><li>200 g herbatników</li><li>80 g masła</li></ul>
      <h3>Masa</h3>
      <ul><li>500 g twarogu</li></ul>
      <h2>Sposób przygotowania</h2>
      <p>Zmiksuj herbatniki z masłem.</p>
      <p>Wymieszaj twaróg z cukrem.</p>
      <h2>Komentarze</h2>
      <p>Świetny przepis, dziękuję bardzo!</p>
    </body></html>`
    const d = parseHeuristic(html, URL_)!
    expect(d.parse_method).toBe('heuristic')
    expect(d.title).toBe('Sernik na zimno')
    expect(d.image_url).toBe('https://example.pl/s.jpg')
    expect(d.servings).toBe(8)
    expect(d.ingredients).toEqual([
      { text: '200 g herbatników', group: 'Spód' },
      { text: '80 g masła', group: 'Spód' },
      { text: '500 g twarogu', group: 'Masa' },
    ])
    expect(d.steps.map((s) => s.text)).toEqual(['Zmiksuj herbatniki z masłem.', 'Wymieszaj twaróg z cukrem.'])
  })

  it('nagłówek w <strong> wewnątrz <p> i lista w rodzeństwie', () => {
    const html = `<body><h1>Naleśniki</h1>
      <div><p><strong>Składniki:</strong></p></div>
      <ul><li>250 g mąki</li><li>2 jajka</li></ul>
      <div><p><strong>Przygotowanie:</strong></p></div>
      <ol><li>Zmieszaj.</li><li>Usmaż.</li></ol></body>`
    const d = parseHeuristic(html, URL_)!
    expect(d.ingredients.map((i) => i.text)).toEqual(['250 g mąki', '2 jajka'])
    expect(d.steps.map((s) => s.text)).toEqual(['Zmieszaj.', 'Usmaż.'])
  })

  it('klasy CSS (wtyczki przepisów)', () => {
    const html = `<body><h1>Zupa</h1>
      <div class="recipe-card">
        <ul class="recipe-ingredients"><li>marchew</li><li>seler</li><li>woda</li></ul>
        <ol class="recipe-instructions"><li>Pokrój.</li><li>Gotuj 30 minut.</li></ol>
      </div></body>`
    const d = parseHeuristic(html, URL_)!
    expect(d.ingredients).toHaveLength(3)
    expect(d.steps.map((s) => s.text)).toEqual(['Pokrój.', 'Gotuj 30 minut.'])
  })

  it('microdata', () => {
    const html = `<body><div itemscope itemtype="https://schema.org/Recipe">
      <h1 itemprop="name">Omlet</h1>
      <meta itemprop="prepTime" content="PT5M"><span itemprop="recipeYield">2 porcje</span>
      <span itemprop="recipeIngredient">3 jajka</span><span itemprop="recipeIngredient">masło</span>
      <div itemprop="recipeInstructions"><p>Roztrzepać.</p><p>Usmażyć.</p></div></div></body>`
    const d = parseHeuristic(html, URL_)!
    expect(d.title).toBe('Omlet')
    expect(d.prep_minutes).toBe(5)
    expect(d.servings).toBe(2)
    expect(d.ingredients).toHaveLength(2)
    expect(d.steps).toHaveLength(2)
  })

  it('nie zmyśla przepisu ze zwykłej strony', () => {
    const html = `<body><h1>O nas</h1><ul><li>Kontakt</li><li>Blog</li></ul><p>Jesteśmy zespołem.</p></body>`
    expect(parseHeuristic(html, URL_)).toBeNull()
  })
})

describe('warstwa 3: Gemini', () => {
  const page = `<html><head><title>Bigos | Blog</title><meta property="og:image" content="https://cdn.pl/b.jpg"></head>
    <body><article><h1>Bigos</h1><p>${'Długi wstęp o bigosie. '.repeat(5)}</p></article></body></html>`

  const geminiReply = (payload: unknown, ok = true) =>
    vi.fn(async () =>
      ok
        ? new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }), { status: 200 })
        : new Response('quota', { status: 429 }),
    ) as unknown as typeof fetch

  it('mapuje odpowiedź modelu na RecipeDraft i wysyła klucz w nagłówku', async () => {
    const fetchImpl = geminiReply({
      is_recipe: true,
      title: 'Bigos staropolski',
      servings: 6,
      total_minutes: 180,
      ingredients: [{ text: '1 kg kapusty' }, { text: '500 g mięsa', group: 'Mięso' }],
      steps: [{ text: 'Duś kapustę.' }],
      tags: ['Obiad'],
    })
    const d = (await parseWithGemini(page, URL_, { apiKey: 'KEY', fetchImpl }))!
    expect(d.parse_method).toBe('gemini')
    expect(d.title).toBe('Bigos staropolski')
    expect(d.image_url).toBe('https://cdn.pl/b.jpg')
    expect(d.ingredients[1]).toEqual({ text: '500 g mięsa', group: 'Mięso' })

    const [calledUrl, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(calledUrl).toContain(':generateContent')
    expect(calledUrl).not.toContain('KEY') // klucz nie w URL-u
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('KEY')
  })

  it('is_recipe=false → null', async () => {
    const fetchImpl = geminiReply({ is_recipe: false })
    expect(await parseWithGemini(page, URL_, { apiKey: 'K', fetchImpl })).toBeNull()
  })

  it('błąd HTTP → GeminiError po wyczerpaniu prób', async () => {
    const fetchImpl = geminiReply({}, false) // 429
    await expect(parseWithGemini(page, URL_, { apiKey: 'K', fetchImpl, retryDelayMs: 0 })).rejects.toThrow(/429/)
    expect(fetchImpl).toHaveBeenCalledTimes(4) // 2 próby × (model główny + fallback)
  })

  it('przechodzi na model zapasowy, gdy główny jest przeciążony', async () => {
    const ok = { candidates: [{ content: { parts: [{ text: JSON.stringify({ is_recipe: true, title: 'Lite', ingredients: [{ text: 'a' }], steps: [{ text: 'b' }] }) }] } }] }
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('busy', { status: 503 }))
      .mockRejectedValueOnce(new DOMException('timeout', 'TimeoutError'))
      .mockResolvedValueOnce(new Response(JSON.stringify(ok), { status: 200 })) as unknown as typeof fetch
    const d = await parseWithGemini(page, URL_, { apiKey: 'K', fetchImpl, retryDelayMs: 0 })
    expect(d?.title).toBe('Lite')
    const urls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]))
    expect(urls[0]).toContain('models/gemini-flash-lite-latest:')
    expect(urls[2]).toContain('models/gemini-3.1-flash-lite:')
  })

  it('ponawia chwilowy 503 i kończy sukcesem', async () => {
    const ok = { candidates: [{ content: { parts: [{ text: JSON.stringify({ is_recipe: true, title: 'T', ingredients: [{ text: 'a' }], steps: [{ text: 'b' }] }) }] } }] }
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('busy', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(ok), { status: 200 })) as unknown as typeof fetch
    const d = await parseWithGemini(page, URL_, { apiKey: 'K', fetchImpl, retryDelayMs: 0 })
    expect(d?.title).toBe('T')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('nie ponawia błędów klienta (np. zły klucz 403)', async () => {
    const fetchImpl = vi.fn(async () => new Response('denied', { status: 403 })) as unknown as typeof fetch
    await expect(parseWithGemini(page, URL_, { apiKey: 'K', fetchImpl, retryDelayMs: 0 })).rejects.toThrow(/403/)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})

describe('pipeline', () => {
  const complete = ld({ '@type': 'Recipe', name: 'JSON-LD wygrywa', recipeIngredient: ['a'], recipeInstructions: ['b'] })

  it('kompletny JSON-LD kończy pipeline bez wołania Gemini', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch
    const d = await parseRecipeHtml(complete, URL_, { geminiApiKey: 'K', fetchImpl, geminiRetryDelayMs: 0 })
    expect(d.parse_method).toBe('json-ld')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('bez JSON-LD używa heurystyk', async () => {
    const html = `<body><h1>T</h1><h2>Składniki</h2><ul><li>a</li><li>b</li></ul><h2>Przygotowanie</h2><p>Zrób to.</p></body>`
    expect((await parseRecipeHtml(html, URL_)).parse_method).toBe('heuristic')
  })

  it('sięga po Gemini dopiero, gdy warstwy 1–2 zawiodą', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            candidates: [
              { content: { parts: [{ text: JSON.stringify({ is_recipe: true, title: 'AI', ingredients: [{ text: 'x' }], steps: [{ text: 'y' }] }) }] } },
            ],
          }),
        ),
    ) as unknown as typeof fetch
    const html = `<body><p>${'Przepis opisany zwykłym tekstem, bez struktury. '.repeat(5)}</p></body>`
    const d = await parseRecipeHtml(html, URL_, { geminiApiKey: 'K', fetchImpl, geminiRetryDelayMs: 0 })
    expect(d.parse_method).toBe('gemini')
  })

  it('bez klucza i bez przepisu → ParseError no_recipe', async () => {
    await expect(parseRecipeHtml('<body><p>nic</p></body>', URL_)).rejects.toMatchObject({ code: 'no_recipe' })
  })

  it('Gemini padło, ale mamy wynik częściowy → zwraca częściowy', async () => {
    const partial = ld({ '@type': 'Recipe', name: 'Bez kroków', recipeIngredient: ['a', 'b'] })
    const fetchImpl = vi.fn(async () => new Response('boom', { status: 500 })) as unknown as typeof fetch
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const d = await parseRecipeHtml(partial + `<body><p>${'x'.repeat(200)}</p></body>`, URL_, { geminiApiKey: 'K', fetchImpl, geminiRetryDelayMs: 0 })
    expect(d.title).toBe('Bez kroków')
    expect(d.steps).toHaveLength(0)
  })

  it('Gemini padło i nic nie ma → ai_failed', async () => {
    const fetchImpl = vi.fn(async () => new Response('boom', { status: 500 })) as unknown as typeof fetch
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const err = await parseRecipeHtml(`<body><p>${'x'.repeat(200)}</p></body>`, URL_, { geminiApiKey: 'K', fetchImpl, geminiRetryDelayMs: 0 }).catch((e) => e)
    expect(err).toBeInstanceOf(ParseError)
    expect(err.code).toBe('ai_failed')
  })
})

describe('SSRF / pobieranie', () => {
  it('rozpoznaje adresy prywatne', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) {
      expect(isPrivateIp(ip), ip).toBe(true)
    }
    for (const ip of ['8.8.8.8', '93.184.216.34', '172.32.0.1', '2606:4700::1111']) {
      expect(isPrivateIp(ip), ip).toBe(false)
    }
  })

  it('blokuje niebezpieczne URL-e', async () => {
    for (const u of ['file:///etc/passwd', 'http://localhost:3000', 'http://127.0.0.1', 'http://[::1]/', 'http://169.254.169.254/latest', 'http://user:pw@example.com', 'http://intranet.internal']) {
      await expect(assertPublicUrl(new URL(u)), u).rejects.toThrow()
    }
  })

  it('każdy hop przekierowania jest walidowany', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } })) as unknown as typeof fetch
    await expect(fetchHtml('http://8.8.8.8/', { fetchImpl })).rejects.toMatchObject({ code: 'blocked' })
  })

  it('odrzuca nie-HTML i zbyt duże strony', async () => {
    const json = vi.fn(async () => new Response('{}', { headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch
    await expect(fetchHtml('http://8.8.8.8/', { fetchImpl: json })).rejects.toMatchObject({ code: 'not_html' })

    const big = vi.fn(async () => new Response('a'.repeat(5000), { headers: { 'content-type': 'text/html' } })) as unknown as typeof fetch
    await expect(fetchHtml('http://8.8.8.8/', { fetchImpl: big, maxBytes: 1000 })).rejects.toMatchObject({ code: 'too_large' })
  })

  it('dekoduje windows-1250', async () => {
    const bytes = new Uint8Array([0x3c, 0x70, 0x3e, 0xa3, 0xf3, 0x64, 0xbf, 0x3c, 0x2f, 0x70, 0x3e]) // <p>Łódź</p> (ł=0xa3, ó=0xf3, ż=0xbf)
    const fetchImpl = vi.fn(async () => new Response(bytes, { headers: { 'content-type': 'text/html; charset=windows-1250' } })) as unknown as typeof fetch
    const { html } = await fetchHtml('http://8.8.8.8/', { fetchImpl })
    expect(html).toBe('<p>Łódż</p>')
  })
})
