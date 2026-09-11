// 세계 지도 (나라가 칸, 대륙이 시·도 자리)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOARDS, MAP, ensureMap, setMap, boardIds, provinceIds, newRun, tick, status, owned, adj, bfsDist, maxAiFor, PLAYER, NEUTRAL, OFF } from '../src/region/game.js';
import { runAi } from '../src/region/ai.js';
import SGG from '../src/maps/sgg.js';

test('세계 지도: 175개 나라, 전부 이어지고, 대륙마다 판이 성립한다', async () => {
  const W = await ensureMap('world');
  assert.equal(W.key, 'world');
  assert.ok(W.regions.length >= 170);
  W.regions.forEach((r, i) => {
    assert.ok(r.n && r.p && r.prod > 0 && r.tr && r.polys.length, r.n);
    for (const j of r.adj) assert.ok(W.regions[j].adj.includes(i), `${r.n} ↔ ${W.regions[j].n}`);
  });
  const d = bfsDist(0); assert.ok(d.every(x => x >= 0), '전부 이어진다');
  for (const key of ['asia', 'europe', 'americas', 'africa', 'world']) {
    const ids = boardIds(key);
    assert.ok(ids.length >= 7, key);
    const dd = bfsDist(ids[0], key);
    for (const id of ids) assert.ok(dd[id] >= 0, `${key}: ${W.regions[id].n} 끊김`);
    assert.ok(ids.some(i => W.regions[i].n === BOARDS[key].home), `${key} 수도 ${BOARDS[key].home}`);
  }
  assert.ok(provinceIds('world').has('아시아'), '대륙이 시·도 자리');
  setMap(SGG); // 다른 테스트를 위해 되돌린다
});

test('세계 판에서 새 판을 만들고 10분 돌려도 정상', async () => {
  await ensureMap('world');
  const legacy = { points: 0, prestigeCount: 0, upgrades: {}, difficulty: 'normal' };
  const s = { legacy, run: newRun(3, legacy, null, 'asia') };
  assert.equal(MAP.regions[s.run.regions.find(r => r.owner === PLAYER).id].n, '대한민국');
  assert.ok(s.run.factions - 1 <= maxAiFor('asia'));
  const before = owned(s, NEUTRAL).length;
  for (let t = 0; t < 600; t++) { tick(s, 1); runAi(s, 1); }
  assert.ok(owned(s, NEUTRAL).length < before);
  assert.equal(s.run.regions.filter(r => r.owner !== OFF).length, boardIds('asia').length);
  setMap(SGG);
});

test('지도를 바꿔도 대한민국 판은 그대로 돈다', async () => {
  await ensureMap('world');
  await ensureMap('sgg');
  assert.equal(MAP.key, 'sgg');
  assert.equal(boardIds('all').length, 251);
  const legacy = { points: 0, prestigeCount: 0, upgrades: {}, difficulty: 'normal' };
  const s = { legacy, run: newRun(1, legacy, null, 'capital') };
  assert.equal(boardIds('capital').length, 79);
  assert.ok(adj(s.run, s.run.regions.find(r => r.owner === PLAYER).id).length > 0);
});
