/** electron-builder v26 configuration. Credentials remain in environment variables. */
export function distributionConfig(platform, env = process.env) {
  if (platform === 'win32') {
    const certificate = env.WIN_CSC_LINK || env.WINDOWS_CERTIFICATE || env.CSC_LINK;
    const password =
      env.WIN_CSC_KEY_PASSWORD || env.WINDOWS_CERTIFICATE_PASSWORD || env.CSC_KEY_PASSWORD;
    if (certificate && !password)
      throw new Error('A Windows certificate was configured without its password.');
    if (env.MINEDOCK_WINDOWS_SIGNING_REQUIRED === 'true' && !certificate)
      throw new Error('Windows signing was requested but its certificate is missing.');
    if (certificate && !/^[a-fA-F0-9]{64}$/.test(env.MINEDOCK_WINDOWS_CERT_SHA256 ?? ''))
      throw new Error(
        'Windows signing requires MINEDOCK_WINDOWS_CERT_SHA256 (public certificate fingerprint).',
      );
    const timestampServer = env.MINEDOCK_WINDOWS_TIMESTAMP_URL || 'http://timestamp.digicert.com';
    if (certificate && !/^https?:\/\/[^\s]+$/.test(timestampServer))
      throw new Error('The RFC 3161 timestamp server must be an HTTP(S) URL.');
    if (certificate && env.ELECTRON_BUILDER_OFFLINE === 'true')
      throw new Error('Signed distribution builds require online RFC 3161 timestamping.');
    return {
      config: {
        forceCodeSigning: !!certificate,
        ...(certificate
          ? {
              win: {
                signtoolOptions: {
                  signingHashAlgorithms: ['sha256'],
                  publisherName: 'MineDock',
                  rfc3161TimeStampServer: timestampServer,
                },
              },
            }
          : {}),
      },
      signing: !!certificate,
      notarizing: false,
      environment: certificate
        ? { WIN_CSC_LINK: certificate, WIN_CSC_KEY_PASSWORD: password }
        : { CSC_IDENTITY_AUTO_DISCOVERY: 'false' },
    };
  }
  if (platform === 'darwin') {
    const certificate = env.CSC_LINK || env.APPLE_CERTIFICATE;
    const password = env.CSC_KEY_PASSWORD || env.APPLE_CERTIFICATE_PASSWORD;
    if (certificate && !password)
      throw new Error('An Apple certificate was configured without its password.');
    const appleId = !!(env.APPLE_ID && env.APPLE_APP_SPECIFIC_PASSWORD && env.APPLE_TEAM_ID);
    const apiKey = !!(env.APPLE_API_KEY && env.APPLE_API_KEY_ID && env.APPLE_API_ISSUER);
    const notarizing = !!certificate && (appleId || apiKey);
    return {
      config: {
        forceCodeSigning: !!certificate,
        mac: {
          identity: certificate ? undefined : null,
          hardenedRuntime: !!certificate,
          entitlements: certificate ? 'build/entitlements.mac.plist' : undefined,
          notarize: notarizing,
          artifactName: 'MineDock-${version}-${arch}.${ext}',
        },
      },
      signing: !!certificate,
      notarizing,
      environment: certificate
        ? { CSC_LINK: certificate, CSC_KEY_PASSWORD: password, CSC_IDENTITY_AUTO_DISCOVERY: 'true' }
        : { CSC_IDENTITY_AUTO_DISCOVERY: 'false' },
    };
  }
  if (platform !== 'linux') throw new Error('Unsupported distribution platform.');
  return {
    config: { linux: { artifactName: 'MineDock-${version}-${arch}.${ext}' } },
    signing: false,
    notarizing: false,
    environment: { CSC_IDENTITY_AUTO_DISCOVERY: 'false' },
  };
}
