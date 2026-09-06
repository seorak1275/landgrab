import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeState, greedy } from './helpers.js';
import { PLAYER, NEUTRAL } from '../src/world.js';
import { tick, status, tilesOwned } from '../src/sim.js';
import { runAi } from '../src/ai.js';

function step(s, dt) { tick(s, dt); runAi(s, dt); }

test('① 아무것도 안 해도 10분 안에는 수도를 잃지 않는다', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const s = makeState(seed);
    for (let t = 0; t < 600; t += 1) step(s, 1);
    assert.equal(status(s), 'playing', `seed ${seed}`);
  }
});

test('② 탐욕 플레이어는 2시간 안에 R=3 지도를 정복한다', () => {
  for (const seed of [1, 2, 3]) {
    const s = makeState(seed);
    let t = 0;
    while (t < 7200 && status(s) === 'playing') { step(s, 1); if (t % 5 === 0) greedy(s); t += 1; }
    assert.equal(status(s), 'conquered', `seed ${seed} at ${t}s, tiles=${tilesOwned(s, PLAYER)}`);
  }
});

test('③ AI끼리만 30분: 어느 AI도 전체를 먹지 못한다', () => {
  for (const seed of [1, 2, 3]) {
    const s = makeState(seed);
    for (const t of s.run.tiles) if (t.owner === PLAYER) { t.owner = NEUTRAL; t.soldiers = 30; }
    for (let t = 0; t < 1800; t += 1) step(s, 1);
    for (let f = 1; f < s.run.factions; f++) assert.ok(tilesOwned(s, f) < s.run.tiles.length, `seed ${seed} AI${f}`);
  }
});

// 실제 지도(대한민국·서울)에서도 같은 시나리오. 지형이 비대칭이라 AI끼리는 한쪽이 크게 이길 수 있어 ③은 "전부는 못 먹는다"만 본다
for (const map of ['korea', 'seoul']) {
  test(`${map}: ① 방치 10분 생존 ② 탐욕 2시간 정복 ③ AI 30분 독식 없음`, () => {
    for (const seed of [1, 2]) {
      const s = makeState(seed, 0, {}, map);
      for (let t = 0; t < 600; t += 1) step(s, 1);
      assert.equal(status(s), 'playing', `${map} idle seed ${seed}`);
    }
    for (const seed of [1, 2, 3]) {
      const s = makeState(seed, 0, {}, map);
      let t = 0;
      while (t < 7200 && status(s) === 'playing') { step(s, 1); if (t % 5 === 0) greedy(s); t += 1; }
      assert.equal(status(s), 'conquered', `${map} greedy seed ${seed} at ${t}s, tiles=${tilesOwned(s, PLAYER)}`);
    }
    for (const seed of [1, 2]) {
      const s = makeState(seed, 0, {}, map);
      for (const t of s.run.tiles) if (t.owner === PLAYER) { t.owner = NEUTRAL; t.soldiers = 30; }
      for (let t = 0; t < 1800; t += 1) step(s, 1);
      for (let f = 1; f < s.run.factions; f++) assert.ok(tilesOwned(s, f) < s.run.tiles.length, `${map} seed ${seed} AI${f}`);
    }
  });
}
