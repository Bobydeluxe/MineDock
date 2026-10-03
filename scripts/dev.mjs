import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import electron from 'electron';
await import('./build-desktop.mjs');
const server = await createServer();
await server.listen();
server.printUrls();
const env = { ...process.env, VITE_DEV_SERVER_URL: 'http://127.0.0.1:5173' };
delete env.ELECTRON_RUN_AS_NODE;
const desktop = spawn(electron, ['.'], { stdio: 'inherit', env, windowsHide: true });
desktop.on('exit', async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => desktop.kill());
