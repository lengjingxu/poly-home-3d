import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const port = 9000 + process.pid % 500;
const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { stdio: 'ignore' });
try {
  const url = `http://127.0.0.1:${port}/preview.html?sun=above_horizon&lights=off`;
  const deadline = Date.now() + 5000;
  while (true) {
    try { if ((await fetch(url)).ok) break; } catch (error) {
      if (Date.now() > deadline) throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  const result = spawnSync(process.execPath, ['shoot.mjs', url, '/tmp/poly-render-test.png', '2000',
    readFileSync(process.argv[2] || 'tests/render-browser.js', 'utf8')], {
    env: { ...process.env, W: process.env.W || '1568', H: process.env.H || '878', DPR: '2', CDP_PORT: String(port + 1000) },
    stdio: 'inherit',
  });
  process.exitCode = result.status ?? 1;
} finally {
  server.kill('SIGTERM');
}
