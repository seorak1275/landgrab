// 사단전: 내 땅을 따라 이어서 가는 자동 진격 (한 칸씩 행군하는 규칙은 그대로)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLAYER, NEUTRAL, newRun, tick, owned, adj, move, moveFar, pathThroughMine, runArmies, runBattles, resolveBattle, REGION_SPEED } from '../src/region/game.js';

function mk(seed = 1) { const l = { points: 0, prestigeCount: 0, upgrades: {}, difficulty: 'normal' }; return { legacy: l, run: newRun(seed, l) }; }
const cap = (s, f) => s.run.regions.find(r => r.owner === f);
// 수도에서 뻗어 나가는 내 땅 사슬을 만든다
function chain(s, n) {
  const ids = [cap(s, PLAYER).id];
  while (ids.length <= n) {
    const next = adj(s.run, ids[ids.length - 1]).find(x => !ids.includes(x) && s.run.regions[x].owner === NEUTRAL);
    if (next === undefined) break;
    s.run.regions[next].owner = PLAYER; ids.push(next);
  }
  return ids;
}

test('pathThroughMine: 내 땅만 밟아 목적지까지, 목적지는 내 땅에 붙어 있어야 한다', () => {
  const s = mk(2);
  const ids = chain(s, 3);
  const last = ids[ids.length - 1];
  const target = adj(s.run, last).find(x => !ids.includes(x));
  const p = pathThroughMine(s.run, ids[0], target);
  assert.ok(p, '경로가 있어야 한다');
  assert.equal(p[0], ids[0]);
  assert.equal(p[p.length - 1], target);
  for (const id of p.slice(0, -1)) assert.equal(s.run.regions[id].owner, PLAYER, '가는 길은 전부 내 땅');
  for (let i = 1; i < p.length; i++) assert.ok(adj(s.run, p[i - 1]).includes(p[i]), '한 칸씩 이어진다');
  // 내 땅과 안 닿은 먼 곳은 경로가 없다 (먼 곳은 여전히 반란으로)
  const far = s.run.regions.find(r => r.owner === NEUTRAL && !p.includes(r.id) && !adj(s.run, r.id).some(n => s.run.regions[n].owner === PLAYER));
  assert.equal(pathThroughMine(s.run, ids[0], far.id), null);
});

test('moveFar: 이어진 길이 있으면 여러 칸을 자동으로 진격한다 (도착 시간도 그만큼)', () => {
  const s = mk(3);
  const ids = chain(s, 3);
  const from = ids[0], last = ids[ids.length - 1];
  const target = adj(s.run, last).find(x => !ids.includes(x));
  s.run.regions[from].div = 300; s.run.regions[target].def = 5;
  const res = moveFar(s, from, target, 1);
  assert.equal(res.type, 'attack');
  assert.ok(res.hops >= 2, `여러 칸 (${res.hops})`);
  assert.ok(Math.abs(res.eta - res.hops / REGION_SPEED) < 1e-6);
  assert.equal(s.run.armies.length, 1);
  assert.equal(s.run.armies[0].path.length, res.hops + 1);
  // 도착할 때까지 굴리면 점령된다
  for (let t = 0; t < 60; t++) { runArmies(s, 0.5); runBattles(s, 0.5); }
  for (const r of s.run.regions) if (r.battle) resolveBattle(s, r);
  assert.equal(s.run.regions[target].owner, PLAYER);
});

test('moveFar는 인접 이동과 같은 결과를 내고, 길이 없으면 invalid', () => {
  const s = mk(4);
  const c = cap(s, PLAYER); c.div = 100;
  const n = adj(s.run, c.id)[0];
  const res = moveFar(s, c.id, n, 0.5);
  assert.equal(res.hops, 1);
  assert.equal(res.size, 50);
  const far = s.run.regions.find(r => r.owner === NEUTRAL && !adj(s.run, c.id).includes(r.id) && r.id !== c.id);
  assert.equal(moveFar(s, c.id, far.id, 1).type, 'invalid');
});
