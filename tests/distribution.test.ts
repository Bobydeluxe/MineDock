import { it, expect } from 'vitest';
import { distributionConfig } from '../scripts/distribution-config.mjs';
it('keeps unsigned Windows/macOS builds usable and enables platform signing only with actual owner credentials', () => {
  const windows = distributionConfig('win32', {}),
    mac = distributionConfig('darwin', {});
  expect(windows.signing).toBe(false);
  expect(windows.config.forceCodeSigning).toBe(false);
  expect(mac.config.mac).toMatchObject({ identity: null, hardenedRuntime: false, notarize: false });
  expect(() =>
    distributionConfig('win32', { WINDOWS_CERTIFICATE: 'test-certificate-path' }),
  ).toThrow('password');
  const configured = distributionConfig('win32', {
    WINDOWS_CERTIFICATE: 'test-certificate-path',
    WINDOWS_CERTIFICATE_PASSWORD: 'test-only-password',
  });
  expect(configured.config.forceCodeSigning).toBe(true);
  expect(JSON.stringify(configured.config)).not.toContain('test-only-password');
  const apple = distributionConfig('darwin', {
    CSC_LINK: 'test-certificate-path',
    CSC_KEY_PASSWORD: 'test-only-password',
    APPLE_ID: 'test-only-id',
    APPLE_APP_SPECIFIC_PASSWORD: 'test-only-app-password',
    APPLE_TEAM_ID: 'test-only-team',
  });
  expect(apple.config.mac).toMatchObject({
    hardenedRuntime: true,
    notarize: true,
    entitlements: 'build/entitlements.mac.plist',
  });
  expect(JSON.stringify(apple.config)).not.toContain('test-only-password');
  expect(distributionConfig('linux', {}).config.linux).toMatchObject({
    artifactName: 'MineDock-${version}-${arch}.${ext}',
  });
  expect(() => distributionConfig('freebsd', {})).toThrow('Unsupported');
});
