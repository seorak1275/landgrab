import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankBonus } from '../src/career.js';
import { makeState, capitalOf, settle } from './helpers.js';
import { PLAYER, NEUTRAL } from '../src/world.js';
import { runBattles, runArmies, battleRate, battleParty, battleAttackers, ARMY_SPEED, predictAttack, neighborIds, cap, goldRate, soldierRate, upgradeCost, tick, upgrade, send, status, tilesOwned, MAX_LEVEL, setSendListener } from '../src/sim.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const HOP = 1 / ARMY_SPEED; // 한 칸 행군 시간

test('꼭짓점 수도는 이웃이 3개', () => {
  const s = makeState();
  assert.equal(neighborIds(s.run, capitalOf(s, PLAYER)).length, 3);
});

test('생산·한도·비용 수식', () => {
  const s = makeState();
  const c = capitalOf(s, PLAYER);
  near(goldRate(s, c), 0.5 * 3 * 1);
  near(soldierRate(s, c), 0.12);
  near(cap(c), 120);
  near(upgradeCost(c), 40 * 3);
  c.level = 3;
  near(upgradeCost(c), 40 * 1.7 ** 2 * 3);
});

test('유산·환생 배율', () => {
  const s = makeState(1, 2, { gold: 3, soldiers: 1, attack: 4 });
  const pc = capitalOf(s, PLAYER), ac = capitalOf(s, 1);
  const rank = rankBonus(s.legacy); // 계급(환생 2회 = 일병)도 생산에 붙는다
  near(goldRate(s, pc), 1.5 * 1.3 * rank);
  near(goldRate(s, ac), 1.5 * 1.0); // AI 보통 0.8 + 환생 2회 0.2
  near(soldierRate(s, pc), 0.12 * 1.1 * rank);
  near(soldierRate(s, ac), 0.12 * 1.0);
  s.legacy.difficulty = 'hell'; near(goldRate(s, ac), 1.5 * 1.4);
  s.run.elapsed = 1200; near(goldRate(s, ac), 1.5 * 1.6); // 20분 램프 +0.2
  s.run.elapsed = 1e9; near(goldRate(s, ac), 1.5 * 2.4); // 램프 상한 +1.0
});

test('tick: 골드 누적, 병사는 한도까지만, 초과분은 유지', () => {
  const s = makeState();
  const c = capitalOf(s, PLAYER);
  tick(s, 10);
  near(s.run.gold[PLAYER], 100 + 15);
  near(c.soldiers, 31.2);
  tick(s, 1000);
  near(c.soldiers, 120);
  c.soldiers = 155; tick(s, 1);
  near(c.soldiers, 155);
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

test('행군: 보내면 부대가 출발해 한 칸에 1/속도 초, 도착해야 전투가 시작된다', () => {
  const s = makeState(1, 0, { attack: 2 });
  const c = capitalOf(s, PLAYER);
  const t = s.run.tiles[neighborIds(s.run, c)[0]];
  t.terrain = 'forest'; t.soldiers = 10; c.soldiers = 40;
  const r = send(s, c.id, t.id, 1.0);
  assert.equal(r.type, 'attack'); assert.equal(r.sent, 40); near(r.eta, HOP);
  near(c.soldiers, 0);
  assert.equal(s.run.armies.length, 1); assert.equal(s.run.armies[0].soldiers, 40); assert.deepEqual(s.run.armies[0].path, [c.id, t.id]);
  assert.equal(t.battle, undefined);
  runArmies(s, HOP / 2);
  assert.equal(t.battle, undefined); near(s.run.armies[0].pos, 0.5);
  runArmies(s, HOP / 2);
  assert.equal(s.run.armies.length, 0);
  assert.equal(t.owner, NEUTRAL); assert.equal(battleParty(t, PLAYER).soldiers, 40); near(battleAttackers(t), 40);
});

test('공격 성공: 양쪽이 같은 속도로 깎이고, 남은 병사 = (A−D)/공격배율', () => {
  const s = makeState(1, 0, { attack: 2 });
  const c = capitalOf(s, PLAYER);
  const t = s.run.tiles[neighborIds(s.run, c)[0]];
  t.terrain = 'forest'; t.soldiers = 10; c.soldiers = 40;
  send(s, c.id, t.id, 1.0); runArmies(s, HOP);
  const rate = battleRate(40 * 1.1 + 10 * 1.2);
  near(t.battle.rate, rate);
  runBattles(s, 0.5);
  near(t.soldiers, (12 - rate * 0.5) / 1.2); near(battleParty(t, PLAYER).soldiers, (44 - rate * 0.5) / 1.1);
  runBattles(s, 100);
  assert.equal(t.battle, undefined);
  assert.equal(t.owner, PLAYER);
  near(t.soldiers, (40 * 1.1 - 10 * 1.2) / 1.1);
  assert.equal(s.run.maxTilesOwned, 2);
});

test('전투 시간: 작은 싸움은 2~3초, 수백 명 싸움은 20초 안팎', () => {
  const dur = (A, D) => Math.min(A, D) / battleRate(A + D);
  assert.ok(dur(30, 20) < 3.5 && dur(30, 20) > 2, `${dur(30, 20)}`);
  assert.ok(dur(400, 300) > 15 && dur(400, 300) < 25, `${dur(400, 300)}`);
});

test('공격 실패: 수비 = (D−A)/(1+방어), 공격병 전멸, 전투 밖 타일은 그동안 생산', () => {
  const s = makeState();
  const c = capitalOf(s, PLAYER);
  const t = s.run.tiles[neighborIds(s.run, c)[0]];
  t.terrain = 'mountain'; t.soldiers = 30; c.soldiers = 40;
  assert.equal(send(s, c.id, t.id, 0.5).type, 'attack');
  let elapsed = 0;
  while (elapsed < 60 && (s.run.armies.length || t.battle)) { tick(s, 0.25); elapsed += 0.25; }
  assert.equal(t.battle, undefined);
  assert.equal(t.owner, NEUTRAL);
  near(t.soldiers, (60 - 20) / 2); // 중립은 생산 없음
  near(c.soldiers, 20 + 0.12 * elapsed); // 수도는 그동안 생산
});

test('이동: 내 땅으로는 도착 시 합산, 비인접·1 미만·중립 출발은 invalid', () => {
  const s = makeState();
  const c = capitalOf(s, PLAYER);
  const t = s.run.tiles[neighborIds(s.run, c)[0]];
  t.owner = PLAYER; t.soldiers = 5; c.soldiers = 20;
  assert.equal(send(s, c.id, t.id, 0.5).type, 'move');
  near(c.soldiers, 10); near(t.soldiers, 5);
  settle(s);
  near(t.soldiers, 15);
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

test('전투 중 증원: 같은 세력은 합류하고 예측도 합류분을 세며, 합류해도 시간이 초기화되지 않는다(rate는 커질 수만)', () => {
  const s = makeState();
  const c = capitalOf(s, PLAYER);
  const t = s.run.tiles[neighborIds(s.run, c)[0]];
  t.terrain = 'plain'; t.soldiers = 30; c.soldiers = 40;
  send(s, c.id, t.id, 0.5); runArmies(s, HOP); // 20 vs 30 → 지는 중
  const rate0 = t.battle.rate; near(rate0, battleRate(50));
  runBattles(s, 1);
  near(battleParty(t, PLAYER).soldiers, 20 - rate0); near(t.soldiers, 30 - rate0);
  assert.equal(predictAttack(s, c, t, 0.25).win, false); // 5 + 13.5 < 23.5
  assert.equal(predictAttack(s, c, t, 1).win, true); // 20 + 13.5 > 23.5
  send(s, c.id, t.id, 1); runArmies(s, HOP);
  near(battleParty(t, PLAYER).soldiers, 40 - rate0);
  assert.ok(t.battle.rate >= rate0, '합류로 rate가 줄지 않는다');
  runBattles(s, 100);
  assert.equal(t.owner, PLAYER); near(t.soldiers, 10); // 총 40 보냄 − 30
});

test('공격받는 내 땅에 증원하면 수비에 합류한다', () => {
  const s = makeState();
  const c = capitalOf(s, PLAYER);
  const [t, back] = neighborIds(s.run, c).slice(0, 2).map(id => s.run.tiles[id]);
  const ai = s.run.tiles[neighborIds(s.run, t).find(id => id !== c.id && id !== back.id)];
  t.owner = PLAYER; t.terrain = 'plain'; t.soldiers = 10; ai.owner = 1; ai.terrain = 'plain'; ai.soldiers = 50; c.soldiers = 40;
  send(s, ai.id, t.id, 1); // AI 50 vs 내 10
  send(s, c.id, t.id, 1); // 내 증원 40 → 수비 50
  runArmies(s, HOP);
  assert.equal(battleParty(t, 1).soldiers, 50); near(t.soldiers, 50); assert.equal(t.owner, PLAYER);
  runBattles(s, 100);
  assert.equal(t.owner, PLAYER); near(t.soldiers, 0); assert.equal(t.battle, undefined); // 50 vs 50 → 수비 승, 0명
});

test('제3세력 개입 = 난전: 모두 같은 속도로 깎여 가장 센 편이 남고, 남는 전력 = 1등 − 2등', () => {
  const s = makeState();
  const c = capitalOf(s, PLAYER);
  const t = s.run.tiles[neighborIds(s.run, c)[0]];
  const ai = s.run.tiles[neighborIds(s.run, t).find(id => id !== c.id)];
  t.terrain = 'plain'; ai.terrain = 'plain'; t.soldiers = 10; c.soldiers = 40; ai.owner = 1; ai.soldiers = 100;
  send(s, c.id, t.id, 1); runArmies(s, HOP); // 40 vs 10
  near(predictAttack(s, ai, t, 0.5).D, 40); // AI 눈에 맞설 상대는 가장 센 편(내 40)
  assert.equal(predictAttack(s, ai, t, 0.5).win, true);
  send(s, ai.id, t.id, 1); runArmies(s, HOP); // AI 100 참전 → 10 / 40 / 100 난전
  assert.equal(t.battle.parties.length, 2); assert.equal(t.owner, NEUTRAL);
  runBattles(s, 100);
  assert.equal(t.owner, 1); near(t.soldiers, 60); // 100 − 40
});

test('난전 3편: 수비 20, 공격 50·30 → 50이 20 남기고 이긴다', () => {
  const s = makeState();
  const c = capitalOf(s, PLAYER);
  const t = s.run.tiles[neighborIds(s.run, c)[0]];
  const ai = s.run.tiles[neighborIds(s.run, t).find(id => id !== c.id)];
  t.terrain = 'plain'; ai.terrain = 'plain'; t.soldiers = 20; c.soldiers = 50; ai.owner = 1; ai.soldiers = 30;
  send(s, c.id, t.id, 1); send(s, ai.id, t.id, 1); runArmies(s, HOP);
  assert.equal(t.battle.parties.length, 2);
  runBattles(s, 100);
  assert.equal(t.owner, PLAYER); near(t.soldiers, 20);
});

test('양방향 공격은 변 위에서 부딪힌다(야전): 이긴 부대만 남은 병력으로 계속 간다', () => {
  const s = makeState();
  const c = capitalOf(s, PLAYER);
  const ai = s.run.tiles[neighborIds(s.run, c)[0]];
  ai.owner = 1; ai.terrain = 'plain'; ai.soldiers = 50; c.soldiers = 60; c.terrain = 'plain';
  const got = []; setSendListener(r => got.push(r));
  send(s, c.id, ai.id, 0.5); // 내 30 → AI 땅
  send(s, ai.id, c.id, 0.4); // AI 20 → 내 땅, 같은 변을 반대로
  runArmies(s, 0.01);
  const clash = got.find(r => r.type === 'clash');
  assert.ok(clash); assert.equal(clash.owner, PLAYER); near(clash.remaining, 10); assert.deepEqual(clash.losers, [1]);
  assert.equal(s.run.armies.length, 1); near(s.run.armies[0].soldiers, 10);
  setSendListener(null);
  settle(s);
  assert.equal(ai.owner, 1); near(ai.soldiers, 30 - 10); // 10 vs 30 → 수비 승
  assert.equal(c.owner, PLAYER); near(c.soldiers, 30); // 내 수도는 공격받지 않았다
});

test('행군 중 길이 끊기면 거기서 싸운다', () => {
  const s = makeState();
  const run = s.run; let cur = capitalOf(s, PLAYER); const ids = [cur.id];
  for (let i = 0; i < 2; i++) { const nid = neighborIds(run, cur).find(id => run.tiles[id].owner === NEUTRAL && !ids.includes(id)); run.tiles[nid].owner = PLAYER; run.tiles[nid].soldiers = 5; run.tiles[nid].terrain = 'plain'; ids.push(nid); cur = run.tiles[nid]; }
  run.tiles[ids[0]].soldiers = 40;
  const army = { owner: PLAYER, soldiers: 40, am: 1, path: ids, pos: 0 }; run.armies = [army];
  run.tiles[ids[1]].owner = 1; run.tiles[ids[1]].soldiers = 5; // 중간 땅을 빼앗겼다
  runArmies(s, 1);
  assert.equal(run.armies.length, 0);
  assert.ok(run.tiles[ids[1]].battle); assert.equal(battleParty(run.tiles[ids[1]], PLAYER).soldiers, 40);
  runBattles(s, 100);
  assert.equal(run.tiles[ids[1]].owner, PLAYER); near(run.tiles[ids[1]].soldiers, 35);
});

test('전투 중인 타일은 징집이 멈추고, 끝나면 다시 찬다', () => {
  const s = makeState();
  const c = capitalOf(s, PLAYER);
  const t = s.run.tiles[neighborIds(s.run, c)[0]];
  const ai = s.run.tiles[neighborIds(s.run, t).find(id => id !== c.id)];
  t.owner = PLAYER; t.terrain = 'plain'; t.level = 1; t.soldiers = 10; ai.owner = 1; ai.terrain = 'plain'; ai.soldiers = 10;
  send(s, ai.id, t.id, 0.5); runArmies(s, HOP); // 5 vs 10
  const rate = t.battle.rate;
  tick(s, 0.5);
  near(t.soldiers, 10 - rate * 0.5); // 생산 없이 깎이기만
  for (let i = 0; i < 20; i++) tick(s, 0.25);
  assert.equal(t.battle, undefined); assert.ok(t.soldiers > 5 && t.soldiers < 5 + 0.12 * 5.5, `${t.soldiers}`); // 끝난 뒤 생산 재개
});

test('전멸 판정: 땅이 없어도 행군·전투 중인 내 병사가 있으면 아직 진행 중', () => {
  const s = makeState();
  const c = capitalOf(s, PLAYER);
  const t = s.run.tiles[neighborIds(s.run, c)[0]];
  t.terrain = 'plain'; t.soldiers = 5; c.soldiers = 40;
  send(s, c.id, t.id, 1);
  c.owner = 1; // 수도를 빼앗겼다고 치자
  assert.equal(status(s), 'playing'); // 행군 중
  runArmies(s, HOP);
  assert.equal(status(s), 'playing'); // 전투 중
  runBattles(s, 100);
  assert.equal(status(s), 'playing'); assert.equal(t.owner, PLAYER);
});
