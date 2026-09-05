import { generateRun } from './world.js';

export const SAVE_KEY = 'landgrab.save.v1';
export const VERSION = 1;

export function newState(seed = Date.now() >>> 0) {
  const upgrades = { gold: 0, soldiers: 0, attack: 0, startArmy: 0, offline: 0, aiSlow: 0 };
  return { version: VERSION, legacy: { points: 0, prestigeCount: 0, upgrades }, run: generateRun(seed, 0, upgrades), lastSave: 0 };
}
export function serialize(state, now = Date.now()) { state.lastSave = now; return JSON.stringify(state); }
export function deserialize(text) {
  let obj;
  try { obj = JSON.parse(text); } catch { return null; }
  if (!obj || typeof obj !== 'object' || !obj.run || !obj.legacy) return null;
  return migrate(obj);
}
export function migrate(obj) { return obj.version === VERSION ? obj : null; }
export function save(state, storage = globalThis.localStorage, now = Date.now()) {
  try { storage.setItem(SAVE_KEY, serialize(state, now)); return true; } catch { return false; }
}
export function load(storage = globalThis.localStorage) {
  try { const t = storage.getItem(SAVE_KEY); return t ? deserialize(t) : null; } catch { return null; }
}
