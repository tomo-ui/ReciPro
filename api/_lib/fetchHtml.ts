import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

export type FetchErrorCode = 'invalid_url' | 'blocked' | 'timeout' | 'http_error' | 'not_html' | 'too_large' | 'network'

export class FetchError extends Error {
  constructor(
    public code: FetchErrorCode,
    message: string,
    public status?: number,
  ) {
    super(message)
    this.name = 'FetchError'
  }
}

/** Zakresy prywatne/lokalne/link-local/metadata — cel ataku SSRF */
export function isPrivateIp(ip: string): boolean {
  const v = isIP(ip)
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number)
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // CGNAT
      (a === 169 && b === 254) || // link-local + metadata chmur
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224 // multicast + zarezerwowane
    )
  }
  if (v === 6) {
    const s = ip.toLowerCase()
    const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return isPrivateIp(mapped[1])
    return (
      s === '::' ||
      s === '::1' ||
      /^f[cd]/.test(s) || // fc00::/7 unique local
      /^fe[89ab]/.test(s) || // fe80::/10 link-local
      s.startsWith('ff') // multicast
    )
  }
  return true // nie-IP nie powinno tu trafić
}

/** Dopuszcza wyłącznie http(s) na publiczne adresy (sprawdza też rozwiązany DNS) */
export async function assertPublicUrl(url: URL): Promise<void> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new FetchError('invalid_url', 'Dozwolone są tylko adresy http/https.')
  }
  if (url.username || url.password) throw new FetchError('invalid_url', 'Adres nie może zawierać danych logowania.')

  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) {
    throw new FetchError('blocked', 'Ten adres jest niedozwolony.')
  }
  if (isIP(host)) {
    if (isPrivateIp(host)) throw new FetchError('blocked', 'Ten adres jest niedozwolony.')
    return
  }
  try {
    const addrs = await lookup(host, { all: true })
    if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) {
      throw new FetchError('blocked', 'Ten adres jest niedozwolony.')
    }
  } catch (e) {
    if (e instanceof FetchError) throw e
    throw new FetchError('network', 'Nie znaleziono takiej strony.')
  }
}

function pickCharset(contentType: string | null, head: Uint8Array): string {
  const fromHeader = contentType?.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1]
  if (fromHeader) return fromHeader
  // Polskie strony wciąż bywają w windows-1250 / iso-8859-2 — sprawdzamy <meta charset>
  const sniff = new TextDecoder('latin1').decode(head)
  return sniff.match(/<meta[^>]+charset\s*=\s*["']?([\w-]+)/i)?.[1] ?? 'utf-8'
}

function decodeBody(bytes: Uint8Array, contentType: string | null): string {
  const charset = pickCharset(contentType, bytes.subarray(0, 2048))
  try {
    return new TextDecoder(charset).decode(bytes)
  } catch {
    return new TextDecoder('utf-8').decode(bytes)
  }
}

export async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array()
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw new FetchError('too_large', 'Strona jest zbyt duża.')
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let off = 0
  for (const c of chunks) {
    out.set(c, off)
    off += c.byteLength
  }
  return out
}

export interface FetchHtmlOptions {
  timeoutMs?: number
  maxBytes?: number
  maxRedirects?: number
  fetchImpl?: typeof fetch
  /** Nadpisuje domyślne nagłówki (np. user-agent robota podglądów linków) */
  headers?: Record<string, string>
}

/**
 * Pobiera HTML strony. Przekierowania idą ręcznie, żeby każdy hop przeszedł
 * walidację SSRF. (Zostaje wąskie okno DNS-rebinding między lookup a fetch —
 * akceptowalne dla funkcji bez dostępu do sieci wewnętrznej.)
 */
export async function fetchHtml(
  rawUrl: string,
  { timeoutMs = 8000, maxBytes = 2_000_000, maxRedirects = 4, fetchImpl = fetch, headers }: FetchHtmlOptions = {},
): Promise<{ html: string; finalUrl: string }> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new FetchError('invalid_url', 'To nie jest poprawny adres URL.')
  }

  const deadline = AbortSignal.timeout(timeoutMs)

  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertPublicUrl(url)

    let res: Response
    try {
      res = await fetchImpl(url, {
        redirect: 'manual',
        signal: deadline,
        headers: {
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
          accept: 'text/html,application/xhtml+xml',
          'accept-language': 'pl,en;q=0.8',
          ...headers,
        },
      })
    } catch (e) {
      if ((e as Error).name === 'TimeoutError' || (e as Error).name === 'AbortError') {
        throw new FetchError('timeout', 'Strona odpowiadała zbyt długo.')
      }
      throw new FetchError('network', 'Nie udało się połączyć ze stroną.')
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location')
      if (!loc) throw new FetchError('http_error', 'Strona zwróciła błędne przekierowanie.', res.status)
      url = new URL(loc, url)
      continue
    }
    if (!res.ok) {
      throw new FetchError('http_error', `Strona zwróciła błąd ${res.status}.`, res.status)
    }

    const type = res.headers.get('content-type')
    if (type && !/html|xml/i.test(type)) {
      throw new FetchError('not_html', 'Ten adres nie prowadzi do strony internetowej.')
    }
    const len = Number(res.headers.get('content-length'))
    if (len > maxBytes) throw new FetchError('too_large', 'Strona jest zbyt duża.')

    try {
      const bytes = await readCapped(res, maxBytes)
      return { html: decodeBody(bytes, type), finalUrl: url.href }
    } catch (e) {
      if (e instanceof FetchError) throw e
      throw new FetchError('timeout', 'Strona odpowiadała zbyt długo.')
    }
  }
  throw new FetchError('http_error', 'Zbyt wiele przekierowań.')
}
