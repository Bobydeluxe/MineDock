import net from 'node:net';
import os from 'node:os';
export async function checkPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '0.0.0.0', () => server.close(() => resolve(true)));
  });
}
export async function findAvailablePort(start = 25565): Promise<number> {
  for (let port = start; port < Math.min(start + 100, 65536); port++)
    if (await checkPort(port)) return port;
  throw new Error('No port is available.');
}
export function lanIp(): string {
  return (
    Object.values(os.networkInterfaces())
      .flat()
      .find((n) => n?.family === 'IPv4' && !n.internal)?.address ?? '127.0.0.1'
  );
}
