import { hexToPixel, hexCorners, pixelToHex } from './hex.js';
import { NEUTRAL } from './world.js';

export const HEX_SIZE = 36;
export const FACTION_COLORS = ['#2f80ed', '#eb5757', '#f2c94c', '#9b51e0', '#27ae60'];
export const NEUTRAL_COLOR = '#777';
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

export function draw(ctx, state, cam, W, H, { selectedId = null, effects = [], images = {} } = {}) {
  const run = state.run;
  const size = HEX_SIZE * cam.scale;
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
    ctx.lineWidth = t.owner === NEUTRAL ? 1 : Math.max(2, size * 0.12);
    ctx.strokeStyle = ownerColor(t.owner); ctx.stroke();
    if (t.id === selectedId) { ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke(); }
    if (size >= 14) {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
      ctx.font = `bold ${Math.round(size * 0.5)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const label = String(Math.floor(t.soldiers));
      ctx.strokeText(label, cx, cy + size * 0.05); ctx.fillText(label, cx, cy + size * 0.05);
      if (t.owner !== NEUTRAL) {
        ctx.fillStyle = '#fff';
        for (let i = 0; i < t.level; i++) {
          const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
          ctx.beginPath(); ctx.arc(cx + Math.cos(a) * size * 0.62, cy + Math.sin(a) * size * 0.62, size * 0.06, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
  }
  for (const e of effects) {
    const a = run.tiles[e.fromId], b = run.tiles[e.toId];
    if (!a || !b) continue;
    const [ax, ay] = worldToScreen(cam, W, H, ...hexToPixel(a.q, a.r, HEX_SIZE));
    const [bx, by] = worldToScreen(cam, W, H, ...hexToPixel(b.q, b.r, HEX_SIZE));
    ctx.beginPath(); ctx.arc(ax + (bx - ax) * e.t, ay + (by - ay) * e.t, size * 0.2, 0, Math.PI * 2);
    ctx.fillStyle = e.color; ctx.fill();
  }
}
