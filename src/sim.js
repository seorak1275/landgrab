import { neighbors, key } from './hex.js';
import { TERRAIN, PLAYER, NEUTRAL } from './world.js';

export const MAX_LEVEL = 10;
export const AI_BASE_MUL = 0.6; // AI 생산 배율(골드·병사) 기본값, 환생마다 +0.1 (중립 수비를 가장 가까운 수도 기준으로 바꾼 뒤 0.75로는 활동적 플레이어도 3/5 전멸해서 하향)
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

export function prodMul(state, f) {
  return f === PLAYER ? 1 + 0.1 * (state.legacy.upgrades.gold || 0) : AI_BASE_MUL + 0.1 * state.legacy.prestigeCount;
}
export function soldierMul(state, f) {
  return f === PLAYER ? 1 + 0.1 * (state.legacy.upgrades.soldiers || 0) : AI_BASE_MUL + 0.1 * state.legacy.prestigeCount;
}
export function attackMul(state, f) { return f === PLAYER ? 1 + 0.05 * (state.legacy.upgrades.attack || 0) : 1; }
export function cap(tile) { return 20 * tile.level * TERRAIN[tile.terrain].cap; }
// 지역(구·시도) 완전 점령: 한 지역의 타일을 전부 가진 세력은 그 지역 타일의 골드·병사 생산 +50%
// 타일이 1개뿐인 지역은 제외 (37타일 대한민국에서 대전·광주 같은 1칸 지역을 먹자마자 +50%가 붙어 AI끼리 30분 독식이 났음)
export const REGION_BONUS = 0.5, REGION_MIN_TILES = 2;
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
export function regionMul(run, tile, holders = regionHolders(run)) {
  return holders && tile.owner !== NEUTRAL && tile.region >= 0 && holders[tile.region] === tile.owner ? 1 + REGION_BONUS : 1;
}
export function heldRegions(run, f) { const h = regionHolders(run); return h ? h.filter(o => o === f).length : 0; }
export function goldRate(state, tile, holders) { return 0.5 * TERRAIN[tile.terrain].gold * tile.level * prodMul(state, tile.owner) * regionMul(state.run, tile, holders); }
export function soldierRate(state, tile, holders) { return 0.12 * tile.level * soldierMul(state, tile.owner) * regionMul(state.run, tile, holders); }
export function upgradeCost(tile) { return 40 * Math.pow(1.7, tile.level - 1) * TERRAIN[tile.terrain].gold; }
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
    const c = cap(t);
    if (t.soldiers < c) t.soldiers = Math.min(c, t.soldiers + soldierRate(state, t, holders) * dt);
  }
  runBattles(state, dt);
  run.elapsed += dt;
  updateMaxTiles(state);
}

export function upgrade(state, tileId) {
  const t = state.run.tiles[tileId];
  if (!t || t.owner === NEUTRAL || t.level >= MAX_LEVEL) return false;
  const cost = upgradeCost(t);
  if (state.run.gold[t.owner] < cost) return false;
  state.run.gold[t.owner] -= cost;
  t.level += 1;
  return true;
}

// 공격 예측: 지금 비율로 보내면 이기는지 (규칙 3.3과 같은 수식, 상태는 바꾸지 않음)
// 지금 이 타일을 치면 맞서게 될 수비 전력. 다른 세력이 싸우는 중이면 그 전투가 먼저 끝난 뒤 남는 쪽의 전력.
export function effectiveDefense(to, owner) {
  const def = 1 + TERRAIN[to.terrain].def, D = to.soldiers * def;
  const b = to.battle;
  if (!b || b.attacker === owner) return D;
  const A = b.attackers * b.am;
  return A > D ? (A - D) / b.am * def : D - A;
}
export function predictAttack(state, from, to, ratio) {
  const amount = from.soldiers * ratio;
  const am = attackMul(state, from.owner);
  const joining = to.battle && to.battle.attacker === from.owner ? to.battle.attackers : 0; // 이미 싸우고 있는 내 병사
  const A = (amount + joining) * am, D = effectiveDefense(to, from.owner);
  return { win: amount >= 1 && A > D, A, D, remaining: A > D ? (A - D) / am : 0 };
}

// 파병 결과를 화면 연출에 알리는 훅(규칙엔 영향 없음). main이 등록한다.
let sendListener = null;
export function setSendListener(fn) { sendListener = fn; }

export const BATTLE_SECONDS = 4; // 전투 시작 시 약한 쪽이 전멸하기까지 걸리는 시간

// 전투 진행: 양쪽이 같은 속도(전력 단위)로 깎인다 → 끝나면 즉시 판정과 같은 결과(|A−D|)
function battleTick(state, t, dt) {
  const b = t.battle; const def = 1 + TERRAIN[t.terrain].def;
  let A = b.attackers * b.am, D = t.soldiers * def;
  const loss = Math.min(b.rate * dt, A, D);
  A -= loss; D -= loss;
  b.attackers = A / b.am; t.soldiers = D / def;
  if (A > 1e-9 && D > 1e-9) return null;
  const prevOwner = t.owner, attacker = b.attacker;
  delete t.battle;
  let result;
  if (A > D) { t.owner = attacker; t.soldiers = A / b.am; updateMaxTiles(state); result = { type: 'capture', remaining: t.soldiers, prevOwner }; }
  else { t.soldiers = D / def; result = { type: 'repel', defendersLeft: t.soldiers, prevOwner }; }
  if (sendListener) sendListener({ ...result, fromId: t.id, toId: t.id, owner: attacker });
  return result;
}
// 진행 중인 전투를 지금 당장 끝까지 돌린다 (다른 세력이 끼어들 때)
export function resolveBattle(state, t) { while (t.battle) battleTick(state, t, 1e9); }
export function runBattles(state, dt) {
  for (const t of state.run.tiles) if (t.battle) battleTick(state, t, dt);
}

export function send(state, fromId, toId, ratio) {
  const run = state.run;
  const from = run.tiles[fromId], to = run.tiles[toId];
  if (!from || !to || from.owner === NEUTRAL || from.id === to.id) return { type: 'invalid' };
  if (!isAdjacent(run, from, to)) return { type: 'invalid' };
  const amount = from.soldiers * ratio;
  if (amount < 1) return { type: 'invalid' };
  from.soldiers -= amount;
  let result;
  if (to.owner === from.owner) { // 공격받는 중이면 수비에 합류
    to.soldiers += amount; result = { type: 'move', sent: amount };
    if (to.battle) to.battle.rate = Math.max(to.battle.rate, Math.min(to.battle.attackers * to.battle.am, to.soldiers * (1 + TERRAIN[to.terrain].def)) / BATTLE_SECONDS);
  }
  else if (to.battle && to.battle.attacker !== from.owner) {
    // 남의 전투에 제3세력으로 끼어들면 그 전투부터 끝낸다 (주인이 바뀔 수 있음)
    resolveBattle(state, to);
    if (to.owner === from.owner) { to.soldiers += amount; result = { type: 'move', sent: amount }; }
  }
  if (!result) {
    const am = attackMul(state, from.owner), def = 1 + TERRAIN[to.terrain].def;
    if (!to.battle) to.battle = { attacker: from.owner, attackers: 0, am, rate: 0 };
    to.battle.attackers += amount;
    to.battle.rate = Math.min(to.battle.attackers * am, to.soldiers * def) / BATTLE_SECONDS;
    result = { type: 'attack', sent: amount, attackers: to.battle.attackers };
  }
  if (sendListener) sendListener({ ...result, fromId, toId, owner: from.owner });
  return result;
}

export function status(state) {
  const n = tilesOwned(state, PLAYER);
  if (n === 0) return state.run.tiles.some(t => t.battle && t.battle.attacker === PLAYER) ? 'playing' : 'wiped';
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
// 출발 타일들에서 비율만큼 떼어 목적지로: 내 땅이면 이동, 남의 땅이면 집결지에 모아 한 번에 공격.
// 길이 끊긴(내 땅으로 못 가는) 출발 타일은 제외된다. legs = 출발마다 지나간 경로.
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
    legs.push({ fromId: fid, stagingId, path: pathTo(parent, stagingId), amount }); total += amount;
  }
  if (!legs.length) return { type: 'invalid' };
  for (const l of legs) { run.tiles[l.fromId].soldiers -= l.amount; run.tiles[l.stagingId].soldiers += l.amount; }
  if (to.owner === owner) return { type: 'move', sent: total, legs };
  const stage = run.tiles[legs[0].stagingId];
  for (const l of legs.slice(1)) if (l.stagingId !== stage.id) { run.tiles[l.stagingId].soldiers -= l.amount; stage.soldiers += l.amount; }
  const r = send(state, stage.id, toId, total / stage.soldiers);
  return { ...r, legs };
}
// 미리보기: 선택한 출발 타일들에서 지금 비율로 보낼 때 갈 수 있는 목적지마다 'move' | 'win' | 'lose'
export function previewTargets(state, fromIds, ratio) {
  const run = state.run; const marks = {};
  const sources = fromIds.map(id => run.tiles[id]).filter(t => t && t.owner !== NEUTRAL);
  if (!sources.length) return marks;
  const owner = sources[0].owner;
  const comp = new Map(); // 타일 id → 그 연결 성분에서 보낼 수 있는 병사 합
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
      const joining = n.battle && n.battle.attacker === owner ? n.battle.attackers : 0;
      const win = (amount + joining) * am > effectiveDefense(n, owner);
      // 여러 성분이 닿으면 이기는 쪽이 있으면 win (실제 명령은 모든 성분을 합치지 않지만, 한 성분이면 정확)
      if (marks[nid] !== 'win') marks[nid] = win ? 'win' : 'lose';
    }
  }
  return marks;
}
