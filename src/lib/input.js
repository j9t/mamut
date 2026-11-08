const SERVERS_MAX = 20;
const SUFFIXES_PRIVATE = ['.corp', '.home', '.home.arpa', '.internal', '.intranet', '.lan', '.local', '.localhost'];

const PATTERN_HANDLE_BARE = /^[^\s@/:]+@[^\s@/:]+$/;
const PATTERN_PROFILE_PATH = /^\/(?:@|users\/|u\/)([^/@]+)(?:@([^/]+))?\/?$/;
const PATTERN_USERNAME = /^[^\s@/?#]+$/;

const HINT_HANDLE = 'Enter a handle like @name@server.example or a profile URL';

export class InputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InputError';
  }
}

/** @param {string} hostname */
export const isPublicHostname = (hostname) => {
  if (!hostname.includes('.') || hostname.endsWith('.')) return false;
  // Covers IPv4 in all notations, whose last label is always numeric or hexadecimal
  if (/^(?:\d+|0x[\da-f]+)$/i.test(hostname.split('.').at(-1))) return false;
  return !SUFFIXES_PRIVATE.some(suffix => hostname.endsWith(suffix));
};

/** @param {string} value */
const normalizeHostname = (value) => {
  if (/[/?#:\\\s@]/.test(value) || !value) return null;
  try {
    const { hostname } = new URL(`https://${value}`);
    return isPublicHostname(hostname) ? hostname : null;
  } catch {
    return null;
  }
};

/** @param {string} value */
const splitProfileUrl = (value) => {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const match = url.pathname.match(PATTERN_PROFILE_PATH);
  if (!match) return null;
  try {
    return [decodeURIComponent(match[1]), match[2] ?? url.hostname];
  } catch {
    return null;
  }
};

/**
 * Adds the leading “@” to `user@domain`, leaving everything else as entered
 * @param {string} input
 */
export const correctHandle = (input) => {
  const value = input.trim();
  return PATTERN_HANDLE_BARE.test(value) ? `@${value}` : input;
};

/**
 * Accepts `@user@domain`, `user@domain`, `acct:user@domain`, and common profile URLs
 * @param {string} input
 * @returns {{acct: string, domain: string, handle: string, username: string}} `acct` is the form protocols use
 */
export const parseHandle = (input) => {
  const value = String(input ?? '').trim().replace(/^acct:/i, '');
  const parts = /^https?:\/\//i.test(value) ? splitProfileUrl(value) : value.replace(/^@/, '').split('@');
  if (parts?.length !== 2 || !PATTERN_USERNAME.test(parts[0])) throw new InputError(HINT_HANDLE);

  const [username, domainRaw] = parts;
  const domain = normalizeHostname(domainRaw);
  if (!domain) throw new InputError(`“${domainRaw}” isn’t a public server address. ${HINT_HANDLE}`);
  return { acct: `${username}@${domain}`, domain, handle: `@${username}@${domain}`, username };
};

/**
 * @param {string} input
 * @returns {string | null} The handle’s domain, while it’s still being typed too
 */
export const readDomain = (input) => {
  try {
    return parseHandle(input).domain;
  } catch {
    return null;
  }
};

/**
 * @param {string | string[] | undefined} input Comma-, space-, or newline-separated servers
 * @returns {string[]}
 */
export const parseServers = (input) => {
  const values = (Array.isArray(input) ? input : String(input ?? '').split(/[\s,]+/))
    .map(value => value.trim().replace(/^https?:\/\//i, '').replace(/\/$/, ''))
    .filter(Boolean);

  const servers = [...new Set(values.map((value) => {
    const hostname = normalizeHostname(value);
    if (!hostname) throw new InputError(`“${value}” isn’t a public server address`);
    return hostname;
  }))];

  if (servers.length > SERVERS_MAX) throw new InputError(`Compare with up to ${SERVERS_MAX} servers at a time`);
  return servers;
};