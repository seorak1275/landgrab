import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeState, capitalOf, settle } from './helpers.js';
import { PLAYER, NEUTRAL } from '../src/world.js';
import { neighborIds, battleParty } from '../src/sim.js';
import { aiPeriod, aiAct, runAi, AI_GATHER_EVERY } from '../src/ai.js';

test('주기: 기본 8초, 둔화 2레벨이면 8×1.16', () => {
  assert.equal(aiPeriod(makeState()), 8);
  assert.equal(aiPeriod(makeState(1, 0, { aiSlow: 2 })), 8 * 1.16);
});

test('골드 있으면 가장 낮은 레벨 타일을 업그레이드(주기당 최대 2회)', () => {
  const s = makeState();
  s.run.gold[1] = 100000;
  aiAct(s, 1);
  assert.equal(capitalOf(s, 1).level, 3);
});

test('유리할 때만 공격: 0.8×병사 > 1.4×방어', () => {
  const s = makeState();
  const c = capitalOf(s, 1);
  const n = s.run.tiles[neighborIds(s.run, c)[0]];
  n.terrain = 'plain'; n.soldiers = 10; c.soldiers = 17; // 13.6 ≤ 14 → 안 함
  aiAct(s, 1);
  assert.equal(n.owner, NEUTRAL);
  c.soldiers = 18; // 14.4 > 14 → 공격
  aiAct(s, 1);
  assert.equal(s.run.armies.length, 1); assert.equal(s.run.armies[0].owner, 1);
  settle(s);
  assert.equal(n.owner, 1);
});

test('우선순위: 중립 > 플레이어, 같은 부류면 약한 쪽', () => {
  const s = makeState();
  const c = capitalOf(s, 1);
  const [a, b, d] = neighborIds(s.run, c).map(id => s.run.tiles[id]);
  for (const t of [a, b, d]) t.terrain = 'plain';
  a.owner = PLAYER; a.soldiers = 1;
  b.owner = NEUTRAL; b.soldiers = 5;
  d.owner = NEUTRAL; d.soldiers = 3;
  c.soldiers = 100;
  aiAct(s, 1); // 최대 2회: 중립 약한 순 d, b
  settle(s);
  assert.equal(d.owner, 1);
  assert.equal(b.owner, 1);
  assert.equal(a.owner, PLAYER);
});

test('보강: 내부 타일이 한도 절반 이상이면 가장 약한 국경 타일로 절반 이동', () => {
  const s = makeState();
  for (const t of s.run.tiles) { t.owner = 1; t.soldiers = 1; }
  const inner = s.run.tiles.find(t => t.q === 0 && t.r === 0);
  const ring = neighborIds(s.run, inner).map(id => s.run.tiles[id]);
  // ring[0]의 이웃 중 inner도 ring도 아닌 타일 하나를 플레이어 땅으로 → ring[0]만 국경
  const outerId = neighborIds(s.run, ring[0]).find(id => id !== inner.id && !ring.some(r => r.id === id));
  const outer = s.run.tiles[outerId];
  outer.owner = PLAYER; outer.soldiers = 1000; // 공격 불가하게 크게
  inner.soldiers = 30; inner.level = 1; inner.terrain = 'plain'; // cap 20 → 절반 이상
  s.run.gold[1] = 0;
  aiAct(s, 1);
  settle(s);
  assert.equal(inner.soldiers, 15);
  assert.equal(ring[0].soldiers, 16);
});

test('집결 공격: 한 타일로는 못 치는 땅을, AI_GATHER_EVERY 주기마다 이어진 땅 전체에서 40%씩 모아 친다 (여유 1.5배)', () => {
  const s = makeState();
  const run = s.run; s.run.gold[1] = 0;
  // AI 땅: 수도 + 이웃 2칸 (셋 다 40명), 그 옆 중립 평지 40명 (D=40: 한 타일 32 < 56, 셋이 40%씩 모으면 48 ≤ 60 → 못 침)
  const c = capitalOf(s, 1); const [n1, n2, target] = neighborIds(run, c).map(id => run.tiles[id]);
  for (const t of [c, n1, n2]) { t.owner = 1; t.soldiers = 40; t.terrain = 'plain'; }
  target.owner = -1; target.terrain = 'plain'; target.soldiers = 40;
  for (const t of run.tiles) if (t.owner === -1 && t !== target) t.soldiers = 500; // 다른 중립은 너무 세게
  run.aiTurns = [0, AI_GATHER_EVERY - 1];
  aiAct(s, 1);
  assert.equal(run.armies.length, 0, '48 ≤ 40×1.5 → 집결해도 안 침');
  for (const t of [c, n1, n2]) t.soldiers = 60; // 3×24 = 72 > 60 → 집결
  run.aiTurns = [0, AI_GATHER_EVERY - 1];
  aiAct(s, 1);
  assert.equal(run.armies.length, 3);
  assert.ok(run.armies.every(a => a.owner === 1 && Math.abs(a.soldiers - 24) < 1e-9 && a.path[a.path.length - 1] === target.id));
  settle(s);
  assert.equal(target.owner, 1); assert.ok(Math.abs(target.soldiers - 32) < 1e-6, `${target.soldiers}`); // 72 − 40
  // 집결 주기가 아니면 안 한다
  for (const t of [c, n1, n2]) t.soldiers = 60; target.owner = -1; target.soldiers = 40;
  run.aiTurns = [0, AI_GATHER_EVERY]; // 다음 act는 AI_GATHER_EVERY+1번째
  aiAct(s, 1);
  assert.equal(run.armies.length, 0);
});

test('runAi: 타이머로 주기마다 발동, 타일 없는 세력은 건너뜀', () => {
  const s = makeState();
  s.run.gold[1] = 100000; s.run.gold[2] = 100000;
  for (const t of s.run.tiles) if (t.owner === 2) t.owner = NEUTRAL;
  runAi(s, 0.25);           // timer 0 → 즉시 1회
  assert.equal(capitalOf(s, 1).level, 3);
  runAi(s, 7.5);            // 아직 8초 안 됨
  assert.equal(capitalOf(s, 1).level, 3);
  runAi(s, 0.5);
  assert.equal(capitalOf(s, 1).level, 5);
});
