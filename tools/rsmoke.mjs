// 사단전 모드 브라우저 검증: node tools/cdp.mjs http://localhost:8765/region.html tools/rsmoke.mjs
const SP = process.env.SHOT_DIR || '.';
export async function run(h) {
  const say = (k, v) => console.log(k + ':', v);
  await h.eval(`localStorage.clear()`); await h.goto(); await h.wait(1000);
  say('first open', await h.eval(`(document.getElementById('modal').hidden ? 'no-modal' : document.getElementById('modal-title').textContent) + ' regions=' + __game.state.run.regions.length + ' factions=' + __game.state.run.factions`));
  await h.eval(`(() => { const b = document.querySelector('#modal-actions button'); if (b) b.click(); })()`); await h.wait(200);
  await h.shot(`${SP}/r1_initial.png`);
  say('errors after load', JSON.stringify(h.errors()));
  // 수도 탭 → 패널
  const cp = JSON.parse(await h.eval(`(async () => { const { centerOf } = await import('./src/region/render.js'); const id = __game.state.run.regions.findIndex(r => r.owner === 0); const [wx, wy] = centerOf(id); const c = document.getElementById('canvas').getBoundingClientRect(), cam = __game.cam; return JSON.stringify([c.left + (wx - cam.x) * cam.scale + c.width / 2, c.top + (wy - cam.y) * cam.scale + c.height / 2, id]); })()`));
  await h.tap(cp[0], cp[1]);
  say('capital panel', await h.eval(`document.getElementById('p-title').textContent + ' | sel=' + __game.sel + ' | def hidden=' + document.getElementById('row-def').hidden`));
  await h.eval(`__game.state.run.regions[${cp[2]}].pool = 300`); await h.wait(300);
  await h.eval(`document.querySelector('[data-act="def"][data-n="100"]').click()`); await h.wait(100);
  await h.eval(`document.querySelector('[data-act="div"][data-n="max"]').click()`); await h.wait(300);
  say('after allocate', await h.eval(`(() => { const r = __game.state.run.regions[${cp[2]}]; return 'def=' + Math.floor(r.def) + ' div=' + Math.floor(r.div) + ' pool=' + Math.floor(r.pool) + ' lab=' + document.getElementById('lab-div').textContent; })()`));
  await h.shot(`${SP}/r2_selected.png`);
  // 이웃 중립 공격: 가장 가까운 이웃 좌표 탭
  const np = JSON.parse(await h.eval(`(async () => { const { centerOf } = await import('./src/region/render.js'); const { neighbors } = await import('./src/region/game.js'); const run = __game.state.run; const n = neighbors(${cp[2]}).find(i => run.regions[i].owner === -1); run.regions[n].def = 5; const [wx, wy] = centerOf(n); const c = document.getElementById('canvas').getBoundingClientRect(), cam = __game.cam; return JSON.stringify([c.left + (wx - cam.x) * cam.scale + c.width / 2, c.top + (wy - cam.y) * cam.scale + c.height / 2, n]); })()`));
  await h.eval(`document.querySelector('.ratio-btn[data-r="1"]').click()`);
  await h.tap(np[0], np[1]); await h.wait(300);
  say('attack order', await h.eval(`'armies=' + __game.state.run.armies.length + ' hint=' + document.getElementById('hint').textContent`));
  await h.wait(6000);
  say('after battle', await h.eval(`(() => { const r = __game.state.run.regions[${np[2]}]; return 'owner=' + r.owner + ' div=' + Math.floor(r.div) + ' regions=' + document.getElementById('top-regions').textContent; })()`));
  await h.shot(`${SP}/r3_after_attack.png`);
  // 반란: AI 지역 조사 → 반란 100
  const ap = JSON.parse(await h.eval(`(async () => { const { centerOf } = await import('./src/region/render.js'); const run = __game.state.run; const t = run.regions.find(r => r.owner === 1); t.def = 10; t.div = 10; run.regions[${cp[2]}].pool = 400; const [wx, wy] = centerOf(t.id); __game.cam.x = wx; __game.cam.y = wy; const c = document.getElementById('canvas').getBoundingClientRect(), cam = __game.cam; return JSON.stringify([c.left + c.width / 2, c.top + c.height / 2, t.id]); })()`));
  await h.wait(200); await h.tap(ap[0], ap[1]); await h.wait(200); await h.tap(ap[0], ap[1]); await h.wait(300);
  say('enemy panel', await h.eval(`document.getElementById('p-title').textContent + ' | rebel hidden=' + document.getElementById('row-rebel').hidden`));
  await h.eval(`document.querySelector('[data-act="rebel"][data-n="100"]').click()`); await h.wait(300);
  say('rebel queued', await h.eval(`JSON.stringify(__game.state.run.rebels.map(r => [r.owner, r.target, r.size])) + ' hint=' + document.getElementById('hint').textContent`));
  await h.shot(`${SP}/r4_rebel.png`);
  await h.eval(`__game.state.legacy.speed = 4`); await h.wait(4000); await h.eval(`__game.state.legacy.speed = 1`);
  say('after uprising', await h.eval(`(() => { const r = __game.state.run.regions[${ap[2]}]; return 'owner=' + r.owner + ' rebels=' + __game.state.run.rebels.length + ' battle=' + !!r.battle; })()`));
  // 메뉴·도움말·상점
  await h.eval(`document.getElementById('btn-menu').click()`); await h.wait(200);
  say('menu', await h.eval(`document.getElementById('modal-title').textContent`));
  await h.eval(`document.querySelector('[data-action="shop"]').click()`); await h.wait(200);
  say('shop', await h.eval(`document.getElementById('modal-title').textContent + ' rows=' + document.querySelectorAll('.shop-row').length`));
  await h.eval(`document.querySelector('#modal-actions button').click()`); await h.wait(100); await h.eval(`document.querySelector('#modal-actions button').click()`); await h.wait(100);
  // 정복 → 환생
  await h.eval(`__game.state.run.regions.forEach(r => { r.owner = 0; r.battle = undefined; }); __game.state.run.rebels = []; __game.state.run.armies = []`); await h.wait(600);
  say('conquest', await h.eval(`document.getElementById('modal-title').textContent + ' perks=' + document.querySelectorAll('input[name=perk]').length + ' diffs=' + document.querySelectorAll('input[name=diff]').length`));
  await h.eval(`document.querySelector('#modal-actions button').click()`); await h.wait(500);
  say('after rebirth', await h.eval(`document.getElementById('modal-title').textContent + ' prestige=' + __game.state.legacy.prestigeCount + ' points=' + __game.state.legacy.points + ' factions=' + __game.state.run.factions + ' mine=' + __game.state.run.regions.filter(r => r.owner === 0).length`));
  await h.eval(`document.querySelector('#modal-actions button').click()`); await h.wait(200);
  // 오프라인 정산 (20분)
  await h.eval(`(() => { const s = JSON.parse(localStorage['landgrab.region.v1']); s.lastSave = Date.now() - 1200e3; localStorage['landgrab.region.v1'] = JSON.stringify(s); localStorage.setItem = () => {}; })()`);
  await h.goto(); await h.wait(1500);
  say('offline', await h.eval(`document.getElementById('modal-title').textContent + ' / ' + document.getElementById('modal-body').innerText.replace(/\\s+/g, ' ').slice(0, 80)`));
  say('console errors', JSON.stringify(h.errors()));
}
