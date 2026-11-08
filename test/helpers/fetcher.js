const SCHEMA_NODEINFO = 'http://nodeinfo.diaspora.software/ns/schema/2.1';

/**
 * Serves canned responses by `METHOD URL`; unlisted routes fail like a CORS or network error
 * @param {Record<string, {status?: number, json?: unknown, networkError?: boolean, timeout?: boolean}>} routes
 */
export const createFetcher = (routes) => {
  const calls = [];
  const fetcher = async (url, init = {}) => {
    const method = init.method ?? 'GET';
    calls.push({ init, method, url: String(url) });
    const route = routes[`${method} ${url}`];
    if (route?.timeout) throw new DOMException('Timed out', 'TimeoutError');
    if (!route || route.networkError) throw new TypeError('Failed to fetch');
    const body = route.json === undefined ? null : JSON.stringify(route.json);
    return new Response(body, { status: route.status ?? 200 });
  };
  return { calls, fetcher };
};

export const routesNodeinfo = (host, name, version) => ({
  [`GET https://${host}/.well-known/nodeinfo`]: {
    json: { links: [{ href: `https://${host}/nodeinfo/2.1`, rel: SCHEMA_NODEINFO }] }
  },
  [`GET https://${host}/nodeinfo/2.1`]: { json: { software: { name, version } } }
});

const urlWebfinger = (username, domain) =>
  `https://${domain}/.well-known/webfinger?resource=${encodeURIComponent(`acct:${username}@${domain}`)}`;

export const routesWebfinger = (username, domain, host = domain) => ({
  [`GET ${urlWebfinger(username, domain)}`]: {
    json: {
      links: [
        { href: `https://${host}/@${username}`, rel: 'http://webfinger.net/rel/profile-page', type: 'text/html' },
        { href: `https://${host}/users/${username}`, rel: 'self', type: 'application/activity+json' }
      ],
      subject: `acct:${username}@${domain}`
    }
  }
});

export const routesWebfingerStatus = (username, domain, status) => ({
  [`GET ${urlWebfinger(username, domain)}`]: { status }
});