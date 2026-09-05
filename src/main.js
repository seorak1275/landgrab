import { PLAYER } from './world.js';
import { tick, send, upgrade, status, isAdjacent, factionGoldRate } from './sim.js';
import { runAi } from './ai.js';
import { simulateOffline } from './offline.js';
import { LEGACY_ITEMS, itemCost, buy, pointsFor, rebirth } from './prestige.js';
import { newState, save, load, serialize, deserialize, SAVE_KEY } from './save.js';
import { createCamera, draw, pickTile, loadAssets, HEX_SIZE, FACTION_COLORS } from './render.js';
import { hexToPixel } from './hex.js';
import { updateTop, updatePanel, setRatioButtons, bindButtons, showModal, hideModal, isModalOpen, attachCanvasInput, formatNum } from './ui.js';

const TICK = 0.25, AUTOSAVE = 5;
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const cam = createCamera();
let state = load() || newState();
let images = {}, selectedId = null, effects = [], acc = 0, saveAcc = 0, last = performance.now(), W = 0, H = 0, ended = false;
window.__game = { get state() { return state; }, cam };

function resize() {
  const dpr = window.devicePixelRatio || 1;
  W = canvas.clientWidth; H = canvas.clientHeight;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
// 지도 전체가 화면에 들어오도록 중심(0,0)에 맞추고 배율을 정한다
function centerOnCapital() {
  const R = state.run.radius;
  const mapW = Math.sqrt(3) * HEX_SIZE * (2 * R + 1), mapH = 1.5 * HEX_SIZE * (2 * R + 1) + HEX_SIZE * 0.5;
  cam.x = 0; cam.y = 0;
  cam.scale = Math.max(0.4, Math.min(2.5, Math.min((W - 16) / mapW, (H - 16) / mapH)));
}
function selected() { return selectedId === null ? null : state.run.tiles[selectedId]; }
function refresh() { updateTop(state, factionGoldRate(state, PLAYER)); updatePanel(state, selected()); }
function hms(sec) { const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60); return h ? `${h}시간 ${m}분` : `${m}분`; }

function onTap(sx, sy) {
  if (isModalOpen()) return;
  const t = pickTile(state.run, cam, W, H, sx, sy);
  if (!t) { selectedId = null; refresh(); return; }
  const s = selected();
  if (s && s.owner === PLAYER && t.id !== s.id && isAdjacent(state.run, s, t)) {
    const r = send(state, s.id, t.id, state.run.sendRatio);
    if (r.type !== 'invalid') effects.push({ fromId: s.id, toId: t.id, t: 0, color: FACTION_COLORS[PLAYER] });
    if (r.type === 'capture') selectedId = t.id;
    refresh(); checkEnd(); return;
  }
  selectedId = t.id; refresh();
}

function openMenu() {
  showModal({
    title: '메뉴',
    html: `<p>유산 포인트 ✨ ${state.legacy.points} · 환생 ${state.legacy.prestigeCount}회</p>
      <p><button data-action="shop">유산 상점</button> <button data-action="export">저장 내보내기</button> <button data-action="import">저장 가져오기</button></p>
      <p><button data-action="reset" style="color:#eb5757">처음부터(전부 삭제)</button></p>`,
    actions: [{ label: '닫기', onClick: hideModal, primary: true }],
    onBodyClick: a => {
      if (a === 'shop') openShop();
      if (a === 'export') showModal({ title: '저장 내보내기', html: `<textarea readonly>${serialize(state)}</textarea><p>전체 선택해서 복사하세요.</p>`, actions: [{ label: '닫기', onClick: hideModal, primary: true }] });
      if (a === 'import') showModal({ title: '저장 가져오기', html: `<textarea id="import-text" placeholder="붙여넣기"></textarea><p id="import-msg"></p>`, actions: [
        { label: '취소', onClick: hideModal },
        { label: '가져오기', primary: true, onClick: () => {
          const s = deserialize(document.getElementById('import-text').value);
          if (!s) { document.getElementById('import-msg').textContent = '형식이 맞지 않습니다.'; return; }
          state = s; selectedId = null; ended = false; centerOnCapital(); save(state); hideModal(); refresh();
        } },
      ] });
      if (a === 'reset') showModal({ title: '정말 삭제할까요?', html: '<p>유산 포인트와 환생 기록까지 전부 사라집니다.</p>', actions: [
        { label: '취소', onClick: hideModal },
        { label: '삭제', onClick: () => { localStorage.removeItem(SAVE_KEY); state = newState(); selectedId = null; ended = false; centerOnCapital(); save(state); hideModal(); refresh(); } },
      ] });
    },
  });
}

function openShop(afterClose = hideModal) {
  const rows = Object.entries(LEGACY_ITEMS).map(([k, it]) => {
    const lv = state.legacy.upgrades[k] || 0, maxed = lv >= it.max, cost = maxed ? null : itemCost(k, lv);
    return `<div class="shop-row"><span class="name">${it.name} <b>Lv.${lv}/${it.max}</b><span class="desc">${it.desc}</span></span>
      <button data-action="buy:${k}" ${maxed || state.legacy.points < cost ? 'disabled' : ''}>${maxed ? '완료' : `✨ ${cost}`}</button></div>`;
  }).join('');
  showModal({ title: `유산 상점 · ✨ ${state.legacy.points}`, html: rows, actions: [{ label: '닫기', onClick: afterClose, primary: true }],
    onBodyClick: a => { if (a.startsWith('buy:') && buy(state, a.slice(4))) { save(state); openShop(afterClose); } } });
}

function checkEnd() {
  if (ended) return;
  const st = status(state);
  if (st === 'playing') return;
  ended = true;
  const pts = pointsFor(state, st);
  showModal({
    title: st === 'conquered' ? '🎉 지도 정복!' : '💀 전멸…',
    html: `<p>${st === 'conquered' ? '모든 땅을 차지했습니다.' : '모든 땅을 잃었습니다. 강제 환생합니다.'}</p><p>유산 포인트 <b>+${pts}</b></p><p>환생하면 지도가 초기화되고 유산 상점에서 영구 보너스를 살 수 있습니다.</p>`,
    actions: [{ label: '환생', primary: true, onClick: () => { rebirth(state, st, Date.now() >>> 0); selectedId = null; ended = false; centerOnCapital(); save(state); openShop(() => { hideModal(); refresh(); }); } }],
  });
}

function loop(now) {
  const dt = Math.min(1, (now - last) / 1000); last = now;
  if (!ended) {
    acc += dt;
    while (acc >= TICK) { tick(state, TICK); runAi(state, TICK); acc -= TICK; }
    for (const e of effects) e.t += dt / 0.4;
    effects = effects.filter(e => e.t < 1);
    saveAcc += dt; if (saveAcc >= AUTOSAVE) { save(state); saveAcc = 0; }
    checkEnd();
  }
  draw(ctx, state, cam, W, H, { selectedId, effects, images });
  refresh();
  requestAnimationFrame(loop);
}

async function init() {
  resize(); window.addEventListener('resize', resize);
  images = await loadAssets('assets/');
  centerOnCapital();
  setRatioButtons(state.run.sendRatio);
  bindButtons({
    onUpgrade: () => { const s = selected(); if (s && upgrade(state, s.id)) { save(state); refresh(); } },
    onRatio: r => { state.run.sendRatio = r; setRatioButtons(r); },
    onMenu: openMenu,
  });
  attachCanvasInput(canvas, cam, { onTap });
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(state); });
  window.addEventListener('pagehide', () => save(state));
  if (state.lastSave > 0) {
    const elapsed = (Date.now() - state.lastSave) / 1000;
    if (elapsed > 30) {
      const r = simulateOffline(state, elapsed);
      save(state);
      const diff = r.tilesAfter - r.tilesBefore;
      showModal({ title: '돌아오셨군요', html: `<p>꺼둔 시간 ${hms(r.seconds)} 동안</p><p>골드 +${formatNum(r.goldGained)}</p><p>땅 ${r.tilesBefore} → ${r.tilesAfter} (${diff >= 0 ? '+' : ''}${diff})</p>`,
        actions: [{ label: '확인', primary: true, onClick: () => { hideModal(); checkEnd(); } }] });
    }
  }
  requestAnimationFrame(loop);
}
init();
