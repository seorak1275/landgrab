// 전역(戰役): 단계마다 지도가 바뀐다. 1단계 육각 평원 → 서울 → 대한민국 → 권역 사단전 → 전국 → 세계.
// 두 모드(육각·사단전)가 같은 진행을 공유한다. 저장은 모드 저장과 별개(landgrab.campaign.v1).
export const CAMPAIGN_KEY = 'landgrab.campaign.v1';
export const CAMPAIGN_VERSION = 1;

// mode: 'hex'(index.html) | 'region'(region.html)
// map/board: 그 모드의 지도 · home: 사단전 시작 지역 · par: 별 기준 시간(초)
export const STAGES = [
  { id: 'hex-plain',   n: '육각 평원',     icon: '🌱', mode: 'hex',    map: 'hex',      difficulty: 'easy',   par: [900, 600],  desc: '규칙을 익히는 판. 37칸에서 성을 올리고 병사를 보낸다.' },
  { id: 'hex-seoul',   n: '서울특별시',    icon: '🏙', mode: 'hex',    map: 'seoul',    difficulty: 'normal', par: [1200, 780], desc: '25개 구를 육각 격자로. 구를 전부 가지면 생산이 오른다.' },
  { id: 'hex-korea',   n: '대한민국',      icon: '🇰🇷', mode: 'hex',   map: 'korea',    difficulty: 'normal', par: [1500, 900], desc: '시·도 17곳. 뱃길로 제주까지.' },
  { id: 'rg-capital',  n: '수도권 사단전', icon: '🗺', mode: 'region', board: 'capital', home: '고양 덕양구', difficulty: 'normal', par: [900, 600], desc: '규칙이 바뀐다 — 인력 풀, 방어·사단, 반란. 79곳.' },
  { id: 'rg-honam',    n: '호남·충청',     icon: '🌾', mode: 'region', board: 'honam',   home: '광주 북구',   difficulty: 'normal', par: [1200, 800], desc: '평야가 넓어 치고받기 쉽다. 77곳.' },
  { id: 'rg-yeongnam', n: '영남',          icon: '⛰', mode: 'region', board: 'yeongnam', home: '창원 의창구', difficulty: 'hard',   par: [1500, 1000], desc: '산악 수비가 세다. 75곳.' },
  { id: 'rg-all',      n: '전국',          icon: '🏳', mode: 'region', board: 'all',     home: '수원 장안구', difficulty: 'hard',   par: [3600, 2400], desc: '251개 시·군·구. 길고 넓은 판.' },
  // 여기서부터 지도가 나라 단위로 바뀐다 (세계 지도)
  { id: 'w-asia',      n: '아시아',        icon: '🌏', mode: 'region', board: 'asia',     home: '대한민국', difficulty: 'normal', par: [900, 600],   desc: '이제 나라가 칸이다. 대한민국에서 시작해 47개 나라로.' },
  { id: 'w-europe',    n: '유럽',          icon: '🏰', mode: 'region', board: 'europe',   home: '프랑스',   difficulty: 'hard',   par: [900, 600],   desc: '39개 나라가 빽빽이 국경을 맞댄다.' },
  { id: 'w-americas',  n: '아메리카',      icon: '🗽', mode: 'region', board: 'americas', home: '미국',     difficulty: 'hard',   par: [900, 660],   desc: '남북으로 긴 31개 나라. 허리가 잘리기 쉽다.' },
  { id: 'w-africa',    n: '아프리카',      icon: '🦁', mode: 'region', board: 'africa',   home: '나이지리아', difficulty: 'hard', par: [1200, 800],  desc: '51개 나라, 가장 넓은 대륙 판.' },
  { id: 'w-world',     n: '전 세계',       icon: '🌐', mode: 'region', board: 'world',    home: '대한민국', difficulty: 'hell',   par: [3000, 2100], desc: '175개 나라. 대륙을 통째로 가지면 그 대륙 생산이 오른다.' },
];
export const stageOf = id => STAGES.find(s => s.id === id) || null;
export const stageIndex = id => STAGES.findIndex(s => s.id === id);

export function newCampaign() { return { version: CAMPAIGN_VERSION, cleared: {}, last: null }; }
export function loadCampaign(storage = globalThis.localStorage) {
  try {
    const t = storage.getItem(CAMPAIGN_KEY);
    if (!t) return newCampaign();
    const o = JSON.parse(t);
    return o && o.version === CAMPAIGN_VERSION && o.cleared ? o : newCampaign();
  } catch { return newCampaign(); }
}
export function saveCampaign(c, storage = globalThis.localStorage) {
  try { storage.setItem(CAMPAIGN_KEY, JSON.stringify(c)); return true; } catch { return false; }
}

// 별: 정복하면 ★1, par[0]초 안이면 ★2, par[1]초 안이면 ★3
export function starsFor(stage, outcome, elapsed) {
  if (!stage || outcome !== 'conquered') return 0;
  if (elapsed <= stage.par[1]) return 3;
  if (elapsed <= stage.par[0]) return 2;
  return 1;
}
// 앞 단계를 깨야 다음이 열린다 (첫 단계는 언제나 열림)
export function isUnlocked(c, id) {
  const i = stageIndex(id);
  if (i <= 0) return i === 0;
  return !!(c.cleared || {})[STAGES[i - 1].id];
}
export function nextStage(c) { return STAGES.find(s => !((c.cleared || {})[s.id])) || null; }
export function totalStars(c) { return Object.values(c.cleared || {}).reduce((s, x) => s + (x.stars || 0), 0); }
// 판이 끝났을 때 기록 (별·시간은 더 좋은 쪽만 남긴다)
export function recordStage(c, id, outcome, elapsed) {
  const stage = stageOf(id); if (!stage) return null;
  const stars = starsFor(stage, outcome, elapsed);
  if (!stars) return null;
  const prev = (c.cleared || {})[id];
  const row = { stars: Math.max(stars, prev ? prev.stars : 0), time: prev ? Math.min(prev.time, elapsed) : elapsed, at: Date.now() };
  c.cleared = { ...(c.cleared || {}), [id]: row };
  return row;
}
// 그 단계를 어디로 열어야 하는지 (쿼리스트링으로 넘긴다)
export function stageUrl(stage) { return `${stage.mode === 'hex' ? 'index.html' : 'region.html'}?stage=${encodeURIComponent(stage.id)}`; }
export function stageFromLocation(search = globalThis.location ? globalThis.location.search : '') {
  const m = /[?&]stage=([^&]+)/.exec(search || '');
  return m ? stageOf(decodeURIComponent(m[1])) : null;
}
