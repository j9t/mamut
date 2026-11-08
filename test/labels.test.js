import { describe, test } from 'node:test';
import assert from 'node:assert';
import { describeRestrictions } from '../src/lib/labels.js';

const entry = (account, domainBlock) => ({ account, domainBlock, supported: true });
const unsupported = { supported: false };

describe('describeRestrictions', () => {
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