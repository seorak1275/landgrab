import { hexToPixel, hexCorners, pixelToHex, DIRS, key } from './hex.js';
import { NEUTRAL } from './world.js';
import { MAPS } from './mapgen.js';
import { regionHolders, battleAttackers, BUILDINGS } from './sim.js';

export const HEX_SIZE = 36;
// 세력 색. 색약 모드는 Okabe–Ito 팔레트(파랑·주황·노랑·분홍·주홍)로 바꾸고 타일에 주인 글자(나/A1/A2…)를 함께 찍는다
const PALETTES = {
  normal: ['#2f80ed', '#eb5757', '#f2c94c', '#9b51e0', '#27ae60'],
  cb:     ['#0072B2', '#E69F00', '#F0E442', '#CC79A7', '#D55E00'],
};
export const FACTION_COLORS = [...PALETTES.normal];
export const NEUTRAL_COLOR = '#777';
const MARK_FILL = { win: 'rgba(111,227,143,0.35)', lose: 'rgba(255,123,123,0.3)', move: 'rgba(47,128,237,0.3)' };
const MARK_TEXT = { win: '#6fe38f', lose: '#ff7b7b' };
let colorblind = false;
export function isColorblind() { return colorblind; }
export function setColorblind(on) {
  colorblind = !!on;
  FACTION_COLORS.splice(0, FACTION_COLORS.length, ...PALETTES[on ? 'cb' : 'normal']);
  MARK_FILL.win = on ? 'rgba(86,180,233,0.45)' : 'rgba(111,227,143,0.35)';
  MARK_FILL.lose = on ? 'rgba(230,159,0,0.45)' : 'rgba(255,123,123,0.3)';
  MARK_TEXT.win = on ? '#56B4E9' : '#6fe38f'; MARK_TEXT.lose = on ? '#E69F00' : '#ff7b7b';
}
export function ownerTag(owner) { return owner === NEUTRAL ? '' : owner === 0 ? '나' : `A${owner}`; }
const TERRAIN_FILL = { plain: '#a8d08d', forest: '#5b8c5a', hill: '#c9a66b', mountain: '#8c8c8c', citadel: '#d9b382', sea: '#2d5f8f' };
// 에셋 작업에서 실제 파일명으로 채움. 파일이 없으면 단색 육각형으로 그린다 (뱃길은 그림 없이 바다색)
export const ASSET_FILES = { plain: 'plain.png', forest: 'forest.png', hill: 'hill.png', mountain: 'mountain.png', citadel: 'citadel.png' };
// 육각 변 i(꼭짓점 i→i+1, -30°부터 시계 방향)와 맞닿는 이웃의 DIRS 번호: 동, 남동, 남서, 서, 북서, 북동
const EDGE_DIR = [0, 5, 4, 3, 2, 1];

export function createCamera() { return { x: 0, y: 0, scale: 1 }; }
export function worldToScreen(cam, W, H, wx, wy) { return [(wx - cam.x) * cam.scale + W / 2, (wy - cam.y) * cam.scale + H / 2]; }
export function screenToWorld(cam, W, H, sx, sy) { return [(sx - W / 2) / cam.scale + cam.x, (sy - H / 2) / cam.scale + cam.y]; }
export function pickTile(run, cam, W, H, sx, sy) {
  const [wx, wy] = screenToWorld(cam, W, H, sx, sy);
  const [q, r] = pixelToHex(wx, wy, HEX_SIZE);
  return run.tiles.find(t => t.q === q && t.r === r) || null;
}
export function ownerColor(owner) { return owner === NEUTRAL ? NEUTRAL_COLOR : FACTION_COLORS[owner % FACTION_COLORS.length]; }
// 타일 전체의 월드 픽셀 경계 [minX, minY, maxX, maxY] (지도 전체 보기용)
export function worldBounds(run) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const t of run.tiles) { const [x, y] = hexToPixel(t.q, t.r, HEX_SIZE); b[0] = Math.min(b[0], x - HEX_SIZE); b[1] = Math.min(b[1], y - HEX_SIZE); b[2] = Math.max(b[2], x + HEX_SIZE); b[3] = Math.max(b[3], y + HEX_SIZE); }
  return b;
}

export function loadAssets(base = 'assets/') {
  const images = {};
  return Promise.all(Object.entries(ASSET_FILES).map(([k, f]) => new Promise(res => {
    const im = new Image();
    im.onload = () => { images[k] = im; res(); };
    im.onerror = () => res();
    im.src = base + f;
  }))).then(() => images);
}

// 판마다 한 번: 타일 색인, 지역별 이름표 놓을 타일(지역 타일들의 무게중심에 가장 가까운 타일)
const layoutCache = new WeakMap();
function layoutOf(run) {
  let l = layoutCache.get(run.tiles);
  if (l) return l;
  const index = new Map(run.tiles.map(t => [key(t.q, t.r), t]));
  const labels = [];
  if (run.regions) {
    const groups = new Map();
    for (const t of run.tiles) if (t.region >= 0) (groups.get(t.region) || groups.set(t.region, []).get(t.region)).push(t);
    for (const [region, ts] of groups) {
      let cx = 0, cy = 0; for (const t of ts) { const [x, y] = hexToPixel(t.q, t.r, HEX_SIZE); cx += x / ts.length; cy += y / ts.length; }
      const at = ts.reduce((a, b) => { const [ax, ay] = hexToPixel(a.q, a.r, HEX_SIZE), [bx, by] = hexToPixel(b.q, b.r, HEX_SIZE); return (bx - cx) ** 2 + (by - cy) ** 2 < (ax - cx) ** 2 + (ay - cy) ** 2 ? b : a; });
      labels.push({ region, name: run.regions[region], tileId: at.id, count: ts.length });
    }
  }
  l = { index, labels }; layoutCache.set(run.tiles, l);
  return l;
}

// 실제 지도의 행정구역 윤곽을 육각 밑에 깔아 지도 모양이 드러나게
function drawOutline(ctx, run, cam, W, H) {
  const map = MAPS[run.map];
  if (!map || !map.regions || !run.cell) return;
  const k = HEX_SIZE / run.cell; // 지도 단위 → 월드 픽셀
  ctx.beginPath();
  for (const r of map.regions) for (const p of r.polys) {
    p.forEach(([x, y], i) => { const [sx, sy] = worldToScreen(cam, W, H, (x - map.width / 2) * k, (y - map.height / 2) * k); i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); });
    ctx.closePath();
  }
  ctx.fillStyle = '#2a3846'; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 1; ctx.stroke();
}

export function draw(ctx, state, cam, W, H, { selectedIds = [], inspectId = null, effects = [], images = {}, marks = {} } = {}) {
  const run = state.run;
  const size = HEX_SIZE * cam.scale;
  const pop = {}; // 타일 id → 숫자 확대 배율 (병사 수가 바뀐 직후 튀었다가 돌아온다)
  for (const e of effects) if (e.kind === 'pop') pop[e.toId] = Math.max(pop[e.toId] || 1, 1 + 0.45 * (1 - e.t));
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = run.regions ? '#17242f' : '#1b2430'; ctx.fillRect(0, 0, W, H);
  drawOutline(ctx, run, cam, W, H);
  const { index, labels } = layoutOf(run);
  const holders = run.regions ? regionHolders(run) : null;
  const edges = []; // 지역 경계 선분 (육각을 다 그린 뒤 위에 얹는다)
  for (const t of run.tiles) {
    const [wx, wy] = hexToPixel(t.q, t.r, HEX_SIZE);
    const [cx, cy] = worldToScreen(cam, W, H, wx, wy);
    if (cx < -size || cy < -size || cx > W + size || cy > H + size) continue;
    const pts = hexCorners(cx, cy, size - 1.5);
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
    const img = images[t.terrain];
    if (img) {
      // Kenney 타일: 이미지 폭 = 육각 폭(√3·size), 높이는 원본 비율(120×140)
      const iw = Math.sqrt(3) * size, ih = iw * (img.naturalHeight || 140) / (img.naturalWidth || 120);
      ctx.save(); ctx.clip();
      ctx.drawImage(img, cx - iw / 2, cy - ih / 2, iw, ih);
      ctx.restore();
    } else { ctx.fillStyle = TERRAIN_FILL[t.terrain]; ctx.fill(); }
    if (t.terrain === 'sea' && size >= 14) { // 뱃길: 물결 두 줄
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = Math.max(1, size * 0.05);
      for (const dy of [-0.32, 0.36]) { ctx.beginPath(); for (let i = 0; i <= 8; i++) { const x = cx - size * 0.5 + size * i / 8, y = cy + size * dy + Math.sin(i * Math.PI / 2) * size * 0.06; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke(); }
      ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
    }
    const mark = marks[t.id];
    if (mark) { ctx.fillStyle = MARK_FILL[mark]; ctx.fill(); }
    ctx.lineWidth = t.owner === NEUTRAL ? 1 : Math.max(2, size * 0.12);
    ctx.strokeStyle = ownerColor(t.owner); ctx.stroke();
    if (selectedIds.includes(t.id) || t.id === inspectId) { ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke(); }
    if (run.regions && t.region >= 0) {
      const full = hexCorners(cx, cy, size);
      for (let i = 0; i < 6; i++) {
        const [dq, dr] = DIRS[EDGE_DIR[i]], n = index.get(key(t.q + dq, t.r + dr));
        if (!n || n.region !== t.region) edges.push([full[i], full[(i + 1) % 6]]);
      }
    }
    if (size >= 14) {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
      ctx.font = `bold ${Math.round(size * 0.5 * (pop[t.id] || 1))}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const label = String(Math.floor(t.soldiers));
      ctx.strokeText(label, cx, cy + size * 0.05); ctx.fillText(label, cx, cy + size * 0.05);
      if (t.battle && t.battle.parties.length && size >= 20) {
        // 전투 중: 가장 센 공격 편 색으로 ⚔공격병 합계(여러 편이면 '난전'), 테두리는 깜빡임
        const lead = t.battle.parties.reduce((a, b) => (b.soldiers * b.am > a.soldiers * a.am ? b : a));
        ctx.font = `bold ${Math.round(size * 0.32)}px system-ui, sans-serif`;
        ctx.fillStyle = ownerColor(lead.owner); ctx.lineWidth = 3;
        const bl = `⚔${Math.floor(battleAttackers(t))}${t.battle.parties.length > 1 ? '난전' : ''}`;
        ctx.strokeText(bl, cx, cy - size * 0.42); ctx.fillText(bl, cx, cy - size * 0.42);
        ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(Date.now() / 120); ctx.strokeStyle = ownerColor(lead.owner); ctx.lineWidth = Math.max(2, size * 0.12); ctx.stroke(); ctx.globalAlpha = 1;
        ctx.fillStyle = '#fff';
      }
      if (t.owner !== NEUTRAL && size >= 20) {
        // 레벨은 아래쪽에 작은 글자로 (점 표시는 작아서 안 보였음)
        ctx.font = `bold ${Math.round(size * 0.28)}px system-ui, sans-serif`;
        ctx.lineWidth = 2;
        const lv = `Lv${t.level}`;
        ctx.strokeText(lv, cx, cy + size * 0.55); ctx.fillText(lv, cx, cy + size * 0.55);
        if (t.build && BUILDINGS[t.build]) { // 특화 건물 아이콘: 왼쪽 아래
          ctx.font = `${Math.round(size * 0.3)}px system-ui, sans-serif`;
          ctx.fillText(BUILDINGS[t.build].icon, cx - size * 0.55, cy + size * 0.55);
        }
        if (colorblind) { // 색약 모드: 오른쪽 아래에 주인 글자
          ctx.font = `bold ${Math.round(size * 0.26)}px system-ui, sans-serif`; ctx.lineWidth = 3;
          ctx.fillStyle = ownerColor(t.owner);
          ctx.strokeText(ownerTag(t.owner), cx + size * 0.55, cy + size * 0.55); ctx.fillText(ownerTag(t.owner), cx + size * 0.55, cy + size * 0.55);
          ctx.fillStyle = '#fff';
        }
      }
      if (mark && mark !== 'move' && !t.battle) {
        // 공격 미리보기: 위쪽에 ✓(이김) / ✕(짐)
        ctx.font = `bold ${Math.round(size * 0.4)}px system-ui, sans-serif`;
        ctx.fillStyle = MARK_TEXT[mark];
        ctx.lineWidth = 3;
        const sym = mark === 'win' ? '✓' : '✕';
        ctx.strokeText(sym, cx, cy - size * 0.5); ctx.fillText(sym, cx, cy - size * 0.5);
      }
    }
  }
  if (edges.length) {
    // 지역(구·시도) 경계: 소유자 테두리 위에 밝은 실선
    ctx.beginPath(); for (const [a, b] of edges) { ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = Math.max(1.5, size * 0.06); ctx.lineCap = 'round'; ctx.stroke();
  }
  if (size >= 22) {
    // 지역 이름표: 지역 가운데 타일 위쪽. 한 세력이 다 가졌으면 그 색으로 ★
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    const fs = Math.round(size * 0.24);
    ctx.font = `bold ${fs}px system-ui, sans-serif`;
    for (const l of labels) {
      const t = run.tiles[l.tileId];
      const [cx, cy] = worldToScreen(cam, W, H, ...hexToPixel(t.q, t.r, HEX_SIZE));
      if (cx < -size || cy < -size || cx > W + size || cy > H + size) continue;
      const holder = holders && holders[l.region];
      const held = holder !== null && holder !== undefined && holder !== NEUTRAL;
      const text = held ? `★${l.name}` : l.name, y = cy - size * 0.8;
      const w = ctx.measureText(text).width + fs * 0.6;
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.roundRect(cx - w / 2, y - fs * 0.62, w, fs * 1.24, fs * 0.5); ctx.fill();
      ctx.fillStyle = held ? ownerColor(holder) : '#fff';
      ctx.fillText(text, cx, y);
    }
  }
  // 행군 중인 부대: 경로 위 현재 위치에 주인 색 원과 병사 수
  for (const a of run.armies || []) {
    const k = Math.min(Math.floor(a.pos), a.path.length - 1), u = a.pos - k;
    const p = run.tiles[a.path[k]], n = run.tiles[a.path[Math.min(k + 1, a.path.length - 1)]];
    if (!p || !n) continue;
    const [px, py] = worldToScreen(cam, W, H, ...hexToPixel(p.q, p.r, HEX_SIZE));
    const [nx, ny] = worldToScreen(cam, W, H, ...hexToPixel(n.q, n.r, HEX_SIZE));
    const x = px + (nx - px) * u, y = py + (ny - py) * u;
    if (x < -size || y < -size || x > W + size || y > H + size) continue;
    ctx.beginPath(); ctx.arc(x, y, size * 0.24, 0, Math.PI * 2);
    ctx.fillStyle = ownerColor(a.owner); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, size * 0.04); ctx.stroke();
    if (size >= 14) {
      ctx.font = `bold ${Math.round(size * 0.26)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 2;
      const s = String(Math.floor(a.soldiers)); ctx.strokeText(s, x, y); ctx.fillText(s, x, y);
    }
  }
  for (const e of effects) {
    const a = run.tiles[e.fromId], b = run.tiles[e.toId];
    if (!b) continue;
    if (e.kind === 'pop') continue;
    if (e.kind === 'burst') {
      // 야전(부딪힘) 연출: 두 타일 사이에서 터지는 고리와 ⚔
      if (!a) continue;
      const [ax, ay] = worldToScreen(cam, W, H, ...hexToPixel(a.q, a.r, HEX_SIZE));
      const [bx, by] = worldToScreen(cam, W, H, ...hexToPixel(b.q, b.r, HEX_SIZE));
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      ctx.beginPath(); ctx.arc(mx, my, size * (0.2 + e.t * 0.8), 0, Math.PI * 2);
      ctx.strokeStyle = e.color; ctx.globalAlpha = 1 - e.t; ctx.lineWidth = Math.max(2, size * 0.12); ctx.stroke();
      if (size >= 14) { ctx.font = `bold ${Math.round(size * 0.5)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText('⚔', mx, my); }
      ctx.globalAlpha = 1;
      continue;
    }
    if (e.kind === 'float') {
      if (size < 14) continue;
      const [bx, by] = worldToScreen(cam, W, H, ...hexToPixel(b.q, b.r, HEX_SIZE));
      ctx.font = `bold ${Math.round(size * 0.36)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.globalAlpha = 1 - e.t * e.t; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.fillStyle = e.color;
      const fy = by - size * (0.35 + e.t * 0.7);
      ctx.strokeText(e.text, bx, fy); ctx.fillText(e.text, bx, fy); ctx.globalAlpha = 1;
      continue;
    }
    if (e.kind === 'ring') {
      const [bx, by] = worldToScreen(cam, W, H, ...hexToPixel(b.q, b.r, HEX_SIZE));
      // 점령 연출: 새 주인 색의 고리가 퍼지며 사라진다
      ctx.beginPath(); ctx.arc(bx, by, size * (0.3 + e.t * 0.7), 0, Math.PI * 2);
      ctx.strokeStyle = e.color; ctx.globalAlpha = 1 - e.t; ctx.lineWidth = Math.max(2, size * 0.1); ctx.stroke(); ctx.globalAlpha = 1;
      continue;
    }
    if (!a) continue;
    // 경로(path: 타일 id 배열)가 있으면 그 길을 따라, 없으면 출발→도착 직선으로 점이 움직인다
    const ids = e.path && e.path.length > 1 ? e.path : [e.fromId, e.toId];
    const f = e.t * (ids.length - 1), k = Math.min(ids.length - 2, Math.floor(f)), u = f - k;
    const p = run.tiles[ids[k]], n = run.tiles[ids[k + 1]];
    if (!p || !n) continue;
    const [px, py] = worldToScreen(cam, W, H, ...hexToPixel(p.q, p.r, HEX_SIZE));
    const [nx, ny] = worldToScreen(cam, W, H, ...hexToPixel(n.q, n.r, HEX_SIZE));
    ctx.beginPath(); ctx.arc(px + (nx - px) * u, py + (ny - py) * u, size * 0.2, 0, Math.PI * 2);
    ctx.fillStyle = e.color; ctx.fill();
  }
}
