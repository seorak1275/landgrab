// 사단전 "능동 플레이어" 기준선 (밸런스 실측·테스트용, 게임에는 안 들어간다)
// 방치를 없앤 뒤로 밸런스 기준은 "손을 대면 이기는가" 라서, 사람이 할 만한 수를 그대로 흉내낸다:
// ① 인력이 남지 않게 계속 배치(국경엔 방어, 가장 앞선 국경 지역에 사단) ② 이길 수 있는 이웃을 친다
// ③ 한 지역으로 못 이기면 목표에 붙은 내 지역들에서 집결 ④ 그래도 할 게 없고 인력이 차면 반란
import { PLAYER, NEUTRAL, OFF, owned, adj, allocate, move, rebel, canRebel, effectiveDefense, attackMul, totalPool, poolCap, predict, TECHS, research, hasTech, techCost, atPeace, proposePact, leaderOf } from '../src/region/game.js';

export const BOT_EVERY = 5; // 초

const TECH_ORDER = ['mobilize', 'drill', 'march', 'agit'];

export function greedyStep(state, f = PLAYER) {
  const run = state.run;
  const mine = owned(state, f); if (!mine.length) return;

  // ⓪ 연구: 인력이 넉넉하면 순서대로 (사람도 여유가 생기면 연구부터 한다)
  for (const key of TECH_ORDER) {
    if (hasTech(run, f, key)) continue;
    if (totalPool(state, f) >= techCost(state, f, key) + 150) research(state, f, key);
    break;
  }
  // ⓪ 외교: 내가 선두가 아니면 가장 큰 세력 말고 다른 세력들과 정전을 맺어 등을 지킨다
  if (leaderOf(state) !== f) {
    const lead = leaderOf(state);
    for (let g = 0; g < run.factions; g++) if (g !== f && g !== lead && !atPeace(state, f, g)) proposePact(state, f, g);
  }
  const am = attackMul(state, f);
  const isBorder = r => adj(run, r.id).some(n => run.regions[n].owner !== f);
  const border = mine.filter(isBorder);

  // ① 배치: 풀의 80%를 쓴다 — 절반은 방어가 가장 약한 국경 3곳, 절반은 사단이 가장 큰 국경 지역
  const spend = Math.floor(totalPool(state, f) * 0.8);
  if (spend >= 10 && border.length) {
    const weak = [...border].sort((a, b) => (a.def + a.div) - (b.def + b.div)).slice(0, 3);
    const each = Math.floor(spend * 0.4 / weak.length);
    for (const r of weak) allocate(state, r.id, 'def', each);
    const spear = border.reduce((a, b) => (b.div > a.div ? b : a));
    allocate(state, spear.id, 'div', Math.floor(spend * 0.6));
  }

  // ② 공격: 이길 수 있는 가장 약한 이웃 (중립 먼저), 한 번에 최대 3곳
  let attacks = 0;
  const opts = [];
  for (const r of mine) {
    if (r.div < 20) continue;
    for (const n of adj(run, r.id)) {
      const t = run.regions[n]; if (t.owner === f) continue;
      if (predict(state, r.id, n, 0.8).win) opts.push({ r, t, D: effectiveDefense(state, t, f) });
    }
  }
  opts.sort((a, b) => (a.t.owner === NEUTRAL ? 0 : 1) - (b.t.owner === NEUTRAL ? 0 : 1) || a.D - b.D);
  const hit = new Set();
  for (const o of opts) {
    if (attacks >= 3) break;
    if (hit.has(o.t.id) || o.t.owner === f) continue;
    if (!predict(state, o.r.id, o.t.id, 0.8).win) continue;
    if (move(state, o.r.id, o.t.id, 0.8).type !== 'invalid') { attacks++; hit.add(o.t.id); }
  }

  // ③ 집결: 목표에 붙은 내 지역들 사단 합이 수비의 1.5배면 전부 보낸다
  if (attacks === 0) {
    let best = null;
    for (const r of border) for (const n of adj(run, r.id)) {
      const t = run.regions[n]; if (t.owner === f) continue;
      const comp = adj(run, t.id).filter(id => run.regions[id].owner === f);
      const sum = comp.reduce((s, id) => s + run.regions[id].div * 0.8, 0);
      const D = effectiveDefense(state, t, f);
      if (sum * am > D * 1.5 && (!best || D < best.D)) best = { t, D, comp };
    }
    if (best) { for (const id of best.comp) if (run.regions[id].div >= 10) move(state, id, best.t.id, 0.8); attacks++; }
  }

  // ④ 반란: 할 게 없고 인력이 한도의 70%를 넘으면 가장 약한 남의 지역에
  if (attacks === 0 && totalPool(state, f) > poolCap(state, f) * 0.7) {
    const t = run.regions.filter(r => r.owner !== f && r.owner !== NEUTRAL && r.owner !== OFF && canRebel(state, f, r.id) && !r.battle)
      .sort((a, b) => (a.def + a.div) - (b.def + b.div))[0];
    if (t) rebel(state, f, t.id, 'max');
  }
}
