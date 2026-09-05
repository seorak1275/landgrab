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
export function goldRate(state, tile) { return 0.5 * TERRAIN[tile.terrain].gold * tile.level * prodMul(state, tile.owner); }
export function soldierRate(state, tile) { return 0.12 * tile.level * soldierMul(state, tile.owner); }
export function upgradeCost(tile) { return 40 * Math.pow(1.7, tile.level - 1) * TERRAIN[tile.terrain].gold; }
export function factionGoldRate(state, f) {
  return state.run.tiles.filter(t => t.owner === f).reduce((s, t) => s + goldRate(state, t), 0);
}
export function tilesOwned(state, f) { return state.run.tiles.filter(t => t.owner === f).length; }
export function updateMaxTiles(state) {
  const n = tilesOwned(state, PLAYER);
  if (n > state.run.maxTilesOwned) state.run.maxTilesOwned = n;
}

export function tick(state, dt) {
  const run = state.run;
  for (const t of run.tiles) {
    if (t.owner === NEUTRAL) continue;
    run.gold[t.owner] += goldRate(state, t) * dt;
    const c = cap(t);
    if (t.soldiers < c) t.soldiers = Math.min(c, t.soldiers + soldierRate(state, t) * dt);
  }
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
export function predictAttack(state, from, to, ratio) {
  const amount = from.soldiers * ratio;
  const am = attackMul(state, from.owner), def = 1 + TERRAIN[to.terrain].def;
  const A = amount * am, D = to.soldiers * def;
  return { win: amount >= 1 && A > D, A, D, remaining: A > D ? (A - D) / am : 0 };
}

// 파병 결과를 화면 연출에 알리는 훅(규칙엔 영향 없음). main이 등록한다.
let sendListener = null;
export function setSendListener(fn) { sendListener = fn; }

export function send(state, fromId, toId, ratio) {
  const run = state.run;
  const from = run.tiles[fromId], to = run.tiles[toId];
  if (!from || !to || from.owner === NEUTRAL || from.id === to.id) return { type: 'invalid' };
  if (!isAdjacent(run, from, to)) return { type: 'invalid' };
  const amount = from.soldiers * ratio;
  if (amount < 1) return { type: 'invalid' };
  from.soldiers -= amount;
  let result;
  if (to.owner === from.owner) { to.soldiers += amount; result = { type: 'move', sent: amount }; }
  else {
    const prevOwner = to.owner;
    const am = attackMul(state, from.owner), def = 1 + TERRAIN[to.terrain].def;
    const A = amount * am, D = to.soldiers * def;
    if (A > D) {
      to.owner = from.owner; to.soldiers = (A - D) / am;
      updateMaxTiles(state);
      result = { type: 'capture', sent: amount, remaining: to.soldiers, prevOwner };
    } else {
      to.soldiers = (D - A) / def;
      result = { type: 'repel', sent: amount, defendersLeft: to.soldiers, prevOwner };
    }
  }
  if (sendListener) sendListener({ ...result, fromId, toId, owner: from.owner });
  return result;
}

export function status(state) {
  const n = tilesOwned(state, PLAYER);
  if (n === 0) return 'wiped';
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
      const win = amount * am > n.soldiers * (1 + TERRAIN[n.terrain].def);
      // 여러 성분이 닿으면 이기는 쪽이 있으면 win (실제 명령은 모든 성분을 합치지 않지만, 한 성분이면 정확)
      if (marks[nid] !== 'win') marks[nid] = win ? 'win' : 'lose';
    }
  }
  return marks;
}
