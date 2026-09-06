// 사단전 AI: 배치(국경 방어/내부 사단) → 공격 → 집결 → 반란 → 내부 사단 국경으로
import { PLAYER, NEUTRAL, owned, neighbors, allocate, move, rebel, canRebel, effectiveDefense, attackMul, totalPool, bfsOwn, pathTo, party } from './game.js';
import { perkOf } from '../perks.js';

export function aiPeriod(state) { return 8 * (1 + 0.08 * ((state.legacy.upgrades || {}).aiSlow || 0)) * (perkOf(state).aiSlow || 1); }
export const GATHER_EVERY = 4, REBEL_EVERY = 6, REBEL_MIN_POOL = 150;
const pri = owner => (owner === NEUTRAL ? 0 : 1); // 중립 먼저

export function aiAct(state, f) {
  const run = state.run;
  const mine = owned(state, f); if (!mine.length) return;
  run.aiTurns = run.aiTurns || []; run.aiTurns[f] = (run.aiTurns[f] || 0) + 1;
  const am = attackMul(state, f);
  const isBorder = r => neighbors(r.id).some(n => run.regions[n].owner !== f);
  const othersBattle = r => r.battle && !party(r, f);

  // 0. 반란 (REBEL_EVERY 주기마다, 배치 전에): 풀 합이 넉넉하면 플레이어(없으면 가장 약한 세력) 지역 중 수비가 가장 약한 곳에
  if (run.aiTurns[f] % REBEL_EVERY === 0 && totalPool(state, f) >= REBEL_MIN_POOL) {
    const targets = run.regions.filter(r => r.owner !== f && r.owner !== NEUTRAL && canRebel(state, f, r.id) && !r.battle)
      .sort((a, b) => (a.owner === PLAYER ? 0 : 1) - (b.owner === PLAYER ? 0 : 1) || (a.def + a.div) - (b.def + b.div));
    const t = targets[0];
    if (t) { const n = Math.min(300, Math.floor(totalPool(state, f) * 0.5)); if (n * 0.7 * am > effectiveDefense(state, t, f) * 1.2) rebel(state, f, t.id, n); }
  }

  // 1. 배치: 풀의 60%만 쓴다(나머지는 반란 자금으로 모음). 국경은 방어 절반·사단 절반, 내부는 전부 사단
  for (const r of mine) {
    const spend = Math.floor(r.pool * 0.6); if (spend < 10) continue;
    if (isBorder(r)) { allocate(state, r.id, 'def', Math.floor(spend * 0.5)); allocate(state, r.id, 'div', Math.ceil(spend * 0.5)); }
    else allocate(state, r.id, 'div', spend);
  }

  // 2. 공격: 사단×공격 > 상대 수비×1.3 인 가장 약한 이웃(중립 먼저), 주기당 3회, 80%
  let attacks = 0;
  const options = [];
  for (const r of mine) {
    if (r.div < 20) continue;
    for (const n of neighbors(r.id)) {
      const t = run.regions[n]; if (t.owner === f || othersBattle(t)) continue;
      const D = effectiveDefense(state, t, f);
      if (r.div * 0.8 * am > D * 1.3) options.push({ r, t, D });
    }
  }
  options.sort((a, b) => pri(a.t.owner) - pri(b.t.owner) || a.D - b.D);
  const hit = new Set();
  for (const o of options) {
    if (attacks >= 3) break;
    if (hit.has(o.t.id) || o.t.owner === f) continue;
    if (!(o.r.div * 0.8 * am > effectiveDefense(state, o.t, f) * 1.3)) continue;
    if (move(state, o.r.id, o.t.id, 0.8).type !== 'invalid') { attacks++; hit.add(o.t.id); }
  }

  // 3. 집결 (GATHER_EVERY 주기마다, 공격이 없었을 때): 목표에 이어진 내 지역들 사단 합 > 수비×1.5 이면 모두 보낸다
  if (attacks === 0 && run.aiTurns[f] % GATHER_EVERY === 0) {
    let best = null;
    for (const r of mine) for (const n of neighbors(r.id)) {
      const t = run.regions[n]; if (t.owner === f || othersBattle(t)) continue;
      const comp = [...bfsOwn(run, r.id).keys()];
      const sum = comp.reduce((s, id) => s + run.regions[id].div * 0.6, 0);
      const D = effectiveDefense(state, t, f);
      if (sum * am > D * 1.5 && (!best || pri(t.owner) - pri(best.t.owner) < 0 || (pri(t.owner) === pri(best.t.owner) && D < best.D))) best = { t, D, comp };
    }
    if (best) for (const id of best.comp) if (run.regions[id].div >= 10) move(state, id, best.t.id, 0.6);
  }

  // 5. 내부 지역의 사단은 가장 가까운 국경 지역으로 (한 주기에 3개까지)
  let moved = 0;
  for (const r of mine) {
    if (moved >= 3 || isBorder(r) || r.div < 20) continue;
    const parent = bfsOwn(run, r.id);
    let best = null;
    for (const id of parent.keys()) if (isBorder(run.regions[id])) { const p = pathTo(parent, id); if (!best || p.length < best.length) best = p; }
    if (best && best.length > 1) { move(state, r.id, best[best.length - 1], 1); moved++; }
  }
}

export function runAi(state, dt) {
  const run = state.run;
  for (let f = 1; f < run.factions; f++) {
    run.aiTimers[f] -= dt;
    while (run.aiTimers[f] <= 0) { aiAct(state, f); run.aiTimers[f] += aiPeriod(state); }
  }
}
