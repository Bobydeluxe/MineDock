import net from 'node:net';
import { randomInt } from 'node:crypto';
import { DomainError } from '../domain/errors';
export function encodePacket(id: number, type: number, payload: string): Buffer {
  const text = Buffer.from(payload, 'utf8');
  const buffer = Buffer.alloc(text.length + 14);
  buffer.writeInt32LE(text.length + 10, 0);
  buffer.writeInt32LE(id, 4);
  buffer.writeInt32LE(type, 8);
  text.copy(buffer, 12);
  return buffer;
}
/** A connection per command avoids interleaved requests; a sentinel collects fragmented replies. */
export async function rconCommand(
  port: number,
  password: string,
  command: string,
  timeout = 6000,
): Promise<string> {
  if (/[\0\r\n]/.test(command) || Buffer.byteLength(command) > 4096)
    throw new DomainError('COMMAND', 'Invalid command.');
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    const auth = randomInt(1, 1000000);
    const request = auth + 1;
    const sentinel = auth + 2;
    let buffer = Buffer.alloc(0);
    let output = '';
    let responseBytes = 0;
    let authenticated = false;
    let sentinelSent = false;
    let done = false;
    const finish = (error?: Error): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      socket.destroy();
      if (error) reject(error);
      else resolve(output);
    };
    const timer = setTimeout(
      () => finish(new DomainError('RCON', 'RCON is not responding. Wait for startup to finish.')),
      timeout,
    );
    socket.once('connect', () => socket.write(encodePacket(auth, 3, password)));
    socket.on('error', () =>
      finish(
        new DomainError('RCON', 'Unable to connect to RCON. Check that the server is running.'),
      ),
    );
    socket.on('close', () => {
      if (!done) finish(new DomainError('RCON', 'The RCON connection was closed.'));
    });
    socket.on('data', (data: Buffer) => {
      buffer = Buffer.concat([buffer, data]);
      if (buffer.length > 4 * 1024 * 1024) {
        finish(new Error('RCON response is too large.'));
        return;
      }
      while (buffer.length >= 4) {
        const length = buffer.readInt32LE(0);
        if (length < 10 || length > 4 * 1024 * 1024) {
          finish(new Error('Invalid RCON packet.'));
          return;
        }
        if (buffer.length < length + 4) break;
        const packet = buffer.subarray(0, length + 4);
        buffer = buffer.subarray(length + 4);
        if (packet.at(-1) !== 0 || packet.at(-2) !== 0) {
          finish(new Error('Invalid RCON terminator.'));
          return;
        }
        const id = packet.readInt32LE(4);
        const type = packet.readInt32LE(8);
        if (id === -1) {
          finish(new DomainError('RCON', 'RCON authentication was rejected.'));
          return;
        }
        if (!authenticated && id === auth && type === 2) {
          authenticated = true;
          socket.write(encodePacket(request, 2, command));
          continue;
        }
        if (id === request && type === 0) {
          responseBytes += packet.length - 14;
          if (responseBytes > 4 * 1024 * 1024) {
            finish(new Error('RCON response is too large.'));
            return;
          }
          output += packet.subarray(12, -2).toString('utf8');
          // Send only after the first reply: Minecraft's RCON reader can discard coalesced
          // request + sentinel packets. The sentinel still follows all command output.
          if (!sentinelSent) {
            sentinelSent = true;
            socket.write(encodePacket(sentinel, 2, ''));
          }
        }
        if (id === sentinel) {
          finish();
          return;
        }
      }
    });
  });
}
