import { CONFIDENCE, fromInconclusive, STATUS } from '../status.js';
import { isAtLeast } from '../version.js';

// Since 4.7, self-deletion no longer sets the same state as a moderator’s suspension
const VERSION_SEPARATE_DELETION = [4, 7, 0];
const USERNAME_CONTROL = 'mamut_control_absent';

const NOTE_AMBIGUOUS = 'Mastodon before 4.7 reports self-deleted accounts as suspended, so the cause is unclear.';

const requestProfile = (client, host, username) =>
  client.request(`https://${host}/@${encodeURIComponent(username)}`, { accept: 'text/html', read: false });

const fromSuspended = async ({ client, host, software, username }) => {
  const { status } = await requestProfile(client, host, username);
  if (status === 403) {
    return { confidence: CONFIDENCE.HIGH, notes: ['The account’s data is still kept, so the suspension can be reversed.'], status: STATUS.SUSPENDED };
  }
  if (!isAtLeast(software.version, VERSION_SEPARATE_DELETION)) {
    return { confidence: CONFIDENCE.MEDIUM, notes: [NOTE_AMBIGUOUS], status: STATUS.UNAVAILABLE };
  }
  const notes = status === 410 ? ['The account’s data has been removed.'] : [];
  return { confidence: CONFIDENCE.HIGH, notes, status: STATUS.SUSPENDED };
};

const fromMissing = async ({ client, host, software, username, webfinger }) => {
  const { status } = await requestProfile(client, host, username);

  if (status === 404) {
    if (webfinger.found === false) return { confidence: CONFIDENCE.HIGH, notes: [], status: STATUS.NOT_FOUND };
    return { confidence: CONFIDENCE.MEDIUM, notes: ['The server gives contradicting answers about this account.'], status: STATUS.UNAVAILABLE };
  }

  const canConfirmDeletion = isAtLeast(software.version, VERSION_SEPARATE_DELETION);
  const isGone = status === 410;
  // A firewall can answer 403 for every profile, which a name that can’t exist exposes
  const isPendingDeletion = canConfirmDeletion && status === 403 && (await requestProfile(client, host, USERNAME_CONTROL)).status === 404;

  if (canConfirmDeletion && (isGone || isPendingDeletion)) {
    return { confidence: CONFIDENCE.HIGH, notes: [], status: STATUS.DELETED };
  }
  return { confidence: CONFIDENCE.MEDIUM, notes: ['The account’s public profile can’t be read, and the reason is unclear.'], status: STATUS.UNAVAILABLE };
};

const formatMovedTo = (acct, host) => {
  if (!acct || typeof acct !== 'string') return null;
  return acct.includes('@') ? `@${acct}` : `@${acct}@${host}`;
};

const fromAccount = (account, host) => {
  if (account.limited) return { confidence: CONFIDENCE.HIGH, notes: [], status: STATUS.LIMITED };
  if (account.moved) return { confidence: CONFIDENCE.HIGH, movedTo: formatMovedTo(account.moved.acct, host), notes: [], status: STATUS.MOVED };
  if (account.memorial) return { confidence: CONFIDENCE.HIGH, notes: [], status: STATUS.MEMORIAL };
  return { confidence: CONFIDENCE.HIGH, notes: [], status: STATUS.ACTIVE };
};

export const checkMastodon = async (context) => {
  const { client, host, username } = context;
  const lookup = await client.request(`https://${host}/api/v1/accounts/lookup?acct=${encodeURIComponent(username)}`);

  if (lookup.status === 404) return fromMissing(context);
  if (lookup.status !== 200 || !lookup.json) return fromInconclusive(lookup);
  return lookup.json.suspended ? fromSuspended(context) : fromAccount(lookup.json, host);
};