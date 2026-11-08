import { describe, test } from 'node:test';
import assert from 'node:assert';
import { createCooldown } from '../src/lib/cooldown.js';

describe('createCooldown', () => {
  const setup = () => {
    let time = 1000;
    return { advance: (ms) => { time += ms; }, tryStart: createCooldown(3000, () => time) };
  };

  test('Allows the first start', () => {
    assert.strictEqual(setup().tryStart(), true);
  });

  test('Refuses a start within the interval', () => {
    const { advance, tryStart } = setup();
    tryStart();
    advance(2999);
    assert.strictEqual(tryStart(), false);
  });

  test('Allows a start after the interval', () => {
    const { advance, tryStart } = setup();
    tryStart();
    advance(3000);
    assert.strictEqual(tryStart(), true);
  });

  test('Does not extend the interval on a refused start', () => {
    const { advance, tryStart } = setup();
    tryStart();
    advance(2000);
    tryStart();
    advance(1000);
    assert.strictEqual(tryStart(), true);
  });
});