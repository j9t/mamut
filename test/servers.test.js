import { createHash } from 'node:crypto';
import { describe, test } from 'node:test';
import assert from 'node:assert';
import { checkAccount } from '../src/mamut.js';
import { parseServers } from '../src/lib/input.js';
import { matchDomainBlock, SERVERS_MAJOR, syncHomeServer } from '../src/lib/servers.js';
import { createFetcher, routesNodeinfo, routesWebfinger } from './helpers/fetcher.js';

const HOST = 'social.example';
const OTHER = 'other.example';
const URL_LOOKUP_OTHER = `GET https://${OTHER}/api/v1/accounts/lookup?acct=${encodeURIComponent(`alice@${HOST}`)}`;
const URL_BLOCKS = `GET https://${OTHER}/api/v1/instance/domain_blocks`;

const digest = (domain) => createHash('sha256').update(domain).digest('hex');

const checkOn = async (routesOther, software = ['mastodon', '4.7.5']) => {
  const routes = {
    ...routesNodeinfo(HOST, 'mastodon', '4.7.5'),
    ...routesWebfinger('alice', HOST),
    [`GET https://${HOST}/api/v1/accounts/lookup?acct=alice`]: { json: {} },
    ...routesNodeinfo(OTHER, ...software),
    ...routesOther
  };
  const { calls, fetcher } = createFetcher(routes);
  const result = await checkAccount(`alice@${HOST}`, { fetcher, servers: [OTHER] });
  return { calls, entry: result.servers[0], result };
};

describe('matchDomainBlock', () => {
  test('Matches a plain domain', async () => {
    const match = await matchDomainBlock([{ digest: 'x', domain: HOST, severity: 'suspend' }], [HOST]);
    assert.strictEqual(match.severity, 'suspend');
  });

  test('Matches a masked domain by digest', async () => {
    const match = await matchDomainBlock([{ digest: digest(HOST), domain: 'so***.ex**ple', severity: 'silence' }], [HOST]);
    assert.strictEqual(match.severity, 'silence');
  });

  test('Matches a block on a parent domain', async () => {
    const match = await matchDomainBlock([{ digest: digest('example.org'), domain: 'exa***.org', severity: 'suspend' }], ['sub.example.org']);
    assert.strictEqual(match.severity, 'suspend');
  });

  test('Prefers the most severe match', async () => {
    const match = await matchDomainBlock([
      { digest: digest('a.example.org'), domain: 'a.example.org', severity: 'noop' },
      { digest: digest('example.org'), domain: 'example.org', severity: 'suspend' }
    ], ['a.example.org']);
    assert.strictEqual(match.severity, 'suspend');
  });

  test('Returns null without a match', async () => {
    assert.strictEqual(await matchDomainBlock([{ digest: 'x', domain: 'x.example', severity: 'suspend' }], [HOST]), null);
  });

  test('Ignores unknown severities', async () => {
    assert.strictEqual(await matchDomainBlock([{ domain: HOST, severity: 'constructor' }], [HOST]), null);
  });

  test('Ignores malformed entries', async () => {
    assert.strictEqual(await matchDomainBlock([null, 'x', {}], [HOST]), null);
  });
});

describe('SERVERS_MAJOR', () => {
  test('Passes server validation', () => {
    assert.deepStrictEqual(parseServers(SERVERS_MAJOR), [...SERVERS_MAJOR]);
  });

  test('Leaves room for specific servers', () => {
    assert.doesNotThrow(() => parseServers([...SERVERS_MAJOR, ...Array.from({ length: 10 }, (_, index) => `s${index}.example`)]));
  });
});

describe('syncHomeServer', () => {
  const entries = () => [{ auto: false, checked: false, server: 'a.example' }, { auto: false, checked: false, server: 'b.example' }];

  test('Checks the account’s own server', () => {
    const list = entries();
    syncHomeServer(list, 'a.example');
    assert.deepStrictEqual(list.map(entry => entry.checked), [true, false]);
  });

  test('Unchecks an automatically checked server when the domain changes', () => {
    const list = entries();
    syncHomeServer(list, 'a.example');
    syncHomeServer(list, 'b.example');
    assert.deepStrictEqual(list.map(entry => entry.checked), [false, true]);
  });

  test('Unchecks an automatically checked server when the domain is gone', () => {
    const list = entries();
    syncHomeServer(list, 'a.example');
    syncHomeServer(list, null);
    assert.deepStrictEqual(list.map(entry => entry.checked), [false, false]);
  });

  test('Keeps a manually checked server when the domain changes', () => {
    const list = entries();
    list[0].checked = true;
    syncHomeServer(list, 'a.example');
    syncHomeServer(list, 'b.example');
    assert.strictEqual(list[0].checked, true);
  });

  test('Respects unchecking an automatically checked server', () => {
    const list = entries();
    syncHomeServer(list, 'a.example');
    list[0].checked = false;
    syncHomeServer(list, 'a.example');
    assert.strictEqual(list[0].checked, false);
  });
});

describe('checkAccount across servers', () => {
  test('Reports a suspension on another server', async () => {
    const { entry } = await checkOn({ [URL_LOOKUP_OTHER]: { json: { suspended: true } }, [URL_BLOCKS]: { json: [] } });
    assert.strictEqual(entry.account, 'suspended');
    assert.strictEqual(entry.domainBlock, 'not-listed');
  });

  test('Reports a limit on another server', async () => {
    const { entry } = await checkOn({ [URL_LOOKUP_OTHER]: { json: { limited: true } }, [URL_BLOCKS]: { status: 404 } });
    assert.strictEqual(entry.account, 'limited');
    assert.strictEqual(entry.domainBlock, 'private');
  });

  test('Treats a 404 as no information', async () => {
    const { entry } = await checkOn({ [URL_LOOKUP_OTHER]: { status: 404 }, [URL_BLOCKS]: { json: [] } });
    assert.strictEqual(entry.account, 'unknown-here');
  });

  test('Reports a visible account', async () => {
    const { entry } = await checkOn({ [URL_LOOKUP_OTHER]: { json: {} }, [URL_BLOCKS]: { json: [] } });
    assert.strictEqual(entry.account, 'visible');
  });

  test('Reports a matching domain block with its reason', async () => {
    const { entry } = await checkOn({
      [URL_LOOKUP_OTHER]: { status: 404 },
      [URL_BLOCKS]: { json: [{ comment: 'Spam', digest: digest(HOST), domain: 'so***.example', severity: 'suspend' }] }
    });
    assert.strictEqual(entry.domainBlock, 'suspend');
    assert.strictEqual(entry.domainBlockComment, 'Spam');
  });

  test('Keeps failures per server inconclusive', async () => {
    const { entry, result } = await checkOn({ [URL_LOOKUP_OTHER]: { status: 500 }, [URL_BLOCKS]: { networkError: true } });
    assert.strictEqual(entry.account, 'inconclusive');
    assert.strictEqual(entry.domainBlock, 'inconclusive');
    assert.strictEqual(result.status, 'active');
  });

  test('Marks non-Mastodon servers as unsupported without querying them further', async () => {
    const { calls, entry } = await checkOn({}, ['misskey', '2026.1.0']);
    assert.strictEqual(entry.supported, false);
    assert.ok(!calls.some(call => call.url === URL_BLOCKS.slice(4)));
  });

  test('Skips the home server', async () => {
    const { fetcher } = createFetcher({
      ...routesNodeinfo(HOST, 'mastodon', '4.7.5'),
      ...routesWebfinger('alice', HOST),
      [`GET https://${HOST}/api/v1/accounts/lookup?acct=alice`]: { json: {} }
    });
    const result = await checkAccount(`alice@${HOST}`, { fetcher, servers: [HOST] });
    assert.deepStrictEqual(result.servers, []);
  });
});