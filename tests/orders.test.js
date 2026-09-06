import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeState, capitalOf } from './helpers.js';
import { PLAYER, NEUTRAL } from '../src/world.js';
import { neighborIds, bfsOwn, pathTo, stagingFor, dispatch, previewTargets, predictAttack, setSendListener, send, runBattles } from '../src/sim.js';

// 수도에서 한 방향으로 n칸을 내 땅으로 만든 판을 준비한다
function corridor(s, n) {
  const run = s.run; let cur = capitalOf(s, PLAYER); const ids = [cur.id];
  for (let i = 0; i < n; i++) {
    const nid = neighborIds(run, cur).find(id => run.tiles[id].owner === NEUTRAL && !ids.includes(id));
    const t = run.tiles[nid]; t.owner = PLAYER; t.soldiers = 10; ids.push(nid); cur = t;
  }
  return ids;
}

test('bfsOwn/pathTo: 내 땅만 밟는 경로, 남의 땅은 못 지난다', () => {
  const s = makeState(1); const ids = corridor(s, 3);
  const parent = bfsOwn(s.run, ids[0]);
  assert.deepEqual(pathTo(parent, ids[3]), ids);
  s.run.tiles[ids[1]].owner = NEUTRAL;
  assert.equal(bfsOwn(s.run, ids[0]).has(ids[3]), false);
});

test('dispatch 이동: 먼 내 땅으로 한 번에, 경로가 legs에 담긴다', () => {
  const s = makeState(1); const ids = corridor(s, 3);
  const cap = s.run.tiles[ids[0]], far = s.run.tiles[ids[3]];
  cap.soldiers = 40;
  const r = dispatch(s, [cap.id], far.id, 0.5);
  assert.equal(r.type, 'move'); assert.equal(r.sent, 20);
  assert.equal(cap.soldiers, 20); assert.equal(far.soldiers, 30);
  assert.deepEqual(r.legs[0].path, ids);
});

test('dispatch 공격: 여러 출발지 병사를 집결지에 모아 한 번에, 보낸 양만큼만 싸운다', () => {
  const s = makeState(1); const ids = corridor(s, 2);
  const run = s.run; const [a, b, stage] = ids.map(id => run.tiles[id]);
  a.soldiers = 100; b.soldiers = 60; stage.soldiers = 5;
  const target = run.tiles[neighborIds(run, stage).find(id => run.tiles[id].owner === NEUTRAL && !neighborIds(run, b).includes(id))];
  target.terrain = 'plain'; target.soldiers = 100;
  const r = dispatch(s, [a.id, b.id], target.id, 1);
  assert.equal(r.type, 'attack');
  runBattles(s, 100);
  assert.equal(target.owner, PLAYER);
  assert.ok(Math.abs(target.soldiers - 60) < 1e-6, `${target.soldiers}`); // 160 - 100
  assert.ok(Math.abs(stage.soldiers - 5) < 1e-6); // 집결지 자체 병사는 안 쓴다
  assert.equal(a.soldiers, 0); assert.equal(b.soldiers, 0);
  assert.equal(r.legs.length, 2);
});

test('dispatch: 길이 없거나 1명 미만이면 invalid, 이어진 출발지만 참여', () => {
  const s = makeState(1); const ids = corridor(s, 2);
  const run = s.run; const cap = run.tiles[ids[0]];
  cap.soldiers = 40;
  // 수도와 이어지지 않은 먼 중립 타일
  const far = run.tiles.find(t => t.owner === NEUTRAL && neighborIds(run, t).every(id => run.tiles[id].owner === NEUTRAL));
  assert.equal(dispatch(s, [cap.id], far.id, 1).type, 'invalid');
  assert.equal(dispatch(s, [cap.id], ids[1], 0.01).type, 'invalid');
  // 끊긴 섬 타일은 제외되고 이어진 것만 간다
  const island = far; island.owner = PLAYER; island.soldiers = 50;
  const r = dispatch(s, [cap.id, island.id], ids[2], 0.5);
  assert.equal(r.type, 'move'); assert.equal(r.sent, 20); assert.equal(island.soldiers, 50);
});

test('previewTargets: 이어진 내 땅은 move, 국경 너머는 win/lose', () => {
  const s = makeState(1); const ids = corridor(s, 2);
  const run = s.run; const cap = run.tiles[ids[0]];
  cap.soldiers = 100;
  const marks = previewTargets(s, [cap.id], 1);
  assert.equal(marks[ids[1]], 'move'); assert.equal(marks[ids[2]], 'move'); assert.equal(marks[cap.id], undefined);
  const weak = run.tiles[neighborIds(run, run.tiles[ids[2]]).find(id => run.tiles[id].owner === NEUTRAL)];
  weak.terrain = 'plain'; weak.soldiers = 50;
  assert.equal(previewTargets(s, [cap.id], 1)[weak.id], 'win');
  assert.equal(previewTargets(s, [cap.id], 0.25)[weak.id], 'lose');
  assert.equal(predictAttack(s, cap, weak, 1).win, true);
  assert.equal(previewTargets(s, [cap.id], 0.001)[weak.id], undefined); // 1명 미만이면 표시 안 함
});

test('send 훅: 파병마다 결과가 전달되고 해제하면 멈춘다', () => {
  const s = makeState(1); const ids = corridor(s, 1);
  const got = []; setSendListener(r => got.push(r));
  send(s, ids[0], ids[1], 0.5);
  assert.equal(got.length, 1); assert.equal(got[0].type, 'move'); assert.equal(got[0].owner, PLAYER); assert.equal(got[0].fromId, ids[0]);
  setSendListener(null);
  send(s, ids[0], ids[1], 0.5);
  assert.equal(got.length, 1);
});
