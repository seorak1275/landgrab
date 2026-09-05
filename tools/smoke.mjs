// 브라우저 검증 시나리오: node tools/cdp.mjs http://localhost:8765/ tools/smoke.mjs
const SP = process.env.SHOT_DIR || '.';
export async function run(h) {
  const out = [];
  const say = (k, v) => { out.push(`${k}: ${v}`); console.log(k + ':', v); };
  await h.eval(`localStorage.clear()`); await h.goto(); await h.wait(800);
  say('layout', await h.eval(`JSON.stringify({docW: document.documentElement.scrollWidth, vw: innerWidth, vh: innerHeight, canvas: [document.getElementById('canvas').clientWidth, document.getElementById('canvas').clientHeight], menuRight: document.getElementById('btn-menu').getBoundingClientRect().right, ratioRight: document.getElementById('ratio').getBoundingClientRect().right, scale: __game.cam.scale.toFixed(2)})`));
  await h.shot(`${SP}/s1_initial.png`);
  // 수도 탭 → 패널
  const cap = await h.eval(`(() => { const t = __game.state.run.tiles.find(t => t.owner === 0); return JSON.stringify([t.q, t.r, t.id]); })()`);
  const [q, r, capId] = JSON.parse(cap);
  const pos = await h.eval(`(() => { const c = document.getElementById('canvas').getBoundingClientRect(); const s = ${Math.sqrt(3)} * 36 * (${q} + ${r} / 2), y = 1.5 * 36 * ${r}; const cam = __game.cam; return JSON.stringify([c.left + (s - cam.x) * cam.scale + c.width / 2, c.top + (y - cam.y) * cam.scale + c.height / 2]); })()`);
  const [cx, cy] = JSON.parse(pos);
  await h.tap(cx, cy);
  say('panel after capital tap', await h.eval(`document.getElementById('p-title').textContent + ' | ' + document.getElementById('btn-upgrade').textContent + ' | disabled=' + document.getElementById('btn-upgrade').disabled`));
  // 골드 주입 후 업그레이드
  await h.eval(`__game.state.run.gold[0] = 500`); await h.wait(300);
  const ub = JSON.parse(await h.eval(`(() => { const b = document.getElementById('btn-upgrade').getBoundingClientRect(); return JSON.stringify([b.x + b.width / 2, b.y + b.height / 2]); })()`));
  await h.click(ub[0], ub[1]);
  say('level after upgrade', await h.eval(`__game.state.run.tiles[${capId}].level`));
  // 이웃 중립 공격(수도 선택 상태에서 이웃 탭)
  const nb = JSON.parse(await h.eval(`(() => { const t = __game.state.run.tiles[${capId}]; const dirs = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]]; for (const [dq, dr] of dirs) { const n = __game.state.run.tiles.find(x => x.q === t.q + dq && x.r === t.r + dr); if (n) { n.soldiers = 3; const c = document.getElementById('canvas').getBoundingClientRect(); const cam = __game.cam; const s = ${Math.sqrt(3)} * 36 * (n.q + n.r / 2), y = 1.5 * 36 * n.r; return JSON.stringify([c.left + (s - cam.x) * cam.scale + c.width / 2, c.top + (y - cam.y) * cam.scale + c.height / 2, n.id]); } } })()`));
  await h.tap(nb[0], nb[1]);
  say('neighbor owner after attack', await h.eval(`__game.state.run.tiles[${nb[2]}].owner + ' tiles=' + __game.state.run.tiles.filter(t => t.owner === 0).length`));
  await h.shot(`${SP}/s2_after_attack.png`);
  // 메뉴 → 상점
  const mb = JSON.parse(await h.eval(`(() => { const b = document.getElementById('btn-menu').getBoundingClientRect(); return JSON.stringify([b.x + b.width / 2, b.y + b.height / 2]); })()`));
  await h.click(mb[0], mb[1]);
  say('menu open', await h.eval(`!document.getElementById('modal').hidden + ' ' + document.getElementById('modal-title').textContent`));
  await h.eval(`document.querySelector('[data-action="shop"]').click()`); await h.wait(200);
  say('shop rows', await h.eval(`document.querySelectorAll('.shop-row').length + ' ' + document.getElementById('modal-title').textContent`));
  await h.shot(`${SP}/s3_shop.png`);
  await h.eval(`document.querySelector('#modal-actions button').click()`);
  // 저장 후 1시간 전으로 조작 → 오프라인 정산
  await h.wait(1200);
  // 페이지를 떠날 때 pagehide 저장이 덮어쓰지 않도록, 조작 뒤 이 페이지의 setItem을 막는다
  await h.eval(`(() => { const s = JSON.parse(localStorage['landgrab.save.v1']); s.lastSave = Date.now() - 3600e3; localStorage['landgrab.save.v1'] = JSON.stringify(s); localStorage.setItem = () => {}; })()`);
  await h.goto(); await h.wait(800);
  say('offline modal', await h.eval(`document.getElementById('modal-title').textContent + ' / ' + document.getElementById('modal-body').innerText.replace(/\\n/g, ' ')`));
  await h.shot(`${SP}/s4_offline.png`);
  await h.eval(`document.querySelector('#modal-actions button').click()`);
  // 정복 → 환생
  await h.eval(`__game.state.run.tiles.forEach(t => t.owner = 0)`); await h.wait(600);
  say('conquest modal', await h.eval(`document.getElementById('modal-title').textContent`));
  await h.shot(`${SP}/s5_conquest.png`);
  await h.eval(`document.querySelector('#modal-actions button').click()`); await h.wait(300);
  say('after rebirth', await h.eval(`document.getElementById('modal-title').textContent + ' | prestige=' + __game.state.legacy.prestigeCount + ' points=' + __game.state.legacy.points + ' tiles=' + __game.state.run.tiles.length`));
  await h.eval(`document.querySelector('#modal-actions button').click()`); await h.wait(300);
  await h.shot(`${SP}/s6_new_run.png`);
  say('console errors', JSON.stringify(h.errors()));
  say('console all', JSON.stringify(h.logs.slice(0, 10)));
}
