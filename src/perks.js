// 환생 축복: 환생할 때 3개 중 하나를 골라 그 판 동안만 적용 (run.perk). 순수 데이터 + 선택 도우미
import { mulberry32 } from './rng.js';

export const PERKS = {
  blitz:   { name: '기습',   icon: '⚡', desc: '시작 병력 ×3',                 startArmy: 3 },
  rich:    { name: '보물',   icon: '💰', desc: '시작 골드 +500',               startGold: 500 },
  scout:   { name: '정찰',   icon: '🔭', desc: '중립 수비 −30%',               garrison: 0.7 },
  harvest: { name: '풍년',   icon: '🌾', desc: '골드 생산 +30%',               gold: 1.3 },
  draft:   { name: '총동원', icon: '📯', desc: '병사 생산 +30%',               soldiers: 1.3 },
  iron:    { name: '강철',   icon: '🗡', desc: '공격력 +20%',                  attack: 1.2 },
  bastion: { name: '요새',   icon: '🏰', desc: '수비력 +30%',                  def: 1.3 },
  sloth:   { name: '태만',   icon: '🐢', desc: 'AI 행동 주기 +40%',            aiSlow: 1.4 },
  unity:   { name: '통합',   icon: '🏳', desc: '지역 완전 점령 보너스 2배',     unity: 2 },
  hermit:  { name: '은둔',   icon: '🏝', desc: 'AI 세력 하나 적음',            aiDelta: -1 },
  march:   { name: '강행군', icon: '👟', desc: '행군 속도 +50%',               speed: 1.5 },
};
export function perkOf(state) { return (state && state.run && PERKS[state.run.perk]) || {}; }
// 시드로 정해지는 3개 후보 (환생 창에서 고른다)
export function offerPerks(seed, n = 3) {
  const rand = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  const keys = Object.keys(PERKS);
  for (let i = keys.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [keys[i], keys[j]] = [keys[j], keys[i]]; }
  return keys.slice(0, n);
}
