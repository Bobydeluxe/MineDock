import { it, expect } from 'vitest';
import net from 'node:net';
import { encodePacket, rconCommand } from '../packages/rcon/client';

it('interoperates with a native-style reader that rejects coalesced command packets and collects all response fragments', async () => {
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('data', (data) => {
      if (data.length < 14 || data.readInt32LE(0) + 4 !== data.length) {
        socket.destroy();
        return;
      }
      const id = data.readInt32LE(4),
        type = data.readInt32LE(8),
        text = data.subarray(12, -2).toString();
      if (type === 3) socket.write(encodePacket(id, 2, ''));
      else if (text === 'list')
        socket.write(Buffer.concat([encodePacket(id, 0, 'first'), encodePacket(id, 0, 'second')]));
      else socket.write(encodePacket(id, 0, 'Unknown command'));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const port = (server.address() as net.AddressInfo).port;
    for (let i = 0; i < 12; i++)
      expect(await rconCommand(port, 'isolated-test-secret', 'list')).toBe('firstsecond');
  } finally {
    sockets.forEach((socket) => socket.destroy());
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
