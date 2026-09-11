import { generateRun } from './world.js';
import { refundRemoved } from './prestige.js';

export const SAVE_KEY = 'landgrab.save.v1';
export const VERSION = 4;
export const FEATURES = 5; // 새 기능 안내 창을 본 버전 (legacy.seenFeatures). 올리면 기존 플레이어에게 다시 뜬다

export function newState(seed = Date.now() >>> 0, mapKey = 'hex') {
  const upgrades = { gold: 0, soldiers: 0, attack: 0, startArmy: 0, aiSlow: 0 };
  return { version: VERSION, legacy: { points: 0, prestigeCount: 0, upgrades, mapPref: mapKey, seenFeatures: FEATURES }, run: generateRun(seed, 0, upgrades, mapKey), lastSave: 0 };
}
export function serialize(state, now = Date.now()) { state.lastSave = now; return JSON.stringify(state); }
export function deserialize(text) {
  let obj;
  try { obj = JSON.parse(text); } catch { return null; }
  if (!obj || typeof obj !== 'object' || !obj.run || !obj.legacy) return null;
  return migrate(obj);
}
export function migrate(obj) {
  if (obj.version === 1) { // v1: 육각 평원뿐, 지도 종류 없음
    obj.version = 2; obj.run.map = 'hex'; obj.legacy.mapPref = 'hex';
    for (const t of obj.run.tiles) if (t.region === undefined) t.region = -1;
  }
  if (obj.version === 2) { // v2: 전투가 한 공격 세력뿐(attacker/attackers), 행군 부대 없음
    obj.version = 3; obj.run.armies = [];
    for (const t of obj.run.tiles) if (t.battle && t.battle.parties === undefined) {
      const b = t.battle; t.battle = { parties: b.attackers > 0 ? [{ owner: b.attacker, soldiers: b.attackers, am: b.am || 1 }] : [], rate: b.rate || 0 };
      if (!t.battle.parties.length) delete t.battle;
    }
  }
  if (obj.version === 3) { // v3: 방치(오프라인 정산)를 없앴다 → '오프라인 한도' 유산 환불
    obj.version = 4; refundRemoved(obj.legacy);
  }
  return obj.version === VERSION ? obj : null;
}
export function save(state, storage = globalThis.localStorage, now = Date.now()) {
  try { storage.setItem(SAVE_KEY, serialize(state, now)); return true; } catch { return false; }
}
export function load(storage = globalThis.localStorage) {
  try { const t = storage.getItem(SAVE_KEY); return t ? deserialize(t) : null; } catch { return null; }
}
