import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeState } from './helpers.js';
import { PLAYER } from '../src/world.js';
import { tick } from '../src/sim.js';
import { runAi } from '../src/ai.js';
import { offlineCapSeconds, simulateOffline } from '../src/offline.js';

test('상한: 8시간 + 4시간×레벨', () => {
  assert.equal(offlineCapSeconds(makeState()), 8 * 3600);
  assert.equal(offlineCapSeconds(makeState(1, 0, { offline: 4 })), 24 * 3600);
});

test('생산만 있을 때 굵은 틱 결과는 잔 틱과 일치', () => {
  const a = makeState(3), b = makeState(3);
  a.run.factions = 1; b.run.factions = 1; // AI 없이 생산만
  const r = simulateOffline(a, 3600);
  for (let i = 0; i < 3600 * 4; i++) tick(b, 0.25);
  assert.ok(Math.abs(a.run.gold[PLAYER] - b.run.gold[PLAYER]) < 1e-6);
  assert.equal(r.seconds, 3600);
  assert.ok(Math.abs(r.goldGained - (b.run.gold[PLAYER] - 100)) < 1e-6);
});

test('AI 포함 1시간: 골드가 잔 틱과 ±5% 이내이고 요약이 채워진다', () => {
  const a = makeState(5), b = makeState(5);
  const r = simulateOffline(a, 3600);
  for (let i = 0; i < 3600 * 4; i++) { tick(b, 0.25); runAi(b, 0.25); }
  const ga = a.run.gold[PLAYER], gb = b.run.gold[PLAYER];
  assert.ok(Math.abs(ga - gb) / gb < 0.05, `${ga} vs ${gb}`);
  assert.equal(r.tilesBefore, 1);
  assert.ok(['playing', 'wiped'].includes(r.outcome));
});

test('경과가 상한을 넘으면 상한까지만', () => {
  const s = makeState();
  assert.equal(simulateOffline(s, 100 * 3600).seconds, 8 * 3600);
});
