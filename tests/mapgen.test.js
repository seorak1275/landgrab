import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAPS, pointInPoly, fillHexes, cellFor, components, hexLine, connect, placeCapitals, buildMap } from '../src/mapgen.js';
import { generateRun, PLAYER, NEUTRAL, TERRAIN, radiusFor } from '../src/world.js';
import { regionHolders, regionMul, heldRegions, regionCount, goldRate, soldierRate, tick, REGION_BONUS } from '../src/sim.js';
import { makeState } from './helpers.js';
import { distance } from '../src/hex.js';

const square = [[0, 0], [1, 0], [1, 1], [0, 1]];

test('다각형 안/밖 판정 (짝홀)', () => {
  assert.equal(pointInPoly(square, 0.5, 0.5), true);
  assert.equal(pointInPoly(square, 1.5, 0.5), false);
  assert.equal(pointInPoly(square, 0.5, -0.1), false);
});

test('지도 데이터: 서울 25개 구, 대한민국 17개 시·도, 좌표는 폭 1 안', () => {
  assert.equal(MAPS.seoul.regions.length, 25);
  assert.equal(MAPS.korea.regions.length, 17);
  for (const m of [MAPS.seoul, MAPS.korea]) for (const r of m.regions) for (const p of r.polys) for (const [x, y] of p) { assert.ok(x >= 0 && x <= 1 && y >= 0 && y <= m.height, `${m.key} ${r.name}`); }
  assert.ok(MAPS.korea.regions.some(r => r.name === '강원') && MAPS.seoul.regions.some(r => r.name === '강남구'));
});

test('cellFor: 목표 타일 수에 가깝게 (±10%), 작을수록 타일 많음', () => {
  for (const m of [MAPS.seoul, MAPS.korea]) for (const target of [37, 61, 91, 127]) {
    const n = fillHexes(m, cellFor(m, target)).length;
    assert.ok(Math.abs(n - target) <= target * 0.1, `${m.key} ${target} → ${n}`);
  }
  assert.ok(fillHexes(MAPS.seoul, 0.05).length > fillHexes(MAPS.seoul, 0.08).length);
});

test('육각 직선: 양 끝 포함, 이웃끼리 이어짐', () => {
  const line = hexLine([0, 0], [3, -2]);
  assert.deepEqual(line[0], [0, 0]); assert.deepEqual(line[line.length - 1], [3, -2]);
  assert.equal(line.length, 4);
  for (let i = 1; i < line.length; i++) assert.equal(distance(line[i - 1], line[i]), 1);
});

test('connect: 떨어진 섬은 뱃길로 잇고, 1칸짜리 중복 지역 조각은 버린다', () => {
  const tiles = [{ q: 0, r: 0, region: 0 }, { q: 1, r: 0, region: 0 }, { q: 2, r: 0, region: 0 },
    { q: 5, r: 0, region: 1 }, { q: 6, r: 0, region: 1 }, // 섬(지역 1, 2칸) → 잇는다
    { q: 0, r: 3, region: 0 }]; // 본토에도 있는 지역의 1칸 조각 → 버림
  const out = connect(tiles);
  assert.equal(components(out).length, 1);
  assert.equal(out.filter(t => t.sea).length, 2); // (3,0),(4,0)
  assert.ok(!out.some(t => t.q === 0 && t.r === 3));
  assert.ok(out.some(t => t.q === 6 && t.r === 0));
});

test('connect: 1칸이라도 그 지역이 본토에 없으면 (제주처럼) 잇는다', () => {
  const out = connect([{ q: 0, r: 0, region: 0 }, { q: 1, r: 0, region: 0 }, { q: 0, r: 3, region: 7 }]);
  assert.equal(components(out).length, 1);
  assert.ok(out.some(t => t.region === 7));
});

test('수도 배치: 플레이어는 home 근처, AI는 서로 멀리, 뱃길엔 안 놓는다', () => {
  const b = buildMap('korea', 127, 5);
  const [pq, pr] = b.capitals[0];
  const pt = b.tiles.find(t => t.q === pq && t.r === pr);
  assert.equal(b.map.regions[pt.region].name, '강원'); // 설악산
  for (const [q, r] of b.capitals) assert.ok(!b.tiles.find(t => t.q === q && t.r === r).sea);
  for (let i = 1; i < b.capitals.length; i++) for (let j = 0; j < i; j++) assert.ok(distance(b.capitals[i], b.capitals[j]) >= 4);
  assert.equal(new Set(b.capitals.map(c => c.join(','))).size, 5);
});

test('실제 지도 판: 한 덩어리, 지역 이름, 뱃길 지형, 같은 시드는 같은 판', () => {
  for (const key of ['korea', 'seoul']) for (const prestige of [0, 4]) {
    const run = generateRun(11, prestige, {}, key);
    const R = radiusFor(prestige), target = 3 * R * (R + 1) + 1;
    assert.ok(Math.abs(run.tiles.length - target) <= target * 0.1, `${key} p${prestige} tiles=${run.tiles.length}`);
    assert.equal(run.map, key);
    assert.equal(run.regions.length, MAPS[key].regions.length);
    assert.equal(components(run.tiles).length, 1);
    run.tiles.forEach((t, i) => assert.equal(t.id, i));
    for (const t of run.tiles) { if (t.region >= 0) assert.ok(TERRAIN[t.terrain] && t.terrain !== 'sea'); else assert.ok(t.terrain === 'sea' || t.owner !== NEUTRAL); }
    assert.equal(run.tiles.filter(t => t.owner !== NEUTRAL).length, run.factions);
    assert.deepEqual(generateRun(11, prestige, {}, key).tiles, run.tiles);
  }
});

test('지역 지형 가중치: 강원은 산이, 전북은 평지가 많다 (여러 시드 합계)', () => {
  const count = {};
  for (let seed = 1; seed <= 12; seed++) for (const t of generateRun(seed, 6, {}, 'korea').tiles) {
    if (t.owner !== NEUTRAL || t.region < 0) continue;
    const name = MAPS.korea.regions[t.region].name;
    (count[name] ||= { plain: 0, mountain: 0, n: 0 }); count[name][t.terrain] = (count[name][t.terrain] || 0) + 1; count[name].n++;
  }
  assert.ok(count['강원'].mountain / count['강원'].n > count['전북'].mountain / count['전북'].n);
  assert.ok(count['전북'].plain / count['전북'].n > count['강원'].plain / count['강원'].n);
});

test('지역 완전 점령 보너스: 전부 가지면 +50%, 하나라도 남의 것이면 없음, 육각 평원엔 없음', () => {
  const s = makeState(3, 0, {}, 'seoul');
  const cap = s.run.tiles.find(t => t.owner === PLAYER);
  const mates = s.run.tiles.filter(t => t.region === cap.region);
  assert.ok(mates.length > 1);
  assert.equal(regionMul(s.run, cap), 1);
  for (const t of mates) t.owner = PLAYER;
  assert.equal(regionMul(s.run, cap), 1 + REGION_BONUS);
  assert.equal(heldRegions(s.run, PLAYER), 1);
  const g1 = goldRate(s, cap), r1 = soldierRate(s, cap);
  mates[0].owner = 1;
  assert.equal(regionMul(s.run, cap), 1); assert.equal(goldRate(s, cap) * 1.5, g1); assert.equal(soldierRate(s, cap) * 1.5, r1);
  const h = makeState(3, 0, {}, 'hex');
  assert.equal(regionHolders(h.run), null);
  assert.equal(regionMul(h.run, h.run.tiles.find(t => t.owner === PLAYER)), 1);
  assert.equal(heldRegions(h.run, PLAYER), 0);
});

test('타일 1개짜리 지역은 혼자 다 가져도 보너스 없음, regionCount는 2개 이상 지역만 센다', () => {
  const s = makeState(1, 0, {}, 'korea');
  const counts = {}; for (const t of s.run.tiles) if (t.region >= 0) counts[t.region] = (counts[t.region] || 0) + 1;
  const single = s.run.tiles.find(t => counts[t.region] === 1);
  assert.ok(single); single.owner = PLAYER;
  assert.equal(regionMul(s.run, single), 1);
  assert.equal(regionCount(s.run), Object.values(counts).filter(c => c >= 2).length);
  assert.ok(regionCount(s.run) < Object.keys(counts).length);
});

test('중립만 있는 지역은 중립이 보유자지만 보너스는 없다', () => {
  const s = makeState(3, 0, {}, 'seoul');
  const t = s.run.tiles.find(t => t.owner === NEUTRAL && t.region >= 0 && s.run.tiles.filter(x => x.region === t.region).every(x => x.owner === NEUTRAL));
  assert.ok(t);
  assert.equal(regionMul(s.run, t), 1);
  const g = s.run.gold[PLAYER];
  tick(s, 1); assert.ok(s.run.gold[PLAYER] > g);
});
