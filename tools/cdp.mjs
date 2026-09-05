// 헤드리스 크롬을 CDP로 조종하는 검증 하네스 (puppeteer 없이 Node 내장 WebSocket 사용)
// 사용: node tools/cdp.mjs <url> <script.mjs>  — script는 { run(h) } 를 export
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9333;

export async function launch(url, { width = 390, height = 844 } = {}) {
  const prof = `${process.env.TEMP}/cdp-prof-${Date.now()}`;
  const proc = spawn(CHROME, [
    '--headless=new', '--enable-unsafe-swiftshader', '--no-first-run', `--user-data-dir=${prof}`,
    `--remote-debugging-port=${PORT}`, `--window-size=${width},${height}`, 'about:blank',
  ], { stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 50; i++) {
    try { targets = await (await fetch(`http://localhost:${PORT}/json`)).json(); if (targets.length) break; } catch {}
    await new Promise(r => setTimeout(r, 200));
  }
  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => (ws.onopen = r));
  let id = 0; const pending = new Map(); const logs = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.consoleAPICalled') logs.push({ type: m.params.type, text: m.params.args.map(a => a.value ?? a.description).join(' ') });
    if (m.method === 'Runtime.exceptionThrown') logs.push({ type: 'exception', text: m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text });
    if (m.method === 'Log.entryAdded') logs.push({ type: m.params.entry.level, text: m.params.entry.text });
  };
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true });
  const h = {
    logs,
    async goto(u = url) { await send('Page.navigate', { url: u }); await h.wait(1200); },
    async wait(ms) { await new Promise(r => setTimeout(r, ms)); },
    async eval(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.result.exceptionDetails) throw new Error('eval: ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text));
      return r.result.result.value;
    },
    async shot(path) { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(path, Buffer.from(r.result.data, 'base64')); return path; },
    async tap(x, y) {
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await h.wait(150);
    },
    async click(x, y) {
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
      await h.wait(150);
    },
    errors() { return logs.filter(l => l.type === 'error' || l.type === 'exception'); },
    async close() { ws.close(); proc.kill(); },
  };
  await h.goto(url);
  return h;
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/cdp.mjs')) {
  const [url, script] = process.argv.slice(2);
  const mod = await import(`file://${process.cwd().replace(/\\/g, '/')}/${script}`);
  const h = await launch(url);
  try { await mod.run(h); } finally { await h.close(); }
}
