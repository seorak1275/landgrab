// 사단전 모드 배선 (region.html)
import { MAP, PLAYER, NEUTRAL, OFF, newRun, tick, status, owned, activeCount, totalPool, totalProd, allocate, move, rebel, canRebel, predict, setListener, prodOf, poolCap, defMul, info, adj, TRAIT_NAME, difficultyOf, REBEL_DELAY, REBEL_RATIO, BOARDS, DEFAULT_BOARD, boardOf, maxAiFor, HOMES, homesOf, homeNames, provinceIds, provinceHolder, provProgress, provMul, PROV_PROD, ISO_PROD, ISO_DEF, supplyHub, autoDeploy, moveFar, pathThroughMine, truce, TRUCE, TECHS, techsOf, techCost, hasTech, techCount, research, atPeace, pactLeft, relOf, proposePact, refusedLeft, leaderOf, PACT_DUR } from './game.js';
import { runAi, PERSONAS, personaOf, factionName } from './ai.js';
import { draw, pickRegion, bounds, centerOf, regionBox } from './render.js';
import { createCamera, ownerColor, FACTION_COLORS, setColorblind } from '../render.js';
import { showModal, hideModal, isModalOpen, attachCanvasInput, formatNum, setHint, flashHint, setRatioButtons, SPEEDS, setSpeedButton } from '../ui.js';
import { LEGACY_ITEMS, itemCost, buy, itemLocked } from '../prestige.js';
import { SAVE_KEY, newState, save as saveTo, load as loadFrom } from './save.js';
import { DIFFICULTIES, DEFAULT_DIFFICULTY } from '../sim.js';
import { PERKS, offerPerks } from '../perks.js';
import { GENERALS, GENERAL_SPECS, drawGeneral, setLead, rankOf, addRecord, checkMedals, recommendDifficulty } from '../career.js';
import { openCareer as openCareerModal, generalPickerHtml, pickedGeneral } from '../career_ui.js';

const TICK = 0.25, AUTOSAVE = 5, PAUSE_MIN = 60, MAX_ZOOM = 24; // 방치는 없다 — 꺼둔 동안 세상이 멈춘다
const HINT = '내 지역 탭 → 배치 버튼 / 목적지 탭 → 사단 파병 · 남의 지역 탭 → 반란';
const $ = id => document.getElementById(id);
const canvas = $('canvas'), ctx = canvas.getContext('2d'), cam = createCamera();
const ownerName = o => (o === NEUTRAL || o === OFF ? '중립' : o === PLAYER ? '나' : `${factionName(state.run, o)}`);

function save(s = state) { saveTo(s); }
let state = loadFrom() || newState();
let W = 0, H = 0, acc = 0, saveAcc = 0, last = performance.now(), ended = false, hiddenAt = 0, effects = [];
let sel = null, inspect = null;
window.__game = { get state() { return state; }, cam, get sel() { return sel; } };

function resize() { const dpr = window.devicePixelRatio || 1; W = canvas.clientWidth; H = canvas.clientHeight; canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
function fitAll() { const [x0, y0, x1, y1] = bounds(state); cam.x = (x0 + x1) / 2; cam.y = (y0 + y1) / 2; cam.scale = Math.max(0.3, Math.min(6, Math.min((W - 16) / (x1 - x0), (H - 16) / (y1 - y0)))); }
// 여러 지역(광역시 등)을 한 화면에 담는다
function focusArea(ids) {
  if (!ids.length) return;
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const id of ids) { const x = regionBox(id); b[0] = Math.min(b[0], x[0]); b[1] = Math.min(b[1], x[1]); b[2] = Math.max(b[2], x[2]); b[3] = Math.max(b[3], x[3]); }
  cam.x = (b[0] + b[2]) / 2 * 1400; cam.y = (b[1] + b[3]) / 2 * 1400;
  const w = (b[2] - b[0]) * 1400, h = (b[3] - b[1]) * 1400;
  cam.scale = Math.max(0.3, Math.min(MAX_ZOOM, Math.min((W - 24) / Math.max(w, 1e-6), (H - 24) / Math.max(h, 1e-6))));
}
// 그 지역이 화면에 꽉 차게 (작은 구는 많이, 큰 군은 적게 확대)
function focusOn(id, fill = 0.5) {
  const [x, y] = centerOf(id); cam.x = x; cam.y = y;
  const b = regionBox(id), w = (b[2] - b[0]) * 1400, h = (b[3] - b[1]) * 1400;
  const want = Math.min(W * fill / Math.max(w, 1e-6), H * fill / Math.max(h, 1e-6));
  cam.scale = Math.max(cam.scale, Math.min(MAX_ZOOM, Math.max(2.2, want)));
}
function hms(sec) { const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60); return h ? `${h}시간 ${m}분` : `${m}분`; }
function pointsFor(outcome) {
  const k = difficultyOf(state).points * (1 + 0.1 * (state.legacy.upgrades.pointsMul || 0));
  return outcome === 'conquered' ? Math.floor((10 + Math.floor(activeCount(state) / 4)) * k) : Math.max(1, Math.floor(state.run.maxRegions / 4 * k));
}

const LOG_MAX = 30;
function logs() { if (!state.run.log) state.run.log = []; return state.run.log; }
function note(text, id = null, kind = '') {
  const L = logs();
  L.unshift({ t: Math.round(state.run.elapsed || 0), text, id, kind });
  if (L.length > LOG_MAX) L.length = LOG_MAX;
}
// 알림 + 기록을 한 번에 (놓쳐도 📜에 남는다)
function tell(text, id = null, kind = '', ms = 2500) { note(text, id, kind); flashHint(text, ms); }

setListener(e => {
  if (e.type === 'capture') {
    effects.push({ id: e.id, t: 0, color: ownerColor(e.owner), speed: 1 / 0.7 });
    if (e.prevOwner === PLAYER) tell(`💥 ${info(e.id).n}을(를) ${ownerName(e.owner)}에게 빼앗겼습니다`, e.id, 'bad');
    else if (e.owner === PLAYER) tell(`🏳 ${info(e.id).n} 점령! 사단 ${Math.floor(e.remaining)}명 남음`, e.id, 'good');
  }
  if (e.type === 'uprising') { effects.push({ id: e.id, t: 0, color: ownerColor(e.owner), text: '✊봉기', speed: 1 / 1 }); if (state.run.regions[e.id].owner === PLAYER) tell(`✊ ${info(e.id).n}에서 ${ownerName(e.owner)}의 반란군 ${e.size}명 봉기!`, e.id, 'bad', 3000); }
  if (e.type === 'repel' && e.owner === PLAYER) tell(`✕ 공격 실패 · ${info(e.id).n}`, e.id, 'bad');
  if (e.type === 'pact' && (e.a === PLAYER || e.b === PLAYER)) tell(`🤝 ${ownerName(e.a === PLAYER ? e.b : e.a)}와(과) 정전`, null, 'diplo');
  if (e.type === 'betray' && e.victim === PLAYER) tell(`💢 ${ownerName(e.owner)}이(가) 정전을 깨고 쳐들어옵니다!`, null, 'bad', 4000);
  if (e.type === 'research' && e.owner === PLAYER) tell(`🔬 ${TECHS[e.key].icon} ${TECHS[e.key].name} 연구 완료 — ${TECHS[e.key].desc}`, null, 'good', 4000);
  if (e.type === 'eliminate') {
    if (e.by === PLAYER) tell(`💀 ${ownerName(e.owner)} 격파! (마지막 지역을 빼앗았습니다)`, e.id, 'good', 4000);
    else if (e.owner !== PLAYER) note(`💀 ${ownerName(e.owner)}이(가) ${ownerName(e.by)}에게 무너졌습니다`, e.id, 'diplo');
  }
});

// ---- 패널 ----
const lastText = new Map();
function setText(id, t) { if (lastText.get(id) !== t) { lastText.set(id, t); $(id).textContent = t; } }
function showRow(id, on) { const el = $(id); if (el.hidden === on) el.hidden = !on; }
function refresh() {
  if (sel !== null && state.run.regions[sel].owner !== PLAYER) sel = null;
  const pool = totalPool(state, PLAYER), cap = Math.floor(poolCap(state, PLAYER)), full = pool >= cap - 1;
  setText('top-pool', `👥 ${formatNum(pool)}/${cap}${full ? ' ⚠넘침' : ''} (+${totalProd(state, PLAYER).toFixed(1)}/초)`);
  $('top-pool').style.color = full ? '#ffd479' : '';
  setText('top-regions', `🏳 ${owned(state, PLAYER).length}/${activeCount(state)}`);
  setText('top-prestige', `환생 ${state.legacy.prestigeCount}`);
  setText('btn-tech', `🔬 ${techCount(state.run, PLAYER)}/${Object.keys(TECHS).length}`);
  const pacts = []; for (let f = 1; f < state.run.factions; f++) if (atPeace(state, PLAYER, f)) pacts.push(f);
  setText('btn-diplo', pacts.length ? `🤝 ${pacts.length}` : '🤝 외교');
  setText('btn-log', logs().length ? `📜 ${logs().length}` : '📜 기록');
  setText('top-points', `✨ ${state.legacy.points}`);
  const id = sel !== null ? sel : inspect;
  if (id === null) {
    const perk = PERKS[state.run.perk];
    setText('p-title', `${boardOf(state).name} 사단전 · 지역을 탭하세요`);
    setText('p-stats', `${boardOf(state).name} · AI ${state.run.factions - 1}세력과 ${activeCount(state)}개 지역 다툼 · 난이도 ${difficultyOf(state).name}(AI 생산 ×${difficultyOf(state).mul}, 10분마다 +0.1)${perk ? `\n${perk.icon} 축복: ${perk.name} — ${perk.desc}` : ''}`);
    for (const r of ['row-def', 'row-div', 'row-move', 'row-rebel']) showRow(r, false);
    return;
  }
  const r = state.run.regions[id], m = info(id), mine = r.owner === PLAYER;
  $('p-title').innerHTML = `<span style="color:${ownerColor(r.owner)}">■</span> ${m.p} ${m.n} · ${ownerName(r.owner)} · ${TRAIT_NAME[m.tr]}`;
  const lines = [`🛡 방어 ${Math.floor(r.def)} · ⚔ 사단 ${Math.floor(r.div)} · 수비 배율 ×${defMul(state, r).toFixed(2)}`];
  const pg = provProgress(state, m.p);
  if (pg.total > 1) {
    const holder = provinceHolder(state.run, m.p);
    lines.push(holder === PLAYER
      ? `★ ${m.p} 완전 점령 — 이 시·도 전체 생산 +${Math.round((provMul(state, r, 'prod') - 1) * 100)}%, 수비 +15%`
      : `⛳ ${m.p} ${pg.mine}/${pg.total}${holder !== null ? ` · 지금 주인 ${ownerName(holder)}` : ''} — 다 가지면 생산 +${Math.round(PROV_PROD * 100)}%, 수비 +15%`);
  }
  if (r.owner !== NEUTRAL && r.iso) lines.push(`⛓ 고립 — 본국(${r.owner === PLAYER ? info(supplyHub(state, PLAYER)).n : '상대 수도'})과 이어진 길이 끊겨 생산 ×${ISO_PROD}, 수비 ×${ISO_DEF}`);
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
  const id = pickRegion(cam, W, H, sx, sy, state.run);
  if (id === null) { sel = null; inspect = null; refresh(); return; }
  const r = state.run.regions[id];
  if (sel !== null && id !== sel) { // 파병 (이어진 내 땅이 있으면 여러 칸을 자동으로 진격한다)
    const res = moveFar(state, sel, id, state.run.sendRatio);
    if (res.type === 'invalid') { if (r.owner === PLAYER) { sel = id; inspect = null; } else { flashHint('사단이 없거나, 내 땅으로 이어지지 않은 곳이에요 (먼 적지는 ✊반란으로)'); inspect = id; sel = null; } }
    else {
      const hop = res.hops > 1 ? ` · ${res.hops}칸 진격` : '';
      flashHint(`${res.type === 'attack' ? '⚔ 출격' : '→ 이동'} ${res.size}명 → ${info(id).n}${hop} · 약 ${res.eta.toFixed(0)}초`);
    }
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
  const bd = state.legacy.boardPref || state.run.board || DEFAULT_BOARD;
  const rec = recommendDifficulty(state.legacy, 'region', bd);
  return boardPickerHtml() + `<p class="sub">난이도 (AI는 10분마다 +0.1씩 더 세집니다${rec !== cur ? ' · ★는 지난 판 성적으로 뽑은 추천' : ''})</p>` + Object.entries(DIFFICULTIES).map(([k, d]) => `<label class="diff-row"><input type="radio" name="diff" value="${k}" ${k === cur ? 'checked' : ''}> ${d.name}${k === rec ? ' ★ 추천' : ''} <span class="desc">AI 생산 ×${d.mul} · 유산 ×${d.points}</span></label>`).join('');
}
const pickedDifficulty = () => { const el = document.querySelector('input[name="diff"]:checked'); return el ? el.value : state.legacy.difficulty; };
function boardPickerHtml() {
  const cur = state.legacy.boardPref || state.run.board || DEFAULT_BOARD;
  return `<p class="sub">판 (권역을 고르면 짧고 빠른 판)</p>` + Object.entries(BOARDS).map(([k, b]) => `<label class="diff-row"><input type="radio" name="board" value="${k}" ${k === cur ? 'checked' : ''}> ${b.name} <span class="desc">${b.desc} · AI 최대 ${maxAiFor(k)}</span></label>`).join('')
    + `<div id="home-pick">${homePickerHtml(cur)}</div>`;
}
const TAG_COLOR = { '쉬움': '#6fe38f', '보통': '#8fd0ff', '어려움': '#ffd479', '도전': '#ff9c9c' };
function homePickerHtml(board) {
  const cur = state.legacy.homePref && homeNames(board).includes(state.legacy.homePref) ? state.legacy.homePref : BOARDS[board].home;
  return `<p class="sub">시작 지역 (내 수도 · 어디서 시작하느냐로 초반이 크게 달라집니다)</p>` + homesOf(board).map(h => `<label class="diff-row"><input type="radio" name="home" value="${h.n}" ${h.n === cur ? 'checked' : ''}> ${h.n} <b style="color:${TAG_COLOR[h.tag]}">${h.tag}</b> <span class="desc">${h.desc}</span></label>`).join('');
}
const pickedBoard = () => { const el = document.querySelector('input[name="board"]:checked'); return el ? el.value : (state.legacy.boardPref || DEFAULT_BOARD); };
const pickedHome = () => { const el = document.querySelector('input[name="home"]:checked'); return el ? el.value : null; };
// 판을 바꾸면 시작 지역 목록도 따라 바뀐다
function wireBoardPicker() {
  for (const el of document.querySelectorAll('input[name="board"]')) {
    el.addEventListener('change', () => { const box = $('home-pick'); if (box) box.innerHTML = homePickerHtml(el.value); });
  }
}
const pickedPerk = () => { const el = document.querySelector('input[name="perk"]:checked'); return el ? el.value : null; };
function perkPickerHtml(seed) { return `<p class="sub">이번 판 축복 (하나 선택)</p><div class="perk-row">${offerPerks(seed).map((k, i) => `<label><input type="radio" name="perk" value="${k}" ${i === 0 ? 'checked' : ''}><b>${PERKS[k].icon} ${PERKS[k].name}</b><span class="desc">${PERKS[k].desc}</span></label>`).join('')}</div>`; }
function openCareer(after = hideModal) { openCareerModal({ state, save: () => save(), after, mode: 'region', boardName: k => (BOARDS[k] || {}).name, canChangeLead: () => truce(state) || !state.legacy.lead }); }
function startNew(seed, perk, board = state.legacy.boardPref || DEFAULT_BOARD, home = state.legacy.homePref) { state.legacy.boardPref = board; if (home) state.legacy.homePref = home; state.run = newRun(seed, state.legacy, perk, board, home); sel = null; inspect = null; ended = false; effects = []; fitAll(); focusOn(state.run.regions.findIndex(r => r.owner === PLAYER)); save(); refresh(); }
function openShop(after = hideModal) {
  const rows = Object.entries(LEGACY_ITEMS).map(([k, it]) => {
    const lv = state.legacy.upgrades[k] || 0, maxed = lv >= it.max, locked = itemLocked(it, state.legacy), cost = maxed ? null : itemCost(k, lv);
    const label = maxed ? '완료' : locked ? `🔒 환생 ${it.tier}` : `✨ ${cost}`;
    return `<div class="shop-row"><span class="name">${it.name} <b>Lv.${lv}/${it.max}</b><span class="desc">${it.desc}${locked ? ` · 환생 ${it.tier}회부터` : ''}</span></span><button data-action="buy:${k}" ${maxed || locked || state.legacy.points < cost ? 'disabled' : ''}>${label}</button></div>`;
  }).join('');
  showModal({ title: `유산 상점 · ✨ ${state.legacy.points}`, html: `<p class="sub">이 모드에선 풍요·징집=생산, 성벽술=수비, 시작 골드=시작 인력, 병참=인력 한도, 약탈=점령 시 인력 흡수. 통치·건축은 효과 없음.</p>${rows}`, actions: [{ label: '닫기', onClick: after, primary: true }],
    onBodyClick: a => { if (a.startsWith('buy:') && buy(state, a.slice(4))) { save(); openShop(after); } } });
}
const relWord = v => (v <= -50 ? '적대' : v <= -15 ? '냉담' : v < 15 ? '보통' : v < 50 ? '우호' : '동맹');
function openTech(after = hideModal) {
  const rows = Object.entries(TECHS).map(([k, t]) => {
    const got = hasTech(state.run, PLAYER, k), cost = techCost(state, PLAYER, k);
    return `<div class="shop-row"><span class="name">${t.icon} ${t.name}<span class="desc">${t.desc}</span></span><button data-action="tech:${k}" ${got || totalPool(state, PLAYER) < cost ? 'disabled' : ''}>${got ? '완료' : `👥 ${cost}`}</button></div>`;
  }).join('');
  showModal({ title: `🔬 기술 연구 · 인력 ${Math.floor(totalPool(state, PLAYER))}`, html: `<p class="sub">이 판 동안만 남는다(환생하면 사라짐). 하나 연구할 때마다 다음 기술 값이 1.6배가 된다. AI도 같은 규칙으로 연구한다.</p>${rows}`,
    actions: [{ label: '닫기', onClick: after, primary: true }],
    onBodyClick: a => { if (a.startsWith('tech:')) { const k = a.slice(5); if (research(state, PLAYER, k)) { save(); openTech(after); } else flashHint('인력이 모자랍니다'); } } });
}
function openDiplo(after = hideModal) {
  const lead = leaderOf(state);
  const rows = [];
  for (let f = 1; f < state.run.factions; f++) {
    const n = owned(state, f).length, rel = relOf(state, PLAYER, f), peace = atPeace(state, PLAYER, f);
    const cool = Math.ceil(refusedLeft(state, PLAYER, f));
    const alive = n > 0 || state.run.armies.some(a => a.owner === f) || state.run.rebels.some(r => r.owner === f);
    const techs = Object.keys(techsOf(state.run, f)).map(k => `${TECHS[k].icon}${TECHS[k].name}`).join(' ');
    const btn = !alive ? '<button disabled>💀 격파됨</button>'
      : peace ? `<button disabled>정전 ${Math.ceil(pactLeft(state, PLAYER, f))}초</button>`
      : cool > 0 ? `<button disabled>거절 ${cool}초</button>`
      : `<button data-action="pact:${f}">정전 제안</button>`;
    const P = personaOf(state.run, f);
    rows.push(`<div class="shop-row"><span class="name" style="color:${ownerColor(f)};opacity:${alive ? 1 : 0.45}">${ownerName(f)}${f === lead && alive ? ' 👑' : ''} <b>${n}곳</b><span class="desc">${P.name}형 — ${P.desc}<br>${alive ? `관계 ${rel > 0 ? '+' : ''}${Math.round(rel)} (${relWord(rel)})${peace ? ' · 🤝 정전 중' : ''}` : '무너진 세력'}${techs ? ` · 기술 ${techs}` : ''}</span></span>${btn}</div>`);
  }
  const others = [];
  for (let a = 1; a < state.run.factions; a++) for (let b = a + 1; b < state.run.factions; b++) if (atPeace(state, a, b)) others.push(`${ownerName(a)}–${ownerName(b)}`);
  showModal({ title: '🤝 외교', html: `<p class="sub">정전은 ${PACT_DUR}초. 정전 중엔 서로 치지 못하고, 어기고 치면(반란 포함) 관계가 크게 깎이고 <b>다른 세력도 나를 믿지 않는다</b>. 다들 👑선두를 싫어해서, 내가 앞서면 정전을 받아주지 않는다.</p>${rows.join('')}
    <p class="sub">AI끼리 정전: ${others.length ? others.join(' · ') : '없음'}</p>`,
    actions: [{ label: '닫기', onClick: after, primary: true }],
    onBodyClick: a => { if (a.startsWith('pact:')) { const f = Number(a.slice(5)); const ok = proposePact(state, PLAYER, f); flashHint(ok ? `🤝 ${ownerName(f)}와(과) 정전 ${PACT_DUR}초` : `${ownerName(f)}이(가) 거절했습니다 (내가 앞서거나 사이가 나쁘면 안 받아줍니다)`); save(); openDiplo(after); } } });
}
// 🔍 지역 찾기: 251곳 중 이름으로 찾아 그 지역으로 화면을 옮긴다 (서울 구처럼 작은 곳은 눈으로 찾기 어렵다)
function openFind(q = '') {
  const list = state.run.regions
    .filter(r => r.owner !== OFF)
    .map(r => ({ r, m: info(r.id) }))
    .filter(({ m }) => !q || (m.n + ' ' + m.p).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (b.r.owner === PLAYER) - (a.r.owner === PLAYER) || (b.r.def + b.r.div) - (a.r.def + a.r.div))
    .slice(0, 40);
  const rows = list.map(({ r, m }) => `<div class="shop-row"><span class="name" style="color:${ownerColor(r.owner)}">${m.p} ${m.n}${r.iso ? ' ⛓' : ''}<span class="desc">${ownerName(r.owner)} · 🛡${Math.floor(r.def)} ⚔${Math.floor(r.div)} · ${TRAIT_NAME[m.tr]}</span></span><button data-action="go:${r.id}">보기</button></div>`).join('')
    || '<p class="sub">그런 이름이 없습니다.</p>';
  const metros = ['서울', '부산', '대구', '인천', '광주', '대전', '울산'].filter(p => state.run.regions.some(r => r.owner !== OFF && info(r.id).p === p));
  const metroRow = metros.length ? `<p class="sub">작아서 안 보이는 광역시로 바로 가기</p><p>${metros.map(p => `<button data-action="metro:${p}">${p}</button>`).join(' ')}</p>` : '';
  showModal({ title: '🔍 지역 찾기', html: `${metroRow}<p class="sub">이름 일부를 넣으면 걸러집니다 (내 지역 → 센 곳 순, 40곳까지)</p>
    <input id="find-q" type="text" inputmode="search" placeholder="예: 강남, 속초, 경북" value="${q.replace(/"/g, '&quot;')}" style="width:100%;padding:8px;border-radius:8px;border:1px solid #555;background:#1b2430;color:#eee;font-size:15px">
    ${rows}`,
    actions: [{ label: '닫기', onClick: hideModal, primary: true }],
    onBodyClick: a => {
      if (a.startsWith('metro:')) { const p = a.slice(6); hideModal(); focusArea(state.run.regions.filter(r => r.owner !== OFF && info(r.id).p === p).map(r => r.id)); flashHint(`🔍 ${p} — 두 손가락으로 더 확대할 수 있습니다`); return; }
      if (!a.startsWith('go:')) return;
      const id = Number(a.slice(3)); hideModal();
      const r = state.run.regions[id];
      if (r.owner === PLAYER) { sel = id; inspect = null; } else { sel = null; inspect = id; }
      focusOn(id); refresh();
    } });
  const el = $('find-q');
  if (el) { el.addEventListener('input', () => { const v = el.value; openFind(v); const e2 = $('find-q'); if (e2) { e2.focus(); e2.setSelectionRange(v.length, v.length); } }); }
}
function openStatus(after = hideModal) {
  const total = activeCount(state);
  const rows = [];
  for (let f = 0; f < state.run.factions; f++) {
    const n = owned(state, f).length, pct = Math.round(n / total * 100);
    const provs = [...provinceIds(state.run.board || DEFAULT_BOARD).keys()].filter(p => provinceHolder(state.run, p) === f);
    rows.push(`<div class="shop-row"><span class="name" style="color:${ownerColor(f)}">${ownerName(f)} <b>${n}곳 (${pct}%)</b>
      <span class="desc">${f === PLAYER ? '' : `${personaOf(state.run, f).name}형 · `}인력 ${Math.floor(totalPool(state, f))} · 생산 ${totalProd(state, f).toFixed(0)}/초${provs.length ? ` · ★ ${provs.join(' ')}` : ''}</span>
      <span style="display:block;height:6px;margin-top:4px;background:#2a3644;border-radius:3px"><span style="display:block;height:6px;width:${Math.max(2, pct)}%;background:${ownerColor(f)};border-radius:3px"></span></span></span></div>`);
  }
  const provs = [...provinceIds(state.run.board || DEFAULT_BOARD).entries()]
    .map(([p, ids]) => { const h = provinceHolder(state.run, p); const mine = ids.filter(id => state.run.regions[id].owner === PLAYER).length; return { p, h, mine, total: ids.length }; })
    .sort((a, b) => (b.mine / b.total) - (a.mine / a.total));
  const provRow = provs.map(x => `<span style="color:${x.h === null ? '#aaa' : ownerColor(x.h)}">${x.h !== null ? '★' : ''}${x.p} ${x.mine}/${x.total}</span>`).join(' · ');
  showModal({ title: `📊 전황 · ${hms(Math.round(state.run.elapsed || 0))}째`, html: `${rows.join('')}
    <p class="sub">시·도 (★ = 완전 점령, 그 시·도 생산 +${Math.round(PROV_PROD * 100)}%·수비 +15%)</p><p>${provRow}</p>`,
    actions: [{ label: '닫기', onClick: after, primary: true }] });
}
function openLog() {
  const L = logs();
  const rows = L.map((x, i) => `<div class="shop-row"><span class="name" style="color:${x.kind === 'bad' ? '#ff9c9c' : x.kind === 'good' ? '#9ae6b4' : '#ddd'}">${x.text}<span class="desc">${hms(x.t)}째</span></span>${x.id !== null && x.id !== undefined ? `<button data-action="go:${x.id}">보기</button>` : ''}</div>`).join('')
    || '<p class="sub">아직 아무 일도 없었습니다.</p>';
  showModal({ title: `📜 기록 (최근 ${L.length}건)`, html: `<p class="sub">놓친 소식을 여기서 봅니다. [보기]를 누르면 그 지역으로 갑니다.</p>${rows}`,
    actions: [{ label: '닫기', onClick: hideModal, primary: true }],
    onBodyClick: a => { if (a.startsWith('go:')) { const id = Number(a.slice(3)); hideModal(); const r = state.run.regions[id]; if (r.owner === PLAYER) { sel = id; inspect = null; } else { sel = null; inspect = id; } focusOn(id); refresh(); } } });
}
function openHelp() {
  showModal({ title: '📖 사단전 도움말', html: `<div class="help">
    <h3>지역과 인력</h3><p>대한민국 251개 시·군·구가 칸이다. 내 모든 지역의 생산력(구 2·시 1.5·군 1/초)이 <b>하나의 인력 풀</b>(상단 👥, 한도 500 + 지역당 2)에 모이고, 어느 내 지역에서든 그 풀에서 배치한다. 지역이 많을수록 빨리 찬다(전투 중인 지역은 생산 중지). 한도까지 차면 생산이 버려진다(상단에 ⚠넘침). 패널의 ⚡<b>국경 배치</b>를 누르면 인력을 국경 방어 3곳(40%)과 선봉 사단(60%)에 한 번에 넣는다.</p>
    <h3>방어 배치 · 사단</h3><p>풀에서 🛡<b>방어인력</b>(그 지역 고정 수비)이나 ⚔<b>사단</b>(움직이는 부대, 지역당 하나, 인원 무제한)으로 옮긴다. +10/+100/+500/최대.</p>
    <h3>파병 · 자동 진격</h3><p>내 지역 선택 → 목적지 탭. 사단은 한 칸 2초로 <b>한 칸씩</b> 행군하지만, 목적지가 <b>이어진 내 땅</b> 너머라면 그 길을 따라 <b>자동으로 계속 진격</b>한다(몇 칸인지·몇 초 걸리는지 알려 준다). 가는 길의 내 땅을 그새 빼앗기면 거기서 싸운다. 선택하면 갈 수 있는 곳이 밝아진다(✓이김/✕짐). 내 땅과 이어지지 않은 <b>먼 적지는 여전히 ✊반란으로만</b>.</p>
    <h3>반란</h3><p>남이 가진 지역을 탭 → ✊반란 10/100/500/최대. 내 모든 풀에서 빠지고 10초 뒤 70%가 그 지역 안에서 봉기해 방어+사단과 싸운다. 인접할 필요 없음. AI도 똑같이 한다.</p>
    <h3>연구</h3><p>패널의 🔬<b>연구</b>로 인력을 들여 그 판 동안 쓸 기술을 산다: ${Object.values(TECHS).map(t => `${t.icon}${t.name}(${t.desc})`).join(' · ')}. 하나 살 때마다 다음 값이 1.6배. AI도 똑같이 연구한다.</p>
    <h3>외교</h3><p>🤝<b>외교</b>로 AI에 <b>정전</b>(${PACT_DUR}초)을 제안한다. 정전 중엔 서로 못 친다. 어기면 관계가 크게 깎이고 다른 세력도 나를 믿지 않는다. AI들은 👑<b>선두를 싫어해</b> 자기들끼리 손을 잡으니, 내가 너무 앞서면 사방에서 몰려온다.</p>
    <h3>시·도 완전 점령</h3><p>한 시·도(서울·강원·경북…)의 지역을 <b>전부</b> 가지면 그 시·도 지역들의 생산 +${Math.round(PROV_PROD * 100)}%, 수비 +15%(유산 '통치'로 더, 축복 '통합'이면 두 배). 지도에서 ★가 붙고, 패널에 ⛳ 진행도(예: 강원 12/18)가 뜬다. 한 판 안의 중간 목표다. ≡ 메뉴 📊<b>전황</b>에서 세력별 세력도와 시·도 점유를 한눈에 본다.</p>
    <h3>시작 지역</h3><p>환생 창이나 "난이도 바꿔 새 판"에서 <b>시작 지역</b>을 고른다. 쉬움(수원 장안구)부터 도전(제주시·안동시)까지 붙은 표시는 봇으로 실측한 초반 속도다. 속초시(설악산)는 이웃 셋이 전부 산악 군이라 어려움 쪽이다.</p>
    <h3>보급 (본국 연결)</h3><p>내 <b>본국</b>(수도, 잃으면 생산력이 가장 큰 내 지역)에서 <b>내 지역만 밟아</b> 닿지 않는 지역은 ⛓<b>고립</b>이다. 고립 지역은 생산 ×${ISO_PROD}, 수비 ×${ISO_DEF}이고 지도에서 어둡게 보인다. AI도 똑같이 당하니, 크게 뻗은 AI의 <b>허리를 끊으면</b> 뒤쪽 땅이 한꺼번에 약해진다.</p>
    <h3>기록</h3><p>패널의 📜<b>기록</b>에 점령·상실·봉기·배신·격파·연구가 최근 30건까지 남는다. [보기]를 누르면 그 지역으로 간다. 정전 중인 세력 땅에는 흰 점선 테두리가 뜬다.</p>
    <h3>화면</h3><p>한 손가락으로 밀어 이동, 두 손가락으로 확대·축소(많이 들어갈 수 있다), ⌖로 전체 보기. 서울처럼 작은 구는 확대해야 이름이 뜬다. ≡ 메뉴의 🔍<b>지역 찾기</b>에 이름 일부를 넣으면 그 지역으로 바로 옮겨 준다.</p>
    <h3>판</h3><p>전국(251곳) 말고 <b>권역 판</b>(수도권·영남·호남충청, 75~79곳)을 고르면 훨씬 짧게 끝난다. 권역마다 특성 분포가 달라 상성이 다르다. ≡ 메뉴의 "난이도 바꿔 새 판"이나 환생 창에서 고른다.</p>
    <h3>전투</h3><p>모든 편이 같은 속도로 깎여 가장 센 편이 남는다(잔여 = 1등−2등). 수비 전력 = (방어+사단)×수비배율(⛰산악 1.5·🏙도시 1.2·🌊해안 1.0·🌾평야 0.9). 점령하면 방어 0, 사단은 잔여, 그 지역 풀은 절반만 남는다. 전투 중엔 생산이 멈춘다.</p>
    <h3>환생에 남는 것</h3><p>판이 끝나면 전적에 남고, 조건을 채우면 🎖<b>훈장</b>을 받는다. 환생·정복으로 <b>공적</b>이 쌓여 계급(이등병→대장)이 오르고 계급마다 생산이 는다. 환생할 때마다 <b>장군</b>을 한 명 얻어(같은 장군이면 레벨 +1) 그 판에 앞장세운다 — 돌격(공격)·수성(수비)·기동(행군)·조련(생산) 특기에 레벨당 5%. ≡ 메뉴 🎖전적·계급에서 본다. 유산 상점의 상위 4종(보급술·연구소·사절·통솔)은 환생을 몇 번 해야 열린다.</p>
    <h3>끝</h3><p>251개 다 가지면 정복, 지역·사단·반란이 다 없어지면 전멸 → 환생(유산 포인트 → 상점 영구 보너스, 축복 3택1) 후 새 판. 죽어도 다시 하면 된다.</p>
    <h3>AI 성격</h3><p>세력마다 버릇이 다르다: ${Object.values(PERSONAS).map(p => `${p.icon}<b>${p.name}</b>(${p.desc})`).join(' · ')}. 이름 옆 아이콘이 성격이고, 🤝외교·📊전황에서 확인할 수 있다.</p>
    <h3>AI</h3><p>8초마다 국경엔 방어, 안쪽엔 사단을 만들어 국경으로 보내고, 이길 수 있는 이웃을 치고, 4주기마다 집결, 6주기마다 반란한다. 난이도로 AI 생산 배율을 고른다.</p></div>`, actions: [{ label: '닫기', onClick: hideModal, primary: true }] });
}
function openMenu() {
  showModal({ title: '메뉴 · 사단전', html: `<p>🎖 ${rankOf(state.legacy).name} · 유산 ✨ ${state.legacy.points} · 환생 ${state.legacy.prestigeCount}회 · 난이도 ${difficultyOf(state).name}</p>
    <p><button data-action="status">📊 전황</button> <button data-action="help">📖 도움말</button> <button data-action="find">🔍 지역 찾기</button> <button data-action="shop">유산 상점</button> <button data-action="career">🎖 전적·계급</button> <button data-action="restart">난이도 바꿔 새 판</button></p>
    <p><label><input type="checkbox" data-action="cb" ${state.legacy.colorblind ? 'checked' : ''}> 색약 모드</label></p>
    <p><button data-action="export">저장 내보내기</button> <button data-action="import">저장 가져오기</button> <button data-action="reset" style="color:#eb5757">처음부터</button></p>
    <p><a href="index.html" style="color:#6fb1ff">⬡ 육각 모드로 가기</a></p>`,
    actions: [{ label: '닫기', onClick: hideModal, primary: true }],
    onBodyClick: (a, el) => {
      if (a === 'help') openHelp();
      if (a === 'shop') openShop(openMenu);
      if (a === 'career') openCareer(openMenu);
      if (a === 'find') openFind();
      if (a === 'status') openStatus(openMenu);
      if (a === 'cb') { state.legacy.colorblind = el.checked; setColorblind(el.checked); save(); }
      if (a === 'restart') { showModal({ title: '새 판', html: `<p>이번 판을 버리고 새로 시작합니다(유산 유지, 포인트 없음).</p>${mapPickerHtml()}`, actions: [{ label: '취소', onClick: hideModal }, { label: '새로 시작', primary: true, onClick: () => { state.legacy.difficulty = pickedDifficulty(); const bd = pickedBoard(), hm = pickedHome(); hideModal(); startNew(Date.now() >>> 0, null, bd, hm); } }] }); wireBoardPicker(); }
      if (a === 'export') showModal({ title: '저장 내보내기', html: `<textarea readonly>${JSON.stringify(state)}</textarea>`, actions: [{ label: '닫기', onClick: hideModal, primary: true }] });
      if (a === 'import') showModal({ title: '저장 가져오기', html: `<textarea id="import-text"></textarea><p id="import-msg"></p>`, actions: [{ label: '취소', onClick: hideModal }, { label: '가져오기', primary: true, onClick: () => { try { const o = JSON.parse($('import-text').value); if (!o.run || o.run.mode !== 'region') throw 0; state = o; sel = null; inspect = null; ended = false; fitAll(); save(); hideModal(); refresh(); } catch { $('import-msg').textContent = '형식이 맞지 않습니다.'; } } }] });
      if (a === 'reset') showModal({ title: '정말 삭제할까요?', html: '<p>사단전 모드의 유산·환생 기록까지 전부 사라집니다.</p>', actions: [{ label: '취소', onClick: hideModal }, { label: '삭제', onClick: () => { localStorage.removeItem(SAVE_KEY); state = newState(); sel = null; inspect = null; ended = false; fitAll(); save(); hideModal(); refresh(); } }] });
    } });
}
function checkEnd() {
  if (ended) return;
  const st = status(state); if (st === 'playing') return;
  ended = true;
  const pts = pointsFor(st), seed = Date.now() >>> 0, total = activeCount(state);
  // 판 결과를 전적에 남기고(훈장 판정 포함), 환생 보상으로 장군을 한 명 뽑는다
  const rec = {
    mode: 'region', board: state.run.board || DEFAULT_BOARD, difficulty: state.legacy.difficulty,
    outcome: st, regions: st === 'conquered' ? total : state.run.maxRegions, total,
    elapsed: Math.round(state.run.elapsed || 0), points: pts,
    betrayals: (state.run.betrayals || {})[PLAYER] || 0, killed: (state.run.kills || {})[PLAYER] || 0,
    lowest: state.run.lowRegions === undefined ? 99 : state.run.lowRegions, // 몰린 적이 없으면 기사회생 아님
  };
  addRecord(state.legacy, rec);
  const medals = checkMedals(state.legacy, rec);
  const gen = drawGeneral(state.legacy, seed);
  const gi = GENERALS.find(g => g.key === gen.key);
  save();
  const medalHtml = medals.length ? `<p>🎖 훈장 획득: ${medals.map(m => `<b>${m.icon} ${m.name}</b> <span class="desc">${m.desc}</span>`).join(' · ')}</p>` : '';
  showModal({
    title: st === 'conquered' ? `🎉 ${boardOf(state).name} 통일!` : '💀 전멸…',
    html: `<p>${st === 'conquered' ? `${total}개 지역을 모두 차지했습니다.` : '모든 지역과 사단을 잃었습니다. 다시 하면 됩니다.'}</p>
      <p>유산 포인트 <b>+${pts}</b> · 최대 ${rec.regions}개 지역 · ${hms(rec.elapsed)}${rec.killed ? ` · AI ${rec.killed}세력 격파` : ''}${rec.betrayals ? ` · 배신 ${rec.betrayals}회` : ''}</p>
      ${medalHtml}
      <p>🎖 계급 ${rankOf(state.legacy).name} · 새 장군 <b>${GENERAL_SPECS[gi.spec].icon} ${gi.name} Lv.${gen.level}</b> ${gen.isNew ? '(새로 합류)' : '(경험이 늘었다)'}</p>
      ${generalPickerHtml(state)}${perkPickerHtml(seed)}${mapPickerHtml()}`,
    actions: [{ label: '환생', primary: true, onClick: () => {
      state.legacy.points += pts; state.legacy.prestigeCount += 1;
      state.legacy.difficulty = pickedDifficulty();
      const g = pickedGeneral(); if (g) setLead(state.legacy, g);
      const pk = pickedPerk(), bd = pickedBoard();
      hideModal(); startNew(seed, pk, bd); openShop(() => { hideModal(); refresh(); });
    } }],
  });
  wireBoardPicker();
}
// 꺼둔 시간은 정산하지 않는다 (2026-09-11 "방치는 없는걸로"): 나가던 그 상황에서 그대로 이어 한다
function notePause(elapsed) {
  if (elapsed < PAUSE_MIN) return;
  flashHint(`⏸ 꺼둔 ${hms(elapsed)} 동안 멈춰 있었습니다 (방치로는 아무 일도 일어나지 않습니다)`, 5000);
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
  if (sel !== null && state.run.regions[sel].div >= 1) {
    // 이어진 내 땅은 '이동', 그 땅들에 붙은 남의 땅은 이길 수 있는지(✓/✕)
    const seen = new Set([sel]), q = [sel];
    for (let i = 0; i < q.length; i++) for (const n of adj(state.run, q[i])) {
      if (seen.has(n)) continue;
      const r = state.run.regions[n];
      if (r.owner === PLAYER) { seen.add(n); q.push(n); marks[n] = 'move'; }
      else if (marks[n] === undefined) marks[n] = predict(state, sel, n, state.run.sendRatio).win ? 'win' : 'lose';
    }
  }
  const peace = new Set();
  for (let f = 1; f < state.run.factions; f++) if (atPeace(state, PLAYER, f)) peace.add(f);
  draw(ctx, state, cam, W, H, { selected: sel, inspect, effects, marks, peace });
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
  $('btn-auto').addEventListener('click', () => { const n = autoDeploy(state, PLAYER); flashHint(n ? `⚡ 인력 ${n}명을 국경 방어와 선봉 사단에 배치했습니다` : '배치할 인력이 없습니다'); save(); refresh(); });
  $('btn-log').addEventListener('click', openLog);
  $('btn-tech').addEventListener('click', () => openTech());
  $('btn-diplo').addEventListener('click', () => openDiplo());
  $('btn-center').addEventListener('click', fitAll);
  $('btn-speed').addEventListener('click', () => { const i = SPEEDS.indexOf(state.legacy.speed || 1); state.legacy.speed = SPEEDS[(i + 1) % SPEEDS.length]; setSpeedButton(state.legacy.speed); save(); });
  attachCanvasInput(canvas, cam, { onTap, minScale: 0.3, maxScale: MAX_ZOOM }); // 부산 중구처럼 아주 작은 곳도 들여다볼 수 있게
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); save(); return; }
    if (hiddenAt) { const e = (Date.now() - hiddenAt) / 1000; hiddenAt = 0; last = performance.now(); acc = 0; if (!isModalOpen()) notePause(e); }
  });
  window.addEventListener('pagehide', () => save());
  const away = state.lastSave > 0 ? (Date.now() - state.lastSave) / 1000 : 0;
  if (away > 0) notePause(away); else if (!localStorage.getItem(SAVE_KEY)) openHelp();
  requestAnimationFrame(loop);
}
init();
