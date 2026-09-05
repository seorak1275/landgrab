import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateRun, radiusFor, aiCountFor, neutralGarrison, PLAYER, NEUTRAL, TERRAIN } from '../src/world.js';
import { distance } from '../src/hex.js';

test('반지름·AI 수 공식', () => {
  assert.deepEqual([0, 1, 2, 4, 6, 8].map(radiusFor), [3, 3, 4, 5, 6, 6]);
  assert.deepEqual([0, 2, 3, 6, 9].map(aiCountFor), [2, 2, 3, 4, 4]);
});

test('중립 수비병 공식', () => {
  assert.equal(neutralGarrison(0, 0), 8);
  assert.equal(neutralGarrison(3, 0), Math.round(8 * 2.8));
  assert.equal(neutralGarrison(3, 2), Math.round(8 * 2.8 * 1.3));
});

test('새 판: 타일 수, 수도 배치, 시작 자원', () => {
  const run = generateRun(7, 0, {});
  assert.equal(run.tiles.length, 37);
  assert.equal(run.factions, 3);
  run.tiles.forEach((t, i) => assert.equal(t.id, i));
  const caps = run.tiles.filter(t => t.owner !== NEUTRAL);
  assert.equal(caps.length, 3);
  for (const c of caps) { assert.equal(c.terrain, 'citadel'); assert.equal(c.level, 1); assert.equal(c.soldiers, 30); }
  const pc = caps.find(t => t.owner === PLAYER);
  for (const c of caps) if (c !== pc) assert.equal(distance([pc.q, pc.r], [c.q, c.r]), 6);
  assert.deepEqual(run.gold, [100, 100, 100]);
  assert.equal(run.sendRatio, 0.5);
  assert.equal(run.maxTilesOwned, 1);
});

test('초기 병력 보너스는 플레이어 수도에만', () => {
  const run = generateRun(7, 0, { startArmy: 2 });
  const caps = run.tiles.filter(t => t.owner !== NEUTRAL);
  assert.equal(caps.find(t => t.owner === PLAYER).soldiers, 70);
  assert.equal(caps.find(t => t.owner === 1).soldiers, 30);
});

test('같은 시드는 같은 판, 지형은 4종 중 하나', () => {
  const a = generateRun(99, 0, {}), b = generateRun(99, 0, {});
  assert.deepEqual(a.tiles, b.tiles);
  for (const t of a.tiles.filter(t => t.owner === NEUTRAL)) assert.ok(['plain', 'forest', 'hill', 'mountain'].includes(t.terrain));
  assert.equal(TERRAIN.mountain.def, 1.0);
});

test('환생 4회면 반지름 5, AI 3', () => {
  const run = generateRun(1, 4, {});
  assert.equal(run.tiles.length, 91);
  assert.equal(run.factions, 4);
});
