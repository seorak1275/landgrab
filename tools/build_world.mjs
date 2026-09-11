// 세계 지도 → 사단전 지도 데이터(src/maps/world.js)
// 나라가 칸. 인접은 국경(꼭짓점이 가까운 나라끼리), 섬은 가장 가까운 나라와 뱃길.
// 원본: Natural Earth 110m admin-0 (public domain) — 한글 이름(NAME_KO)과 대륙(CONTINENT)이 들어 있다
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const SRC = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson';
const SRC_FILE = 'tools/geo/world.json';
const SKIP = new Set(['Antarctica', 'Seven seas (open ocean)']); // 대륙 자체를 뺀다
const CONT_KO = { Asia: '아시아', Europe: '유럽', Africa: '아프리카', 'North America': '북아메리카', 'South America': '남아메리카', Oceania: '오세아니아' };
const TOL = 0.12; // 단순화 허용오차(도). 세계 지도는 나라가 크니 굵어도 된다
const NEAR = 0.6;  // 이 거리(도) 안에 꼭짓점이 있으면 국경을 맞댄 것으로 본다

async function fetchGeo() {
  mkdirSync('tools/geo', { recursive: true });
  if (!existsSync(SRC_FILE)) writeFileSync(SRC_FILE, await (await fetch(SRC)).text());
  return JSON.parse(readFileSync(SRC_FILE, 'utf8'));
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
// 1. 나라 추리기 (남극·공해 제외, 조각은 큰 것부터 몇 개만)
const raw = [];
for (const f of geo.features) {
  const p = f.properties;
  if (SKIP.has(p.CONTINENT) || SKIP.has(p.NAME)) continue;
  const polys = (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).map(pg => pg[0]);
  polys.sort((a, b) => Math.abs(ringArea(b)) - Math.abs(ringArea(a)));
  const big = polys.filter((ring, i) => i === 0 || Math.abs(ringArea(ring)) >= 1.2).slice(0, 6); // 큰 섬만 남긴다
  if (!big.length) continue;
  raw.push({ name: p.NAME_KO || p.NAME, en: p.NAME, cont: CONT_KO[p.CONTINENT] || p.CONTINENT, pop: p.POP_EST || 0, gdp: p.GDP_MD || 0, rings: big });
}
// 태평양을 가로지르지 않게: 경도 -180~180 그대로 두되, 러시아처럼 날짜변경선을 넘는 조각은 버린다
for (const c of raw) c.rings = c.rings.filter(ring => { let mn = 180, mx = -180; for (const [x] of ring) { mn = Math.min(mn, x); mx = Math.max(mx, x); } return mx - mn < 180; });
const list = raw.filter(c => c.rings.length);

// 2. 투영: 경도는 그대로, 위도는 cos 보정 없이 (세계지도는 평평한 정거원통이 익숙하다). 폭 1로 맞춘다
let lon0 = Infinity, lon1 = -Infinity, lat0 = Infinity, lat1 = -Infinity;
for (const c of list) for (const ring of c.rings) for (const [x, y] of ring) { if (x < lon0) lon0 = x; if (x > lon1) lon1 = x; if (y < lat0) lat0 = y; if (y > lat1) lat1 = y; }
const W = lon1 - lon0, H = (lat1 - lat0) / W;
const proj = ([x, y]) => [(x - lon0) / W, (lat1 - y) / W];

const regions = list.map(c => {
  const rings = c.rings.map(r => r.map(proj));
  const area = rings.reduce((s, r) => s + Math.abs(ringArea(r)), 0);
  let cx = 0, cy = 0, n = 0;
  for (const [x, y] of rings[0]) { cx += x; cy += y; n++; }
  return { ...c, rings, area, c: [+(cx / n).toFixed(4), +(cy / n).toFixed(4)] };
});

// 3. 인접: 꼭짓점이 NEAR(도) 안에 있으면 국경을 맞댄 것. 격자로 후보를 줄인다
const cell = NEAR / W; // 투영 좌표 기준
const grid = new Map();
regions.forEach((r, i) => { for (const ring of r.rings) for (const [x, y] of ring) { const k = `${Math.floor(x / cell)},${Math.floor(y / cell)}`; if (!grid.has(k)) grid.set(k, new Set()); grid.get(k).add(i); } });
const adj = regions.map(() => new Set());
const near2 = (NEAR / W) ** 2;
const cand = new Set();
for (const [k, set] of grid) {
  const [gx, gy] = k.split(',').map(Number);
  const around = new Set();
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const s = grid.get(`${gx + dx},${gy + dy}`); if (s) for (const i of s) around.add(i); }
  for (const a of set) for (const b of around) if (a < b) cand.add(`${a},${b}`);
}
for (const key of cand) {
  const [a, b] = key.split(',').map(Number);
  let hit = 0;
  outer: for (const ra of regions[a].rings) for (const [x1, y1] of ra) for (const rb of regions[b].rings) for (const [x2, y2] of rb) {
    const d = (x1 - x2) ** 2 + (y1 - y2) ** 2;
    if (d <= near2) { hit++; if (hit >= 2) break outer; }
  }
  if (hit >= 2) { adj[a].add(b); adj[b].add(a); }
}
// 4. 섬(이웃 없음)은 가장 가까운 나라와 뱃길
const sea = [];
const centerDist = (a, b) => (regions[a].c[0] - regions[b].c[0]) ** 2 + (regions[a].c[1] - regions[b].c[1]) ** 2;
regions.forEach((r, i) => {
  if (adj[i].size) return;
  const pick = same => { // 같은 대륙에서 먼저 찾는다 — 대륙만 떼어 노는 판이 쪼개지지 않게
    let best = null;
    for (let j = 0; j < regions.length; j++) {
      if (j === i || (same && regions[j].cont !== r.cont)) continue;
      const d = centerDist(i, j); if (!best || d < best.d) best = { j, d };
    }
    return best;
  };
  const best = pick(true) || pick(false);
  if (best) { adj[i].add(best.j); adj[best.j].add(i); sea.push([i, best.j]); }
});
// 대륙 안에서 아직 끊긴 나라가 있으면 같은 대륙끼리 한 번 더 잇는다
for (const cont of new Set(regions.map(r => r.cont))) {
  const ids = regions.map((r, i) => [r, i]).filter(([r]) => r.cont === cont).map(([, i]) => i);
  if (ids.length < 2) continue;
  for (let guard = 0; guard < 12; guard++) {
    const set = new Set(ids), seen = new Set([ids[0]]), q = [ids[0]];
    for (let k = 0; k < q.length; k++) for (const n of adj[q[k]]) if (set.has(n) && !seen.has(n)) { seen.add(n); q.push(n); }
    const out = ids.filter(i => !seen.has(i));
    if (!out.length) break;
    let best = null;
    for (const i of out) for (const j of seen) { const d = centerDist(i, j); if (!best || d < best.d) best = { i, j, d }; }
    adj[best.i].add(best.j); adj[best.j].add(best.i); sea.push([best.i, best.j]);
  }
}
// 5. 대륙끼리도 이어 둔다 (안 그러면 판이 쪼개진다): 연결 성분마다 가장 가까운 다른 성분과 뱃길
function components() {
  const seen = new Array(regions.length).fill(-1); let c = 0;
  for (let i = 0; i < regions.length; i++) {
    if (seen[i] >= 0) continue;
    const q = [i]; seen[i] = c;
    for (let k = 0; k < q.length; k++) for (const n of adj[q[k]]) if (seen[n] < 0) { seen[n] = c; q.push(n); }
    c++;
  }
  return { seen, count: c };
}
for (let guard = 0; guard < 40; guard++) {
  const { seen, count } = components();
  if (count <= 1) break;
  // 0번 성분과 가장 가까운 다른 성분을 잇는다
  let best = null;
  for (let i = 0; i < regions.length; i++) for (let j = 0; j < regions.length; j++) {
    if (seen[i] !== 0 || seen[j] === 0) continue;
    const d = centerDist(i, j); if (!best || d < best.d) best = { i, j, d };
  }
  if (!best) break;
  adj[best.i].add(best.j); adj[best.j].add(best.i); sea.push([best.i, best.j]);
}

// 6. 생산력·특성: 경제 규모로 생산, 도시국가·섬·큰 나라로 특성
const gdpPer = r => (r.pop > 0 ? (r.gdp * 1e6) / r.pop : 0);
const areas = regions.map(r => r.area).sort((a, b) => a - b);
const midArea = areas[Math.floor(areas.length / 2)]; // 넓으면 평야, 좁으면 산악(수비 유리)
const out = {
  key: 'world', name: '세계', width: 1, height: +H.toFixed(4),
  regions: regions.map((r, i) => ({
    n: r.name, p: r.cont, t: '나라', c: r.c,
    prod: +(r.gdp >= 2e6 ? 2.5 : r.gdp >= 5e5 ? 2 : r.gdp >= 1e5 ? 1.5 : 1).toFixed(2),
    tr: sea.some(([a, b]) => a === i || b === i) ? 'coast' : gdpPer(r) >= 25000 ? 'city' : r.area >= midArea ? 'plain' : 'mountain',
    adj: [...adj[i]].sort((a, b) => a - b),
    polys: r.rings.map(ring => simplify(ring, TOL / W).map(([x, y]) => [+x.toFixed(5), +y.toFixed(5)])),
  })),
  sea,
};
const pts = out.regions.reduce((s, r) => s + r.polys.reduce((t, p) => t + p.length, 0), 0);
const js = '// 세계 (tools/build_world.mjs 로 생성, 직접 고치지 말 것) — 나라 ' + out.regions.length + '개, 꼭짓점 ' + pts + '개, 뱃길 ' + sea.length + '개\n'
  + 'export default ' + JSON.stringify(out) + ';\n';
writeFileSync('src/maps/world.js', js);
const conts = out.regions.reduce((m, r) => (m[r.p] = (m[r.p] || 0) + 1, m), {});
console.log('나라', out.regions.length, '· 점', pts, `${(js.length / 1024).toFixed(0)}KB`, '· height', out.height);
console.log('대륙별', JSON.stringify(conts));
console.log('평균 이웃', (out.regions.reduce((s, r) => s + r.adj.length, 0) / out.regions.length).toFixed(2), '· 뱃길', sea.length);
const d = new Array(out.regions.length).fill(-1); d[0] = 0; const q = [0];
for (let i = 0; i < q.length; i++) for (const n of out.regions[q[i]].adj) if (d[n] < 0) { d[n] = d[q[i]] + 1; q.push(n); }
console.log('전부 이어짐?', d.every(x => x >= 0) ? 'yes' : 'NO (' + d.filter(x => x < 0).length + '곳 고립)');
console.log('한국 이웃:', (out.regions.find(r => r.n === '대한민국') || { adj: [] }).adj.map(i => out.regions[i].n).join(', '));
