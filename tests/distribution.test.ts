import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
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
    MINEDOCK_WINDOWS_CERT_SHA256: 'a'.repeat(64),
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

const signedWindows = {
  WINDOWS_CERTIFICATE: 'fixture.pfx',
  WINDOWS_CERTIFICATE_PASSWORD: 'fixture-secret',
  MINEDOCK_WINDOWS_CERT_SHA256: 'a'.repeat(64),
};
it('requires credentials when Windows signing is explicitly requested', () => {
  expect(() => distributionConfig('win32', { MINEDOCK_WINDOWS_SIGNING_REQUIRED: 'true' })).toThrow(
    'missing',
  );
});
it.each(['', 'a'.repeat(40), 'x'.repeat(64)])(
  'rejects invalid public certificate identity %s',
  (fingerprint) => {
    expect(() =>
      distributionConfig('win32', { ...signedWindows, MINEDOCK_WINDOWS_CERT_SHA256: fingerprint }),
    ).toThrow('fingerprint');
  },
);
it('uses SHA-256 only and native RFC 3161 timestamping without serializing credentials', () => {
  const configured = distributionConfig('win32', signedWindows);
  expect(configured.config.win).toEqual({
    signtoolOptions: {
      signingHashAlgorithms: ['sha256'],
      publisherName: 'MineDock',
      rfc3161TimeStampServer: 'http://timestamp.digicert.com',
    },
  });
  expect(JSON.stringify(configured.config)).not.toContain('fixture-secret');
  expect(JSON.stringify(configured.config)).not.toContain('fixture.pfx');
  expect(configured.environment.WIN_CSC_LINK).toBe('fixture.pfx');
});
it('preserves the electron-builder Windows aliases', () => {
  expect(
    distributionConfig('win32', {
      WIN_CSC_LINK: 'local.pfx',
      WIN_CSC_KEY_PASSWORD: 'private',
      MINEDOCK_WINDOWS_CERT_SHA256: 'B'.repeat(64),
    }).environment,
  ).toEqual({ WIN_CSC_LINK: 'local.pfx', WIN_CSC_KEY_PASSWORD: 'private' });
});
it('rejects offline signed distribution builds and invalid timestamp URLs', () => {
  expect(() =>
    distributionConfig('win32', { ...signedWindows, ELECTRON_BUILDER_OFFLINE: 'true' }),
  ).toThrow('timestamping');
  expect(() =>
    distributionConfig('win32', {
      ...signedWindows,
      MINEDOCK_WINDOWS_TIMESTAMP_URL: 'file:///invalid',
    }),
  ).toThrow('HTTP(S)');
});
it('does not enable Windows signing or change macOS/Linux configuration because Windows credentials exist', () => {
  expect(distributionConfig('linux', signedWindows)).toEqual(distributionConfig('linux', {}));
  expect(distributionConfig('darwin', signedWindows)).toEqual(distributionConfig('darwin', {}));
});
it('keeps private signing material ignored', () => {
  const ignore = readFileSync('.gitignore', 'utf8');
  for (const suffix of ['*.pfx', '*.p12', '*.key', '*.pfx.b64', '*.pfx.base64', 'private-signing/'])
    expect(ignore).toContain(suffix);
});
it('keeps signing secrets in an explicitly trusted release workflow and cleans them before uploading artifacts', () => {
  const workflow = parse(readFileSync('.github/workflows/build-release.yml', 'utf8'));
  expect(workflow.on.pull_request).toBeUndefined();
  expect(workflow.on.pull_request_target).toBeUndefined();
  expect(workflow.permissions).toEqual({ contents: 'read' });
  expect(workflow.on.workflow_dispatch.inputs.windows_signing.default).toBe(false);
  const steps = workflow.jobs.package.steps;
  const prepare = steps.findIndex((step: { id?: string }) => step.id === 'windows_signing');
  expect(steps[prepare].if).toContain("github.repository == 'Bobydeluxe/MineDock'");
  expect(steps[prepare].if).toContain('github.event.repository.default_branch');
  expect(steps[prepare].if).toContain("vars.MINEDOCK_WINDOWS_SIGNING_ENABLED == 'true'");
  const pack = steps.findIndex(
    (step: { run?: string }) => step.run === 'pnpm ${{ matrix.command }}',
  );
  const cleanup = steps.findIndex(
    (step: { name?: string }) => step.name === 'Remove temporary Windows signing files',
  );
  const metadata = steps.findIndex((step: { run?: string }) => step.run === 'pnpm updates:sign');
  const upload = steps.findIndex((step: { uses?: string }) =>
    step.uses?.startsWith('actions/upload-artifact'),
  );
  expect(steps[pack].env.WIN_CSC_KEY_PASSWORD).toContain(
    "steps.windows_signing.outputs.enabled == 'true'",
  );
  expect(steps[cleanup].if).toContain('always()');
  expect(prepare).toBeLessThan(pack);
  expect(pack).toBeLessThan(cleanup);
  expect(cleanup).toBeLessThan(metadata);
  expect(metadata).toBeLessThan(upload);
});
