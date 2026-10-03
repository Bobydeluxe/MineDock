/** Java .properties parser: escapes, continuations, comments and separators. */
function unescape(value: string): string {
  return value.replace(/\\u([a-fA-F0-9]{4})|\\(.)/g, (_, hex: string | undefined, char: string) =>
    hex
      ? String.fromCharCode(parseInt(hex, 16))
      : ({ n: '\n', r: '\r', t: '\t', f: '\f' }[char] ?? char),
  );
}
export function parseProperties(text: string): Record<string, string> {
  const result: Record<string, string> = Object.create(null) as Record<string, string>;
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  for (let index = 0; index < lines.length; index++) {
    let line = lines[index] ?? '';
    while ((line.match(/\\+$/)?.[0].length ?? 0) % 2 === 1 && index + 1 < lines.length)
      line = line.slice(0, -1) + (lines[++index] ?? '').trimStart();
    line = line.trimStart();
    if (!line || /^[#!]/.test(line)) continue;
    let pos = line.length;
    let escaped = false;
    for (let cursor = 0; cursor < line.length; cursor++) {
      const char = line[cursor]!;
      if (!escaped && /[=:\s]/.test(char)) {
        pos = cursor;
        break;
      }
      escaped = char === '\\' && !escaped;
    }
    const key = unescape(line.slice(0, pos));
    const rest = line.slice(pos).replace(/^\s*[=:]?\s*/, '');
    result[key] = unescape(rest);
  }
  return result;
}
function escape(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/[^\x20-\x7e]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}
export function serializeProperties(values: Record<string, string>): string {
  return (
    '# Managed by MineDock\n' +
    Object.entries(values)
      .map(
        ([k, v]) =>
          `${escape(k).replace(/[ =:#!]/g, '\\$&')}=${escape(v).replace(/^ +/, (spaces) => spaces.replace(/ /g, '\\ '))}`,
      )
      .join('\n') +
    '\n'
  );
}
