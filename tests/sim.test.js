import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeState, capitalOf } from './helpers.js';
import { PLAYER, NEUTRAL } from '../src/world.js';
import { runBattles, BATTLE_SECONDS, predictAttack, neighborIds, cap, goldRate, soldierRate, upgradeCost, tick, upgrade, send, status, tilesOwned, MAX_LEVEL } from '../src/sim.js';

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
  near(goldRate(s, ac), 1.5 * 0.8); // AI 기본 0.6 + 환생 2회 0.2
  near(soldierRate(s, pc), 0.12 * 1.1);
  near(soldierRate(s, ac), 0.12 * 0.8);
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
  assert.equal(r.type, 'attack'); assert.equal(r.sent, 40);
  assert.equal(t.owner, NEUTRAL); assert.equal(t.battle.attacker, PLAYER); // 아직 전투 중
  near(c.soldiers, 0);
  runBattles(s, BATTLE_SECONDS / 2);
  assert.ok(t.battle && t.soldiers < 10 && t.battle.attackers < 40, '양쪽 다 줄어든다');
  runBattles(s, BATTLE_SECONDS / 2 + 0.01);
  assert.equal(t.battle, undefined);
  assert.equal(t.owner, PLAYER);
  near(t.soldiers, (40 * 1.1 - 10 * 1.2) / 1.1);
  assert.equal(s.run.maxTilesOwned, 2);
});

test('공격 실패: 수비 = (D−A)/(1+방어), 공격병 전멸', () => {
  const s = makeState();
  const c = capitalOf(s, PLAYER);
  const t = s.run.tiles[neighborIds(s.run, c)[0]];
  t.terrain = 'mountain'; t.soldiers = 30; c.soldiers = 40;
  const r = send(s, c.id, t.id, 0.5);
  assert.equal(r.type, 'attack');
  for (let i = 0; i < BATTLE_SECONDS * 4 + 1; i++) tick(s, 0.25); // 전투는 tick 안에서 진행된다
  assert.equal(t.battle, undefined);
  assert.equal(t.owner, NEUTRAL);
  near(t.soldiers, (60 - 20) / 2); // 중립은 생산 없음
  near(c.soldiers, 20 + 0.12 * (BATTLE_SECONDS + 0.25)); // 수도는 그동안 생산
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

test('전투 중 증원: 같은 세력은 합류하고 예측도 합류분을 센다', () => {
  const s = makeState();
  const c = capitalOf(s, PLAYER);
  const t = s.run.tiles[neighborIds(s.run, c)[0]];
  t.terrain = 'plain'; t.soldiers = 30; c.soldiers = 40;
  send(s, c.id, t.id, 0.5); // 20 vs 30 → 지는 중
  runBattles(s, 1); // 1초: rate = 20/4 = 5 → 15 vs 25
  near(t.battle.attackers, 15); near(t.soldiers, 25);
  assert.equal(predictAttack(s, c, t, 0.25).win, false); // 5 + 15 < 25
  assert.equal(predictAttack(s, c, t, 1).win, true); // 20 + 15 > 25
  send(s, c.id, t.id, 1);
  near(t.battle.attackers, 35);
  runBattles(s, 100);
  assert.equal(t.owner, PLAYER); near(t.soldiers, 10);
});

test('공격받는 내 땅에 증원하면 전투가 끝나지 않고 수비에 합류한다', () => {
  const s = makeState();
  const c = capitalOf(s, PLAYER);
  const [t, back] = neighborIds(s.run, c).slice(0, 2).map(id => s.run.tiles[id]);
  const ai = s.run.tiles[neighborIds(s.run, t).find(id => id !== c.id && id !== back.id)];
  t.owner = PLAYER; t.terrain = 'plain'; t.soldiers = 10; ai.owner = 1; ai.terrain = 'plain'; ai.soldiers = 50; c.soldiers = 40;
  send(s, ai.id, t.id, 1); // AI 50 vs 내 10
  send(s, c.id, t.id, 1); // 내 증원 40 → 수비 50
  assert.equal(t.battle.attacker, 1); near(t.soldiers, 50); assert.equal(t.owner, PLAYER);
  runBattles(s, 100);
  assert.equal(t.owner, PLAYER); near(t.soldiers, 0); assert.equal(t.battle, undefined); // 50 vs 50 → 수비 승, 0명
});

test('제3세력 개입: 기존 전투를 먼저 끝내고 새 전투', () => {
  const s = makeState();
  const c = capitalOf(s, PLAYER);
  const t = s.run.tiles[neighborIds(s.run, c)[0]];
  const ai = s.run.tiles[neighborIds(s.run, t).find(id => id !== c.id)];
  t.terrain = 'plain'; ai.terrain = 'plain'; t.soldiers = 10; c.soldiers = 40; ai.owner = 1; ai.soldiers = 100;
  send(s, c.id, t.id, 1); // 40 vs 10 → 내가 이길 전투
  near(predictAttack(s, ai, t, 0.5).D, 30); // AI 눈에 이 땅은 '끝나면 내 병사 30'
  assert.equal(predictAttack(s, ai, t, 0.5).win, true);
  send(s, ai.id, t.id, 1); // AI 100 개입 → 내 전투 먼저 정리(내 땅 30) → AI 100 vs 30
  assert.equal(t.battle.attacker, 1); near(t.soldiers, 30); assert.equal(t.owner, PLAYER);
  runBattles(s, 100);
  assert.equal(t.owner, 1); near(t.soldiers, 70);
});

test('전투 중인 타일은 징집이 멈추고, 끝나면 다시 찬다', () => {
  const s = makeState();
  const c = capitalOf(s, PLAYER);
  const t = s.run.tiles[neighborIds(s.run, c)[0]];
  const ai = s.run.tiles[neighborIds(s.run, t).find(id => id !== c.id)];
  t.owner = PLAYER; t.terrain = 'plain'; t.level = 1; t.soldiers = 10; ai.owner = 1; ai.terrain = 'plain'; ai.soldiers = 10;
  send(s, ai.id, t.id, 0.5); // 5 vs 10 → 4초 뒤 수비 승, 5명
  tick(s, 1);
  near(t.soldiers, 10 - 5 / 4); // 생산 없이 깎이기만
  for (let i = 0; i < 4; i++) tick(s, 1);
  assert.equal(t.battle, undefined); near(t.soldiers, 5 + 0.12 * 1); // 끝난 뒤 1초분 생산
});

test('전멸 판정: 땅이 없어도 전투 중인 공격병이 있으면 아직 진행 중', () => {
  const s = makeState();
  const c = capitalOf(s, PLAYER);
  const t = s.run.tiles[neighborIds(s.run, c)[0]];
  t.terrain = 'plain'; t.soldiers = 5; c.soldiers = 40;
  send(s, c.id, t.id, 1);
  c.owner = 1; // 수도를 빼앗겼다고 치자
  assert.equal(status(s), 'playing');
  runBattles(s, 100);
  assert.equal(status(s), 'playing'); assert.equal(t.owner, PLAYER);
});
