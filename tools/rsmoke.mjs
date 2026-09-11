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
  await h.eval(`__game.state.run.pool[0] = 300`); await h.wait(300);
  await h.eval(`document.querySelector('[data-act="def"][data-n="100"]').click()`); await h.wait(100);
  await h.eval(`document.querySelector('[data-act="div"][data-n="max"]').click()`); await h.wait(300);
  say('after allocate', await h.eval(`(() => { const r = __game.state.run.regions[${cp[2]}]; return 'def=' + Math.floor(r.def) + ' div=' + Math.floor(r.div) + ' pool=' + Math.floor(__game.state.run.pool[0]) + ' lab=' + document.getElementById('lab-div').textContent; })()`));
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
  const ap = JSON.parse(await h.eval(`(async () => { const { centerOf } = await import('./src/region/render.js'); const run = __game.state.run; const t = run.regions.find(r => r.owner === 1); t.def = 10; t.div = 10; run.pool[0] = 400; const [wx, wy] = centerOf(t.id); __game.cam.x = wx; __game.cam.y = wy; const c = document.getElementById('canvas').getBoundingClientRect(), cam = __game.cam; return JSON.stringify([c.left + c.width / 2, c.top + c.height / 2, t.id]); })()`));
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
  say('conquest', await h.eval(`document.getElementById('modal-title').textContent + ' perks=' + document.querySelectorAll('input[name=perk]').length + ' diffs=' + document.querySelectorAll('input[name=diff]').length + ' boards=' + document.querySelectorAll('input[name=board]').length`));
  say('rebirth modal extras', await h.eval(`(() => { const b = document.getElementById('modal-body').innerText.replace(/\s+/g, ' '); return 'generals=' + document.querySelectorAll('input[name=general]').length + ' | ' + b.slice(0, 160); })()`));
  await h.shot(`${SP}/r7_rebirth.png`);
  await h.eval(`document.querySelector('#modal-actions button').click()`); await h.wait(500);
  say('after rebirth', await h.eval(`document.getElementById('modal-title').textContent + ' prestige=' + __game.state.legacy.prestigeCount + ' points=' + __game.state.legacy.points + ' factions=' + __game.state.run.factions + ' mine=' + __game.state.run.regions.filter(r => r.owner === 0).length`));
  await h.eval(`document.querySelector('#modal-actions button').click()`); await h.wait(200);
  // 20분 비웠다 돌아오기: 방치는 없으니 판이 그대로여야 한다
  await h.eval(`(() => { const s = JSON.parse(localStorage['landgrab.region.v1']); s.lastSave = Date.now() - 1200e3; localStorage['landgrab.region.v1'] = JSON.stringify(s); localStorage.setItem = () => {}; })()`);
  await h.goto(); await h.wait(1500);
  say('pause', await h.eval(`document.getElementById('hint').textContent + ' / mine=' + __game.state.run.regions.filter(r => r.owner === 0).length + ' elapsed=' + Math.round(__game.state.run.elapsed)`));
  // 권역 판(수도권)으로 새 판 → 판 밖 지역은 OFF, 화면도 그 권역만
  await h.eval(`document.getElementById('btn-menu').click()`); await h.wait(200);
  await h.eval(`document.querySelector('[data-action="restart"]').click()`); await h.wait(200);
  await h.eval(`document.querySelector('input[name=board][value=capital]').click()`); await h.wait(100);
  await h.eval(`[...document.querySelectorAll('#modal-actions button')].find(b => b.textContent === '새로 시작').click()`); await h.wait(800);
  say('capital board', await h.eval(`(() => { const run = __game.state.run; const off = run.regions.filter(r => r.owner === -2).length; return 'board=' + run.board + ' off=' + off + ' active=' + (run.regions.length - off) + ' factions=' + run.factions + ' top=' + document.getElementById('top-regions').textContent + ' scale=' + __game.cam.scale.toFixed(2); })()`));
  await h.shot(`${SP}/r4_capital_board.png`);
  // 고립 표시: 내 지역 하나를 멀리 떨어뜨려 본다
  say('isolated', await h.eval(`(async () => { const { refreshSupply, boardIds, adj } = await import('./src/region/game.js'); const run = __game.state.run; const ids = boardIds('capital'); const far = ids.find(i => run.regions[i].owner === -1 && !adj(run, i).some(n => run.regions[n].owner === 0)); run.regions[far].owner = 0; refreshSupply(__game.state); return 'far=' + far + ' iso=' + run.regions[far].iso + ' panelReady=' + !!document.getElementById('p-stats'); })()`));
  // 연구·외교 창
  await h.eval(`__game.state.run.pool[0] = 500`); await h.wait(200);
  await h.eval(`document.getElementById('btn-tech').click()`); await h.wait(200);
  say('tech modal', await h.eval(`document.getElementById('modal-title').textContent + ' rows=' + document.querySelectorAll('.shop-row').length + ' enabled=' + [...document.querySelectorAll('.shop-row button')].filter(b => !b.disabled).length`));
  await h.eval(`document.querySelector('[data-action="tech:drill"]').click()`); await h.wait(300);
  say('after research', await h.eval(`(async () => { const g = await import('./src/region/game.js'); return 'has=' + g.hasTech(__game.state.run, 0, 'drill') + ' pool=' + Math.floor(__game.state.run.pool[0]) + ' btn=' + document.getElementById('btn-tech').textContent; })()`));
  await h.shot(`${SP}/r5_tech.png`);
  await h.eval(`document.querySelector('#modal-actions button').click()`); await h.wait(200);
  await h.eval(`document.getElementById('btn-diplo').click()`); await h.wait(200);
  say('diplo modal', await h.eval(`document.getElementById('modal-title').textContent + ' rows=' + document.querySelectorAll('.shop-row').length`));
  await h.eval(`document.querySelector('[data-action^="pact:"]').click()`); await h.wait(300);
  say('after pact', await h.eval(`document.getElementById('hint').textContent + ' | btn=' + document.getElementById('btn-diplo').textContent`));
  await h.shot(`${SP}/r6_diplo.png`);
  await h.eval(`document.querySelector('#modal-actions button').click()`); await h.wait(200);
  // 전적·계급 화면
  await h.eval(`document.getElementById('btn-menu').click()`); await h.wait(200);
  await h.eval(`document.querySelector('[data-action="career"]').click()`); await h.wait(200);
  say('career modal', await h.eval(`document.getElementById('modal-title').textContent + ' | ' + document.getElementById('modal-body').innerText.replace(/\s+/g, ' ').slice(0, 180)`));
  await h.shot(`${SP}/r8_career.png`);
  await h.eval(`document.querySelector('#modal-actions button').click()`); await h.wait(200);
  await h.eval(`document.querySelector('#modal-actions button').click()`); await h.wait(200);
  say('console errors', JSON.stringify(h.errors()));
}
