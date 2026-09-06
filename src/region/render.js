// 사단전 지도 그리기: 지역 다각형(주인 색), 경계, 뱃길, 라벨(이름·🛡방어·⚔사단·풀 막대), 행군 부대, 반란·전투 연출
import { MAP, NEUTRAL, PLAYER, party } from './game.js';
import { FACTION_COLORS, NEUTRAL_COLOR, ownerColor, ownerTag, isColorblind, worldToScreen, screenToWorld } from '../render.js';
import { pointInPoly } from '../mapgen.js';

export const SCALE = 1400; // 지도 단위(폭 1) → 월드 픽셀
export const bounds = () => [0, 0, SCALE, SCALE * MAP.height];
export const centerOf = id => [MAP.regions[id].c[0] * SCALE, MAP.regions[id].c[1] * SCALE];
const hex = (h, a) => `rgba(${parseInt(h.slice(1, 3), 16)},${parseInt(h.slice(3, 5), 16)},${parseInt(h.slice(5, 7), 16)},${a})`;

// 화면 좌표 → 지역 id (bbox → 점-다각형)
const bboxes = MAP.regions.map(r => { const b = [Infinity, Infinity, -Infinity, -Infinity]; for (const p of r.polys) for (const [x, y] of p) { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); } return b; });
export function pickRegion(cam, W, H, sx, sy) {
  const [wx, wy] = screenToWorld(cam, W, H, sx, sy); const x = wx / SCALE, y = wy / SCALE;
  let best = null;
  for (let i = 0; i < MAP.regions.length; i++) {
    const b = bboxes[i]; if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
    for (const p of MAP.regions[i].polys) if (pointInPoly(p, x, y)) { const r = MAP.regions[i]; const d = (r.c[0] - x) ** 2 + (r.c[1] - y) ** 2; if (!best || d < best.d) best = { i, d }; }
  }
  return best ? best.i : null;
}
function tracePolys(ctx, cam, W, H, r) {
  for (const p of r.polys) { p.forEach(([x, y], i) => { const [sx, sy] = worldToScreen(cam, W, H, x * SCALE, y * SCALE); i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); }); ctx.closePath(); }
}

export function draw(ctx, state, cam, W, H, { selected = null, inspect = null, effects = [], marks = {} } = {}) {
  const run = state.run, s = cam.scale;
  ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#17242f'; ctx.fillRect(0, 0, W, H);
  const [x0, y0] = worldToScreen(cam, W, H, 0, 0), [x1, y1] = worldToScreen(cam, W, H, SCALE, SCALE * MAP.height);
  const visible = i => { const b = bboxes[i]; const ax = x0 + (x1 - x0) * b[0], ay = y0 + (y1 - y0) * b[1], bx = x0 + (x1 - x0) * b[2], by = y0 + (y1 - y0) * b[3]; return bx > -20 && by > -20 && ax < W + 20 && ay < H + 20; };
  // 1. 채우기
  for (let i = 0; i < MAP.regions.length; i++) {
    if (!visible(i)) continue;
    const r = run.regions[i];
    ctx.beginPath(); tracePolys(ctx, cam, W, H, MAP.regions[i]);
    ctx.fillStyle = r.owner === NEUTRAL ? '#3a4a58' : hex(ownerColor(r.owner), 0.6); ctx.fill();
    const mark = marks[i];
    if (mark) { ctx.fillStyle = mark === 'win' ? 'rgba(111,227,143,0.35)' : mark === 'lose' ? 'rgba(255,123,123,0.35)' : 'rgba(255,255,255,0.18)'; ctx.fill(); }
    if (r.battle) { ctx.fillStyle = `rgba(255,255,255,${0.15 + 0.15 * Math.sin(Date.now() / 120)})`; ctx.fill(); }
  }
  // 2. 경계 (주인 다른 경계는 굵게)
  ctx.lineJoin = 'round';
  for (let i = 0; i < MAP.regions.length; i++) {
    if (!visible(i)) continue;
    ctx.beginPath(); tracePolys(ctx, cam, W, H, MAP.regions[i]);
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = Math.max(0.6, 0.9 * s); ctx.stroke();
  }
  // 3. 뱃길
  ctx.setLineDash([6, 5]); ctx.strokeStyle = 'rgba(120,200,255,0.55)'; ctx.lineWidth = 1.5;
  for (const [a, b] of MAP.sea) { const [ax, ay] = worldToScreen(cam, W, H, ...centerOf(a)), [bx, by] = worldToScreen(cam, W, H, ...centerOf(b)); ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); }
  ctx.setLineDash([]);
  // 4. 선택·조사 테두리
  for (const [id, color, w] of [[inspect, '#fff', 2], [selected, '#fff', 3]]) {
    if (id === null || id === undefined) continue;
    ctx.beginPath(); tracePolys(ctx, cam, W, H, MAP.regions[id]); ctx.strokeStyle = color; ctx.lineWidth = w; ctx.stroke();
  }
  // 5. 라벨: 축척에 따라 이름 / 숫자
  const fs = Math.max(9, Math.min(16, 7 * s));
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = 0; i < MAP.regions.length; i++) {
    if (!visible(i)) continue;
    const r = run.regions[i], m = MAP.regions[i];
    const [cx, cy] = worldToScreen(cam, W, H, ...centerOf(i));
    const showName = s >= 1.6 || i === selected || i === inspect;
    const showNum = s >= 1.0 && (r.owner !== NEUTRAL || s >= 1.6);
    if (!showName && !showNum) { // 멀리서: 점 하나
      if (r.owner !== NEUTRAL) { ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, Math.PI * 2); ctx.fillStyle = ownerColor(r.owner); ctx.fill(); }
      continue;
    }
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    if (showName) { ctx.font = `bold ${fs}px system-ui, sans-serif`; ctx.fillStyle = '#fff'; ctx.strokeText(m.n, cx, cy - (showNum ? fs * 0.7 : 0)); ctx.fillText(m.n, cx, cy - (showNum ? fs * 0.7 : 0)); }
    if (showNum) {
      const y = cy + (showName ? fs * 0.6 : 0);
      ctx.font = `bold ${fs}px system-ui, sans-serif`;
      const txt = r.owner === NEUTRAL ? `🛡${Math.floor(r.def)}` : `🛡${Math.floor(r.def)} ⚔${Math.floor(r.div)}`;
      ctx.fillStyle = '#fff'; ctx.strokeText(txt, cx, y); ctx.fillText(txt, cx, y);
      if (isColorblind() && r.owner !== NEUTRAL) { ctx.font = `bold ${fs * 0.8}px system-ui, sans-serif`; ctx.fillStyle = ownerColor(r.owner); ctx.strokeText(ownerTag(r.owner), cx + fs * 2.4, cy - fs * 0.7); ctx.fillText(ownerTag(r.owner), cx + fs * 2.4, cy - fs * 0.7); }
      if (r.battle && r.battle.parties.length) {
        const lead = r.battle.parties.reduce((a, b) => (b.size * b.am > a.size * a.am ? b : a));
        ctx.font = `bold ${fs}px system-ui, sans-serif`; ctx.fillStyle = ownerColor(lead.owner);
        const bl = `⚔${Math.floor(r.battle.parties.reduce((t, p) => t + p.size, 0))}${r.battle.parties.length > 1 ? '난전' : ''}`;
        ctx.strokeText(bl, cx, y - fs * 1.4); ctx.fillText(bl, cx, y - fs * 1.4);
      }
    }
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
    ctx.beginPath(); ctx.arc(cx, cy, fs * (1 + e.t * 3), 0, Math.PI * 2);
    ctx.strokeStyle = e.color; ctx.globalAlpha = 1 - e.t; ctx.lineWidth = 3; ctx.stroke(); ctx.globalAlpha = 1;
    if (e.text) { ctx.font = `bold ${fs * 1.3}px system-ui, sans-serif`; ctx.fillStyle = e.color; ctx.globalAlpha = 1 - e.t * e.t; ctx.strokeText(e.text, cx, cy - fs * (1 + e.t * 2)); ctx.fillText(e.text, cx, cy - fs * (1 + e.t * 2)); ctx.globalAlpha = 1; }
  }
}
