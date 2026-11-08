import { describe, test } from 'node:test';
import assert from 'node:assert';
import { detectSoftware, resolveWebfinger } from '../src/lib/discovery.js';
import { createClient } from '../src/lib/http.js';
import { isAtLeast, parseVersion } from '../src/lib/version.js';
import { createFetcher, routesNodeinfo, routesWebfinger, routesWebfingerStatus } from './helpers/fetcher.js';

const account = { acct: 'alice@social.example', domain: 'social.example', username: 'alice' };

describe('createClient', () => {
  test('Omits credentials and the referrer', async () => {
    const { calls, fetcher } = createFetcher({ 'GET https://a.example/x': { json: {} } });
    await createClient({ fetcher }).request('https://a.example/x');
    assert.strictEqual(calls[0].init.credentials, 'omit');
    assert.strictEqual(calls[0].init.referrerPolicy, 'no-referrer');
  });

  test('Returns parsed JSON and the status', async () => {
    const { fetcher } = createFetcher({ 'GET https://a.example/x': { json: { a: 1 }, status: 201 } });
    const response = await createClient({ fetcher }).request('https://a.example/x');
    assert.deepStrictEqual(response.json, { a: 1 });
    assert.strictEqual(response.status, 201);
    assert.strictEqual(response.failure, null);
  });

  test('Reports network failures without throwing', async () => {
    const { fetcher } = createFetcher({});
    const response = await createClient({ fetcher }).request('https://a.example/x');
    assert.strictEqual(response.failure, 'network');
    assert.strictEqual(response.status, null);
  });

  test('Reports timeouts without throwing', async () => {
    const { fetcher } = createFetcher({ 'GET https://a.example/x': { timeout: true } });
    const response = await createClient({ fetcher }).request('https://a.example/x');
    assert.strictEqual(response.failure, 'timeout');
  });

  test('Returns null JSON for non-JSON bodies', async () => {
    const fetcher = async () => new Response('<html>', { status: 200 });
    const response = await createClient({ fetcher }).request('https://a.example/x');
    assert.strictEqual(response.json, null);
  });

  test('Logs every request', async () => {
    const { fetcher } = createFetcher({ 'GET https://a.example/x': { status: 404 } });
    const client = createClient({ fetcher });
    await client.request('https://a.example/x');
    await client.request('https://a.example/y');
    assert.deepStrictEqual(client.requests, [
      { failure: null, method: 'GET', status: 404, url: 'https://a.example/x' },
      { failure: 'network', method: 'GET', status: null, url: 'https://a.example/y' }
    ]);
  });

  test('Sends JSON payloads with a content type', async () => {
    const { calls, fetcher } = createFetcher({ 'POST https://a.example/x': { json: {} } });
    await createClient({ fetcher }).request('https://a.example/x', { method: 'POST', payload: { a: 1 } });
    assert.strictEqual(calls[0].init.body, '{"a":1}');
    assert.strictEqual(calls[0].init.headers['Content-Type'], 'application/json');
  });
});

describe('createClient safeguards', () => {
  test('Skips requests once aborted', async () => {
    const { calls, fetcher } = createFetcher({ 'GET https://a.example/x': { json: {} } });
    const controller = new AbortController();
    controller.abort();
    const response = await createClient({ fetcher, signal: controller.signal }).request('https://a.example/x');
    assert.strictEqual(response.failure, 'aborted');
    assert.strictEqual(calls.length, 0);
  });

  test('Aborts running requests', async () => {
    const fetcher = (_, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason));
    });
    const controller = new AbortController();
    const pending = createClient({ fetcher, signal: controller.signal }).request('https://a.example/x');
    controller.abort();
    assert.strictEqual((await pending).failure, 'aborted');
  });

  test('Refuses oversized responses', async () => {
    const fetcher = async () => new Response(new Uint8Array(8 * 1024 * 1024 + 1));
    const response = await createClient({ fetcher }).request('https://a.example/x');
    assert.strictEqual(response.failure, 'too-large');
    assert.strictEqual(response.json, null);
  });

  test('Decodes multibyte text across chunks', async () => {
    const bytes = new TextEncoder().encode('{"a":"é"}');
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(bytes.slice(0, 7));
        controller.enqueue(bytes.slice(7));
        controller.close();
      }
    });
    const response = await createClient({ fetcher: async () => new Response(body) }).request('https://a.example/x');
    assert.deepStrictEqual(response.json, { a: 'é' });
  });
});

describe('resolveWebfinger', () => {
  test('Returns the actor URL and host', async () => {
    const { fetcher } = createFetcher(routesWebfinger('alice', 'social.example'));
    const result = await resolveWebfinger(createClient({ fetcher }), account);
    assert.strictEqual(result.found, true);
    assert.strictEqual(result.host, 'social.example');
    assert.strictEqual(result.urlActor, 'https://social.example/users/alice');
    assert.strictEqual(result.urlProfile, 'https://social.example/@alice');
  });

  test('Follows a separate web domain', async () => {
    const { fetcher } = createFetcher(routesWebfinger('alice', 'social.example', 'web.social.example'));
    const result = await resolveWebfinger(createClient({ fetcher }), account);
    assert.strictEqual(result.host, 'web.social.example');
  });

  for (const status of [400, 404, 410]) {
    test(`Treats HTTP ${status} as not found`, async () => {
      const { fetcher } = createFetcher(routesWebfingerStatus('alice', 'social.example', status));
      const result = await resolveWebfinger(createClient({ fetcher }), account);
      assert.strictEqual(result.found, false);
    });
  }

  for (const status of [401, 403, 429, 500]) {
    test(`Stays inconclusive on HTTP ${status}`, async () => {
      const { fetcher } = createFetcher(routesWebfingerStatus('alice', 'social.example', status));
      const result = await resolveWebfinger(createClient({ fetcher }), account);
      assert.strictEqual(result.found, null);
    });
  }

  test('Ignores profile links to unrelated hosts', async () => {
    const urlResource = `https://social.example/.well-known/webfinger?resource=${encodeURIComponent('acct:alice@social.example')}`;
    const { fetcher } = createFetcher({
      [`GET ${urlResource}`]: { json: { links: [{ href: 'https://phishing.example/login', rel: 'http://webfinger.net/rel/profile-page' }] } }
    });
    const result = await resolveWebfinger(createClient({ fetcher }), account);
    assert.strictEqual(result.urlProfile, null);
  });

  test('Ignores actor links on non-public hosts', async () => {
    const { fetcher } = createFetcher(routesWebfinger('alice', 'social.example', 'localhost'));
    const result = await resolveWebfinger(createClient({ fetcher }), account);
    assert.strictEqual(result.host, null);
    assert.strictEqual(result.urlActor, null);
  });
});

describe('detectSoftware', () => {
  test('Returns the lowercased name and version', async () => {
    const { fetcher } = createFetcher(routesNodeinfo('a.example', 'Mastodon', '4.7.5'));
    assert.deepStrictEqual(await detectSoftware(createClient({ fetcher }), 'a.example'), { name: 'mastodon', version: '4.7.5' });
  });

  test('Drops a version that isn’t text', async () => {
    const { fetcher } = createFetcher(routesNodeinfo('a.example', 'mastodon', 5));
    assert.strictEqual((await detectSoftware(createClient({ fetcher }), 'a.example')).version, null);
  });

  test('Prefers the highest schema version', async () => {
    const { fetcher } = createFetcher({
      'GET https://a.example/.well-known/nodeinfo': { json: { links: [
        { href: 'https://a.example/n/2.0', rel: 'http://nodeinfo.diaspora.software/ns/schema/2.0' },
        { href: 'https://a.example/n/2.1', rel: 'http://nodeinfo.diaspora.software/ns/schema/2.1' }
      ] } },
      'GET https://a.example/n/2.1': { json: { software: { name: 'lemmy', version: '0.19.21' } } }
    });
    assert.strictEqual((await detectSoftware(createClient({ fetcher }), 'a.example')).name, 'lemmy');
  });

  test('Returns null when NodeInfo is missing', async () => {
    const { fetcher } = createFetcher({});
    assert.strictEqual(await detectSoftware(createClient({ fetcher }), 'a.example'), null);
  });

  test('Refuses NodeInfo links to non-public hosts', async () => {
    const { calls, fetcher } = createFetcher({
      'GET https://a.example/.well-known/nodeinfo': { json: { links: [
        { href: 'https://localhost/n', rel: 'http://nodeinfo.diaspora.software/ns/schema/2.1' }
      ] } }
    });
    assert.strictEqual(await detectSoftware(createClient({ fetcher }), 'a.example'), null);
    assert.strictEqual(calls.length, 1);
  });
});

describe('parseVersion', () => {
  test('Parses fork suffixes', () => {
    assert.deepStrictEqual(parseVersion('4.2.0+hometown-1.1.2'), { major: 4, minor: 2, patch: 0, prerelease: false });
  });

  test('Flags prereleases', () => {
    assert.strictEqual(parseVersion('5.0.0-nightly.2026-11-05').prerelease, true);
  });

  test('Returns null for unparsable versions', () => {
    assert.strictEqual(parseVersion('unknown'), null);
  });
});

describe('isAtLeast', () => {
  for (const [version, expected] of [
    ['4.7.0', true],
    ['4.7.5', true],
    ['4.8.0', true],
    ['5.0.0-nightly.2026-11-05', true],
    ['4.6.9', false],
    ['4.7.0-beta.1', false],
    ['nonsense', false],
    [undefined, false]
  ]) {
    test(`Returns ${expected} for ${version} against 4.7.0`, () => {
      assert.strictEqual(isAtLeast(version, [4, 7, 0]), expected);
    });
  }
});