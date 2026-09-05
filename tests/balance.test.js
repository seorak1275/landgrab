import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeState } from './helpers.js';
import { PLAYER, NEUTRAL, TERRAIN } from '../src/world.js';
import { tick, send, upgrade, status, neighborIds, upgradeCost, tilesOwned, attackMul } from '../src/sim.js';
import { runAi } from '../src/ai.js';

function step(s, dt) { tick(s, dt); runAi(s, dt); }

// 탐욕 플레이어: 5초마다 ① 가장 낮은 레벨 타일 업그레이드 ② 이길 수 있는 가장 약한 이웃 공격(70%) ③ 국경 보강
function greedy(s) {
  const mine = s.run.tiles.filter(t => t.owner === PLAYER);
  const low = mine.filter(t => t.level < 10).sort((a, b) => a.level - b.level)[0];
  if (low && s.run.gold[PLAYER] >= upgradeCost(low)) upgrade(s, low.id);
  const am = attackMul(s, PLAYER);
  let best = null;
  for (const t of mine) for (const id of neighborIds(s.run, t)) {
    const n = s.run.tiles[id]; if (n.owner === PLAYER) continue;
    const D = n.soldiers * (1 + TERRAIN[n.terrain].def);
    if (t.soldiers * 0.7 * am > D * 1.05 && (!best || D < best.D)) best = { from: t, to: n, D };
  }
  if (best) send(s, best.from.id, best.to.id, 0.7);
  const isBorder = t => neighborIds(s.run, t).some(id => s.run.tiles[id].owner !== PLAYER);
  for (const t of mine) {
    if (isBorder(t) || t.soldiers < 10) continue;
    const b = neighborIds(s.run, t).map(id => s.run.tiles[id]).filter(n => n.owner === PLAYER && isBorder(n)).sort((a, b) => a.soldiers - b.soldiers)[0];
    if (b) { send(s, t.id, b.id, 0.5); break; }
  }
}

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
