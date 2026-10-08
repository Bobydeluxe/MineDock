import { it, expect, vi } from 'vitest';
import net from 'node:net';
import { fixture } from './helpers';
import { testReachability } from '../packages/networking/reachability';
it('does not disclose addresses without consent or confuse local success with Internet success', async () => {
  const f = await fixture(),
    listener = net.createServer((socket) => socket.end());
  await new Promise<void>((resolve) => listener.listen(f.server.port, '127.0.0.1', resolve));
  const request = vi.fn<typeof fetch>(
    async () => new Response(JSON.stringify({ online: false, retrieved_at: Date.now() })),
  );
  try {
    const local = await testReachability(f.server, { consent: false }, request);
    expect(local.local).toBe('reachable');
    expect(local.external).toBe('unknown');
    expect(request).not.toHaveBeenCalled();
    const external = await testReachability(
      f.server,
      { consent: true, host: 'play.example.com' },
      request,
    );
    expect(external.external).toBe('unreachable');
    expect(external.local).toBe('reachable');
    await expect(
      testReachability(f.server, { consent: true, host: '127.0.0.1' }, request),
    ).rejects.toThrow('public');
    expect(request).toHaveBeenCalledTimes(1);
  } finally {
    await new Promise<void>((resolve) => listener.close(() => resolve()));
    await f.cleanup();
  }
});
