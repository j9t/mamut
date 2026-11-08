import { isPublicHostname } from './input.js';

const PATTERN_ACTIVITY_TYPE = /activity\+json|ld\+json/;
const PATTERN_NODEINFO_SCHEMA = /nodeinfo\.diaspora\.software\/ns\/schema\/(\d+(?:\.\d+)?)$/;
const REL_PROFILE = 'http://webfinger.net/rel/profile-page';
const STATUSES_ABSENT = new Set([400, 404, 410]);

/** @param {unknown} value */
const parsePublicUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && isPublicHostname(url.hostname) ? url : null;
  } catch {
    return null;
  }
};

/**
 * Finds the account and its actual server, which can differ from the handle’s domain
 * @returns {Promise<{found: boolean | null, host: string | null, response: object, urlActor: string | null, urlProfile: string | null}>}
 */
export const resolveWebfinger = async (client, { domain, username }) => {
  const resource = encodeURIComponent(`acct:${username}@${domain}`);
  const response = await client.request(`https://${domain}/.well-known/webfinger?resource=${resource}`, { accept: 'application/jrd+json' });

  const links = Array.isArray(response.json?.links) ? response.json.links : [];
  const urlActor = parsePublicUrl(links.find(link => link?.rel === 'self' && PATTERN_ACTIVITY_TYPE.test(link?.type))?.href);
  const urlProfile = parsePublicUrl(links.find(link => link?.rel === REL_PROFILE)?.href);

  let found = null;
  if (response.status === 200 && response.json) found = true;
  else if (STATUSES_ABSENT.has(response.status)) found = false;

  // Keeps the page from linking to wherever a hostile server points
  const isProfileOnServer = urlProfile && [domain, urlActor?.hostname].includes(urlProfile.hostname);

  return { found, host: urlActor?.hostname ?? null, response, urlActor: urlActor?.href ?? null, urlProfile: isProfileOnServer ? urlProfile.href : null };
};

/** @returns {Promise<{name: string, version: string | null} | null>} */
export const detectSoftware = async (client, host) => {
  const { json } = await client.request(`https://${host}/.well-known/nodeinfo`);
  const links = Array.isArray(json?.links) ? json.links : [];

  const [newest] = links
    .map(link => ({ schema: Number(String(link?.rel).match(PATTERN_NODEINFO_SCHEMA)?.[1]), url: parsePublicUrl(link?.href) }))
    .filter(link => link.schema && link.url)
    .sort((a, b) => b.schema - a.schema);
  if (!newest) return null;

  const { json: nodeinfo } = await client.request(newest.url.href);
  const { name, version } = nodeinfo?.software ?? {};
  return typeof name === 'string' ? { name: name.toLowerCase(), version: typeof version === 'string' ? version : null } : null;
};