import { exec } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { before, describe, test } from 'node:test';
import assert from 'node:assert';
import { promisify } from 'node:util';

describe('build', () => {
  let html;
  let source;

  before(async () => {
    await promisify(exec)('npm run build');
    html = readFileSync(new URL('../site/build/index.html', import.meta.url), 'utf8');
    source = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');
  }, { timeout: 120_000 });

  test('Minifies the page', () => {
    assert.ok(html.length < source.length * 0.8, `${html.length} of ${source.length} bytes`);
    assert.doesNotMatch(html, /\n\s/);
  });

  test('Keeps the Content Security Policy', () => {
    assert.match(html, /<meta content="default-src 'none'[^>]+http-equiv="?Content-Security-Policy/);
  });

  test('Keeps Alpine directives', () => {
    assert.match(html, /data-x-data="?mamut/);
    assert.match(html, /data-x-for="entry in majors"/);
  });

  test('Keeps the table body that wraps Alpine rows', () => {
    assert.match(html, /<tbody><template/);
  });

  test('Keeps the reset button type', () => {
    assert.match(html, /<button type="?reset/);
  });

  test('Publishes the license of all bundled third-party software', () => {
    const notices = readFileSync(new URL('../site/build/THIRD-PARTY-NOTICES.txt', import.meta.url), 'utf8');
    for (const path of ['@picocss/pico/LICENSE.md', '@vue/reactivity/LICENSE', '@vue/shared/LICENSE']) {
      const license = readFileSync(new URL(`../node_modules/${path}`, import.meta.url), 'utf8');
      assert.ok(notices.includes(license.trim()), `Missing the license of ${path}`);
    }
    assert.match(notices, /Copyright © 2019-2025 Caleb Porzio and contributors/);
  });

  test('Links the third-party licenses', () => {
    assert.match(source, /href="\.\/THIRD-PARTY-NOTICES\.txt"/);
  });

  test('Points assets to the GitHub Pages path', () => {
    assert.match(html, /\/mamut\/assets\//);
  });
});