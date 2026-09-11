// 사단전 모드 순수 시뮬 (docs/superpowers/specs/2026-09-06-region-division-mode.md)
// 지역 = 칸. 모든 내 지역의 생산력이 세력 하나의 인력 풀(run.pool[f], 한도 500)에 모이고 → 어느 지역이든 방어인력 / 사단으로 배치. 사단은 인접 그래프를 행군. 남의 지역엔 반란.
import MAP from '../maps/sgg.js';
import { mulberry32 } from '../rng.js';
import { PERKS, perkOf } from '../perks.js';
import { DIFFICULTIES, DEFAULT_DIFFICULTY } from '../sim.js';

export { MAP };
export const PLAYER = 0, NEUTRAL = -1;
export const POOL_CAP = 500;
export const REGION_SPEED = 0.5; // 지역/초 (한 지역 건너는 데 2초)
export const REBEL_DELAY = 10, REBEL_RATIO = 0.7;
export const AMOUNTS = [10, 100, 500, 'max'];
export const TRAIT_DEF = { mountain: 1.5, city: 1.2, coast: 1.0, plain: 0.9 };
export const TRAIT_NAME = { mountain: '⛰산악', city: '🏙도시', coast: '🌊해안', plain: '🌾평야' };
export const AI_RAMP = 0.1, AI_RAMP_MAX = 1.0;
export const HOME = '속초시'; // 설악산
export const TRUCE = 120; // 시작 뒤 이 시간(초) 동안 AI는 플레이어 지역을 치거나 반란하지 않는다 (첫 배치를 할 틈. 방치를 없앤 뒤 6분 → 2분)
export const truce = state => (state.run.elapsed || 0) < TRUCE;

const lv = (state, k) => (state.legacy && state.legacy.upgrades && state.legacy.upgrades[k]) || 0;
export function difficultyOf(state) { return DIFFICULTIES[state.legacy.difficulty] || DIFFICULTIES[DEFAULT_DIFFICULTY]; }
export function aiMul(state) { return difficultyOf(state).mul + 0.1 * state.legacy.prestigeCount + Math.min(AI_RAMP_MAX, AI_RAMP * (state.run.elapsed || 0) / 600); }
export function prodMul(state, f) { return f === PLAYER ? (1 + 0.1 * lv(state, 'gold') + 0.1 * lv(state, 'soldiers')) * (perkOf(state).gold || 1) * (perkOf(state).soldiers || 1) : aiMul(state); }
export function attackMul(state, f) { return f === PLAYER ? (1 + 0.05 * lv(state, 'attack')) * (perkOf(state).attack || 1) : 1; }
export function defMul(state, r) { const base = TRAIT_DEF[MAP.regions[r.id].tr] || 1; return r.owner === PLAYER ? base * (1 + 0.05 * lv(state, 'wall')) * (perkOf(state).def || 1) : base; }
export function poolCap(state, f) { return POOL_CAP * (f === PLAYER ? 1 + 0.1 * lv(state, 'capBonus') : 1); }
export function speedOf(state, f) { return f === PLAYER ? REGION_SPEED * (1 + 0.1 * lv(state, 'speed')) * (perkOf(state).speed || 1) : REGION_SPEED; }
export function prodOf(state, r) { return MAP.regions[r.id].prod * prodMul(state, r.owner); }
export function aiCountFor(prestige) { return Math.min(4 + Math.floor(prestige / 3), 6); }
export const info = id => MAP.regions[id];
export const neighbors = id => MAP.regions[id].adj;

// 그래프 거리 (BFS, 전 지역)
export function bfsDist(from) {
  const d = new Array(MAP.regions.length).fill(-1); d[from] = 0; const q = [from];
  for (let i = 0; i < q.length; i++) for (const n of neighbors(q[i])) if (d[n] < 0) { d[n] = d[q[i]] + 1; q.push(n); }
  return d;
}
export function newRun(seed, legacy = {}, perk = null) {
  const rand = mulberry32(seed);
  const pk = PERKS[perk] || {};
  const up = legacy.upgrades || {};
  const factions = 1 + Math.max(1, aiCountFor(legacy.prestigeCount || 0) + (pk.aiDelta || 0));
  const home = MAP.regions.findIndex(r => r.n === HOME);
  const capitals = [home];
  while (capitals.length < factions) { // 기존 수도들에서 가장 먼 지역
    const ds = capitals.map(c => bfsDist(c));
    let best = null;
    for (let i = 0; i < MAP.regions.length; i++) { if (capitals.includes(i)) continue; const d = Math.min(...ds.map(x => x[i])); if (!best || d > best.d) best = { i, d }; }
    capitals.push(best.i);
  }
  const garrisonMul = (1 - 0.04 * (up.garrison || 0)) * (pk.garrison || 1);
  const regions = MAP.regions.map((m, id) => {
    const f = capitals.indexOf(id);
    if (f >= 0) return { id, owner: f, def: f === PLAYER ? 60 : 30, div: (f === PLAYER ? 80 + 20 * (up.startArmy || 0) : 50) * (f === PLAYER ? (pk.startArmy || 1) : 1) };
    return { id, owner: NEUTRAL, def: Math.round((15 + m.prod * 20) * (0.8 + rand() * 0.5) * garrisonMul), div: 0 }; // 구 55·시 45·군 35 안팎
  });
  const pool = Array(factions).fill(100); pool[PLAYER] = 300 + 100 * (up.startGold || 0) + (pk.startGold || 0);
  return { seed, mode: 'region', factions, regions, pool, armies: [], rebels: [], aiTimers: Array(factions).fill(0), aiTurns: [], maxRegions: 1, sendRatio: 0.5, elapsed: 0, ...(perk && PERKS[perk] ? { perk } : {}) };
}

export function owned(state, f) { return state.run.regions.filter(r => r.owner === f); }
export function totalPool(state, f) { return f === NEUTRAL ? 0 : (state.run.pool[f] || 0); }
export function totalProd(state, f) { return owned(state, f).reduce((s, r) => s + (r.battle ? 0 : prodOf(state, r)), 0); }
export function status(state) {
  const n = owned(state, PLAYER).length;
  if (n === 0) {
    const alive = state.run.armies.some(a => a.owner === PLAYER) || state.run.rebels.some(r => r.owner === PLAYER) || state.run.regions.some(r => r.battle && r.battle.parties.some(p => p.owner === PLAYER));
    return alive ? 'playing' : 'wiped';
  }
  return n === state.run.regions.length ? 'conquered' : 'playing';
}

let listener = null;
export function setListener(fn) { listener = fn; }
const emit = e => { if (listener) listener(e); };

// ---- 배치 ----
export function amountOf(n, avail) { const a = n === 'max' ? avail : Math.min(n, avail); return Math.floor(a); }
export function allocate(state, id, kind, n) {
  const r = state.run.regions[id];
  if (!r || r.owner === NEUTRAL) return 0;
  const a = amountOf(n, state.run.pool[r.owner]); if (a < 1) return 0;
  state.run.pool[r.owner] -= a; if (kind === 'def') r.def += a; else r.div += a;
  return a;
}

// ---- 전투 (규칙은 sim.js와 같은 등속 소모, 편 = {owner, size, am}) ----
export function battleRate(total) { return 3 + 0.5 * Math.sqrt(total); }
function defense(state, r) { return (r.def + r.div) * defMul(state, r); }
export function effectiveDefense(state, r, owner) {
  let D = defense(state, r);
  if (r.battle) for (const p of r.battle.parties) if (p.owner !== owner) D = Math.max(D, p.size * p.am);
  return D;
}
export function party(r, owner) { return r.battle ? r.battle.parties.find(p => p.owner === owner) : undefined; }
function refreshRate(state, r) { r.battle.rate = Math.max(r.battle.rate || 0, battleRate(defense(state, r) + r.battle.parties.reduce((s, p) => s + p.size * p.am, 0))); }
function join(state, r, owner, size, am) {
  if (!r.battle) r.battle = { parties: [], rate: 0 };
  let p = party(r, owner);
  if (!p) { p = { owner, size: 0, am }; r.battle.parties.push(p); } else p.am = Math.max(p.am, am);
  p.size += size; refreshRate(state, r);
}
function battleTick(state, r, dt) {
  const b = r.battle, dm = defMul(state, r);
  let D = (r.def + r.div) * dm, alive = D > 1e-9;
  const S = b.parties.map(p => p.size * p.am); const dead = [];
  let rem = dt;
  while (rem > 0) {
    const live = S.filter(v => v > 1e-9);
    if (!(alive ? live.length >= 1 : live.length >= 2)) break;
    const loss = Math.min(b.rate * rem, ...(alive ? [D] : []), ...live);
    if (!(loss > 0)) break;
    rem -= loss / b.rate;
    if (alive) { D -= loss; if (D <= 1e-9) { D = 0; alive = false; } }
    for (let i = 0; i < S.length; i++) if (S[i] > 1e-9) { S[i] -= loss; if (S[i] <= 1e-9) { S[i] = 0; dead.push(b.parties[i]); } }
  }
  // 수비 손실은 방어인력·사단에 비례 배분
  const tot = r.def + r.div, left = D / dm;
  if (tot > 0) { r.def = left * r.def / tot; r.div = left * r.div / tot; }
  b.parties.forEach((p, i) => { p.size = S[i] / p.am; });
  b.parties = b.parties.filter(p => p.size > 1e-9);
  if (alive ? b.parties.length : b.parties.length >= 2) return;
  const prev = r.owner; delete r.battle;
  for (const p of dead) emit({ type: 'repel', id: r.id, owner: p.owner, prevOwner: prev });
  if (b.parties.length === 1) {
    const w = b.parties[0];
    const loot = 10 * (w.owner === PLAYER ? 1 + 0.5 * lv(state, 'loot') : 1); // 점령 보상: 풀에 +10 (유산 '약탈' +5/레벨)
    r.owner = w.owner; r.def = 0; r.div = w.size;
    state.run.pool[w.owner] = Math.min(poolCap(state, w.owner), state.run.pool[w.owner] + loot);
    for (const rb of state.run.rebels) if (rb.target === r.id && rb.owner === w.owner) rb.dead = true; // 내 반란은 취소
    state.run.rebels = state.run.rebels.filter(x => !x.dead);
    updateMax(state);
    emit({ type: 'capture', id: r.id, owner: w.owner, prevOwner: prev, remaining: w.size });
  } else if (!alive) { r.def = 0; r.div = 0; } // 다 같이 죽음 (수비가 이겼으면 비례 배분된 값 그대로)
}
export function runBattles(state, dt) { for (const r of state.run.regions) if (r.battle) battleTick(state, r, dt); }
export function resolveBattle(state, r) { while (r.battle) battleTick(state, r, 1e9); }
function updateMax(state) { const n = owned(state, PLAYER).length; if (n > state.run.maxRegions) state.run.maxRegions = n; }

// ---- 행군 ----
function depart(state, owner, size, path) { const a = { owner, size, am: attackMul(state, owner), path, pos: 0, speed: speedOf(state, owner) }; state.run.armies.push(a); return a; }
function arrive(state, a) {
  const run = state.run, r = run.regions[a.path[a.path.length - 1]];
  run.armies.splice(run.armies.indexOf(a), 1);
  if (r.owner === a.owner) { r.div += a.size; if (r.battle) refreshRate(state, r); emit({ type: 'arrive', id: r.id, owner: a.owner, size: a.size }); }
  else { join(state, r, a.owner, a.size, a.am); emit({ type: 'engage', id: r.id, owner: a.owner, size: a.size }); }
}
export function runArmies(state, dt) {
  const run = state.run;
  for (const a of [...run.armies]) {
    let move = a.speed * dt;
    while (run.armies.includes(a) && move > 0) {
      const k = Math.floor(a.pos + 1e-9), last = a.path.length - 1;
      if (k >= last) { arrive(state, a); break; }
      const step = Math.min(move, k + 1 - a.pos); a.pos += step; move -= step;
      if (a.pos >= k + 1 - 1e-9) {
        a.pos = k + 1;
        if (k + 1 === last) { arrive(state, a); break; }
        if (run.regions[a.path[k + 1]].owner !== a.owner) { a.path = a.path.slice(0, k + 2); arrive(state, a); break; } // 길이 끊겼다
      }
    }
  }
}
// 내 지역만 밟는 BFS 부모표
export function bfsOwn(run, from) {
  const owner = run.regions[from].owner, parent = new Map([[from, -1]]), q = [from];
  for (let i = 0; i < q.length; i++) for (const n of neighbors(q[i])) if (!parent.has(n) && run.regions[n].owner === owner) { parent.set(n, q[i]); q.push(n); }
  return parent;
}
export function pathTo(parent, id) { const p = []; for (let c = id; c !== -1 && c !== undefined; c = parent.get(c)) p.push(c); return p.reverse(); }
// 사단 이동/공격: from의 사단에서 ratio만큼 **인접한** 지역으로만. 내 지역이면 합류, 남의 지역이면 전투
export function move(state, from, to, ratio) {
  const run = state.run, f = run.regions[from], t = run.regions[to];
  if (!f || !t || f.owner === NEUTRAL || from === to) return { type: 'invalid' };
  if (!neighbors(from).includes(to)) return { type: 'invalid' };
  const size = Math.floor(f.div * ratio); if (size < 1) return { type: 'invalid' };
  const path = [from, to];
  f.div -= size;
  const a = depart(state, f.owner, size, path);
  const res = { type: t.owner === f.owner ? 'move' : 'attack', size, from, to, owner: f.owner, eta: (path.length - 1) / a.speed };
  emit(res); return res;
}
export function predict(state, from, to, ratio) {
  const run = state.run, f = run.regions[from], t = run.regions[to];
  const size = Math.floor(f.div * ratio), am = attackMul(state, f.owner), mine = party(t, f.owner);
  const A = (size + (mine ? mine.size : 0)) * am, D = effectiveDefense(state, t, f.owner);
  return { win: size >= 1 && A > D, A, D };
}

// ---- 반란: 남의 지역에 내 풀에서 n명을 보내 REBEL_DELAY초 뒤 REBEL_RATIO만큼 봉기 ----
export function canRebel(state, f, id) { const r = state.run.regions[id]; return r && r.owner !== f && r.owner !== NEUTRAL && !state.run.rebels.some(x => x.owner === f && x.target === id); }
export function rebel(state, f, id, n) {
  if (!canRebel(state, f, id)) return 0;
  const a = amountOf(n, state.run.pool[f]); if (a < 10) return 0;
  state.run.pool[f] -= a;
  state.run.rebels.push({ owner: f, target: id, size: Math.round(a * REBEL_RATIO), eta: REBEL_DELAY, am: attackMul(state, f) });
  emit({ type: 'rebel', id, owner: f, size: a });
  return a;
}
export function runRebels(state, dt) {
  const run = state.run;
  for (const rb of [...run.rebels]) {
    rb.eta -= dt; if (rb.eta > 0) continue;
    run.rebels.splice(run.rebels.indexOf(rb), 1);
    const r = run.regions[rb.target];
    if (r.owner === rb.owner) { r.div += rb.size; continue; }
    join(state, r, rb.owner, rb.size, rb.am); emit({ type: 'uprising', id: r.id, owner: rb.owner, size: rb.size });
  }
}

export function tick(state, dt) {
  const run = state.run;
  for (let f = 0; f < run.factions; f++) { // 세력 풀 하나에 모든 지역 생산이 모인다 (전투 중인 지역은 제외), 한도까지만
    const c = poolCap(state, f);
    if (run.pool[f] < c) run.pool[f] = Math.min(c, run.pool[f] + totalProd(state, f) * dt);
  }
  runRebels(state, dt); runArmies(state, dt); runBattles(state, dt);
  run.elapsed += dt; updateMax(state);
}
