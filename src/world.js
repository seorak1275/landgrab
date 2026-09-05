import { mulberry32, pick } from './rng.js';
import { tilesInRadius, corners, distance, key } from './hex.js';

export const TERRAIN = {
  plain:    { name: '평지', gold: 1.0, def: 0,   cap: 1.0 },
  forest:   { name: '숲',   gold: 1.5, def: 0.2, cap: 1.0 },
  hill:     { name: '언덕', gold: 2.0, def: 0.5, cap: 1.2 },
  mountain: { name: '산',   gold: 3.0, def: 1.0, cap: 1.5 },
  citadel:  { name: '성채', gold: 3.0, def: 1.0, cap: 2.0 },
};
const TERRAIN_WEIGHTS = [['plain', 40], ['forest', 30], ['hill', 20], ['mountain', 10]];
const AI_CORNERS = [2, 4, 3, 1]; // 플레이어(꼭짓점 0)에서 먼 순서
export const PLAYER = 0;
export const NEUTRAL = -1;

export function radiusFor(prestige) { return Math.min(3 + Math.floor(prestige / 2), 6); }
export function aiCountFor(prestige) { return Math.min(2 + Math.floor(prestige / 3), 4); }
export function neutralGarrison(dist, prestige) {
  return Math.round(25 * (1 + dist * 0.8) * (1 + prestige * 0.15));
}

export function generateRun(seed, prestige, upgrades = {}) {
  const rand = mulberry32(seed);
  const radius = radiusFor(prestige);
  const aiCount = aiCountFor(prestige);
  const cs = corners(radius);
  const playerCap = cs[0];
  const capOwner = new Map([[key(...playerCap), PLAYER]]);
  AI_CORNERS.slice(0, aiCount).forEach((ci, i) => capOwner.set(key(...cs[ci]), i + 1));
  const capitals = [playerCap, ...AI_CORNERS.slice(0, aiCount).map(ci => cs[ci])];
  const tiles = tilesInRadius(radius).map(([q, r], id) => {
    const k = key(q, r);
    const owner = capOwner.has(k) ? capOwner.get(k) : NEUTRAL;
    const terrain = owner === NEUTRAL ? pick(rand, TERRAIN_WEIGHTS) : 'citadel';
    // 중립 수비는 "가장 가까운 수도"에서 먼 만큼 세진다 — 플레이어 수도 기준으로만 하면 AI 옆 땅이 145명이라 AI가 10분 넘게 못 움직였음
    const soldiers = owner === NEUTRAL
      ? neutralGarrison(Math.min(...capitals.map(c => distance([q, r], c))), prestige)
      : 30 + (owner === PLAYER ? 20 * (upgrades.startArmy || 0) : 0);
    return { id, q, r, terrain, owner, level: 1, soldiers };
  });
  const factions = 1 + aiCount;
  return {
    seed, radius, factions, tiles,
    gold: Array(factions).fill(100),
    aiTimers: Array(factions).fill(0),
    maxTilesOwned: 1,
    sendRatio: 0.5,
    elapsed: 0,
  };
}
