export const PROVIDER_ID = 'searxng-local';
export const DEFAULTS = Object.freeze({
  baseURL: 'http://127.0.0.1:8888',
  maxResults: 8,
  language: '',
  engines: '',
  timeoutMs: 15000,
});

export class SearxngError extends Error {
  constructor(message, code, cause) {
    super(message, { cause });
    this.name = 'SearxngError';
    this.code = code;
  }
}

export function normalizeOptions(options = {}) {
  const config = { ...DEFAULTS, ...options };
  let base;
  try {
    base = new URL(config.baseURL);
  } catch {
    throw new SearxngError('SearXNG Base URL must be a valid HTTP(S) URL.', 'SEARXNG_CONFIG_ERROR');
  }
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
    throw new SearxngError('SearXNG Base URL must use HTTP(S) without credentials, a query, or a fragment.', 'SEARXNG_CONFIG_ERROR');
  }
  if (/\/search\/?$/.test(base.pathname)) {
    throw new SearxngError('SearXNG Base URL must point to the instance root without /search.', 'SEARXNG_CONFIG_ERROR');
  }
  for (const [field, min, max] of [['maxResults', 1, 50], ['timeoutMs', 100, 120000]]) {
    if (!Number.isInteger(config[field]) || config[field] < min || config[field] > max) {
      throw new SearxngError(field + ' must be an integer between ' + min + ' and ' + max + '.', 'SEARXNG_CONFIG_ERROR');
    }
  }
  for (const field of ['language', 'engines']) {
    if (typeof config[field] !== 'string') {
      throw new SearxngError(field + ' must be a string.', 'SEARXNG_CONFIG_ERROR');
    }
  }
  config.baseURL = base.href.replace(/\/+$/, '');
  config.language = config.language.trim();
  config.engines = config.engines.trim();
  return config;
}

function plainText(value) {
  if (typeof value !== 'string') return undefined;
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  const text = value
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<\/?[a-z][^>]*>/gi, ' ')
    .replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (original, entity) => {
      if (entity[0] !== '#') return entities[entity.toLowerCase()] ?? original;
      const hex = entity[1].toLowerCase() === 'x';
      const code = parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
        ? String.fromCodePoint(code) : original;
    })
    .replace(/\s+/g, ' ').trim();
  return text || undefined;
}

export function mapResults(results, limit) {
  const sources = [];
  const seen = new Set();
  for (const row of results) {
    if (!row || typeof row !== 'object' || typeof row.url !== 'string') continue;
    let url;
    try { url = new URL(row.url); } catch { continue; }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) continue;
    const citationURL = url.href;
    url.hash = '';
    if (seen.has(url.href)) continue;
    seen.add(url.href);
    const title = plainText(row.title);
    const snippet = plainText(row.content);
    sources.push({
      url: citationURL,
      ...(title ? { title } : {}),
      ...(snippet ? { snippet, summary: snippet } : {}),
    });
  }
  return { sources: sources.slice(0, limit), truncated: sources.length > limit };
}

/** A provider compatible with ctx.web; this module also runs on standalone Node. */
export function createSearchProvider(getOptions = () => DEFAULTS, dependencies = {}) {
  const requestFetch = dependencies.fetch ?? globalThis.fetch;
  const error = dependencies.makeError ?? ((message, code, cause) => new SearxngError(message, code, cause));
  return {
    id: PROVIDER_ID,
    title: 'SearXNG (Local)',
    description: { en: 'Search through your configured SearXNG instance without an API key.', ja: '指定した SearXNG を使って検索します。API キーは不要です。' },
    available() {
      try { normalizeOptions(getOptions()); return true; } catch { return false; }
    },
    async search(request, signal) {
      let config;
      try { config = normalizeOptions(getOptions()); }
      catch (cause) { throw error(cause.message, 'SEARXNG_CONFIG_ERROR', cause); }
      if (!request || typeof request.query !== 'string' || !request.query.trim()) {
        throw error('Search query must be a non-empty string.', 'SEARXNG_INVALID_QUERY');
      }
      if (signal?.aborted) throw error('SearXNG search was cancelled.', 'WEB_ABORTED', signal.reason);
      const requested = request.maxResults ?? config.maxResults;
      if (!Number.isInteger(requested) || requested < 0) throw error('maxResults must be a non-negative integer.', 'SEARXNG_INVALID_QUERY');
      const limit = Math.min(config.maxResults, requested);
      if (limit === 0) return { sources: [], truncated: false };
      const url = new URL(config.baseURL + '/search');
      url.searchParams.set('q', request.query);
      url.searchParams.set('format', 'json');
      if (config.language) url.searchParams.set('language', config.language);
      if (config.engines) url.searchParams.set('engines', config.engines);
      const timeout = AbortSignal.timeout(config.timeoutMs);
      const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
      try {
        const response = await requestFetch(url, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          redirect: 'error',
          signal: combined,
        });
        if (!response.ok) {
          await response.body?.cancel();
          const hint = response.status === 403
            ? ' Check that SearXNG search.formats includes json.' : '';
          throw error('SearXNG returned HTTP ' + response.status + '.' + hint, 'WEB_PROVIDER_ERROR');
        }
        let body;
        try { body = await response.json(); }
        catch (cause) {
          if (combined.aborted) throw cause;
          throw error('SearXNG did not return valid JSON. Check the instance URL and search.formats.', 'SEARXNG_INVALID_RESPONSE', cause);
        }
        if (!body || !Array.isArray(body.results)) {
          throw error('SearXNG response is missing the results array. Check the instance URL.', 'SEARXNG_INVALID_RESPONSE');
        }
        return mapResults(body.results, limit);
      } catch (cause) {
        if (signal?.aborted) throw error('SearXNG search was cancelled.', 'WEB_ABORTED', cause);
        if (timeout.aborted) throw error('SearXNG search timed out.', 'SEARXNG_TIMEOUT', cause);
        if (typeof cause?.code === 'string' && /^(WEB_|SEARXNG_)/.test(cause.code)) throw cause;
        throw error('Could not connect to SearXNG at ' + config.baseURL + '. Check that the instance is running.', 'WEB_PROVIDER_ERROR', cause);
      }
    },
  };
}
