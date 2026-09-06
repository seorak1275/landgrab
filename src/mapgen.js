// 실제 지도(행정구역 다각형) → 육각 격자. 좌표는 지도 단위(폭 1, 높이 map.height, y 아래로 증가).
import { hexToPixel, neighbors, key, distance } from './hex.js';
import korea from './maps/korea.js';
import seoul from './maps/seoul.js';

export const MAPS = {
  hex: { key: 'hex', name: '육각 평원', desc: '정육각형 판. 지역 없음' },
  korea: { ...korea, desc: '시·도 17곳. 한 지역을 전부 가지면 생산 +50%' },
  seoul: { ...seoul, desc: '25개 구. 한 구를 전부 가지면 생산 +50%' },
};
export const DEFAULT_MAP = 'korea';

// 점이 다각형 안인지 (짝홀 규칙). bbox로 먼저 거른다
const bboxCache = new WeakMap();
function bbox(poly) {
  let b = bboxCache.get(poly);
  if (!b) { b = [Infinity, Infinity, -Infinity, -Infinity]; for (const [x, y] of poly) { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); } bboxCache.set(poly, b); }
  return b;
}
export function pointInPoly(poly, x, y) {
  const b = bbox(poly);
  if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function regionAt(map, x, y) {
  for (let i = 0; i < map.regions.length; i++) for (const p of map.regions[i].polys) if (pointInPoly(p, x, y)) return i;
  return -1;
}
// 육각 중심을 지도 단위로: 지도 가운데가 (0,0)
export function hexCenter(map, cell, q, r) { const [x, y] = hexToPixel(q, r, cell); return [map.width / 2 + x, map.height / 2 + y]; }

// 중심이 어느 지역 안에 드는 육각을 모두 모은다 (cell = 육각 한 변, 지도 단위)
export function fillHexes(map, cell) {
  const R = Math.ceil(Math.max(map.width, map.height) / cell) + 2;
  const out = [];
  for (let r = -R; r <= R; r++) for (let q = -R; q <= R; q++) {
    const [x, y] = hexCenter(map, cell, q, r);
    if (x < 0 || x > map.width || y < 0 || y > map.height) continue;
    const region = regionAt(map, x, y);
    if (region >= 0) out.push({ q, r, region });
  }
  return out;
}
// 타일 수가 target에 가장 가까워지는 cell (cell이 클수록 타일이 적다)
export function cellFor(map, target, lo = 0.02, hi = 0.25) {
  let best = null;
  for (let i = 0; i < 22; i++) {
    const mid = Math.sqrt(lo * hi), n = fillHexes(map, mid).length;
    if (!best || Math.abs(n - target) < Math.abs(best.n - target)) best = { cell: mid, n };
    if (n === target) break;
    if (n > target) lo = mid; else hi = mid;
  }
  return best.cell;
}

export function components(tiles) {
  const idx = new Map(tiles.map((t, i) => [key(t.q, t.r), i]));
  const seen = new Set(), comps = [];
  for (let i = 0; i < tiles.length; i++) {
    if (seen.has(i)) continue;
    const comp = [i]; seen.add(i);
    for (let k = 0; k < comp.length; k++) for (const [q, r] of neighbors(tiles[comp[k]].q, tiles[comp[k]].r)) {
      const j = idx.get(key(q, r));
      if (j !== undefined && !seen.has(j)) { seen.add(j); comp.push(j); }
    }
    comps.push(comp);
  }
  return comps.sort((a, b) => b.length - a.length);
}
// a에서 b까지 육각 직선 (양 끝 포함)
export function hexLine(a, b) {
  const n = distance(a, b); if (n === 0) return [a];
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, q = a[0] + (b[0] - a[0]) * t + 1e-6, r = a[1] + (b[1] - a[1]) * t + 1e-6, s = -q - r;
    let rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
    const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s);
    if (dq > dr && dq > ds) rq = -rr - rs; else if (dr > ds) rr = -rq - rs;
    out.push([rq, rr]);
  }
  return out;
}
// 떨어진 덩어리(섬)는 뱃길(sea) 타일로 본토에 잇는다. 2칸 미만이고 그 지역이 본토에도 있으면 버린다.
export function connect(tiles) {
  const comps = components(tiles);
  if (comps.length <= 1) return tiles;
  const kept = comps[0].map(i => tiles[i]);
  const regionsIn = ts => new Set(ts.map(t => t.region));
  for (const comp of comps.slice(1)) {
    const ts = comp.map(i => tiles[i]);
    const have = regionsIn(kept);
    if (ts.length < 2 && ts.every(t => have.has(t.region))) continue;
    let best = null;
    for (const a of ts) for (const b of kept) { if (b.sea) continue; const d = distance([a.q, a.r], [b.q, b.r]); if (!best || d < best.d) best = { a, b, d }; }
    const exists = new Set(kept.map(t => key(t.q, t.r)));
    for (const [q, r] of hexLine([best.a.q, best.a.r], [best.b.q, best.b.r])) {
      const k = key(q, r);
      if (exists.has(k) || ts.some(t => t.q === q && t.r === r)) continue;
      kept.push({ q, r, region: -1, sea: true }); exists.add(k);
    }
    kept.push(...ts);
  }
  return kept;
}

// 수도 자리: 플레이어는 home에 가장 가까운 땅, AI는 기존 수도들에서 가장 먼 땅부터 (뱃길 제외)
export function placeCapitals(map, cell, tiles, count) {
  const land = tiles.filter(t => !t.sea);
  const d2 = t => { const [x, y] = hexCenter(map, cell, t.q, t.r); return (x - map.home[0]) ** 2 + (y - map.home[1]) ** 2; };
  const caps = [land.reduce((a, b) => (d2(b) < d2(a) ? b : a))];
  while (caps.length < count) {
    let best = null;
    for (const t of land) {
      if (caps.includes(t)) continue;
      const d = Math.min(...caps.map(c => distance([t.q, t.r], [c.q, c.r])));
      if (!best || d > best.d) best = { t, d };
    }
    caps.push(best.t);
  }
  return caps.map(t => [t.q, t.r]);
}

// 지도 전체 생성: 타일(q,r,region,sea)·cell·수도 좌표
export function buildMap(mapKey, targetTiles, factions) {
  const map = MAPS[mapKey];
  const cell = cellFor(map, targetTiles);
  const tiles = connect(fillHexes(map, cell));
  return { map, cell, tiles, capitals: placeCapitals(map, cell, tiles, factions) };
}
