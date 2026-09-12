import { spawn } from 'node:child_process';
import fs from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.CDP_PORT || 9333);
const W = Number(process.env.W || 1600);
const H = Number(process.env.H || 1000);
const url = process.argv[2];
const outPath = process.argv[3] || '/tmp/shot.png';
const waitMs = Number(process.argv[4] || 8000);
const evalExpr = process.argv[5] || '';
let exitCode = 0;

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader',
  '--remote-debugging-port=' + PORT, '--window-size=' + W + ',' + H, '--hide-scrollbars',
  '--no-first-run', '--no-default-browser-check', '--user-data-dir=/tmp/chrome-3dctl' + PORT,
  '--remote-allow-origins=*', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForDevtools() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch('http://127.0.0.1:' + PORT + '/json/version');
      if (r.ok) return;
    } catch {}
    await sleep(250);
  }
  throw new Error('devtools not ready');
}

const logs = [];

try {
  await waitForDevtools();
  const tab = await (await fetch('http://127.0.0.1:' + PORT + '/json/new?' + encodeURIComponent(url), { method: 'PUT' })).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let nextId = 1;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
    if (msg.method === 'Runtime.consoleAPICalled') {
      logs.push('[' + msg.params.type + '] ' + msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(' '));
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      logs.push('[exception] ' + (d.exception?.description || d.text));
    }
    if (msg.method === 'Log.entryAdded') {
      logs.push('[' + msg.params.entry.level + '] ' + msg.params.entry.text);
    }
  };
  const send = (method, params = {}) => new Promise((res) => {
    const id = nextId++;
    pending.set(id, res);
    ws.send(JSON.stringify({ id, method, params }));
  });

  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  await sleep(waitMs);

  if (evalExpr) {
    const r = await send('Runtime.evaluate', { expression: evalExpr, returnByValue: true, awaitPromise: true });
    console.log('EVAL:', JSON.stringify(r.result?.result?.value ?? r.result?.exceptionDetails ?? null));
    if (r.result?.exceptionDetails) exitCode = 1;
  }

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(outPath, Buffer.from(shot.result.data, 'base64'));
  console.log('shot bytes:', fs.statSync(outPath).size);
} catch (err) {
  exitCode = 1;
  console.log('RUNNER ERROR:', err.message);
} finally {
  console.log('--- logs (' + logs.length + ') ---');
  for (const line of logs.slice(0, 40)) console.log(line.slice(0, 400));
  chrome.kill('SIGKILL');
  process.exit(exitCode);
}
