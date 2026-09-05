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
  await h.eval(`document.querySelector('#modal-actions button').click()`); await h.wait(300);
  say('after offline confirm', await h.eval(`document.getElementById('modal').hidden ? 'playing' : document.getElementById('modal-title').textContent`));
  if (!(await h.eval(`document.getElementById('modal').hidden`))) { await h.eval(`document.querySelector('#modal-actions button').click()`); await h.wait(300); await h.eval(`document.querySelector('#modal-actions button').click()`); await h.wait(300); }
  // 원거리·다중 명령: 수도에서 한 줄로 3칸을 내 땅으로 만들고, 수도+1칸을 골라 끝의 중립 타일을 공격
  const far = JSON.parse(await h.eval(`(() => { const run = __game.state.run, dirs = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
    const at = (q, r) => run.tiles.find(t => t.q === q && t.r === r);
    let cur = run.tiles.find(t => t.owner === 0 && t.terrain === 'citadel'); const ids = [cur.id];
    for (let i = 0; i < 3; i++) { let n = null; for (const [dq, dr] of dirs) { const c = at(cur.q + dq, cur.r + dr); if (c && c.owner === -1 && !ids.includes(c.id)) { n = c; break; } } n.owner = 0; n.soldiers = 10; ids.push(n.id); cur = n; }
    let target = null; for (const [dq, dr] of dirs) { const c = at(cur.q + dq, cur.r + dr); if (c && c.owner === -1) { target = c; break; } }
    target.soldiers = 20; target.terrain = 'plain'; run.tiles[ids[0]].soldiers = 60; run.tiles[ids[1]].soldiers = 40;
    const c = document.getElementById('canvas').getBoundingClientRect(), cam = __game.cam;
    const pos = t => [c.left + (${Math.sqrt(3)} * 36 * (t.q + t.r / 2) - cam.x) * cam.scale + c.width / 2, c.top + (1.5 * 36 * t.r - cam.y) * cam.scale + c.height / 2];
    return JSON.stringify({ ids, targetId: target.id, p0: pos(run.tiles[ids[0]]), p1: pos(run.tiles[ids[1]]), pt: pos(target) }); })()`));
  const mb2 = JSON.parse(await h.eval(`(() => { const b = document.getElementById('btn-multi').getBoundingClientRect(); return JSON.stringify([b.x + b.width / 2, b.y + b.height / 2]); })()`));
  await h.click(mb2[0], mb2[1]);
  await h.tap(far.p0[0], far.p0[1]); await h.tap(far.p1[0], far.p1[1]);
  say('multi panel', await h.eval(`document.getElementById('p-title').textContent + ' | ' + document.getElementById('p-stats').textContent.split(String.fromCharCode(10))[0] + ' | sel=' + JSON.stringify(__game.sel)`));
  await h.shot(`${SP}/s4b_multi_preview.png`);
  await h.tap(far.pt[0], far.pt[1]); await h.wait(100);
  say('far attack', await h.eval(`(() => { const run = __game.state.run; return 'target owner=' + run.tiles[${far.targetId}].owner + ' soldiers=' + Math.floor(run.tiles[${far.targetId}].soldiers) + ' cap=' + Math.floor(run.tiles[${far.ids[0]}].soldiers) + ' second=' + Math.floor(run.tiles[${far.ids[1]}].soldiers); })()`));
  await h.shot(`${SP}/s4c_far_attack.png`);
  await h.click(mb2[0], mb2[1]); // 다중 모드 끄기
  // 백그라운드 복귀 정산: hidden 상태를 흉내 내고 20분 뒤에 돌아온 것으로
  await h.eval(`(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); })()`);
  await h.eval(`(() => { const t0 = Date.now; Date.now = () => t0() + 20 * 60e3; Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); })()`);
  await h.wait(300);
  say('resume modal', await h.eval(`document.getElementById('modal-title').textContent + ' / ' + document.getElementById('modal-body').innerText.replace(/\s+/g, ' ')`));
  await h.eval(`document.querySelector('#modal-actions button').click()`); await h.wait(200);
  if (!(await h.eval(`document.getElementById('modal').hidden`))) { await h.eval(`document.querySelector('#modal-actions button').click()`); await h.wait(300); await h.eval(`document.querySelector('#modal-actions button').click()`); await h.wait(300); }
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
