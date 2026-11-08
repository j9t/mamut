import { detectSoftware } from './discovery.js';
import { labelSoftware } from './status.js';

// The most active servers on joinmastodon.org as of November 2026
export const SERVERS_MAJOR = Object.freeze([
  'mastodon.social',
  'mstdn.jp',
  'mstdn.social',
  'infosec.exchange',
  'hachyderm.io',
  'mastodon.world',
  'troet.cafe',
  'techhub.social'
]);

export const SOFTWARE_MASTODON = new Set(['hometown', 'mastodon']);

const SEVERITY_RANK = new Map([['noop', 0], ['silence', 1], ['suspend', 2]]);
const STATUSES_PRIVATE = new Set([401, 403, 404]);

/**
 * Ticks the account’s own server, and unticks it again once the domain changes; manual choices stay
 * @param {{auto: boolean, checked: boolean, server: string}[]} entries
 * @param {string | null} domain
 */
export const syncHomeServer = (entries, domain) => {
  for (const entry of entries) {
    if (entry.server === domain) {
      if (!entry.auto && !entry.checked) {
        entry.auto = true;
        entry.checked = true;
      }
    } else if (entry.auto) {
      entry.auto = false;
      entry.checked = false;
    }
  }
};

/** @param {string} value */
const hashSha256 = async (value) => {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
};

/** @param {string} domain */
const expandParents = (domain) => {
  const labels = domain.split('.');
  return labels.slice(0, -1).map((_, index) => labels.slice(index).join('.'));
};

/**
 * Compares digests too, as servers can mask part of a blocked domain’s name
 * @param {unknown} blocks
 * @param {string[]} domains
 */
export const matchDomainBlock = async (blocks, domains) => {
  const candidates = [...new Set(domains.flatMap(expandParents))];
  const digests = new Set(await Promise.all(candidates.map(hashSha256)));

  const matches = (Array.isArray(blocks) ? blocks : [])
    .filter(block => SEVERITY_RANK.has(block?.severity) && (candidates.includes(block.domain) || digests.has(block.digest)))
    .sort((a, b) => SEVERITY_RANK.get(b.severity) - SEVERITY_RANK.get(a.severity));
  return matches[0] ?? null;
};

const interpretAccount = ({ failure, json, status }) => {
  if (failure || status !== 200 && status !== 404) return 'inconclusive';
  // Lookup only finds accounts a server already knows, so a 404 says nothing
  if (status === 404) return 'unknown-here';
  if (json?.suspended) return 'suspended';
  return json?.limited ? 'limited' : 'visible';
};

const interpretBlocks = async ({ failure, json, status }, domains) => {
  if (STATUSES_PRIVATE.has(status)) return { domainBlock: 'private', domainBlockComment: null };
  if (failure || status !== 200 || !Array.isArray(json)) return { domainBlock: 'inconclusive', domainBlockComment: null };
  const match = await matchDomainBlock(json, domains);
  return { domainBlock: match?.severity ?? 'not-listed', domainBlockComment: match?.comment || null };
};

/** Reports how one other server treats an account, which only Mastodon-compatible software exposes */
export const checkOnServer = async (client, server, account, domains) => {
  const software = await detectSoftware(client, server);
  if (!SOFTWARE_MASTODON.has(software?.name)) {
    return { server, softwareLabel: software ? labelSoftware(software) : null, supported: false };
  }

  const [lookup, blocks] = await Promise.all([
    client.request(`https://${server}/api/v1/accounts/lookup?acct=${encodeURIComponent(account.acct)}`),
    client.request(`https://${server}/api/v1/instance/domain_blocks`)
  ]);

  return { account: interpretAccount(lookup), server, softwareLabel: labelSoftware(software), supported: true, ...await interpretBlocks(blocks, domains) };
};