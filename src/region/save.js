// 사단전 모드 저장 (육각 모드와 별개 키). 이관은 여기 한 곳에서만 한다
import { LEGACY_ITEMS, refundRemoved } from '../prestige.js';
import { newRun, DEFAULT_BOARD, BOARDS, boardIds, refreshSupply, MAP, PLAYER } from './game.js';

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
    backfill(obj.run); // 보급·기술·외교가 생기기 전 판이라 자리를 채워 준다
  }
  return obj.version === VERSION ? obj : null;
}

// 예전 판에 없던 자리들(판 종류·기술·관계·정전·수도)을 채운다. 없으면 관계가 영영 0이고 보급 기준이 흐려진다
function backfill(run) {
  if (!run.board || !BOARDS[run.board]) run.board = DEFAULT_BOARD;
  const n = run.factions || 1;
  if (!Array.isArray(run.tech) || run.tech.length !== n) run.tech = Array.from({ length: n }, (_, f) => (run.tech && run.tech[f]) || {});
  if (!Array.isArray(run.rel) || run.rel.length !== n) run.rel = Array.from({ length: n }, () => Array(n).fill(0));
  if (!run.pacts || typeof run.pacts !== 'object') run.pacts = {};
  if (!Array.isArray(run.capitals) || run.capitals.length !== n) {
    // 세력마다 지금 가진 곳 중 생산력이 가장 큰 지역을 수도로 본다 (없으면 시작 수도 자리)
    run.capitals = Array.from({ length: n }, f => {
      let best = null;
      for (const r of run.regions) if (r.owner === f) { const p = MAP.regions[r.id].prod; if (!best || p > best.p) best = { id: r.id, p }; }
      return best ? best.id : boardIds(run.board)[0];
    });
  }
  refreshSupply({ run, legacy: {} });
  return run;
}

export function save(state, storage = globalThis.localStorage, now = Date.now()) {
  try { state.lastSave = now; storage.setItem(SAVE_KEY, JSON.stringify(state)); return true; } catch { return false; }
}
export function load(storage = globalThis.localStorage) {
  try { const t = storage.getItem(SAVE_KEY); if (!t) return null; return migrate(JSON.parse(t)); } catch { return null; }
}
