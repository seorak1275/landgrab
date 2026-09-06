// 사단전 모드 배선 (region.html)
import { MAP, PLAYER, NEUTRAL, newRun, tick, status, owned, totalPool, totalProd, allocate, move, rebel, canRebel, predict, setListener, prodOf, poolCap, defMul, info, neighbors, TRAIT_NAME, difficultyOf, REBEL_DELAY, REBEL_RATIO } from './game.js';
import { runAi } from './ai.js';
import { draw, pickRegion, bounds, centerOf } from './render.js';
import { createCamera, ownerColor, FACTION_COLORS, setColorblind } from '../render.js';
import { showModal, hideModal, isModalOpen, attachCanvasInput, formatNum, setHint, flashHint, setRatioButtons, SPEEDS, setSpeedButton } from '../ui.js';
import { LEGACY_ITEMS, itemCost, buy } from '../prestige.js';
import { DIFFICULTIES, DEFAULT_DIFFICULTY } from '../sim.js';
import { PERKS, offerPerks } from '../perks.js';

const SAVE_KEY = 'landgrab.region.v1', VERSION = 1, TICK = 0.25, AUTOSAVE = 5, RESUME_MIN = 30;
const HINT = '내 지역 탭 → 배치 버튼 / 목적지 탭 → 사단 파병 · 남의 지역 탭 → 반란';
const $ = id => document.getElementById(id);
const canvas = $('canvas'), ctx = canvas.getContext('2d'), cam = createCamera();
const ownerName = o => (o === NEUTRAL ? '중립' : o === PLAYER ? '나' : `AI ${o}`);

function newState(seed = Date.now() >>> 0) {
  const upgrades = {}; for (const k of Object.keys(LEGACY_ITEMS)) upgrades[k] = 0;
  const legacy = { points: 0, prestigeCount: 0, upgrades, difficulty: 'hell', speed: 1 }; // 사단전은 기본이 최고 난이도 ("AI는 항상 엄청 강하게")
  return { version: VERSION, legacy, run: newRun(seed, legacy), lastSave: 0 };
}
function save(s = state) { try { s.lastSave = Date.now(); localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch {} }
function load() { try { const t = localStorage.getItem(SAVE_KEY); if (!t) return null; const o = JSON.parse(t); return o && o.run && o.run.mode === 'region' && o.version === VERSION ? o : null; } catch { return null; } }
let state = load() || newState();
let W = 0, H = 0, acc = 0, saveAcc = 0, last = performance.now(), ended = false, hiddenAt = 0, effects = [];
let sel = null, inspect = null;
window.__game = { get state() { return state; }, cam, get sel() { return sel; } };

function resize() { const dpr = window.devicePixelRatio || 1; W = canvas.clientWidth; H = canvas.clientHeight; canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
function fitAll() { const [x0, y0, x1, y1] = bounds(); cam.x = (x0 + x1) / 2; cam.y = (y0 + y1) / 2; cam.scale = Math.max(0.3, Math.min(6, Math.min((W - 16) / (x1 - x0), (H - 16) / (y1 - y0)))); }
function focusOn(id) { const [x, y] = centerOf(id); cam.x = x; cam.y = y; cam.scale = Math.max(cam.scale, 2.2); }
function hms(sec) { const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60); return h ? `${h}시간 ${m}분` : `${m}분`; }
function pointsFor(outcome) {
  const k = difficultyOf(state).points * (1 + 0.1 * (state.legacy.upgrades.pointsMul || 0));
  return outcome === 'conquered' ? Math.floor((10 + Math.floor(state.run.regions.length / 4)) * k) : Math.max(1, Math.floor(state.run.maxRegions / 4 * k));
}

setListener(e => {
  if (e.type === 'capture') { effects.push({ id: e.id, t: 0, color: ownerColor(e.owner), speed: 1 / 0.7 }); if (e.prevOwner === PLAYER) flashHint(`${info(e.id).n}을(를) ${ownerName(e.owner)}에게 빼앗겼습니다`); if (e.owner === PLAYER) flashHint(`🏳 ${info(e.id).n} 점령! 사단 ${Math.floor(e.remaining)}명 남음`); }
  if (e.type === 'uprising') { effects.push({ id: e.id, t: 0, color: ownerColor(e.owner), text: '✊봉기', speed: 1 / 1 }); if (state.run.regions[e.id].owner === PLAYER) flashHint(`✊ ${info(e.id).n}에서 ${ownerName(e.owner)}의 반란군 ${e.size}명 봉기!`, 3000); }
  if (e.type === 'repel' && e.owner === PLAYER) flashHint(`공격 실패 · ${info(e.id).n}`);
});

// ---- 패널 ----
const lastText = new Map();
function setText(id, t) { if (lastText.get(id) !== t) { lastText.set(id, t); $(id).textContent = t; } }
function showRow(id, on) { const el = $(id); if (el.hidden === on) el.hidden = !on; }
function refresh() {
  if (sel !== null && state.run.regions[sel].owner !== PLAYER) sel = null;
  setText('top-pool', `👥 ${formatNum(totalPool(state, PLAYER))}/${Math.floor(poolCap(state, PLAYER))} (+${totalProd(state, PLAYER).toFixed(1)}/초)`);
  setText('top-regions', `🏳 ${owned(state, PLAYER).length}/${state.run.regions.length}`);
  setText('top-prestige', `환생 ${state.legacy.prestigeCount}`);
  setText('top-points', `✨ ${state.legacy.points}`);
  const id = sel !== null ? sel : inspect;
  if (id === null) {
    const perk = PERKS[state.run.perk];
    setText('p-title', '대한민국 시·군·구 · 지역을 탭하세요');
    setText('p-stats', `AI ${state.run.factions - 1}세력과 ${state.run.regions.length}개 지역 다툼 · 난이도 ${difficultyOf(state).name}(AI 생산 ×${difficultyOf(state).mul}, 10분마다 +0.1)${perk ? `\n${perk.icon} 축복: ${perk.name} — ${perk.desc}` : ''}`);
    for (const r of ['row-def', 'row-div', 'row-move', 'row-rebel']) showRow(r, false);
    return;
  }
  const r = state.run.regions[id], m = info(id), mine = r.owner === PLAYER;
  $('p-title').innerHTML = `<span style="color:${ownerColor(r.owner)}">■</span> ${m.p} ${m.n} · ${ownerName(r.owner)} · ${TRAIT_NAME[m.tr]}`;
  const lines = [`🛡 방어 ${Math.floor(r.def)} · ⚔ 사단 ${Math.floor(r.div)} · 수비 배율 ×${defMul(state, r).toFixed(2)}`];
  if (r.owner !== NEUTRAL) lines.push(`생산력 ${prodOf(state, r).toFixed(2)}/초 (${m.t})${mine ? ` · 내 인력 ${Math.floor(totalPool(state, PLAYER))}/${Math.floor(poolCap(state, PLAYER))} (전 지역 합산 +${totalProd(state, PLAYER).toFixed(1)}/초)` : ''}`);
  else lines.push(`중립 · 생산력 ${m.prod}/초 (${m.t}) · 점령하려면 ${Math.floor(r.def * defMul(state, r)) + 1}명 넘게`);
  if (r.battle && r.battle.parties.length) lines.push(`⚔ ${r.battle.parties.length > 1 ? '난전' : '전투 중'}: ${r.battle.parties.map(p => `${ownerName(p.owner)} ${Math.floor(p.size)}`).join(' · ')} vs 수비 ${Math.floor((r.def + r.div))}`);
  const rb = state.run.rebels.filter(x => x.target === id);
  if (rb.length) lines.push(rb.map(x => `✊ ${ownerName(x.owner)} 반란군 ${x.size}명 ${Math.ceil(x.eta)}초 뒤 봉기`).join(' · '));
  if (!mine && r.owner !== NEUTRAL) lines.push(`반란: 내 인력(전체 ${formatNum(totalPool(state, PLAYER))})에서 빼서 ${REBEL_DELAY}초 뒤 ${Math.round(REBEL_RATIO * 100)}%가 봉기 · 이기려면 ${Math.floor((r.def + r.div) * defMul(state, r) / REBEL_RATIO) + 1}명 넘게`);
  setText('p-stats', lines.join('\n'));
  showRow('row-def', mine); showRow('row-div', mine); showRow('row-move', mine && r.div >= 1);
  showRow('row-rebel', !mine && canRebel(state, PLAYER, id));
  if (mine) {
    setText('lab-div', r.div >= 1 ? '⚔ 사단 증원' : '⚔ 사단 창설');
    for (const b of document.querySelectorAll('[data-act="def"],[data-act="div"]')) b.disabled = totalPool(state, PLAYER) < 1;
  } else for (const b of document.querySelectorAll('[data-act="rebel"]')) b.disabled = totalPool(state, PLAYER) < 10;
}

// ---- 조작 ----
function onTap(sx, sy) {
  if (isModalOpen()) return;
  const id = pickRegion(cam, W, H, sx, sy);
  if (id === null) { sel = null; inspect = null; refresh(); return; }
  const r = state.run.regions[id];
  if (sel !== null && id !== sel) { // 파병
    const res = move(state, sel, id, state.run.sendRatio);
    if (res.type === 'invalid') { if (r.owner === PLAYER) { sel = id; inspect = null; } else { flashHint('사단이 없거나 인접하지 않아요 (인접한 지역으로만 이동, 먼 곳은 반란으로)'); inspect = id; sel = null; } }
    else flashHint(res.type === 'attack' ? `⚔ 출격 ${res.size}명 → ${info(id).n} · 약 ${res.eta.toFixed(0)}초` : `→ 이동 ${res.size}명 → ${info(id).n} · 약 ${res.eta.toFixed(0)}초`);
    refresh(); return;
  }
  if (r.owner === PLAYER) { sel = id; inspect = null; } else { sel = null; inspect = id; }
  refresh();
}
function onAct(act, n) {
  const id = sel !== null ? sel : inspect; if (id === null) return;
  const num = n === 'max' ? 'max' : Number(n);
  if (act === 'def' || act === 'div') { const a = allocate(state, id, act, num); flashHint(a ? `${act === 'def' ? '🛡 방어' : '⚔ 사단'} +${a} · 남은 인력 ${Math.floor(totalPool(state, PLAYER))}` : '인력이 없어요'); }
  if (act === 'rebel') { const a = rebel(state, PLAYER, id, num); flashHint(a ? `✊ ${info(id).n}에 반란 ${a}명 투입 · ${REBEL_DELAY}초 뒤 ${Math.floor(a * REBEL_RATIO)}명 봉기` : '인력이 10명 이상 필요하거나 이미 진행 중'); }
  save(); refresh();
}

// ---- 창 ----
function mapPickerHtml() {
  const cur = state.legacy.difficulty || DEFAULT_DIFFICULTY;
  return `<p class="sub">난이도 (AI는 10분마다 +0.1씩 더 세집니다)</p>` + Object.entries(DIFFICULTIES).map(([k, d]) => `<label class="diff-row"><input type="radio" name="diff" value="${k}" ${k === cur ? 'checked' : ''}> ${d.name} <span class="desc">AI 생산 ×${d.mul} · 유산 ×${d.points}</span></label>`).join('');
}
const pickedDifficulty = () => { const el = document.querySelector('input[name="diff"]:checked'); return el ? el.value : state.legacy.difficulty; };
const pickedPerk = () => { const el = document.querySelector('input[name="perk"]:checked'); return el ? el.value : null; };
function perkPickerHtml(seed) { return `<p class="sub">이번 판 축복 (하나 선택)</p><div class="perk-row">${offerPerks(seed).map((k, i) => `<label><input type="radio" name="perk" value="${k}" ${i === 0 ? 'checked' : ''}><b>${PERKS[k].icon} ${PERKS[k].name}</b><span class="desc">${PERKS[k].desc}</span></label>`).join('')}</div>`; }
function startNew(seed, perk) { state.run = newRun(seed, state.legacy, perk); sel = null; inspect = null; ended = false; effects = []; fitAll(); focusOn(state.run.regions.findIndex(r => r.owner === PLAYER)); save(); refresh(); }
function openShop(after = hideModal) {
  const rows = Object.entries(LEGACY_ITEMS).map(([k, it]) => { const lv = state.legacy.upgrades[k] || 0, maxed = lv >= it.max, cost = maxed ? null : itemCost(k, lv); return `<div class="shop-row"><span class="name">${it.name} <b>Lv.${lv}/${it.max}</b><span class="desc">${it.desc}</span></span><button data-action="buy:${k}" ${maxed || state.legacy.points < cost ? 'disabled' : ''}>${maxed ? '완료' : `✨ ${cost}`}</button></div>`; }).join('');
  showModal({ title: `유산 상점 · ✨ ${state.legacy.points}`, html: `<p class="sub">이 모드에선 풍요·징집=생산, 성벽술=수비, 시작 골드=시작 인력, 병참=인력 한도, 약탈=점령 시 인력 흡수. 통치·건축은 효과 없음.</p>${rows}`, actions: [{ label: '닫기', onClick: after, primary: true }],
    onBodyClick: a => { if (a.startsWith('buy:') && buy(state, a.slice(4))) { save(); openShop(after); } } });
}
function openHelp() {
  showModal({ title: '📖 사단전 도움말', html: `<div class="help">
    <h3>지역과 인력</h3><p>대한민국 230개 시·군·구가 칸이다. 내 모든 지역의 생산력(구 0.5·시 0.4·군 0.25/초)이 <b>하나의 인력 풀</b>(상단 👥, 최대 500)에 모이고, 어느 내 지역에서든 그 풀에서 배치한다. 지역이 많을수록 빨리 찬다(전투 중인 지역은 생산 중지). 한도까지 차면 생산이 버려지니 계속 배치하자.</p>
    <h3>방어 배치 · 사단</h3><p>풀에서 🛡<b>방어인력</b>(그 지역 고정 수비)이나 ⚔<b>사단</b>(움직이는 부대, 지역당 하나, 인원 무제한)으로 옮긴다. +10/+100/+500/최대.</p>
    <h3>파병</h3><p>내 지역 선택 → <b>인접한</b> 지역 탭. 파병 비율(25/50/100%)만큼 사단이 행군(2초)해 내 지역이면 합류, 남의 지역이면 전투. 선택하면 인접 지역이 밝아진다(✓이김/✕짐). 먼 곳은 반란으로.</p>
    <h3>반란</h3><p>남이 가진 지역을 탭 → ✊반란 10/100/500/최대. 내 모든 풀에서 빠지고 10초 뒤 70%가 그 지역 안에서 봉기해 방어+사단과 싸운다. 인접할 필요 없음. AI도 똑같이 한다.</p>
    <h3>전투</h3><p>모든 편이 같은 속도로 깎여 가장 센 편이 남는다(잔여 = 1등−2등). 수비 전력 = (방어+사단)×수비배율(⛰산악 1.5·🏙도시 1.2·🌊해안 1.0·🌾평야 0.9). 점령하면 방어 0, 사단은 잔여, 그 지역 풀은 절반만 남는다. 전투 중엔 생산이 멈춘다.</p>
    <h3>끝</h3><p>230개 다 가지면 정복, 지역·사단·반란이 다 없어지면 전멸 → 환생(유산 포인트 → 상점 영구 보너스, 축복 3택1) 후 새 판. 죽어도 다시 하면 된다.</p>
    <h3>AI</h3><p>8초마다 국경엔 방어, 안쪽엔 사단을 만들어 국경으로 보내고, 이길 수 있는 이웃을 치고, 4주기마다 집결, 6주기마다 반란한다. 난이도로 AI 생산 배율을 고른다.</p></div>`, actions: [{ label: '닫기', onClick: hideModal, primary: true }] });
}
function openMenu() {
  showModal({ title: '메뉴 · 사단전', html: `<p>유산 ✨ ${state.legacy.points} · 환생 ${state.legacy.prestigeCount}회 · 난이도 ${difficultyOf(state).name}</p>
    <p><button data-action="help">📖 도움말</button> <button data-action="shop">유산 상점</button> <button data-action="restart">난이도 바꿔 새 판</button></p>
    <p><label><input type="checkbox" data-action="cb" ${state.legacy.colorblind ? 'checked' : ''}> 색약 모드</label></p>
    <p><button data-action="export">저장 내보내기</button> <button data-action="import">저장 가져오기</button> <button data-action="reset" style="color:#eb5757">처음부터</button></p>
    <p><a href="index.html" style="color:#6fb1ff">⬡ 육각 모드로 가기</a></p>`,
    actions: [{ label: '닫기', onClick: hideModal, primary: true }],
    onBodyClick: (a, el) => {
      if (a === 'help') openHelp();
      if (a === 'shop') openShop(openMenu);
      if (a === 'cb') { state.legacy.colorblind = el.checked; setColorblind(el.checked); save(); }
      if (a === 'restart') showModal({ title: '새 판', html: `<p>이번 판을 버리고 새로 시작합니다(유산 유지, 포인트 없음).</p>${mapPickerHtml()}`, actions: [{ label: '취소', onClick: hideModal }, { label: '새로 시작', primary: true, onClick: () => { state.legacy.difficulty = pickedDifficulty(); hideModal(); startNew(Date.now() >>> 0, null); } }] });
      if (a === 'export') showModal({ title: '저장 내보내기', html: `<textarea readonly>${JSON.stringify(state)}</textarea>`, actions: [{ label: '닫기', onClick: hideModal, primary: true }] });
      if (a === 'import') showModal({ title: '저장 가져오기', html: `<textarea id="import-text"></textarea><p id="import-msg"></p>`, actions: [{ label: '취소', onClick: hideModal }, { label: '가져오기', primary: true, onClick: () => { try { const o = JSON.parse($('import-text').value); if (!o.run || o.run.mode !== 'region') throw 0; state = o; sel = null; inspect = null; ended = false; fitAll(); save(); hideModal(); refresh(); } catch { $('import-msg').textContent = '형식이 맞지 않습니다.'; } } }] });
      if (a === 'reset') showModal({ title: '정말 삭제할까요?', html: '<p>사단전 모드의 유산·환생 기록까지 전부 사라집니다.</p>', actions: [{ label: '취소', onClick: hideModal }, { label: '삭제', onClick: () => { localStorage.removeItem(SAVE_KEY); state = newState(); sel = null; inspect = null; ended = false; fitAll(); save(); hideModal(); refresh(); } }] });
    } });
}
function checkEnd() {
  if (ended) return;
  const st = status(state); if (st === 'playing') return;
  ended = true;
  const pts = pointsFor(st), seed = Date.now() >>> 0;
  showModal({ title: st === 'conquered' ? '🎉 대한민국 통일!' : '💀 전멸…', html: `<p>${st === 'conquered' ? '230개 지역을 모두 차지했습니다.' : '모든 지역과 사단을 잃었습니다. 다시 하면 됩니다.'}</p><p>유산 포인트 <b>+${pts}</b> (최대 ${state.run.maxRegions}개 지역)</p>${perkPickerHtml(seed)}${mapPickerHtml()}`,
    actions: [{ label: '환생', primary: true, onClick: () => { state.legacy.points += pts; state.legacy.prestigeCount += 1; state.legacy.difficulty = pickedDifficulty(); const pk = pickedPerk(); hideModal(); startNew(seed, pk); openShop(() => { hideModal(); refresh(); }); } }] });
}
function settle(elapsed) {
  if (ended || elapsed < RESUME_MIN) return;
  const cap = (8 + 4 * (state.legacy.upgrades.offline || 0)) * 3600, seconds = Math.min(elapsed, cap);
  const before = owned(state, PLAYER).length; let rem = seconds;
  while (rem > 0 && status(state) === 'playing') { tick(state, 1); runAi(state, 1); rem -= 1; }
  effects = []; save(); ended = true;
  const after = owned(state, PLAYER).length;
  showModal({ title: '돌아오셨군요', html: `<p>꺼둔 시간 ${hms(seconds)} 동안</p><p>지역 ${before} → ${after} (${after - before >= 0 ? '+' : ''}${after - before})</p><p>인력 합계 ${formatNum(totalPool(state, PLAYER))}</p>${status(state) === 'wiped' ? '<p>…그리고 모든 지역을 잃었습니다.</p>' : ''}`,
    actions: [{ label: '확인', primary: true, onClick: () => { hideModal(); ended = false; last = performance.now(); checkEnd(); } }] });
}

function loop(now) {
  const dt = Math.min(1, (now - last) / 1000); last = now;
  if (!ended) {
    let d = dt * (state.legacy.speed || 1); // 프레임마다 돌려서 행군이 매끄럽게 (0.25초 넘으면 쪼갠다)
    while (d > 0) { const st = Math.min(TICK, d); tick(state, st); runAi(state, st); d -= st; }
    for (const e of effects) e.t += dt * (e.speed || 1.5); effects = effects.filter(e => e.t < 1);
    saveAcc += dt; if (saveAcc >= AUTOSAVE) { save(); saveAcc = 0; }
    checkEnd();
  }
  const marks = {};
  if (sel !== null && state.run.regions[sel].div >= 1) for (const n of neighbors(sel)) marks[n] = state.run.regions[n].owner === PLAYER ? 'move' : predict(state, sel, n, state.run.sendRatio).win ? 'win' : 'lose';
  draw(ctx, state, cam, W, H, { selected: sel, inspect, effects, marks });
  refresh();
  requestAnimationFrame(loop);
}

function init() {
  resize(); window.addEventListener('resize', resize);
  // 패널 줄이 나타나고 사라지면 캔버스 높이가 바뀐다 → 좌표가 어긋나지 않게 캔버스 크기 변화를 직접 본다
  if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
  fitAll(); focusOn(state.run.regions.findIndex(r => r.owner === PLAYER)); if (state.lastSave > 0) fitAll();
  setRatioButtons(state.run.sendRatio); setSpeedButton(state.legacy.speed || 1); setColorblind(state.legacy.colorblind); setHint(HINT);
  document.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => onAct(b.dataset.act, b.dataset.n)));
  document.querySelectorAll('.ratio-btn').forEach(b => b.addEventListener('click', () => { state.run.sendRatio = Number(b.dataset.r); setRatioButtons(state.run.sendRatio); }));
  $('btn-menu').addEventListener('click', openMenu);
  $('btn-center').addEventListener('click', fitAll);
  $('btn-speed').addEventListener('click', () => { const i = SPEEDS.indexOf(state.legacy.speed || 1); state.legacy.speed = SPEEDS[(i + 1) % SPEEDS.length]; setSpeedButton(state.legacy.speed); save(); });
  attachCanvasInput(canvas, cam, { onTap, minScale: 0.3, maxScale: 6 });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); save(); return; }
    if (hiddenAt) { const e = (Date.now() - hiddenAt) / 1000; hiddenAt = 0; last = performance.now(); acc = 0; if (!isModalOpen()) settle(e); }
  });
  window.addEventListener('pagehide', () => save());
  const away = state.lastSave > 0 ? (Date.now() - state.lastSave) / 1000 : 0;
  if (away > 0) settle(away); else if (!localStorage.getItem(SAVE_KEY)) openHelp();
  requestAnimationFrame(loop);
}
init();
