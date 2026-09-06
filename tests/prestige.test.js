import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeState } from './helpers.js';
import { PLAYER } from '../src/world.js';
import { LEGACY_ITEMS, itemCost, buy, pointsFor, rebirth } from '../src/prestige.js';

test('상점 비용 = 기본×1.5^레벨, 최대 레벨·포인트 부족이면 실패', () => {
  assert.equal(itemCost('gold', 0), 5);
  assert.equal(itemCost('gold', 2), Math.round(5 * 2.25));
  const s = makeState();
  assert.equal(buy(s, 'gold'), false);
  s.legacy.points = 12;
  assert.equal(buy(s, 'gold'), true);
  assert.equal(s.legacy.upgrades.gold, 1);
  assert.equal(s.legacy.points, 7);
  s.legacy.upgrades.offline = LEGACY_ITEMS.offline.max; s.legacy.points = 1e6;
  assert.equal(buy(s, 'offline'), false);
});

test('포인트: 정복 = 10 + 타일/4 + 레벨합/10, 전멸 = 최대보유/4(최소 1), 난이도 배수', () => {
  const s = makeState(); s.legacy.difficulty = 'easy';
  for (const t of s.run.tiles) { t.owner = PLAYER; t.level = 3; }
  assert.equal(pointsFor(s, 'conquered'), 10 + 9 + Math.floor(111 / 10));
  s.run.maxTilesOwned = 2;
  assert.equal(pointsFor(s, 'wiped'), 1);
  s.run.maxTilesOwned = 13;
  assert.equal(pointsFor(s, 'wiped'), 3);
  s.legacy.difficulty = 'normal'; assert.equal(pointsFor(s, 'conquered'), Math.floor(30 * 1.25)); assert.equal(pointsFor(s, 'wiped'), Math.floor(13 / 4 * 1.25));
  s.legacy.difficulty = 'hell'; assert.equal(pointsFor(s, 'conquered'), 60);
});

test('환생: 포인트 적립, 횟수 증가, 새 판(반지름·AI 공식), 유산 유지', () => {
  const s = makeState(); s.legacy.difficulty = 'easy';
  s.legacy.upgrades.startArmy = 1;
  for (const t of s.run.tiles) t.owner = PLAYER;
  const got = rebirth(s, 'conquered', 123);
  assert.equal(got, 10 + 9 + 3);
  assert.equal(s.legacy.points, got);
  assert.equal(s.legacy.prestigeCount, 1);
  assert.equal(s.run.tiles.length, 37);
  assert.equal(s.run.seed, 123);
  assert.equal(s.run.tiles.find(t => t.owner === PLAYER).soldiers, 50);
  rebirth(s, 'conquered', 124);
  assert.equal(s.run.tiles.length, 61);
});
