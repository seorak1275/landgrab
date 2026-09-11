// 환생해도 남는 것들: 장군 · 계급 · 훈장 · 전적, 그리고 전적으로 뽑는 추천 난이도
// legacy(저장의 영구 구역)에만 기록하고, 두 모드가 같이 쓴다.
import { mulberry32 } from './rng.js';
import { DIFFICULTIES, DEFAULT_DIFFICULTY } from './sim.js';

// ---- 장군: 환생할 때마다 한 명을 뽑고, 같은 장군이 또 나오면 레벨이 오른다 ----
export const GENERAL_SPECS = {
  attack: { name: '돌격', icon: '⚔', desc: '공격력 +5%/레벨' },
  def:    { name: '수성', icon: '🛡', desc: '수비력 +5%/레벨' },
  speed:  { name: '기동', icon: '🏃', desc: '행군 속도 +5%/레벨' },
  prod:   { name: '조련', icon: '📯', desc: '생산 +5%/레벨' },
};
export const GENERALS = [
  { key: 'seorak', name: '설악', spec: 'attack' }, { key: 'halla',  name: '한라', spec: 'def' },
  { key: 'jiri',   name: '지리', spec: 'prod' },   { key: 'taebaek', name: '태백', spec: 'speed' },
  { key: 'sobaek', name: '소백', spec: 'attack' }, { key: 'geumgang', name: '금강', spec: 'def' },
  { key: 'odae',   name: '오대', spec: 'prod' },   { key: 'worak',   name: '월악', spec: 'speed' },
  { key: 'songni', name: '속리', spec: 'attack' }, { key: 'mudeung', name: '무등', spec: 'def' },
  { key: 'naejang', name: '내장', spec: 'prod' },  { key: 'chiak',   name: '치악', spec: 'speed' },
];
export const GENERAL_MAX = 5, GENERAL_STEP = 0.05;
export const generalInfo = key => GENERALS.find(g => g.key === key) || null;

export function newCareer() { return { generals: {}, lead: null, medals: {}, records: [], conquests: 0 }; }
function career(legacy) {
  if (!legacy.generals) Object.assign(legacy, newCareer(), { generals: {}, medals: legacy.medals || {}, records: legacy.records || [] });
  return legacy;
}
// 환생 보상: 시드로 한 명 뽑는다 (이미 있으면 레벨 +1, 최대 GENERAL_MAX)
export function drawGeneral(legacy, seed) {
  career(legacy);
  const g = GENERALS[Math.floor(mulberry32((seed ^ 0x85ebca6b) >>> 0)() * GENERALS.length)];
  const cur = legacy.generals[g.key] || 0;
  const level = Math.min(GENERAL_MAX, cur + 1);
  legacy.generals[g.key] = level;
  if (!legacy.lead) legacy.lead = g.key;
  return { key: g.key, level, isNew: cur === 0 };
}
export function ownedGenerals(legacy) { career(legacy); return Object.entries(legacy.generals).map(([key, level]) => ({ ...generalInfo(key), level })); }
export function generalOf(legacy) { career(legacy); const key = legacy.lead; return key && legacy.generals[key] ? { ...generalInfo(key), level: legacy.generals[key] } : null; }
export function setLead(legacy, key) { career(legacy); if (!legacy.generals[key]) return false; legacy.lead = key; return true; }
// 고른 장군의 특기에만 붙는 배율 (attack | def | speed | prod)
export function generalMul(legacy, field) {
  const g = generalOf(legacy);
  return g && g.spec === field ? 1 + GENERAL_STEP * g.level : 1;
}

// ---- 계급: 공적 = 환생 횟수 + 정복 ×2. 계급마다 생산에 작은 영구 보너스 ----
export const RANKS = [
  { name: '이등병', need: 0,  bonus: 0 },    { name: '일병',   need: 2,  bonus: 0.02 },
  { name: '상병',   need: 5,  bonus: 0.04 }, { name: '병장',   need: 9,  bonus: 0.06 },
  { name: '하사',   need: 14, bonus: 0.08 }, { name: '중사',   need: 20, bonus: 0.10 },
  { name: '상사',   need: 27, bonus: 0.12 }, { name: '소위',   need: 35, bonus: 0.15 },
  { name: '중위',   need: 44, bonus: 0.18 }, { name: '대위',   need: 54, bonus: 0.21 },
  { name: '소령',   need: 65, bonus: 0.24 }, { name: '중령',   need: 77, bonus: 0.27 },
  { name: '대령',   need: 90, bonus: 0.30 }, { name: '준장',   need: 105, bonus: 0.35 },
  { name: '소장',   need: 121, bonus: 0.40 }, { name: '중장',  need: 138, bonus: 0.45 },
  { name: '대장',   need: 156, bonus: 0.50 },
];
export function careerScore(legacy) { return (legacy.prestigeCount || 0) + 2 * (legacy.conquests || 0); }
export function rankOf(legacy) { const s = careerScore(legacy); let r = RANKS[0]; for (const x of RANKS) if (s >= x.need) r = x; return r; }
export function rankBonus(legacy) { return 1 + rankOf(legacy).bonus; }
export function nextRank(legacy) { const s = careerScore(legacy); return RANKS.find(x => x.need > s) || null; }

// ---- 훈장: 판이 끝날 때 조건을 보고 한 번만 준다 ----
export const MEDALS = {
  first:   { name: '첫 정복',     icon: '🥇', desc: '처음으로 지도를 다 먹었다',                 test: r => r.outcome === 'conquered' },
  blitz:   { name: '전격전',      icon: '⚡', desc: '10분 안에 정복',                            test: r => r.outcome === 'conquered' && r.elapsed <= 600 },
  hell:    { name: '지옥에서',    icon: '🔥', desc: '지옥 난이도로 정복',                        test: r => r.outcome === 'conquered' && r.difficulty === 'hell' },
  loyal:   { name: '신의',        icon: '🤝', desc: '한 번도 정전을 어기지 않고 정복',           test: r => r.outcome === 'conquered' && !r.betrayals },
  hunter:  { name: '사냥꾼',      icon: '🎯', desc: '한 판에서 AI 두 세력을 없앴다',             test: r => (r.killed || 0) >= 2 },
  half:    { name: '반쪽 통일',   icon: '🏳', desc: '한 판에서 절반 넘게 차지',                  test: r => r.regions >= r.total / 2 },
  nation:  { name: '전국 통일',   icon: '🇰🇷', desc: '전국 판(251곳)을 정복',                    test: r => r.outcome === 'conquered' && r.board === 'all' },
  comeback: { name: '기사회생',   icon: '💫', desc: '세 곳 이하까지 몰렸다가 정복',              test: r => r.outcome === 'conquered' && (r.lowest || 99) <= 3 },
};
export function hasMedal(legacy, key) { career(legacy); return !!legacy.medals[key]; }
export function checkMedals(legacy, result) {
  career(legacy);
  const got = [];
  for (const [key, m] of Object.entries(MEDALS)) {
    if (legacy.medals[key]) continue;
    let ok = false; try { ok = !!m.test(result); } catch { ok = false; }
    if (ok) { legacy.medals[key] = Date.now(); got.push({ key, ...m }); }
  }
  return got;
}

// ---- 전적 ----
export const RECORD_MAX = 30;
export function records(legacy) { career(legacy); return legacy.records; }
export function addRecord(legacy, rec) {
  career(legacy);
  const row = { at: Date.now(), ...rec };
  legacy.records.unshift(row);
  if (legacy.records.length > RECORD_MAX) legacy.records.length = RECORD_MAX;
  if (rec.outcome === 'conquered') legacy.conquests = (legacy.conquests || 0) + 1;
  return row;
}
export function bestRecord(legacy, mode = null) {
  const rs = records(legacy).filter(r => !mode || r.mode === mode);
  if (!rs.length) return null;
  return rs.reduce((a, b) => {
    const ra = (a.outcome === 'conquered' ? 1e6 : 0) + a.regions - (a.outcome === 'conquered' ? a.elapsed / 1000 : 0);
    const rb = (b.outcome === 'conquered' ? 1e6 : 0) + b.regions - (b.outcome === 'conquered' ? b.elapsed / 1000 : 0);
    return rb > ra ? b : a;
  });
}

// ---- 저장 기반 추천 난이도: 최근 3판이 다 정복이면 한 칸 위, 2판 이상 전멸이면 한 칸 아래 ----
export function recommendDifficulty(legacy, mode = null) {
  const keys = Object.keys(DIFFICULTIES);
  const cur = legacy.difficulty || DEFAULT_DIFFICULTY;
  const i = Math.max(0, keys.indexOf(cur));
  const rs = records(legacy).filter(r => !mode || r.mode === mode).slice(0, 3);
  if (rs.length < 3) return cur;
  const won = rs.filter(r => r.outcome === 'conquered').length;
  const lost = rs.filter(r => r.outcome === 'wiped').length;
  if (won === 3) return keys[Math.min(keys.length - 1, i + 1)];
  if (lost >= 2) return keys[Math.max(0, i - 1)];
  return cur;
}
