// 통계청 시군구 GeoJSON → 사단전 모드 지도 데이터(src/maps/sgg.js)
// - 구가 있는 시(수원·성남·고양…)도 구까지 나눈다 (속초처럼 구가 없는 시는 시 그대로) → 251개
// - 인접: 원본 좌표를 공유하는(꼭짓점 2개 이상) 지역끼리. 섬(이웃 없음)은 가장 가까운 지역과 잇는다
// - 생산력(prod, 인력/초)과 특성(trait)은 유형·시도로 정한다
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

// 고해상도 원본(지역당 평균 4,890점). _simple 판(평균 34점)으로 만들었더니 서울 구가 꼭짓점 7개짜리
// 삼각형이라 확대하면 깨져 보였다 → 원본을 받아 우리가 직접, 지역 크기에 맞춰 단순화한다
const SRC = 'https://raw.githubusercontent.com/southkorea/southkorea-maps/master/kostat/2013/json/skorea_municipalities_geo.json';
const SRC_FILE = 'tools/geo/sgg_full.json';
const TOL_K = Number(process.env.TOL_K || 0.006), TOL_MIN = Number(process.env.TOL_MIN || 0.00004), TOL_MAX = Number(process.env.TOL_MAX || 0.00025);
const PROV = { 11: '서울', 21: '부산', 22: '대구', 23: '인천', 24: '광주', 25: '대전', 26: '울산', 29: '세종', 31: '경기', 32: '강원', 33: '충북', 34: '충남', 35: '전북', 36: '전남', 37: '경북', 38: '경남', 39: '제주' };
const METRO = new Set([11, 21, 22, 23, 24, 25, 26, 29]);
const MOUNTAIN_PROV = new Set(['강원', '경북', '충북']);
const PLAIN_PROV = new Set(['전북', '충남', '경기', '전남']);
// 생산력(인력/초): 구 2, 시 1.5, 군 1 ("너무 적다"는 피드백으로 4배). 세력 풀 하나에 합쳐져 한도 500
const PROD = { 구: 2, 시: 1.5, 군: 1 };

async function fetchGeo() {
  mkdirSync('tools/geo', { recursive: true });
  const f = SRC_FILE;
  if (!existsSync(f)) writeFileSync(f, await (await fetch(SRC)).text());
  return JSON.parse(readFileSync(f, 'utf8'));
}
function ringArea(r) { let a = 0; for (let i = 0; i < r.length; i++) { const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % r.length]; a += x1 * y2 - x2 * y1; } return a / 2; }
function simplify(pts, tol) {
  if (pts.length < 4) return pts;
  const sq = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1]; const l = dx * dx + dy * dy || 1; let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l; t = Math.max(0, Math.min(1, t)); const x = a[0] + t * dx - p[0], y = a[1] + t * dy - p[1]; return x * x + y * y; };
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop(); let best = -1, bd = tol * tol;
    for (let i = s + 1; i < e; i++) { const d = sq(pts[i], pts[s], pts[e]); if (d > bd) { bd = d; best = i; } }
    if (best > 0) { keep[best] = 1; stack.push([s, best], [best, e]); }
  }
  return pts.filter((_, i) => keep[i]);
}

const geo = await fetchGeo();
// 투영 (경도는 cos(위도)로 줄임, 위도는 위로 갈수록 y 작게), 폭 1
// 고해상도 원본은 점이 120만 개라 Math.min(...arr) 은 스택이 터진다 → 훑으면서 최소·최대.
// 독도·백령도 같은 아주 작은 섬(2km 미만)은 어차피 출력에서 버리니 범위 계산에서도 뺀다
// (넣으면 지도 폭이 13% 늘어 본토가 그만큼 작게 그려진다)
const ISLET = 0.02; // 도(度)
let lon0 = Infinity, lon1 = -Infinity, lat0 = Infinity, lat1 = -Infinity;
for (const ft of geo.features) for (const pg of (ft.geometry.type === 'Polygon' ? [ft.geometry.coordinates] : ft.geometry.coordinates)) {
  const ring = pg[0];
  let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
  for (const [x, y] of ring) { if (x < a0) a0 = x; if (x > a1) a1 = x; if (y < b0) b0 = y; if (y > b1) b1 = y; }
  if (a1 - a0 < ISLET && b1 - b0 < ISLET) continue;
  if (a0 < lon0) lon0 = a0; if (a1 > lon1) lon1 = a1; if (b0 < lat0) lat0 = b0; if (b1 > lat1) lat1 = b1;
}
const k = Math.cos((lat0 + lat1) / 2 * Math.PI / 180), W = (lon1 - lon0) * k, H = (lat1 - lat0) / W;
const proj = ([x, y]) => [(x - lon0) * k / W, (lat1 - y) / W];

// 1. 지역 묶기: 일반시의 구는 시 이름으로 합친다
const groups = new Map(); // 이름 → { name, prov, type, rings(원본 투영), code }
for (const ft of geo.features) {
  const code = Number(ft.properties.code), pv = Math.floor(code / 1000), prov = PROV[pv];
  let name = ft.properties.name;
  const m = name.match(/^(.+?)시(.+구)$/); if (m && !METRO.has(pv)) name = `${m[1]} ${m[2]}`; // 수원시장안구 → 수원 장안구
  const type = name.endsWith('구') ? '구' : name.endsWith('군') ? '군' : '시';
  const key = `${prov}/${name}`;
  const rings = (ft.geometry.type === 'Polygon' ? [ft.geometry.coordinates] : ft.geometry.coordinates).map(pg => pg[0].map(proj));
  if (!groups.has(key)) groups.set(key, { name, prov, type, rings: [], code });
  groups.get(key).rings.push(...rings);
}
const regions = [...groups.values()];
regions.sort((a, b) => a.code - b.code);
// 이름 중복(예: 고성군 강원·경남, 중구·동구 여럿)은 시도를 붙여 구분
const nameCount = {}; for (const r of regions) nameCount[r.name] = (nameCount[r.name] || 0) + 1;
for (const r of regions) if (nameCount[r.name] > 1) r.label = `${r.prov} ${r.name}`; else r.label = r.name;

// 2. 인접: 꼭짓점 공유
const vert = new Map(); // "x,y" → Set(region idx)
regions.forEach((r, i) => { for (const ring of r.rings) for (const [x, y] of ring) { const kk = `${x.toFixed(5)},${y.toFixed(5)}`; (vert.get(kk) || vert.set(kk, new Set()).get(kk)).add(i); } });
const shared = regions.map(() => new Map());
for (const set of vert.values()) { const ids = [...set]; for (const a of ids) for (const b of ids) if (a !== b) shared[a].set(b, (shared[a].get(b) || 0) + 1); }
const adj = regions.map((r, i) => [...shared[i]].filter(([, n]) => n >= 2).map(([b]) => b));
// 3. 무게중심(가장 큰 고리 기준)·면적
for (const r of regions) {
  let best = null;
  for (const ring of r.rings) { const a = Math.abs(ringArea(ring)); if (!best || a > best.a) best = { ring, a }; }
  let cx = 0, cy = 0; for (const [x, y] of best.ring) { cx += x / best.ring.length; cy += y / best.ring.length; }
  r.c = [+cx.toFixed(4), +cy.toFixed(4)]; r.area = r.rings.reduce((s, ring) => s + Math.abs(ringArea(ring)), 0);
}
// 4. 섬: 본토(가장 큰 연결 성분)와 떨어진 성분은 경계선이 가장 가까운 지역끼리 잇는다 (뱃길). 제주처럼 여러 지역이 한 섬인 경우도 처리
function components() {
  const seen = new Set(), comps = [];
  regions.forEach((_, i) => { if (seen.has(i)) return; const comp = [i]; seen.add(i); for (let k = 0; k < comp.length; k++) for (const j of adj[comp[k]]) if (!seen.has(j)) { seen.add(j); comp.push(j); } comps.push(comp); });
  return comps.sort((a, b) => b.length - a.length);
}
const dist = (a, b) => { // 두 지역 경계 꼭짓점 사이 최소 거리 (3개마다 하나씩)
  let best = Infinity;
  for (const ra of regions[a].rings) for (let i = 0; i < ra.length; i += 3) for (const rb of regions[b].rings) for (let j = 0; j < rb.length; j += 3) { const d = Math.hypot(ra[i][0] - rb[j][0], ra[i][1] - rb[j][1]); if (d < best) best = d; }
  return best;
};
const sea = [];
for (let comps = components(); comps.length > 1; comps = components()) {
  const main = new Set(comps[0]), isl = comps[1];
  let best = null;
  for (const a of isl) for (const b of main) { const d = dist(a, b); if (!best || d < best.d) best = { a, b, d }; }
  adj[best.a].push(best.b); adj[best.b].push(best.a); sea.push([best.a, best.b]);
}
// 5. 생산력·특성
for (const r of regions) {
  r.prod = PROD[r.type];
  r.trait = METRO.has(Math.floor(r.code / 1000)) ? 'city' : MOUNTAIN_PROV.has(r.prov) ? 'mountain' : PLAIN_PROV.has(r.prov) ? 'plain' : r.prov === '제주' ? 'mountain' : 'coast';
}
// 6. 단순화해서 출력 (작은 섬 고리는 버림)
const out = {
  key: 'sgg', name: '대한민국 시·군·구', width: 1, height: +H.toFixed(4),
  regions: regions.map((r, i) => ({
    n: r.label, p: r.prov, t: r.type, c: r.c, prod: r.prod, tr: r.trait, adj: adj[i],
    // 허용오차는 지역 크기에 맞춘다: 작은 구(서울·부산)는 곱게, 큰 군은 굵게.
    // 0.0012 한 값으로 뭉개던 때는 서울 구가 꼭짓점 7개짜리 삼각형이라 확대하면 깨져 보였다
    polys: r.rings.filter(ring => Math.abs(ringArea(ring)) >= 0.00002 || ring === r.rings[0]).map(ring => {
      const tol = Math.max(TOL_MIN, Math.min(TOL_MAX, TOL_K * Math.sqrt(Math.abs(ringArea(ring)))));
      return simplify(ring, tol).map(([x, y]) => [+x.toFixed(5), +y.toFixed(5)]);
    }),
  })),
  sea,
};
const pts = out.regions.reduce((s, r) => s + r.polys.reduce((t, p) => t + p.length, 0), 0);
// 정밀본은 나중에 받는다: 처음엔 가벼운 판으로 바로 그리고, 다 받으면 갈아 끼운다
// (모바일에서 첫 화면이 늦게 뜨거나 안 뜨는 것을 막는다)
const coarse = {
  ...out,
  regions: out.regions.map((r, i) => ({ ...r, polys: regions[i].rings
    .filter(ring => Math.abs(ringArea(ring)) >= 0.00002 || ring === regions[i].rings[0])
    .map(ring => simplify(ring, 0.0012).map(([x, y]) => [+x.toFixed(4), +y.toFixed(4)])) })),
};
const cpts = coarse.regions.reduce((s, r) => s + r.polys.reduce((t, p) => t + p.length, 0), 0);
const cjs = '// 대한민국 시·군·구 — 가벼운 판 (tools/build_sgg.mjs 로 생성, 직접 고치지 말 것) — 지역 ' + coarse.regions.length + '개, 꼭짓점 ' + cpts + '개, 뱃길 ' + sea.length + '개\n'
  + '// 정밀한 꼭짓점은 sgg_detail.js 에 따로 있고, 화면이 뜬 뒤 배경에서 받아 갈아 끼운다\n'
  + 'export default ' + JSON.stringify(coarse) + ';\n';
writeFileSync('src/maps/sgg.js', cjs);
const djs = '// 대한민국 시·군·구 — 정밀 다각형만 (tools/build_sgg.mjs 로 생성) — 꼭짓점 ' + pts + '개\n'
  + 'export default ' + JSON.stringify(out.regions.map(r => r.polys)) + ';\n';
writeFileSync('src/maps/sgg_detail.js', djs);
console.log('regions', out.regions.length, '· 가벼운 판', cpts, '점', (cjs.length / 1024).toFixed(0) + 'KB', '· 정밀본', pts, '점', (djs.length / 1024).toFixed(0) + 'KB', '· height', out.height);
console.log('types', out.regions.reduce((m, r) => (m[r.t] = (m[r.t] || 0) + 1, m), {}));
console.log('sea links', sea.map(([a, b]) => `${regions[a].label}→${regions[b].label}`).join(', '));
console.log('avg adj', (adj.reduce((s, a) => s + a.length, 0) / adj.length).toFixed(2), 'max', Math.max(...adj.map(a => a.length)));
// 연결성 확인
const seen = new Set([0]); const q = [0]; while (q.length) { const i = q.pop(); for (const j of adj[i]) if (!seen.has(j)) { seen.add(j); q.push(j); } }
console.log('connected', seen.size === regions.length ? 'yes' : `NO (${seen.size}/${regions.length})`);
