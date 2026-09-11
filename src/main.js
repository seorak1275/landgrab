import { PLAYER, TERRAIN } from './world.js';
import { tick, upgrade, status, factionGoldRate, dispatch, previewTargets, setSendListener, setBuilding, BUILDINGS, TRAITS } from './sim.js';
import { PERKS, offerPerks } from './perks.js';
import { runAi } from './ai.js';
import { LEGACY_ITEMS, itemCost, buy, pointsFor, rebirth, restartOn, itemLocked } from './prestige.js';
import { GENERAL_SPECS, GENERALS, drawGeneral, setLead, rankOf, addRecord, checkMedals, recommendDifficulty } from './career.js';
import { openCareer as openCareerModal, generalPickerHtml, pickedGeneral } from './career_ui.js';
import { newState, save, load, serialize, deserialize, SAVE_KEY, FEATURES } from './save.js';
import { createCamera, draw, pickTile, loadAssets, worldBounds, FACTION_COLORS, ownerColor, setColorblind } from './render.js';
import { MAPS, DEFAULT_MAP } from './mapgen.js';
import { regionHolders, DIFFICULTIES, DEFAULT_DIFFICULTY, difficultyOf } from './sim.js';
import { updateTop, updatePanel, upgradePlan, setRatioButtons, setHint, flashHint, bindButtons, showModal, hideModal, isModalOpen, attachCanvasInput, formatNum, SPEEDS, setSpeedButton } from './ui.js';

const TICK = 0.25, AUTOSAVE = 5, PAUSE_MIN = 60; // 방치(오프라인 정산)는 없다 — 꺼둔 동안 세상이 멈춘다
const HINT_DEFAULT = '내 땅 탭 → 목적지 탭 (이어진 먼 땅도 됨). ✓ 이김 ✕ 짐';
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const cam = createCamera();
let state = load() || newState(Date.now() >>> 0, DEFAULT_MAP);
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
// 지도 전체(타일 경계)가 화면에 들어오도록 중심과 배율을 정한다
function centerOnCapital() {
  const [x0, y0, x1, y1] = worldBounds(state.run);
  cam.x = (x0 + x1) / 2; cam.y = (y0 + y1) / 2;
  cam.scale = Math.max(0.4, Math.min(2.5, Math.min((W - 16) / (x1 - x0), (H - 16) / (y1 - y0))));
}
function tilesOf(ids) { return ids.map(id => state.run.tiles[id]).filter(t => t && t.owner === PLAYER); }
function refresh() {
  sel = sel.filter(id => state.run.tiles[id] && state.run.tiles[id].owner === PLAYER); // 빼앗긴 땅은 선택에서 빠진다
  updateTop(state, factionGoldRate(state, PLAYER));
  updatePanel(state, { selected: tilesOf(sel), inspect: inspectId === null ? null : state.run.tiles[inspectId], multi, ratio: state.run.sendRatio });
}
function clearSel() { sel = []; inspectId = null; }
function hms(sec) { const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60); return h ? `${h}시간 ${m}분` : `${m}분`; }

// 연출: 행군 부대는 render가 run.armies를 직접 그리고, 점령되면 새 주인 색 고리, 야전은 두 타일 사이 터짐
setSendListener(r => {
  if (r.type === 'capture') effects.push({ kind: 'ring', fromId: r.fromId, toId: r.toId, t: 0, color: ownerColor(r.owner), speed: 1 / 0.6 });
  if (r.type === 'clash') {
    effects.push({ kind: 'burst', fromId: r.fromId, toId: r.toId, t: 0, color: r.owner === PLAYER ? FACTION_COLORS[PLAYER] : '#ffd166', speed: 1 / 0.7 });
    if (r.owner === PLAYER) flashHint(`⚔ 야전 승리! 적 부대를 깨고 ${Math.floor(r.remaining)}명이 계속 갑니다`);
    else if (r.losers.includes(PLAYER)) flashHint(`⚔ 야전 패배… 마주 오던 적 부대에 부대가 전멸했습니다`);
  }
  if (r.type === 'repel' && r.owner === PLAYER) flashHint(`공격 실패 · 수비 ${Math.floor(r.defendersLeft)}명 남음`);
  if (r.type === 'capture' && r.prevOwner === PLAYER) flashHint(`${state.run.tiles[r.toId] ? TERRAIN[state.run.tiles[r.toId].terrain].name : '땅'}을 ${r.owner === PLAYER ? '' : 'AI ' + r.owner + '에게 '}빼앗겼습니다`);
  if (r.type === 'capture' && r.owner === PLAYER && state.run.regions) {
    // 이 점령으로 지역이 완성됐으면 알림
    const t = state.run.tiles[r.toId];
    if (t && t.region >= 0 && regionHolders(state.run)[t.region] === PLAYER) flashHint(`★ ${state.run.regions[t.region]} 완전 점령! 지역 생산 +50%`, 3000);
  }
});

// 도움말 (설명서). section: 'build' 면 건물 절이 맨 위
function openHelp(section = null) {
  const build = `<h3 id="h-build">특화 건물 (내 땅 하나에 하나, 골드 150×지형계수)</h3>
    <table>${Object.entries(BUILDINGS).map(([k, b]) => `<tr><td>${b.icon} ${b.name}</td><td>${b.desc}</td></tr>`).join('')}</table>
    <p>바꾸면 다시 내고, 철거(✕)는 무료. <b>점령당하면 부서진다.</b> 효과는 자리에 따라 달라진다 — 버튼의 ×배율이 그 땅에서의 효율이고(초록 = 잘 맞음, 흐림 = 안 맞음), 땅을 고르면 패널이 "이 땅에 맞는 건물"을 알려준다.</p>
    <table><tr><td>지형</td><td>산·언덕: 성벽·망루 ×1.5(언덕 ×1.3) · 평지: 농장 ×1.3 · 성채(수도): 병영 ×1.3 · 숲: 망루 ×1.2 · 뱃길: 농장 ×0.3</td></tr>
    <tr><td>지역 특성</td><td>${Object.values(TRAITS).map(t => `${t.icon} ${t.name}: ${t.desc}`).join(' · ')}</td></tr></table>
    <p>쓰는 법: 국경 산악엔 🛡️성벽, 국경 안쪽 평야엔 🌾농장으로 골드, 수도·도시엔 ⚔️병영으로 병사, 적과 맞닿은 곳엔 🏹망루로 알아서 치게.</p>`;
  const rest = `<h3>기본</h3><p>내 땅 탭 → 목적지 탭. 이어진 내 땅이 있으면 먼 곳도 한 번에. 파병 비율 25/50/100%. [✎ 드래그 선택]·[내 땅 전체 선택]으로 여러 땅에서 모아 보낸다. 선택한 내 땅은 [업그레이드]로 레벨(생산·한도) 상승. 골드는 세력 공용, 병사는 땅마다. 병사 한도는 60×레벨×지형계수.</p>
    <h3>행군·전투</h3><p>병사는 2칸/초로 행군하고 도착해야 싸운다. 전투는 모든 편이 같은 속도로 깎여 가장 센 편이 남는다(잔여 = 1등−2등). 속도는 전력 합에 따라 작은 싸움 2~3초, 큰 싸움 20초 안팎. 더 보내면 합류(시간 초기화 없음). 셋 이상이면 난전. 서로 상대 땅을 동시에 치면 변 위에서 부딪혀(야전) 이긴 쪽 잔여만 계속. 전투 중인 땅은 징집이 멈춘다. ✓/✕는 지금 비율로 보낼 때 이기는지 미리보기.</p>
    <h3>지형</h3><table>${Object.entries(TERRAIN).map(([k, t]) => `<tr><td>${t.name}</td><td>골드 ×${t.gold} · 방어 +${Math.round(t.def * 100)}% · 한도 ×${t.cap}</td></tr>`).join('')}</table>
    <h3>지역</h3><p>대한민국(시·도)·서울(구) 지도에서 한 지역의 땅을 전부 가지면 그 지역 생산 +50%(2칸 이상인 지역만). 이름표가 ★와 주인 색으로 바뀐다. 섬은 뱃길로 이어진다.</p>
    <h3>AI·난이도</h3><p>AI는 8초마다 업그레이드·공격·보강하고 4주기마다 땅 전체에서 병사를 모아 집결 공격한다. 난이도(쉬움 0.6 / 보통 0.8 / 어려움 1.0 / 지옥 1.2)는 AI 생산 배율, 유산 포인트도 ×1~2. 환생마다 +0.1, 판이 10분 지날 때마다 +0.1(최대 +1.0)씩 세진다.</p>
    <h3>환생·유산·축복</h3><p>지도를 다 먹거나(정복) 다 잃으면(전멸, 강제) 환생. 유산 포인트로 상점의 영구 보너스 15종을 사고, 환생 때 축복 3개 중 하나를 골라 그 판에 쓴다. 지도·난이도도 그때 고른다. <b>방치는 없다</b> — 창을 닫으면 시간이 멈추고 돌아오면 나가던 그 상황 그대로다.</p>
    <h3>계급·장군·전적</h3><p>판이 끝나면 전적과 훈장이 남고, 환생·정복으로 공적이 쌓여 계급이 오른다(계급마다 생산 +). 환생할 때마다 장군을 하나 얻어 그 판에 앞장세운다. ≡ 메뉴의 🎖전적·계급.</p>
    <h3>기타</h3><p>▶×1 버튼으로 배속(×1/×2/×4). 메뉴에 색약 모드, 저장 내보내기/가져오기.</p>`;
  showModal({ title: '📖 도움말', html: `<div class="help">${section === 'build' ? build + rest : rest + build}</div>`, actions: [{ label: '닫기', onClick: hideModal, primary: true }] });
}

// 예전 저장으로 들어온 플레이어에게 새 기능 안내: 계속하거나 새 지도로 시작 (유산 유지)
function showWelcome(then) {
  showModal({
    title: '🆕 새로워졌어요',
    html: `<ul class="feat">
      <li><b>대한민국·서울 지도</b> — 시·도/구를 전부 가지면 생산 +50%, 지역마다 특성(산악·평야·도시·해안)</li>
      <li><b>행군 전투</b> — 병사가 실제로 이동하고, 마주치면 야전, 셋 이상이면 난전. 전투 시간은 전력에 따라</li>
      <li><b>특화 건물</b> — 농장·병영·성벽·망루(자동 공격). 자리에 맞으면 효과 ×1.5</li>
      <li><b>난이도·축복·유산</b> — AI도 집결 공격을 합니다. 병사 한도 3배</li>
      <li><b>방치 없음</b> — 창을 닫으면 시간이 멈춥니다. 돌아오면 나가던 그 상황 그대로. 유산 '오프라인 한도'에 쓴 포인트는 돌려드렸습니다</li>
    </ul><p>지금 판(${(MAPS[state.run.map] || MAPS.hex).name})을 이어서 해도 되고, 새 지도에서 새로 시작해도 됩니다(유산·환생 기록은 유지).</p>`,
    actions: [
      { label: '새 지도로 시작', onClick: () => { hideModal(); openMapChange(then); } },
      { label: '계속하기', primary: true, onClick: () => { hideModal(); then && then(); } },
    ],
  });
  state.legacy.seenFeatures = FEATURES; save(state);
}

// 지도 고르기 창. onPick(mapKey)
function mapPickerHtml(current) {
  const maps = Object.values(MAPS).map(m => `<label class="map-row"><input type="radio" name="map" value="${m.key}" ${m.key === current ? 'checked' : ''}> <b>${m.name}</b><span class="desc">${m.desc}${m.homeName ? ` · 내 수도 ${m.homeName}` : ''}</span></label>`).join('');
  const cur = state.legacy.difficulty || DEFAULT_DIFFICULTY;
  const rec = recommendDifficulty(state.legacy, 'hex', state.run.map);
  const diffs = Object.entries(DIFFICULTIES).map(([k, d]) => `<label class="diff-row"><input type="radio" name="diff" value="${k}" ${k === cur ? 'checked' : ''}> ${d.name}${k === rec ? ' ★ 추천' : ''} <span class="desc">AI 생산 ×${d.mul} · 유산 ×${d.points}</span></label>`).join('');
  return `${maps}<p class="sub">난이도 (AI는 10분마다 +0.1씩 더 세집니다${rec !== cur ? ' · ★는 지난 판 성적으로 뽑은 추천' : ''})</p>${diffs}`;
}
function pickedMap() { const el = document.querySelector('input[name="map"]:checked'); return el ? el.value : state.run.map; }
function pickedDifficulty() { const el = document.querySelector('input[name="diff"]:checked'); return el ? el.value : (state.legacy.difficulty || DEFAULT_DIFFICULTY); }
// 환생 축복 3개 중 하나 (시드로 정해짐)
function perkPickerHtml(seed) {
  const keys = offerPerks(seed);
  return `<p class="sub">이번 판 축복 (하나 선택)</p><div class="perk-row">${keys.map((k, i) => `<label><input type="radio" name="perk" value="${k}" ${i === 0 ? 'checked' : ''}><b>${PERKS[k].icon} ${PERKS[k].name}</b><span class="desc">${PERKS[k].desc}</span></label>`).join('')}</div>`;
}
function pickedPerk() { const el = document.querySelector('input[name="perk"]:checked'); return el ? el.value : null; }
function openMapChange(then = null) {
  showModal({ title: '지도 바꾸기', html: `<p>이번 판은 버리고 고른 지도에서 새로 시작합니다 (유산·환생 기록은 그대로, 포인트는 없음).</p>${mapPickerHtml(state.run.map)}`,
    actions: [{ label: '취소', onClick: () => { hideModal(); then && then(); } }, { label: '새로 시작', primary: true, onClick: () => {
      state.legacy.difficulty = pickedDifficulty(); restartOn(state, pickedMap(), Date.now() >>> 0); clearSel(); ended = false; growth.clear(); effects = []; centerOnCapital(); save(state); hideModal(); refresh();
    } }] });
}

function order(toId) {
  const to = state.run.tiles[toId];
  const r = dispatch(state, sel, toId, state.run.sendRatio);
  if (r.type === 'invalid') {
    if (to.owner === PLAYER) { sel = [toId]; inspectId = null; }
    else flashHint(sel.length ? '내 땅으로 이어진 길이 없어요 (빈 곳을 탭하면 선택 해제)' : HINT_DEFAULT);
    refresh(); return;
  }
  flashHint(r.type === 'attack' ? `⚔ 출격 · ${Math.floor(r.sent)}명 · 약 ${r.eta.toFixed(1)}초 뒤 도착 (더 보내면 합류)` : `→ 이동 · ${Math.floor(r.sent)}명 · 약 ${r.eta.toFixed(1)}초`);
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
      <p>지도: ${(MAPS[state.run.map] || MAPS.hex).name} · 난이도 ${difficultyOf(state).name} <button data-action="map">지도·난이도 바꾸기</button></p>
      <p><a href="region.html" style="color:#6fb1ff;font-weight:bold">🗺 새 모드: 대한민국 시·군·구 사단전 →</a></p>
      <p><button data-action="help">📖 도움말</button> <button data-action="shop">유산 상점</button> <button data-action="career">🎖 전적·계급</button> <button data-action="export">저장 내보내기</button> <button data-action="import">저장 가져오기</button></p>
      <p><label><input type="checkbox" data-action="cb" ${state.legacy.colorblind ? 'checked' : ''}> 색약 모드 (구분 잘 되는 색 + 타일에 주인 글자)</label></p>
      <p><button data-action="reset" style="color:#eb5757">처음부터(전부 삭제)</button></p>`,
    actions: [{ label: '닫기', onClick: hideModal, primary: true }],
    onBodyClick: (a, el) => {
      if (a === 'shop') openShop();
      if (a === 'career') openCareerModal({ state, save, after: openMenu, mode: 'hex', canChangeLead: () => (state.run.elapsed || 0) < 120 || !state.legacy.lead });
      if (a === 'map') openMapChange();
      if (a === 'help') openHelp();
      if (a === 'cb') { state.legacy.colorblind = el.checked; setColorblind(el.checked); save(state); refresh(); }
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
    const lv = state.legacy.upgrades[k] || 0, maxed = lv >= it.max, locked = itemLocked(it, state.legacy), cost = maxed ? null : itemCost(k, lv);
    return `<div class="shop-row"><span class="name">${it.name} <b>Lv.${lv}/${it.max}</b><span class="desc">${it.desc}${locked ? ` · 환생 ${it.tier}회부터` : ''}</span></span>
      <button data-action="buy:${k}" ${maxed || locked || state.legacy.points < cost ? 'disabled' : ''}>${maxed ? '완료' : locked ? `🔒 환생 ${it.tier}` : `✨ ${cost}`}</button></div>`;
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
  const seed = Date.now() >>> 0;
  // 판 결과를 전적에 남기고(훈장 판정), 환생 보상으로 장군을 한 명 뽑는다
  const tiles = state.run.tiles.length, mine = state.run.tiles.filter(t => t.owner === PLAYER).length;
  const rec = {
    mode: 'hex', board: state.run.map, difficulty: state.legacy.difficulty, outcome: st,
    regions: st === 'conquered' ? tiles : Math.max(mine, state.run.maxTilesOwned || 0), total: tiles,
    elapsed: Math.round(state.run.elapsed || 0), points: pts, betrayals: 0, killed: 0,
  };
  addRecord(state.legacy, rec);
  const medals = checkMedals(state.legacy, rec);
  const gen = drawGeneral(state.legacy, seed), gi = GENERALS.find(g => g.key === gen.key);
  const medalHtml = medals.length ? `<p>🎖 훈장 획득: ${medals.map(m => `<b>${m.icon} ${m.name}</b>`).join(' · ')}</p>` : '';
  showModal({
    title: st === 'conquered' ? '🎉 지도 정복!' : '💀 전멸…',
    html: `<p>${st === 'conquered' ? '모든 땅을 차지했습니다.' : '모든 땅을 잃었습니다. 강제 환생합니다.'}</p><p>유산 포인트 <b>+${pts}</b> · 최대 ${rec.regions}/${rec.total}칸 · ${hms(rec.elapsed)}</p>${medalHtml}<p>🎖 계급 ${rankOf(state.legacy).name} · 새 장군 <b>${GENERAL_SPECS[gi.spec].icon} ${gi.name} Lv.${gen.level}</b> ${gen.isNew ? '(새로 합류)' : '(경험이 늘었다)'}</p>${generalPickerHtml(state)}${perkPickerHtml(seed)}<p class="sub">다음 지도:</p>${mapPickerHtml(state.legacy.mapPref || state.run.map)}`,
    actions: [{ label: '환생', primary: true, onClick: () => { const mk = pickedMap(), dk = pickedDifficulty(), pk = pickedPerk(); const g = pickedGeneral(); if (g) setLead(state.legacy, g); state.legacy.difficulty = dk; rebirth(state, st, seed, mk, pk); clearSel(); ended = false; growth.clear(); effects = []; centerOnCapital(); save(state); openShop(() => { hideModal(); refresh(); }); } }],
  });
}

// 꺼둔 시간은 정산하지 않는다 (2026-09-11 "방치는 없는걸로"): 나가던 그 상황에서 그대로 이어 하고, 멈춰 있었다고만 알린다
function notePause(elapsedSec) {
  if (elapsedSec < PAUSE_MIN) return;
  flashHint(`⏸ 꺼둔 ${hms(elapsedSec)} 동안 멈춰 있었습니다 (방치로는 아무 일도 일어나지 않습니다)`, 5000);
}
function loop(now) {
  const dt = Math.min(1, (now - last) / 1000); last = now;
  if (!ended) {
    let d = dt * (state.legacy.speed || 1); // 배속: 시뮬 시간만. 프레임마다 돌려 행군이 매끄럽게 (0.25초 넘으면 쪼갠다)
    while (d > 0) { const st = Math.min(TICK, d); tick(state, st); runAi(state, st); d -= st; }
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
  if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas); // 건물 줄 등으로 캔버스 높이가 바뀔 때
  images = await loadAssets('assets/');
  centerOnCapital();
  setRatioButtons(state.run.sendRatio);
  setSpeedButton(state.legacy.speed || 1);
  setColorblind(state.legacy.colorblind);
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
    onBuild: key => {
      let n = 0; for (const t of tilesOf(sel)) if (setBuilding(state, t.id, key)) n++;
      if (n) { save(state); flashHint(key ? `${BUILDINGS[key].icon} ${BUILDINGS[key].name} ${n}곳 · ${BUILDINGS[key].desc} (지형·지역에 따라 효과 배율, 점령당하면 부서짐)` : `철거 ${n}곳`); refresh(); }
      else flashHint(key ? '골드가 부족하거나 이미 그 건물입니다' : '철거할 건물이 없습니다');
    },
    onCenter: centerOnCapital,
    onHelp: openHelp,
    onSpeed: () => { const i = SPEEDS.indexOf(state.legacy.speed || 1); state.legacy.speed = SPEEDS[(i + 1) % SPEEDS.length]; setSpeedButton(state.legacy.speed); save(state); flashHint(`배속 ×${state.legacy.speed}`); },
  });
  attachCanvasInput(canvas, cam, { onTap, isSelectMode: () => multi, onDrag: (sx, sy) => {
    // 드래그 선택: 지나가는 내 땅을 추가 (빼는 건 탭)
    const t = pickTile(state.run, cam, W, H, sx, sy);
    if (t && t.owner === PLAYER && !sel.includes(t.id)) { sel = [...sel, t.id]; inspectId = null; refresh(); }
  } });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); save(state); return; }
    // 아이폰 홈화면 앱은 다시 열어도 새로 로드되지 않는다 → 돌아온 시점부터 이어서 돈다
    if (hiddenAt) { const elapsed = (Date.now() - hiddenAt) / 1000; hiddenAt = 0; last = performance.now(); acc = 0; if (!isModalOpen()) notePause(elapsed); }
  });
  window.addEventListener('pagehide', () => save(state));
  // 꺼둔 시간은 안내 창이 저장(lastSave 갱신)하기 전에 재둔다
  const away = state.lastSave > 0 ? (Date.now() - state.lastSave) / 1000 : 0;
  const resume = () => notePause(away);
  if (state.lastSave > 0 && (state.legacy.seenFeatures || 0) < FEATURES) showWelcome(resume); else resume();
  requestAnimationFrame(loop);
}
init();
