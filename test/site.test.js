import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import assert from 'node:assert';

const read = (path) => readFileSync(new URL(`../site/${path}`, import.meta.url), 'utf8');

const html = read('index.html');
const css = read('default.css');

describe('site', () => {
  test('Never renders remote content as HTML', () => {
    assert.doesNotMatch(html, /x-html/);
  });

  test('Loads no third-party scripts or styles', () => {
    assert.doesNotMatch(html, /<(script|link)[^>]+(src|href)="https?:/);
  });

  test('Uses only attribute names that validate as HTML', () => {
    for (const [tag] of html.matchAll(/<[a-z][^>]*>/g)) {
      const names = tag.replace(/"[^"]*"/g, '').matchAll(/\s([^\s=/>]+)/g);
      for (const [, name] of names) {
        assert.match(name, /^(?!x-)[a-z][a-z0-9-]*$/, `Invalid attribute “${name}” in ${tag}`);
      }
    }
  });

  test('Sets the matching Alpine prefix', () => {
    assert.match(read('default.js'), /Alpine\.prefix\('data-x-'\)/);
  });

  test('Avoids Alpine shorthands, which ignore a custom prefix', () => {
    assert.doesNotMatch(read('default.js'), /^\s*'[:@]/m);
  });

  test('Asks about standing, not availability', () => {
    assert.match(html, /in good standing\?/);
  });

  test('Has a heading that stays when a result is shown', () => {
    assert.match(html, /<h1 class="name">\s*<span data-x-show="isHome">Mamut<\/span>/);
  });

  test('Hides the name link until a query is active', () => {
    assert.match(html, /<a href="\.\/" data-x-cloak data-x-show="isActive" data-x-bind="bindHome">Mamut<\/a>/);
    assert.match(css, /\[data-x-cloak\]/);
  });

  test('Styles buttons without the default type, which minification removes', () => {
    assert.doesNotMatch(css, /\[type=.?submit/);
  });

  test('Starts lookups only from the form', () => {
    const js = read('default.js');
    assert.strictEqual(js.match(/this\.check\(\)/g).length, 1);
    assert.match(js, /'data-x-on:submit\.prevent'\(\) \{\s+this\.check\(\);/);
  });

  test('Discloses that servers see the visitor’s IP address', () => {
    assert.match(html, /sees your IP address/);
  });

  test('Preselects no comparison servers', () => {
    assert.match(read('default.js'), /majors: SERVERS_MAJOR\.map\(server => \(\{ auto: false, checked: false, server \}\)\)/);
  });

  test('Offers to check all comparison servers', () => {
    assert.match(html, /<legend>Also check on these Mastodon servers \(<a href="#" data-x-bind="bindToggleMajors" data-x-text="toggleMajorsLabel">check all<\/a>\)<\/legend>/);
  });

  test('Offers a reset button', () => {
    assert.match(html, /<button type="reset" data-x-cloak data-x-show="canClear">Clear<\/button>/);
  });

  test('Sorts CSS declarations alphabetically', () => {
    for (const [, block] of css.matchAll(/\{([^{}]+)\}/g)) {
      const properties = block.split(';')
        .map(declaration => declaration.trim().split(':')[0])
        .filter(Boolean);
      assert.deepStrictEqual(properties, properties.toSorted(), `Unsorted block: ${block.trim()}`);
    }
  });
});