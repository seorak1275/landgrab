import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState, serialize, deserialize, save, load, SAVE_KEY } from '../src/save.js';

function memStorage() { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), m }; }

test('새 상태는 유산 0, 반지름 3 판', () => {
  const s = newState(9);
  assert.equal(s.version, 1);
  assert.equal(s.legacy.points, 0);
  assert.equal(s.run.tiles.length, 37);
});

test('직렬화 왕복, lastSave 기록', () => {
  const s = newState(9);
  const text = serialize(s, 1234);
  assert.equal(s.lastSave, 1234);
  assert.deepEqual(deserialize(text), s);
});

test('깨진 텍스트·다른 버전은 null', () => {
  assert.equal(deserialize('{'), null);
  assert.equal(deserialize('{"version":99,"run":{},"legacy":{}}'), null);
  assert.equal(deserialize('42'), null);
});

test('storage에 저장·로드, 실패해도 예외 없음', () => {
  const st = memStorage(), s = newState(9);
  assert.equal(save(s, st, 5), true);
  assert.ok(st.m.has(SAVE_KEY));
  assert.deepEqual(load(st), s);
  const broken = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  assert.equal(save(s, broken), false);
  assert.equal(load(broken), null);
});
