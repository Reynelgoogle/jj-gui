/**
 * Development launcher: starts Vite (frontend only, no second jj-service
 * instance) and opens the Electron window pointing at it.
 *
 * The old version started the full Express server (`npm run dev`), which
 * imports its own copy of jj-service: the binary path, active repo and
 * command logs then lived in two processes and could diverge. In
 * dev:electron the renderer talks to jj through Electron IPC (the main
 * process's jj-service), so Vite only needs to serve the frontend.
 * No extra dependencies required.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import process from 'node:process';

const require = createRequire(import.meta.url);
const electronPath = require('electron');
const port = process.env.PORT || 5173;
const url = `http://127.0.0.1:${port}`;

async function isViteUp() {
  try {
    const response = await fetch(url);
    if (!response.ok) return false;
    const html = await response.text();
    return html.includes('id="root"');
  } catch {
    return false;
  }
}

let server = null;
if (!(await isViteUp())) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  server = spawn(npm, ['run', 'dev:vite', '--', '--port', String(port)], {
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
  });
}

let ready = false;
for (let attempt = 0; attempt < 120; attempt += 1) {
  if (await isViteUp()) {
    ready = true;
    break;
  }
  await new Promise(resolve => setTimeout(resolve, 500));
}

if (!ready) {
  server?.kill();
  console.error(`Vite no respondió en ${url}.`);
  process.exit(1);
}

const electron = spawn(electronPath, ['.'], {
  stdio: 'inherit',
  env: { ...process.env, VITE_DEV_SERVER_URL: url },
});

electron.on('exit', code => {
  server?.kill();
  process.exit(code ?? 0);
});

const shutdown = () => {
  electron.kill();
  server?.kill();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
