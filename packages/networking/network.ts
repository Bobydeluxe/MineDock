import net from 'node:net';
import os from 'node:os';
import dgram from 'node:dgram';
export async function checkPort(
  port: number,
  protocol: 'tcp' | 'udp' = 'tcp',
  ipv6 = false,
): Promise<boolean> {
  if (protocol === 'udp')
    return new Promise((resolve) => {
      const socket = dgram.createSocket(ipv6 ? 'udp6' : 'udp4');
      socket.once('error', () => {
        socket.close();
        resolve(false);
      });
      socket.bind(port, ipv6 ? '::' : '0.0.0.0', () => socket.close(() => resolve(true)));
    });
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
