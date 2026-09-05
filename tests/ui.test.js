import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatNum } from '../src/ui.js';
test('숫자 표기', () => {
  assert.equal(formatNum(0), '0');
  assert.equal(formatNum(999.6), '999');
  assert.equal(formatNum(1234), '1,234');
  assert.equal(formatNum(12345), '12.3K');
  assert.equal(formatNum(1234567), '1.23M');
});
