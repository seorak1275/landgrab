const SP = process.env.SHOT_DIR || '.';
export async function run(h) {
  const say = (k, v) => console.log(k + ':', v);
  await h.eval(`localStorage.clear()`); await h.goto(); await h.wait(1200);
  await h.eval(`(() => { const b = document.querySelector('#modal-actions button'); if (b) b.click(); })()`); await h.wait(200);
  // 새 판 창: 판·시작지 고르기
  await h.eval(`document.getElementById('btn-menu').click()`); await h.wait(200);
  await h.eval(`document.querySelector('[data-action="restart"]').click()`); await h.wait(300);
  say('picker', await h.eval(`'boards=' + document.querySelectorAll('input[name=board]').length + ' homes=' + document.querySelectorAll('input[name=home]').length + ' | ' + [...document.querySelectorAll('input[name=home]')].map(e => e.value).join(',')`));
  await h.eval(`document.querySelector('input[name=board][value=capital]').click(); document.querySelector('input[name=board][value=capital]').dispatchEvent(new Event('change'))`); await h.wait(300);
  say('homes after board change', await h.eval(`[...document.querySelectorAll('input[name=home]')].map(e => e.value).join(',')`));
  await h.eval(`document.querySelector('input[name=board][value=all]').click(); document.querySelector('input[name=board][value=all]').dispatchEvent(new Event('change'))`); await h.wait(200);
  await h.eval(`(() => { const el = [...document.querySelectorAll('input[name=home]')].find(e => e.value === '수원 장안구'); el.click(); })()`); await h.wait(100);
  await h.shot(`${SP}/p1_picker.png`);
  await h.eval(`[...document.querySelectorAll('#modal-actions button')].find(b => b.textContent === '새로 시작').click()`); await h.wait(900);
  say('new run', await h.eval(`(async () => { const g = await import('./src/region/game.js'); const run = __game.state.run; const home = run.regions.find(r => r.owner === 0); return '시작 ' + g.MAP.regions[home.id].n + ' · board=' + run.board; })()`));
  // 시·도 완전 점령
  say('panel prov', await h.eval("document.getElementById('p-stats').textContent.replace(/\s+/g,' ').slice(0,120)"));
  await h.eval(`(async () => { const g = await import('./src/region/game.js'); const run = __game.state.run; for (const id of g.provinceIds('all').get('경기')) { run.regions[id].owner = 0; run.regions[id].def = 30; } g.refreshSupply(__game.state); })()`); await h.wait(600);
  say('after province', await h.eval(`(async () => { const g = await import('./src/region/game.js'); return '보유자=' + g.provinceHolder(__game.state.run, '경기') + ' provFull=' + __game.state.run.regions[g.provinceIds('all').get('경기')[0]].provFull; })()`));
  await h.shot(`${SP}/p2_province.png`);
  // 전황
  await h.eval(`document.getElementById('btn-menu').click()`); await h.wait(200);
  await h.eval(`document.querySelector('[data-action="status"]').click()`); await h.wait(300);
  say('status', await h.eval(`document.getElementById('modal-title').textContent + ' | ' + document.getElementById('modal-body').innerText.replace(/\s+/g, ' ').slice(0, 150)`));
  await h.shot(`${SP}/p3_status.png`);
  say('console errors', JSON.stringify(h.errors()));
}
