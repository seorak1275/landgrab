import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState, serialize, deserialize, save, load, SAVE_KEY, VERSION } from '../src/save.js';

function memStorage() { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), m }; }

test('새 상태는 유산 0, 반지름 3 판', () => {
  const s = newState(9);
  assert.equal(s.version, VERSION);
  assert.equal(s.legacy.points, 0);
  assert.equal(s.run.tiles.length, 37);
});

test('직렬화 왕복, lastSave 기록', () => {
  const s = newState(9);
  const text = serialize(s, 1234);
  assert.equal(s.lastSave, 1234);
  assert.deepEqual(deserialize(text), s);
});

test('v1 저장은 육각 평원으로 이관', () => {
  const s = newState(9); s.version = 1; delete s.run.map; delete s.legacy.mapPref;
  const m = deserialize(JSON.stringify(s));
  assert.equal(m.version, VERSION); assert.equal(m.run.map, 'hex'); assert.equal(m.legacy.mapPref, 'hex'); assert.deepEqual(m.run.armies, []);
});

test('v2 저장의 전투(attacker/attackers)는 parties 형식으로', () => {
  const s = newState(9); s.version = 2; delete s.run.armies;
  const t = s.run.tiles.find(t => t.owner === -1); t.battle = { attacker: 0, attackers: 12, am: 1.1, rate: 5 };
  const m = deserialize(JSON.stringify(s));
  assert.equal(m.version, VERSION);
  assert.deepEqual(m.run.tiles[t.id].battle, { parties: [{ owner: 0, soldiers: 12, am: 1.1 }], rate: 5 });
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
