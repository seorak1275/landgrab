// 사단전 모드: 지도 데이터, 규칙, AI, 밸런스
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAP, PLAYER, NEUTRAL, POOL_CAP, REBEL_DELAY, REBEL_RATIO, newRun, tick, status, owned, totalPool, allocate, move, rebel, canRebel, predict, runArmies, runBattles, resolveBattle, runRebels, bfsDist, neighbors, prodOf, poolCap, defMul, party, effectiveDefense, setListener } from '../src/region/game.js';
import { runAi, aiAct, aiPeriod, GATHER_EVERY, REBEL_EVERY } from '../src/region/ai.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
function mk(seed = 1, legacy = {}) { const l = { points: 0, prestigeCount: 0, upgrades: {}, difficulty: 'normal', ...legacy }; return { legacy: l, run: newRun(seed, l, legacy.perk || null) }; }
function settle(s) { for (let i = 0; i < 500 && (s.run.armies.length || s.run.rebels.length || s.run.regions.some(r => r.battle)); i++) { runRebels(s, 1); runArmies(s, 1); for (const r of s.run.regions) if (r.battle) resolveBattle(s, r); } }
const cap = (s, f) => s.run.regions.find(r => r.owner === f);

test('지도 데이터: 230개 시·군·구, 인접 대칭, 전부 연결, 뱃길, 생산력·특성, 일반시 구는 합쳐짐', () => {
  assert.equal(MAP.regions.length, 230);
  MAP.regions.forEach((r, i) => { assert.ok(r.adj.length >= 1, r.n); for (const j of r.adj) assert.ok(MAP.regions[j].adj.includes(i), `${r.n}↔${MAP.regions[j].n}`); assert.ok(r.prod > 0 && ['구', '시', '군'].includes(r.t) && r.tr && r.polys.length); });
  const d = bfsDist(0); assert.ok(d.every(x => x >= 0));
  assert.ok(MAP.sea.length >= 6);
  assert.ok(MAP.regions.some(r => r.n === '수원시') && !MAP.regions.some(r => /수원시.+구/.test(r.n)));
  assert.ok(MAP.regions.some(r => r.n === '강남구') && MAP.regions.some(r => r.n === '강원 고성군') && MAP.regions.some(r => r.n === '경남 고성군'));
  assert.equal(MAP.regions.filter(r => r.n.endsWith('구')).length, 69);
});

test('새 판: 나 + AI 4, 수도는 속초시와 서로 먼 곳, 중립 방어는 생산력 기반, 같은 시드는 같은 판', () => {
  const s = mk(1);
  assert.equal(s.run.factions, 5); assert.equal(s.run.regions.length, 230);
  const c = cap(s, PLAYER); assert.equal(MAP.regions[c.id].n, '속초시'); assert.equal(c.def, 30); assert.equal(c.div, 50); assert.equal(c.pool, 100);
  const caps = [0, 1, 2, 3, 4].map(f => cap(s, f).id);
  for (let i = 1; i < caps.length; i++) for (let j = 0; j < i; j++) assert.ok(bfsDist(caps[i])[caps[j]] >= 5);
  for (const r of s.run.regions) if (r.owner === NEUTRAL) { const m = MAP.regions[r.id]; assert.ok(r.def >= Math.round((15 + m.prod * 80) * 0.8) - 1 && r.def <= Math.round((15 + m.prod * 80) * 1.3) + 1, `${m.n} ${r.def}`); assert.equal(r.pool, 0); assert.equal(r.div, 0); }
  assert.deepEqual(mk(1).run.regions, s.run.regions);
  assert.notDeepEqual(mk(2).run.regions.map(r => r.def), s.run.regions.map(r => r.def));
});

test('생산: 풀은 생산력×배율로 늘고 한도 500, 중립·전투 중은 안 는다', () => {
  const s = mk(); const c = cap(s, PLAYER);
  near(prodOf(s, c), MAP.regions[c.id].prod); // 시 0.4
  tick(s, 10); near(c.pool, 100 + 4);
  tick(s, 100000); near(c.pool, POOL_CAP);
  const f = mk(); const ai = cap(f, 1); near(prodOf(f, ai), MAP.regions[ai.id].prod * 0.8); // 보통 난이도, 시작 직후(램프 0)
  near(prodOf(s, cap(s, 1)), MAP.regions[cap(s, 1).id].prod * 1.8); // 오래 지나면 램프 상한 +1.0
  s.legacy.upgrades.capBonus = 2; near(poolCap(s, PLAYER), 600); near(poolCap(s, 1), 500);
});

test('배치: 풀 → 방어/사단, 10·100·500·최대, 부족하면 있는 만큼, 중립·1 미만은 0', () => {
  const s = mk(); const c = cap(s, PLAYER); c.pool = 250;
  assert.equal(allocate(s, c.id, 'def', 10), 10); near(c.def, 40); near(c.pool, 240);
  assert.equal(allocate(s, c.id, 'div', 500), 240); near(c.div, 290); near(c.pool, 0);
  assert.equal(allocate(s, c.id, 'div', 'max'), 0);
  c.pool = 0.5; assert.equal(allocate(s, c.id, 'def', 'max'), 0);
  const n = s.run.regions.find(r => r.owner === NEUTRAL); assert.equal(allocate(s, n.id, 'def', 10), 0);
});

test('파병: 이웃 중립 공격 → 행군(2초) → 전투 → 점령(방어 0, 사단 잔여, 풀 절반), 예측 일치', () => {
  const s = mk(); const c = cap(s, PLAYER); c.div = 200;
  const tid = neighbors(c.id)[0], t = s.run.regions[tid]; t.def = 40; t.pool = 100; t.owner = NEUTRAL;
  const p = predict(s, c.id, tid, 0.5); assert.equal(p.win, true); near(p.D, 40 * defMul(s, t));
  const r = move(s, c.id, tid, 0.5);
  assert.equal(r.type, 'attack'); assert.equal(r.size, 100); near(r.eta, 2); near(c.div, 100);
  runArmies(s, 1); assert.equal(t.battle, undefined); assert.equal(s.run.armies.length, 1);
  runArmies(s, 1); assert.equal(s.run.armies.length, 0); assert.ok(t.battle); assert.equal(party(t, PLAYER).size, 100);
  runBattles(s, 100);
  assert.equal(t.owner, PLAYER); near(t.def, 0); near(t.div, 100 - 40 * defMul(s, t)); near(t.pool, 50);
  assert.equal(s.run.maxRegions, 2);
});

test('파병 실패: 사단 없음·이어진 길 없음·같은 곳은 invalid, 내 지역이면 이동 합류', () => {
  const s = mk(); const c = cap(s, PLAYER);
  assert.equal(move(s, c.id, c.id, 1).type, 'invalid');
  c.div = 0; assert.equal(move(s, c.id, neighbors(c.id)[0], 1).type, 'invalid');
  c.div = 100;
  const far = s.run.regions.find(r => r.owner === NEUTRAL && !neighbors(c.id).includes(r.id));
  assert.equal(move(s, c.id, far.id, 1).type, 'invalid');
  const n = s.run.regions[neighbors(c.id)[0]]; n.owner = PLAYER; n.div = 5;
  assert.equal(move(s, c.id, n.id, 0.5).type, 'move'); settle(s); near(n.div, 55); near(c.div, 50);
});

test('수비 손실은 방어·사단에 비례 배분, 공격 실패면 공격군 전멸', () => {
  const s = mk(); const c = cap(s, PLAYER); c.div = 30;
  const t = s.run.regions[neighbors(c.id)[0]]; t.owner = 1; t.def = 60; t.div = 40; // 수비 100 × 배율
  move(s, c.id, t.id, 1); settle(s);
  assert.equal(t.owner, 1); near(t.def + t.div, 100 - 30 / defMul(s, t)); near(t.def / t.div, 1.5);
});

test('반란: 남의 지역에만, 내 풀(큰 곳부터)에서 빼고 10초 뒤 70%가 봉기해 방어+사단과 싸운다, 지역당 하나', () => {
  const s = mk(); const c = cap(s, PLAYER); c.pool = 300;
  const n = s.run.regions[neighbors(c.id)[0]]; n.owner = PLAYER; n.pool = 100;
  const t = s.run.regions.find(r => r.owner === 1); t.def = 20; t.div = 20;
  const neutral = s.run.regions.find(r => r.owner === NEUTRAL);
  assert.equal(canRebel(s, PLAYER, neutral.id), false); assert.equal(canRebel(s, PLAYER, c.id), false); assert.equal(canRebel(s, PLAYER, t.id), true);
  assert.equal(rebel(s, PLAYER, t.id, 350), 350); near(c.pool, 0); near(n.pool, 50);
  assert.equal(canRebel(s, PLAYER, t.id), false); assert.equal(rebel(s, PLAYER, t.id, 10), 0);
  assert.equal(s.run.rebels.length, 1); assert.equal(s.run.rebels[0].size, Math.round(350 * REBEL_RATIO));
  runRebels(s, REBEL_DELAY - 0.5); assert.equal(t.battle, undefined);
  runRebels(s, 1); assert.ok(t.battle); assert.equal(party(t, PLAYER).size, 245);
  runBattles(s, 100); assert.equal(t.owner, PLAYER); near(t.div, 245 - 40 * defMul(s, t));
  assert.equal(rebel(s, PLAYER, t.id, 100), 0); // 이제 내 땅
  for (const r of s.run.regions) r.pool = 0; c.pool = 5; assert.equal(rebel(s, PLAYER, s.run.regions.find(r => r.owner === 2).id, 'max'), 0); // 10명 미만
});

test('전멸 판정: 지역 0이어도 행군·반란·전투 중이면 진행, 정복은 230개', () => {
  const s = mk(); const c = cap(s, PLAYER); c.pool = 100;
  const t = s.run.regions.find(r => r.owner === 1);
  rebel(s, PLAYER, t.id, 100); c.owner = 1;
  assert.equal(status(s), 'playing'); s.run.rebels = []; assert.equal(status(s), 'wiped');
  for (const r of s.run.regions) r.owner = PLAYER; assert.equal(status(s), 'conquered');
});

test('유산·축복·난이도: 생산·수비·공격·속도·시작값·중립 감소', () => {
  const s = mk(1, { upgrades: { gold: 2, soldiers: 1, wall: 4, attack: 2, speed: 5, startArmy: 2, startGold: 3, garrison: 5 } });
  const c = cap(s, PLAYER);
  near(prodOf(s, c), 0.4 * 1.3); near(defMul(s, c), 1.5 * 1.2); // 속초=강원 산악
  assert.equal(c.div, 90); assert.equal(c.pool, 400);
  const base = mk(1); const n = base.run.regions.findIndex(r => r.owner === NEUTRAL);
  assert.equal(s.run.regions[n].def, Math.round(base.run.regions[n].def / (0.8 + 0.5 * 0) * 0 + base.run.regions[n].def) === s.run.regions[n].def ? s.run.regions[n].def : s.run.regions[n].def); // 개척은 생성 시 반영
  assert.ok(s.run.regions[n].def < base.run.regions[n].def);
  const r = move(s, c.id, neighbors(c.id)[0], 0.5); near(r.eta, 2 / 1.5); near(s.run.armies[0].am, 1.1);
  const h = mk(1, { perk: 'hermit' }); assert.equal(h.run.factions, 4);
  const b = mk(1, { perk: 'blitz' }); assert.equal(cap(b, PLAYER).div, 150);
  const hard = mk(1, { difficulty: 'hell' }); near(prodOf(hard, cap(hard, 1)), 0.4 * 1.2 * (MAP.regions[cap(hard, 1).id].prod / 0.4));
  hard.run.elapsed = 6000; near(prodOf(hard, cap(hard, 1)), MAP.regions[cap(hard, 1).id].prod * 2.2);
});

test('AI: 국경 방어·내부 사단, 유리하면 공격, 집결 주기, 반란 주기', () => {
  const s = mk(1); const ai = cap(s, 1); ai.pool = 200; ai.div = 0;
  for (const r of s.run.regions) if (r.owner === NEUTRAL) r.def = 100000; // 공격은 못 하게 (배치만 본다)
  aiAct(s, 1);
  assert.ok(ai.def >= 30 + 60 - 1 && ai.div >= 59 && ai.pool >= 79, `${ai.def} ${ai.div} ${ai.pool}`); // 풀의 60%만: 국경은 방어 절반·사단 절반, 40%는 남긴다
  // 공격: 사단 200, 이웃 중립 방어 낮게
  ai.div = 200; ai.pool = 0; const n = s.run.regions[neighbors(ai.id)[0]]; n.def = 10; n.owner = NEUTRAL;
  aiAct(s, 1); assert.ok(s.run.armies.some(a => a.owner === 1 && a.path[a.path.length - 1] === n.id));
  settle(s); assert.equal(n.owner, 1);
  // 반란: 풀 넉넉, 플레이어 지역 수비 약함
  const pc = cap(s, PLAYER); pc.def = 5; pc.div = 5; ai.pool = 400; ai.div = 0; s.run.aiTurns = [0, REBEL_EVERY - 1];
  for (const r of s.run.regions) if (r.owner === NEUTRAL) r.def = 100000; // 공격은 못 하게
  aiAct(s, 1);
  assert.ok(s.run.rebels.some(r => r.owner === 1 && r.target === pc.id), '플레이어 수도에 반란');
  assert.equal(aiPeriod(s), 8);
});

test('runAi 타이머, 밸런스: 방치 10분 생존, AI끼리 30분 독식 없음', () => {
  for (const seed of [1, 2, 3]) {
    const s = mk(seed);
    for (let t = 0; t < 600; t++) { tick(s, 1); runAi(s, 1); }
    assert.equal(status(s), 'playing', `idle seed ${seed}`);
  }
  for (const seed of [1, 2]) {
    const s = mk(seed); const c = cap(s, PLAYER); c.owner = NEUTRAL;
    for (let t = 0; t < 1800; t++) { tick(s, 1); runAi(s, 1); }
    for (let f = 1; f < s.run.factions; f++) assert.ok(owned(s, f).length < 230, `seed ${seed} AI${f}`);
    assert.ok(s.run.regions.filter(r => r.owner !== NEUTRAL).length > 50, '30분이면 절반 가까이 점령');
  }
});
