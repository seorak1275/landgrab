import { mulberry32, pick } from './rng.js';
import { tilesInRadius, corners, distance, key } from './hex.js';
import { MAPS, buildMap } from './mapgen.js';

export const TERRAIN = {
  plain:    { name: '평지', gold: 1.0, def: 0,   cap: 1.0 },
  forest:   { name: '숲',   gold: 1.5, def: 0.2, cap: 1.0 },
  hill:     { name: '언덕', gold: 2.0, def: 0.5, cap: 1.2 },
  mountain: { name: '산',   gold: 3.0, def: 1.0, cap: 1.5 },
  citadel:  { name: '성채', gold: 3.0, def: 1.0, cap: 2.0 },
  sea:      { name: '뱃길', gold: 0.3, def: 0,   cap: 0.5 }, // 섬을 잇는 바다 칸 (실제 지도에만)
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

// 지도별 격자: 육각 평원은 반지름 R 정육각형, 실제 지도는 같은 타일 수를 목표로 행정구역 다각형을 채운다
function layout(mapKey, radius, factions) {
  if (mapKey === 'hex' || !MAPS[mapKey]) {
    const cs = corners(radius);
    return { tiles: tilesInRadius(radius).map(([q, r]) => ({ q, r, region: -1 })), capitals: [cs[0], ...AI_CORNERS.slice(0, factions - 1).map(ci => cs[ci])] };
  }
  const b = buildMap(mapKey, 3 * radius * (radius + 1) + 1, factions);
  return { ...b, regions: b.map.regions.map(r => r.name), terrainWeights: b.map.regions.map(r => r.terrain ? Object.entries(r.terrain) : null) };
}

export function generateRun(seed, prestige, upgrades = {}, mapKey = 'hex') {
  const rand = mulberry32(seed);
  const radius = radiusFor(prestige);
  const aiCount = aiCountFor(prestige);
  const factions = 1 + aiCount;
  const lay = layout(mapKey, radius, factions);
  const capitals = lay.capitals;
  const capOwner = new Map(capitals.map((c, i) => [key(...c), i]));
  const tiles = lay.tiles.map(({ q, r, region, sea }, id) => {
    const k = key(q, r);
    const owner = capOwner.has(k) ? capOwner.get(k) : NEUTRAL;
    const weights = (lay.terrainWeights && region >= 0 && lay.terrainWeights[region]) || TERRAIN_WEIGHTS;
    const terrain = owner !== NEUTRAL ? 'citadel' : sea ? 'sea' : pick(rand, weights);
    // 중립 수비는 "가장 가까운 수도"에서 먼 만큼 세진다 — 플레이어 수도 기준으로만 하면 AI 옆 땅이 145명이라 AI가 10분 넘게 못 움직였음
    const soldiers = owner === NEUTRAL
      ? neutralGarrison(Math.min(...capitals.map(c => distance([q, r], c))), prestige)
      : 30 + (owner === PLAYER ? 20 * (upgrades.startArmy || 0) : 0);
    return { id, q, r, terrain, owner, level: 1, soldiers, region };
  });
  return {
    seed, radius, factions, tiles,
    map: mapKey in MAPS ? mapKey : 'hex',
    ...(lay.regions ? { regions: lay.regions, cell: lay.cell } : {}),
    gold: Array(factions).fill(100),
    aiTimers: Array(factions).fill(0),
    armies: [], // 행군 중인 부대 (sim.js)
    maxTilesOwned: 1,
    sendRatio: 0.5,
    elapsed: 0,
  };
}
