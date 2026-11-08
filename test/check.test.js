import { describe, test } from 'node:test';
import assert from 'node:assert';
import { STATUS } from '../src/lib/status.js';
import { checkAccount, InputError } from '../src/mamut.js';
import { createFetcher, routesNodeinfo, routesWebfinger, routesWebfingerStatus } from './helpers/fetcher.js';

const HOST = 'social.example';
const HANDLE = `alice@${HOST}`;
const URL_LOOKUP = `GET https://${HOST}/api/v1/accounts/lookup?acct=alice`;
const URL_PROFILE = `GET https://${HOST}/@alice`;
const URL_CONTROL = `GET https://${HOST}/@mamut_control_absent`;

const check = (routes, options) => checkAccount(HANDLE, { fetcher: createFetcher(routes).fetcher, ...options });

describe('`checkAccount` on Mastodon', () => {
  const base = (version = '4.7.5') => ({ ...routesNodeinfo(HOST, 'mastodon', version), ...routesWebfinger('alice', HOST) });
  const accountActive = { acct: 'alice', username: 'alice' };

  test('Reports an active account', async () => {
    const result = await check({ ...base(), [URL_LOOKUP]: { json: accountActive } });
    assert.strictEqual(result.status, STATUS.ACTIVE);
    assert.strictEqual(result.confidence, 'high');
    assert.deepStrictEqual(result.software, { name: 'mastodon', version: '4.7.5' });
  });

  test('Reports a limited account', async () => {
    const result = await check({ ...base(), [URL_LOOKUP]: { json: { ...accountActive, limited: true } } });
    assert.strictEqual(result.status, STATUS.LIMITED);
  });

  test('Reports a moved account with its target', async () => {
    const result = await check({ ...base(), [URL_LOOKUP]: { json: { ...accountActive, moved: { acct: 'alice2@new.example' } } } });
    assert.strictEqual(result.status, STATUS.MOVED);
    assert.strictEqual(result.movedTo, '@alice2@new.example');
  });

  test('Qualifies a local move target with the server', async () => {
    const result = await check({ ...base(), [URL_LOOKUP]: { json: { ...accountActive, moved: { acct: 'alice2' } } } });
    assert.strictEqual(result.movedTo, `@alice2@${HOST}`);
  });

  test('Reports a move without a usable target', async () => {
    for (const moved of [{}, { acct: '' }, { acct: 42 }]) {
      const result = await check({ ...base(), [URL_LOOKUP]: { json: { ...accountActive, moved } } });
      assert.strictEqual(result.status, STATUS.MOVED);
      assert.strictEqual(result.movedTo, null);
      assert.strictEqual(result.headline, 'Moved to another account');
    }
  });

  test('Reports a memorialized account', async () => {
    const result = await check({ ...base(), [URL_LOOKUP]: { json: { ...accountActive, memorial: true } } });
    assert.strictEqual(result.status, STATUS.MEMORIAL);
  });

  test('Prioritizes a limit over a move', async () => {
    const result = await check({ ...base(), [URL_LOOKUP]: { json: { ...accountActive, limited: true, moved: { acct: 'x' } } } });
    assert.strictEqual(result.status, STATUS.LIMITED);
  });

  test('Reports a reversible suspension', async () => {
    const result = await check({ ...base(), [URL_LOOKUP]: { json: { ...accountActive, suspended: true } }, [URL_PROFILE]: { status: 403 } });
    assert.strictEqual(result.status, STATUS.SUSPENDED);
    assert.strictEqual(result.confidence, 'high');
    assert.match(result.notes.join(' '), /still kept/);
  });

  test('Reports a suspension with data removed', async () => {
    const result = await check({ ...base(), [URL_LOOKUP]: { json: { ...accountActive, suspended: true } }, [URL_PROFILE]: { status: 410 } });
    assert.strictEqual(result.status, STATUS.SUSPENDED);
    assert.match(result.notes.join(' '), /removed/);
  });

  test('Reports a suspension when the profile page is unreadable', async () => {
    const result = await check({ ...base(), [URL_LOOKUP]: { json: { ...accountActive, suspended: true } } });
    assert.strictEqual(result.status, STATUS.SUSPENDED);
    assert.strictEqual(result.confidence, 'high');
  });

  test('Reports a self-deletion on Mastodon 4.7 and later', async () => {
    const result = await check({ ...base(), [URL_LOOKUP]: { status: 404 }, [URL_PROFILE]: { status: 410 } });
    assert.strictEqual(result.status, STATUS.DELETED);
  });

  test('Reports a pending self-deletion when a control request confirms the 403', async () => {
    const result = await check({ ...base(), [URL_LOOKUP]: { status: 404 }, [URL_PROFILE]: { status: 403 }, [URL_CONTROL]: { status: 404 } });
    assert.strictEqual(result.status, STATUS.DELETED);
  });

  test('Does not mistake a firewall 403 for a self-deletion', async () => {
    const result = await check({ ...base(), [URL_LOOKUP]: { status: 404 }, [URL_PROFILE]: { status: 403 }, [URL_CONTROL]: { status: 403 } });
    assert.strictEqual(result.status, STATUS.UNAVAILABLE);
  });

  test('Skips the control request before Mastodon 4.7, which can’t confirm a self-deletion', async () => {
    const { calls, fetcher } = createFetcher({ ...base('4.6.2'), [URL_LOOKUP]: { status: 404 }, [URL_PROFILE]: { status: 403 }, [URL_CONTROL]: { status: 404 } });
    const result = await checkAccount(HANDLE, { fetcher });
    assert.strictEqual(result.status, STATUS.UNAVAILABLE);
    assert.ok(!calls.some(call => call.url === URL_CONTROL.slice(4)));
  });

  test('Keeps a suspension ambiguous before Mastodon 4.7 once data is gone', async () => {
    const result = await check({ ...base('4.6.2'), [URL_LOOKUP]: { json: { ...accountActive, suspended: true } }, [URL_PROFILE]: { status: 410 } });
    assert.strictEqual(result.status, STATUS.UNAVAILABLE);
    assert.match(result.notes.join(' '), /4\.7/);
  });

  test('Reports a reversible suspension before Mastodon 4.7', async () => {
    const result = await check({ ...base('4.6.2'), [URL_LOOKUP]: { json: { ...accountActive, suspended: true } }, [URL_PROFILE]: { status: 403 } });
    assert.strictEqual(result.status, STATUS.SUSPENDED);
  });

  test('Keeps a suspension ambiguous on a 4.7 prerelease', async () => {
    const result = await check({ ...base('4.7.0-beta.1'), [URL_LOOKUP]: { json: { ...accountActive, suspended: true } }, [URL_PROFILE]: { status: 410 } });
    assert.strictEqual(result.status, STATUS.UNAVAILABLE);
  });

  test('Reports a missing account', async () => {
    const result = await check({
      ...routesNodeinfo(HOST, 'mastodon', '4.7.5'),
      ...routesWebfingerStatus('alice', HOST, 404),
      [URL_LOOKUP]: { status: 404 },
      [URL_PROFILE]: { status: 404 }
    });
    assert.strictEqual(result.status, STATUS.NOT_FOUND);
  });

  test('Reports contradicting missing-account signals as unavailable', async () => {
    const result = await check({ ...base(), [URL_LOOKUP]: { status: 404 }, [URL_PROFILE]: { status: 404 } });
    assert.strictEqual(result.status, STATUS.UNAVAILABLE);
  });

  test('Reports a restricted API as undetermined', async () => {
    const result = await check({ ...base(), [URL_LOOKUP]: { json: { error: 'x' }, status: 401 } });
    assert.strictEqual(result.status, STATUS.UNDETERMINED);
  });

  for (const route of [{ status: 429 }, { status: 503 }, { networkError: true }]) {
    test(`Reports ${route.status ?? 'a network error'} as unknown`, async () => {
      const result = await check({ ...base(), [URL_LOOKUP]: route });
      assert.strictEqual(result.status, STATUS.UNKNOWN);
    });
  }

  test('Handles Hometown as Mastodon', async () => {
    const result = await check({
      ...routesNodeinfo(HOST, 'hometown', '4.8.0+hometown-1.2.0'),
      ...routesWebfinger('alice', HOST),
      [URL_LOOKUP]: { json: accountActive }
    });
    assert.strictEqual(result.status, STATUS.ACTIVE);
  });

  test('Queries the web domain of a split-domain server', async () => {
    const web = `web.${HOST}`;
    const result = await check({
      ...routesNodeinfo(web, 'mastodon', '4.7.5'),
      ...routesWebfinger('alice', HOST, web),
      [`GET https://${web}/api/v1/accounts/lookup?acct=alice`]: { json: accountActive }
    });
    assert.strictEqual(result.status, STATUS.ACTIVE);
    assert.strictEqual(result.host, web);
    assert.strictEqual(result.account.domain, HOST);
  });
});

describe('`checkAccount` on Lemmy', () => {
  const URL_USER = `GET https://${HOST}/api/v3/user?username=alice&limit=1`;
  const URL_ACTOR = `GET https://${HOST}/u/alice`;
  const base = (version = '0.19.21') => ({ ...routesNodeinfo(HOST, 'lemmy', version), ...routesWebfinger('alice', HOST) });
  const person = (fields) => ({ json: { person_view: { person: { banned: false, deleted: false, name: 'alice', ...fields } } } });

  test('Reports an active account', async () => {
    assert.strictEqual((await check({ ...base(), [URL_USER]: person() })).status, STATUS.ACTIVE);
  });

  test('Reports a permanent ban', async () => {
    const result = await check({ ...base(), [URL_USER]: person({ banned: true }) });
    assert.strictEqual(result.status, STATUS.SUSPENDED);
    assert.strictEqual(result.banExpires, null);
  });

  test('Reports a temporary ban with its end', async () => {
    const result = await check({ ...base(), [URL_USER]: person({ ban_expires: '2030-01-01T00:00:00Z', banned: true }) });
    assert.strictEqual(result.banExpires, '2030-01-01T00:00:00Z');
  });

  test('Reports a deletion from the tombstone', async () => {
    const result = await check({ ...base(), [URL_USER]: { json: { error: 'couldnt_find_person' }, status: 404 }, [URL_ACTOR]: { status: 410 } });
    assert.strictEqual(result.status, STATUS.DELETED);
  });

  test('Reports a missing account', async () => {
    const result = await check({ ...base(), [URL_USER]: { json: { error: 'couldnt_find_person' }, status: 404 }, [URL_ACTOR]: { status: 400 } });
    assert.strictEqual(result.status, STATUS.NOT_FOUND);
  });

  test('Treats the older HTTP 400 error as missing', async () => {
    const result = await check({ ...base(), [URL_USER]: { json: { error: 'couldnt_find_person' }, status: 400 }, [URL_ACTOR]: { status: 404 } });
    assert.strictEqual(result.status, STATUS.NOT_FOUND);
  });

  test('Falls back to existence only on untested major versions', async () => {
    const result = await check(base('1.0.0'));
    assert.strictEqual(result.status, STATUS.UNDETERMINED);
  });
});

describe('`checkAccount` on Misskey', () => {
  const URL_SHOW = `POST https://${HOST}/api/users/show`;
  const base = (name = 'misskey') => ({ ...routesNodeinfo(HOST, name, '2026.1.0'), ...routesWebfinger('alice', HOST) });

  test('Reports an active account', async () => {
    assert.strictEqual((await check({ ...base(), [URL_SHOW]: { json: { isSilenced: false, isSuspended: false } } })).status, STATUS.ACTIVE);
  });

  test('Reports a silenced account as limited', async () => {
    assert.strictEqual((await check({ ...base(), [URL_SHOW]: { json: { isSilenced: true, isSuspended: false } } })).status, STATUS.LIMITED);
  });

  test('Reports a moved account', async () => {
    assert.strictEqual((await check({ ...base(), [URL_SHOW]: { json: { isSuspended: false, movedTo: 'abc' } } })).status, STATUS.MOVED);
  });

  test('Reports an exposed suspension', async () => {
    assert.strictEqual((await check({ ...base(), [URL_SHOW]: { json: { isSuspended: true } } })).status, STATUS.SUSPENDED);
  });

  test('Never claims a missing account was not suspended', async () => {
    const result = await check({
      ...routesNodeinfo(HOST, 'misskey', '2026.1.0'),
      ...routesWebfingerStatus('alice', HOST, 404),
      [URL_SHOW]: { json: { error: {} }, status: 404 }
    });
    assert.strictEqual(result.status, STATUS.UNAVAILABLE);
    assert.match(result.notes.join(' '), /suspended/);
  });

  test('Handles Sharkey as Misskey', async () => {
    assert.strictEqual((await check({ ...base('sharkey'), [URL_SHOW]: { json: { isSilenced: true } } })).status, STATUS.LIMITED);
  });

  test('Sends the username as JSON', async () => {
    const { calls, fetcher } = createFetcher({ ...base(), [URL_SHOW]: { json: {} } });
    await checkAccount(HANDLE, { fetcher });
    assert.strictEqual(calls.find(call => call.method === 'POST').init.body, '{"username":"alice"}');
  });
});

describe('`checkAccount` on other software', () => {
  for (const name of ['akkoma', 'pleroma', 'gotosocial', 'pixelfed']) {
    test(`Never reports ${name} accounts as active`, async () => {
      const result = await check({ ...routesNodeinfo(HOST, name, '1.0.0'), ...routesWebfinger('alice', HOST) });
      assert.strictEqual(result.status, STATUS.UNDETERMINED);
      assert.strictEqual(result.confidence, 'low');
    });
  }

  for (const name of ['constructor', '__proto__', 'tostring']) {
    test(`Treats the software name “${name}” as unknown software`, async () => {
      const result = await check({ ...routesNodeinfo(HOST, name, '1.0.0'), ...routesWebfinger('alice', HOST) });
      assert.strictEqual(result.status, STATUS.UNDETERMINED);
      assert.doesNotMatch(result.notes.join(' '), /function/);
    });
  }

  test('Reports an unresolvable handle as unavailable', async () => {
    const result = await check({ ...routesNodeinfo(HOST, 'gotosocial', '0.20.0'), ...routesWebfingerStatus('alice', HOST, 404) });
    assert.strictEqual(result.status, STATUS.UNAVAILABLE);
  });

  test('Checks existence when NodeInfo is missing', async () => {
    const result = await check(routesWebfinger('alice', HOST));
    assert.strictEqual(result.status, STATUS.UNDETERMINED);
    assert.strictEqual(result.software, null);
  });

  test('Reports an unreachable server as unknown', async () => {
    const result = await check({});
    assert.strictEqual(result.status, STATUS.UNKNOWN);
  });

  test('Reports a closed WebFinger as undetermined', async () => {
    const result = await check({ ...routesNodeinfo(HOST, 'gotosocial', '0.20.0'), ...routesWebfingerStatus('alice', HOST, 403) });
    assert.strictEqual(result.status, STATUS.UNDETERMINED);
  });
});

describe('`checkAccount` result', () => {
  test('Includes a headline, explanation, and request log', async () => {
    const result = await check({
      ...routesNodeinfo(HOST, 'mastodon', '4.7.5'),
      ...routesWebfinger('alice', HOST),
      [URL_LOOKUP]: { json: { limited: true } }
    });
    assert.strictEqual(result.headline, `Limited by ${HOST}`);
    assert.ok(result.explanation.length > 0);
    assert.ok(result.requests.length >= 3);
    assert.ok(!Number.isNaN(Date.parse(result.checkedAt)));
  });

  test('Rejects invalid handles', async () => {
    await assert.rejects(checkAccount('nonsense', { fetcher: createFetcher({}).fetcher }), InputError);
  });
});