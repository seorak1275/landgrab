import { TERRAIN, PLAYER, NEUTRAL } from './world.js';
import { cap, goldRate, soldierRate, upgradeCost, MAX_LEVEL, regionHolders, heldRegions, regionCount, regionBonus, BUILDINGS, buildCost, buildMul, building, traitOf, bestBuilding } from './sim.js';
import { PERKS } from './perks.js';
import { ownerColor } from './render.js';
import { MAPS } from './mapgen.js';

export function formatNum(n) {
  n = Math.floor(n);
  if (n < 10000) return n.toLocaleString('en-US');
  if (n < 1e6) return (n / 1e3).toPrecision(3).replace(/\.?0+$/, '') + 'K';
  return (n / 1e6).toPrecision(3).replace(/\.?0+$/, '') + 'M';
}
const $ = id => document.getElementById(id);
export function ownerName(owner) { return owner === NEUTRAL ? '중립' : owner === PLAYER ? '나' : `AI ${owner}`; }

// 매 프레임 호출되므로 값이 바뀔 때만 DOM을 건드린다
const lastText = new Map();
function setText(id, text) { if (lastText.get(id) !== text) { lastText.set(id, text); $(id).textContent = text; } }
function setHtml(id, html) { if (lastText.get(id) !== html) { lastText.set(id, html); $(id).innerHTML = html; } }

export function updateTop(state, rate) {
  setText('top-gold', `💰 ${formatNum(state.run.gold[PLAYER])}`);
  setText('top-rate', `+${rate.toFixed(1)}/초`);
  setText('top-prestige', `환생 ${state.legacy.prestigeCount}`);
  setText('top-points', `✨ ${state.legacy.points}`);
}

// 여러 타일 선택 시 업그레이드 계획: 낮은 레벨부터 골드가 닿는 만큼
export function upgradePlan(state, tiles) {
  const plan = []; let gold = state.run.gold[PLAYER], total = 0;
  for (const t of [...tiles].filter(t => t.level < MAX_LEVEL).sort((a, b) => a.level - b.level)) {
    const c = upgradeCost(t, state);
    if (gold < c) break;
    gold -= c; total += c; plan.push(t);
  }
  return { tiles: plan, cost: total };
}

// 특화 건물 버튼 줄: 선택한 내 땅에 대해 (비용 합계, 이미 지은 것 표시). 내 땅이 없으면 숨김
function updateBuildRow(state, selected) {
  const row = $('p-build'); if (!row) return;
  if (!selected.length) { row.hidden = true; return; }
  row.hidden = false;
  const gold = state.run.gold[PLAYER];
  for (const b of row.querySelectorAll('[data-build]')) {
    const key = b.dataset.build;
    if (!key) { const any = selected.some(t => t.build); b.disabled = !any; continue; }
    const need = selected.filter(t => t.build !== key);
    const cost = need.reduce((s, t) => s + buildCost(state, t), 0);
    const all = need.length === 0;
    b.classList.toggle('active', all);
    b.disabled = all || gold < (need.length ? buildCost(state, need[0]) : 0);
    // 배율: 하나 선택이면 그 땅, 여럿이면 평균
    const m = selected.reduce((s, t) => s + buildMul(state.run, t, key), 0) / selected.length;
    const mt = Math.abs(m - 1) < 0.05 ? '' : ` ×${m.toFixed(1)}`;
    b.classList.toggle('good', m >= 1.25); b.classList.toggle('bad', m <= 0.75);
    setText(b.id, `${BUILDINGS[key].icon}${BUILDINGS[key].name}${mt}${all ? ' ✓' : ` 💰${formatNum(cost)}`}`);
  }
}

export function updatePanel(state, { selected = [], inspect = null, multi = false, ratio = 0.5 } = {}) {
  const btn = $('btn-upgrade');
  const setBtn = (disabled, text) => { if (btn.disabled !== disabled) btn.disabled = disabled; setText('btn-upgrade', text); };
  $('btn-multi').classList.toggle('active', multi);
  updateBuildRow(state, selected);
  if (selected.length > 1) {
    const soldiers = selected.reduce((s, t) => s + t.soldiers, 0);
    setHtml('p-title', `<span style="color:${ownerColor(PLAYER)}">■</span> 내 땅 ${selected.length}개 선택`);
    setText('p-stats', `병사 합계 ${Math.floor(soldiers)} · 보낼 병사 ${Math.floor(soldiers * ratio)} (${Math.round(ratio * 100)}%)\n목적지를 탭하면 전부 거기로 이동/공격`);
    const plan = upgradePlan(state, selected);
    if (plan.tiles.length) setBtn(false, `업그레이드 ${plan.tiles.length}개 (💰 ${formatNum(plan.cost)})`);
    else setBtn(true, selected.every(t => t.level >= MAX_LEVEL) ? '최대 레벨' : '업그레이드 (골드 부족)');
    return;
  }
  const tile = selected[0] || inspect;
  const run = state.run;
  if (!tile) {
    const map = MAPS[run.map] || MAPS.hex;
    const perk = PERKS[run.perk];
    setText('p-title', `${map.name} · 타일을 탭하세요`);
    const lines = [];
    if (run.regions) lines.push(`★ 완전 점령 지역 ${heldRegions(run, PLAYER)} / ${regionCount(run)} · 전부 가지면 그 지역 생산 +${Math.round(regionBonus(state, PLAYER) * 100)}% (2칸 이상인 지역만)`);
    if (perk) lines.push(`${perk.icon} 이번 판 축복: ${perk.name} — ${perk.desc}`);
    setText('p-stats', lines.join('\n'));
    setBtn(true, '업그레이드'); return;
  }
  const tr = TERRAIN[tile.terrain];
  const regionName = run.regions && tile.region >= 0 ? run.regions[tile.region] + ' · ' : '';
  const bld = building(tile, run), trait = traitOf(run, tile);
  setHtml('p-title', `<span style="color:${ownerColor(tile.owner)}">■</span> ${regionName}${tr.name} · ${ownerName(tile.owner)} · Lv.${tile.level}${bld.name ? ` · ${bld.icon}${bld.name}${bld.mul !== 1 ? ` ×${bld.mul.toFixed(1)}` : ''}` : ''}`);
  const mine = tile.owner === PLAYER;
  const lines = [`병사 ${Math.floor(tile.soldiers)} / ${Math.floor(cap(tile, state))}`, `방어 +${Math.round((tr.def + (bld.def || 0)) * 100)}%${bld.name ? ` · ${bld.name}: 골드 +${Math.round(bld.gold * 100)}% 병사 +${Math.round(bld.soldiers * 100)}% 공격 +${Math.round(bld.attack * 100)}% 방어 +${Math.round(bld.def * 100)}% 한도 +${Math.round(bld.cap * 100)}%${bld.auto ? ` 자동공격 ${bld.auto.toFixed(0)}초` : ''}` : ''}`];
  if (mine) {
    const best = bestBuilding(run, tile);
    lines.push(`${trait ? `${trait.icon} ${trait.name} 지역 (${trait.desc}) · ` : ''}이 땅에 맞는 건물: ${BUILDINGS[best.key].icon}${BUILDINGS[best.key].name} ×${best.m.toFixed(1)}`);
  }
  if (run.regions && tile.region >= 0) {
    const h = regionHolders(run)[tile.region];
    if (h !== null && h !== undefined && h !== NEUTRAL) lines.push(`★ ${run.regions[tile.region]} 완전 점령 (${ownerName(h)}) · 생산 +${Math.round(regionBonus(state, h) * 100)}%`);
  }
  if (tile.battle && tile.battle.parties.length) lines.push(`⚔ ${tile.battle.parties.length > 1 ? '난전' : '전투 중'}: ${tile.battle.parties.map(p => `${ownerName(p.owner)} ${Math.floor(p.soldiers)}`).join(' · ')} vs 수비 ${Math.floor(tile.soldiers)} · 더 보내면 합류`);
  if (mine) lines.push(`생산 골드 ${goldRate(state, tile).toFixed(2)}/초 · 병사 ${soldierRate(state, tile).toFixed(2)}/초`);
  else lines.push(`점령하려면 ${Math.floor(tile.soldiers * (1 + tr.def)) + 1}명 넘게 보내야 함`);
  setText('p-stats', lines.join('\n'));
  if (mine && tile.level < MAX_LEVEL) {
    const cost = upgradeCost(tile, state);
    setBtn(state.run.gold[PLAYER] < cost, `업그레이드 Lv.${tile.level + 1} (💰 ${formatNum(cost)})`);
  } else setBtn(true, mine ? '최대 레벨' : '업그레이드');
}

export function setRatioButtons(ratio) {
  document.querySelectorAll('.ratio-btn').forEach(b => b.classList.toggle('active', Number(b.dataset.r) === ratio));
}

let hintTimer = 0, hintDefault = '';
export function setHint(text) { hintDefault = text; if (!hintTimer) setText('hint', text); }
// 잠깐 보였다가 기본 안내로 돌아가는 메시지
export function flashHint(text, ms = 2000) {
  clearTimeout(hintTimer); setText('hint', text);
  hintTimer = setTimeout(() => { hintTimer = 0; setText('hint', hintDefault); }, ms);
}

export function bindButtons({ onUpgrade, onRatio, onMenu, onMulti, onAll, onCenter, onBuild }) {
  $('btn-upgrade').addEventListener('click', onUpgrade);
  document.querySelectorAll('[data-build]').forEach(b => b.addEventListener('click', () => onBuild && onBuild(b.dataset.build || null)));
  document.querySelectorAll('.ratio-btn').forEach(b => b.addEventListener('click', () => onRatio(Number(b.dataset.r))));
  $('btn-menu').addEventListener('click', onMenu);
  $('btn-multi').addEventListener('click', onMulti);
  $('btn-all').addEventListener('click', onAll);
  $('btn-center').addEventListener('click', onCenter);
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

export function attachCanvasInput(canvas, cam, { onTap, onDrag = null, isSelectMode = () => false, onChange, minScale = 0.4, maxScale = 2.5 }) {
  const pointers = new Map();
  let start = null, moved = 0, pinchDist = 0, prevCenter = null;
  const pos = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const center = () => { const [a, b] = [...pointers.values()]; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, pos(e));
    if (pointers.size === 1) { start = { p: pos(e), t: performance.now() }; moved = 0; }
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinchDist = Math.hypot(a[0] - b[0], a[1] - b[1]); prevCenter = center(); }
  });
  canvas.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId), cur = pos(e);
    pointers.set(e.pointerId, cur);
    if (pointers.size === 1) {
      const before = moved;
      moved += Math.hypot(cur[0] - prev[0], cur[1] - prev[1]);
      if (isSelectMode() && onDrag) {
        // 선택 모드: 한 손가락 드래그는 지나가는 타일을 선택 (8px 넘게 움직인 뒤부터, 시작점도 포함)
        if (moved >= 8) { if (before < 8) onDrag(start.p[0], start.p[1]); onDrag(cur[0], cur[1]); }
      } else { cam.x -= (cur[0] - prev[0]) / cam.scale; cam.y -= (cur[1] - prev[1]) / cam.scale; }
    } else if (pointers.size === 2) {
      // 두 손가락: 벌리면 확대, 함께 움직이면 이동
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinchDist > 0) cam.scale = Math.min(maxScale, Math.max(minScale, cam.scale * (d / pinchDist)));
      const c = center();
      if (prevCenter) { cam.x -= (c[0] - prevCenter[0]) / cam.scale; cam.y -= (c[1] - prevCenter[1]) / cam.scale; }
      prevCenter = c; pinchDist = d; moved += 100;
    }
    onChange && onChange();
  });
  const end = e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pointers.size === 0 && start && moved < 8 && performance.now() - start.t < 400) onTap(start.p[0], start.p[1]);
    if (pointers.size === 0) start = null;
    pinchDist = 0; prevCenter = null;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('wheel', e => { e.preventDefault(); cam.scale = Math.min(maxScale, Math.max(minScale, cam.scale * (e.deltaY < 0 ? 1.1 : 0.9))); onChange && onChange(); }, { passive: false });
}
