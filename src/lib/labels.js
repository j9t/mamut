const LABELS_ACCOUNT = {
  inconclusive: 'No answer',
  limited: 'Limited here',
  suspended: 'Suspended here',
  'unknown-here': 'Not known here',
  visible: 'Visible here'
};

const LABELS_DOMAIN_BLOCK = {
  inconclusive: 'No answer',
  noop: 'Listed, no restriction',
  'not-listed': 'Not listed',
  private: 'List isn’t public',
  silence: 'Whole server limited',
  suspend: 'Whole server blocked'
};

/** Words one other server’s report for display */
export const describeServer = ({ account, domainBlock, domainBlockComment, softwareLabel, supported }) => {
  if (!supported) {
    return {
      account: softwareLabel ? `Not available on ${softwareLabel}` : 'Server couldn’t be identified',
      domainBlock: '',
      reason: ''
    };
  }
  return {
    account: LABELS_ACCOUNT[account] ?? account,
    domainBlock: LABELS_DOMAIN_BLOCK[domainBlock] ?? domainBlock,
    reason: domainBlockComment ?? ''
  };
};

const isRestricted = ({ account, domainBlock }) =>
  account === 'limited' || account === 'suspended' || domainBlock === 'silence' || domainBlock === 'suspend';

/**
 * Sums up how many other servers restrict the account or its home server
 * @param {{account?: string, domainBlock?: string, supported: boolean}[]} servers
 */
export const describeRestrictions = (servers) => {
  const checked = servers.filter(entry => entry.supported);
  const restricted = checked.filter(isRestricted);
  if (!restricted.length) return '';
  return `Limited or blocked on ${restricted.length} of ${checked.length} ${checked.length === 1 ? 'server' : 'servers'} checked.`;
};

/** @param {{failure: string | null, method: string, status: number | null, url: string}} request */
export const describeRequest = ({ failure, method, status, url }) => `${method} ${url} ${status ?? failure}`;