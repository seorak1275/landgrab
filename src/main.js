import { PLAYER, TERRAIN } from './world.js';
import { tick, upgrade, status, factionGoldRate, dispatch, previewTargets, setSendListener } from './sim.js';
import { runAi } from './ai.js';
import { simulateOffline } from './offline.js';
import { LEGACY_ITEMS, itemCost, buy, pointsFor, rebirth } from './prestige.js';
import { newState, save, load, serialize, deserialize, SAVE_KEY } from './save.js';
import { createCamera, draw, pickTile, loadAssets, HEX_SIZE, FACTION_COLORS, ownerColor } from './render.js';
import { updateTop, updatePanel, upgradePlan, setRatioButtons, setHint, flashHint, bindButtons, showModal, hideModal, isModalOpen, attachCanvasInput, formatNum } from './ui.js';

const TICK = 0.25, AUTOSAVE = 5, RESUME_MIN = 30;
const HINT_DEFAULT = '내 땅 탭 → 목적지 탭 (이어진 먼 땅도 됨). ✓ 이김 ✕ 짐';
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const cam = createCamera();
let state = load() || newState();
let images = {}, effects = [], acc = 0, saveAcc = 0, last = performance.now(), W = 0, H = 0, ended = false, hiddenAt = 0;
let sel = [], inspectId = null, multi = false; // sel: 선택한 내 땅 id 목록, inspectId: 남의 땅 정보 보기
// 병사 수 변화 연출: 타일마다 마지막 정수값·아직 안 띄운 증가분·마지막 표시 시각
const FLOAT_EVERY = 1.2; // 내 땅의 "+N"은 이 간격으로 모아서 띄운다 (매 +1마다 띄우면 너무 시끄러움)
let growth = new Map(), growthRun = null;
function trackGrowth(now) {
  if (growthRun !== state.run) { growth.clear(); growthRun = state.run; }
  for (const t of state.run.tiles) {
    const n = Math.floor(t.soldiers);
    let g = growth.get(t.id);
    if (!g) { growth.set(t.id, { n, acc: 0, at: now }); continue; }
    if (n !== g.n) {
      effects.push({ kind: 'pop', toId: t.id, t: 0, speed: 1 / 0.3 });
      if (n > g.n && t.owner === PLAYER && !t.battle) g.acc += n - g.n;
      g.n = n;
    }
    if (g.acc > 0 && now - g.at >= FLOAT_EVERY) {
      effects.push({ kind: 'float', toId: t.id, text: `+${g.acc}`, t: 0, color: ownerColor(t.owner), speed: 1 / 0.9 });
      g.acc = 0; g.at = now;
    }
  }
}
window.__game = { get state() { return state; }, cam, get sel() { return sel; }, get effects() { return effects; } };

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
function tilesOf(ids) { return ids.map(id => state.run.tiles[id]).filter(t => t && t.owner === PLAYER); }
function refresh() {
  sel = sel.filter(id => state.run.tiles[id] && state.run.tiles[id].owner === PLAYER); // 빼앗긴 땅은 선택에서 빠진다
  updateTop(state, factionGoldRate(state, PLAYER));
  updatePanel(state, { selected: tilesOf(sel), inspect: inspectId === null ? null : state.run.tiles[inspectId], multi, ratio: state.run.sendRatio });
}
function clearSel() { sel = []; inspectId = null; }
function hms(sec) { const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60); return h ? `${h}시간 ${m}분` : `${m}분`; }

// 파병 연출: 경로를 따라 점이 움직이고, 점령되면 새 주인 색 고리
function pushLeg(path, color) { effects.push({ fromId: path[0], toId: path[path.length - 1], path, t: 0, color, speed: 1 / (0.25 * Math.max(1, path.length - 1)) }); }
setSendListener(r => {
  if (r.owner !== PLAYER && (r.type === 'move' || r.type === 'attack')) pushLeg([r.fromId, r.toId], ownerColor(r.owner)); // AI 움직임도 보이게
  if (r.type === 'capture') effects.push({ kind: 'ring', fromId: r.fromId, toId: r.toId, t: 0, color: ownerColor(r.owner), speed: 1 / 0.6 });
  if (r.type === 'repel' && r.owner === PLAYER) flashHint(`공격 실패 · 수비 ${Math.floor(r.defendersLeft)}명 남음`);
  if (r.type === 'capture' && r.prevOwner === PLAYER) flashHint(`${state.run.tiles[r.toId] ? TERRAIN[state.run.tiles[r.toId].terrain].name : '땅'}을 ${r.owner === PLAYER ? '' : 'AI ' + r.owner + '에게 '}빼앗겼습니다`);
});

function order(toId) {
  const to = state.run.tiles[toId];
  const r = dispatch(state, sel, toId, state.run.sendRatio);
  if (r.type === 'invalid') {
    if (to.owner === PLAYER) { sel = [toId]; inspectId = null; }
    else flashHint(sel.length ? '내 땅으로 이어진 길이 없어요 (빈 곳을 탭하면 선택 해제)' : HINT_DEFAULT);
    refresh(); return;
  }
  for (const l of r.legs) pushLeg(r.type === 'move' ? l.path : [...l.path, toId], FACTION_COLORS[PLAYER]);
  if (r.type === 'attack') flashHint(`⚔ 전투 시작 · ${Math.floor(r.attackers)}명이 싸우는 중 (더 보내면 합류)`);
  refresh(); checkEnd();
}

function onTap(sx, sy) {
  if (isModalOpen()) return;
  const t = pickTile(state.run, cam, W, H, sx, sy);
  if (!t) { clearSel(); refresh(); return; }
  const mine = t.owner === PLAYER;
  if (mine && multi) { // 여러 개 선택 모드: 내 땅 탭은 추가/해제
    sel = sel.includes(t.id) ? sel.filter(id => id !== t.id) : [...sel, t.id];
    inspectId = null; refresh(); return;
  }
  if (sel.length && !sel.includes(t.id)) { order(t.id); return; }
  if (mine) { sel = [t.id]; inspectId = null; } else { sel = []; inspectId = t.id; }
  refresh();
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
          state = s; clearSel(); ended = false; centerOnCapital(); save(state); hideModal(); refresh();
        } },
      ] });
      if (a === 'reset') showModal({ title: '정말 삭제할까요?', html: '<p>유산 포인트와 환생 기록까지 전부 사라집니다.</p>', actions: [
        { label: '취소', onClick: hideModal },
        { label: '삭제', onClick: () => { localStorage.removeItem(SAVE_KEY); state = newState(); clearSel(); ended = false; centerOnCapital(); save(state); hideModal(); refresh(); } },
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
    actions: [{ label: '환생', primary: true, onClick: () => { rebirth(state, st, Date.now() >>> 0); clearSel(); ended = false; centerOnCapital(); save(state); openShop(() => { hideModal(); refresh(); }); } }],
  });
}

// 꺼둔 시간(새로 열었을 때·백그라운드에서 돌아왔을 때) 정산
function settle(elapsedSec) {
  if (ended || elapsedSec < RESUME_MIN) return;
  effects = [];
  const r = simulateOffline(state, elapsedSec);
  effects = []; growth.clear(); // 시뮬 중 쌓인 연출은 버리고, 정산분이 "+N"으로 뜨지 않게
  save(state);
  ended = true; // 정산 창을 읽는 동안 멈춤 (전멸했어도 확인을 누른 뒤에 전멸 창이 뜨게)
  const diff = r.tilesAfter - r.tilesBefore;
  showModal({ title: '돌아오셨군요', html: `<p>꺼둔 시간 ${hms(r.seconds)} 동안</p><p>골드 +${formatNum(r.goldGained)}</p><p>땅 ${r.tilesBefore} → ${r.tilesAfter} (${diff >= 0 ? '+' : ''}${diff})</p>${r.outcome === 'wiped' ? '<p>…그리고 모든 땅을 잃었습니다.</p>' : ''}`,
    actions: [{ label: '확인', primary: true, onClick: () => { hideModal(); ended = false; last = performance.now(); checkEnd(); } }] });
}

function loop(now) {
  const dt = Math.min(1, (now - last) / 1000); last = now;
  if (!ended) {
    acc += dt;
    while (acc >= TICK) { tick(state, TICK); runAi(state, TICK); acc -= TICK; }
    trackGrowth(now / 1000);
    for (const e of effects) e.t += dt * (e.speed || 2.5);
    effects = effects.filter(e => e.t < 1);
    saveAcc += dt; if (saveAcc >= AUTOSAVE) { save(state); saveAcc = 0; }
    checkEnd();
  }
  const marks = sel.length ? previewTargets(state, sel, state.run.sendRatio) : {};
  draw(ctx, state, cam, W, H, { selectedIds: sel, inspectId, effects, images, marks });
  refresh();
  requestAnimationFrame(loop);
}

async function init() {
  resize(); window.addEventListener('resize', resize);
  images = await loadAssets('assets/');
  centerOnCapital();
  setRatioButtons(state.run.sendRatio);
  setHint(HINT_DEFAULT);
  bindButtons({
    onUpgrade: () => {
      const plan = upgradePlan(state, tilesOf(sel));
      let n = 0; for (const t of plan.tiles) if (upgrade(state, t.id)) n++;
      if (n) { save(state); refresh(); }
    },
    onRatio: r => { state.run.sendRatio = r; setRatioButtons(r); refresh(); },
    onMenu: openMenu,
    onMulti: () => { multi = !multi; inspectId = null; if (multi) flashHint('내 땅 위를 쭉 그으면 한 번에 선택 · 지도 이동은 두 손가락', 3000); refresh(); },
    onAll: () => { sel = state.run.tiles.filter(t => t.owner === PLAYER).map(t => t.id); inspectId = null; refresh(); },
    onCenter: centerOnCapital,
  });
  attachCanvasInput(canvas, cam, { onTap, isSelectMode: () => multi, onDrag: (sx, sy) => {
    // 드래그 선택: 지나가는 내 땅을 추가 (빼는 건 탭)
    const t = pickTile(state.run, cam, W, H, sx, sy);
    if (t && t.owner === PLAYER && !sel.includes(t.id)) { sel = [...sel, t.id]; inspectId = null; refresh(); }
  } });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); save(state); return; }
    // 아이폰 홈화면 앱은 다시 열어도 새로 로드되지 않는다 → 백그라운드에 있던 시간도 정산
    if (hiddenAt) { const elapsed = (Date.now() - hiddenAt) / 1000; hiddenAt = 0; last = performance.now(); acc = 0; if (!isModalOpen()) settle(elapsed); }
  });
  window.addEventListener('pagehide', () => save(state));
  if (state.lastSave > 0) settle((Date.now() - state.lastSave) / 1000);
  requestAnimationFrame(loop);
}
init();
