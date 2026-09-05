# 땅따먹기(방치형 영토 정복) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 아이폰 사파리에서 여는 방치형 육각 타일 정복 게임을 순수 HTML/JS로 만들어 GitHub Pages에 올린다.

**Architecture:** 시뮬레이션(hex·world·sim·ai·offline·prestige·save)은 DOM을 모르는 ES 모듈로 두고 Node 내장 테스트 러너로 검증한다. 화면은 render.js(Canvas)와 ui.js(DOM·터치)가 맡고 main.js가 250ms 틱 루프·자동 저장·창 전환을 배선한다. 상태 객체 하나(`state`)를 모든 모듈이 공유한다.

**Tech Stack:** HTML5 Canvas, ES modules(빌드 없음), `node --test`(Node 24), localStorage, Kenney CC0 에셋, GitHub Pages.

## Global Constraints

- 스펙: `docs/superpowers/specs/2026-09-05-idle-conquest-design.md`. 수식·상수는 스펙 3장을 그대로 따른다.
- 프레임워크·번들러·npm 의존성 없음. `package.json`은 `"type": "module"`과 테스트 스크립트만.
- 테스트 실행: 프로젝트 루트에서 `node --test tests/`.
- 세력 번호: 플레이어 0, AI 1~n, 중립 -1.
- 커밋은 작업(Task) 단위로, 메시지는 한국어. 커밋 명령은 `git -c user.name=user -c user.email=yoonraphael0512@gmail.com commit ...`(전역 설정 없음).
- 파일 인코딩 UTF-8, 줄바꿈 LF. 파일 쓰기는 Write 도구로(PowerShell `>` 금지, 긴 heredoc은 spawn 길이 제한에 걸림).
- 프로젝트 경로: `C:\Users\user\Desktop\ai만들기\땅따먹기` (Git Bash 표기 `/c/Users/user/Desktop/ai만들기/땅따먹기`).

## 파일 구조

| 파일 | 책임 |
|---|---|
| `package.json` | 모듈 타입·테스트 스크립트 |
| `src/rng.js` | 시드 난수(mulberry32), 가중 선택 |
| `src/hex.js` | 축좌표 육각 격자 수학 |
| `src/world.js` | 지형표, 반지름/AI 수 공식, 판 생성 |
| `src/sim.js` | 생산·업그레이드·전투·이동·승패 |
| `src/ai.js` | AI 한 주기 행동, 타이머 |
| `src/offline.js` | 꺼둔 시간 시뮬레이션 + 정산 |
| `src/prestige.js` | 유산 포인트·상점·환생 |
| `src/save.js` | 새 상태, 직렬화, localStorage |
| `src/render.js` | 카메라, 캔버스 그리기, 에셋 로드, 타일 피킹 |
| `src/ui.js` | DOM 갱신, 창, 터치 입력 |
| `src/main.js` | 루프·배선 |
| `index.html`, `style.css`, `manifest.json`, `assets/` | 뼈대·아이콘·그림 |
| `tests/*.test.js` | 모듈별 테스트 + 밸런스 시나리오 |

---

### Task 1: 프로젝트 뼈대 + rng + hex

**Files:**
- Create: `package.json`, `.gitignore`, `src/rng.js`, `src/hex.js`
- Test: `tests/hex.test.js`

**Interfaces:**
- Produces: `mulberry32(seed) → () => number[0,1)`, `pick(rand, [[value, weight],...]) → value`
- Produces: `DIRS`, `key(q,r)`, `neighbors(q,r) → [[q,r]×6]`, `distance([q,r],[q,r]) → int`, `tilesInRadius(R) → [[q,r]]`, `corners(R) → [[q,r]×6]`, `hexToPixel(q,r,size) → [x,y]`(pointy-top), `pixelToHex(x,y,size) → [q,r]`, `hexCorners(cx,cy,size) → [[x,y]×6]`

- [ ] **Step 1: package.json과 .gitignore**

```json
{
  "name": "landgrab",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": { "test": "node --test tests/" }
}
```

`.gitignore`:
```
node_modules/
.DS_Store
Thumbs.db
```

- [ ] **Step 2: 실패하는 테스트 작성** — `tests/hex.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { neighbors, distance, tilesInRadius, corners, hexToPixel, pixelToHex } from '../src/hex.js';
import { mulberry32, pick } from '../src/rng.js';

test('이웃은 6개이고 거리는 1', () => {
  const n = neighbors(0, 0);
  assert.equal(n.length, 6);
  for (const h of n) assert.equal(distance([0, 0], h), 1);
});

test('반지름별 타일 수 = 3R(R+1)+1', () => {
  for (const R of [3, 4, 5, 6]) assert.equal(tilesInRadius(R).length, 3 * R * (R + 1) + 1);
});

test('꼭짓점은 중심에서 R, 인접 꼭짓점끼리 R, 마주보면 2R', () => {
  const c = corners(3);
  assert.equal(c.length, 6);
  for (const p of c) assert.equal(distance([0, 0], p), 3);
  assert.equal(distance(c[0], c[1]), 3);
  assert.equal(distance(c[0], c[3]), 6);
});

test('픽셀 변환은 왕복한다', () => {
  for (const [q, r] of tilesInRadius(4)) {
    const [x, y] = hexToPixel(q, r, 36);
    assert.deepEqual(pixelToHex(x + 3, y - 2, 36), [q, r]);
  }
});

test('시드 난수는 재현되고 가중 선택은 범위 안', () => {
  const a = mulberry32(42), b = mulberry32(42);
  assert.equal(a(), b());
  const r = mulberry32(1);
  for (let i = 0; i < 100; i++) assert.ok(['x', 'y'].includes(pick(r, [['x', 1], ['y', 3]])));
});
```

- [ ] **Step 3: 실패 확인** — `node --test tests/` → `Cannot find module` 로 FAIL

- [ ] **Step 4: 구현** — `src/rng.js`

```js
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rand, weights) {
  const total = weights.reduce((s, [, w]) => s + w, 0);
  let x = rand() * total;
  for (const [v, w] of weights) { x -= w; if (x < 0) return v; }
  return weights[weights.length - 1][0];
}
```

`src/hex.js` (pointy-top, 축좌표 q,r):

```js
export const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
export function key(q, r) { return `${q},${r}`; }
export function neighbors(q, r) { return DIRS.map(([dq, dr]) => [q + dq, r + dr]); }
export function distance(a, b) {
  const dq = a[0] - b[0], dr = a[1] - b[1];
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
}
export function tilesInRadius(R) {
  const out = [];
  for (let q = -R; q <= R; q++)
    for (let r = Math.max(-R, -q - R); r <= Math.min(R, -q + R); r++) out.push([q, r]);
  return out;
}
export function corners(R) { return [[R, 0], [0, R], [-R, R], [-R, 0], [0, -R], [R, -R]]; }
export function hexToPixel(q, r, size) { return [size * Math.sqrt(3) * (q + r / 2), size * 1.5 * r]; }
export function roundHex(q, r) {
  const s = -q - r;
  let rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
  const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs; else if (dr > ds) rr = -rq - rs;
  return [rq, rr];
}
export function pixelToHex(x, y, size) {
  const q = (Math.sqrt(3) / 3 * x - 1 / 3 * y) / size;
  const r = (2 / 3 * y) / size;
  return roundHex(q, r);
}
export function hexCorners(cx, cy, size) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 180 * (60 * i - 30);
    pts.push([cx + size * Math.cos(a), cy + size * Math.sin(a)]);
  }
  return pts;
}
```

- [ ] **Step 5: 통과 확인** — `node --test tests/` → 5 pass
- [ ] **Step 6: 커밋** — `git add -A && git -c user.name=user -c user.email=yoonraphael0512@gmail.com commit -m "뼈대: rng·hex 모듈"`

---

### Task 2: world.js — 판 생성

**Files:**
- Create: `src/world.js`
- Test: `tests/world.test.js`

**Interfaces:**
- Consumes: rng, hex(Task 1)
- Produces: `TERRAIN`(지형표 {name,gold,def,cap}), `PLAYER=0`, `NEUTRAL=-1`, `radiusFor(p)`, `aiCountFor(p)`, `neutralGarrison(dist,p)`, `generateRun(seed, prestige, upgrades) → run`
- run 구조: `{seed, radius, factions, tiles:[{id,q,r,terrain,owner,level,soldiers}], gold:number[], aiTimers:number[], maxTilesOwned, sendRatio, elapsed}`. `tiles[i].id === i`.

- [ ] **Step 1: 실패하는 테스트** — `tests/world.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateRun, radiusFor, aiCountFor, neutralGarrison, PLAYER, NEUTRAL, TERRAIN } from '../src/world.js';
import { distance } from '../src/hex.js';

test('반지름·AI 수 공식', () => {
  assert.deepEqual([0, 1, 2, 4, 6, 8].map(radiusFor), [3, 3, 4, 5, 6, 6]);
  assert.deepEqual([0, 2, 3, 6, 9].map(aiCountFor), [2, 2, 3, 4, 4]);
});

test('중립 수비병 공식', () => {
  assert.equal(neutralGarrison(0, 0), 8);
  assert.equal(neutralGarrison(3, 0), Math.round(8 * 2.8));
  assert.equal(neutralGarrison(3, 2), Math.round(8 * 2.8 * 1.3));
});

test('새 판: 타일 수, 수도 배치, 시작 자원', () => {
  const run = generateRun(7, 0, {});
  assert.equal(run.tiles.length, 37);
  assert.equal(run.factions, 3);
  run.tiles.forEach((t, i) => assert.equal(t.id, i));
  const caps = run.tiles.filter(t => t.owner !== NEUTRAL);
  assert.equal(caps.length, 3);
  for (const c of caps) { assert.equal(c.terrain, 'citadel'); assert.equal(c.level, 1); assert.equal(c.soldiers, 30); }
  const pc = caps.find(t => t.owner === PLAYER);
  for (const c of caps) if (c !== pc) assert.equal(distance([pc.q, pc.r], [c.q, c.r]), 6);
  assert.deepEqual(run.gold, [100, 100, 100]);
  assert.equal(run.sendRatio, 0.5);
  assert.equal(run.maxTilesOwned, 1);
});

test('초기 병력 보너스는 플레이어 수도에만', () => {
  const run = generateRun(7, 0, { startArmy: 2 });
  const caps = run.tiles.filter(t => t.owner !== NEUTRAL);
  assert.equal(caps.find(t => t.owner === PLAYER).soldiers, 70);
  assert.equal(caps.find(t => t.owner === 1).soldiers, 30);
});

test('같은 시드는 같은 판, 지형은 4종 중 하나', () => {
  const a = generateRun(99, 0, {}), b = generateRun(99, 0, {});
  assert.deepEqual(a.tiles, b.tiles);
  for (const t of a.tiles.filter(t => t.owner === NEUTRAL)) assert.ok(['plain', 'forest', 'hill', 'mountain'].includes(t.terrain));
  assert.equal(TERRAIN.mountain.def, 1.0);
});

test('환생 4회면 반지름 5, AI 3', () => {
  const run = generateRun(1, 4, {});
  assert.equal(run.tiles.length, 91);
  assert.equal(run.factions, 4);
});
```

- [ ] **Step 2: 실패 확인** — `node --test tests/world.test.js` → FAIL (module not found)

- [ ] **Step 3: 구현** — `src/world.js`

```js
import { mulberry32, pick } from './rng.js';
import { tilesInRadius, corners, distance, key } from './hex.js';

export const TERRAIN = {
  plain:    { name: '평지', gold: 1.0, def: 0,   cap: 1.0 },
  forest:   { name: '숲',   gold: 1.5, def: 0.2, cap: 1.0 },
  hill:     { name: '언덕', gold: 2.0, def: 0.5, cap: 1.2 },
  mountain: { name: '산',   gold: 3.0, def: 1.0, cap: 1.5 },
  citadel:  { name: '성채', gold: 3.0, def: 1.0, cap: 2.0 },
};
const TERRAIN_WEIGHTS = [['plain', 40], ['forest', 30], ['hill', 20], ['mountain', 10]];
const AI_CORNERS = [2, 4, 3, 1]; // 플레이어(꼭짓점 0)에서 먼 순서
export const PLAYER = 0;
export const NEUTRAL = -1;

export function radiusFor(prestige) { return Math.min(3 + Math.floor(prestige / 2), 6); }
export function aiCountFor(prestige) { return Math.min(2 + Math.floor(prestige / 3), 4); }
export function neutralGarrison(dist, prestige) {
  return Math.round(8 * (1 + dist * 0.6) * (1 + prestige * 0.15));
}

export function generateRun(seed, prestige, upgrades = {}) {
  const rand = mulberry32(seed);
  const radius = radiusFor(prestige);
  const aiCount = aiCountFor(prestige);
  const cs = corners(radius);
  const playerCap = cs[0];
  const capOwner = new Map([[key(...playerCap), PLAYER]]);
  AI_CORNERS.slice(0, aiCount).forEach((ci, i) => capOwner.set(key(...cs[ci]), i + 1));
  const tiles = tilesInRadius(radius).map(([q, r], id) => {
    const k = key(q, r);
    const owner = capOwner.has(k) ? capOwner.get(k) : NEUTRAL;
    const terrain = owner === NEUTRAL ? pick(rand, TERRAIN_WEIGHTS) : 'citadel';
    const soldiers = owner === NEUTRAL
      ? neutralGarrison(distance([q, r], playerCap), prestige)
      : 30 + (owner === PLAYER ? 20 * (upgrades.startArmy || 0) : 0);
    return { id, q, r, terrain, owner, level: 1, soldiers };
  });
  const factions = 1 + aiCount;
  return {
    seed, radius, factions, tiles,
    gold: Array(factions).fill(100),
    aiTimers: Array(factions).fill(0),
    maxTilesOwned: 1,
    sendRatio: 0.5,
    elapsed: 0,
  };
}
```

- [ ] **Step 4: 통과 확인** — `node --test tests/` → 전부 pass
- [ ] **Step 5: 커밋** — `... commit -m "world: 지형표·판 생성"`

---

### Task 3: sim.js — 생산·업그레이드·전투

**Files:**
- Create: `src/sim.js`, `tests/helpers.js`
- Test: `tests/sim.test.js`

**Interfaces:**
- Consumes: hex.neighbors/key, world.TERRAIN/PLAYER/NEUTRAL
- Produces: `MAX_LEVEL=10`, `neighborIds(run, tile) → id[]`, `isAdjacent(run,a,b)`, `prodMul(state,f)`, `soldierMul(state,f)`, `attackMul(state,f)`, `cap(tile)`, `goldRate(state,tile)`, `soldierRate(state,tile)`, `upgradeCost(tile)`, `factionGoldRate(state,f)`, `tick(state,dt)`, `tilesOwned(state,f)`, `updateMaxTiles(state)`, `upgrade(state,tileId) → bool`, `send(state,fromId,toId,ratio) → {type:'invalid'|'move'|'capture'|'repel', sent?, remaining?, defendersLeft?}`, `status(state) → 'playing'|'conquered'|'wiped'`
- state 구조(테스트 헬퍼로도 씀): `{version:1, legacy:{points, prestigeCount, upgrades:{gold,soldiers,attack,startArmy,offline,aiSlow}}, run, lastSave}`

- [ ] **Step 1: 테스트 헬퍼** — `tests/helpers.js`

```js
import { generateRun } from '../src/world.js';
export function makeState(seed = 1, prestige = 0, upgrades = {}) {
  const u = { gold: 0, soldiers: 0, attack: 0, startArmy: 0, offline: 0, aiSlow: 0, ...upgrades };
  return { version: 1, legacy: { points: 0, prestigeCount: prestige, upgrades: u }, run: generateRun(seed, prestige, u), lastSave: 0 };
}
export function capitalOf(state, f) { return state.run.tiles.find(t => t.owner === f && t.terrain === 'citadel'); }
```

- [ ] **Step 2: 실패하는 테스트** — `tests/sim.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeState, capitalOf } from './helpers.js';
import { PLAYER, NEUTRAL } from '../src/world.js';
import { neighborIds, cap, goldRate, soldierRate, upgradeCost, tick, upgrade, send, status, tilesOwned, MAX_LEVEL } from '../src/sim.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('꼭짓점 수도는 이웃이 3개', () => {
  const s = makeState();
  assert.equal(neighborIds(s.run, capitalOf(s, PLAYER)).length, 3);
});

test('생산·한도·비용 수식', () => {
  const s = makeState();
  const c = capitalOf(s, PLAYER);
  near(goldRate(s, c), 0.5 * 3 * 1);
  near(soldierRate(s, c), 0.15);
  near(cap(c), 40);
  near(upgradeCost(c), 40 * 3);
  c.level = 3;
  near(upgradeCost(c), 40 * 1.7 ** 2 * 3);
});

test('유산·환생 배율', () => {
  const s = makeState(1, 2, { gold: 3, soldiers: 1, attack: 4 });
  const pc = capitalOf(s, PLAYER), ac = capitalOf(s, 1);
  near(goldRate(s, pc), 1.5 * 1.3);
  near(goldRate(s, ac), 1.5 * 1.2);
  near(soldierRate(s, pc), 0.15 * 1.1);
  near(soldierRate(s, ac), 0.15 * 1.2);
});

test('tick: 골드 누적, 병사는 한도까지만, 초과분은 유지', () => {
  const s = makeState();
  const c = capitalOf(s, PLAYER);
  tick(s, 10);
  near(s.run.gold[PLAYER], 100 + 15);
  near(c.soldiers, 31.5);
  tick(s, 1000);
  near(c.soldiers, 40);
  c.soldiers = 55; tick(s, 1);
  near(c.soldiers, 55);
  near(s.run.elapsed, 1011);
});

test('업그레이드: 골드 차감·상한', () => {
  const s = makeState();
  const c = capitalOf(s, PLAYER);
  assert.equal(upgrade(s, c.id), false);
  s.run.gold[PLAYER] = 120;
  assert.equal(upgrade(s, c.id), true);
  assert.equal(c.level, 2);
  near(s.run.gold[PLAYER], 0);
  c.level = MAX_LEVEL; s.run.gold[PLAYER] = 1e9;
  assert.equal(upgrade(s, c.id), false);
  const n = s.run.tiles.find(t => t.owner === NEUTRAL);
  assert.equal(upgrade(s, n.id), false);
});

test('공격 성공: 점령, 남은 병사 = (A−D)/공격배율', () => {
  const s = makeState(1, 0, { attack: 2 });
  const c = capitalOf(s, PLAYER);
  const t = s.run.tiles[neighborIds(s.run, c)[0]];
  t.terrain = 'forest'; t.soldiers = 10; c.soldiers = 40;
  const r = send(s, c.id, t.id, 1.0);
  assert.equal(r.type, 'capture');
  assert.equal(t.owner, PLAYER);
  near(t.soldiers, (40 * 1.1 - 10 * 1.2) / 1.1);
  near(c.soldiers, 0);
  assert.equal(s.run.maxTilesOwned, 2);
});

test('공격 실패: 수비 = (D−A)/(1+방어), 공격병 전멸', () => {
  const s = makeState();
  const c = capitalOf(s, PLAYER);
  const t = s.run.tiles[neighborIds(s.run, c)[0]];
  t.terrain = 'mountain'; t.soldiers = 30; c.soldiers = 40;
  const r = send(s, c.id, t.id, 0.5);
  assert.equal(r.type, 'repel');
  assert.equal(t.owner, NEUTRAL);
  near(t.soldiers, (60 - 20) / 2);
  near(c.soldiers, 20);
});

test('이동: 내 땅으로는 병사 합산, 비인접·1 미만·중립 출발은 invalid', () => {
  const s = makeState();
  const c = capitalOf(s, PLAYER);
  const t = s.run.tiles[neighborIds(s.run, c)[0]];
  t.owner = PLAYER; t.soldiers = 5; c.soldiers = 20;
  assert.equal(send(s, c.id, t.id, 0.5).type, 'move');
  near(t.soldiers, 15); near(c.soldiers, 10);
  const far = s.run.tiles.find(x => !neighborIds(s.run, c).includes(x.id) && x.id !== c.id);
  assert.equal(send(s, c.id, far.id, 0.5).type, 'invalid');
  c.soldiers = 1.5;
  assert.equal(send(s, c.id, t.id, 0.5).type, 'invalid');
  const n = s.run.tiles.find(x => x.owner === NEUTRAL);
  assert.equal(send(s, n.id, neighborIds(s.run, n)[0], 1).type, 'invalid');
});

test('status: playing / conquered / wiped', () => {
  const s = makeState();
  assert.equal(status(s), 'playing');
  for (const t of s.run.tiles) t.owner = PLAYER;
  assert.equal(status(s), 'conquered');
  for (const t of s.run.tiles) t.owner = 1;
  assert.equal(status(s), 'wiped');
  assert.equal(tilesOwned(s, 1), 37);
});
```

- [ ] **Step 3: 실패 확인** — `node --test tests/sim.test.js` → FAIL

- [ ] **Step 4: 구현** — `src/sim.js`

```js
import { neighbors, key } from './hex.js';
import { TERRAIN, PLAYER, NEUTRAL } from './world.js';

export const MAX_LEVEL = 10;
const indexCache = new WeakMap();
function index(run) {
  let m = indexCache.get(run.tiles);
  if (!m) { m = new Map(run.tiles.map(t => [key(t.q, t.r), t.id])); indexCache.set(run.tiles, m); }
  return m;
}
export function neighborIds(run, tile) {
  const m = index(run);
  return neighbors(tile.q, tile.r).map(([q, r]) => m.get(key(q, r))).filter(id => id !== undefined);
}
export function isAdjacent(run, a, b) { return neighborIds(run, a).includes(b.id); }

export function prodMul(state, f) {
  return f === PLAYER ? 1 + 0.1 * (state.legacy.upgrades.gold || 0) : 1 + 0.1 * state.legacy.prestigeCount;
}
export function soldierMul(state, f) {
  return f === PLAYER ? 1 + 0.1 * (state.legacy.upgrades.soldiers || 0) : 1 + 0.1 * state.legacy.prestigeCount;
}
export function attackMul(state, f) { return f === PLAYER ? 1 + 0.05 * (state.legacy.upgrades.attack || 0) : 1; }
export function cap(tile) { return 20 * tile.level * TERRAIN[tile.terrain].cap; }
export function goldRate(state, tile) { return 0.5 * TERRAIN[tile.terrain].gold * tile.level * prodMul(state, tile.owner); }
export function soldierRate(state, tile) { return 0.15 * tile.level * soldierMul(state, tile.owner); }
export function upgradeCost(tile) { return 40 * Math.pow(1.7, tile.level - 1) * TERRAIN[tile.terrain].gold; }
export function factionGoldRate(state, f) {
  return state.run.tiles.filter(t => t.owner === f).reduce((s, t) => s + goldRate(state, t), 0);
}
export function tilesOwned(state, f) { return state.run.tiles.filter(t => t.owner === f).length; }
export function updateMaxTiles(state) {
  const n = tilesOwned(state, PLAYER);
  if (n > state.run.maxTilesOwned) state.run.maxTilesOwned = n;
}

export function tick(state, dt) {
  const run = state.run;
  for (const t of run.tiles) {
    if (t.owner === NEUTRAL) continue;
    run.gold[t.owner] += goldRate(state, t) * dt;
    const c = cap(t);
    if (t.soldiers < c) t.soldiers = Math.min(c, t.soldiers + soldierRate(state, t) * dt);
  }
  run.elapsed += dt;
  updateMaxTiles(state);
}

export function upgrade(state, tileId) {
  const t = state.run.tiles[tileId];
  if (!t || t.owner === NEUTRAL || t.level >= MAX_LEVEL) return false;
  const cost = upgradeCost(t);
  if (state.run.gold[t.owner] < cost) return false;
  state.run.gold[t.owner] -= cost;
  t.level += 1;
  return true;
}

export function send(state, fromId, toId, ratio) {
  const run = state.run;
  const from = run.tiles[fromId], to = run.tiles[toId];
  if (!from || !to || from.owner === NEUTRAL || from.id === to.id) return { type: 'invalid' };
  if (!isAdjacent(run, from, to)) return { type: 'invalid' };
  const amount = from.soldiers * ratio;
  if (amount < 1) return { type: 'invalid' };
  from.soldiers -= amount;
  if (to.owner === from.owner) { to.soldiers += amount; return { type: 'move', sent: amount }; }
  const am = attackMul(state, from.owner), def = 1 + TERRAIN[to.terrain].def;
  const A = amount * am, D = to.soldiers * def;
  if (A > D) {
    to.owner = from.owner; to.soldiers = (A - D) / am;
    updateMaxTiles(state);
    return { type: 'capture', sent: amount, remaining: to.soldiers };
  }
  to.soldiers = (D - A) / def;
  return { type: 'repel', sent: amount, defendersLeft: to.soldiers };
}

export function status(state) {
  const n = tilesOwned(state, PLAYER);
  if (n === 0) return 'wiped';
  if (n === state.run.tiles.length) return 'conquered';
  return 'playing';
}
```

- [ ] **Step 5: 통과 확인** — `node --test tests/` → 전부 pass
- [ ] **Step 6: 커밋** — `... commit -m "sim: 생산·업그레이드·전투·승패"`

---

### Task 4: ai.js — AI 한 주기

**Files:**
- Create: `src/ai.js`
- Test: `tests/ai.test.js`

**Interfaces:**
- Consumes: sim(neighborIds, cap, upgrade, upgradeCost, send, attackMul, MAX_LEVEL), world(TERRAIN, NEUTRAL, PLAYER)
- Produces: `aiPeriod(state) → 초`, `aiAct(state, f)`, `runAi(state, dt)`

- [ ] **Step 1: 실패하는 테스트** — `tests/ai.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeState, capitalOf } from './helpers.js';
import { PLAYER, NEUTRAL } from '../src/world.js';
import { neighborIds } from '../src/sim.js';
import { aiPeriod, aiAct, runAi } from '../src/ai.js';

test('주기: 기본 6초, 둔화 2레벨이면 6×1.16', () => {
  assert.equal(aiPeriod(makeState()), 6);
  assert.equal(aiPeriod(makeState(1, 0, { aiSlow: 2 })), 6 * 1.16);
});

test('골드 있으면 가장 낮은 레벨 타일을 업그레이드(주기당 최대 3회)', () => {
  const s = makeState();
  s.run.gold[1] = 100000;
  aiAct(s, 1);
  assert.equal(capitalOf(s, 1).level, 4);
});

test('유리할 때만 공격: 0.8×병사 > 1.2×방어', () => {
  const s = makeState();
  const c = capitalOf(s, 1);
  const n = s.run.tiles[neighborIds(s.run, c)[0]];
  n.terrain = 'plain'; n.soldiers = 10; c.soldiers = 14; // 11.2 ≤ 12 → 안 함
  aiAct(s, 1);
  assert.equal(n.owner, NEUTRAL);
  c.soldiers = 16; // 12.8 > 12 → 공격
  aiAct(s, 1);
  assert.equal(n.owner, 1);
});

test('우선순위: 중립 > 플레이어, 같은 부류면 약한 쪽', () => {
  const s = makeState();
  const c = capitalOf(s, 1);
  const [a, b, d] = neighborIds(s.run, c).map(id => s.run.tiles[id]);
  for (const t of [a, b, d]) t.terrain = 'plain';
  a.owner = PLAYER; a.soldiers = 1;
  b.owner = NEUTRAL; b.soldiers = 5;
  d.owner = NEUTRAL; d.soldiers = 3;
  c.soldiers = 100;
  aiAct(s, 1); // 최대 2회: 중립 약한 순 d, b
  assert.equal(d.owner, 1);
  assert.equal(b.owner, 1);
  assert.equal(a.owner, PLAYER);
});

test('보강: 내부 타일이 한도 절반 이상이면 가장 약한 국경 타일로 절반 이동', () => {
  const s = makeState();
  for (const t of s.run.tiles) { t.owner = 1; t.soldiers = 1; }
  const inner = s.run.tiles.find(t => t.q === 0 && t.r === 0);
  const ring = neighborIds(s.run, inner).map(id => s.run.tiles[id]);
  // ring[0]의 이웃 중 inner도 ring도 아닌 타일 하나를 플레이어 땅으로 → ring[0]만 국경
  const outerId = neighborIds(s.run, ring[0]).find(id => id !== inner.id && !ring.some(r => r.id === id));
  const outer = s.run.tiles[outerId];
  outer.owner = PLAYER; outer.soldiers = 1000; // 공격 불가하게 크게
  inner.soldiers = 30; inner.level = 1; inner.terrain = 'plain'; // cap 20 → 절반 이상
  s.run.gold[1] = 0;
  aiAct(s, 1);
  assert.equal(inner.soldiers, 15);
  assert.equal(ring[0].soldiers, 16);
});

test('runAi: 타이머로 주기마다 발동, 타일 없는 세력은 건너뜀', () => {
  const s = makeState();
  s.run.gold[1] = 100000; s.run.gold[2] = 100000;
  for (const t of s.run.tiles) if (t.owner === 2) t.owner = NEUTRAL;
  runAi(s, 0.25);           // timer 0 → 즉시 1회
  assert.equal(capitalOf(s, 1).level, 4);
  runAi(s, 5.5);            // 아직 6초 안 됨
  assert.equal(capitalOf(s, 1).level, 4);
  runAi(s, 0.5);
  assert.equal(capitalOf(s, 1).level, 7);
});
```

- [ ] **Step 2: 실패 확인** — `node --test tests/ai.test.js` → FAIL

- [ ] **Step 3: 구현** — `src/ai.js`

```js
import { TERRAIN, NEUTRAL, PLAYER } from './world.js';
import { neighborIds, cap, upgrade, upgradeCost, send, attackMul, MAX_LEVEL } from './sim.js';

export function aiPeriod(state) { return 6 * (1 + 0.08 * (state.legacy.upgrades.aiSlow || 0)); }
const priority = owner => (owner === NEUTRAL ? 0 : owner === PLAYER ? 1 : 2);

export function aiAct(state, f) {
  const run = state.run;
  const mine = () => run.tiles.filter(t => t.owner === f);
  if (mine().length === 0) return;

  // 1. 업그레이드: 가장 낮은 레벨(동률이면 골드계수 높은 쪽), 주기당 최대 3회
  for (let i = 0; i < 3; i++) {
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
      if (n.owner === f) continue;
      const D = n.soldiers * (1 + TERRAIN[n.terrain].def);
      if (t.soldiers * 0.8 * am > D * 1.2) options.push({ from: t, to: n, D });
    }
  }
  options.sort((a, b) => priority(a.to.owner) - priority(b.to.owner) || a.D - b.D);
  const used = new Set();
  let attacks = 0;
  for (const o of options) {
    if (attacks >= 2) break;
    if (used.has(o.from.id) || o.to.owner === f) continue;
    send(state, o.from.id, o.to.id, 0.8);
    used.add(o.from.id); attacks++;
  }

  // 3. 보강: 내부 타일(이웃이 전부 내 땅)이 한도 절반 이상이면 가장 약한 국경 이웃으로 절반 이동, 1회
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
```

- [ ] **Step 4: 통과 확인** — `node --test tests/` → 전부 pass. 보강 테스트에서 `outerId`가 `undefined`면(중심 이웃 좌표 가정 문제) ring의 다른 원소로 바꿔 픽스처를 맞춘다(구현이 아니라 테스트 픽스처 문제).
- [ ] **Step 5: 스펙 정정** — 스펙 3.4의 주기 식을 `6 × (1 + 0.08 × AI둔화레벨)`로 고친다(원문 "1 − 보너스"는 오기).
- [ ] **Step 6: 커밋** — `... commit -m "ai: 업그레이드·공격·보강 주기"`

---

### Task 5: offline.js + prestige.js + save.js

**Files:**
- Create: `src/offline.js`, `src/prestige.js`, `src/save.js`
- Test: `tests/offline.test.js`, `tests/prestige.test.js`, `tests/save.test.js`

**Interfaces:**
- Produces(offline): `offlineCapSeconds(state)`, `simulateOffline(state, elapsedSec, step=5) → {seconds, goldGained, tilesBefore, tilesAfter, outcome}`
- Produces(prestige): `LEGACY_ITEMS`, `itemCost(key, level)`, `buy(state,key) → bool`, `pointsFor(state, outcome)`, `rebirth(state, outcome, seed) → 획득 포인트`
- Produces(save): `SAVE_KEY`, `VERSION=1`, `newState(seed?)`, `serialize(state, now?)`, `deserialize(text) → state|null`, `save(state, storage?, now?) → bool`, `load(storage?) → state|null`

- [ ] **Step 1: 실패하는 테스트**

`tests/offline.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeState } from './helpers.js';
import { PLAYER } from '../src/world.js';
import { tick } from '../src/sim.js';
import { runAi } from '../src/ai.js';
import { offlineCapSeconds, simulateOffline } from '../src/offline.js';

test('상한: 8시간 + 4시간×레벨', () => {
  assert.equal(offlineCapSeconds(makeState()), 8 * 3600);
  assert.equal(offlineCapSeconds(makeState(1, 0, { offline: 4 })), 24 * 3600);
});

test('생산만 있을 때 굵은 틱 결과는 잔 틱과 일치', () => {
  const a = makeState(3), b = makeState(3);
  a.run.factions = 1; b.run.factions = 1; // AI 없이 생산만
  const r = simulateOffline(a, 3600);
  for (let i = 0; i < 3600 * 4; i++) tick(b, 0.25);
  assert.ok(Math.abs(a.run.gold[PLAYER] - b.run.gold[PLAYER]) < 1e-6);
  assert.equal(r.seconds, 3600);
  assert.ok(Math.abs(r.goldGained - (b.run.gold[PLAYER] - 100)) < 1e-6);
});

test('AI 포함 1시간: 골드가 잔 틱과 ±5% 이내이고 요약이 채워진다', () => {
  const a = makeState(5), b = makeState(5);
  const r = simulateOffline(a, 3600);
  for (let i = 0; i < 3600 * 4; i++) { tick(b, 0.25); runAi(b, 0.25); }
  const ga = a.run.gold[PLAYER], gb = b.run.gold[PLAYER];
  assert.ok(Math.abs(ga - gb) / gb < 0.05, `${ga} vs ${gb}`);
  assert.equal(r.tilesBefore, 1);
  assert.ok(['playing', 'wiped'].includes(r.outcome));
});

test('경과가 상한을 넘으면 상한까지만', () => {
  const s = makeState();
  assert.equal(simulateOffline(s, 100 * 3600).seconds, 8 * 3600);
});
```

`tests/prestige.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeState } from './helpers.js';
import { PLAYER } from '../src/world.js';
import { LEGACY_ITEMS, itemCost, buy, pointsFor, rebirth } from '../src/prestige.js';

test('상점 비용 = 기본×1.5^레벨, 최대 레벨·포인트 부족이면 실패', () => {
  assert.equal(itemCost('gold', 0), 5);
  assert.equal(itemCost('gold', 2), Math.round(5 * 2.25));
  const s = makeState();
  assert.equal(buy(s, 'gold'), false);
  s.legacy.points = 12;
  assert.equal(buy(s, 'gold'), true);
  assert.equal(s.legacy.upgrades.gold, 1);
  assert.equal(s.legacy.points, 7);
  s.legacy.upgrades.offline = LEGACY_ITEMS.offline.max; s.legacy.points = 1e6;
  assert.equal(buy(s, 'offline'), false);
});

test('포인트: 정복 = 10 + 타일/4 + 레벨합/10, 전멸 = 최대보유/4(최소 1)', () => {
  const s = makeState();
  for (const t of s.run.tiles) { t.owner = PLAYER; t.level = 3; }
  assert.equal(pointsFor(s, 'conquered'), 10 + 9 + Math.floor(111 / 10));
  s.run.maxTilesOwned = 2;
  assert.equal(pointsFor(s, 'wiped'), 1);
  s.run.maxTilesOwned = 13;
  assert.equal(pointsFor(s, 'wiped'), 3);
});

test('환생: 포인트 적립, 횟수 증가, 새 판(반지름·AI 공식), 유산 유지', () => {
  const s = makeState();
  s.legacy.upgrades.startArmy = 1;
  for (const t of s.run.tiles) t.owner = PLAYER;
  const got = rebirth(s, 'conquered', 123);
  assert.equal(got, 10 + 9 + 3);
  assert.equal(s.legacy.points, got);
  assert.equal(s.legacy.prestigeCount, 1);
  assert.equal(s.run.tiles.length, 37);
  assert.equal(s.run.seed, 123);
  assert.equal(s.run.tiles.find(t => t.owner === PLAYER).soldiers, 50);
  rebirth(s, 'conquered', 124);
  assert.equal(s.run.tiles.length, 61);
});
```

`tests/save.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState, serialize, deserialize, save, load, SAVE_KEY } from '../src/save.js';

function memStorage() { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), m }; }

test('새 상태는 유산 0, 반지름 3 판', () => {
  const s = newState(9);
  assert.equal(s.version, 1);
  assert.equal(s.legacy.points, 0);
  assert.equal(s.run.tiles.length, 37);
});

test('직렬화 왕복, lastSave 기록', () => {
  const s = newState(9);
  const text = serialize(s, 1234);
  assert.equal(s.lastSave, 1234);
  assert.deepEqual(deserialize(text), s);
});

test('깨진 텍스트·다른 버전은 null', () => {
  assert.equal(deserialize('{'), null);
  assert.equal(deserialize('{"version":99,"run":{},"legacy":{}}'), null);
  assert.equal(deserialize('42'), null);
});

test('storage에 저장·로드, 실패해도 예외 없음', () => {
  const st = memStorage(), s = newState(9);
  assert.equal(save(s, st, 5), true);
  assert.ok(st.m.has(SAVE_KEY));
  assert.deepEqual(load(st), s);
  const broken = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  assert.equal(save(s, broken), false);
  assert.equal(load(broken), null);
});
```

- [ ] **Step 2: 실패 확인** — `node --test tests/` → 세 파일 FAIL

- [ ] **Step 3: 구현**

`src/offline.js`:
```js
import { tick, tilesOwned, status } from './sim.js';
import { runAi } from './ai.js';
import { PLAYER } from './world.js';

export function offlineCapSeconds(state) { return (8 + 4 * (state.legacy.upgrades.offline || 0)) * 3600; }

export function simulateOffline(state, elapsedSec, step = 5) {
  const seconds = Math.max(0, Math.min(elapsedSec, offlineCapSeconds(state)));
  const goldBefore = state.run.gold[PLAYER];
  const tilesBefore = tilesOwned(state, PLAYER);
  let remaining = seconds;
  while (remaining > 0 && status(state) === 'playing') {
    const dt = Math.min(step, remaining);
    tick(state, dt);
    runAi(state, dt);
    remaining -= dt;
  }
  return {
    seconds,
    goldGained: state.run.gold[PLAYER] - goldBefore,
    tilesBefore,
    tilesAfter: tilesOwned(state, PLAYER),
    outcome: status(state),
  };
}
```

`src/prestige.js`:
```js
import { generateRun, PLAYER } from './world.js';

export const LEGACY_ITEMS = {
  gold:      { name: '풍요',         desc: '골드 생산 +10%/레벨',        max: 20, base: 5 },
  soldiers:  { name: '징집',         desc: '병사 생산 +10%/레벨',        max: 20, base: 5 },
  attack:    { name: '무기',         desc: '공격력 +5%/레벨',            max: 20, base: 8 },
  startArmy: { name: '초기 병력',    desc: '시작 수도 병사 +20/레벨',     max: 10, base: 4 },
  offline:   { name: '오프라인 한도', desc: '꺼둔 시간 인정 +4시간/레벨',  max: 4,  base: 10 },
  aiSlow:    { name: 'AI 둔화',      desc: 'AI 행동 주기 +8%/레벨',       max: 5,  base: 12 },
};
export function itemCost(key, level) { return Math.round(LEGACY_ITEMS[key].base * Math.pow(1.5, level)); }
export function buy(state, key) {
  const item = LEGACY_ITEMS[key]; if (!item) return false;
  const u = state.legacy.upgrades; const lv = u[key] || 0;
  if (lv >= item.max) return false;
  const c = itemCost(key, lv);
  if (state.legacy.points < c) return false;
  state.legacy.points -= c; u[key] = lv + 1;
  return true;
}
export function pointsFor(state, outcome) {
  const run = state.run;
  if (outcome === 'conquered') {
    const levels = run.tiles.filter(t => t.owner === PLAYER).reduce((s, t) => s + t.level, 0);
    return 10 + Math.floor(run.tiles.length / 4) + Math.floor(levels / 10);
  }
  return Math.max(1, Math.floor(run.maxTilesOwned / 4));
}
export function rebirth(state, outcome, seed) {
  const pts = pointsFor(state, outcome);
  state.legacy.points += pts;
  state.legacy.prestigeCount += 1;
  state.run = generateRun(seed, state.legacy.prestigeCount, state.legacy.upgrades);
  return pts;
}
```

`src/save.js`:
```js
import { generateRun } from './world.js';

export const SAVE_KEY = 'landgrab.save.v1';
export const VERSION = 1;

export function newState(seed = Date.now() >>> 0) {
  const upgrades = { gold: 0, soldiers: 0, attack: 0, startArmy: 0, offline: 0, aiSlow: 0 };
  return { version: VERSION, legacy: { points: 0, prestigeCount: 0, upgrades }, run: generateRun(seed, 0, upgrades), lastSave: 0 };
}
export function serialize(state, now = Date.now()) { state.lastSave = now; return JSON.stringify(state); }
export function deserialize(text) {
  let obj;
  try { obj = JSON.parse(text); } catch { return null; }
  if (!obj || typeof obj !== 'object' || !obj.run || !obj.legacy) return null;
  return migrate(obj);
}
export function migrate(obj) { return obj.version === VERSION ? obj : null; }
export function save(state, storage = globalThis.localStorage, now = Date.now()) {
  try { storage.setItem(SAVE_KEY, serialize(state, now)); return true; } catch { return false; }
}
export function load(storage = globalThis.localStorage) {
  try { const t = storage.getItem(SAVE_KEY); return t ? deserialize(t) : null; } catch { return null; }
}
```

- [ ] **Step 4: 통과 확인** — `node --test tests/` → 전부 pass
- [ ] **Step 5: 커밋** — `... commit -m "offline·prestige·save 모듈"`

---

### Task 6: 밸런스 시나리오 테스트

**Files:**
- Create: `tests/balance.test.js`
- Modify(필요 시): `src/world.js`의 `neutralGarrison` 계수, `src/ai.js`의 공격 문턱(0.8/1.2)

**Interfaces:** Consumes sim.tick/send/upgrade/status/neighborIds, ai.runAi, world.PLAYER/NEUTRAL

- [ ] **Step 1: 테스트 작성** — `tests/balance.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeState } from './helpers.js';
import { PLAYER, NEUTRAL, TERRAIN } from '../src/world.js';
import { tick, send, upgrade, status, neighborIds, upgradeCost, tilesOwned, attackMul } from '../src/sim.js';
import { runAi } from '../src/ai.js';

function step(s, dt) { tick(s, dt); runAi(s, dt); }

// 탐욕 플레이어: 5초마다 ① 가장 낮은 레벨 타일 업그레이드 ② 이길 수 있는 가장 약한 이웃 공격(100%)
function greedy(s) {
  const mine = s.run.tiles.filter(t => t.owner === PLAYER);
  const low = mine.filter(t => t.level < 10).sort((a, b) => a.level - b.level)[0];
  if (low && s.run.gold[PLAYER] >= upgradeCost(low)) upgrade(s, low.id);
  const am = attackMul(s, PLAYER);
  let best = null;
  for (const t of mine) for (const id of neighborIds(s.run, t)) {
    const n = s.run.tiles[id]; if (n.owner === PLAYER) continue;
    const D = n.soldiers * (1 + TERRAIN[n.terrain].def);
    if (t.soldiers * am > D * 1.05 && (!best || D < best.D)) best = { from: t, to: n, D };
  }
  if (best) send(s, best.from.id, best.to.id, 1.0);
}

test('① 아무것도 안 해도 10분 안에는 수도를 잃지 않는다', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const s = makeState(seed);
    for (let t = 0; t < 600; t += 1) step(s, 1);
    assert.equal(status(s), 'playing', `seed ${seed}`);
  }
});

test('② 탐욕 플레이어는 2시간 안에 R=3 지도를 정복한다', () => {
  for (const seed of [1, 2, 3]) {
    const s = makeState(seed);
    let t = 0;
    while (t < 7200 && status(s) === 'playing') { step(s, 1); if (t % 5 === 0) greedy(s); t += 1; }
    assert.equal(status(s), 'conquered', `seed ${seed} at ${t}s, tiles=${tilesOwned(s, PLAYER)}`);
  }
});

test('③ AI끼리만 30분: 어느 AI도 전체를 먹지 못한다', () => {
  for (const seed of [1, 2, 3]) {
    const s = makeState(seed);
    for (const t of s.run.tiles) if (t.owner === PLAYER) { t.owner = NEUTRAL; t.soldiers = 30; }
    for (let t = 0; t < 1800; t += 1) step(s, 1);
    for (let f = 1; f < s.run.factions; f++) assert.ok(tilesOwned(s, f) < s.run.tiles.length, `seed ${seed} AI${f}`);
  }
});
```

- [ ] **Step 2: 실행** — `node --test tests/balance.test.js`. 통과하면 Step 4로.
- [ ] **Step 3: 조정(실패 시)** — 규칙은 아래 순서로 하나씩 바꾸고 재실행. 바꾼 값은 스펙 3.1/3.4에도 반영해 커밋에 포함.
  1. ①이 실패(플레이어 즉사): `neutralGarrison`의 거리 계수 0.6을 0.8로 올려 AI가 플레이어 쪽까지 늦게 오게 한다.
  2. ②가 실패(정복 못 함): `neutralGarrison` 기본 8을 6으로 내리거나, 탐욕 스크립트가 아닌 규칙 문제인지 `tilesOwned` 추이를 `console.log`로 확인한다. 2시간 시뮬은 1초 틱 7,200회×3시드라 수 초 안에 끝나야 한다.
  3. ③이 실패(AI 독식): AI 공격 문턱 1.2를 1.4로 올린다.
- [ ] **Step 4: 전체 통과** — `node --test tests/` → 전부 pass
- [ ] **Step 5: 커밋** — `... commit -m "밸런스 시나리오 테스트(+계수 조정)"`

---

### Task 7: index.html + style.css + render.js(캔버스)

**Files:**
- Create: `index.html`, `style.css`, `src/render.js`, `assets/CREDITS.md`
- Test: `tests/render.test.js` (카메라·피킹만; 그리기는 브라우저에서 눈으로)

**Interfaces:**
- Consumes: hex(hexToPixel, hexCorners, pixelToHex), world(TERRAIN, NEUTRAL, PLAYER), sim(cap)
- Produces: `HEX_SIZE=36`, `FACTION_COLORS[]`, `createCamera() → {x,y,scale}`, `worldToScreen(cam,W,H,wx,wy)`, `screenToWorld(cam,W,H,sx,sy)`, `pickTile(run,cam,W,H,sx,sy) → tile|null`, `ownerColor(owner)`, `loadAssets(base) → Promise<{terrain:Image}>`, `draw(ctx, state, cam, W, H, {selectedId, effects, images})`
- effects 항목: `{fromId, toId, t(0~1), color}`
- DOM id(ui.js·main.js가 의존): `#canvas`, `#top-gold`, `#top-rate`, `#top-prestige`, `#top-points`, `#btn-menu`, `#panel`, `#p-title`, `#p-stats`, `#btn-upgrade`, `.ratio-btn[data-r]`, `#hint`, `#modal`, `#modal-title`, `#modal-body`, `#modal-actions`

- [ ] **Step 1: 실패하는 테스트** — `tests/render.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeState, capitalOf } from './helpers.js';
import { PLAYER } from '../src/world.js';
import { hexToPixel } from '../src/hex.js';
import { createCamera, worldToScreen, screenToWorld, pickTile, HEX_SIZE } from '../src/render.js';

test('카메라 변환 왕복', () => {
  const cam = { x: 100, y: -50, scale: 1.5 };
  const [sx, sy] = worldToScreen(cam, 400, 800, 130, 10);
  assert.deepEqual(screenToWorld(cam, 400, 800, sx, sy).map(v => Math.round(v * 1e6) / 1e6), [130, 10]);
});

test('타일 피킹: 수도 중심 화면 좌표를 찍으면 수도', () => {
  const s = makeState();
  const c = capitalOf(s, PLAYER);
  const cam = createCamera();
  const [wx, wy] = hexToPixel(c.q, c.r, HEX_SIZE);
  const [sx, sy] = worldToScreen(cam, 390, 700, wx, wy);
  assert.equal(pickTile(s.run, cam, 390, 700, sx + 5, sy + 5), c);
  assert.equal(pickTile(s.run, cam, 390, 700, 5000, 5000), null);
});
```

- [ ] **Step 2: 실패 확인** — `node --test tests/render.test.js` → FAIL

- [ ] **Step 3: render.js 구현**

```js
import { hexToPixel, hexCorners, pixelToHex } from './hex.js';
import { TERRAIN, NEUTRAL, PLAYER } from './world.js';
import { cap } from './sim.js';

export const HEX_SIZE = 36;
export const FACTION_COLORS = ['#2f80ed', '#eb5757', '#f2c94c', '#9b51e0', '#27ae60'];
export const NEUTRAL_COLOR = '#777';
const TERRAIN_FILL = { plain: '#a8d08d', forest: '#5b8c5a', hill: '#c9a66b', mountain: '#8c8c8c', citadel: '#d9b382' };
// Task 8에서 실제 파일명으로 채움. 파일이 없으면 단색 육각형으로 그린다.
export const ASSET_FILES = { plain: 'plain.png', forest: 'forest.png', hill: 'hill.png', mountain: 'mountain.png', citadel: 'citadel.png' };

export function createCamera() { return { x: 0, y: 0, scale: 1 }; }
export function worldToScreen(cam, W, H, wx, wy) { return [(wx - cam.x) * cam.scale + W / 2, (wy - cam.y) * cam.scale + H / 2]; }
export function screenToWorld(cam, W, H, sx, sy) { return [(sx - W / 2) / cam.scale + cam.x, (sy - H / 2) / cam.scale + cam.y]; }
export function pickTile(run, cam, W, H, sx, sy) {
  const [wx, wy] = screenToWorld(cam, W, H, sx, sy);
  const [q, r] = pixelToHex(wx, wy, HEX_SIZE);
  return run.tiles.find(t => t.q === q && t.r === r) || null;
}
export function ownerColor(owner) { return owner === NEUTRAL ? NEUTRAL_COLOR : FACTION_COLORS[owner % FACTION_COLORS.length]; }

export function loadAssets(base = 'assets/') {
  const images = {};
  return Promise.all(Object.entries(ASSET_FILES).map(([k, f]) => new Promise(res => {
    const im = new Image();
    im.onload = () => { images[k] = im; res(); };
    im.onerror = () => res();
    im.src = base + f;
  }))).then(() => images);
}

export function draw(ctx, state, cam, W, H, { selectedId = null, effects = [], images = {} } = {}) {
  const run = state.run;
  const size = HEX_SIZE * cam.scale;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#1b2430'; ctx.fillRect(0, 0, W, H);
  for (const t of run.tiles) {
    const [wx, wy] = hexToPixel(t.q, t.r, HEX_SIZE);
    const [cx, cy] = worldToScreen(cam, W, H, wx, wy);
    if (cx < -size || cy < -size || cx > W + size || cy > H + size) continue;
    const pts = hexCorners(cx, cy, size - 1.5);
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
    const img = images[t.terrain];
    if (img) {
      ctx.save(); ctx.clip();
      ctx.drawImage(img, cx - size, cy - size, size * 2, size * 2);
      ctx.restore();
    } else { ctx.fillStyle = TERRAIN_FILL[t.terrain]; ctx.fill(); }
    ctx.lineWidth = t.owner === NEUTRAL ? 1 : Math.max(2, size * 0.12);
    ctx.strokeStyle = ownerColor(t.owner); ctx.stroke();
    if (t.id === selectedId) { ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke(); }
    if (size >= 14) {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
      ctx.font = `bold ${Math.round(size * 0.5)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const label = String(Math.floor(t.soldiers));
      ctx.strokeText(label, cx, cy + size * 0.05); ctx.fillText(label, cx, cy + size * 0.05);
      if (t.owner !== NEUTRAL) {
        ctx.fillStyle = '#fff';
        for (let i = 0; i < t.level; i++) {
          const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
          ctx.beginPath(); ctx.arc(cx + Math.cos(a) * size * 0.62, cy + Math.sin(a) * size * 0.62, size * 0.06, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
  }
  for (const e of effects) {
    const a = run.tiles[e.fromId], b = run.tiles[e.toId];
    if (!a || !b) continue;
    const [ax, ay] = worldToScreen(cam, W, H, ...hexToPixel(a.q, a.r, HEX_SIZE));
    const [bx, by] = worldToScreen(cam, W, H, ...hexToPixel(b.q, b.r, HEX_SIZE));
    ctx.beginPath(); ctx.arc(ax + (bx - ax) * e.t, ay + (by - ay) * e.t, size * 0.2, 0, Math.PI * 2);
    ctx.fillStyle = e.color; ctx.fill();
  }
}
```

- [ ] **Step 4: index.html**

```html
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="theme-color" content="#1b2430">
<title>땅따먹기</title>
<link rel="manifest" href="manifest.json">
<link rel="apple-touch-icon" href="assets/icon-180.png">
<link rel="stylesheet" href="style.css">
</head>
<body>
<header id="top">
  <span id="top-gold">💰 0</span>
  <span id="top-rate">+0/초</span>
  <span id="top-prestige">환생 0</span>
  <span id="top-points">✨ 0</span>
  <button id="btn-menu" type="button">≡</button>
</header>
<canvas id="canvas"></canvas>
<section id="panel">
  <div id="p-title">타일을 탭하세요</div>
  <div id="p-stats"></div>
  <div id="p-actions">
    <button id="btn-upgrade" type="button" disabled>업그레이드</button>
    <div id="ratio">
      <button class="ratio-btn" data-r="0.25" type="button">25%</button>
      <button class="ratio-btn active" data-r="0.5" type="button">50%</button>
      <button class="ratio-btn" data-r="1" type="button">100%</button>
    </div>
  </div>
  <div id="hint">내 땅을 탭한 뒤 옆 땅을 탭하면 공격/이동</div>
</section>
<div id="modal" hidden>
  <div id="modal-box">
    <h2 id="modal-title"></h2>
    <div id="modal-body"></div>
    <div id="modal-actions"></div>
  </div>
</div>
<script type="module" src="src/main.js"></script>
</body>
</html>
```

- [ ] **Step 5: style.css**

```css
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
html, body { margin: 0; height: 100%; background: #1b2430; color: #eee; font-family: system-ui, -apple-system, sans-serif; overflow: hidden; overscroll-behavior: none; }
body { display: flex; flex-direction: column; height: 100dvh; padding-top: env(safe-area-inset-top); }
#top { display: flex; gap: 8px; align-items: center; padding: 6px 10px; font-size: 14px; background: #111820; }
#top span { white-space: nowrap; }
#top-gold { font-weight: bold; }
#btn-menu { margin-left: auto; font-size: 20px; background: none; border: 1px solid #555; color: #eee; border-radius: 6px; padding: 2px 10px; }
#canvas { flex: 1; width: 100%; touch-action: none; display: block; }
#panel { background: #111820; padding: 8px 12px calc(8px + env(safe-area-inset-bottom)); min-height: 120px; }
#p-title { font-weight: bold; margin-bottom: 4px; }
#p-stats { font-size: 13px; color: #bbb; white-space: pre-line; min-height: 34px; }
#p-actions { display: flex; gap: 8px; align-items: center; margin-top: 6px; }
button { font: inherit; }
#btn-upgrade { flex: 1; padding: 10px; border-radius: 8px; border: none; background: #2f80ed; color: #fff; font-weight: bold; }
#btn-upgrade:disabled { background: #444; color: #888; }
#ratio { display: flex; border: 1px solid #555; border-radius: 8px; overflow: hidden; }
.ratio-btn { background: none; border: none; color: #bbb; padding: 10px 8px; }
.ratio-btn.active { background: #2f80ed; color: #fff; }
#hint { font-size: 12px; color: #888; margin-top: 6px; }
#modal { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; padding: 20px; z-index: 10; }
#modal[hidden] { display: none; }
#modal-box { background: #222b36; border-radius: 12px; padding: 16px; width: 100%; max-width: 420px; max-height: 85dvh; overflow: auto; }
#modal-box h2 { margin: 0 0 10px; font-size: 18px; }
#modal-body { font-size: 14px; line-height: 1.5; }
#modal-body button { padding: 6px 10px; border-radius: 6px; border: 1px solid #555; background: none; color: #eee; }
#modal-actions { display: flex; gap: 8px; margin-top: 14px; justify-content: flex-end; }
#modal-actions button { padding: 8px 14px; border-radius: 8px; border: 1px solid #555; background: none; color: #eee; }
#modal-actions button.primary { background: #2f80ed; border-color: #2f80ed; color: #fff; }
.shop-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid #333; }
.shop-row .name { flex: 1; }
.shop-row .desc { display: block; font-size: 12px; color: #999; }
.shop-row button:disabled { color: #666; }
textarea { width: 100%; height: 90px; font-size: 12px; background: #111; color: #ddd; border: 1px solid #444; }
```

- [ ] **Step 6: assets/CREDITS.md** — 내용: "지형 타일: Kenney (kenney.nl) CC0. 파일 목록은 Task 8에서 추가." 한 줄로 시작.
- [ ] **Step 7: 통과 확인** — `node --test tests/` → 전부 pass
- [ ] **Step 8: 커밋** — `... commit -m "화면 뼈대와 캔버스 렌더러"`

---

### Task 8: 에셋(Kenney CC0) + 아이콘 + manifest

**Files:**
- Create: `assets/*.png`, `assets/icon-180.png`, `assets/icon-512.png`, `manifest.json`, `tools/make_icon.py`
- Modify: `src/render.js`의 `ASSET_FILES`, `assets/CREDITS.md`

- [ ] **Step 1: Kenney 육각 타일 내려받기** — Git Bash에서:

```bash
cd "/c/Users/user/Desktop/ai만들기/땅따먹기"
mkdir -p /tmp/kenney && cd /tmp/kenney
curl -sL https://kenney.nl/assets/hexagon-pack | grep -o 'https://[^"]*hexagon[^"]*\.zip' | head -1
# 위 링크가 나오면: curl -L -o hex.zip "<링크>" && unzip -l hex.zip | grep -i png | head -80
```

  링크가 안 나오거나 다운로드가 막히면 사용자 브라우저로 https://kenney.nl/assets/hexagon-pack 에서 zip을 받아 `Downloads`에 두라고 안내하고 계속한다. 그것도 안 되면 이 Task는 아이콘·manifest만 하고 단색 육각형으로 간다(렌더러 대체 경로가 이미 있음).

- [ ] **Step 2: 지형별 타일 1장씩 고르기** — zip 안 PNG 목록에서 풀(초원) → `plain.png`, 나무 있는 초원 → `forest.png`, 흙/모래 언덕 → `hill.png`, 돌산 → `mountain.png`, 성/탑이 있는 타일 → `citadel.png` 로 `assets/`에 복사한다. 이름이 정해지면 `render.js`의 `ASSET_FILES` 값과 `assets/CREDITS.md`의 파일 목록을 실제 이름으로 맞춘다(`ASSET_FILES` 키는 그대로 두고 값만 바꾼다). 타일 그림은 정사각 캔버스에 육각형이 그려진 형태라 `draw`의 clip 안에서 2×size 정사각으로 넣으면 맞는다.

- [ ] **Step 3: 아이콘 생성** — `tools/make_icon.py`

```python
# -*- coding: utf-8 -*-
from PIL import Image, ImageDraw
import math, os
os.makedirs('assets', exist_ok=True)
for n in (180, 512):
    im = Image.new('RGBA', (n, n), '#1b2430'); d = ImageDraw.Draw(im)
    c = n / 2; R = n * 0.42
    pts = [(c + R * math.cos(math.radians(60 * i - 30)), c + R * math.sin(math.radians(60 * i - 30))) for i in range(6)]
    d.polygon(pts, fill='#a8d08d', outline='#2f80ed', width=max(4, n // 28))
    r2 = R * 0.35
    d.ellipse([c - r2, c - r2, c + r2, c + r2], fill='#2f80ed')
    im.save(f'assets/icon-{n}.png')
print('ok')
```
  실행: `python -X utf8 tools/make_icon.py`

- [ ] **Step 4: manifest.json**

```json
{
  "name": "땅따먹기",
  "short_name": "땅따먹기",
  "start_url": "./index.html",
  "display": "standalone",
  "background_color": "#1b2430",
  "theme_color": "#1b2430",
  "icons": [{ "src": "assets/icon-512.png", "sizes": "512x512", "type": "image/png" }]
}
```

- [ ] **Step 5: 확인** — `ls assets/` 에 icon 2개 + 지형 PNG(있으면 5개). `node --test tests/` 여전히 전부 pass.
- [ ] **Step 6: 커밋** — `... commit -m "에셋: Kenney 지형 타일, 아이콘, manifest"`

---

### Task 9: ui.js — DOM 갱신·창·터치 입력

**Files:**
- Create: `src/ui.js`
- Test: `tests/ui.test.js` (순수 함수 `formatNum`만; 나머지는 Task 10 브라우저 검증)

**Interfaces:**
- Consumes: world(TERRAIN, PLAYER, NEUTRAL), sim(cap, goldRate, soldierRate, upgradeCost, MAX_LEVEL), render(ownerColor)
- Produces: `formatNum(n) → string`, `ownerName(owner)`, `updateTop(state, rate)`, `updatePanel(state, tile)`, `setRatioButtons(ratio)`, `bindButtons({onUpgrade, onRatio, onMenu})`, `showModal({title, html, actions:[{label, onClick, primary}], onBodyClick})`, `hideModal()`, `isModalOpen()`, `attachCanvasInput(canvas, cam, {onTap, onChange, minScale=0.4, maxScale=2.5})`
- `#modal-body` 안 버튼은 `data-action` 속성으로 식별하고 `onBodyClick(actionName, el)`로 콜백.
- ui.js는 DOM 접근을 함수 안에서만 한다(최상위 `document` 금지) — Node에서 import 가능해야 한다.

- [ ] **Step 1: 테스트** — `tests/ui.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatNum } from '../src/ui.js';
test('숫자 표기', () => {
  assert.equal(formatNum(0), '0');
  assert.equal(formatNum(999.6), '999');
  assert.equal(formatNum(1234), '1,234');
  assert.equal(formatNum(12345), '12.3K');
  assert.equal(formatNum(1234567), '1.23M');
});
```

- [ ] **Step 2: 실패 확인** — `node --test tests/ui.test.js` → FAIL

- [ ] **Step 3: 구현** — `src/ui.js`

```js
import { TERRAIN, PLAYER, NEUTRAL } from './world.js';
import { cap, goldRate, soldierRate, upgradeCost, MAX_LEVEL } from './sim.js';
import { ownerColor } from './render.js';

export function formatNum(n) {
  n = Math.floor(n);
  if (n < 10000) return n.toLocaleString('en-US');
  if (n < 1e6) return (n / 1e3).toPrecision(3).replace(/\.?0+$/, '') + 'K';
  return (n / 1e6).toPrecision(3).replace(/\.?0+$/, '') + 'M';
}
const $ = id => document.getElementById(id);
export function ownerName(owner) { return owner === NEUTRAL ? '중립' : owner === PLAYER ? '나' : `AI ${owner}`; }

export function updateTop(state, rate) {
  $('top-gold').textContent = `💰 ${formatNum(state.run.gold[PLAYER])}`;
  $('top-rate').textContent = `+${rate.toFixed(1)}/초`;
  $('top-prestige').textContent = `환생 ${state.legacy.prestigeCount}`;
  $('top-points').textContent = `✨ ${state.legacy.points}`;
}

export function updatePanel(state, tile) {
  const title = $('p-title'), stats = $('p-stats'), btn = $('btn-upgrade');
  if (!tile) { title.textContent = '타일을 탭하세요'; stats.textContent = ''; btn.disabled = true; btn.textContent = '업그레이드'; return; }
  const tr = TERRAIN[tile.terrain];
  title.innerHTML = `<span style="color:${ownerColor(tile.owner)}">■</span> ${tr.name} · ${ownerName(tile.owner)} · Lv.${tile.level}`;
  const mine = tile.owner === PLAYER;
  const lines = [`병사 ${Math.floor(tile.soldiers)} / ${Math.floor(cap(tile))}`, `방어 +${Math.round(tr.def * 100)}%`];
  if (mine) lines.push(`생산 골드 ${goldRate(state, tile).toFixed(2)}/초 · 병사 ${soldierRate(state, tile).toFixed(2)}/초`);
  stats.textContent = lines.join('\n');
  if (mine && tile.level < MAX_LEVEL) {
    const cost = upgradeCost(tile);
    btn.disabled = state.run.gold[PLAYER] < cost;
    btn.textContent = `업그레이드 Lv.${tile.level + 1} (💰 ${formatNum(cost)})`;
  } else { btn.disabled = true; btn.textContent = mine ? '최대 레벨' : '업그레이드'; }
}

export function setRatioButtons(ratio) {
  document.querySelectorAll('.ratio-btn').forEach(b => b.classList.toggle('active', Number(b.dataset.r) === ratio));
}

export function bindButtons({ onUpgrade, onRatio, onMenu }) {
  $('btn-upgrade').addEventListener('click', onUpgrade);
  document.querySelectorAll('.ratio-btn').forEach(b => b.addEventListener('click', () => onRatio(Number(b.dataset.r))));
  $('btn-menu').addEventListener('click', onMenu);
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

export function attachCanvasInput(canvas, cam, { onTap, onChange, minScale = 0.4, maxScale = 2.5 }) {
  const pointers = new Map();
  let start = null, moved = 0, pinchDist = 0;
  const pos = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, pos(e));
    if (pointers.size === 1) { start = { p: pos(e), t: performance.now() }; moved = 0; }
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinchDist = Math.hypot(a[0] - b[0], a[1] - b[1]); }
  });
  canvas.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId), cur = pos(e);
    pointers.set(e.pointerId, cur);
    if (pointers.size === 1) {
      cam.x -= (cur[0] - prev[0]) / cam.scale; cam.y -= (cur[1] - prev[1]) / cam.scale;
      moved += Math.hypot(cur[0] - prev[0], cur[1] - prev[1]);
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinchDist > 0) cam.scale = Math.min(maxScale, Math.max(minScale, cam.scale * (d / pinchDist)));
      pinchDist = d; moved += 100;
    }
    onChange && onChange();
  });
  const end = e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pointers.size === 0 && start && moved < 8 && performance.now() - start.t < 400) onTap(start.p[0], start.p[1]);
    if (pointers.size === 0) start = null;
    pinchDist = 0;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('wheel', e => { e.preventDefault(); cam.scale = Math.min(maxScale, Math.max(minScale, cam.scale * (e.deltaY < 0 ? 1.1 : 0.9))); onChange && onChange(); }, { passive: false });
}
```

- [ ] **Step 4: 통과 확인** — `node --test tests/` → 전부 pass
- [ ] **Step 5: 커밋** — `... commit -m "ui: 패널·창·터치 입력"`

---

### Task 10: main.js — 루프·배선·창 흐름, 브라우저 검증

**Files:**
- Create: `src/main.js`
- Test: 브라우저 실측(아래 Step 3) + 기존 테스트 전부

**Interfaces:** Consumes 전 모듈. `window.__game = { state, cam }` 를 노출해 콘솔 검증에 쓴다.

- [ ] **Step 1: 구현** — `src/main.js`

```js
import { PLAYER } from './world.js';
import { tick, send, upgrade, status, isAdjacent, factionGoldRate } from './sim.js';
import { runAi } from './ai.js';
import { simulateOffline } from './offline.js';
import { LEGACY_ITEMS, itemCost, buy, pointsFor, rebirth } from './prestige.js';
import { newState, save, load, serialize, deserialize, SAVE_KEY } from './save.js';
import { createCamera, draw, pickTile, loadAssets, HEX_SIZE, FACTION_COLORS } from './render.js';
import { hexToPixel } from './hex.js';
import { updateTop, updatePanel, setRatioButtons, bindButtons, showModal, hideModal, isModalOpen, attachCanvasInput, formatNum } from './ui.js';

const TICK = 0.25, AUTOSAVE = 5;
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const cam = createCamera();
let state = load() || newState();
let images = {}, selectedId = null, effects = [], acc = 0, saveAcc = 0, last = performance.now(), W = 0, H = 0, ended = false;
window.__game = { get state() { return state; }, cam };

function resize() {
  const dpr = window.devicePixelRatio || 1;
  W = canvas.clientWidth; H = canvas.clientHeight;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function centerOnCapital() {
  const c = state.run.tiles.find(t => t.owner === PLAYER) || state.run.tiles[0];
  [cam.x, cam.y] = hexToPixel(c.q, c.r, HEX_SIZE);
  cam.scale = Math.min(1, (Math.min(W, H) / 2) / (HEX_SIZE * 1.8 * (state.run.radius + 1)) * 1.6);
}
function selected() { return selectedId === null ? null : state.run.tiles[selectedId]; }
function refresh() { updateTop(state, factionGoldRate(state, PLAYER)); updatePanel(state, selected()); }
function hms(sec) { const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60); return h ? `${h}시간 ${m}분` : `${m}분`; }

function onTap(sx, sy) {
  if (isModalOpen()) return;
  const t = pickTile(state.run, cam, W, H, sx, sy);
  if (!t) { selectedId = null; refresh(); return; }
  const s = selected();
  if (s && s.owner === PLAYER && t.id !== s.id && isAdjacent(state.run, s, t)) {
    const r = send(state, s.id, t.id, state.run.sendRatio);
    if (r.type !== 'invalid') effects.push({ fromId: s.id, toId: t.id, t: 0, color: FACTION_COLORS[PLAYER] });
    if (r.type === 'capture') selectedId = t.id;
    refresh(); checkEnd(); return;
  }
  selectedId = t.id; refresh();
}

function openMenu() {
  showModal({
    title: '메뉴',
    html: `<p>유산 포인트 ✨ ${state.legacy.points} · 환생 ${state.legacy.prestigeCount}회</p>
      <p><button data-action="shop">유산 상점</button> <button data-action="export">저장 내보내기</button> <button data-action="import">저장 가져오기</button></p>
      <p><button data-action="reset" style="color:#eb5757">처음부터(전부 삭제)</button></p>`,
    actions: [{ label: '닫기', onClick: hideModal, primary: true }],
    onBodyClick: a => {
      if (a === 'shop') openShop();
      if (a === 'export') showModal({ title: '저장 내보내기', html: `<textarea readonly>${serialize(state)}</textarea><p>전체 선택해서 복사하세요.</p>`, actions: [{ label: '닫기', onClick: hideModal, primary: true }] });
      if (a === 'import') showModal({ title: '저장 가져오기', html: `<textarea id="import-text" placeholder="붙여넣기"></textarea><p id="import-msg"></p>`, actions: [
        { label: '취소', onClick: hideModal },
        { label: '가져오기', primary: true, onClick: () => {
          const s = deserialize(document.getElementById('import-text').value);
          if (!s) { document.getElementById('import-msg').textContent = '형식이 맞지 않습니다.'; return; }
          state = s; selectedId = null; ended = false; centerOnCapital(); save(state); hideModal(); refresh();
        } },
      ] });
      if (a === 'reset') showModal({ title: '정말 삭제할까요?', html: '<p>유산 포인트와 환생 기록까지 전부 사라집니다.</p>', actions: [
        { label: '취소', onClick: hideModal },
        { label: '삭제', onClick: () => { localStorage.removeItem(SAVE_KEY); state = newState(); selectedId = null; ended = false; centerOnCapital(); save(state); hideModal(); refresh(); } },
      ] });
    },
  });
}

function openShop(afterClose = hideModal) {
  const rows = Object.entries(LEGACY_ITEMS).map(([k, it]) => {
    const lv = state.legacy.upgrades[k] || 0, maxed = lv >= it.max, cost = maxed ? null : itemCost(k, lv);
    return `<div class="shop-row"><span class="name">${it.name} <b>Lv.${lv}/${it.max}</b><span class="desc">${it.desc}</span></span>
      <button data-action="buy:${k}" ${maxed || state.legacy.points < cost ? 'disabled' : ''}>${maxed ? '완료' : `✨ ${cost}`}</button></div>`;
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
  showModal({
    title: st === 'conquered' ? '🎉 지도 정복!' : '💀 전멸…',
    html: `<p>${st === 'conquered' ? '모든 땅을 차지했습니다.' : '모든 땅을 잃었습니다. 강제 환생합니다.'}</p><p>유산 포인트 <b>+${pts}</b></p><p>환생하면 지도가 초기화되고 유산 상점에서 영구 보너스를 살 수 있습니다.</p>`,
    actions: [{ label: '환생', primary: true, onClick: () => { rebirth(state, st, Date.now() >>> 0); selectedId = null; ended = false; centerOnCapital(); save(state); openShop(() => { hideModal(); refresh(); }); } }],
  });
}

function loop(now) {
  const dt = Math.min(1, (now - last) / 1000); last = now;
  if (!ended) {
    acc += dt;
    while (acc >= TICK) { tick(state, TICK); runAi(state, TICK); acc -= TICK; }
    for (const e of effects) e.t += dt / 0.4;
    effects = effects.filter(e => e.t < 1);
    saveAcc += dt; if (saveAcc >= AUTOSAVE) { save(state); saveAcc = 0; }
    checkEnd();
  }
  draw(ctx, state, cam, W, H, { selectedId, effects, images });
  refresh();
  requestAnimationFrame(loop);
}

async function init() {
  resize(); window.addEventListener('resize', resize);
  images = await loadAssets('assets/');
  centerOnCapital();
  setRatioButtons(state.run.sendRatio);
  bindButtons({
    onUpgrade: () => { const s = selected(); if (s && upgrade(state, s.id)) { save(state); refresh(); } },
    onRatio: r => { state.run.sendRatio = r; setRatioButtons(r); },
    onMenu: openMenu,
  });
  attachCanvasInput(canvas, cam, { onTap });
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(state); });
  window.addEventListener('pagehide', () => save(state));
  if (state.lastSave > 0) {
    const elapsed = (Date.now() - state.lastSave) / 1000;
    if (elapsed > 30) {
      const r = simulateOffline(state, elapsed);
      save(state);
      const diff = r.tilesAfter - r.tilesBefore;
      showModal({ title: '돌아오셨군요', html: `<p>꺼둔 시간 ${hms(r.seconds)} 동안</p><p>골드 +${formatNum(r.goldGained)}</p><p>땅 ${r.tilesBefore} → ${r.tilesAfter} (${diff >= 0 ? '+' : ''}${diff})</p>`,
        actions: [{ label: '확인', primary: true, onClick: () => { hideModal(); checkEnd(); } }] });
    }
  }
  requestAnimationFrame(loop);
}
init();
```

- [ ] **Step 2: 로컬 서버로 열기** — ES 모듈은 file:// 로 안 되므로 `python -m http.server 8765 --bind 0.0.0.0` 을 프로젝트 루트에서 백그라운드로 띄우고 PC 크롬에서 `http://localhost:8765/` 접속(같은 와이파이 아이폰은 `http://192.168.0.3:8765/`).

- [ ] **Step 3: 브라우저 검증(크롬 도구 또는 헤드리스)** — 확인 목록:
  1. 콘솔 오류 0건.
  2. 지도가 그려지고 수도가 화면 중앙, 파란 테두리.
  3. 수도 탭 → 패널에 "성채 · 나 · Lv.1", 업그레이드 버튼에 비용 120 표시, 골드 100이라 비활성. `__game.state.run.gold[0]=500` 후 버튼 활성 → 클릭 → Lv.2.
  4. 수도 탭 후 이웃 중립 탭 → 병사 절반 파병, 이김/짐이 숫자에 반영, 점 애니메이션.
  5. 드래그로 팬, 휠로 줌.
  6. 메뉴 → 유산 상점 창 열림/닫힘, 내보내기 텍스트에 JSON.
  7. 새로고침 → 저장 유지. `localStorage` 의 lastSave를 1시간 전으로 조작(`s=JSON.parse(localStorage['landgrab.save.v1']); s.lastSave=Date.now()-3600e3; localStorage['landgrab.save.v1']=JSON.stringify(s)`) 후 새로고침 → 오프라인 정산 창.
  8. 콘솔에서 `__game.state.run.tiles.forEach(t=>t.owner=0)` → 다음 틱에 정복 창 → 환생 → 상점 → 두 번째 환생부터 지도 61칸 확인.
  9. 뷰포트 390×844(아이폰 크기)로 줄여도 상단·패널·지도가 겹치지 않음.

- [ ] **Step 4: 발견한 문제 수정 후** `node --test tests/` 전부 pass
- [ ] **Step 5: 커밋** — `... commit -m "main: 게임 루프·창 흐름·브라우저 검증"`

---

### Task 11: README + GitHub Pages 배포

**Files:**
- Create: `README.md`
- 원격: GitHub 저장소 `seorak1275/landgrab`(공개)

- [ ] **Step 1: README.md** — 게임 설명 5줄, 규칙 요약(스펙 3장 표 링크), 실행법(`python -m http.server`), 테스트(`node --test tests/`), 배포 주소, 에셋 출처(assets/CREDITS.md).
- [ ] **Step 2: 자격증명 확인** — `gh auth status`. 안 돼 있으면 `printf 'protocol=https\nhost=github.com\n' | git credential fill` 로 Git Credential Manager에 저장된 토큰이 있는지 본다(있으면 `gh auth login --with-token` 에 그 password를 넣어 gh도 로그인). 둘 다 없으면 사용자에게 `! gh auth login` 입력을 요청하고 기다린다.
- [ ] **Step 3: 저장소 생성·푸시**

```bash
cd "/c/Users/user/Desktop/ai만들기/땅따먹기"
git branch -M main
gh repo create landgrab --public --source=. --remote=origin --push
gh api -X POST repos/seorak1275/landgrab/pages -f build_type=legacy -f 'source[branch]=main' -f 'source[path]=/'
```

- [ ] **Step 4: 배포 확인** — 1~2분 뒤 `curl -sI https://seorak1275.github.io/landgrab/ | head -1` 이 `200`. 크롬으로 열어 지도가 뜨는지 확인.
- [ ] **Step 5: 사용자 안내** — 아이폰 사파리에서 주소 열고 공유 → 홈 화면에 추가. 저장은 그 브라우저의 localStorage에 있으니 홈화면 앱과 사파리 탭은 저장이 따로임을 알려준다.
- [ ] **Step 6: 커밋** — `... commit -m "README·배포"` 후 `git push`

---

## 자체 점검 결과

- 스펙 3.1(지도·지형·중립 수비) → Task 2 · 3.2(생산·비용) → Task 3 · 3.3(전투·이동) → Task 3 · 3.4(AI) → Task 4 · 3.5(틱·오프라인) → Task 5, 10 · 3.6(환생·상점) → Task 5, 10 · 3.7(시작 상태) → Task 2 · 4장(화면·iOS) → Task 7, 9, 10 · 5장(에셋) → Task 8 · 7장(저장·내보내기) → Task 5, 10 · 8장(테스트) → Task 1~7 · 9장(배포) → Task 11.
- 스펙 3.4의 AI 주기 식은 `6 × (1 + 0.08 × AI둔화레벨)`로 통일(Task 4 Step 5에서 스펙 수정).
- 이름 일치: `neighborIds/isAdjacent/send/upgrade/status/tilesOwned/factionGoldRate`(sim) · `runAi/aiAct/aiPeriod`(ai) · `simulateOffline`(offline) · `rebirth/pointsFor/buy/itemCost/LEGACY_ITEMS`(prestige) · `newState/save/load/serialize/deserialize/SAVE_KEY`(save) · `draw/pickTile/createCamera/loadAssets/ownerColor/HEX_SIZE/FACTION_COLORS`(render) · `updateTop/updatePanel/setRatioButtons/bindButtons/showModal/hideModal/isModalOpen/attachCanvasInput/formatNum`(ui) 전부 정의 Task와 사용 Task가 같다.
