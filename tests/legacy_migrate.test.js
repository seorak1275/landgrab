import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEGACY_ITEMS, REMOVED_ITEMS, refundRemoved, itemCost } from '../src/prestige.js';
import { newState, deserialize, VERSION } from '../src/save.js';
import * as rsave from '../src/region/save.js';

// 방치(오프라인 정산)를 없앴으니 '오프라인 한도' 유산은 살 수 없고, 이미 쓴 포인트는 돌려준다
test("유산 상점에 '오프라인 한도'는 없다", () => {
  assert.equal(LEGACY_ITEMS.offline, undefined);
  assert.equal(REMOVED_ITEMS.offline.base, 10);
});

test('refundRemoved: 레벨만큼 누적 비용을 환불하고 레벨을 지운다', () => {
  const legacy = { points: 5, upgrades: { offline: 3, gold: 2 } };
  const back = refundRemoved(legacy);
  assert.equal(back, 10 + 15 + 23); // base 10 × 1.5^0,1,2 (반올림)
  assert.equal(legacy.points, 5 + back);
  assert.equal(legacy.upgrades.offline, undefined);
  assert.equal(legacy.upgrades.gold, 2);
  assert.equal(refundRemoved(legacy), 0); // 두 번 해도 더 주지 않는다
});

test('육각 저장 v3 → v4: 오프라인 유산 환불', () => {
  const s = newState(9);
  assert.equal(s.version, VERSION);
  assert.equal(VERSION, 4);
  s.version = 3; s.legacy.upgrades.offline = 1; s.legacy.points = 0;
  const m = deserialize(JSON.stringify(s));
  assert.equal(m.version, 4);
  assert.equal(m.legacy.points, itemCost('gold', 0) ? 10 : 10); // base 10 한 레벨
  assert.equal(m.legacy.upgrades.offline, undefined);
});

test('사단전 저장도 같은 이관을 한다 (v1 → v2)', () => {
  const s = rsave.newState(9);
  assert.equal(s.version, 2);
  assert.equal(s.run.mode, 'region');
  s.version = 1; s.legacy.upgrades.offline = 2; s.legacy.points = 1;
  const m = rsave.migrate(JSON.parse(JSON.stringify(s)));
  assert.equal(m.version, 2);
  assert.equal(m.legacy.points, 1 + 10 + 15);
  assert.equal(m.legacy.upgrades.offline, undefined);
  assert.equal(rsave.migrate({ version: 99, run: { mode: 'region' }, legacy: {} }), null);
});
