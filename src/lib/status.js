export const STATUS = Object.freeze({
  ACTIVE: 'active',
  DELETED: 'deleted',
  LIMITED: 'limited',
  MEMORIAL: 'memorial',
  MOVED: 'moved',
  NOT_FOUND: 'not-found',
  SUSPENDED: 'suspended',
  UNAVAILABLE: 'unavailable',
  UNDETERMINED: 'undetermined',
  UNKNOWN: 'unknown'
});

export const CONFIDENCE = Object.freeze({ HIGH: 'high', LOW: 'low', MEDIUM: 'medium' });

// A map, as servers supply the keys and can send names like `constructor`
const NAMES_SOFTWARE = new Map([
  ['akkoma', 'Akkoma'],
  ['gotosocial', 'GoToSocial'],
  ['hometown', 'Hometown'],
  ['lemmy', 'Lemmy'],
  ['mastodon', 'Mastodon'],
  ['misskey', 'Misskey'],
  ['pixelfed', 'Pixelfed'],
  ['pleroma', 'Pleroma'],
  ['sharkey', 'Sharkey']
]);

const REASONS_FAILURE = new Map([
  ['timeout', 'The server took too long to respond.'],
  ['too-large', 'The server sent an unusually large response.']
]);

/** @param {{name: string} | null} software */
export const labelSoftware = (software) => {
  if (!software) return 'This server';
  return NAMES_SOFTWARE.get(software.name) ?? software.name.charAt(0).toUpperCase() + software.name.slice(1);
};

/** Interprets a response that says nothing about the account itself */
export const fromInconclusive = ({ failure, status }) => {
  if (failure) {
    const reason = REASONS_FAILURE.get(failure) ?? 'The server couldn’t be reached, or it refused this kind of request.';
    return { confidence: CONFIDENCE.LOW, notes: [reason], status: STATUS.UNKNOWN };
  }
  if (status === 429) return { confidence: CONFIDENCE.LOW, notes: ['The server is rate-limiting requests. Try again in a few minutes.'], status: STATUS.UNKNOWN };
  if (status >= 500) return { confidence: CONFIDENCE.LOW, notes: [`The server reported an error (HTTP ${status}).`], status: STATUS.UNKNOWN };
  const reason = status === 401 || status === 403 ? 'The server doesn’t answer anonymous requests about accounts.' : `The server gave no usable answer (HTTP ${status}).`;
  return { confidence: CONFIDENCE.LOW, notes: [reason], status: STATUS.UNDETERMINED };
};

/** @returns {{explanation: string, headline: string}} */
export const describeResult = ({ account: { domain }, movedTo, status }) => {
  switch (status) {
    case STATUS.ACTIVE:
      return { explanation: 'Its home server reports no suspension or limit on this account.', headline: `Active on ${domain}` };
    case STATUS.DELETED:
      return { explanation: 'The account was removed by its owner, not by moderators.', headline: 'Deleted by its owner' };
    case STATUS.LIMITED:
      return { explanation: 'Moderators have restricted this account’s visibility on its home server.', headline: `Limited by ${domain}` };
    case STATUS.MEMORIAL:
      return { explanation: 'The account is preserved in memory of its owner.', headline: 'Memorialized' };
    case STATUS.MOVED:
      return { explanation: 'The owner has moved this account elsewhere.', headline: movedTo ? `Moved to ${movedTo}` : 'Moved to another account' };
    case STATUS.NOT_FOUND:
      return { explanation: 'This server has no account with this name. Check the spelling and the server.', headline: `Not found on ${domain}` };
    case STATUS.SUSPENDED:
      return { explanation: 'Moderators have suspended this account on its home server.', headline: `Suspended by ${domain}` };
    case STATUS.UNAVAILABLE:
      return { explanation: 'The account can’t be found, and the server doesn’t reveal why.', headline: `Unavailable on ${domain}` };
    case STATUS.UNDETERMINED:
      return { explanation: `It isn’t public whether this account is limited or suspended on ${domain}, so it may or may not be in good standing.`, headline: 'Status not public' };
    default:
      return { explanation: 'Mamut couldn’t get an answer, so nothing can be said about this account.', headline: `Couldn’t check ${domain}` };
  }
};