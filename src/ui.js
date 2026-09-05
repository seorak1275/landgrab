import { TERRAIN, PLAYER, NEUTRAL } from './world.js';
import { cap, goldRate, soldierRate, upgradeCost, MAX_LEVEL } from './sim.js';
import { ownerColor } from './render.js';

export function formatNum(n) {
  n = Math.floor(n);
  if (n < 10000) return n.toLocaleString('en-US');
  if (n < 1e6) return (n / 1e3).toPrecision(3).replace(/\.?0+$/, '') + 'K';
  return (n / 1e6).toPrecision(3).replace(/\.?0+$/, '') + 'M';
}
const $ = id => document.getElementById(id);
export function ownerName(owner) { return owner === NEUTRAL ? '중립' : owner === PLAYER ? '나' : `AI ${owner}`; }

export function updateTop(state, rate) {
  $('top-gold').textContent = `💰 ${formatNum(state.run.gold[PLAYER])}`;
  $('top-rate').textContent = `+${rate.toFixed(1)}/초`;
  $('top-prestige').textContent = `환생 ${state.legacy.prestigeCount}`;
  $('top-points').textContent = `✨ ${state.legacy.points}`;
}

export function updatePanel(state, tile) {
  const title = $('p-title'), stats = $('p-stats'), btn = $('btn-upgrade');
  if (!tile) { title.textContent = '타일을 탭하세요'; stats.textContent = ''; btn.disabled = true; btn.textContent = '업그레이드'; return; }
  const tr = TERRAIN[tile.terrain];
  title.innerHTML = `<span style="color:${ownerColor(tile.owner)}">■</span> ${tr.name} · ${ownerName(tile.owner)} · Lv.${tile.level}`;
  const mine = tile.owner === PLAYER;
  const lines = [`병사 ${Math.floor(tile.soldiers)} / ${Math.floor(cap(tile))}`, `방어 +${Math.round(tr.def * 100)}%`];
  if (mine) lines.push(`생산 골드 ${goldRate(state, tile).toFixed(2)}/초 · 병사 ${soldierRate(state, tile).toFixed(2)}/초`);
  stats.textContent = lines.join('\n');
  if (mine && tile.level < MAX_LEVEL) {
    const cost = upgradeCost(tile);
    btn.disabled = state.run.gold[PLAYER] < cost;
    btn.textContent = `업그레이드 Lv.${tile.level + 1} (💰 ${formatNum(cost)})`;
  } else { btn.disabled = true; btn.textContent = mine ? '최대 레벨' : '업그레이드'; }
}

export function setRatioButtons(ratio) {
  document.querySelectorAll('.ratio-btn').forEach(b => b.classList.toggle('active', Number(b.dataset.r) === ratio));
}

export function bindButtons({ onUpgrade, onRatio, onMenu }) {
  $('btn-upgrade').addEventListener('click', onUpgrade);
  document.querySelectorAll('.ratio-btn').forEach(b => b.addEventListener('click', () => onRatio(Number(b.dataset.r))));
  $('btn-menu').addEventListener('click', onMenu);
}

export function showModal({ title, html, actions = [], onBodyClick = null }) {
  $('modal-title').textContent = title;
  $('modal-body').innerHTML = html;
  const box = $('modal-actions'); box.innerHTML = '';
  for (const a of actions) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = a.label;
    if (a.primary) b.className = 'primary';
    b.addEventListener('click', () => a.onClick && a.onClick());
    box.appendChild(b);
  }
  $('modal-body').onclick = e => { const el = e.target.closest('[data-action]'); if (el && onBodyClick) onBodyClick(el.dataset.action, el); };
  $('modal').hidden = false;
}
export function hideModal() { $('modal').hidden = true; }
export function isModalOpen() { return !$('modal').hidden; }

export function attachCanvasInput(canvas, cam, { onTap, onChange, minScale = 0.4, maxScale = 2.5 }) {
  const pointers = new Map();
  let start = null, moved = 0, pinchDist = 0;
  const pos = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, pos(e));
    if (pointers.size === 1) { start = { p: pos(e), t: performance.now() }; moved = 0; }
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinchDist = Math.hypot(a[0] - b[0], a[1] - b[1]); }
  });
  canvas.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId), cur = pos(e);
    pointers.set(e.pointerId, cur);
    if (pointers.size === 1) {
      cam.x -= (cur[0] - prev[0]) / cam.scale; cam.y -= (cur[1] - prev[1]) / cam.scale;
      moved += Math.hypot(cur[0] - prev[0], cur[1] - prev[1]);
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinchDist > 0) cam.scale = Math.min(maxScale, Math.max(minScale, cam.scale * (d / pinchDist)));
      pinchDist = d; moved += 100;
    }
    onChange && onChange();
  });
  const end = e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pointers.size === 0 && start && moved < 8 && performance.now() - start.t < 400) onTap(start.p[0], start.p[1]);
    if (pointers.size === 0) start = null;
    pinchDist = 0;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('wheel', e => { e.preventDefault(); cam.scale = Math.min(maxScale, Math.max(minScale, cam.scale * (e.deltaY < 0 ? 1.1 : 0.9))); onChange && onChange(); }, { passive: false });
}
