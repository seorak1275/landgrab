// 환생에 남는 것들: 장군 · 계급 · 훈장 · 전적 · 저장 기반 난이도 추천
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GENERALS, GENERAL_SPECS, GENERAL_MAX, RANKS, MEDALS, RECORD_MAX,
  drawGeneral, generalOf, generalMul, setLead, careerScore, rankOf, rankBonus,
  addRecord, records, bestRecord, checkMedals, hasMedal, recommendDifficulty, newCareer,
} from '../src/career.js';

const mkLegacy = (over = {}) => ({ points: 0, prestigeCount: 0, upgrades: {}, difficulty: 'hell', ...newCareer(), ...over });

test('장군: 환생할 때마다 하나 뽑고, 같은 장군이면 레벨이 오른다 (최대 5)', () => {
  const legacy = mkLegacy();
  assert.equal(Object.keys(legacy.generals).length, 0);
  const a = drawGeneral(legacy, 1);
  assert.ok(GENERALS.some(g => g.key === a.key));
  assert.equal(a.level, 1);
  assert.equal(a.isNew, true);
  assert.equal(legacy.generals[a.key], 1);
  assert.deepEqual(drawGeneral(legacy, 1), { key: a.key, level: 2, isNew: false }); // 같은 시드면 같은 장군
  legacy.generals[a.key] = GENERAL_MAX;
  assert.equal(drawGeneral(legacy, 1).level, GENERAL_MAX, '최대 레벨에서 더 오르지 않는다');
  for (const g of GENERALS) assert.ok(GENERAL_SPECS[g.spec], g.name);
});

test('장군 효과: 고른 장군의 특기만 레벨당 5%', () => {
  const legacy = mkLegacy();
  const g = GENERALS.find(x => x.spec === 'attack');
  legacy.generals[g.key] = 3;
  assert.equal(generalMul(legacy, 'attack'), 1, '고르지 않으면 효과 없음');
  assert.equal(setLead(legacy, g.key), true);
  assert.equal(generalOf(legacy).key, g.key);
  assert.ok(Math.abs(generalMul(legacy, 'attack') - 1.15) < 1e-9);
  assert.equal(generalMul(legacy, 'prod'), 1);
  assert.equal(setLead(legacy, '없는장군'), false);
});

test('계급: 환생·정복으로 공적이 쌓이고, 계급마다 생산 보너스', () => {
  const legacy = mkLegacy();
  assert.equal(careerScore(legacy), 0);
  assert.equal(rankOf(legacy).name, RANKS[0].name);
  assert.equal(rankBonus(legacy), 1);
  legacy.prestigeCount = 5; legacy.conquests = 3;
  assert.equal(careerScore(legacy), 5 + 3 * 2);
  const r = rankOf(legacy);
  assert.ok(r.need <= careerScore(legacy));
  assert.ok(rankBonus(legacy) > 1);
  legacy.prestigeCount = 999; legacy.conquests = 999;
  assert.equal(rankOf(legacy).name, RANKS[RANKS.length - 1].name);
  for (let i = 1; i < RANKS.length; i++) assert.ok(RANKS[i].need > RANKS[i - 1].need, RANKS[i].name);
});

test('전적: 판마다 기록이 쌓이고 최근 것이 앞, 최고 기록을 찾는다', () => {
  const legacy = mkLegacy();
  addRecord(legacy, { mode: 'region', board: 'all', difficulty: 'hell', outcome: 'wiped', regions: 12, total: 251, elapsed: 600, points: 8 });
  addRecord(legacy, { mode: 'region', board: 'capital', difficulty: 'hell', outcome: 'conquered', regions: 79, total: 79, elapsed: 900, points: 60 });
  const rs = records(legacy);
  assert.equal(rs.length, 2);
  assert.equal(rs[0].outcome, 'conquered', '최근 것이 앞');
  assert.equal(legacy.conquests, 1);
  assert.equal(bestRecord(legacy).regions, 79);
  for (let i = 0; i < RECORD_MAX + 10; i++) addRecord(legacy, { mode: 'region', outcome: 'wiped', regions: i, total: 251, elapsed: 10, points: 1 });
  assert.equal(records(legacy).length, RECORD_MAX, '오래된 것부터 버린다');
});

test('훈장: 조건을 채우면 한 번 받고 계속 남는다', () => {
  const legacy = mkLegacy();
  const got = checkMedals(legacy, { mode: 'region', outcome: 'conquered', regions: 79, total: 79, elapsed: 500, difficulty: 'hell', betrayals: 0, killed: 2 });
  const keys = got.map(m => m.key);
  assert.ok(keys.includes('first'), '첫 정복');
  assert.ok(keys.includes('blitz'), '10분 안에 정복');
  assert.ok(keys.includes('loyal'), '배신 없이 정복');
  assert.ok(keys.includes('hell'), '지옥 정복');
  assert.ok(hasMedal(legacy, 'first'));
  assert.equal(checkMedals(legacy, { mode: 'region', outcome: 'conquered', regions: 79, total: 79, elapsed: 500, difficulty: 'hell', betrayals: 0, killed: 2 }).length, 0, '두 번 주지 않는다');
  for (const [k, m] of Object.entries(MEDALS)) assert.ok(m.name && m.icon && typeof m.test === 'function', k);
});

test('저장 기반 난이도 추천: 잘하면 올리고, 계속 지면 내린다', () => {
  const legacy = mkLegacy({ difficulty: 'normal' });
  assert.equal(recommendDifficulty(legacy), 'normal', '기록이 없으면 지금 난이도');
  for (let i = 0; i < 3; i++) addRecord(legacy, { mode: 'region', outcome: 'conquered', regions: 79, total: 79, elapsed: 900, difficulty: 'normal', points: 50 });
  assert.equal(recommendDifficulty(legacy), 'hard', '연달아 정복하면 한 칸 위');
  const l2 = mkLegacy({ difficulty: 'hard' });
  for (let i = 0; i < 3; i++) addRecord(l2, { mode: 'region', outcome: 'wiped', regions: 3, total: 251, elapsed: 300, difficulty: 'hard', points: 1 });
  assert.equal(recommendDifficulty(l2), 'normal', '계속 지면 한 칸 아래');
  const l3 = mkLegacy({ difficulty: 'hell' });
  for (let i = 0; i < 3; i++) addRecord(l3, { mode: 'region', outcome: 'conquered', regions: 251, total: 251, elapsed: 900, difficulty: 'hell', points: 99 });
  assert.equal(recommendDifficulty(l3), 'hell', '맨 위에서는 그대로');
});

test("훈장 '기사회생'은 판 시작(1곳)만으로 받아지면 안 된다", () => {
  const legacy = mkLegacy();
  // 시작하자마자 정복: 한 번도 몰린 적이 없으니 기사회생은 아니다
  const got = checkMedals(legacy, { mode: 'region', outcome: 'conquered', regions: 79, total: 79, elapsed: 500, difficulty: 'hell', betrayals: 0, killed: 0, lowest: 99 });
  assert.ok(!got.some(m => m.key === 'comeback'));
  const l2 = mkLegacy();
  const got2 = checkMedals(l2, { mode: 'region', outcome: 'conquered', regions: 79, total: 79, elapsed: 500, difficulty: 'hell', betrayals: 0, killed: 0, lowest: 2 });
  assert.ok(got2.some(m => m.key === 'comeback'));
});
