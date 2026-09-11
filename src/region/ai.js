// 사단전 AI: 배치(국경 방어/내부 사단) → 공격 → 집결 → 반란 → 내부 사단 국경으로
import { PLAYER, NEUTRAL, OFF, owned, adj, allocate, move, rebel, canRebel, effectiveDefense, attackMul, totalPool, bfsOwn, pathTo, party, truce, TECHS, research, hasTech, techCost, atPeace, proposePact, addRel, leaderOf, relOf } from './game.js';
import { perkOf } from '../perks.js';

export function aiPeriod(state) { return 8 * (1 + 0.08 * ((state.legacy.upgrades || {}).aiSlow || 0)) * (perkOf(state).aiSlow || 1); }
export const GATHER_EVERY = 4, REBEL_EVERY = 6, REBEL_MIN_POOL = 150;
export const DIPLO_EVERY = 20, TECH_ORDER = ['mobilize', 'drill', 'march', 'agit'], TECH_RESERVE = 150;
const pri = owner => (owner === NEUTRAL ? 0 : 1); // 중립 먼저

export function aiAct(state, f) {
  const run = state.run;
  const mine = owned(state, f); if (!mine.length) return;
  run.aiTurns = run.aiTurns || []; run.aiTurns[f] = (run.aiTurns[f] || 0) + 1;
  const am = attackMul(state, f);
  const isBorder = r => adj(run, r.id).some(n => run.regions[n].owner !== f);
  const othersBattle = r => r.battle && !party(r, f);
  const offLimits = r => (truce(state) && r.owner === PLAYER) || atPeace(state, f, r.owner); // 초반 휴전 · 정전 중인 상대

  // 0. 연구: 인력이 넉넉하면 순서대로 하나씩 (남는 인력이 있어야 배치도 하니 TECH_RESERVE는 남긴다)
  for (const key of TECH_ORDER) {
    if (hasTech(run, f, key)) continue;
    if (run.pool[f] >= techCost(state, f, key) + TECH_RESERVE) research(state, f, key);
    break;
  }

  // 0. 반란 (REBEL_EVERY 주기마다, 배치 전에): 풀 합이 넉넉하면 플레이어(없으면 가장 약한 세력) 지역 중 수비가 가장 약한 곳에
  if (run.aiTurns[f] % REBEL_EVERY === 0 && totalPool(state, f) >= REBEL_MIN_POOL) {
    const targets = run.regions.filter(r => r.owner !== f && r.owner !== NEUTRAL && r.owner !== OFF && !offLimits(r) && canRebel(state, f, r.id) && !r.battle)
      .sort((a, b) => (a.owner === PLAYER ? 0 : 1) - (b.owner === PLAYER ? 0 : 1) || (a.def + a.div) - (b.def + b.div));
    const t = targets[0];
    if (t) { const n = Math.min(300, Math.floor(totalPool(state, f) * 0.5)); if (n * 0.7 * am > effectiveDefense(state, t, f) * 1.2) rebel(state, f, t.id, n); }
  }

  // 1. 배치: 세력 풀의 60%만 쓴다(나머지는 반란 자금). 절반은 방어가 약한 국경 지역(최대 5곳)에 방어, 절반은 사단이 가장 큰 국경 지역(없으면 수도)에 사단
  const spend = Math.floor(run.pool[f] * 0.6);
  if (spend >= 10) {
    const border = mine.filter(isBorder).sort((a, b) => a.def - b.def);
    const defTargets = border.slice(0, 5);
    if (defTargets.length) { const each = Math.floor(spend * 0.5 / defTargets.length); for (const r of defTargets) allocate(state, r.id, 'def', each); }
    const divAt = (border.length ? border.reduce((a, b) => (b.div > a.div ? b : a)) : mine[0]);
    allocate(state, divAt.id, 'div', Math.floor(spend * 0.5));
  }

  // 2. 공격: 사단×공격 > 상대 수비×1.3 인 가장 약한 이웃(중립 먼저), 주기당 3회, 80%
  let attacks = 0;
  const options = [];
  for (const r of mine) {
    if (r.div < 20) continue;
    for (const n of adj(run, r.id)) {
      const t = run.regions[n]; if (t.owner === f || othersBattle(t) || offLimits(t)) continue;
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
    for (const r of mine) for (const n of adj(run, r.id)) {
      const t = run.regions[n]; if (t.owner === f || othersBattle(t) || offLimits(t)) continue;
      const comp = adj(run, t.id).filter(id => run.regions[id].owner === f); // 목표에 인접한 내 지역들
      const sum = comp.reduce((s, id) => s + run.regions[id].div * 0.6, 0);
      const D = effectiveDefense(state, t, f);
      if (sum * am > D * 1.5 && (!best || pri(t.owner) - pri(best.t.owner) < 0 || (pri(t.owner) === pri(best.t.owner) && D < best.D))) best = { t, D, comp };
    }
    if (best) for (const id of best.comp) if (run.regions[id].div >= 10) move(state, id, best.t.id, 0.6);
  }

  // 5. 내부 지역의 사단은 가장 가까운 국경 쪽으로 한 칸 (한 주기에 3개까지, 이동은 인접만 가능)
  let moved = 0;
  for (const r of mine) {
    if (moved >= 3 || isBorder(r) || r.div < 20) continue;
    const parent = bfsOwn(run, r.id);
    let best = null;
    for (const id of parent.keys()) if (isBorder(run.regions[id])) { const p = pathTo(parent, id); if (!best || p.length < best.length) best = p; }
    if (best && best.length > 1) { move(state, r.id, best[1], 1); moved++; }
  }
}

// 외교 (DIPLO_EVERY초마다): 다들 선두를 싫어하고, 선두가 아닌 세력끼리 손을 잡는다.
// 한 얼굴만 커지는 판을 막는 장치라 플레이어가 선두여도 똑같이 적용된다
export function diplomacy(state) {
  const run = state.run;
  const lead = leaderOf(state), leadN = owned(state, lead).length;
  for (let f = 1; f < run.factions; f++) {
    if (f === lead) continue;
    if (leadN > owned(state, f).length * 1.2) addRel(state, f, lead, -4); // 커질수록 미움을 산다
    for (let g = 1; g < run.factions; g++) {
      if (g === f || g === lead || atPeace(state, f, g)) continue;
      if (leadN > owned(state, f).length * 1.3) proposePact(state, f, g);
    }
    // 선두에게 얻어맞는 중이면 플레이어에게도 손을 내민다 (플레이어가 선두가 아니고 사이가 나쁘지 않을 때)
    if (lead !== PLAYER && f !== PLAYER && !atPeace(state, f, PLAYER) && relOf(state, f, PLAYER) >= 0 && leadN > owned(state, f).length * 1.5) proposePact(state, f, PLAYER);
  }
}

export function runAi(state, dt) {
  const run = state.run;
  run.diploTimer = (run.diploTimer || 0) - dt;
  while (run.diploTimer <= 0) { diplomacy(state); run.diploTimer += DIPLO_EVERY; }
  for (let f = 1; f < run.factions; f++) {
    run.aiTimers[f] -= dt;
    while (run.aiTimers[f] <= 0) { aiAct(state, f); run.aiTimers[f] += aiPeriod(state); }
  }
}
