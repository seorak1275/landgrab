// 실제 행정구역 GeoJSON → 게임용 지도 데이터(src/maps/*.js) 생성
// 사용: node tools/build_maps.mjs   (원본은 처음 한 번 내려받아 tools/geo/ 에 둔다)
// 원본: southkorea/southkorea-maps (통계청 2013, 공유·변형 자유), southkorea/seoul-maps (Apache 2.0)
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const SRC = {
  korea: 'https://raw.githubusercontent.com/southkorea/southkorea-maps/master/kostat/2013/json/skorea_provinces_geo_simple.json',
  seoul: 'https://raw.githubusercontent.com/southkorea/seoul-maps/master/kostat/2013/json/seoul_municipalities_geo_simple.json',
};
const SHORT = { 서울특별시: '서울', 부산광역시: '부산', 대구광역시: '대구', 인천광역시: '인천', 광주광역시: '광주', 대전광역시: '대전', 울산광역시: '울산', 세종특별자치시: '세종', 경기도: '경기', 강원도: '강원', 충청북도: '충북', 충청남도: '충남', 전라북도: '전북', 전라남도: '전남', 경상북도: '경북', 경상남도: '경남', 제주특별자치도: '제주' };
// 지역별 지형 가중치(없으면 기본 40/30/20/10). 산악 지형은 실제 지리를 따라 대강 배정
const MT = { plain: 5, forest: 20, hill: 30, mountain: 45 }, HILLY = { plain: 20, forest: 25, hill: 30, mountain: 25 };
const FLAT = { plain: 55, forest: 25, hill: 15, mountain: 5 }, MIXED = { plain: 30, forest: 30, hill: 25, mountain: 15 };
const TERRAIN = {
  korea: { 강원: MT, 경북: HILLY, 충북: HILLY, 경남: MIXED, 제주: HILLY, 전북: FLAT, 충남: FLAT, 경기: FLAT, 전남: { plain: 45, forest: 30, hill: 20, mountain: 5 } },
  // 서울은 도시라 산악 배정을 약하게 (강북·도봉을 MT로 두면 산(방어 +100%)이 몰려 탐욕 스크립트가 2시간에 정복 못 하는 시드가 있었음)
  seoul: { 은평구: MIXED, 종로구: MIXED, 성북구: MIXED, 강북구: HILLY, 도봉구: HILLY, 노원구: MIXED, 관악구: MIXED, 서초구: MIXED },
};
const CONFIG = {
  korea: { name: '대한민국', home: [128.4657, 38.1194], homeName: '설악산', minArea: 0.001, tol: 0.004, maxLon: 130 }, // 면적 0.001(≈235km²) 미만 섬 제외, 울릉도·독도는 격자에 안 잡혀 제외
  seoul: { name: '서울특별시', home: [126.8495, 37.5509], homeName: '강서구', minArea: 0, tol: 0.003, maxLon: 999 },
};

async function fetchGeo(key) {
  mkdirSync('tools/geo', { recursive: true });
  const f = `tools/geo/${key}.json`;
  if (!existsSync(f)) writeFileSync(f, await (await fetch(SRC[key])).text());
  return JSON.parse(readFileSync(f, 'utf8'));
}
function ringArea(r) { let a = 0; for (let i = 0; i < r.length; i++) { const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % r.length]; a += x1 * y2 - x2 * y1; } return Math.abs(a) / 2; }
function simplify(pts, tol) { // Douglas–Peucker
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

for (const key of Object.keys(SRC)) {
  const cfg = CONFIG[key];
  const geo = await fetchGeo(key);
  // 투영: 경도는 위도 중간값의 cos로 줄여 실제 비율에 가깝게, 위도는 위로 갈수록 y가 작아지게
  let lons = [], lats = [];
  for (const ft of geo.features) for (const pg of (ft.geometry.type === 'Polygon' ? [ft.geometry.coordinates] : ft.geometry.coordinates)) for (const [x, y] of pg[0]) if (x <= cfg.maxLon) { lons.push(x); lats.push(y); }
  const lon0 = Math.min(...lons), lon1 = Math.max(...lons), lat0 = Math.min(...lats), lat1 = Math.max(...lats);
  const k = Math.cos((lat0 + lat1) / 2 * Math.PI / 180);
  const W = (lon1 - lon0) * k, Hh = (lat1 - lat0) / W;
  const proj = ([x, y]) => [(x - lon0) * k / W, (lat1 - y) / W];
  const regions = [];
  for (const ft of geo.features) {
    const full = ft.properties.name, name = SHORT[full] || full;
    const rings = (ft.geometry.type === 'Polygon' ? [ft.geometry.coordinates] : ft.geometry.coordinates).map(pg => pg[0]) // 바깥 고리만(구멍은 다른 지역이라 작은 지역부터 판정)
      .filter(r => r.every(([x]) => x <= cfg.maxLon)).map(r => r.map(proj));
    const areas = rings.map(ringArea), maxA = Math.max(...areas);
    const polys = rings.filter((r, i) => areas[i] === maxA || areas[i] >= cfg.minArea).map(r => simplify(r, cfg.tol).map(([x, y]) => [+x.toFixed(4), +y.toFixed(4)]));
    regions.push({ name, full, area: areas.reduce((s, a) => s + a, 0), polys, terrain: (TERRAIN[key] || {})[name] });
  }
  regions.sort((a, b) => a.area - b.area); // 작은 지역부터: 도(道) 안의 광역시가 먼저 잡히게
  const out = { key, name: cfg.name, width: 1, height: +Hh.toFixed(4), home: proj(cfg.home).map(v => +v.toFixed(4)), homeName: cfg.homeName,
    regions: regions.map(r => ({ name: r.name, polys: r.polys, ...(r.terrain ? { terrain: r.terrain } : {}) })) };
  const pts = out.regions.reduce((s, r) => s + r.polys.reduce((t, p) => t + p.length, 0), 0);
  const js = `// ${cfg.name} 행정구역 (tools/build_maps.mjs 로 생성, 직접 고치지 말 것) — 지역 ${out.regions.length}개, 꼭짓점 ${pts}개\nexport default ${JSON.stringify(out)};\n`;
  mkdirSync('src/maps', { recursive: true });
  writeFileSync(`src/maps/${key}.js`, js);
  console.log(key, out.regions.length, '지역', pts, '점', 'height', out.height, 'home', out.home, `${(js.length / 1024).toFixed(1)}KB`);
  console.log('  ', out.regions.map(r => `${r.name}(${r.polys.length})`).join(' '));
}
