// 사단전 모드 저장 (육각 모드와 별개 키). 이관은 여기 한 곳에서만 한다
import { LEGACY_ITEMS, refundRemoved } from '../prestige.js';
import { newRun } from './game.js';

export const SAVE_KEY = 'landgrab.region.v1';
export const VERSION = 2;

export function newState(seed = Date.now() >>> 0) {
  const upgrades = {}; for (const k of Object.keys(LEGACY_ITEMS)) upgrades[k] = 0;
  const legacy = { points: 0, prestigeCount: 0, upgrades, difficulty: 'hell', speed: 1 }; // 사단전은 기본이 최고 난이도 ("AI는 항상 엄청 강하게")
  return { version: VERSION, legacy, run: newRun(seed, legacy), lastSave: 0 };
}

export function migrate(obj) {
  if (!obj || typeof obj !== 'object' || !obj.run || !obj.legacy || obj.run.mode !== 'region') return null;
  if (obj.version === 1) { // v1: 오프라인 정산이 있던 판 → 방치를 없앴으니 '오프라인 한도' 유산 환불
    obj.version = 2; refundRemoved(obj.legacy);
  }
  return obj.version === VERSION ? obj : null;
}

export function save(state, storage = globalThis.localStorage, now = Date.now()) {
  try { state.lastSave = now; storage.setItem(SAVE_KEY, JSON.stringify(state)); return true; } catch { return false; }
}
export function load(storage = globalThis.localStorage) {
  try { const t = storage.getItem(SAVE_KEY); if (!t) return null; return migrate(JSON.parse(t)); } catch { return null; }
}
