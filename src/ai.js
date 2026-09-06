import { TERRAIN, NEUTRAL, PLAYER } from './world.js';
import { neighborIds, cap, upgrade, upgradeCost, send, dispatch, bfsOwn, attackMul, effectiveDefense, battleParty, MAX_LEVEL } from './sim.js';

export function aiPeriod(state) { return 8 * (1 + 0.08 * (state.legacy.upgrades.aiSlow || 0)); }
export const AI_GATHER_EVERY = 4; // 몇 주기마다 집결 공격을 시도하는지
export const AI_GATHER_RATIO = 0.4; // 집결 시 각 타일에서 떼는 비율
// 중립을 먼저, 그다음은 플레이어·다른 AI 가리지 않고 수비 약한 쪽 (플레이어 우선이면 AI 둘이 협공해 활동적인 플레이어도 30분대에 전멸했음)
const priority = owner => (owner === NEUTRAL ? 0 : 1);
// 남의 전투(내 편이 없는)엔 끼어들지 않는다 — 플레이어가 점령 중인 땅을 '약한 중립'으로 보고 가로채는 걸 막음
const othersBattle = (t, f) => t.battle && !battleParty(t, f);

export function aiAct(state, f) {
  const run = state.run;
  const mine = () => run.tiles.filter(t => t.owner === f);
  if (mine().length === 0) return;
  run.aiTurns = run.aiTurns || []; run.aiTurns[f] = (run.aiTurns[f] || 0) + 1;

  // 1. 업그레이드: 가장 낮은 레벨(동률이면 골드계수 높은 쪽), 주기당 최대 2회
  for (let i = 0; i < 2; i++) {
    const cand = mine().filter(t => t.level < MAX_LEVEL)
      .sort((a, b) => a.level - b.level || TERRAIN[b.terrain].gold - TERRAIN[a.terrain].gold)[0];
    if (!cand || run.gold[f] < upgradeCost(cand)) break;
    upgrade(state, cand.id);
  }

  // 2. 공격: 유리한 후보를 모아 우선순위대로 최대 2회, 80% 파병
  const am = attackMul(state, f);
  const options = [];
  for (const t of mine()) {
    if (t.soldiers < 10) continue;
    for (const nid of neighborIds(run, t)) {
      const n = run.tiles[nid];
      if (n.owner === f || othersBattle(n, f)) continue;
      const D = effectiveDefense(n, f);
      if (t.soldiers * 0.8 * am > D * 1.4) options.push({ from: t, to: n, D });
    }
  }
  options.sort((a, b) => priority(a.to.owner) - priority(b.to.owner) || a.D - b.D);
  let attacks = 0;
  for (const o of options) {
    if (attacks >= 2) break;
    if (o.to.owner === f) continue;
    // 앞선 공격으로 병사가 줄었을 수 있으니 현재 값으로 다시 확인
    const D = effectiveDefense(o.to, f);
    if (!(o.from.soldiers * 0.8 * am > D * 1.4)) continue;
    send(state, o.from.id, o.to.id, 0.8);
    attacks++;
  }

  // 3. 집결 공격 (AI_GATHER_EVERY 주기마다): 한 타일로는 못 치는 국경 너머 땅을, 이어진 내 땅 전체에서 60%씩 모아 친다
  //    (플레이어가 [내 땅 전체 선택]으로 하는 것과 같은 수법 — 이게 없으면 AI가 상대가 안 돼 "너무 쉽다"는 피드백)
  if (attacks === 0 && run.aiTurns[f] % AI_GATHER_EVERY === 0) {
    let best = null;
    const compCache = new Map(); // 집결지 id → [성분 타일 id들, 보낼 병사 합]
    for (const t of mine()) {
      if (compCache.has(t.id)) continue;
      const ids = [...bfsOwn(run, t.id).keys()];
      const amount = ids.reduce((s, id) => { const x = run.tiles[id]; return s + (x.soldiers * AI_GATHER_RATIO >= 1 ? x.soldiers * AI_GATHER_RATIO : 0); }, 0);
      for (const id of ids) compCache.set(id, { ids, amount });
    }
    for (const t of mine()) for (const nid of neighborIds(run, t)) {
      const n = run.tiles[nid];
      if (n.owner === f || othersBattle(n, f)) continue;
      const D = effectiveDefense(n, f), comp = compCache.get(t.id);
      if (!(comp.amount * am > D * 1.5)) continue;
      const cand = { to: n, D, ids: comp.ids };
      if (!best || priority(cand.to.owner) - priority(best.to.owner) < 0 || (priority(cand.to.owner) === priority(best.to.owner) && cand.D < best.D)) best = cand;
    }
    if (best) dispatch(state, best.ids, best.to.id, AI_GATHER_RATIO);
  }

  // 4. 보강: 내부 타일(이웃이 전부 내 땅)이 한도 절반 이상이면 가장 약한 국경 이웃으로 절반 이동, 1회
  const isBorder = t => neighborIds(run, t).some(id => run.tiles[id].owner !== f);
  for (const t of mine()) {
    if (isBorder(t) || t.soldiers < cap(t) * 0.5) continue;
    const borders = neighborIds(run, t).map(id => run.tiles[id]).filter(n => isBorder(n)).sort((a, b) => a.soldiers - b.soldiers);
    if (borders.length) { send(state, t.id, borders[0].id, 0.5); break; }
  }
}

export function runAi(state, dt) {
  const run = state.run;
  for (let f = 1; f < run.factions; f++) {
    run.aiTimers[f] -= dt;
    while (run.aiTimers[f] <= 0) { aiAct(state, f); run.aiTimers[f] += aiPeriod(state); }
  }
}
