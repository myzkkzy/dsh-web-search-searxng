import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { DEFAULTS } from '../provider.js';

function harness(initialLocale = 'ja') {
  const scopes = {
    'web-search-searxng': { value: { ...DEFAULTS }, status: 'ready', writable: true, revision: 'plugin:1' },
    web: { value: { searchProvider: 'deepseek-official', fetchProvider: 'http' }, status: 'ready', writable: true, revision: 'web:1' },
  };
  const writes = [];
  let refuse = false;
  let fail = false;
  const forms = Object.fromEntries(Object.keys(scopes).map((name) => [name, {
    subscribe: () => () => {}, getSnapshot: () => scopes[name],
    async mutate(ops, revision) {
      if (fail) throw new Error('Connection closed');
      writes.push({ name, ops, revision });
      if (refuse || revision !== scopes[name].revision) return false;
      const value = { ...scopes[name].value };
      for (const op of ops) {
        if (op.op === 'unset') value[op.path[0]] = name === 'web' ? 'deepseek-official' : DEFAULTS[op.path[0]];
        else value[op.path[0]] = op.value;
      }
      scopes[name] = { ...scopes[name], value, revision: scopes[name].revision + '+' };
      return true;
    },
  }]));
  let localeSnapshot = { active: initialLocale, revision: 0 };
  const dictionaries = {};
  const localeListeners = new Set();
  let notifications = 0;
  const locale = {
    getSnapshot: () => localeSnapshot,
    subscribe(listener) { localeListeners.add(listener); return () => localeListeners.delete(listener); },
    register(ns, values) { dictionaries[ns] = values; return () => { delete dictionaries[ns]; }; },
    bind: (ns) => (key, params = {}) => {
      const dictionary = dictionaries[ns];
      const text = dictionary?.[localeSnapshot.active]?.[key] ?? dictionary?.en?.[key] ?? key;
      return text.replace(/\{(\w+)\}/g, (match, name) => name in params ? String(params[name]) : match);
    },
  };
  let component;
  const hooks = [];
  let index = 0;
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }),
    useState(initial) {
      const i = index++;
      if (!(i in hooks)) hooks[i] = initial;
      return [hooks[i], (next) => { hooks[i] = typeof next === 'function' ? next(hooks[i]) : next; }];
    },
    useRef(initial) {
      const i = index++;
      if (!(i in hooks)) hooks[i] = { current: initial };
      return hooks[i];
    },
    useEffect(effect) { const i = index++; if (!(i in hooks)) { hooks[i] = true; effect(); } },
    useSyncExternalStore(subscribe, get) {
      const i = index++;
      if (!(i in hooks)) {
        hooks[i] = subscribe(() => { notifications++; });
      }
      return get();
    },
  };
  vm.runInNewContext(readFileSync(new URL('../client.js', import.meta.url), 'utf8'), {
    URL, document: { createElement: () => ({ dataset: {}, remove() {} }), head: { appendChild() {} } },
    window: { __ModuleLoader__: { load({ id, factory }) {
      assert.equal(id, 'dsh-web-search-searxng');
      const plugin = factory((name) => { assert.equal(name, 'react'); return react; });
      assert.ok(plugin.inject.includes('locale'));
      plugin.apply({
        locale,
        configForms: { get: (name) => forms[name], whileServed: (names, register) => register() },
        effect: (effect) => effect(),
        slots: { inject: (name, register) => register(), register: (spec, render) => { component = render; return () => {}; } },
      });
    } } },
  });
  function render(view = 'page') { index = 0; return component({ view }); }
  function find(tree, predicate) {
    if (!tree || typeof tree !== 'object') return;
    if (predicate(tree)) return tree;
    for (const child of tree.children ?? []) { const result = find(child, predicate); if (result) return result; }
  }
  const button = (text) => find(render(), (node) => node.type === 'button' && node.children.includes(text));
  const input = (key) => find(render(), (node) => node.props.id === 'searxng-' + key);
  return {
    render, button, input, scopes, writes, dictionaries,
    get notifications() { return notifications; },
    rejectWrites: () => { refuse = true; },
    failWrites: () => { fail = true; },
    setLocale(active) {
      localeSnapshot = { active, revision: localeSnapshot.revision + 1 };
      for (const listener of localeListeners) listener();
    },
    edit(key, value) { input(key).props.onChange({ target: { value } }); },
    async save() { await find(render(), (node) => node.type === 'form').props.onSubmit({ preventDefault() {} }); },
    text: () => JSON.stringify(render()),
  };
}

test('opening the page never writes settings', () => {
  const ui = harness();
  ui.render();
  assert.equal(ui.writes.length, 0);
  assert.equal(ui.button('設定を保存').props.disabled, true);
});

test('stages settings and atomically saves typed values with the read revision', async () => {
  const ui = harness();
  ui.edit('baseURL', 'http://127.0.0.1:9999');
  ui.edit('maxResults', '12');
  assert.equal(ui.writes.length, 0);
  assert.equal(ui.button('SearXNG を検索に使う').props.disabled, true);
  await ui.save();
  assert.equal(ui.writes.length, 1);
  assert.equal(ui.writes[0].revision, 'plugin:1');
  assert.equal(ui.scopes['web-search-searxng'].value.maxResults, 12);
  assert.equal(ui.scopes['web-search-searxng'].value.baseURL, 'http://127.0.0.1:9999');
  assert.equal(ui.button('設定を保存').props.disabled, true);
});

test('provider selection touches only searchProvider and can restore inheritance', async () => {
  const ui = harness();
  await ui.button('SearXNG を検索に使う').props.onClick();
  assert.equal(ui.scopes.web.value.searchProvider, 'searxng-local');
  assert.equal(ui.scopes.web.value.fetchProvider, 'http');
  assert.deepEqual(JSON.parse(JSON.stringify(ui.writes[0].ops)), [{ op: 'set', path: ['searchProvider'], value: 'searxng-local' }]);
  await ui.button('既定の検索に戻す').props.onClick();
  assert.equal(ui.scopes.web.value.searchProvider, 'deepseek-official');
  assert.equal(ui.scopes.web.value.fetchProvider, 'http');
});

test('retains edits after a conflicting write and allows discarding them', async () => {
  const ui = harness();
  ui.edit('engines', 'bing');
  ui.scopes['web-search-searxng'] = { ...ui.scopes['web-search-searxng'], revision: 'plugin:2' };
  await ui.save();
  assert.match(ui.text(), /編集内容は保持されています/);
  assert.match(ui.text(), /bing/);
  ui.button('編集を破棄').props.onClick();
  assert.equal(ui.button('設定を保存').props.disabled, true);
});

test('rejects invalid inputs before attempting a save', async () => {
  const ui = harness();
  ui.edit('maxResults', '1.5');
  await ui.save();
  assert.equal(ui.writes.length, 0);
  assert.match(ui.text(), /整数/);
  ui.edit('maxResults', '8');
  ui.edit('baseURL', 'http://localhost/search');
  await ui.save();
  assert.equal(ui.writes.length, 0);
});

test('shows rejected provider selection without claiming it succeeded', async () => {
  const ui = harness();
  ui.rejectWrites();
  await ui.button('SearXNG を検索に使う').props.onClick();
  assert.equal(ui.scopes.web.value.searchProvider, 'deepseek-official');
  assert.match(ui.text(), /切り替えられませんでした/);
});

test('registers complete English and Japanese dictionaries with matching placeholders', () => {
  const ui = harness();
  const { en, ja } = ui.dictionaries['plugins.searxng'];
  assert.deepEqual(Object.keys(en).sort(), Object.keys(ja).sort());
  for (const key of Object.keys(en)) {
    const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    assert.deepEqual(placeholders(en[key]), placeholders(ja[key]), key);
  }
});

test('shows only the five settings fields and controls in both display languages', () => {
  for (const language of ['en', 'ja']) {
    const ui = harness(language);
    const tree = ui.text();
    assert.equal((tree.match(/"type":"input"/g) ?? []).length, 5);
    assert.doesNotMatch(tree, /導入|SearXNG の起動|元に戻す・削除|開発・テスト|Installation|Starting SearXNG|Development and tests/);
    assert.doesNotMatch(tree, /"type":"h[1-6]"/);
  }
});

test('language changes notify React without losing drafts or writing settings', async () => {
  const ui = harness('ja');
  ui.edit('maxResults', '12');
  ui.edit('engines', 'bing');
  const notifications = ui.notifications;
  ui.setLocale('en');
  assert.ok(ui.notifications > notifications);
  assert.match(ui.text(), /Maximum results/);
  assert.equal(ui.input('maxResults').props.value, '12');
  assert.equal(ui.input('engines').props.value, 'bing');
  assert.equal(ui.writes.length, 0);
  assert.equal(ui.button('Save settings').props.disabled, false);
  ui.setLocale('ja');
  assert.match(ui.text(), /最大検索結果数/);
  await ui.save();
  assert.equal(ui.writes[0].revision, 'plugin:1');
  assert.equal(ui.scopes['web-search-searxng'].value.maxResults, 12);
  assert.equal(ui.scopes['web-search-searxng'].value.engines, 'bing');
});

test('retranslates validation labels and parameters without changing invalid input', () => {
  const ui = harness('ja');
  ui.edit('maxResults', '1.5');
  assert.match(ui.text(), /最大検索結果数は 1〜50 の整数/);
  ui.setLocale('en');
  assert.match(ui.text(), /Maximum results must be an integer between 1 and 50/);
  assert.equal(ui.input('maxResults').props.value, '1.5');
  assert.equal(ui.button('Save settings').props.disabled, true);
  assert.equal(ui.writes.length, 0);
});

test('retranslates an existing success notification when the locale changes', async () => {
  const ui = harness('ja');
  ui.edit('maxResults', '9');
  await ui.save();
  assert.match(ui.text(), /設定を保存しました/);
  ui.setLocale('en');
  assert.match(ui.text(), /Settings saved/);
  assert.doesNotMatch(ui.text(), /設定を保存しました/);
  assert.equal(ui.writes.length, 1);
});

test('retranslates a conflict notification and preserves the rejected draft', async () => {
  const ui = harness('ja');
  ui.edit('engines', 'bing');
  ui.rejectWrites();
  await ui.save();
  ui.setLocale('en');
  assert.match(ui.text(), /Your edits are preserved/);
  assert.equal(ui.input('engines').props.value, 'bing');
  ui.button('Discard changes').props.onClick();
  assert.equal(ui.input('engines').props.value, '');
});

test('retranslates transport failures while keeping unsaved values', async () => {
  const ui = harness('en');
  ui.edit('baseURL', 'http://127.0.0.1:9999');
  ui.failWrites();
  await ui.save();
  assert.match(ui.text(), /The request failed/);
  ui.setLocale('ja');
  assert.match(ui.text(), /通信に失敗しました/);
  assert.equal(ui.input('baseURL').props.value, 'http://127.0.0.1:9999');
});

test('switches search providers in English and retranslates the resulting status', async () => {
  const ui = harness('en');
  await ui.button('Use SearXNG for search').props.onClick();
  assert.match(ui.text(), /Current web search: SearXNG/);
  assert.match(ui.text(), /Web search now uses SearXNG/);
  ui.setLocale('ja');
  assert.match(ui.text(), /現在の Web 検索: SearXNG/);
  assert.match(ui.text(), /Web 検索を SearXNG に切り替えました/);
  await ui.button('既定の検索に戻す').props.onClick();
  ui.setLocale('en');
  assert.match(ui.text(), /restored to the Harness default/);
  assert.equal(ui.scopes.web.value.fetchProvider, 'http');
});

test('falls back to English for other Harness languages', () => {
  const ui = harness('de');
  assert.match(ui.text(), /Maximum results/);
  assert.equal(ui.button('Save settings').props.disabled, true);
  assert.equal(ui.render('summary'), 'Search with your SearXNG instance without an API key.');
});

test('retranslates unavailable and read-only states', () => {
  const ui = harness('ja');
  ui.scopes['web-search-searxng'].status = 'unavailable';
  assert.match(ui.text(), /検索プラグインが無効/);
  ui.setLocale('en');
  assert.match(ui.text(), /The search plugin is disabled/);
  ui.scopes['web-search-searxng'].status = 'ready';
  ui.scopes['web-search-searxng'].writable = false;
  assert.match(ui.text(), /Settings are read-only/);
});
