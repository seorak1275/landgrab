// 사단전: 보급(본국 연결)과 권역 판
import { test } from 'node:test';
import assert from 'node:assert/strict';
import MAP from '../src/maps/sgg.js';
import { PLAYER, NEUTRAL, OFF, ISO_PROD, ISO_DEF, BOARDS, boardIds, newRun, tick, status, owned, adj, neighbors, prodOf, defMul, move, supplyHub, refreshSupply, bfsDist, totalProd } from '../src/region/game.js';
import { runAi } from '../src/region/ai.js';

function mk(seed = 1, board = 'all', legacy = {}) {
  const l = { points: 0, prestigeCount: 0, upgrades: {}, difficulty: 'normal', ...legacy };
  return { legacy: l, run: newRun(seed, l, null, board) };
}
const cap = (s, f) => s.run.regions.find(r => r.owner === f);

test('권역 판: 전국 251 / 수도권·영남·호남충청은 그 권역만, 나머지는 판에 없다(OFF)', () => {
  assert.deepEqual(Object.keys(BOARDS), ['all', 'capital', 'yeongnam', 'honam']);
  assert.equal(boardIds('all').length, 251);
  for (const key of ['capital', 'yeongnam', 'honam']) {
    const b = BOARDS[key], ids = boardIds(key);
    assert.ok(ids.length >= 70 && ids.length <= 85, `${key} ${ids.length}개`);
    for (const id of ids) assert.ok(b.ps.includes(MAP.regions[id].p), MAP.regions[id].n);
    // 권역 안에서 전부 이어져 있어야 한다 (뱃길 포함)
    const d = bfsDist(ids[0], key);
    for (const id of ids) assert.ok(d[id] >= 0, `${key}: ${MAP.regions[id].n} 고립`);
    // 내 수도는 그 권역 안에 있다
    assert.ok(ids.some(id => MAP.regions[id].n === b.home), `${key} 수도 ${b.home}`);
  }
});

test('권역 판의 판 밖 지역은 OFF: 이웃에서 빠지고, 정복 판정에도 안 들어간다', () => {
  const s = mk(1, 'capital');
  const ids = boardIds('capital');
  assert.equal(s.run.board, 'capital');
  assert.equal(s.run.regions.filter(r => r.owner !== OFF).length, ids.length);
  for (const id of ids) for (const n of adj(s.run, id)) assert.notEqual(s.run.regions[n].owner, OFF);
  // 경계 지역은 원래 이웃보다 판 안 이웃이 적다
  const edge = ids.find(id => neighbors(id).some(n => !ids.includes(n)));
  assert.ok(adj(s.run, edge).length < neighbors(edge).length);
  // 전부 내 것이면 정복 (판 밖은 세지 않는다)
  for (const id of ids) s.run.regions[id].owner = PLAYER;
  assert.equal(status(s), 'conquered');
  assert.equal(owned(s, PLAYER).length, ids.length);
  // 내 수도는 그 권역의 home
  const s2 = mk(2, 'yeongnam');
  assert.equal(MAP.regions[cap(s2, PLAYER).id].n, BOARDS.yeongnam.home);
  assert.ok(s2.run.factions - 1 <= BOARDS.yeongnam.maxAi);
});

test('보급: 수도에서 내 지역만 밟아 닿지 않으면 고립 — 생산 ×0.4, 수비 ×0.8', () => {
  const s = mk(3);
  const home = cap(s, PLAYER);
  // 수도에 붙은 지역 하나와, 거기서 한 칸 더 간 지역을 내 것으로 (사슬)
  const a = adj(s.run, home.id)[0];
  const b = adj(s.run, a).find(x => x !== home.id && s.run.regions[x].owner === NEUTRAL);
  s.run.regions[a].owner = PLAYER; s.run.regions[b].owner = PLAYER;
  refreshSupply(s);
  assert.equal(s.run.regions[a].iso, false);
  assert.equal(s.run.regions[b].iso, false);
  const prodFull = prodOf(s, s.run.regions[b]), defFull = defMul(s, s.run.regions[b]);
  // 사슬 가운데를 잃으면 끝이 고립된다
  s.run.regions[a].owner = 1;
  refreshSupply(s);
  assert.equal(s.run.regions[b].iso, true);
  assert.equal(prodOf(s, s.run.regions[b]), prodFull * ISO_PROD);
  assert.ok(Math.abs(defMul(s, s.run.regions[b]) - defFull * ISO_DEF) < 1e-9);
  // 고립 지역 생산도 줄어든 값으로 합산된다
  assert.ok(totalProd(s, PLAYER) < prodOf(s, home) + prodFull);
});

test('보급 기준점: 수도를 잃으면 생산력이 가장 큰 내 지역이 본국이 된다', () => {
  const s = mk(4);
  const home = cap(s, PLAYER);
  assert.equal(supplyHub(s, PLAYER), home.id);
  const other = s.run.regions.find(r => r.owner === NEUTRAL && MAP.regions[r.id].t === '구');
  other.owner = PLAYER;
  home.owner = 1;
  refreshSupply(s);
  assert.equal(supplyHub(s, PLAYER), other.id);
  assert.equal(other.iso, false); // 스스로가 본국이니 고립 아님
});

test('고립은 AI에게도 적용되고, tick이 갱신한다', () => {
  const s = mk(5);
  const ai = cap(s, 1);
  const n = adj(s.run, ai.id).find(x => s.run.regions[x].owner === NEUTRAL);
  const far = s.run.regions.find(r => r.owner === NEUTRAL && bfsDist(ai.id)[r.id] > 3);
  far.owner = 1;
  tick(s, 1);
  assert.equal(s.run.regions[n] && s.run.regions[n].owner === NEUTRAL, true);
  assert.equal(far.iso, true, '수도와 떨어진 AI 지역은 고립');
  assert.equal(ai.iso, false);
});

test('파병은 판 안 이웃으로만 (권역 판에서 판 밖으로는 invalid)', () => {
  const s = mk(6, 'capital');
  const ids = boardIds('capital');
  const edge = ids.find(id => neighbors(id).some(n => !ids.includes(n)));
  const out = neighbors(edge).find(n => !ids.includes(n));
  s.run.regions[edge].owner = PLAYER; s.run.regions[edge].div = 100;
  assert.equal(move(s, edge, out, 1).type, 'invalid');
  const inside = adj(s.run, edge)[0];
  assert.notEqual(move(s, edge, inside, 1).type, 'invalid');
});

test('권역 판에서도 AI가 돌고 10분이면 중립이 줄어든다', () => {
  const s = mk(7, 'honam');
  const before = owned(s, NEUTRAL).length;
  for (let t = 0; t < 600; t++) { tick(s, 1); runAi(s, 1); }
  assert.ok(owned(s, NEUTRAL).length < before);
  assert.ok(s.run.regions.every(r => r.owner !== OFF || (r.def === 0 && r.div === 0)));
});
