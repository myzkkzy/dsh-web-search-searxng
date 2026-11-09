import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (relative) => readFileSync(path.join(root, relative), 'utf8');
const manifest = JSON.parse(read('package.json'));
const included = (relative) => manifest.files.some((entry) => relative === entry || relative.startsWith(entry + '/'));

for (const language of ['en', 'ja']) {
  test(language + ' metadata selects a packaged short description instead of the README', () => {
    const localeURL = import.meta.resolve('dsh-web-search-searxng/locale/' + language + '.json');
    const { meta } = JSON.parse(readFileSync(new URL(localeURL), 'utf8'));
    assert.equal(typeof meta.title, 'string');
    assert.equal(typeof meta.description, 'string');
    assert.ok(included('locale/' + language + '.json'));
    assert.ok(included(meta.detail));
    assert.ok(path.resolve(root, meta.detail).startsWith(root));
    assert.doesNotMatch(meta.detail, /readme/i);
    const markdown = read(meta.detail);
    assert.ok(markdown.trim().length > 0 && markdown.length < 200);
    assert.doesNotMatch(markdown, /^#/m);
  });
}

test('keeps the Japanese and English guides with mutual language links and full instructions', () => {
  const japanese = read('README.md');
  const english = read('README.en.md');
  assert.match(japanese, /\[English\]\(README\.en\.md\)/);
  assert.match(english, /\[日本語\]\(README\.md\)/);
  for (const title of ['導入', 'SearXNG の起動', '設定', '元に戻す・削除', '開発・テスト']) {
    assert.ok(japanese.includes('## ' + title));
  }
  for (const title of ['Installation', 'Starting SearXNG', 'Settings', 'Restoring defaults and removal', 'Development and tests']) {
    assert.ok(english.includes('## ' + title));
  }
  assert.ok(included('README.md') && included('README.en.md'));
});

test('declares the existing Harness locale dependency without adding external runtime dependencies', () => {
  assert.ok(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-locale'));
  assert.equal(Object.keys(manifest.dependencies ?? {}).length, 0);
});
