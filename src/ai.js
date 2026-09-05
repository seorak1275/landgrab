import { TERRAIN, NEUTRAL, PLAYER } from './world.js';
import { neighborIds, cap, upgrade, upgradeCost, send, attackMul, MAX_LEVEL } from './sim.js';

export function aiPeriod(state) { return 8 * (1 + 0.08 * (state.legacy.upgrades.aiSlow || 0)); }
const priority = owner => (owner === NEUTRAL ? 0 : owner === PLAYER ? 1 : 2);

export function aiAct(state, f) {
  const run = state.run;
  const mine = () => run.tiles.filter(t => t.owner === f);
  if (mine().length === 0) return;

  // 1. 업그레이드: 가장 낮은 레벨(동률이면 골드계수 높은 쪽), 주기당 최대 3회
  for (let i = 0; i < 2; i++) {
    const cand = mine().filter(t => t.level < MAX_LEVEL)
      .sort((a, b) => a.level - b.level || TERRAIN[b.terrain].gold - TERRAIN[a.terrain].gold)[0];
    if (!cand || run.gold[f] < upgradeCost(cand)) break;
    upgrade(state, cand.id);
  }

  // 2. 공격: 유리한 후보를 모아 우선순위대로 최대 2회, 80% 파병
  const am = attackMul(state, f);
  const options = [];
  for (const t of mine()) {
    if (t.soldiers < 10) continue;
    for (const nid of neighborIds(run, t)) {
      const n = run.tiles[nid];
      if (n.owner === f) continue;
      const D = n.soldiers * (1 + TERRAIN[n.terrain].def);
      if (t.soldiers * 0.8 * am > D * 1.4) options.push({ from: t, to: n, D });
    }
  }
  options.sort((a, b) => priority(a.to.owner) - priority(b.to.owner) || a.D - b.D);
  let attacks = 0;
  for (const o of options) {
    if (attacks >= 2) break;
    if (o.to.owner === f) continue;
    // 앞선 공격으로 병사가 줄었을 수 있으니 현재 값으로 다시 확인
    const D = o.to.soldiers * (1 + TERRAIN[o.to.terrain].def);
    if (!(o.from.soldiers * 0.8 * am > D * 1.4)) continue;
    send(state, o.from.id, o.to.id, 0.8);
    attacks++;
  }

  // 3. 보강: 내부 타일(이웃이 전부 내 땅)이 한도 절반 이상이면 가장 약한 국경 이웃으로 절반 이동, 1회
  const isBorder = t => neighborIds(run, t).some(id => run.tiles[id].owner !== f);
  for (const t of mine()) {
    if (isBorder(t) || t.soldiers < cap(t) * 0.5) continue;
    const borders = neighborIds(run, t).map(id => run.tiles[id]).filter(n => isBorder(n)).sort((a, b) => a.soldiers - b.soldiers);
    if (borders.length) { send(state, t.id, borders[0].id, 0.5); break; }
  }
}

export function runAi(state, dt) {
  const run = state.run;
  for (let f = 1; f < run.factions; f++) {
    run.aiTimers[f] -= dt;
    while (run.aiTimers[f] <= 0) { aiAct(state, f); run.aiTimers[f] += aiPeriod(state); }
  }
}
