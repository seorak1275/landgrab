// 사단전: 기술 연구와 외교(정전·동맹·배신)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLAYER, NEUTRAL, TECHS, TECH_STEP, PACT_DUR, newRun, tick, research, hasTech, techCost, techCount, attackMul, speedOf, prodMul, rebelRatio, atPeace, relOf, proposePact, breakPact, leaderOf, owned, adj, move, rebel, allocate } from '../src/region/game.js';
import { runAi, aiAct, diplomacy } from '../src/region/ai.js';

function mk(seed = 1, legacy = {}) {
  const l = { points: 0, prestigeCount: 0, upgrades: {}, difficulty: 'normal', ...legacy };
  return { legacy: l, run: newRun(seed, l) };
}
const cap = (s, f) => s.run.regions.find(r => r.owner === f);

test('기술 4종: 인력 풀로 연구하고 그 판 동안 남는다, 비용은 연구할수록 오른다', () => {
  const s = mk(1);
  assert.deepEqual(Object.keys(TECHS), ['drill', 'march', 'agit', 'mobilize']);
  s.run.pool[PLAYER] = 0;
  assert.equal(research(s, PLAYER, 'drill'), false, '인력이 모자라면 실패');
  s.run.pool[PLAYER] = 500;
  const c0 = techCost(s, PLAYER, 'drill');
  assert.equal(c0, TECHS.drill.cost);
  assert.equal(research(s, PLAYER, 'drill'), true);
  assert.equal(hasTech(s.run, PLAYER, 'drill'), true);
  assert.equal(s.run.pool[PLAYER], 500 - c0);
  assert.equal(research(s, PLAYER, 'drill'), false, '같은 기술을 두 번 살 수 없다');
  assert.equal(techCount(s.run, PLAYER), 1);
  assert.equal(techCost(s, PLAYER, 'march'), Math.round(TECHS.march.cost * TECH_STEP));
  assert.equal(research(s, PLAYER, 'nope'), false);
});

test('기술 효과: 집중훈련=공격, 고속행군=행군, 동원령=생산, 침과공작=봉기 비율', () => {
  const s = mk(2);
  const a0 = attackMul(s, PLAYER), v0 = speedOf(s, PLAYER), p0 = prodMul(s, PLAYER);
  assert.equal(rebelRatio(s, PLAYER), 0.7);
  s.run.pool[PLAYER] = 5000;
  research(s, PLAYER, 'drill'); research(s, PLAYER, 'march'); research(s, PLAYER, 'mobilize'); research(s, PLAYER, 'agit');
  assert.ok(Math.abs(attackMul(s, PLAYER) - a0 * 1.2) < 1e-9);
  assert.ok(Math.abs(speedOf(s, PLAYER) - v0 * 1.5) < 1e-9);
  assert.ok(Math.abs(prodMul(s, PLAYER) - p0 * 1.25) < 1e-9);
  assert.equal(rebelRatio(s, PLAYER), 0.9);
  // AI도 같은 기술을 쓴다
  const b0 = prodMul(s, 1); s.run.pool[1] = 5000; research(s, 1, 'mobilize');
  assert.ok(Math.abs(prodMul(s, 1) - b0 * 1.25) < 1e-9);
});

test('정전: 받아들이면 서로 못 치고, 시간이 지나면 풀린다', () => {
  const s = mk(3);
  assert.equal(atPeace(s, PLAYER, 1), false);
  s.run.rel[PLAYER][1] = 30; // 사이가 좋으면 받아준다
  assert.equal(proposePact(s, PLAYER, 1), true);
  assert.equal(atPeace(s, PLAYER, 1), true);
  assert.equal(atPeace(s, 1, PLAYER), true);
  assert.equal(atPeace(s, PLAYER, 2), false);
  for (let t = 0; t < PACT_DUR + 1; t++) tick(s, 1);
  assert.equal(atPeace(s, PLAYER, 1), false, '정전은 기한이 있다');
});

test('배신: 정전 중에 치면 정전이 깨지고 관계가 크게 깎인다 (다른 세력도 조금)', () => {
  const s = mk(4);
  s.run.rel[PLAYER][1] = 40;
  proposePact(s, PLAYER, 1);
  const me = cap(s, PLAYER), other = cap(s, 1);
  // 상대 지역을 내 옆에 만들어 붙인다
  const n = adj(s.run, me.id)[0];
  s.run.regions[n].owner = 1; s.run.regions[n].def = 1;
  me.div = 100;
  const rel0 = relOf(s, PLAYER, 1), rel2 = relOf(s, PLAYER, 2);
  assert.notEqual(move(s, me.id, n, 1).type, 'invalid');
  assert.equal(atPeace(s, PLAYER, 1), false, '치면 정전이 깨진다');
  assert.ok(relOf(s, PLAYER, 1) < rel0 - 30, `${rel0} → ${relOf(s, PLAYER, 1)}`);
  assert.ok(relOf(s, PLAYER, 2) < rel2, '남 보기에도 믿을 수 없는 자');
  // 반란도 배신이다
  s.run.rel[PLAYER][2] = 40; proposePact(s, PLAYER, 2);
  s.run.pool[PLAYER] = 300; rebel(s, PLAYER, cap(s, 2).id, 100);
  assert.equal(atPeace(s, PLAYER, 2), false);
});

test('AI 외교: 가장 큰 세력을 싫어하고, 자기들끼리 정전을 맺어 몰린다', () => {
  const s = mk(5);
  // AI1을 압도적으로 키운다
  const ids = s.run.regions.filter(r => r.owner === NEUTRAL).slice(0, 60).map(r => r.id);
  for (const id of ids) s.run.regions[id].owner = 1;
  s.run.elapsed = 600;
  assert.equal(leaderOf(s), 1);
  for (let i = 0; i < 20; i++) diplomacy(s);
  assert.ok(!atPeace(s, 2, 1) && !atPeace(s, 3, 1), '선두와는 정전하지 않는다');
  assert.ok(atPeace(s, 2, 3) || atPeace(s, 2, 4) || atPeace(s, 3, 4), 'AI끼리는 손을 잡는다');
});

test('AI는 정전 중인 상대를 치지 않고, 인력이 남으면 기술을 연구한다', () => {
  const s = mk(6);
  s.run.elapsed = 1000; // 시작 휴전은 끝난 뒤
  s.run.rel[1][PLAYER] = 50; s.run.rel[PLAYER][1] = 50;
  assert.equal(proposePact(s, 1, PLAYER), true);
  const me = cap(s, PLAYER); me.def = 1; me.div = 0;
  const ai = cap(s, 1);
  // 플레이어 지역을 AI 옆에 붙여 둔다
  const n = adj(s.run, ai.id)[0];
  s.run.regions[n].owner = PLAYER; s.run.regions[n].def = 1;
  ai.div = 500; s.run.pool[1] = 1000;
  for (let i = 0; i < 8; i++) aiAct(s, 1);
  assert.ok(!s.run.armies.some(a => a.owner === 1 && s.run.regions[a.path[a.path.length - 1]].owner === PLAYER), '정전 중엔 안 친다');
  assert.ok(techCount(s.run, 1) >= 1, 'AI도 연구한다');
});

test('정전 중에는 예전 규칙대로 중립·다른 세력은 계속 친다', () => {
  const s = mk(7);
  s.run.elapsed = 1000;
  s.run.rel[1][PLAYER] = 50; assert.equal(proposePact(s, 1, PLAYER), true);
  const ai = cap(s, 1); ai.div = 400; s.run.pool[1] = 600;
  const before = owned(s, NEUTRAL).length;
  for (let t = 0; t < 200; t++) { tick(s, 1); runAi(s, 1); }
  assert.ok(owned(s, NEUTRAL).length < before, 'AI는 중립을 계속 먹는다');
});

test('상위 유산·계급·장군이 사단전에 붙는다', async () => {
  const g = await import('../src/region/game.js');
  const c = await import('../src/career.js');
  const base = mk(8);
  const s = mk(8, { upgrades: { research: 5, envoy: 2, supply: 3, command: 5 }, prestigeCount: 10 });
  // 연구소: 기술 비용 −6%/레벨 (플레이어만)
  assert.ok(g.techCost(s, PLAYER, 'drill') < g.techCost(base, PLAYER, 'drill'));
  assert.equal(g.techCost(s, 1, 'drill'), g.techCost(base, 1, 'drill'));
  // 보급술: 고립 감소 완화 (플레이어만)
  assert.ok(g.isoProd(s, PLAYER) > g.isoProd(base, PLAYER));
  assert.equal(g.isoProd(s, 1), g.isoProd(base, 1));
  // 사절: 내 정전이 길어진다
  s.run.rel[PLAYER][1] = 60; g.proposePact(s, PLAYER, 1);
  assert.ok(g.pactLeft(s, PLAYER, 1) > g.PACT_DUR);
  // 계급: 공적이 쌓이면 생산이 는다
  const before = g.prodMul(s, PLAYER), aiBefore = g.prodMul(s, 1);
  s.legacy.conquests = 20; // 계급 상승
  assert.ok(g.prodMul(s, PLAYER) > before);
  assert.equal(g.prodMul(s, 1), aiBefore, 'AI 생산은 계급과 무관');
  // 장군: 고른 장군의 특기만, 통솔 유산이 있으면 더 크게
  const att = c.GENERALS.find(x => x.spec === 'attack');
  s.legacy.generals = { [att.key]: 5 }; c.setLead(s.legacy, att.key);
  assert.ok(g.attackMul(s, PLAYER) > g.attackMul(base, PLAYER) * 1.25);
  assert.equal(g.speedOf(s, PLAYER), g.speedOf(base, PLAYER));
});
