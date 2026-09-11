// 사단전: 퇴각 (전투 중 빼내기)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLAYER, NEUTRAL, newRun, adj, move, moveFar, runArmies, runBattles, retreat, canRetreat, RETREAT_LOSS, party } from '../src/region/game.js';

function mk(seed = 1) { const l = { points: 0, prestigeCount: 0, upgrades: {}, difficulty: 'normal' }; return { legacy: l, run: newRun(seed, l) }; }
const cap = (s, f) => s.run.regions.find(r => r.owner === f);

test('전투 중인 내 공격 부대를 빼면 손해를 보고 가장 가까운 내 땅으로 돌아온다', () => {
  const s = mk(1);
  const home = cap(s, PLAYER); home.div = 200;
  const t = s.run.regions[adj(s.run, home.id)[0]]; t.owner = NEUTRAL; t.def = 400; // 못 이기는 싸움 (수도가 옆이라 물러설 곳이 있다)
  move(s, home.id, t.id, 1);
  for (let i = 0; i < 8; i++) { runArmies(s, 0.5); runBattles(s, 0.5); }
  const p = party(t, PLAYER);
  assert.ok(p && p.size > 0, '전투 중이어야 한다');
  assert.equal(canRetreat(s, t.id), true);
  const before = p.size, homeDiv = home.div;
  const back = retreat(s, t.id);
  assert.ok(back > 0);
  assert.ok(Math.abs(back - before * (1 - RETREAT_LOSS)) < 1, `${before} → ${back}`);
  assert.equal(party(t, PLAYER), undefined, '전투에서 빠진다');
  // 돌아온 병력은 행군 부대로 내 땅에 온다
  assert.ok(s.run.armies.some(a => a.owner === PLAYER && a.size === back));
  for (let i = 0; i < 10; i++) runArmies(s, 0.5);
  assert.ok(home.div > homeDiv, '내 땅에 합류');
});

test('싸우고 있지 않으면 퇴각할 수 없다', () => {
  const s = mk(2);
  const home = cap(s, PLAYER);
  assert.equal(canRetreat(s, home.id), false);
  assert.equal(retreat(s, home.id), 0);
  const t = s.run.regions[adj(s.run, home.id)[0]];
  assert.equal(canRetreat(s, t.id), false);
});

test('수비 중인 내 지역에서는 사단만 빼고 방어인력은 남는다', () => {
  const s = mk(3);
  const home = cap(s, PLAYER); home.def = 100; home.div = 60;
  const ai = s.run.regions[adj(s.run, home.id)[0]]; ai.owner = 1; ai.div = 300;
  move(s, ai.id, home.id, 1);
  for (let i = 0; i < 8; i++) { runArmies(s, 0.5); runBattles(s, 0.5); }
  assert.ok(home.battle, '내 땅이 공격받는 중');
  // 물러설 옆 내 땅 하나를 만들어 둔다
  const spare = adj(s.run, home.id).find(x => x !== ai.id);
  s.run.regions[spare].owner = PLAYER; s.run.regions[spare].def = 10;
  assert.equal(canRetreat(s, home.id), true);
  const back = retreat(s, home.id);
  assert.ok(back > 0);
  assert.ok(home.def > 0, '방어인력은 자리를 지킨다');
  assert.ok(home.div < 1, '사단만 빠진다');
  assert.ok(s.run.armies.some(a => a.owner === PLAYER && a.size === back), '옆 내 땅으로 물러난다');
});
