import { neighbors, key } from './hex.js';
import { TERRAIN, PLAYER, NEUTRAL } from './world.js';
import { perkOf } from './perks.js';

export const MAX_LEVEL = 10;
// 난이도 = AI 생산 배율(골드·병사) 기본값. 유산 포인트 배수로 보상. (0.6은 "너무 쉽다"는 피드백, 1.0은 탐욕 스크립트도 가끔 전멸, 1.2는 항상 전멸)
export const DIFFICULTIES = {
  easy:   { name: '쉬움',   mul: 0.6, points: 1 },
  normal: { name: '보통',   mul: 0.8, points: 1.25 },
  hard:   { name: '어려움', mul: 1.0, points: 1.5 },
  hell:   { name: '지옥',   mul: 1.2, points: 2 },
};
export const DEFAULT_DIFFICULTY = 'normal';
export function difficultyOf(state) { return DIFFICULTIES[state.legacy.difficulty] || DIFFICULTIES[DEFAULT_DIFFICULTY]; }
export const AI_BASE_MUL = DIFFICULTIES[DEFAULT_DIFFICULTY].mul;
const indexCache = new WeakMap();
function index(run) {
  let m = indexCache.get(run.tiles);
  if (!m) { m = new Map(run.tiles.map(t => [key(t.q, t.r), t.id])); indexCache.set(run.tiles, m); }
  return m;
}
export function neighborIds(run, tile) {
  const m = index(run);
  return neighbors(tile.q, tile.r).map(([q, r]) => m.get(key(q, r))).filter(id => id !== undefined);
}
export function isAdjacent(run, a, b) { return neighborIds(run, a).includes(b.id); }

// AI 배율 = 난이도 기본값 + 환생 0.1/회 + 시간 경과(10분마다 AI_RAMP, 최대 AI_RAMP_MAX): 초반은 숨 돌릴 틈, 갈수록 압박
export const AI_RAMP = 0.1, AI_RAMP_MAX = 1.0;
export function aiMul(state) {
  return difficultyOf(state).mul + 0.1 * state.legacy.prestigeCount + Math.min(AI_RAMP_MAX, AI_RAMP * (state.run.elapsed || 0) / 600);
}
export const lv = (state, k) => (state.legacy && state.legacy.upgrades && state.legacy.upgrades[k]) || 0; // 유산 레벨
export function prodMul(state, f) {
  return f === PLAYER ? (1 + 0.1 * lv(state, 'gold')) * (perkOf(state).gold || 1) : aiMul(state);
}
export function soldierMul(state, f) {
  return f === PLAYER ? (1 + 0.1 * lv(state, 'soldiers')) * (perkOf(state).soldiers || 1) : aiMul(state);
}
export function attackMul(state, f) { return f === PLAYER ? (1 + 0.05 * lv(state, 'attack')) * (perkOf(state).attack || 1) : 1; }
export function costMul(state, f) { return f === PLAYER ? 1 - 0.03 * lv(state, 'discount') : 1; }

// ---- 타일 특화 건물 (플레이어만, 타일당 하나, 골드로 짓고 바꾸면 다시 냄, 철거는 무료) ----
export const BUILDINGS = {
  farm:     { name: '농장', icon: '🌾', desc: '골드 +60%',                                   gold: 0.6 },
  barracks: { name: '병영', icon: '⚔️', desc: '병사 생산 +60% · 여기서 출발한 부대 공격 +15%',  soldiers: 0.6, attack: 0.15 },
  wall:     { name: '성벽', icon: '🛡️', desc: '방어 +50% · 병사 한도 +25%',                   def: 0.5, cap: 0.25 },
  tower:    { name: '망루', icon: '🏹', desc: `${8}초마다 이길 수 있는 옆 땅을 60%로 자동 공격 · 방어 +20%`, def: 0.2, auto: 8 },
};
export const BUILD_COST_BASE = 150;
export const building = tile => (tile.build && BUILDINGS[tile.build]) || {};
export function buildCost(state, tile) { return BUILD_COST_BASE * TERRAIN[tile.terrain].gold * costMul(state, tile.owner); }
export function setBuilding(state, tileId, key) {
  const t = state.run.tiles[tileId];
  if (!t || t.owner === NEUTRAL) return false;
  if (!key) { if (!t.build) return false; delete t.build; delete t.auto; return true; }
  if (!BUILDINGS[key] || t.build === key) return false;
  const cost = buildCost(state, t);
  if (state.run.gold[t.owner] < cost) return false;
  state.run.gold[t.owner] -= cost; t.build = key; t.auto = 0;
  return true;
}
export function cap(tile, state) {
  return 20 * tile.level * TERRAIN[tile.terrain].cap * (1 + (building(tile).cap || 0)) * (state && tile.owner === PLAYER ? 1 + 0.1 * lv(state, 'capBonus') : 1);
}
// 수비 배율 = 1 + 지형 + 건물, 플레이어는 유산 '성벽술'·축복 곱
export function defMul(state, tile) {
  const base = 1 + TERRAIN[tile.terrain].def + (building(tile).def || 0);
  return tile.owner === PLAYER && state ? base * (1 + 0.05 * lv(state, 'wall')) * (perkOf(state).def || 1) : base;
}
// 지역(구·시도) 완전 점령: 한 지역의 타일을 전부 가진 세력은 그 지역 타일의 골드·병사 생산 +50%
// 타일이 1개뿐인 지역은 제외 (37타일 대한민국에서 대전·광주 같은 1칸 지역을 먹자마자 +50%가 붙어 AI끼리 30분 독식이 났음)
export const REGION_BONUS = 0.5, REGION_MIN_TILES = 2;
export function regionBonus(state, f) { return f === PLAYER ? (REGION_BONUS + 0.1 * lv(state, 'regionBonus')) * (perkOf(state).unity || 1) : REGION_BONUS; }
// 지역 번호 → 그 지역 타일을 전부 가진 세력. 주인이 섞여 있거나 타일이 1개면 null. 지역이 없는 지도면 null
export function regionHolders(run) {
  if (!run.regions) return null;
  const h = [], n = [];
  for (const t of run.tiles) {
    if (!(t.region >= 0)) continue;
    n[t.region] = (n[t.region] || 0) + 1;
    if (h[t.region] === undefined) h[t.region] = t.owner; else if (h[t.region] !== t.owner) h[t.region] = null;
  }
  for (let i = 0; i < h.length; i++) if (n[i] < REGION_MIN_TILES) h[i] = null;
  return h;
}
// 보너스 대상이 되는(타일 2개 이상) 지역 수
export function regionCount(run) {
  if (!run.regions) return 0;
  const n = []; for (const t of run.tiles) if (t.region >= 0) n[t.region] = (n[t.region] || 0) + 1;
  return n.filter(c => c >= REGION_MIN_TILES).length;
}
export function regionMul(state, tile, holders = regionHolders(state.run)) {
  return holders && tile.owner !== NEUTRAL && tile.region >= 0 && holders[tile.region] === tile.owner ? 1 + regionBonus(state, tile.owner) : 1;
}
export function heldRegions(run, f) { const h = regionHolders(run); return h ? h.filter(o => o === f).length : 0; }
export function goldRate(state, tile, holders) { return 0.5 * TERRAIN[tile.terrain].gold * tile.level * prodMul(state, tile.owner) * regionMul(state, tile, holders) * (1 + (building(tile).gold || 0)); }
export function soldierRate(state, tile, holders) { return 0.12 * tile.level * soldierMul(state, tile.owner) * regionMul(state, tile, holders) * (1 + (building(tile).soldiers || 0)); }
export function upgradeCost(tile, state) { return 40 * Math.pow(1.7, tile.level - 1) * TERRAIN[tile.terrain].gold * (state ? costMul(state, tile.owner) : 1); }
export function factionGoldRate(state, f) {
  const holders = regionHolders(state.run);
  return state.run.tiles.filter(t => t.owner === f).reduce((s, t) => s + goldRate(state, t, holders), 0);
}
export function tilesOwned(state, f) { return state.run.tiles.filter(t => t.owner === f).length; }
export function updateMaxTiles(state) {
  const n = tilesOwned(state, PLAYER);
  if (n > state.run.maxTilesOwned) state.run.maxTilesOwned = n;
}

export function tick(state, dt) {
  const run = state.run;
  const holders = regionHolders(run); // 틱마다 한 번만 계산
  for (const t of run.tiles) {
    if (t.owner === NEUTRAL) continue;
    run.gold[t.owner] += goldRate(state, t, holders) * dt;
    if (t.battle) continue; // 전투 중인 타일은 징집이 멈춘다 (생산이 계속되면 양쪽이 증원을 붓는 소모전이 끝없이 늘어짐)
    const c = cap(t, state);
    if (t.soldiers < c) t.soldiers = Math.min(c, t.soldiers + soldierRate(state, t, holders) * dt);
  }
  runTowers(state, dt);
  runArmies(state, dt);
  runBattles(state, dt);
  run.elapsed += dt;
  updateMaxTiles(state);
}

export function upgrade(state, tileId) {
  const t = state.run.tiles[tileId];
  if (!t || t.owner === NEUTRAL || t.level >= MAX_LEVEL) return false;
  const cost = upgradeCost(t, state);
  if (state.run.gold[t.owner] < cost) return false;
  state.run.gold[t.owner] -= cost;
  t.level += 1;
  return true;
}
// 망루: 주기마다 인접한 남의 땅 중 지금 병사 60%로 여유 있게(1.3배) 이기는 곳을 자동 공격 (중립 먼저, 약한 순). 남의 전투엔 안 낀다
export function runTowers(state, dt) {
  const run = state.run;
  for (const t of run.tiles) {
    const b = building(t);
    if (!b.auto || t.owner === NEUTRAL) continue;
    t.auto = (t.auto || 0) + dt;
    if (t.auto < b.auto) continue;
    t.auto = 0;
    if (t.soldiers < 10) continue;
    const am = attackMul(state, t.owner) * (1 + (b.attack || 0));
    let best = null;
    for (const nid of neighborIds(run, t)) {
      const n = run.tiles[nid];
      if (n.owner === t.owner || (n.battle && !battleParty(n, t.owner))) continue;
      const D = effectiveDefense(state, n, t.owner);
      if (!(t.soldiers * 0.6 * am > D * 1.3)) continue;
      const pri = n.owner === NEUTRAL ? 0 : 1;
      if (!best || pri < best.pri || (pri === best.pri && D < best.D)) best = { n, D, pri };
    }
    if (best) send(state, t.id, best.n.id, 0.6);
  }
}

// 파병 결과를 화면 연출에 알리는 훅(규칙엔 영향 없음). main이 등록한다.
let sendListener = null;
export function setSendListener(fn) { sendListener = fn; }
const emit = r => { if (sendListener) sendListener(r); };

// ---- 전투 (규칙 3.3) ----
// 타일 전투: tile.battle = { parties: [{ owner, soldiers, am }], rate }. 수비 전력 = tile.soldiers × (1+지형방어), 공격 전력 = soldiers × 공격배율.
// 모든 편이 같은 속도(rate, 전력/초)로 깎인다 → 가장 센 편이 남고, 남는 전력 = 1등 − 2등. 세 편 이상이면 난전.
// rate = 3 + 0.5·√(전투 시작 시 전력 합계): 작은 싸움은 2~3초, 수백 명 싸움은 20초 안팎. 합류하면 rate는 커질 수만 있다(시간이 초기화되지 않음).
export const ARMY_SPEED = 2; // 행군 속도, 타일/초
export function armySpeed(state, f) { return f === PLAYER ? ARMY_SPEED * (1 + 0.1 * lv(state, 'speed')) * (perkOf(state).speed || 1) : ARMY_SPEED; }
export function battleRate(total) { return 3 + 0.5 * Math.sqrt(total); }
export function battleParty(tile, owner) { return tile.battle ? tile.battle.parties.find(p => p.owner === owner) : undefined; }
export function battleAttackers(tile) { return tile.battle ? tile.battle.parties.reduce((s, p) => s + p.soldiers, 0) : 0; }
function defense(state, tile) { return tile.soldiers * defMul(state, tile); }
function refreshRate(state, t) {
  const total = defense(state, t) + t.battle.parties.reduce((s, p) => s + p.soldiers * p.am, 0);
  t.battle.rate = Math.max(t.battle.rate || 0, battleRate(total));
}
function joinBattle(state, t, owner, soldiers, am) {
  if (!t.battle) t.battle = { parties: [], rate: 0 };
  let p = t.battle.parties.find(p => p.owner === owner);
  if (!p) { p = { owner, soldiers: 0, am }; t.battle.parties.push(p); }
  else p.am = Math.max(p.am, am);
  p.soldiers += soldiers;
  refreshRate(state, t);
}
// 이 타일을 owner가 치면 맞서게 될 전력: 수비와 다른 공격 편 중 가장 센 것
export function effectiveDefense(state, to, owner) {
  let D = defense(state, to);
  if (to.battle) for (const p of to.battle.parties) if (p.owner !== owner) D = Math.max(D, p.soldiers * p.am);
  return D;
}
// 공격 예측: 지금 비율로 보내면 이기는지 (상태는 바꾸지 않음)
export function predictAttack(state, from, to, ratio) {
  const amount = from.soldiers * ratio;
  const am = attackMul(state, from.owner);
  const mine = battleParty(to, from.owner);
  const A = (amount + (mine ? mine.soldiers : 0)) * am, D = effectiveDefense(state, to, from.owner);
  return { win: amount >= 1 && A > D, A, D, remaining: A > D ? (A - D) / am : 0 };
}

function battleTick(state, t, dt) {
  const b = t.battle; const def = defMul(state, t);
  let D = t.soldiers * def, defenderAlive = D > 1e-9;
  const S = b.parties.map(p => p.soldiers * p.am);
  const dead = [];
  // 한 틱 안에서 여러 편이 차례로 탈락할 수 있다(굵은 틱): 가장 약한 편이 죽을 때까지 깎고, 남은 시간으로 반복
  let rem = dt;
  while (rem > 0) {
    const alive = S.filter(v => v > 1e-9);
    if (!(defenderAlive ? alive.length >= 1 : alive.length >= 2)) break; // 한 편만 남았다
    const loss = Math.min(b.rate * rem, ...(defenderAlive ? [D] : []), ...alive);
    if (!(loss > 0)) break;
    rem -= loss / b.rate;
    if (defenderAlive) { D -= loss; if (D <= 1e-9) { D = 0; defenderAlive = false; } }
    for (let i = 0; i < S.length; i++) if (S[i] > 1e-9) { S[i] -= loss; if (S[i] <= 1e-9) { S[i] = 0; dead.push(b.parties[i]); } }
  }
  t.soldiers = D / def; b.parties.forEach((p, i) => { p.soldiers = S[i] / p.am; });
  b.parties = b.parties.filter(p => p.soldiers > 1e-9);
  if (defenderAlive ? b.parties.length : b.parties.length >= 2) return; // 아직 둘 이상 남았다
  const prevOwner = t.owner;
  delete t.battle;
  for (const p of dead) emit({ type: 'repel', fromId: t.id, toId: t.id, owner: p.owner, defendersLeft: defenderAlive ? D / def : 0, prevOwner });
  if (b.parties.length === 1) {
    const w = b.parties[0];
    t.owner = w.owner; t.soldiers = w.soldiers; delete t.build; delete t.auto; updateMaxTiles(state); // 건물은 점령되면 부서진다
    if (w.owner === PLAYER && lv(state, 'loot')) state.run.gold[PLAYER] += 30 * lv(state, 'loot') * t.level; // 유산 '약탈'
    emit({ type: 'capture', fromId: t.id, toId: t.id, owner: w.owner, remaining: w.soldiers, prevOwner });
  } else t.soldiers = defenderAlive ? D / def : 0;
}
export function runBattles(state, dt) {
  for (const t of state.run.tiles) if (t.battle) battleTick(state, t, dt);
}
// 진행 중인 전투를 지금 당장 끝까지 돌린다
export function resolveBattle(state, t) { while (t.battle) battleTick(state, t, 1e9); }

// ---- 행군 ----
// run.armies = [{ owner, soldiers, am, path: [타일 id…], pos }]. pos는 path 위 위치(정수면 그 타일 위).
// 내 땅을 따라 목적지로 가고, 도착하면 내 땅이면 합류, 남의 땅이면 그 타일 전투에 참가.
// 가는 길의 내 땅이 그새 빼앗겼으면 거기서 싸운다. 같은 변을 마주 보고 지나는 적 부대와는 그 자리에서 부딪힌다(야전, 즉시 판정).
function armies(run) { return run.armies || (run.armies = []); }
function depart(state, owner, soldiers, path) {
  const from = state.run.tiles[path[0]];
  const a = { owner, soldiers, am: attackMul(state, owner) * (1 + (building(from).attack || 0)), path, pos: 0, speed: armySpeed(state, owner) };
  armies(state.run).push(a);
  return a;
}
function arrive(state, army) {
  const run = state.run; const t = run.tiles[army.path[army.path.length - 1]];
  run.armies.splice(run.armies.indexOf(army), 1);
  if (t.owner === army.owner) { t.soldiers += army.soldiers; if (t.battle) refreshRate(state, t); emit({ type: 'arrive', fromId: t.id, toId: t.id, owner: army.owner, sent: army.soldiers }); }
  else { joinBattle(state, t, army.owner, army.soldiers, army.am); emit({ type: 'engage', fromId: t.id, toId: t.id, owner: army.owner, sent: army.soldiers }); }
}
function clash(state, x, y, a, b) {
  const run = state.run;
  const Sx = x.soldiers * x.am, Sy = y.soldiers * y.am;
  const winner = Sx > Sy ? x : Sy > Sx ? y : null;
  if (winner) winner.soldiers = Math.abs(Sx - Sy) / winner.am;
  for (const z of [x, y]) if (z !== winner) run.armies.splice(run.armies.indexOf(z), 1);
  emit({ type: 'clash', fromId: a, toId: b, owner: winner ? winner.owner : NEUTRAL, remaining: winner ? winner.soldiers : 0, losers: [x, y].filter(z => z !== winner).map(z => z.owner) });
}
export function runArmies(state, dt) {
  const run = state.run; const list = armies(run);
  for (const army of [...list]) {
    let move = (army.speed || ARMY_SPEED) * dt;
    while (list.includes(army)) {
      const k = Math.floor(army.pos + 1e-9), last = army.path.length - 1;
      if (k >= last) { arrive(state, army); break; }
      const a = army.path[k], b = army.path[k + 1];
      // 같은 변을 반대로 건너는 적 부대와 충돌
      const foe = list.find(o => o !== army && o.owner !== army.owner && o.path[Math.floor(o.pos + 1e-9)] === b && o.path[Math.floor(o.pos + 1e-9) + 1] === a);
      if (foe) { clash(state, army, foe, a, b); continue; }
      if (move <= 0) break;
      const step = Math.min(move, k + 1 - army.pos); army.pos += step; move -= step;
      if (army.pos >= k + 1 - 1e-9) {
        army.pos = k + 1;
        const t = run.tiles[b];
        if (k + 1 === last) { arrive(state, army); break; }
        if (t.owner !== army.owner) { army.path = army.path.slice(0, k + 2); arrive(state, army); break; } // 길이 끊겼다: 여기서 싸운다
      }
    }
  }
}

// 인접 타일로 비율만큼 출발. 결과 type은 의도(move/attack)이고 실제 결과는 도착 뒤 전투가 정한다.
export function send(state, fromId, toId, ratio) {
  const run = state.run;
  const from = run.tiles[fromId], to = run.tiles[toId];
  if (!from || !to || from.owner === NEUTRAL || from.id === to.id) return { type: 'invalid' };
  if (!isAdjacent(run, from, to)) return { type: 'invalid' };
  const amount = from.soldiers * ratio;
  if (amount < 1) return { type: 'invalid' };
  from.soldiers -= amount;
  const a = depart(state, from.owner, amount, [fromId, toId]);
  const result = { type: to.owner === from.owner ? 'move' : 'attack', sent: amount, eta: 1 / a.speed, fromId, toId, owner: from.owner };
  emit(result);
  return result;
}

export function status(state) {
  const n = tilesOwned(state, PLAYER);
  if (n === 0) {
    const fighting = state.run.tiles.some(t => battleParty(t, PLAYER)) || armies(state.run).some(a => a.owner === PLAYER);
    return fighting ? 'playing' : 'wiped';
  }
  if (n === state.run.tiles.length) return 'conquered';
  return 'playing';
}

// ---- 원거리·다중 명령 (내 땅으로 이어진 길을 따라 한 번에 보낸다) ----
// fromId에서 같은 주인 타일만 밟아 갈 수 있는 타일들의 부모 표 (BFS)
export function bfsOwn(run, fromId) {
  const owner = run.tiles[fromId].owner;
  const parent = new Map([[fromId, -1]]); const queue = [fromId];
  for (let i = 0; i < queue.length; i++) {
    for (const nid of neighborIds(run, run.tiles[queue[i]])) {
      if (parent.has(nid) || run.tiles[nid].owner !== owner) continue;
      parent.set(nid, queue[i]); queue.push(nid);
    }
  }
  return parent;
}
export function pathTo(parent, id) {
  const p = [];
  for (let c = id; c !== -1 && c !== undefined; c = parent.get(c)) p.push(c);
  return p.reverse();
}
// 목적지가 남의 땅이면 목적지와 인접한 내 땅 중 가장 가까운 곳이 집결지
export function stagingFor(run, parent, toId) {
  let best = null;
  for (const nid of neighborIds(run, run.tiles[toId])) {
    if (!parent.has(nid)) continue;
    const d = pathTo(parent, nid).length;
    if (!best || d < best.d) best = { id: nid, d };
  }
  return best ? best.id : null;
}
// 출발 타일들에서 비율만큼 떼어 목적지로 행군: 내 땅이면 이동, 남의 땅이면 집결지를 지나 곧장 공격(먼저 닿는 부대부터 싸움에 든다).
// 길이 끊긴(내 땅으로 못 가는) 출발 타일은 제외된다. legs = 출발마다 지나갈 경로.
export function dispatch(state, fromIds, toId, ratio) {
  const run = state.run; const to = run.tiles[toId];
  if (!to) return { type: 'invalid' };
  const legs = []; let total = 0, owner = null;
  for (const fid of fromIds) {
    const from = run.tiles[fid];
    if (!from || from.owner === NEUTRAL || fid === toId) continue;
    if (owner === null) owner = from.owner; else if (from.owner !== owner) continue;
    const amount = from.soldiers * ratio;
    if (amount < 1) continue;
    const parent = bfsOwn(run, fid);
    const stagingId = to.owner === owner ? (parent.has(toId) ? toId : null) : stagingFor(run, parent, toId);
    if (stagingId === null) continue;
    const path = pathTo(parent, stagingId); if (to.owner !== owner) path.push(toId);
    legs.push({ fromId: fid, stagingId, path, amount }); total += amount;
  }
  if (!legs.length) return { type: 'invalid' };
  for (const l of legs) { run.tiles[l.fromId].soldiers -= l.amount; depart(state, owner, l.amount, l.path); }
  const type = to.owner === owner ? 'move' : 'attack';
  const eta = Math.max(...legs.map(l => l.path.length - 1)) / armySpeed(state, owner);
  const result = { type, sent: total, legs, eta, fromId: legs[0].fromId, toId, owner };
  emit(result);
  return result;
}
// 미리보기: 선택한 출발 타일들에서 지금 비율로 보낼 때 갈 수 있는 목적지마다 'move' | 'win' | 'lose'
export function previewTargets(state, fromIds, ratio) {
  const run = state.run; const marks = {};
  const sources = fromIds.map(id => run.tiles[id]).filter(t => t && t.owner !== NEUTRAL);
  if (!sources.length) return marks;
  const owner = sources[0].owner;
  const seen = new Map(); // 타일 id → 성분 번호
  const compAmount = [];
  for (const s of sources) {
    if (s.owner !== owner) continue;
    let c = seen.get(s.id);
    if (c === undefined) { c = compAmount.length; compAmount.push(0); for (const id of bfsOwn(run, s.id).keys()) seen.set(id, c); }
    compAmount[c] += s.soldiers * ratio >= 1 ? s.soldiers * ratio : 0;
  }
  const am = attackMul(state, owner);
  for (const [id, c] of seen) {
    const amount = compAmount[c];
    if (amount < 1) continue;
    if (!fromIds.includes(id)) marks[id] = 'move';
    for (const nid of neighborIds(run, run.tiles[id])) {
      const n = run.tiles[nid];
      if (n.owner === owner) continue;
      const mine = battleParty(n, owner);
      const win = (amount + (mine ? mine.soldiers : 0)) * am > effectiveDefense(state, n, owner);
      // 여러 성분이 닿으면 이기는 쪽이 있으면 win (실제 명령은 모든 성분을 합치지 않지만, 한 성분이면 정확)
      if (marks[nid] !== 'win') marks[nid] = win ? 'win' : 'lose';
    }
  }
  return marks;
}
