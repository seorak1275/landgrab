import { test } from 'node:test';
import assert from 'node:assert/strict';
import { neighbors, distance, tilesInRadius, corners, hexToPixel, pixelToHex } from '../src/hex.js';
import { mulberry32, pick } from '../src/rng.js';

test('이웃은 6개이고 거리는 1', () => {
  const n = neighbors(0, 0);
  assert.equal(n.length, 6);
  for (const h of n) assert.equal(distance([0, 0], h), 1);
});

test('반지름별 타일 수 = 3R(R+1)+1', () => {
  for (const R of [3, 4, 5, 6]) assert.equal(tilesInRadius(R).length, 3 * R * (R + 1) + 1);
});

test('꼭짓점은 중심에서 R, 인접 꼭짓점끼리 R, 마주보면 2R', () => {
  const c = corners(3);
  assert.equal(c.length, 6);
  for (const p of c) assert.equal(distance([0, 0], p), 3);
  assert.equal(distance(c[0], c[1]), 3);
  assert.equal(distance(c[0], c[3]), 6);
});

test('픽셀 변환은 왕복한다', () => {
  for (const [q, r] of tilesInRadius(4)) {
    const [x, y] = hexToPixel(q, r, 36);
    assert.deepEqual(pixelToHex(x + 3, y - 2, 36), [q, r]);
  }
});

test('시드 난수는 재현되고 가중 선택은 범위 안', () => {
  const a = mulberry32(42), b = mulberry32(42);
  assert.equal(a(), b());
  const r = mulberry32(1);
  for (let i = 0; i < 100; i++) assert.ok(['x', 'y'].includes(pick(r, [['x', 1], ['y', 3]])));
});
