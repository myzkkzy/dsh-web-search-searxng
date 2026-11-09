import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createSearchProvider, DEFAULTS, normalizeOptions } from '../provider.js';

function englishError(code) {
  return (error) => {
    assert.equal(error.code, code);
    assert.match(error.message, /[A-Za-z]/);
    assert.doesNotMatch(error.message, /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u);
    return true;
  };
}

async function withServer(handler, run) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseURL = 'http://127.0.0.1:' + server.address().port;
  try { await run(baseURL); }
  finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
}
function json(response, body) {
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}
const source = (n, extra = {}) => ({ url: 'https://example.com/' + n, title: 'Result ' + n, content: 'Content ' + n, ...extra });

test('sends Japanese queries and configured conditions, normalizes citeable sources', async () => {
  let captured;
  await withServer((req, res) => {
    captured = { url: new URL(req.url, 'http://localhost'), accept: req.headers.accept };
    json(res, { results: [
      source(1, { title: '<b>日本語</b> &amp; Search', content: 'A <em>useful</em> &quot;snippet&quot; &#x1F50D;' }),
      source(1, { url: 'https://example.com/1#duplicate' }),
      { url: 'javascript:alert(1)', title: 'bad' },
      null, { url: '/relative' },
      source(2), source(3),
    ] });
  }, async (baseURL) => {
    const provider = createSearchProvider(() => ({ baseURL: baseURL + '/', language: 'ja-JP', engines: 'duckduckgo,bing' }));
    assert.equal(provider.available(), true);
    const result = await provider.search({ query: '東京 & SearXNG + 検索', maxResults: 2 });
    assert.equal(captured.url.pathname, '/search');
    assert.equal(captured.url.searchParams.get('q'), '東京 & SearXNG + 検索');
    assert.equal(captured.url.searchParams.get('format'), 'json');
    assert.equal(captured.url.searchParams.get('language'), 'ja-JP');
    assert.equal(captured.url.searchParams.get('engines'), 'duckduckgo,bing');
    assert.equal(captured.accept, 'application/json');
    assert.deepEqual(result, { sources: [
      { url: 'https://example.com/1', title: '日本語 & Search', snippet: 'A useful "snippet" 🔍', summary: 'A useful "snippet" 🔍' },
      { url: 'https://example.com/2', title: 'Result 2', snippet: 'Content 2', summary: 'Content 2' },
    ], truncated: true });
  });
});

test('honors configured result cap and reads updated options for the next search', async () => {
  let count = 1;
  await withServer((req, res) => json(res, { results: [source(1), source(2), source(3)] }), async (baseURL) => {
    const provider = createSearchProvider(() => ({ baseURL, maxResults: count }));
    assert.equal((await provider.search({ query: 'first', maxResults: 8 })).sources.length, 1);
    count = 2;
    assert.equal((await provider.search({ query: 'second', maxResults: 8 })).sources.length, 2);
  });
});

test('accepts an empty results array as a successful search', async () => {
  await withServer((req, res) => json(res, { results: [], unresponsive_engines: [['example', 'timeout']] }), async (baseURL) => {
    assert.deepEqual(await createSearchProvider(() => ({ baseURL })).search({ query: 'nothing' }), { sources: [], truncated: false });
  });
});

test('works with an instance mounted below a URL prefix and omits empty conditions', async () => {
  await withServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    assert.equal(url.pathname, '/searxng/search');
    assert.equal(url.searchParams.has('engines'), false);
    assert.equal(url.searchParams.has('language'), false);
    json(res, { results: [source(1)] });
  }, async (baseURL) => {
    await createSearchProvider(() => ({ baseURL: baseURL + '/searxng/' })).search({ query: 'prefix' });
  });
});

for (const status of [403, 429, 500]) {
  test('reports HTTP ' + status + ' without returning an empty success', async () => {
    await withServer((req, res) => { res.writeHead(status); res.end('untrusted error page'); }, async (baseURL) => {
      await assert.rejects(createSearchProvider(() => ({ baseURL })).search({ query: 'error' }), (error) => {
        assert.equal(error.code, 'WEB_PROVIDER_ERROR');
        englishError("WEB_PROVIDER_ERROR")(error);
        assert.match(error.message, new RegExp(String(status)));
        if (status === 403) assert.match(error.message, /search.formats/);
        assert.doesNotMatch(error.message, /untrusted error page/);
        return true;
      });
    });
  });
}

for (const body of ['<html>not JSON</html>', '{"query":"missing results"}', '{"results":null}']) {
  test('rejects invalid response: ' + body.slice(0, 28), async () => {
    await withServer((req, res) => res.end(body), async (baseURL) => {
      await assert.rejects(createSearchProvider(() => ({ baseURL })).search({ query: 'bad response' }), englishError("SEARXNG_INVALID_RESPONSE"));
    });
  });
}

test('times out while waiting for a response', async () => {
  await withServer(() => {}, async (baseURL) => {
    await assert.rejects(createSearchProvider(() => ({ baseURL, timeoutMs: 100 })).search({ query: 'slow' }), englishError("SEARXNG_TIMEOUT"));
  });
});

test('times out while reading a partially received JSON body', async () => {
  await withServer((req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.write('{"results":['); }, async (baseURL) => {
    await assert.rejects(createSearchProvider(() => ({ baseURL, timeoutMs: 100 })).search({ query: 'slow body' }), englishError("SEARXNG_TIMEOUT"));
  });
});

test('forwards cancellation and distinguishes it from a timeout', async () => {
  const controller = new AbortController();
  await withServer(() => { controller.abort(); }, async (baseURL) => {
    await assert.rejects(createSearchProvider(() => ({ baseURL })).search({ query: 'cancelled' }, controller.signal), englishError("WEB_ABORTED"));
  });
});

test('does not dispatch an already-cancelled request or a zero-result request', async () => {
  let calls = 0;
  const provider = createSearchProvider(() => DEFAULTS, { fetch: () => { calls++; throw new Error('must not call'); } });
  await assert.rejects(provider.search({ query: 'cancelled' }, AbortSignal.abort()), englishError("WEB_ABORTED"));
  assert.deepEqual(await provider.search({ query: 'zero', maxResults: 0 }), { sources: [], truncated: false });
  assert.equal(calls, 0);
});

test('wraps transport failures in a provider error', async () => {
  const provider = createSearchProvider(() => DEFAULTS, { fetch: () => { throw Object.assign(new Error('refused'), englishError("ECONNREFUSED")); } });
  await assert.rejects(provider.search({ query: 'offline' }), englishError("WEB_PROVIDER_ERROR"));
});

test('availability validates local options without making network calls', () => {
  let calls = 0;
  const provider = createSearchProvider(() => ({ baseURL: 'file:///etc/passwd' }), { fetch: () => calls++ });
  assert.equal(provider.available(), false);
  assert.equal(calls, 0);
});

test('rejects invalid configuration and queries', async () => {
  for (const options of [
    { baseURL: 'invalid' }, { baseURL: 'https://user:password@example.com' },
    { baseURL: 'http://localhost/?q=1' }, { baseURL: 'http://localhost/search' },
    { maxResults: 0 }, { maxResults: 1.5 }, { timeoutMs: 99 }, { engines: [] },
  ]) assert.throws(() => normalizeOptions(options), englishError("SEARXNG_CONFIG_ERROR"));
  const provider = createSearchProvider();
  await assert.rejects(provider.search({ query: '  ' }), englishError("SEARXNG_INVALID_QUERY"));
  await assert.rejects(provider.search({ query: 'query', maxResults: -1 }), englishError("SEARXNG_INVALID_QUERY"));
});

test('does not follow an unexpected HTTP redirect', async () => {
  let targetCalls = 0;
  await withServer((req, res) => { targetCalls++; json(res, { results: [] }); }, async (target) => {
    await withServer((req, res) => { res.writeHead(302, { location: target + '/search' }); res.end(); }, async (baseURL) => {
      await assert.rejects(createSearchProvider(() => ({ baseURL })).search({ query: 'redirect' }), englishError("WEB_PROVIDER_ERROR"));
    });
  });
  assert.equal(targetCalls, 0);
});

test('retains original causes when wrapping transport and configuration errors', async () => {
  const cause = new TypeError('Connection closed');
  const provider = createSearchProvider(() => DEFAULTS, { fetch: () => { throw cause; } });
  await assert.rejects(provider.search({ query: 'offline' }), (error) => {
    englishError('WEB_PROVIDER_ERROR')(error);
    assert.equal(error.cause, cause);
    return true;
  });
  await assert.rejects(createSearchProvider(() => ({ maxResults: 0 })).search({ query: 'bad config' }), (error) => {
    englishError('SEARXNG_CONFIG_ERROR')(error);
    assert.equal(error.cause.code, 'SEARXNG_CONFIG_ERROR');
    return true;
  });
});
