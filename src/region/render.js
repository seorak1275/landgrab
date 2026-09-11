// 사단전 지도 그리기: 지역 다각형(주인 색), 경계, 뱃길, 라벨(이름·🛡방어·⚔사단·풀 막대), 행군 부대, 반란·전투 연출
import { MAP, NEUTRAL, PLAYER, OFF, party } from './game.js';
import { FACTION_COLORS, NEUTRAL_COLOR, ownerColor, ownerTag, isColorblind, worldToScreen, screenToWorld } from '../render.js';
import { pointInPoly } from '../mapgen.js';

export const SCALE = 1400; // 지도 단위(폭 1) → 월드 픽셀
// 권역 판이면 그 권역만 담는 범위 (판 밖 지역은 그리지 않는다)
export function bounds(state = null) {
  if (!state) return [0, 0, SCALE, SCALE * MAP.height];
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  state.run.regions.forEach((r, i) => { if (r.owner === OFF) return; const x = bboxes[i]; b[0] = Math.min(b[0], x[0]); b[1] = Math.min(b[1], x[1]); b[2] = Math.max(b[2], x[2]); b[3] = Math.max(b[3], x[3]); });
  return b[0] === Infinity ? [0, 0, SCALE, SCALE * MAP.height] : [b[0] * SCALE, b[1] * SCALE, b[2] * SCALE, b[3] * SCALE];
}
export const centerOf = id => [MAP.regions[id].c[0] * SCALE, MAP.regions[id].c[1] * SCALE];
const hex = (h, a) => `rgba(${parseInt(h.slice(1, 3), 16)},${parseInt(h.slice(3, 5), 16)},${parseInt(h.slice(5, 7), 16)},${a})`;

// 화면 좌표 → 지역 id (bbox → 점-다각형)
const bboxes = MAP.regions.map(r => { const b = [Infinity, Infinity, -Infinity, -Infinity]; for (const p of r.polys) for (const [x, y] of p) { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); } return b; });
export const regionBox = id => bboxes[id]; // [x0,y0,x1,y1] (지도 단위)
export function pickRegion(cam, W, H, sx, sy, run = null) {
  const [wx, wy] = screenToWorld(cam, W, H, sx, sy); const x = wx / SCALE, y = wy / SCALE;
  let best = null;
  for (let i = 0; i < MAP.regions.length; i++) {
    if (run && run.regions[i].owner === OFF) continue;
    const b = bboxes[i]; if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
    for (const p of MAP.regions[i].polys) if (pointInPoly(p, x, y)) { const r = MAP.regions[i]; const d = (r.c[0] - x) ** 2 + (r.c[1] - y) ** 2; if (!best || d < best.d) best = { i, d }; }
  }
  if (best) return best.i;
  // 부산 중구처럼 아주 작은 지역은 손가락으로 정확히 찍기 어렵다 → 24px 안에서 가장 가까운 지역
  let near = null;
  for (let i = 0; i < MAP.regions.length; i++) {
    if (run && run.regions[i].owner === OFF) continue;
    const [rx, ry] = MAP.regions[i].c;
    const d = Math.hypot((rx - x) * SCALE * cam.scale, (ry - y) * SCALE * cam.scale);
    if (d <= 24 && (!near || d < near.d)) near = { i, d };
  }
  return near ? near.i : null;
}
function tracePolys(ctx, cam, W, H, r) {
  for (const p of r.polys) { p.forEach(([x, y], i) => { const [sx, sy] = worldToScreen(cam, W, H, x * SCALE, y * SCALE); i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); }); ctx.closePath(); }
}

export function draw(ctx, state, cam, W, H, { selected = null, inspect = null, effects = [], marks = {}, peace = null } = {}) {
  const run = state.run, s = cam.scale;
  ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#17242f'; ctx.fillRect(0, 0, W, H);
  const [x0, y0] = worldToScreen(cam, W, H, 0, 0), [x1, y1] = worldToScreen(cam, W, H, SCALE, SCALE * MAP.height);
  // 화면 밖 건너뛰기. y는 지도 높이(MAP.height)로 나눠야 한다 — 안 그러면 확대할수록 어긋나
  // (6% × 지도 전체 높이라 24배에선 2,000px 넘게 틀려서 지역이 통째로 안 그려졌다)
  const visible = i => {
    const b = bboxes[i], Hm = MAP.height;
    const ax = x0 + (x1 - x0) * b[0], bx = x0 + (x1 - x0) * b[2];
    const ay = y0 + (y1 - y0) * (b[1] / Hm), by = y0 + (y1 - y0) * (b[3] / Hm);
    return bx > -20 && by > -20 && ax < W + 20 && ay < H + 20;
  };
  // 1. 채우기
  for (let i = 0; i < MAP.regions.length; i++) {
    if (!visible(i)) continue;
    const r = run.regions[i];
    if (r.owner === OFF) continue; // 이 판에 없는 지역
    ctx.beginPath(); tracePolys(ctx, cam, W, H, MAP.regions[i]);
    ctx.fillStyle = r.owner === NEUTRAL ? '#3a4a58' : hex(ownerColor(r.owner), 0.6); ctx.fill();
    if (r.iso) { ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fill(); } // 고립(본국과 끊김)은 어둡게
    if (peace && peace.has(r.owner)) { ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]); } // 🤝 정전 중인 세력
    const mark = marks[i];
    if (mark) { ctx.fillStyle = mark === 'win' ? 'rgba(111,227,143,0.35)' : mark === 'lose' ? 'rgba(255,123,123,0.35)' : 'rgba(255,255,255,0.18)'; ctx.fill(); }
    if (r.battle) { ctx.fillStyle = `rgba(255,255,255,${0.15 + 0.15 * Math.sin(Date.now() / 120)})`; ctx.fill(); }
  }
  // 2. 경계 (주인 다른 경계는 굵게)
  ctx.lineJoin = 'round';
  for (let i = 0; i < MAP.regions.length; i++) {
    if (!visible(i) || run.regions[i].owner === OFF) continue;
    ctx.beginPath(); tracePolys(ctx, cam, W, H, MAP.regions[i]);
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = Math.max(0.6, Math.min(3, 0.9 * s)); ctx.stroke(); // 많이 확대해도 3px까지만 (안 그러면 경계가 20px 뭉텅이가 된다)
  }
  // 3. 뱃길
  ctx.setLineDash([6, 5]); ctx.strokeStyle = 'rgba(120,200,255,0.55)'; ctx.lineWidth = 1.5;
  for (const [a, b] of MAP.sea) {
    if (run.regions[a].owner === OFF || run.regions[b].owner === OFF) continue; const [ax, ay] = worldToScreen(cam, W, H, ...centerOf(a)), [bx, by] = worldToScreen(cam, W, H, ...centerOf(b)); ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); }
  ctx.setLineDash([]);
  // 4. 선택·조사 테두리
  for (const [id, color, w] of [[inspect, '#fff', 2], [selected, '#fff', 3]]) {
    if (id === null || id === undefined) continue;
    ctx.beginPath(); tracePolys(ctx, cam, W, H, MAP.regions[id]); ctx.strokeStyle = color; ctx.lineWidth = w; ctx.stroke();
  }
  // 5. 라벨: 화면에서 차지하는 크기에 맞춰 이름/숫자, 서로 겹치면 큰 지역이 이긴다
  const fs = Math.max(9, Math.min(16, 7 * s));
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const cands = [];
  for (let i = 0; i < MAP.regions.length; i++) {
    if (!visible(i) || run.regions[i].owner === OFF) continue;
    const bb = bboxes[i], px = Math.min((bb[2] - bb[0]), (bb[3] - bb[1])) * SCALE * s;
    const [cx, cy] = worldToScreen(cam, W, H, ...centerOf(i));
    cands.push({ i, px, cx, cy, pick: i === selected || i === inspect });
  }
  // 선택한 지역 → 화면에서 큰 지역 순으로 자리를 잡는다 (서울처럼 빽빽한 곳에서 글씨가 겹치던 문제)
  cands.sort((a, b) => (b.pick - a.pick) || (b.px - a.px));
  const taken = [];
  const overlaps = (x0, y0, x1, y1) => taken.some(t => x0 < t[2] && x1 > t[0] && y0 < t[3] && y1 > t[1]);
  for (const c of cands) {
    const { i, px, cx, cy } = c;
    const r = run.regions[i], m = MAP.regions[i];
    // 글씨를 못 넣으면 점이라도 찍는다 (중립은 옅게)
    // 글씨를 못 넣으면 점: 주인 있는 곳은 늘, 중립은 어느 정도 커 보일 때만 (전체 보기에서 온 지도가 점으로 뒤덮이지 않게)
    const dot = () => {
      if (r.owner === NEUTRAL) return; // 중립까지 점을 찍으면 전체 보기가 점밭이 된다
      const rad = Math.max(1.5, Math.min(3, px * 0.25));
      ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.fillStyle = r.owner === NEUTRAL ? 'rgba(200,215,230,0.4)' : ownerColor(r.owner); ctx.fill();
    };
    let showName = px >= 26 || c.pick;
    let showNum = px >= 20 && (r.owner !== NEUTRAL || px >= 32);
    if (!showName && !showNum) { dot(); continue; }
    const fr = Math.max(8, Math.min(fs, px * 0.36)); // 작은 지역은 글씨도 작게
    ctx.font = `bold ${fr}px system-ui, sans-serif`;
    // 이름줄·숫자줄을 따로 잡는다. 자리를 조금 좁게 봐서(0.8) 살짝 스치는 건 허용 — 그래야 서울에서도 이름이 많이 남는다
    const place = (w, h, x, y) => {
      const b = [x - w / 2, y - h / 2, x + w / 2, y + h / 2];
      if (!c.pick && overlaps(...b)) return false;
      taken.push(b); return true;
    };
    const wName = showName ? ctx.measureText(m.n).width * 0.8 : 0;
    const wNum = showNum ? ctx.measureText(`🛡${Math.floor(r.def)} ⚔${Math.floor(r.div)}`).width * 0.8 : 0;
    if (showName) showName = place(wName, fr * 0.85, cx, cy - (showNum ? fr * 0.7 : 0));
    if (showNum) showNum = place(wNum, fr * 0.85, cx, cy + (showName ? fr * 0.6 : 0));
    if (!showName && !showNum) { dot(); continue; }
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    if (showName) {
      const nm = r.provFull ? `★${m.n}` : m.n; // ★ = 그 시·도를 통째로 가진 상태
      ctx.font = `bold ${fr}px system-ui, sans-serif`; ctx.fillStyle = r.provFull ? '#ffe9a8' : '#fff';
      ctx.strokeText(nm, cx, cy - (showNum ? fr * 0.7 : 0)); ctx.fillText(nm, cx, cy - (showNum ? fr * 0.7 : 0));
    }
    if (showNum) {
      const y = cy + (showName ? fr * 0.6 : 0);
      ctx.font = `bold ${fr}px system-ui, sans-serif`;
      const txt = r.owner === NEUTRAL ? `🛡${Math.floor(r.def)}` : `${r.iso ? '⛓' : ''}🛡${Math.floor(r.def)} ⚔${Math.floor(r.div)}`;
      ctx.fillStyle = '#fff'; ctx.strokeText(txt, cx, y); ctx.fillText(txt, cx, y);
      if (isColorblind() && r.owner !== NEUTRAL) { ctx.font = `bold ${fr * 0.8}px system-ui, sans-serif`; ctx.fillStyle = ownerColor(r.owner); ctx.strokeText(ownerTag(r.owner), cx + fr * 2.4, cy - fr * 0.7); ctx.fillText(ownerTag(r.owner), cx + fr * 2.4, cy - fr * 0.7); }
      if (r.battle && r.battle.parties.length) {
        const lead = r.battle.parties.reduce((a, b) => (b.size * b.am > a.size * a.am ? b : a));
        ctx.font = `bold ${fr}px system-ui, sans-serif`; ctx.fillStyle = ownerColor(lead.owner);
        const bl = `⚔${Math.floor(r.battle.parties.reduce((t, p) => t + p.size, 0))}${r.battle.parties.length > 1 ? '난전' : ''}`;
        ctx.strokeText(bl, cx, y - fr * 1.4); ctx.fillText(bl, cx, y - fr * 1.4);
      }
    }
  }
  // 5-b. 전투 진행바: 수비 : 공격 전력 비율 (누가 이기고 있는지 한눈에)
  for (const r of run.regions) {
    if (!r.battle || !r.battle.parties.length) continue;
    const i = r.id; if (!visible(i)) continue;
    const bb = bboxes[i], px = Math.min(bb[2] - bb[0], bb[3] - bb[1]) * SCALE * s;
    if (px < 22) continue;
    const [cx, cy] = worldToScreen(cam, W, H, ...centerOf(i));
    const w = Math.min(72, Math.max(26, px * 0.8)), h = Math.max(3, Math.min(6, px * 0.06));
    const D = (r.def + r.div) || 0;
    const parts = [{ owner: r.owner, v: D }, ...r.battle.parties.map(p => ({ owner: p.owner, v: p.size * p.am }))].filter(x => x.v > 0);
    const tot = parts.reduce((t, x) => t + x.v, 0) || 1;
    let x = cx - w / 2; const y = cy + fs * 1.5;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    for (const p of parts) { const seg = w * p.v / tot; ctx.fillStyle = p.owner === NEUTRAL ? '#8a97a3' : ownerColor(p.owner); ctx.fillRect(x, y, seg, h); x += seg; }
  }
  // 6. 반란 대기: 목표에 ✊ 깜빡임 (주인 색)
  for (const rb of run.rebels) {
    const [cx, cy] = worldToScreen(cam, W, H, ...centerOf(rb.target));
    ctx.globalAlpha = 0.5 + 0.5 * Math.sin(Date.now() / 150); ctx.font = `bold ${fs * 1.4}px system-ui, sans-serif`;
    ctx.fillStyle = ownerColor(rb.owner); ctx.strokeText(`✊${rb.size}`, cx, cy - fs * 2); ctx.fillText(`✊${rb.size}`, cx, cy - fs * 2); ctx.globalAlpha = 1;
  }
  // 7. 행군 부대: 경로(무게중심 연결) 위 원
  for (const a of run.armies) {
    const k = Math.min(Math.floor(a.pos), a.path.length - 1), u = a.pos - k;
    const [px, py] = worldToScreen(cam, W, H, ...centerOf(a.path[k])), [nx, ny] = worldToScreen(cam, W, H, ...centerOf(a.path[Math.min(k + 1, a.path.length - 1)]));
    const x = px + (nx - px) * u, y = py + (ny - py) * u;
    if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
    const rad = Math.max(5, fs * 0.7);
    ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fillStyle = ownerColor(a.owner); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.font = `bold ${Math.max(8, fs * 0.8)}px system-ui, sans-serif`; ctx.fillStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.strokeText(String(Math.floor(a.size)), x, y); ctx.fillText(String(Math.floor(a.size)), x, y);
  }
  // 8. 연출: 점령 고리, 봉기 터짐
  for (const e of effects) {
    const [cx, cy] = worldToScreen(cam, W, H, ...centerOf(e.id));
    if (e.flag) { // 점령: 깃발이 솟아오른다
      const up = fs * (0.6 + e.t * 2.2);
      ctx.globalAlpha = 1 - e.t * e.t; ctx.font = `${fs * 1.6}px system-ui, sans-serif`; ctx.textAlign = 'center';
      ctx.fillStyle = e.color; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.strokeText('🏳', cx, cy - up); ctx.fillText('🏳', cx, cy - up); ctx.globalAlpha = 1;
    }
    ctx.beginPath(); ctx.arc(cx, cy, fs * (1 + e.t * 3), 0, Math.PI * 2);
    ctx.strokeStyle = e.color; ctx.globalAlpha = 1 - e.t; ctx.lineWidth = 3; ctx.stroke(); ctx.globalAlpha = 1;
    if (e.text) { ctx.font = `bold ${fs * 1.3}px system-ui, sans-serif`; ctx.fillStyle = e.color; ctx.globalAlpha = 1 - e.t * e.t; ctx.strokeText(e.text, cx, cy - fs * (1 + e.t * 2)); ctx.fillText(e.text, cx, cy - fs * (1 + e.t * 2)); ctx.globalAlpha = 1; }
  }
}
