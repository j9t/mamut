import { describe, test } from 'node:test';
import assert from 'node:assert';
import { correctHandle, InputError, isPublicHostname, parseHandle, parseServers, readDomain } from '../src/lib/input.js';

describe('parseHandle', () => {
  const expected = { acct: 'alice@social.example', domain: 'social.example', handle: '@alice@social.example', username: 'alice' };

  for (const input of [
    'alice@social.example',
    '@alice@social.example',
    '  @alice@SOCIAL.example ',
    'acct:alice@social.example',
    'https://social.example/@alice',
    'https://social.example/users/alice',
    'https://social.example/u/alice',
    'https://social.example/@alice/',
    'http://social.example/@alice'
  ]) {
    test(`Parses “${input}”`, () => {
      assert.deepStrictEqual(parseHandle(input), expected);
    });
  }

  test('Prefers the home server of a remote profile URL', () => {
    assert.strictEqual(parseHandle('https://other.example/@alice@social.example').domain, 'social.example');
  });

  test('Converts internationalized domains to Punycode', () => {
    assert.strictEqual(parseHandle('alice@bücher.example').domain, 'xn--bcher-kva.example');
  });

  for (const input of ['', 'alice', '@alice', 'alice@', 'a@b@c@d', 'alice@social.example/path', 'https://social.example/about', 'https://social.example/@%E0%A4%A']) {
    test(`Rejects “${input}”`, () => {
      assert.throws(() => parseHandle(input), InputError);
    });
  }

  for (const input of ['a@localhost', 'a@127.0.0.1', 'a@192.168.1.1', 'a@2130706433', 'a@0x7f.1', 'a@printer.local', 'a@router.lan', 'a@intranet.internal', 'a@social.example:8080']) {
    test(`Rejects non-public address “${input}”`, () => {
      assert.throws(() => parseHandle(input), InputError);
    });
  }
});

describe('correctHandle', () => {
  test('Adds the leading “@” to “name@instance”', () => {
    assert.strictEqual(correctHandle('alice@social.example'), '@alice@social.example');
  });

  test('Trims surrounding space before correcting', () => {
    assert.strictEqual(correctHandle('  alice@social.example '), '@alice@social.example');
  });

  test('Keeps the spelling of internationalized domains', () => {
    assert.strictEqual(correctHandle('alice@bücher.example'), '@alice@bücher.example');
  });

  for (const input of ['@alice@social.example', 'https://social.example/@alice', 'acct:alice@social.example', 'alice', '@alice', '']) {
    test(`Leaves “${input}” unchanged`, () => {
      assert.strictEqual(correctHandle(input), input);
    });
  }
});

describe('readDomain', () => {
  test('Returns the domain of a handle', () => {
    assert.strictEqual(readDomain('@alice@Social.example'), 'social.example');
  });

  test('Returns the domain of a profile URL', () => {
    assert.strictEqual(readDomain('https://social.example/@alice'), 'social.example');
  });

  for (const input of ['', 'alice', '@alice@']) {
    test(`Returns null for “${input}”`, () => {
      assert.strictEqual(readDomain(input), null);
    });
  }
});

describe('isPublicHostname', () => {
  test('Accepts a regular hostname', () => {
    assert.strictEqual(isPublicHostname('mastodon.social'), true);
  });

  test('Rejects a single-label hostname', () => {
    assert.strictEqual(isPublicHostname('intranet'), false);
  });
});

describe('parseServers', () => {
  test('Splits, normalizes, and deduplicates servers', () => {
    assert.deepStrictEqual(parseServers('a.example, B.example,a.example\nhttps://c.example/'), ['a.example', 'b.example', 'c.example']);
  });

  test('Accepts an array', () => {
    assert.deepStrictEqual(parseServers(['a.example']), ['a.example']);
  });

  test('Returns an empty list for blank input', () => {
    assert.deepStrictEqual(parseServers('  '), []);
  });

  test('Rejects more than twenty servers', () => {
    const servers = Array.from({ length: 21 }, (_, index) => `s${index}.example`);
    assert.throws(() => parseServers(servers), InputError);
  });

  test('Rejects a non-public server', () => {
    assert.throws(() => parseServers('localhost'), InputError);
  });
});