import { generateRun, PLAYER } from './world.js';
import { difficultyOf } from './sim.js';

export const LEGACY_ITEMS = {
  gold:        { name: '풍요',         desc: '골드 생산 +10%/레벨',              max: 20, base: 5 },
  soldiers:    { name: '징집',         desc: '병사 생산 +10%/레벨',              max: 20, base: 5 },
  attack:      { name: '무기',         desc: '공격력 +5%/레벨',                  max: 20, base: 8 },
  wall:        { name: '성벽술',       desc: '내 땅 수비력 +5%/레벨',            max: 20, base: 8 },
  startArmy:   { name: '초기 병력',    desc: '시작 수도 병사 +20/레벨',           max: 10, base: 4 },
  startGold:   { name: '시작 골드',    desc: '시작 골드 +100/레벨',              max: 10, base: 4 },
  garrison:    { name: '개척',         desc: '중립 수비병 −4%/레벨',             max: 10, base: 6 },
  capBonus:    { name: '병참',         desc: '병사 한도 +10%/레벨',              max: 10, base: 6 },
  discount:    { name: '건축',         desc: '업그레이드·건물 비용 −3%/레벨',    max: 10, base: 8 },
  speed:       { name: '행군',         desc: '행군 속도 +10%/레벨',              max: 10, base: 5 },
  loot:        { name: '약탈',         desc: '점령할 때 골드 +30×타일레벨/레벨', max: 6,  base: 6 },
  regionBonus: { name: '통치',         desc: '지역 완전 점령 보너스 +10%p/레벨',  max: 5,  base: 10 },
  aiSlow:      { name: 'AI 둔화',      desc: 'AI 행동 주기 +8%/레벨',             max: 5,  base: 12 },
  pointsMul:   { name: '유산 축복',    desc: '환생 유산 포인트 +10%/레벨',        max: 10, base: 15 },
  // 상위 단계: 환생을 몇 번 해야 열린다 (tier = 필요한 환생 횟수). 사단전 전용 효과는 그 모드에서만 쓴다
  supply:      { name: '보급술',       desc: '고립 지역 생산 −폭 완화 +10%p/레벨 (사단전)', max: 5, base: 8,  tier: 2 },
  research:    { name: '연구소',       desc: '기술 연구 비용 −6%/레벨 (사단전)',            max: 5, base: 8,  tier: 2 },
  envoy:       { name: '사절',         desc: '정전 시간 +20초/레벨 (사단전)',               max: 5, base: 8,  tier: 3 },
  command:     { name: '통솔',         desc: '장군 효과 +2%p/레벨',                         max: 5, base: 12, tier: 4 },
};
// 없앤 유산 (2026-09-11 방치 제거로 '오프라인 한도'가 의미를 잃었다): 저장을 이관할 때 쓴 포인트를 돌려준다
export const REMOVED_ITEMS = {
  offline: { name: '오프라인 한도', base: 10 },
};
export function itemCost(key, level) { const it = LEGACY_ITEMS[key] || REMOVED_ITEMS[key]; return Math.round(it.base * Math.pow(1.5, level)); }
export function refundRemoved(legacy) {
  const u = legacy.upgrades || {};
  let back = 0;
  for (const key of Object.keys(REMOVED_ITEMS)) {
    const lv = u[key] || 0;
    for (let i = 0; i < lv; i++) back += itemCost(key, i);
    delete u[key];
  }
  if (back) legacy.points = (legacy.points || 0) + back;
  return back;
}
export const itemLocked = (item, legacy) => (item.tier || 0) > (legacy.prestigeCount || 0);
export function buy(state, key) {
  const item = LEGACY_ITEMS[key]; if (!item) return false;
  if (itemLocked(item, state.legacy)) return false; // 환생 횟수가 모자라면 아직 못 산다
  const u = state.legacy.upgrades; const lv = u[key] || 0;
  if (lv >= item.max) return false;
  const c = itemCost(key, lv);
  if (state.legacy.points < c) return false;
  state.legacy.points -= c; u[key] = lv + 1;
  return true;
}
export function pointsFor(state, outcome) {
  const run = state.run; const k = difficultyOf(state).points * (1 + 0.1 * (state.legacy.upgrades.pointsMul || 0));
  if (outcome === 'conquered') {
    const levels = run.tiles.filter(t => t.owner === PLAYER).reduce((s, t) => s + t.level, 0);
    return Math.floor((10 + Math.floor(run.tiles.length / 4) + Math.floor(levels / 10)) * k);
  }
  return Math.max(1, Math.floor(run.maxTilesOwned / 4 * k));
}
export function rebirth(state, outcome, seed, mapKey = state.legacy.mapPref || state.run.map || 'hex', perk = null) {
  const pts = pointsFor(state, outcome);
  state.legacy.points += pts;
  state.legacy.prestigeCount += 1;
  state.legacy.mapPref = mapKey;
  state.run = generateRun(seed, state.legacy.prestigeCount, state.legacy.upgrades, mapKey, perk);
  return pts;
}
// 이번 판을 버리고 다른 지도로 새로 시작 (유산은 그대로, 포인트 없음)
export function restartOn(state, mapKey, seed) {
  state.legacy.mapPref = mapKey;
  state.run = generateRun(seed, state.legacy.prestigeCount, state.legacy.upgrades, mapKey);
}
