import { checkGeneric } from './lib/adapters/generic.js';
import { checkLemmy } from './lib/adapters/lemmy.js';
import { checkMastodon } from './lib/adapters/mastodon.js';
import { checkMisskey } from './lib/adapters/misskey.js';
import { detectSoftware, resolveWebfinger } from './lib/discovery.js';
import { createClient } from './lib/http.js';
import { InputError, parseHandle, parseServers } from './lib/input.js';
import { checkOnServer, SERVERS_MAJOR } from './lib/servers.js';
import { describeResult, fromInconclusive } from './lib/status.js';

export { InputError, SERVERS_MAJOR };

const ADAPTERS = new Map([
  ['hometown', checkMastodon],
  ['lemmy', checkLemmy],
  ['mastodon', checkMastodon],
  ['misskey', checkMisskey],
  ['sharkey', checkMisskey]
]);

/**
 * Checks what a Fediverse server publicly reports about an account
 * @param {string} input Handle or profile URL
 * @param {{fetcher?: typeof fetch, servers?: string | string[], signal?: AbortSignal}} [options]
 */
export const checkAccount = async (input, { fetcher, servers, signal } = {}) => {
  const account = parseHandle(input);
  const serversRequested = parseServers(servers);
  const client = createClient({ fetcher, signal });

  const webfinger = await resolveWebfinger(client, account);
  const host = webfinger.host ?? account.domain;
  const software = await detectSoftware(client, host);

  const outcome = !software && webfinger.response.failure
    ? fromInconclusive(webfinger.response)
    : await (ADAPTERS.get(software?.name) ?? checkGeneric)({ client, host, software, username: account.username, webfinger });

  const domains = [...new Set([account.domain, host])];
  const serversOther = serversRequested.filter(server => !domains.includes(server));
  const serversChecked = await Promise.all(serversOther.map(server => checkOnServer(client, server, account, domains)));

  const result = {
    account: { ...account, urlProfile: webfinger.urlProfile },
    banExpires: outcome.banExpires ?? null,
    checkedAt: new Date().toISOString(),
    confidence: outcome.confidence,
    host,
    movedTo: outcome.movedTo ?? null,
    notes: outcome.notes,
    requests: client.requests,
    servers: serversChecked,
    software,
    status: outcome.status
  };
  return { ...result, ...describeResult(result) };
};