import { generateRun, PLAYER, TERRAIN } from '../src/world.js';
import { send, upgrade, neighborIds, upgradeCost, attackMul, previewTargets, dispatch, MAX_LEVEL, runArmies, resolveBattle } from '../src/sim.js';
export function makeState(seed = 1, prestige = 0, upgrades = {}, mapKey = 'hex') {
  const u = { gold: 0, soldiers: 0, attack: 0, startArmy: 0, aiSlow: 0, ...upgrades };
  return { version: 4, legacy: { points: 0, prestigeCount: prestige, upgrades: u, mapPref: mapKey, difficulty: 'normal' }, run: generateRun(seed, prestige, u, mapKey), lastSave: 0 };
}
export function capitalOf(state, f) { return state.run.tiles.find(t => t.owner === f && t.terrain === 'citadel'); }
// 행군 중인 부대를 전부 도착시키고 전투를 끝까지 돌린다 (생산 없이 — 수식 검증용)
export function settle(s) {
  for (let i = 0; i < 1000 && ((s.run.armies && s.run.armies.length) || s.run.tiles.some(t => t.battle)); i++) {
    runArmies(s, 1);
    for (const t of s.run.tiles) if (t.battle) resolveBattle(s, t);
  }
}

// 탐욕 플레이어(밸런스 검증용): 5초마다 ① 가장 낮은 레벨 타일 업그레이드 ② 이길 수 있는 가장 약한 이웃 공격(70%)
// ③ 한 타일로는 못 이기면 내 땅 전체에서 50%씩 모아 집결 공격(사람이 [내 땅 전체 선택]으로 하는 것) ④ 국경 보강
// 집결 공격은 60초에 한 번만 (매 5초 하면 어느 지도든 11분 만에 정복돼 밸런스 기준으로 못 씀)
const lastGather = new WeakMap();
export function greedy(s) {
  const mine = s.run.tiles.filter(t => t.owner === PLAYER);
  const low = mine.filter(t => t.level < MAX_LEVEL).sort((a, b) => a.level - b.level)[0];
  if (low && s.run.gold[PLAYER] >= upgradeCost(low)) upgrade(s, low.id);
  const am = attackMul(s, PLAYER);
  let best = null;
  for (const t of mine) for (const id of neighborIds(s.run, t)) {
    const n = s.run.tiles[id]; if (n.owner === PLAYER || (n.battle && n.battle.attacker !== PLAYER)) continue;
    const D = n.soldiers * (1 + TERRAIN[n.terrain].def);
    if (t.soldiers * 0.7 * am > D * 1.05 && (!best || D < best.D)) best = { from: t, to: n, D };
  }
  if (best) send(s, best.from.id, best.to.id, 0.7);
  else if (mine.length > 1 && s.run.elapsed - (lastGather.get(s.run) ?? -Infinity) >= 60) {
    lastGather.set(s.run, s.run.elapsed);
    const ids = mine.map(t => t.id), marks = previewTargets(s, ids, 0.5);
    const targets = Object.entries(marks).filter(([, m]) => m === 'win').map(([id]) => s.run.tiles[id]).filter(t => !(t.battle && t.battle.attacker !== PLAYER))
      .sort((a, b) => a.soldiers * (1 + TERRAIN[a.terrain].def) - b.soldiers * (1 + TERRAIN[b.terrain].def));
    if (targets.length) dispatch(s, ids, targets[0].id, 0.5);
  }
  const isBorder = t => neighborIds(s.run, t).some(id => s.run.tiles[id].owner !== PLAYER);
  for (const t of mine) {
    if (isBorder(t) || t.soldiers < 10) continue;
    const b = neighborIds(s.run, t).map(id => s.run.tiles[id]).filter(n => n.owner === PLAYER && isBorder(n)).sort((a, b) => a.soldiers - b.soldiers)[0];
    if (b) { send(s, t.id, b.id, 0.5); break; }
  }
}
