// 사단전: 시·도 완전 점령 보너스 (한 판 안의 중간 목표)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import MAP from '../src/maps/sgg.js';
import { PLAYER, NEUTRAL, PROV_PROD, PROV_DEF, newRun, tick, owned, provinceIds, provinceHolder, provinceOf, provProgress, prodOf, defMul, refreshSupply } from '../src/region/game.js';

function mk(seed = 1, board = 'all', legacy = {}) {
  const l = { points: 0, prestigeCount: 0, upgrades: {}, difficulty: 'normal', ...legacy };
  return { legacy: l, run: newRun(seed, l, null, board, l.homePref) };
}
const take = (s, ids, f = PLAYER) => { for (const id of ids) { s.run.regions[id].owner = f; s.run.regions[id].def = 10; } refreshSupply(s); };

test('시·도 묶음: 판 안의 지역만, 한 곳뿐인 시·도(세종)는 보너스 대상이 아니다', () => {
  const all = provinceIds('all');
  assert.equal(all.get('서울').length, 25);
  assert.equal(all.get('강원').length, 18);
  assert.ok(!all.has('세종') || all.get('세종').length === 1);
  const cap = provinceIds('capital');
  assert.deepEqual([...cap.keys()].sort(), ['경기', '서울', '인천']);
  assert.equal(provinceOf(all.get('서울')[0]), '서울');
});

test('한 시·도를 전부 가지면 그 지역 생산 +30%, 수비 +15%', () => {
  const s = mk(2, 'all', { homePref: '속초시' }); // 강원에서 시작해 그 시·도를 채워 본다
  const gw = provinceIds('all').get('강원');
  const one = owned(s, PLAYER)[0].id; // 내 수도 — 늘 본국과 이어져 있어 고립 배율이 섞이지 않는다
  assert.ok(gw.includes(one));
  const before = { prod: 0, def: 0 };
  const had = provProgress(s, '강원').mine;
  take(s, [one]);
  before.prod = prodOf(s, s.run.regions[one]); before.def = defMul(s, s.run.regions[one]);
  assert.equal(provinceHolder(s.run, '강원'), null);
  assert.ok(provProgress(s, '강원').mine >= had && provProgress(s, '강원').total === gw.length);
  take(s, gw);
  assert.equal(provinceHolder(s.run, '강원'), PLAYER);
  assert.ok(Math.abs(prodOf(s, s.run.regions[one]) - before.prod * (1 + PROV_PROD)) < 1e-9);
  assert.ok(Math.abs(defMul(s, s.run.regions[one]) - before.def * (1 + PROV_DEF)) < 1e-9);
  // 한 곳만 잃어도 보너스가 사라진다
  s.run.regions[gw[1]].owner = 1; refreshSupply(s);
  assert.equal(provinceHolder(s.run, '강원'), null);
  assert.ok(Math.abs(prodOf(s, s.run.regions[one]) - before.prod) < 1e-9);
});

test('AI도 같은 보너스를 받고, 유산 통치는 플레이어만 더 준다', () => {
  const s = mk(3);
  const gw = provinceIds('all').get('강원');
  take(s, gw, 1);
  assert.equal(provinceHolder(s.run, '강원'), 1);
  const aiProd = prodOf(s, s.run.regions[gw[0]]);
  const plain = { ...s, run: { ...s.run } };
  // 유산 '통치' 2레벨이면 플레이어 보너스가 +20%p 더
  const s2 = mk(3, 'all', { upgrades: { regionBonus: 2 } });
  const gw2 = provinceIds('all').get('강원');
  take(s2, gw2);
  const s3 = mk(3);
  take(s3, gw2);
  assert.ok(prodOf(s2, s2.run.regions[gw2[0]]) > prodOf(s3, s3.run.regions[gw2[0]]));
  assert.ok(aiProd > 0);
});

test('tick이 시·도 보너스를 갱신한다', () => {
  const s = mk(4, 'capital');
  const seoul = provinceIds('capital').get('서울');
  for (const id of seoul) s.run.regions[id].owner = PLAYER;
  tick(s, 1);
  assert.equal(s.run.regions[seoul[0]].provFull, true);
  assert.equal(provinceHolder(s.run, '서울'), PLAYER);
});

test('시작 지역: 판마다 고를 수 있고, 이름이 다 판 안에 있다', async () => {
  const g = await import('../src/region/game.js');
  for (const [board, list] of Object.entries(g.HOMES)) {
    const ids = new Set(g.boardIds(board));
    assert.ok(list.length >= 4, board);
    for (const h of list) {
      const i = MAP.regions.findIndex(r => r.n === h.n);
      assert.ok(i >= 0 && ids.has(i), `${board}: ${h.n}`);
      assert.ok(h.tag && h.desc, h.n);
    }
    // 기본 수도도 목록에 있어야 고른 뒤 되돌릴 수 있다
    assert.ok(list.some(h => h.n === g.BOARDS[board].home), `${board} 기본 ${g.BOARDS[board].home}`);
  }
  // 고른 곳에서 시작한다
  const l = { points: 0, prestigeCount: 0, upgrades: {}, difficulty: 'normal' };
  const run = g.newRun(5, l, null, 'all', '수원 장안구');
  assert.equal(MAP.regions[run.regions.find(r => r.owner === PLAYER).id].n, '수원 장안구');
  // 없는 이름이면 기본값
  const run2 = g.newRun(5, l, null, 'all', '없는곳');
  assert.equal(MAP.regions[run2.regions.find(r => r.owner === PLAYER).id].n, g.BOARDS.all.home);
});
