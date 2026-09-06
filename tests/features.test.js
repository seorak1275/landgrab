// 타일 특화 건물 · 유산 상점 확장 · 환생 축복
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeState, capitalOf, settle } from './helpers.js';
import { PLAYER, NEUTRAL, generateRun, aiCountFor, neutralGarrison } from '../src/world.js';
import { BUILDINGS, buildCost, setBuilding, cap, goldRate, soldierRate, upgradeCost, defMul, attackMul, armySpeed, regionBonus, runTowers, tick, send, neighborIds, predictAttack, ARMY_SPEED, REGION_BONUS, buildMul, building, bestBuilding, traitOf, TRAITS } from '../src/sim.js';
import { PERKS, perkOf, offerPerks } from '../src/perks.js';
import { LEGACY_ITEMS, itemCost, buy, pointsFor, rebirth } from '../src/prestige.js';
import { aiPeriod } from '../src/ai.js';
import { deserialize, newState } from '../src/save.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('건물: 비용 = 150×지형골드계수, 골드 차감, 같은 건물 재선택·중립·골드 부족은 실패, 철거는 무료', () => {
  const s = makeState(); const c = capitalOf(s, PLAYER);
  near(buildCost(s, c), 150 * 3);
  assert.equal(setBuilding(s, c.id, 'farm'), false); // 골드 100
  s.run.gold[PLAYER] = 1000;
  assert.equal(setBuilding(s, c.id, 'farm'), true); assert.equal(c.build, 'farm'); near(s.run.gold[PLAYER], 550);
  assert.equal(setBuilding(s, c.id, 'farm'), false);
  assert.equal(setBuilding(s, c.id, 'wall'), true); near(s.run.gold[PLAYER], 100); // 바꾸면 다시 낸다
  assert.equal(setBuilding(s, c.id, null), true); assert.equal(c.build, undefined); near(s.run.gold[PLAYER], 100);
  assert.equal(setBuilding(s, c.id, null), false);
  const n = s.run.tiles.find(t => t.owner === NEUTRAL); s.run.gold[PLAYER] = 1e6;
  assert.equal(setBuilding(s, n.id, 'farm'), false);
  assert.equal(setBuilding(s, c.id, 'nope'), false);
});

test('건물 효과(평지, 특성 없음): 농장 골드 +60%×1.3, 병영 병사 +60%·출발 공격 +15%, 성벽 방어 +50%·한도 +25%, 망루 방어 +20%', () => {
  const s = makeState(); const c = capitalOf(s, PLAYER); s.run.gold[PLAYER] = 1e6;
  const t = s.run.tiles[neighborIds(s.run, c)[0]]; t.owner = PLAYER; t.terrain = 'plain'; t.soldiers = 40;
  const g0 = goldRate(s, t), r0 = soldierRate(s, t), cap0 = cap(t, s), d0 = defMul(s, t);
  setBuilding(s, t.id, 'farm'); near(goldRate(s, t), g0 * (1 + 0.6 * 1.3)); near(soldierRate(s, t), r0); // 평지 농장 친화 ×1.3
  setBuilding(s, t.id, 'barracks'); near(soldierRate(s, t), r0 * 1.6); near(goldRate(s, t), g0);
  const u = s.run.tiles[neighborIds(s.run, t).find(id => id !== c.id)]; u.soldiers = 5;
  send(s, t.id, u.id, 0.5); near(s.run.armies[0].am, 1.15); s.run.armies = [];
  setBuilding(s, t.id, 'wall'); near(defMul(s, t), d0 + 0.5); near(cap(t, s), cap0 * 1.25);
  setBuilding(s, t.id, 'tower'); near(defMul(s, t), d0 + 0.2);
  assert.equal(Object.keys(BUILDINGS).length, 4);
});

test('지형 친화도: 산엔 성벽·망루 ×1.5·농장 ×0.5, 성채엔 병영 ×1.3, 망루 주기는 배율만큼 짧아진다(최소 4초)', () => {
  const s = makeState(); const c = capitalOf(s, PLAYER); s.run.gold[PLAYER] = 1e6;
  near(buildMul(s.run, c, 'barracks'), 1.3); near(buildMul(s.run, c, 'farm'), 1);
  const t = s.run.tiles[neighborIds(s.run, c)[0]]; t.owner = PLAYER; t.terrain = 'mountain';
  near(buildMul(s.run, t, 'wall'), 1.5); near(buildMul(s.run, t, 'tower'), 1.5); near(buildMul(s.run, t, 'farm'), 0.5);
  assert.equal(bestBuilding(s.run, t).key, 'wall'); assert.equal(bestBuilding(s.run, c).key, 'barracks');
  setBuilding(s, t.id, 'wall'); near(building(t, s.run).def, 0.75); near(defMul(s, t), 2 + 0.75);
  setBuilding(s, t.id, 'tower'); near(building(t, s.run).auto, 8 / 1.5);
  t.terrain = 'plain'; near(building(t, s.run).auto, 8);
  assert.equal(traitOf(s.run, t), null); // 육각 평원엔 지역 특성 없음
});

test('지역 특성: 대한민국 강원은 산악(성벽·망루 ×1.5, 중립 수비 ×1.25), 전북은 평야(농장 ×1.5)', () => {
  const s = makeState(1, 6, {}, 'korea'); const run = s.run;
  const idx = name => run.regions.indexOf(name);
  assert.equal(run.traits[idx('강원')], 'mountain'); assert.equal(run.traits[idx('전북')], 'plain'); assert.equal(run.traits[idx('서울')], 'city');
  const gw = run.tiles.find(t => t.region === idx('강원') && t.terrain === 'plain');
  const jb = run.tiles.find(t => t.region === idx('전북') && t.terrain === 'plain');
  assert.ok(gw && jb);
  near(buildMul(run, gw, 'wall'), 1.5); near(buildMul(run, gw, 'farm'), 1.3 * 0.5);
  near(buildMul(run, jb, 'farm'), 1.3 * 1.5); near(buildMul(run, jb, 'wall'), 0.6);
  assert.equal(traitOf(run, gw), TRAITS.mountain);
  // 중립 수비: 산악 지역은 공식 ×1.25
  const gm = run.tiles.filter(t => t.owner === NEUTRAL && t.region === idx('강원'));
  assert.ok(gm.length);
  for (const t of gm) {
    const d = Math.min(...run.tiles.filter(x => x.owner !== NEUTRAL).map(x => Math.max(Math.abs(x.q - t.q), Math.abs(x.r - t.r), Math.abs(x.q + x.r - t.q - t.r))));
    assert.equal(t.soldiers, Math.round(neutralGarrison(d, 6) * 1.25));
  }
});

test('망루: 8초마다 60%로 여유 있게 이기는 옆 땅을 자동 공격 (중립 먼저), 못 이기면 가만히', () => {
  const s = makeState(); const c = capitalOf(s, PLAYER); s.run.gold[PLAYER] = 1e6;
  setBuilding(s, c.id, 'tower');
  const [a, b] = neighborIds(s.run, c).map(id => s.run.tiles[id]);
  for (const t of neighborIds(s.run, c).map(id => s.run.tiles[id])) { t.terrain = 'plain'; t.soldiers = 500; }
  a.soldiers = 10; b.soldiers = 20; c.soldiers = 40; // 24 > 13 ✓(a), 24 ≤ 26 ✗(b)
  runTowers(s, 7.9); assert.equal(s.run.armies.length, 0);
  runTowers(s, 0.2); assert.equal(s.run.armies.length, 1);
  assert.equal(s.run.armies[0].path[1], a.id); near(s.run.armies[0].soldiers, 24); near(c.soldiers, 16);
  settle(s); assert.equal(a.owner, PLAYER);
  c.soldiers = 5; runTowers(s, 8.1); assert.equal(s.run.armies.length, 0); // 병사 10 미만이면 안 함
  c.soldiers = 40; b.soldiers = 20; a.owner = PLAYER;
  runTowers(s, 8.1); assert.equal(s.run.armies.length, 0, '24 ≤ 20×1.3 → 안 침');
});

test('점령당하면 건물이 부서진다', () => {
  const s = makeState(); const c = capitalOf(s, PLAYER); s.run.gold[PLAYER] = 1e6;
  const t = s.run.tiles[neighborIds(s.run, c)[0]]; t.owner = PLAYER; t.terrain = 'plain'; t.soldiers = 5; setBuilding(s, t.id, 'farm');
  const ai = s.run.tiles[neighborIds(s.run, t).find(id => id !== c.id)]; ai.owner = 1; ai.terrain = 'plain'; ai.soldiers = 100;
  send(s, ai.id, t.id, 1); settle(s);
  assert.equal(t.owner, 1); assert.equal(t.build, undefined);
});

test('유산: 성벽술·병참·건축·행군·통치·개척·시작 골드·약탈·유산 축복 효과', () => {
  const s = makeState(1, 0, { wall: 4, capBonus: 3, discount: 5, speed: 5, regionBonus: 2, pointsMul: 3 });
  const c = capitalOf(s, PLAYER);
  near(defMul(s, c), 2 * 1.2); // 성채 +100% × (1 + 0.05×4)
  near(cap(c, s), 120 * 1.3);
  near(upgradeCost(c, s), 120 * 0.85); near(upgradeCost(c), 120); near(buildCost(s, c), 450 * 0.85);
  near(armySpeed(s, PLAYER), ARMY_SPEED * 1.5); near(armySpeed(s, 1), ARMY_SPEED);
  near(regionBonus(s, PLAYER), REGION_BONUS + 0.2); near(regionBonus(s, 1), REGION_BONUS);
  const ai = capitalOf(s, 1); near(defMul(s, ai), 2); // AI엔 안 붙는다
  // 개척·시작 골드는 판 생성에
  const r = generateRun(1, 0, { garrison: 5, startGold: 3 }, 'hex');
  const base = generateRun(1, 0, {}, 'hex');
  assert.equal(r.gold[PLAYER], 400); assert.equal(r.gold[1], 100);
  const n = base.tiles.findIndex(t => t.owner === NEUTRAL);
  assert.equal(r.tiles[n].soldiers, Math.round(base.tiles[n].soldiers * 0.8));
  // 약탈: 플레이어가 점령하면 골드 +30×레벨×타일레벨
  const s2 = makeState(1, 0, { loot: 2 }); const c2 = capitalOf(s2, PLAYER);
  const t = s2.run.tiles[neighborIds(s2.run, c2)[0]]; t.terrain = 'plain'; t.soldiers = 5; t.level = 3; c2.soldiers = 40;
  const g = s2.run.gold[PLAYER]; send(s2, c2.id, t.id, 1); settle(s2);
  assert.equal(t.owner, PLAYER); near(s2.run.gold[PLAYER], g + 30 * 2 * 3);
  // 유산 축복: 포인트 ×1.3
  s.legacy.difficulty = 'easy'; for (const t of s.run.tiles) { t.owner = PLAYER; t.level = 1; }
  assert.equal(pointsFor(s, 'conquered'), Math.floor((10 + 9 + 3) * 1.3));
  assert.equal(Object.keys(LEGACY_ITEMS).length, 15);
  for (const [k, it] of Object.entries(LEGACY_ITEMS)) assert.ok(it.max > 0 && itemCost(k, 0) === it.base);
});

test('축복: 후보 3개는 시드로 정해지고 서로 다르며, 고른 축복이 판에 붙는다', () => {
  const a = offerPerks(42), b = offerPerks(42), c = offerPerks(43);
  assert.deepEqual(a, b); assert.equal(new Set(a).size, 3); assert.notDeepEqual(a, c);
  for (const k of a) assert.ok(PERKS[k]);
  const s = makeState(); s.legacy.difficulty = 'easy'; for (const t of s.run.tiles) t.owner = PLAYER;
  rebirth(s, 'conquered', 7, 'hex', 'harvest');
  assert.equal(s.run.perk, 'harvest'); assert.equal(perkOf(s).gold, 1.3);
  near(goldRate(s, capitalOf(s, PLAYER)), 0.5 * 3 * 1.3);
  rebirth(s, 'conquered', 8, 'hex', 'nope'); assert.equal(s.run.perk, undefined);
});

test('축복 효과: 기습·보물·정찰·총동원·강철·요새·태만·통합·은둔·강행군', () => {
  const g = (perk, up = {}) => generateRun(3, 3, up, 'hex', perk); // 환생 3회 → AI 3
  assert.equal(g('blitz').tiles.find(t => t.owner === PLAYER).soldiers, 90);
  assert.equal(g('blitz', { startArmy: 1 }).tiles.find(t => t.owner === PLAYER).soldiers, 150);
  assert.equal(g('rich').gold[PLAYER], 600);
  assert.equal(g('hermit').factions, 1 + aiCountFor(3) - 1);
  assert.equal(g(null).factions, 1 + aiCountFor(3));
  const base = g(null), sc = g('scout'); const n = base.tiles.findIndex(t => t.owner === NEUTRAL);
  assert.equal(sc.tiles[n].soldiers, Math.round(base.tiles[n].soldiers * 0.7));
  const s = makeState(); const c = capitalOf(s, PLAYER);
  const r0 = soldierRate(s, c), d0 = defMul(s, c);
  s.run.perk = 'draft'; near(soldierRate(s, c), r0 * 1.3);
  s.run.perk = 'iron'; near(attackMul(s, PLAYER), 1.2); near(attackMul(s, 1), 1);
  s.run.perk = 'bastion'; near(defMul(s, c), d0 * 1.3); near(defMul(s, capitalOf(s, 1)), 2);
  s.run.perk = 'sloth'; near(aiPeriod(s), 8 * 1.4);
  s.run.perk = 'unity'; near(regionBonus(s, PLAYER), REGION_BONUS * 2);
  s.run.perk = 'march'; near(armySpeed(s, PLAYER), ARMY_SPEED * 1.5);
});

test('예전 저장(건물·축복·새 유산 없음)도 그대로 돈다', () => {
  const s = newState(9); delete s.run.perk; for (const t of s.run.tiles) delete t.build;
  for (const k of ['wall', 'startGold', 'garrison', 'capBonus', 'discount', 'speed', 'loot', 'regionBonus', 'pointsMul']) delete s.legacy.upgrades[k];
  const m = deserialize(JSON.stringify(s));
  assert.ok(m); tick(m, 1); near(defMul(m, capitalOf(m, PLAYER)), 2);
  assert.equal(buy(m, 'wall'), false); m.legacy.points = 100; assert.equal(buy(m, 'wall'), true); assert.equal(m.legacy.upgrades.wall, 1);
});
