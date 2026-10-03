export function analyzeCrash(text: string, java: number): string {
  if (/OutOfMemoryError|Java heap space/.test(text))
    return 'The server ran out of memory. Increase allocated RAM or reduce view distance.';
  if (
    /UnsupportedClassVersionError|UnsupportedClassVersion|requires.*Java|Java.*required/i.test(text)
  )
    return `The Java version is incompatible. Check the server's Java ${java} runtime.`;
  if (/Address already in use|FAILED TO BIND|BindException/i.test(text))
    return 'The network port is already in use. Choose another port.';
  if (/missing.*depend|requires.*fabric|Could not load.*plugin/i.test(text))
    return 'A plugin or mod may be missing a dependency or may be incompatible.';
  if (/Invalid.*(config|properties)|Failed to load.*properties/i.test(text))
    return 'The server configuration appears invalid. Check your recent changes.';
  if (/corrupt|ZipException|invalid.*(jar|zip)/i.test(text))
    return 'A server file appears corrupted. Check backups or reinstall the affected content.';
  return 'The server stopped unexpectedly. Check the latest console lines to identify the cause.';
}
