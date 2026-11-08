import { describe, test } from 'node:test';
import assert from 'node:assert';
import { describeRestrictions, describeServer } from '../src/lib/labels.js';

const entry = (account, domainBlock) => ({ account, domainBlock, supported: true });
const unsupported = { supported: false };

describe('`describeServer`', () => {
  test('Labels every account state', () => {
    const labels = new Map([
      ['inconclusive', 'No answer'],
      ['limited', 'Limited here'],
      ['suspended', 'Suspended here'],
      ['unknown-here', 'Not known here'],
      ['visible', 'Visible here']
    ]);
    for (const [account, label] of labels) {
      assert.strictEqual(describeServer(entry(account, 'not-listed')).account, label);
    }
  });

  test('Labels every domain block state', () => {
    const labels = new Map([
      ['inconclusive', 'No answer'],
      ['noop', 'Listed, no restriction'],
      ['not-listed', 'Not listed'],
      ['private', 'List isn’t public'],
      ['silence', 'Whole server limited'],
      ['suspend', 'Whole server blocked']
    ]);
    for (const [domainBlock, label] of labels) {
      assert.strictEqual(describeServer(entry('visible', domainBlock)).domainBlock, label);
    }
  });

  test('Passes on the reason for a block', () => {
    assert.strictEqual(describeServer({ ...entry('visible', 'suspend'), domainBlockComment: 'Spam' }).reason, 'Spam');
  });

  test('Names the software of a server that can’t report', () => {
    assert.deepStrictEqual(describeServer({ softwareLabel: 'Misskey', supported: false }), { account: 'Not available on Misskey', domainBlock: '', reason: '' });
  });

  test('Says when a server can’t be identified', () => {
    assert.strictEqual(describeServer(unsupported).account, 'Server couldn’t be identified');
  });
});

describe('`describeRestrictions`', () => {
  test('Counts limited and suspended accounts', () => {
    const servers = [entry('limited', 'not-listed'), entry('suspended', 'private'), entry('visible', 'not-listed')];
    assert.strictEqual(describeRestrictions(servers), 'Limited or blocked on 2 of 3 servers checked.');
  });

  test('Counts blocks of the account’s whole server', () => {
    const servers = [entry('unknown-here', 'suspend'), entry('unknown-here', 'silence')];
    assert.strictEqual(describeRestrictions(servers), 'Limited or blocked on 2 of 2 servers checked.');
  });

  test('Counts a server only once', () => {
    assert.strictEqual(describeRestrictions([entry('limited', 'silence')]), 'Limited or blocked on 1 of 1 server checked.');
  });

  test('Ignores servers that can’t report', () => {
    assert.strictEqual(describeRestrictions([entry('limited', 'silence'), unsupported]), 'Limited or blocked on 1 of 1 server checked.');
  });

  test('Ignores listed domains without restrictions', () => {
    assert.strictEqual(describeRestrictions([entry('visible', 'noop')]), '');
  });

  test('Returns nothing without restrictions', () => {
    assert.strictEqual(describeRestrictions([entry('visible', 'not-listed'), entry('unknown-here', 'private')]), '');
  });

  test('Returns nothing without servers', () => {
    assert.strictEqual(describeRestrictions([]), '');
  });
});