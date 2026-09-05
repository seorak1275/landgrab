import { neighbors, key } from './hex.js';
import { TERRAIN, PLAYER, NEUTRAL } from './world.js';

export const MAX_LEVEL = 10;
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
  return f === PLAYER ? 1 + 0.1 * (state.legacy.upgrades.gold || 0) : 1 + 0.1 * state.legacy.prestigeCount;
}
export function soldierMul(state, f) {
  return f === PLAYER ? 1 + 0.1 * (state.legacy.upgrades.soldiers || 0) : 1 + 0.1 * state.legacy.prestigeCount;
}
export function attackMul(state, f) { return f === PLAYER ? 1 + 0.05 * (state.legacy.upgrades.attack || 0) : 1; }
export function cap(tile) { return 20 * tile.level * TERRAIN[tile.terrain].cap; }
export function goldRate(state, tile) { return 0.5 * TERRAIN[tile.terrain].gold * tile.level * prodMul(state, tile.owner); }
export function soldierRate(state, tile) { return 0.15 * tile.level * soldierMul(state, tile.owner); }
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

export function send(state, fromId, toId, ratio) {
  const run = state.run;
  const from = run.tiles[fromId], to = run.tiles[toId];
  if (!from || !to || from.owner === NEUTRAL || from.id === to.id) return { type: 'invalid' };
  if (!isAdjacent(run, from, to)) return { type: 'invalid' };
  const amount = from.soldiers * ratio;
  if (amount < 1) return { type: 'invalid' };
  from.soldiers -= amount;
  if (to.owner === from.owner) { to.soldiers += amount; return { type: 'move', sent: amount }; }
  const am = attackMul(state, from.owner), def = 1 + TERRAIN[to.terrain].def;
  const A = amount * am, D = to.soldiers * def;
  if (A > D) {
    to.owner = from.owner; to.soldiers = (A - D) / am;
    updateMaxTiles(state);
    return { type: 'capture', sent: amount, remaining: to.soldiers };
  }
  to.soldiers = (D - A) / def;
  return { type: 'repel', sent: amount, defendersLeft: to.soldiers };
}

export function status(state) {
  const n = tilesOwned(state, PLAYER);
  if (n === 0) return 'wiped';
  if (n === state.run.tiles.length) return 'conquered';
  return 'playing';
}
