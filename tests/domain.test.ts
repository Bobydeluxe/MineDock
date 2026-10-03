import { describe, it, expect } from 'vitest';
import { parseProperties, serializeProperties } from '../packages/domain/properties';
import { javaForVersion, javaForPaper } from '../packages/minecraft/versions';
import { validateRelative } from '../packages/security/paths';
import { approvedUrl } from '../packages/minecraft/downloads';
import { analyzeCrash } from '../packages/core/crash';
import { createServerSchema, scheduleSchema } from '../packages/domain/types';
import { nextExecution } from '../packages/core/scheduler';
describe('server.properties', () => {
  it('reads comments, colon, whitespace, unicode and multiline values', () => {
    expect(
      parseProperties(
        '# comment\na : b\nx hello\nmotd=Bonjour\\u0020monde\ncontinued=one\\\n  two\nescaped\\=key=value',
      ),
    ).toEqual({
      a: 'b',
      x: 'hello',
      motd: 'Bonjour monde',
      continued: 'onetwo',
      'escaped=key': 'value',
    });
  });
  it('round trips accents, escaped backslashes and newlines', () => {
    const values = { motd: 'Été\nBienvenue', seed: '', path: 'C:\\test' };
    expect(parseProperties(serializeProperties(values))).toEqual(values);
  });
  it('preserves leading spaces and escaped separator parity', () => {
    const values = { '#key': '  hello', 'slash\\': 'value' };
    expect(parseProperties(serializeProperties(values))).toEqual(values);
  });
  it('does not mutate the object prototype', () => {
    const value = parseProperties('__proto__=safe');
    expect(value.__proto__).toBe('safe');
    expect(Object.getPrototypeOf(value)).toBe(null);
  });
});
describe('Java requirements', () => {
  it.each([
    ['1.8.9', 8],
    ['1.16.5', 8],
    ['1.17.1', 16],
    ['1.18.2', 17],
    ['1.20.4', 17],
    ['1.20.5', 21],
    ['1.21.11', 21],
    ['26.1', 25],
  ])('%s → Java %i', (version, java) => expect(javaForVersion(version)).toBe(java));
});
describe('Paper runtime recommendations', () => {
  it.each([
    ['1.11.2', 8],
    ['1.12.2', 11],
    ['1.16.4', 11],
    ['1.16.5', 16],
    ['1.17.1', 17],
    ['1.19.4', 17],
    ['1.20.4', 21],
    ['1.21.11', 21],
    ['26.3', 25],
  ])('%s → Java %i', (version, java) => expect(javaForPaper(version)).toBe(java));
});
describe('security boundaries', () => {
  it.each([
    '../../secret',
    '..\\secret',
    '/etc/passwd',
    'C:\\Windows',
    'file:secret',
    'world/../outside',
    'CON',
    'folder.',
    'foo\0bar',
  ])('rejects %s', (value) => expect(() => validateRelative(value)).toThrow());
  it('accepts contained ordinary paths', () =>
    expect(validateRelative('world/region/r.0.0.mca')).toContain('world'));
  it.each([
    'http://api.modrinth.com/a',
    'https://localhost/a',
    'https://api.modrinth.com.evil.test/a',
    'https://api.modrinth.com:8443/a',
    'file:///tmp/a',
  ])('rejects download %s', (url) => expect(() => approvedUrl(url)).toThrow());
  it('accepts official download CDNs', () =>
    expect(approvedUrl('https://cdn.modrinth.com/data/test.jar').hostname).toBe(
      'cdn.modrinth.com',
    ));
});
describe('configuration and scheduling', () => {
  it('requires explicit EULA and valid memory', () =>
    expect(createServerSchema.safeParse({ name: 'x', eula: false }).success).toBe(false));
  it('rejects empty or multiline scheduled commands', () => {
    for (const command of ['', 'say hi\nstop'])
      expect(
        scheduleSchema.safeParse({
          serverId: 'd768eb97-72ae-4bf6-b4a8-9b182578fa19',
          action: 'command',
          intervalMinutes: 10,
          command,
        }).success,
      ).toBe(false);
  });
  it('advances missed intervals once from current time', () =>
    expect(nextExecution(360, 0)).toBe('1970-01-01T06:00:00.000Z'));
  it('explains deterministic crashes', () => {
    expect(analyzeCrash('OutOfMemoryError', 21)).toContain('memory');
    expect(analyzeCrash('FAILED TO BIND', 21)).toContain('port');
    expect(analyzeCrash('UnsupportedClassVersionError', 21)).toContain('Java');
  });
});
