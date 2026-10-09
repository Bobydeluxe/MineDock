// Purpose-built integration fixture. This is not Minecraft and is never shipped.
const net = require('node:net');
const readline = require('node:readline');
const fs = require('node:fs');
const props = Object.fromEntries(
  fs
    .readFileSync('server.properties', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
const packet = (id, type, text) => {
  const data = Buffer.from(text);
  const out = Buffer.alloc(data.length + 14);
  out.writeInt32LE(data.length + 10, 0);
  out.writeInt32LE(id, 4);
  out.writeInt32LE(type, 8);
  data.copy(out, 12);
  return out;
};
const server = net.createServer((socket) => {
  let buffer = Buffer.alloc(0);
  let authenticated = false;
  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 4 && buffer.length >= buffer.readInt32LE(0) + 4) {
      const length = buffer.readInt32LE(0);
      const p = buffer.subarray(0, length + 4);
      buffer = buffer.subarray(length + 4);
      const id = p.readInt32LE(4);
      const type = p.readInt32LE(8);
      const command = p.subarray(12, -2).toString();
      if (type === 3) {
        authenticated = command === props['rcon.password'];
        socket.write(packet(authenticated ? id : -1, 2, ''));
      } else if (authenticated) {
        const response =
          command === 'list'
            ? 'There are 2 of a max of 20 players online: Linden, River'
            : command === 'multipart'
              ? 'first'
              : 'Saved the game';
        const reply = packet(id, 0, response);
        socket.write(reply.subarray(0, 6));
        socket.write(reply.subarray(6));
        if (command === 'multipart') socket.write(packet(id, 0, 'second'));
        console.log('[Server thread/INFO]: ' + command);
      }
    }
  });
});
server.listen(Number(props['rcon.port']), '127.0.0.1', () =>
  console.log('[Server thread/INFO]: Done (0.1s)! For help, type "help"'),
);
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  if (line === 'stop') {
    console.log('[Server thread/INFO]: Stopping server');
    server.close(() => process.exit(0));
  }
});
