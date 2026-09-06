import { hexToPixel, hexCorners, pixelToHex } from './hex.js';
import { NEUTRAL } from './world.js';

export const HEX_SIZE = 36;
export const FACTION_COLORS = ['#2f80ed', '#eb5757', '#f2c94c', '#9b51e0', '#27ae60'];
export const NEUTRAL_COLOR = '#777';
const MARK_FILL = { win: 'rgba(111,227,143,0.35)', lose: 'rgba(255,123,123,0.3)', move: 'rgba(47,128,237,0.3)' };
const TERRAIN_FILL = { plain: '#a8d08d', forest: '#5b8c5a', hill: '#c9a66b', mountain: '#8c8c8c', citadel: '#d9b382' };
// 에셋 작업에서 실제 파일명으로 채움. 파일이 없으면 단색 육각형으로 그린다.
export const ASSET_FILES = { plain: 'plain.png', forest: 'forest.png', hill: 'hill.png', mountain: 'mountain.png', citadel: 'citadel.png' };

export function createCamera() { return { x: 0, y: 0, scale: 1 }; }
export function worldToScreen(cam, W, H, wx, wy) { return [(wx - cam.x) * cam.scale + W / 2, (wy - cam.y) * cam.scale + H / 2]; }
export function screenToWorld(cam, W, H, sx, sy) { return [(sx - W / 2) / cam.scale + cam.x, (sy - H / 2) / cam.scale + cam.y]; }
export function pickTile(run, cam, W, H, sx, sy) {
  const [wx, wy] = screenToWorld(cam, W, H, sx, sy);
  const [q, r] = pixelToHex(wx, wy, HEX_SIZE);
  return run.tiles.find(t => t.q === q && t.r === r) || null;
}
export function ownerColor(owner) { return owner === NEUTRAL ? NEUTRAL_COLOR : FACTION_COLORS[owner % FACTION_COLORS.length]; }

export function loadAssets(base = 'assets/') {
  const images = {};
  return Promise.all(Object.entries(ASSET_FILES).map(([k, f]) => new Promise(res => {
    const im = new Image();
    im.onload = () => { images[k] = im; res(); };
    im.onerror = () => res();
    im.src = base + f;
  }))).then(() => images);
}

export function draw(ctx, state, cam, W, H, { selectedIds = [], inspectId = null, effects = [], images = {}, marks = {} } = {}) {
  const run = state.run;
  const size = HEX_SIZE * cam.scale;
  const pop = {}; // 타일 id → 숫자 확대 배율 (병사 수가 바뀐 직후 튀었다가 돌아온다)
  for (const e of effects) if (e.kind === 'pop') pop[e.toId] = Math.max(pop[e.toId] || 1, 1 + 0.45 * (1 - e.t));
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#1b2430'; ctx.fillRect(0, 0, W, H);
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
    const mark = marks[t.id];
    if (mark) { ctx.fillStyle = MARK_FILL[mark]; ctx.fill(); }
    ctx.lineWidth = t.owner === NEUTRAL ? 1 : Math.max(2, size * 0.12);
    ctx.strokeStyle = ownerColor(t.owner); ctx.stroke();
    if (selectedIds.includes(t.id) || t.id === inspectId) { ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke(); }
    if (size >= 14) {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
      ctx.font = `bold ${Math.round(size * 0.5 * (pop[t.id] || 1))}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const label = String(Math.floor(t.soldiers));
      ctx.strokeText(label, cx, cy + size * 0.05); ctx.fillText(label, cx, cy + size * 0.05);
      if (t.battle && size >= 20) {
        // 전투 중: 공격 세력 색으로 ⚔공격병 수, 테두리는 깜빡임
        ctx.font = `bold ${Math.round(size * 0.32)}px system-ui, sans-serif`;
        ctx.fillStyle = ownerColor(t.battle.attacker); ctx.lineWidth = 3;
        const bl = `⚔${Math.floor(t.battle.attackers)}`;
        ctx.strokeText(bl, cx, cy - size * 0.42); ctx.fillText(bl, cx, cy - size * 0.42);
        ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(Date.now() / 120); ctx.strokeStyle = ownerColor(t.battle.attacker); ctx.lineWidth = Math.max(2, size * 0.12); ctx.stroke(); ctx.globalAlpha = 1;
        ctx.fillStyle = '#fff';
      }
      if (t.owner !== NEUTRAL && size >= 20) {
        // 레벨은 아래쪽에 작은 글자로 (점 표시는 작아서 안 보였음)
        ctx.font = `bold ${Math.round(size * 0.28)}px system-ui, sans-serif`;
        ctx.lineWidth = 2;
        const lv = `Lv${t.level}`;
        ctx.strokeText(lv, cx, cy + size * 0.55); ctx.fillText(lv, cx, cy + size * 0.55);
      }
      if (mark && mark !== 'move' && !t.battle) {
        // 공격 미리보기: 위쪽에 ✓(이김) / ✕(짐)
        ctx.font = `bold ${Math.round(size * 0.4)}px system-ui, sans-serif`;
        ctx.fillStyle = mark === 'win' ? '#6fe38f' : '#ff7b7b';
        ctx.lineWidth = 3;
        const sym = mark === 'win' ? '✓' : '✕';
        ctx.strokeText(sym, cx, cy - size * 0.5); ctx.fillText(sym, cx, cy - size * 0.5);
      }
    }
  }
  for (const e of effects) {
    const a = run.tiles[e.fromId], b = run.tiles[e.toId];
    if (!b) continue;
    if (e.kind === 'pop') continue;
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
