// 사단전: AI 성격 (공격형·수비형·확장형·음모형·외교형)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLAYER, NEUTRAL, newRun, tick, owned, adj, allocate, totalPool } from '../src/region/game.js';
import { runAi, aiAct, PERSONAS, personaOf, factionName, REBEL_EVERY } from '../src/region/ai.js';

function mk(seed = 1) { const l = { points: 0, prestigeCount: 0, upgrades: {}, difficulty: 'normal' }; return { legacy: l, run: newRun(seed, l) }; }
const cap = (s, f) => s.run.regions.find(r => r.owner === f);

test('성격 5종: 판이 만들어질 때 세력마다 하나씩 붙고 이름도 생긴다', () => {
  assert.equal(Object.keys(PERSONAS).length, 5);
  for (const [k, p] of Object.entries(PERSONAS)) {
    assert.ok(p.name && p.icon && p.desc, k);
    assert.ok(p.attack > 0 && p.defRatio >= 0 && p.defRatio <= 1, k);
  }
  const s = mk(3);
  assert.equal(s.run.personas.length, s.run.factions);
  for (let f = 1; f < s.run.factions; f++) {
    assert.ok(PERSONAS[personaOf(s.run, f).key], `AI ${f}`);
    assert.ok(factionName(s.run, f).length >= 2);
  }
  // 같은 시드면 같은 성격, 세력마다 서로 다른 성격이 되도록 섞는다
  assert.deepEqual(mk(3).run.personas, s.run.personas);
  const kinds = new Set(s.run.personas.slice(1).map(p => p.key));
  assert.ok(kinds.size >= Math.min(4, s.run.factions - 1), `성격이 겹치지 않아야: ${[...kinds]}`);
});

test('공격형은 더 낮은 우세에도 치고, 수비형은 방어에 더 넣는다', () => {
  const setup = (persona) => {
    const s = mk(4);
    s.run.elapsed = 1000;
    s.run.personas[1] = { key: persona, ...PERSONAS[persona] };
    const ai = cap(s, 1); ai.div = 100; ai.def = 0;
    const n = adj(s.run, ai.id).find(x => s.run.regions[x].owner === NEUTRAL);
    s.run.regions[n].def = 55; s.run.regions[n].div = 0;
    s.run.pool[1] = 400;
    return { s, ai, n };
  };
  const a = setup('aggressive'), d = setup('defensive');
  aiAct(a.s, 1); aiAct(d.s, 1);
  const att = x => x.s.run.armies.filter(y => y.owner === 1).length;
  assert.ok(att(a) >= att(d), `공격형 ${att(a)} ≥ 수비형 ${att(d)}`);
  assert.ok(d.s.run.regions[d.ai.id].def > a.s.run.regions[a.ai.id].def, '수비형이 방어를 더 쌓는다');
});

test('음모형은 반란을 자주, 외교형은 정전을 잘 맺는다', () => {
  const s = mk(5); s.run.elapsed = 1000;
  s.run.personas[1] = { key: 'schemer', ...PERSONAS.schemer };
  s.run.pool[1] = 500;
  const other = cap(s, 2); other.def = 5; other.div = 0;
  let rebels = 0;
  for (let i = 0; i < 12; i++) { s.run.pool[1] = 500; aiAct(s, 1); rebels += s.run.rebels.length; s.run.rebels = []; } // 생산으로 풀이 다시 차는 상황
  assert.ok(rebels >= 1, '음모형은 반란을 건다');
  assert.ok(PERSONAS.schemer.rebelEvery < REBEL_EVERY);
  assert.ok(PERSONAS.diplomat.pact > PERSONAS.aggressive.pact);
});

test('성격이 붙어도 판은 정상으로 돈다 (10분)', () => {
  const s = mk(6);
  for (let t = 0; t < 600; t++) { tick(s, 1); runAi(s, 1); }
  assert.ok(owned(s, NEUTRAL).length < 246);
});

test('AI 수는 판 크기에 비례한다 (지역 45곳당 하나, 최소 2 최대 6)', async () => {
  const g = await import('../src/region/game.js');
  assert.equal(g.maxAiFor('all'), 6);
  for (const b of ['capital', 'yeongnam', 'honam']) assert.equal(g.maxAiFor(b), 2, b);
  const l = { points: 0, prestigeCount: 9, upgrades: {}, difficulty: 'hell' }; // 환생을 많이 해도 권역 판은 2까지
  assert.equal(g.newRun(1, l, null, 'yeongnam').factions, 3);
  assert.equal(g.newRun(1, l, null, 'all').factions, 7);
});
