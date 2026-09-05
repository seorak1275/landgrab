import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeState, capitalOf } from './helpers.js';
import { PLAYER, NEUTRAL } from '../src/world.js';
import { neighborIds, cap, goldRate, soldierRate, upgradeCost, tick, upgrade, send, status, tilesOwned, MAX_LEVEL } from '../src/sim.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('꼭짓점 수도는 이웃이 3개', () => {
  const s = makeState();
  assert.equal(neighborIds(s.run, capitalOf(s, PLAYER)).length, 3);
});

test('생산·한도·비용 수식', () => {
  const s = makeState();
  const c = capitalOf(s, PLAYER);
  near(goldRate(s, c), 0.5 * 3 * 1);
  near(soldierRate(s, c), 0.12);
  near(cap(c), 40);
  near(upgradeCost(c), 40 * 3);
  c.level = 3;
  near(upgradeCost(c), 40 * 1.7 ** 2 * 3);
});

test('유산·환생 배율', () => {
  const s = makeState(1, 2, { gold: 3, soldiers: 1, attack: 4 });
  const pc = capitalOf(s, PLAYER), ac = capitalOf(s, 1);
  near(goldRate(s, pc), 1.5 * 1.3);
  near(goldRate(s, ac), 1.5 * 0.95); // AI 기본 0.75 + 환생 2회 0.2
  near(soldierRate(s, pc), 0.12 * 1.1);
  near(soldierRate(s, ac), 0.12 * 0.95);
});

test('tick: 골드 누적, 병사는 한도까지만, 초과분은 유지', () => {
  const s = makeState();
  const c = capitalOf(s, PLAYER);
  tick(s, 10);
  near(s.run.gold[PLAYER], 100 + 15);
  near(c.soldiers, 31.2);
  tick(s, 1000);
  near(c.soldiers, 40);
  c.soldiers = 55; tick(s, 1);
  near(c.soldiers, 55);
  near(s.run.elapsed, 1011);
});

test('업그레이드: 골드 차감·상한', () => {
  const s = makeState();
  const c = capitalOf(s, PLAYER);
  assert.equal(upgrade(s, c.id), false);
  s.run.gold[PLAYER] = 120;
  assert.equal(upgrade(s, c.id), true);
  assert.equal(c.level, 2);
  near(s.run.gold[PLAYER], 0);
  c.level = MAX_LEVEL; s.run.gold[PLAYER] = 1e9;
  assert.equal(upgrade(s, c.id), false);
  const n = s.run.tiles.find(t => t.owner === NEUTRAL);
  assert.equal(upgrade(s, n.id), false);
});

test('공격 성공: 점령, 남은 병사 = (A−D)/공격배율', () => {
  const s = makeState(1, 0, { attack: 2 });
  const c = capitalOf(s, PLAYER);
  const t = s.run.tiles[neighborIds(s.run, c)[0]];
  t.terrain = 'forest'; t.soldiers = 10; c.soldiers = 40;
  const r = send(s, c.id, t.id, 1.0);
  assert.equal(r.type, 'capture');
  assert.equal(t.owner, PLAYER);
  near(t.soldiers, (40 * 1.1 - 10 * 1.2) / 1.1);
  near(c.soldiers, 0);
  assert.equal(s.run.maxTilesOwned, 2);
});

test('공격 실패: 수비 = (D−A)/(1+방어), 공격병 전멸', () => {
  const s = makeState();
  const c = capitalOf(s, PLAYER);
  const t = s.run.tiles[neighborIds(s.run, c)[0]];
  t.terrain = 'mountain'; t.soldiers = 30; c.soldiers = 40;
  const r = send(s, c.id, t.id, 0.5);
  assert.equal(r.type, 'repel');
  assert.equal(t.owner, NEUTRAL);
  near(t.soldiers, (60 - 20) / 2);
  near(c.soldiers, 20);
});

test('이동: 내 땅으로는 병사 합산, 비인접·1 미만·중립 출발은 invalid', () => {
  const s = makeState();
  const c = capitalOf(s, PLAYER);
  const t = s.run.tiles[neighborIds(s.run, c)[0]];
  t.owner = PLAYER; t.soldiers = 5; c.soldiers = 20;
  assert.equal(send(s, c.id, t.id, 0.5).type, 'move');
  near(t.soldiers, 15); near(c.soldiers, 10);
  const far = s.run.tiles.find(x => !neighborIds(s.run, c).includes(x.id) && x.id !== c.id);
  assert.equal(send(s, c.id, far.id, 0.5).type, 'invalid');
  c.soldiers = 1.5;
  assert.equal(send(s, c.id, t.id, 0.5).type, 'invalid');
  const n = s.run.tiles.find(x => x.owner === NEUTRAL);
  assert.equal(send(s, n.id, neighborIds(s.run, n)[0], 1).type, 'invalid');
});

test('status: playing / conquered / wiped', () => {
  const s = makeState();
  assert.equal(status(s), 'playing');
  for (const t of s.run.tiles) t.owner = PLAYER;
  assert.equal(status(s), 'conquered');
  for (const t of s.run.tiles) t.owner = 1;
  assert.equal(status(s), 'wiped');
  assert.equal(tilesOwned(s, 1), 37);
});
