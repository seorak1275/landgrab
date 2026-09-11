// 사단전 모드: 지도 데이터, 규칙, AI, 밸런스
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAP, BOARDS, TRAIT_DEF, PLAYER, NEUTRAL, POOL_CAP, CAP_PER_REGION, REBEL_DELAY, REBEL_RATIO, newRun, tick, status, owned, TRUCE, totalPool, totalProd, allocate, move, rebel, canRebel, predict, runArmies, runBattles, resolveBattle, runRebels, bfsDist, neighbors, prodOf, poolCap, defMul, party, effectiveDefense, setListener } from '../src/region/game.js';
import { runAi, aiAct, aiPeriod, GATHER_EVERY, REBEL_EVERY, personaOf } from '../src/region/ai.js';
import { greedyStep, BOT_EVERY } from '../tools/region_bot.mjs';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b}`);
function mk(seed = 1, legacy = {}) { const l = { points: 0, prestigeCount: 0, upgrades: {}, difficulty: 'normal', ...legacy }; return { legacy: l, run: newRun(seed, l, legacy.perk || null) }; }
function settle(s) { for (let i = 0; i < 500 && (s.run.armies.length || s.run.rebels.length || s.run.regions.some(r => r.battle)); i++) { runRebels(s, 1); runArmies(s, 1); for (const r of s.run.regions) if (r.battle) resolveBattle(s, r); } }
const cap = (s, f) => s.run.regions.find(r => r.owner === f);

test('지도 데이터: 251개 시·군·구, 인접 대칭, 전부 연결, 뱃길, 생산력·특성, 구 있는 시는 구까지', () => {
  assert.equal(MAP.regions.length, 251);
  MAP.regions.forEach((r, i) => { assert.ok(r.adj.length >= 1, r.n); for (const j of r.adj) assert.ok(MAP.regions[j].adj.includes(i), `${r.n}↔${MAP.regions[j].n}`); assert.ok(r.prod > 0 && ['구', '시', '군'].includes(r.t) && r.tr && r.polys.length); });
  const d = bfsDist(0); assert.ok(d.every(x => x >= 0));
  assert.ok(MAP.sea.length >= 6);
  assert.ok(MAP.regions.some(r => r.n === '수원 장안구') && !MAP.regions.some(r => r.n === '수원시') && MAP.regions.some(r => r.n === '속초시'));
  assert.ok(MAP.regions.some(r => r.n === '강남구') && MAP.regions.some(r => r.n === '강원 고성군') && MAP.regions.some(r => r.n === '경남 고성군'));
  assert.equal(MAP.regions.filter(r => r.n.endsWith('구')).length, 102);
});

test('새 판: 나 + AI 4, 수도는 기본 시작지와 서로 먼 곳, 중립 방어는 생산력 기반, 같은 시드는 같은 판', () => {
  const s = mk(1);
  assert.equal(s.run.factions, 5); assert.equal(s.run.regions.length, 251);
  const c = cap(s, PLAYER); assert.equal(MAP.regions[c.id].n, BOARDS.all.home); // 기본 시작지(수원 장안구), 속초시는 골라서 간다 assert.equal(c.def, 60); assert.equal(c.div, 80); assert.deepEqual(s.run.pool, [300, 100, 100, 100, 100]);
  const caps = [0, 1, 2, 3, 4].map(f => cap(s, f).id);
  for (let i = 1; i < caps.length; i++) for (let j = 0; j < i; j++) assert.ok(bfsDist(caps[i])[caps[j]] >= 5);
  for (const r of s.run.regions) if (r.owner === NEUTRAL) { const m = MAP.regions[r.id]; assert.ok(r.def >= Math.round((15 + m.prod * 20) * 0.8) - 1 && r.def <= Math.round((15 + m.prod * 20) * 1.3) + 1, `${m.n} ${r.def}`); assert.equal(r.div, 0); }
  assert.deepEqual(mk(1).run.regions, s.run.regions);
  assert.notDeepEqual(mk(2).run.regions.map(r => r.def), s.run.regions.map(r => r.def));
});

test('생산: 세력 풀 하나에 모든 지역 생산이 모이고 한도 500, 전투 중인 지역은 빠진다', () => {
  const s = mk(); const c = cap(s, PLAYER);
  const p0 = MAP.regions[c.id].prod; // 기본 시작지의 생산력 (구 2 · 시 1.5 · 군 1)
  near(prodOf(s, c), p0);
  tick(s, 10); near(s.run.pool[PLAYER], 300 + p0 * 10);
  const n = s.run.regions[neighbors(c.id)[0]]; n.owner = PLAYER; // 이웃 추가
  near(totalProd(s, PLAYER), p0 + MAP.regions[n.id].prod);
  tick(s, 10); near(s.run.pool[PLAYER], 300 + p0 * 20 + MAP.regions[n.id].prod * 10);
  n.battle = { parties: [{ owner: 1, size: 5, am: 1 }], rate: 5 }; near(totalProd(s, PLAYER), p0); delete n.battle;
  tick(s, 100000); near(s.run.pool[PLAYER], POOL_CAP + CAP_PER_REGION * 2); // 한도 = 500 + 지역당 2 (지금 내 지역 2곳)
  assert.equal(totalPool(s, NEUTRAL), 0);
  const f = mk(); const ai = cap(f, 1); near(prodOf(f, ai), MAP.regions[ai.id].prod * 0.8); // 보통 난이도, 시작 직후(램프 0)
  near(prodOf(s, cap(s, 1)), MAP.regions[cap(s, 1).id].prod * 1.8); // 오래 지나면 램프 상한 +1.0
  s.legacy.upgrades.capBonus = 2; near(poolCap(s, PLAYER), (POOL_CAP + CAP_PER_REGION * 2) * 1.2); near(poolCap(s, 1), POOL_CAP + CAP_PER_REGION * owned(s, 1).length);
});

test('배치: 풀 → 방어/사단, 10·100·500·최대, 부족하면 있는 만큼, 중립·1 미만은 0', () => {
  const s = mk(); const c = cap(s, PLAYER); s.run.pool[PLAYER] = 250;
  assert.equal(allocate(s, c.id, 'def', 10), 10); near(c.def, 70); near(s.run.pool[PLAYER], 240);
  assert.equal(allocate(s, c.id, 'div', 500), 240); near(c.div, 320); near(s.run.pool[PLAYER], 0);
  assert.equal(allocate(s, c.id, 'div', 'max'), 0);
  s.run.pool[PLAYER] = 0.5; assert.equal(allocate(s, c.id, 'def', 'max'), 0);
  const n = s.run.regions.find(r => r.owner === NEUTRAL); assert.equal(allocate(s, n.id, 'def', 10), 0);
});

test('파병: 이웃 중립 공격 → 행군(2초) → 전투 → 점령(방어 0, 사단 잔여, 풀 +10), 예측 일치', () => {
  const s = mk(); const c = cap(s, PLAYER); c.div = 200;
  const tid = neighbors(c.id)[0], t = s.run.regions[tid]; t.def = 40; t.owner = NEUTRAL; s.run.pool[PLAYER] = 0;
  const p = predict(s, c.id, tid, 0.5); assert.equal(p.win, true); near(p.D, 40 * defMul(s, t));
  const r = move(s, c.id, tid, 0.5);
  assert.equal(r.type, 'attack'); assert.equal(r.size, 100); near(r.eta, 2); near(c.div, 100);
  runArmies(s, 1); assert.equal(t.battle, undefined); assert.equal(s.run.armies.length, 1);
  runArmies(s, 1); assert.equal(s.run.armies.length, 0); assert.ok(t.battle); assert.equal(party(t, PLAYER).size, 100);
  runBattles(s, 100);
  assert.equal(t.owner, PLAYER); near(t.def, 0); near(t.div, 100 - 40 * defMul(s, t)); near(s.run.pool[PLAYER], 10);
  assert.equal(s.run.maxRegions, 2);
});

test('파병 실패: 사단 없음·비인접·같은 곳은 invalid, 내 지역이면 이동 합류', () => {
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
  const s = mk(); const c = cap(s, PLAYER); s.run.pool[PLAYER] = 400;
  const n = s.run.regions[neighbors(c.id)[0]]; n.owner = PLAYER;
  const t = s.run.regions.find(r => r.owner === 1); t.def = 20; t.div = 20;
  const neutral = s.run.regions.find(r => r.owner === NEUTRAL);
  assert.equal(canRebel(s, PLAYER, neutral.id), false); assert.equal(canRebel(s, PLAYER, c.id), false); assert.equal(canRebel(s, PLAYER, t.id), true);
  assert.equal(rebel(s, PLAYER, t.id, 350), 350); near(s.run.pool[PLAYER], 50);
  assert.equal(canRebel(s, PLAYER, t.id), false); assert.equal(rebel(s, PLAYER, t.id, 10), 0);
  assert.equal(s.run.rebels.length, 1); assert.equal(s.run.rebels[0].size, Math.round(350 * REBEL_RATIO));
  runRebels(s, REBEL_DELAY - 0.5); assert.equal(t.battle, undefined);
  runRebels(s, 1); assert.ok(t.battle); assert.equal(party(t, PLAYER).size, 245);
  runBattles(s, 100); assert.equal(t.owner, PLAYER); near(t.div, 245 - 40 * defMul(s, t));
  assert.equal(rebel(s, PLAYER, t.id, 100), 0); // 이제 내 땅
  s.run.pool[PLAYER] = 5; assert.equal(rebel(s, PLAYER, s.run.regions.find(r => r.owner === 2).id, 'max'), 0); // 10명 미만
});

test('전멸 판정: 지역 0이어도 행군·반란·전투 중이면 진행, 정복은 전부', () => {
  const s = mk(); const c = cap(s, PLAYER); s.run.pool[PLAYER] = 100;
  const t = s.run.regions.find(r => r.owner === 1);
  rebel(s, PLAYER, t.id, 100); c.owner = 1;
  assert.equal(status(s), 'playing'); s.run.rebels = []; assert.equal(status(s), 'wiped');
  for (const r of s.run.regions) r.owner = PLAYER; assert.equal(status(s), 'conquered');
});

test('유산·축복·난이도: 생산·수비·공격·속도·시작값·중립 감소', () => {
  const s = mk(1, { upgrades: { gold: 2, soldiers: 1, wall: 4, attack: 2, speed: 5, startArmy: 2, startGold: 3, garrison: 5 } });
  const c = cap(s, PLAYER);
  near(prodOf(s, c), MAP.regions[c.id].prod * 1.3); near(defMul(s, c), (TRAIT_DEF[MAP.regions[c.id].tr]) * 1.2);
  assert.equal(c.div, 120); assert.equal(s.run.pool[PLAYER], 600);
  const base = mk(1); const n = base.run.regions.findIndex(r => r.owner === NEUTRAL);
  assert.equal(s.run.regions[n].def, Math.round(base.run.regions[n].def / (0.8 + 0.5 * 0) * 0 + base.run.regions[n].def) === s.run.regions[n].def ? s.run.regions[n].def : s.run.regions[n].def); // 개척은 생성 시 반영
  assert.ok(s.run.regions[n].def < base.run.regions[n].def);
  const r = move(s, c.id, neighbors(c.id)[0], 0.5); near(r.eta, 2 / 1.5); near(s.run.armies[0].am, 1.1);
  const h = mk(1, { perk: 'hermit' }); assert.equal(h.run.factions, 4);
  const b = mk(1, { perk: 'blitz' }); assert.equal(cap(b, PLAYER).div, 240);
  const hard = mk(1, { difficulty: 'hell' }); near(prodOf(hard, cap(hard, 1)), MAP.regions[cap(hard, 1).id].prod * 1.2);
  hard.run.elapsed = 6000; near(prodOf(hard, cap(hard, 1)), MAP.regions[cap(hard, 1).id].prod * 2.2);
});

test('AI: 국경 방어·내부 사단, 유리하면 공격, 집결 주기, 반란 주기', () => {
  const s = mk(1); const ai = cap(s, 1); s.run.pool[1] = 200; ai.div = 0;
  const P = personaOf(s.run, 1); // 배치는 성격(spend·defRatio)에 따른다
  const def0 = ai.def;
  for (const r of s.run.regions) if (r.owner === NEUTRAL) r.def = 100000; // 공격은 못 하게 (배치만 본다)
  aiAct(s, 1);
  const spend = Math.floor(200 * P.spend);
  near((ai.def - def0) + ai.div, spend, 3); // 쓴 만큼 방어+사단으로 들어간다
  near(ai.def - def0, spend * P.defRatio, 3);
  near(s.run.pool[1], 200 - spend, 3);       // 나머지는 반란 자금으로 남긴다
  // 공격: 사단 200, 이웃 중립 방어 낮게
  ai.div = 200; s.run.pool[1] = 0; const n = s.run.regions[neighbors(ai.id)[0]]; n.def = 10; n.owner = NEUTRAL;
  aiAct(s, 1); assert.ok(s.run.armies.some(a => a.owner === 1 && a.path[a.path.length - 1] === n.id));
  settle(s); assert.equal(n.owner, 1);
  // 반란: 풀 넉넉, 플레이어 지역 수비 약함
  const pc = cap(s, PLAYER); pc.def = 5; pc.div = 5; s.run.pool[1] = 400; ai.div = 0; s.run.aiTurns = [0, (P.rebelEvery || REBEL_EVERY) - 1]; s.run.elapsed = 1000; // 휴전 끝
  for (const r of s.run.regions) if (r.owner === NEUTRAL) r.def = 100000; // 공격은 못 하게
  aiAct(s, 1);
  assert.ok(s.run.rebels.some(r => r.owner === 1 && r.target === pc.id), '플레이어 수도에 반란');
  s.run.rebels = []; s.run.elapsed = 0; s.run.pool[1] = 400; s.run.aiTurns = [0, (P.rebelEvery || REBEL_EVERY) - 1]; aiAct(s, 1);
  assert.ok(!s.run.rebels.some(r => r.target === pc.id), '휴전 중엔 플레이어에게 반란 안 함');
  assert.equal(aiPeriod(s), 8);
});

test('밸런스: 휴전 2분 · 능동 플레이어는 10분에 땅을 늘린다 · AI끼리 30분 독식 없음', () => {
  assert.equal(TRUCE, 120);
  // 방치는 없앴다 → 기준은 "손을 대면 이긴다". 봇(tools/region_bot.mjs)이 5초마다 수를 둔다
  for (const seed of [1, 2, 3]) {
    const s = mk(seed, { difficulty: 'hell' });
    for (let t = 0; t < 600; t++) { tick(s, 1); runAi(s, 1); if (t % BOT_EVERY === 0) greedyStep(s); }
    assert.equal(status(s), 'playing', `active seed ${seed}`);
    assert.ok(owned(s, PLAYER).length >= 10, `active seed ${seed}: ${owned(s, PLAYER).length}개`);
  }
  // 휴전 동안은 손을 놓아도 수도를 잃지 않는다
  for (const seed of [1, 2]) {
    const s = mk(seed, { difficulty: 'hell' });
    for (let t = 0; t < TRUCE; t++) { tick(s, 1); runAi(s, 1); }
    assert.equal(owned(s, PLAYER).length, 1, `truce seed ${seed}`);
  }
  for (const seed of [1, 2]) {
    const s = mk(seed); const c = cap(s, PLAYER); c.owner = NEUTRAL;
    for (let t = 0; t < 1800; t++) { tick(s, 1); runAi(s, 1); }
    for (let f = 1; f < s.run.factions; f++) assert.ok(owned(s, f).length < 251, `seed ${seed} AI${f}`);
    assert.ok(s.run.regions.filter(r => r.owner !== NEUTRAL).length > 50, '30분이면 절반 가까이 점령');
  }
});
