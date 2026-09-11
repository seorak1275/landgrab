// 사단전 모드 순수 시뮬 (docs/superpowers/specs/2026-09-06-region-division-mode.md)
// 지역 = 칸. 모든 내 지역의 생산력이 세력 하나의 인력 풀(run.pool[f], 한도 500)에 모이고 → 어느 지역이든 방어인력 / 사단으로 배치. 사단은 인접 그래프를 행군. 남의 지역엔 반란.
import MAP from '../maps/sgg.js';
import { mulberry32 } from '../rng.js';
import { PERKS, perkOf } from '../perks.js';
import { DIFFICULTIES, DEFAULT_DIFFICULTY } from '../sim.js';
import { rankBonus, generalMul } from '../career.js';

export { MAP };
export const PLAYER = 0, NEUTRAL = -1, OFF = -2; // OFF = 이 판(권역)에 없는 지역
export const ISO_PROD = 0.4, ISO_DEF = 0.8; // 고립(본국과 내 지역으로 이어지지 않음) 지역의 생산·수비 배율
// 권역 판: 같은 시·군·구 데이터에서 일부만 잘라 쓴다 (지역이 적어 판이 짧고, 특성 분포가 달라 상성이 다르다)
export const BOARDS = {
  // home = 기본 시작 지역. 예전엔 속초시·울진군처럼 어려운 곳이 기본이었다
  // ("강원도에서 항상 시작하는 건 너무 힘들다") → 기본은 무난한 곳, 어려운 곳은 골라서 가는 재미로
  all:      { name: '전국',      ps: null,                                                      home: '수원 장안구', desc: '251개 시·군·구 · 길고 넓은 판' },
  capital:  { name: '수도권',    ps: ['서울', '인천', '경기'],                                   home: '고양 덕양구', desc: '서울·인천·경기 79곳 · 🏙도시가 많아 병영·사단 싸움' },
  yeongnam: { name: '영남',      ps: ['부산', '대구', '울산', '경북', '경남'],                    home: '창원 의창구', desc: '부산·대구·울산·경북·경남 75곳 · ⛰산악 수비가 세다' },
  honam:    { name: '호남·충청', ps: ['광주', '대전', '세종', '충북', '충남', '전북', '전남'],     home: '광주 북구', desc: '광주·대전·세종·충청·전라 77곳 · 🌾평야라 치고받기 쉽다' },
};
export const DEFAULT_BOARD = 'all';
// AI 수는 판 크기에서 뽑는다: 지역 45곳당 한 세력(최소 2, 최대 6).
// 권역 판(75~79곳)에 전국과 같은 4~6세력을 넣었더니 전국보다 3배 빽빽해 보통 난이도에서도 무너졌다
export const REGIONS_PER_AI = 45;
export function maxAiFor(board) { return Math.max(2, Math.min(6, Math.round(boardIds(board).length / REGIONS_PER_AI))); }
// 시작 지역(수도) 후보. 속초는 산악(중립 수비 ×1.5)에 이웃 셋이 전부 군(생산 1)이라 가장 불리하다 —
// "강원도에서 항상 시작하는 건 너무 힘들다"는 피드백으로 고를 수 있게 했다. 난이도는 봇 실측으로 붙였다
// tag/desc 는 봇 실측(지옥, 시드 5개 평균 10분 지역 수)으로 붙였다
export const HOMES = {
  all: [
    { n: '수원 장안구', tag: '쉬움',   desc: '🌾평야 한가운데, 이웃 다섯이 전부 생산 2 안팎 (10분 126곳)' },
    { n: '전주 완산구', tag: '보통',   desc: '호남 평야, 뒤가 트여 있다 (10분 100곳)' },
    { n: '청주 흥덕구', tag: '보통',   desc: '나라 한복판, 사방으로 뻗는다 (10분 99곳)' },
    { n: '천안 서북구', tag: '보통',   desc: '수도권과 충청 사이 길목 (10분 94곳)' },
    { n: '창원 의창구', tag: '어려움', desc: '🌊해안, 등 뒤는 안전하지만 앞이 좁다 (10분 89곳)' },
    { n: '속초시',      tag: '어려움', desc: '⛰설악산. 이웃 셋이 전부 산악 군이라 초반이 답답하다 (10분 85곳)' },
    { n: '안동시',      tag: '도전',   desc: '경북 산속, 생산이 낮고 사방이 산 (10분 50곳)' },
    { n: '제주시',      tag: '도전',   desc: '섬. 뱃길 하나로만 이어져 나가기 어렵다 (10분 48곳)' },
  ],
  capital: [
    { n: '고양 덕양구', tag: '쉬움',   desc: '서울 서북, 넓은 배후지 (10분 57곳)' },
    { n: '수원 장안구', tag: '보통',   desc: '경기 남부 중심 (10분 47곳)' },
    { n: '연천군',      tag: '어려움', desc: '최북단, 이웃이 적다 (10분 41곳)' },
    { n: '인천 서구',   tag: '도전',   desc: '해안에 몰려 시작한다 (10분 30곳)' },
  ],
  yeongnam: [
    { n: '창원 의창구', tag: '쉬움',   desc: '경남 해안 중심 (10분 47곳)' },
    { n: '포항 북구',   tag: '보통',   desc: '동해안에서 내륙으로 (10분 38곳)' },
    { n: '달서구',      tag: '보통',   desc: '대구 도심, 병영이 세다' },
    { n: '울진군',      tag: '도전',   desc: '산악 끝자락 (10분 17곳)' },
  ],
  honam: [
    { n: '광주 북구',   tag: '쉬움',   desc: '호남 도심 (10분 66곳)' },
    { n: '전주 완산구', tag: '보통',   desc: '전북 평야 (10분 52곳)' },
    { n: '해남군',      tag: '어려움', desc: '땅끝, 한쪽으로만 나간다 (10분 47곳)' },
    { n: '천안 서북구', tag: '도전',   desc: '북쪽 끝에서 남으로 밀고 내려간다 (10분 31곳)' },
  ],
};
export const homesOf = board => HOMES[board] || HOMES[DEFAULT_BOARD];
export const homeNames = board => homesOf(board).map(h => h.n);
// 한 시·도(서울·강원…)를 전부 가지면 그 지역들의 생산 +30%, 수비 +15%.
// 한 판 안에 "강원도를 다 먹자" 같은 중간 목표를 만든다 (지역이 하나뿐인 세종은 제외)
export const PROV_PROD = 0.3, PROV_DEF = 0.15;
const boardCache = new Map();
export function boardIds(key = DEFAULT_BOARD) {
  if (!boardCache.has(key)) {
    const b = BOARDS[key] || BOARDS[DEFAULT_BOARD];
    boardCache.set(key, MAP.regions.map((m, i) => i).filter(i => !b.ps || b.ps.includes(MAP.regions[i].p)));
  }
  return boardCache.get(key);
}
export function boardOf(state) { return BOARDS[state.run.board] || BOARDS[DEFAULT_BOARD]; }
export const provinceOf = id => MAP.regions[id].p;
const provCache = new Map();
// 판 안의 시·도 → 지역 id 목록 (지역이 2곳 이상인 시·도만 보너스 대상)
export function provinceIds(board = DEFAULT_BOARD) {
  if (!provCache.has(board)) {
    const m = new Map();
    for (const id of boardIds(board)) { const p = provinceOf(id); if (!m.has(p)) m.set(p, []); m.get(p).push(id); }
    for (const [p, ids] of [...m]) if (ids.length < 2) m.delete(p);
    provCache.set(board, m);
  }
  return provCache.get(board);
}
// 그 시·도를 통째로 가진 세력 (없으면 null)
export function provinceHolder(run, p) {
  const ids = provinceIds(run.board || DEFAULT_BOARD).get(p);
  if (!ids) return null;
  const f = run.regions[ids[0]].owner;
  if (f === NEUTRAL || f === OFF) return null;
  return ids.every(id => run.regions[id].owner === f) ? f : null;
}
export function provProgress(state, p, f = PLAYER) {
  const ids = provinceIds(state.run.board || DEFAULT_BOARD).get(p) || [];
  return { mine: ids.filter(id => state.run.regions[id].owner === f).length, total: ids.length };
}
// 그 지역에 붙는 시·도 보너스 배율 (유산 '통치' +10%p/레벨과 축복 '통합' ×2는 플레이어만)
export function provMul(state, r, kind) {
  if (!r.provFull) return 1;
  const base = kind === 'def' ? PROV_DEF : PROV_PROD;
  if (r.owner !== PLAYER) return 1 + base;
  return 1 + base * ((perkOf(state).unity || 1)) + (kind === 'prod' ? 0.1 * lv(state, 'regionBonus') : 0);
}
// 이 판에 있는 이웃만 (권역 판에서 바깥으로는 못 나간다)
export function adj(run, id) { return MAP.regions[id].adj.filter(n => run.regions[n].owner !== OFF); }
export const POOL_CAP = 500, CAP_PER_REGION = 2; // 풀 한도 = 500 + 지역당 2 (전국 251곳이면 1000). 고정 500이면 후반에 생산 대부분이 버려져 판이 안 끝났다
export const REGION_SPEED = 0.5; // 지역/초 (한 지역 건너는 데 2초)
export const REBEL_DELAY = 10, REBEL_RATIO = 0.7;
export const AMOUNTS = [10, 100, 500, 'max'];
export const TRAIT_DEF = { mountain: 1.5, city: 1.2, coast: 1.0, plain: 0.9 };
export const TRAIT_NAME = { mountain: '⛰산악', city: '🏙도시', coast: '🌊해안', plain: '🌾평야' };
// ---- 기술 연구: 한 판 동안만 남고, 인력 풀로 산다. 연구할수록 다음 값이 오른다 (AI도 같은 규칙) ----
export const TECHS = {
  drill:    { name: '집중훈련', icon: '🎯', desc: '공격력 +20%',                 cost: 200, attack: 1.2 },
  march:    { name: '고속행군', icon: '🏃', desc: '행군 속도 +50%',              cost: 200, speed: 1.5 },
  agit:     { name: '침과공작', icon: '📣', desc: '반란 봉기 비율 70% → 90%',    cost: 250, rebel: 0.9 },
  mobilize: { name: '동원령',   icon: '📯', desc: '생산 +25%',                   cost: 300, prod: 1.25 },
};
export const TECH_STEP = 1.6;
export const techsOf = (run, f) => (run.tech && run.tech[f]) || {};
export const hasTech = (run, f, key) => !!techsOf(run, f)[key];
export const techCount = (run, f) => Object.keys(techsOf(run, f)).length;
export function techCost(state, f, key) { return TECHS[key] ? Math.round(TECHS[key].cost * Math.pow(TECH_STEP, techCount(state.run, f)) * (f === PLAYER ? Math.max(0.5, 1 - 0.06 * lv(state, 'research')) : 1)) : Infinity; }
export function research(state, f, key) {
  const run = state.run;
  if (!TECHS[key] || hasTech(run, f, key)) return false;
  const c = techCost(state, f, key);
  if ((run.pool[f] || 0) < c) return false;
  run.pool[f] -= c;
  if (!run.tech) run.tech = [];
  run.tech[f] = { ...techsOf(run, f), [key]: true };
  emit({ type: 'research', owner: f, key });
  return true;
}
const techMul = (run, f, field) => Object.keys(techsOf(run, f)).reduce((m, k) => m * (TECHS[k][field] || 1), 1);

// ---- 외교: 세력 쌍마다 관계(-100~100)와 정전. 정전 중엔 서로 못 친다. 어기면 관계가 크게 깎인다 ----
export const PACT_DUR = 120, PACT_ACCEPT = 20, REL_MIN = -100, REL_MAX = 100, PROPOSE_COOLDOWN = 30;
export const BETRAY_PENALTY = 60, BETRAY_WITNESS = 15;
const pairKey = (a, b) => (a < b ? `${a}:${b}` : `${b}:${a}`);
export function relOf(state, a, b) { const R = state.run.rel; return (R && R[a] && R[a][b]) || 0; }
export function addRel(state, a, b, v) {
  const R = state.run.rel; if (!R || a === b || !R[a] || !R[b]) return;
  const x = Math.max(REL_MIN, Math.min(REL_MAX, (R[a][b] || 0) + v));
  R[a][b] = x; R[b][a] = x; // 관계는 서로 같게 본다
}
export function atPeace(state, a, b) { const p = state.run.pacts || {}; return a !== b && (p[pairKey(a, b)] || 0) > (state.run.elapsed || 0); }
export function pactLeft(state, a, b) { return Math.max(0, ((state.run.pacts || {})[pairKey(a, b)] || 0) - (state.run.elapsed || 0)); }
export function leaderOf(state) { // 지역이 가장 많은 세력 (다들 여기로 몰린다)
  let best = null;
  for (let f = 0; f < state.run.factions; f++) { const n = owned(state, f).length; if (!best || n > best.n) best = { f, n }; }
  return best ? best.f : PLAYER;
}
// 정전 제안: 받아주면 true. 사이가 나쁘거나, 상대가 크게 앞서 있거나, 내가 선두면 거절한다
export function pactAccepts(state, from, to) {
  if (from === to || atPeace(state, from, to)) return false;
  const rel = relOf(state, from, to);
  if (rel < -40) return false;
  const mine = owned(state, from).length, theirs = owned(state, to).length;
  const lead = leaderOf(state);
  if (from === lead && mine > theirs * 1.5) return false; // 선두와는 손잡지 않는다
  return rel + (theirs < mine ? 0 : 25) + (lead !== from && lead !== to ? 25 : 0) >= PACT_ACCEPT;
}
export function refusedLeft(state, from, to) { const r = (state.run.refused || {})[pairKey(from, to)]; return r === undefined ? 0 : Math.max(0, r + PROPOSE_COOLDOWN - (state.run.elapsed || 0)); }
export function proposePact(state, from, to, force = false) {
  if (!force && refusedLeft(state, from, to) > 0) return false; // 얼마 전에 거절당했다
  if (!force && !pactAccepts(state, from, to)) {
    if (!state.run.refused) state.run.refused = {};
    state.run.refused[pairKey(from, to)] = state.run.elapsed || 0;
    return false;
  }
  if (!state.run.pacts) state.run.pacts = {};
  const dur = PACT_DUR + (from === PLAYER || to === PLAYER ? 20 * lv(state, 'envoy') : 0); // 유산 '사절'
  state.run.pacts[pairKey(from, to)] = (state.run.elapsed || 0) + dur;
  addRel(state, from, to, 10);
  emit({ type: 'pact', a: from, b: to });
  return true;
}
export function breakPact(state, betrayer, victim) {
  const p = state.run.pacts || {};
  if (!atPeace(state, betrayer, victim)) return false;
  delete p[pairKey(betrayer, victim)];
  state.run.betrayals = state.run.betrayals || {}; state.run.betrayals[betrayer] = (state.run.betrayals[betrayer] || 0) + 1;
  addRel(state, betrayer, victim, -BETRAY_PENALTY);
  for (let f = 0; f < state.run.factions; f++) if (f !== betrayer && f !== victim) addRel(state, betrayer, f, -BETRAY_WITNESS); // 남 보기에도 믿을 수 없는 자
  emit({ type: 'betray', owner: betrayer, victim });
  return true;
}
export function rebelRatio(state, f) { return hasTech(state.run, f, 'agit') ? TECHS.agit.rebel : REBEL_RATIO; }

export const AI_RAMP = 0.1, AI_RAMP_MAX = 1.0;
export const HOME = '수원 장안구'; // 기본 시작지(무난한 곳). 속초시(설악산)는 '어려움'으로 목록에 있다
export const TRUCE = 120; // 시작 뒤 이 시간(초) 동안 AI는 플레이어 지역을 치거나 반란하지 않는다 (첫 배치를 할 틈. 방치를 없앤 뒤 6분 → 2분)
export const truce = state => (state.run.elapsed || 0) < TRUCE;

const lv = (state, k) => (state.legacy && state.legacy.upgrades && state.legacy.upgrades[k]) || 0;
// 장군 효과 (유산 '통솔'로 커진다) · 고립 완화(유산 '보급술')는 플레이어에게만
const gen = (state, field) => 1 + (generalMul(state.legacy || {}, field) - 1) * (1 + 0.4 * lv(state, 'command'));
export const isoProd = (state, f) => (f === PLAYER ? Math.min(1, ISO_PROD + 0.1 * lv(state, 'supply')) : ISO_PROD);
export const isoDef = (state, f) => (f === PLAYER ? Math.min(1, ISO_DEF + 0.1 * lv(state, 'supply')) : ISO_DEF);
export function difficultyOf(state) { return DIFFICULTIES[state.legacy.difficulty] || DIFFICULTIES[DEFAULT_DIFFICULTY]; }
export function aiMul(state) { return difficultyOf(state).mul + 0.1 * state.legacy.prestigeCount + Math.min(AI_RAMP_MAX, AI_RAMP * (state.run.elapsed || 0) / 600); }
export function prodMul(state, f) { const base = f === PLAYER ? (1 + 0.1 * lv(state, 'gold') + 0.1 * lv(state, 'soldiers')) * (perkOf(state).gold || 1) * (perkOf(state).soldiers || 1) * rankBonus(state.legacy) * gen(state, 'prod') : aiMul(state); return base * techMul(state.run, f, 'prod'); }
export function attackMul(state, f) { return (f === PLAYER ? (1 + 0.05 * lv(state, 'attack')) * (perkOf(state).attack || 1) * gen(state, 'attack') : 1) * techMul(state.run, f, 'attack'); }
export function defMul(state, r) { const base = (TRAIT_DEF[MAP.regions[r.id].tr] || 1) * (r.iso ? isoDef(state, r.owner) : 1) * provMul(state, r, 'def'); return r.owner === PLAYER ? base * (1 + 0.05 * lv(state, 'wall')) * (perkOf(state).def || 1) * gen(state, 'def') : base; }
export function poolCap(state, f) { return (POOL_CAP + CAP_PER_REGION * owned(state, f).length) * (f === PLAYER ? 1 + 0.1 * lv(state, 'capBonus') : 1); }
export function speedOf(state, f) { return (f === PLAYER ? REGION_SPEED * (1 + 0.1 * lv(state, 'speed')) * (perkOf(state).speed || 1) * gen(state, 'speed') : REGION_SPEED) * techMul(state.run, f, 'speed'); }
export function prodOf(state, r) { return MAP.regions[r.id].prod * prodMul(state, r.owner) * (r.iso ? isoProd(state, r.owner) : 1) * provMul(state, r, 'prod'); }
export function aiCountFor(prestige) { return Math.min(4 + Math.floor(prestige / 3), 6); }
export const info = id => MAP.regions[id];
export const neighbors = id => MAP.regions[id].adj;

// 그래프 거리 (BFS, 전 지역)
export function bfsDist(from, board = null) {
  const inBoard = board ? new Set(boardIds(board)) : null;
  const d = new Array(MAP.regions.length).fill(-1); d[from] = 0; const q = [from];
  for (let i = 0; i < q.length; i++) for (const n of neighbors(q[i])) if (d[n] < 0 && (!inBoard || inBoard.has(n))) { d[n] = d[q[i]] + 1; q.push(n); }
  return d;
}
export let assignPersonas = () => []; // ai.js 가 채운다 (game ← ai 순환 참조를 피한다)
export function setPersonaAssigner(fn) { assignPersonas = fn; }
export function newRun(seed, legacy = {}, perk = null, board = legacy.boardPref || DEFAULT_BOARD, homeName = legacy.homePref || null) {
  const rand = mulberry32(seed);
  const pk = PERKS[perk] || {};
  const up = legacy.upgrades || {};
  const bd = BOARDS[board] ? board : DEFAULT_BOARD, ids = boardIds(bd), inBoard = new Set(ids);
  const factions = 1 + Math.min(maxAiFor(bd), Math.max(1, aiCountFor(legacy.prestigeCount || 0) + (pk.aiDelta || 0)));
  const want = homeNames(bd).includes(homeName) ? homeName : BOARDS[bd].home;
  const home = ids.find(i => MAP.regions[i].n === want) ?? ids.find(i => MAP.regions[i].n === BOARDS[bd].home);
  const capitals = [home];
  while (capitals.length < factions) { // 기존 수도들에서 가장 먼 지역 (판 안에서만)
    const ds = capitals.map(c => bfsDist(c, bd));
    let best = null;
    for (const i of ids) { if (capitals.includes(i)) continue; const d = Math.min(...ds.map(x => x[i])); if (!best || d > best.d) best = { i, d }; }
    capitals.push(best.i);
  }
  const garrisonMul = (1 - 0.04 * (up.garrison || 0)) * (pk.garrison || 1);
  const regions = MAP.regions.map((m, id) => {
    if (!inBoard.has(id)) return { id, owner: OFF, def: 0, div: 0 }; // 이 판에 없는 지역
    const f = capitals.indexOf(id);
    if (f >= 0) return { id, owner: f, def: f === PLAYER ? 60 : 30, div: (f === PLAYER ? 80 + 20 * (up.startArmy || 0) : 50) * (f === PLAYER ? (pk.startArmy || 1) : 1) };
    return { id, owner: NEUTRAL, def: Math.round((15 + m.prod * 20) * (0.8 + rand() * 0.5) * garrisonMul), div: 0 }; // 구 55·시 45·군 35 안팎
  });
  const pool = Array(factions).fill(100); pool[PLAYER] = 300 + 100 * (up.startGold || 0) + (pk.startGold || 0);
  const run = { seed, mode: 'region', board: bd, home, factions, personas: assignPersonas(seed, factions), regions, pool, capitals, tech: Array.from({ length: factions }, () => ({})), rel: Array.from({ length: factions }, () => Array(factions).fill(0)), pacts: {}, armies: [], rebels: [], aiTimers: Array(factions).fill(0), aiTurns: [], maxRegions: 1, sendRatio: 0.5, elapsed: 0, ...(perk && PERKS[perk] ? { perk } : {}) };
  refreshSupply({ legacy, run });
  return run;
}

// ---- 보급: 본국(수도, 잃으면 생산력이 가장 큰 내 지역)에서 내 지역만 밟아 닿지 않는 지역은 고립 ----
export function supplyHub(state, f) {
  const caps = state.run.capitals || [];
  const c = caps[f];
  if (c !== undefined && state.run.regions[c].owner === f) return c;
  let best = null;
  for (const r of state.run.regions) if (r.owner === f) { const p = MAP.regions[r.id].prod; if (!best || p > best.p || (p === best.p && r.id < best.id)) best = { id: r.id, p }; }
  return best ? best.id : null;
}
export function refreshSupply(state) {
  const run = state.run;
  // 시·도 완전 점령 표시 (생산·수비 보너스)
  const provs = provinceIds(run.board || DEFAULT_BOARD);
  for (const r of run.regions) if (r.owner !== OFF) r.provFull = false;
  for (const [p, ids] of provs) { const h = provinceHolder(run, p); if (h !== null) for (const id of ids) run.regions[id].provFull = true; }
  for (const r of run.regions) if (r.owner !== OFF) r.iso = r.owner !== NEUTRAL;
  for (let f = 0; f < run.factions; f++) {
    const hub = supplyHub(state, f); if (hub === null) continue;
    const seen = new Set([hub]), q = [hub];
    for (let i = 0; i < q.length; i++) for (const n of adj(run, q[i])) if (!seen.has(n) && run.regions[n].owner === f) { seen.add(n); q.push(n); }
    for (const id of seen) run.regions[id].iso = false;
  }
}
export function owned(state, f) { return state.run.regions.filter(r => r.owner === f); }
export function activeRegions(state) { return state.run.regions.filter(r => r.owner !== OFF); }
export function activeCount(state) { return activeRegions(state).length; }
export function totalPool(state, f) { return f === NEUTRAL ? 0 : (state.run.pool[f] || 0); }
export function totalProd(state, f) { return owned(state, f).reduce((s, r) => s + (r.battle ? 0 : prodOf(state, r)), 0); }
export function status(state) {
  const n = owned(state, PLAYER).length;
  if (n === 0) {
    const alive = state.run.armies.some(a => a.owner === PLAYER) || state.run.rebels.some(r => r.owner === PLAYER) || state.run.regions.some(r => r.battle && r.battle.parties.some(p => p.owner === PLAYER));
    return alive ? 'playing' : 'wiped';
  }
  return n === activeCount(state) ? 'conquered' : 'playing';
}

let listener = null;
export function setListener(fn) { listener = fn; }
const emit = e => { if (listener) listener(e); };

// ---- 배치 ----
export function amountOf(n, avail) { const a = n === 'max' ? avail : Math.min(n, avail); return Math.floor(a); }
export function allocate(state, id, kind, n) {
  const r = state.run.regions[id];
  if (!r || r.owner === NEUTRAL || r.owner === OFF) return 0;
  const a = amountOf(n, state.run.pool[r.owner]); if (a < 1) return 0;
  state.run.pool[r.owner] -= a; if (kind === 'def') r.def += a; else r.div += a;
  return a;
}

// 원터치 국경 배치: 풀을 다 써서 방어가 약한 국경 3곳에 40%, 사단이 가장 큰 국경 지역(선봉)에 60%.
// 지역이 251개나 되니 손으로 다 누르기 어렵다는 문제를 푼다 (AI·봇이 하던 것과 같은 규칙)
export function autoDeploy(state, f = PLAYER) {
  const run = state.run, mine = owned(state, f);
  if (!mine.length) return 0;
  const pool = Math.floor(run.pool[f] || 0); if (pool < 10) return 0;
  const border = mine.filter(r => adj(run, r.id).some(n => run.regions[n].owner !== f));
  const spots = (border.length ? border : mine);
  const weak = [...spots].sort((a, b) => (a.def + a.div) - (b.def + b.div)).slice(0, 3);
  let used = 0;
  const each = Math.floor(pool * 0.4 / weak.length);
  for (const r of weak) used += allocate(state, r.id, 'def', each);
  const spear = spots.reduce((a, b) => (b.div > a.div ? b : a));
  used += allocate(state, spear.id, 'div', 'max');
  return used;
}

// ---- 전투 (규칙은 sim.js와 같은 등속 소모, 편 = {owner, size, am}) ----
export function battleRate(total) { return 3 + 0.5 * Math.sqrt(total); }
function defense(state, r) { return (r.def + r.div) * defMul(state, r); }
export function effectiveDefense(state, r, owner) {
  let D = defense(state, r);
  if (r.battle) for (const p of r.battle.parties) if (p.owner !== owner) D = Math.max(D, p.size * p.am);
  return D;
}
export function party(r, owner) { return r.battle ? r.battle.parties.find(p => p.owner === owner) : undefined; }
function refreshRate(state, r) { r.battle.rate = Math.max(r.battle.rate || 0, battleRate(defense(state, r) + r.battle.parties.reduce((s, p) => s + p.size * p.am, 0))); }
function join(state, r, owner, size, am) {
  if (!r.battle) r.battle = { parties: [], rate: 0 };
  let p = party(r, owner);
  if (!p) { p = { owner, size: 0, am }; r.battle.parties.push(p); } else p.am = Math.max(p.am, am);
  p.size += size; refreshRate(state, r);
}
function battleTick(state, r, dt) {
  const b = r.battle, dm = defMul(state, r);
  let D = (r.def + r.div) * dm, alive = D > 1e-9;
  const S = b.parties.map(p => p.size * p.am); const dead = [];
  let rem = dt;
  while (rem > 0) {
    const live = S.filter(v => v > 1e-9);
    if (!(alive ? live.length >= 1 : live.length >= 2)) break;
    const loss = Math.min(b.rate * rem, ...(alive ? [D] : []), ...live);
    if (!(loss > 0)) break;
    rem -= loss / b.rate;
    if (alive) { D -= loss; if (D <= 1e-9) { D = 0; alive = false; } }
    for (let i = 0; i < S.length; i++) if (S[i] > 1e-9) { S[i] -= loss; if (S[i] <= 1e-9) { S[i] = 0; dead.push(b.parties[i]); } }
  }
  // 수비 손실은 방어인력·사단에 비례 배분
  const tot = r.def + r.div, left = D / dm;
  if (tot > 0) { r.def = left * r.def / tot; r.div = left * r.div / tot; }
  b.parties.forEach((p, i) => { p.size = S[i] / p.am; });
  b.parties = b.parties.filter(p => p.size > 1e-9);
  if (alive ? b.parties.length : b.parties.length >= 2) return;
  const prev = r.owner; delete r.battle;
  for (const p of dead) emit({ type: 'repel', id: r.id, owner: p.owner, prevOwner: prev });
  if (b.parties.length === 1) {
    const w = b.parties[0];
    const loot = 10 * (w.owner === PLAYER ? 1 + 0.5 * lv(state, 'loot') : 1); // 점령 보상: 풀에 +10 (유산 '약탈' +5/레벨)
    r.owner = w.owner; r.def = 0; r.div = w.size;
    state.run.pool[w.owner] = Math.min(poolCap(state, w.owner), state.run.pool[w.owner] + loot);
    for (const rb of state.run.rebels) if (rb.target === r.id && rb.owner === w.owner) rb.dead = true; // 내 반란은 취소
    state.run.rebels = state.run.rebels.filter(x => !x.dead);
    updateMax(state);
    emit({ type: 'capture', id: r.id, owner: w.owner, prevOwner: prev, remaining: w.size });
    if (prev !== NEUTRAL && !owned(state, prev).length) { // 마지막 지역을 빼앗아 세력을 지웠다
      state.run.kills = state.run.kills || {}; state.run.kills[w.owner] = (state.run.kills[w.owner] || 0) + 1;
      emit({ type: 'eliminate', owner: prev, by: w.owner });
    }
  } else if (!alive) { r.def = 0; r.div = 0; } // 다 같이 죽음 (수비가 이겼으면 비례 배분된 값 그대로)
}
export function runBattles(state, dt) { for (const r of state.run.regions) if (r.battle) battleTick(state, r, dt); }
export function resolveBattle(state, r) { while (r.battle) battleTick(state, r, 1e9); }
function updateMax(state) {
  const n = owned(state, PLAYER).length;
  if (n > state.run.maxRegions) state.run.maxRegions = n;
  // '기사회생' 훈장을 위한 최저 지역 수는 **자리를 잡은 뒤부터**(4곳 이상 가져본 뒤) 센다.
  // 안 그러면 판 시작이 늘 1곳이라 어떤 정복이든 기사회생이 돼 버린다
  if (state.run.maxRegions > 3 && (state.run.lowRegions === undefined || n < state.run.lowRegions)) state.run.lowRegions = n;
}

// ---- 행군 ----
function depart(state, owner, size, path) { const a = { owner, size, am: attackMul(state, owner), path, pos: 0, speed: speedOf(state, owner) }; state.run.armies.push(a); return a; }
function arrive(state, a) {
  const run = state.run, r = run.regions[a.path[a.path.length - 1]];
  run.armies.splice(run.armies.indexOf(a), 1);
  if (r.owner === a.owner) { r.div += a.size; if (r.battle) refreshRate(state, r); emit({ type: 'arrive', id: r.id, owner: a.owner, size: a.size }); }
  else { join(state, r, a.owner, a.size, a.am); emit({ type: 'engage', id: r.id, owner: a.owner, size: a.size }); }
}
export function runArmies(state, dt) {
  const run = state.run;
  for (const a of [...run.armies]) {
    let move = a.speed * dt;
    while (run.armies.includes(a) && move > 0) {
      const k = Math.floor(a.pos + 1e-9), last = a.path.length - 1;
      if (k >= last) { arrive(state, a); break; }
      const step = Math.min(move, k + 1 - a.pos); a.pos += step; move -= step;
      if (a.pos >= k + 1 - 1e-9) {
        a.pos = k + 1;
        if (k + 1 === last) { arrive(state, a); break; }
        if (run.regions[a.path[k + 1]].owner !== a.owner) { a.path = a.path.slice(0, k + 2); arrive(state, a); break; } // 길이 끊겼다
      }
    }
  }
}
// 내 지역만 밟는 BFS 부모표
export function bfsOwn(run, from) {
  const owner = run.regions[from].owner, parent = new Map([[from, -1]]), q = [from];
  for (let i = 0; i < q.length; i++) for (const n of adj(run, q[i])) if (!parent.has(n) && run.regions[n].owner === owner) { parent.set(n, q[i]); q.push(n); }
  return parent;
}
export function pathTo(parent, id) { const p = []; for (let c = id; c !== -1 && c !== undefined; c = parent.get(c)) p.push(c); return p.reverse(); }
// 사단 이동/공격: from의 사단에서 ratio만큼 **인접한** 지역으로만. 내 지역이면 합류, 남의 지역이면 전투
export function move(state, from, to, ratio) {
  const run = state.run, f = run.regions[from], t = run.regions[to];
  if (!f || !t || f.owner === NEUTRAL || f.owner === OFF || t.owner === OFF || from === to) return { type: 'invalid' };
  if (!adj(run, from).includes(to)) return { type: 'invalid' };
  const size = Math.floor(f.div * ratio); if (size < 1) return { type: 'invalid' };
  if (t.owner !== f.owner && t.owner !== NEUTRAL) breakPact(state, f.owner, t.owner); // 정전 중이었다면 배신
  const path = [from, to];
  f.div -= size;
  const a = depart(state, f.owner, size, path);
  const res = { type: t.owner === f.owner ? 'move' : 'attack', size, from, to, owner: f.owner, hops: 1, eta: (path.length - 1) / a.speed };
  emit(res); return res;
}
// 내 땅만 밟아 to 까지 가는 최단 경로 (to 는 내 땅이거나 내 땅에 붙어 있어야 한다).
// 이동 규칙은 그대로 "한 칸씩" — 다만 손으로 수십 번 누르는 대신 이어서 진격한다. 먼 적지는 여전히 반란으로만
export function pathThroughMine(run, from, to) {
  const f = run.regions[from], t = run.regions[to];
  if (!f || !t || from === to || f.owner === NEUTRAL || f.owner === OFF || t.owner === OFF) return null;
  const owner = f.owner;
  if (t.owner === owner) { // 내 땅끼리: 내 땅만 밟아 간다
    const parent = bfsOwn(run, from);
    return parent.has(to) ? pathTo(parent, to) : null;
  }
  // 남의 땅·중립: 그 곳에 붙은 내 땅까지 간 다음 마지막 한 칸
  const parent = bfsOwn(run, from);
  let best = null;
  for (const n of adj(run, to)) {
    if (!parent.has(n)) continue;
    const p = pathTo(parent, n);
    if (!best || p.length < best.length) best = p;
  }
  return best ? [...best, to] : null;
}
// 자동 진격: 이어진 내 땅을 따라 여러 칸을 한 번에 보낸다 (가는 길이 끊기면 거기서 싸운다 — runArmies 규칙 그대로)
export function moveFar(state, from, to, ratio) {
  const run = state.run;
  const path = pathThroughMine(run, from, to);
  if (!path) return move(state, from, to, ratio); // 이어지지 않았으면 인접 이동 규칙대로 (대개 invalid)
  if (path.length === 2) return move(state, from, to, ratio);
  const f = run.regions[from], t = run.regions[to];
  const size = Math.floor(f.div * ratio); if (size < 1) return { type: 'invalid' };
  if (t.owner !== f.owner && t.owner !== NEUTRAL) breakPact(state, f.owner, t.owner);
  f.div -= size;
  const a = depart(state, f.owner, size, path);
  const res = { type: t.owner === f.owner ? 'move' : 'attack', size, from, to, owner: f.owner, hops: path.length - 1, eta: (path.length - 1) / a.speed };
  emit(res); return res;
}

export function predict(state, from, to, ratio) {
  const run = state.run, f = run.regions[from], t = run.regions[to];
  const size = Math.floor(f.div * ratio), am = attackMul(state, f.owner), mine = party(t, f.owner);
  const A = (size + (mine ? mine.size : 0)) * am, D = effectiveDefense(state, t, f.owner);
  return { win: size >= 1 && A > D, A, D };
}

// ---- 퇴각: 불리한 싸움에서 빼낸다. 인원의 RETREAT_LOSS 만큼 잃고 가장 가까운 내 땅으로 행군 ----
// (한 번 보내면 전멸까지 싸우던 것을 "지켜볼 만한 일"로 만든다)
export const RETREAT_LOSS = 0.3;
export function canRetreat(state, id) {
  const r = state.run.regions[id];
  if (!r || !r.battle) return false;
  if (party(r, PLAYER)) return true;               // 공격 중인 내 부대
  return r.owner === PLAYER && r.div >= 1;          // 수비 중인 내 사단
}
export function retreat(state, id, f = PLAYER) {
  const run = state.run, r = run.regions[id];
  if (!r || !r.battle) return 0;
  // 물러설 곳: 옆에 붙은 내 땅 중 가장 든든한 곳 (없으면 물러설 데가 없다)
  const home = adj(run, id).filter(n => run.regions[n].owner === f && n !== id)
    .sort((a, b) => (run.regions[b].def + run.regions[b].div) - (run.regions[a].def + run.regions[a].div))[0];
  if (home === undefined) return 0;
  const p = party(r, f);
  let size = 0;
  if (p) size = p.size;                                   // 공격 중인 내 부대
  else if (r.owner === f && r.div >= 1) size = r.div;      // 수비 중인 내 사단 (방어인력은 자리를 지킨다)
  const back = Math.floor(size * (1 - RETREAT_LOSS));
  if (back < 1) return 0;
  if (p) {
    r.battle.parties = r.battle.parties.filter(x => x !== p);
    if (!r.battle.parties.length && r.owner !== f) delete r.battle; // 나만 치고 있었다면 전투 끝
  } else r.div = 0;
  depart(state, f, back, [id, home]);
  emit({ type: 'retreat', id, owner: f, size: back, to: home, lost: Math.ceil(size - back) });
  return back;
}

// ---- 반란: 남의 지역에 내 풀에서 n명을 보내 REBEL_DELAY초 뒤 REBEL_RATIO만큼 봉기 ----
export function canRebel(state, f, id) { const r = state.run.regions[id]; return r && r.owner !== f && r.owner !== NEUTRAL && r.owner !== OFF && !state.run.rebels.some(x => x.owner === f && x.target === id); }
export function rebel(state, f, id, n) {
  if (!canRebel(state, f, id)) return 0;
  const a = amountOf(n, state.run.pool[f]); if (a < 10) return 0;
  breakPact(state, f, state.run.regions[id].owner); // 반란도 배신이다
  state.run.pool[f] -= a;
  state.run.rebels.push({ owner: f, target: id, size: Math.round(a * rebelRatio(state, f)), eta: REBEL_DELAY, am: attackMul(state, f) });
  emit({ type: 'rebel', id, owner: f, size: a });
  return a;
}
export function runRebels(state, dt) {
  const run = state.run;
  for (const rb of [...run.rebels]) {
    rb.eta -= dt; if (rb.eta > 0) continue;
    run.rebels.splice(run.rebels.indexOf(rb), 1);
    const r = run.regions[rb.target];
    if (r.owner === rb.owner) { r.div += rb.size; continue; }
    join(state, r, rb.owner, rb.size, rb.am); emit({ type: 'uprising', id: r.id, owner: rb.owner, size: rb.size });
  }
}

export function tick(state, dt) {
  const run = state.run;
  refreshSupply(state); // 고립 여부가 생산·수비에 곧바로 들어간다
  for (let f = 0; f < run.factions; f++) { // 세력 풀 하나에 모든 지역 생산이 모인다 (전투 중인 지역은 제외), 한도까지만
    const c = poolCap(state, f);
    if (run.pool[f] < c) run.pool[f] = Math.min(c, run.pool[f] + totalProd(state, f) * dt);
  }
  runRebels(state, dt); runArmies(state, dt); runBattles(state, dt);
  run.elapsed += dt; updateMax(state);
}
