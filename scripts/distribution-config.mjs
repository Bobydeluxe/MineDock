/** electron-builder v26 configuration. Credentials remain in environment variables. */
export function distributionConfig(platform, env = process.env) {
  if (platform === 'win32') {
    const certificate = env.WIN_CSC_LINK || env.WINDOWS_CERTIFICATE || env.CSC_LINK;
    const password =
      env.WIN_CSC_KEY_PASSWORD || env.WINDOWS_CERTIFICATE_PASSWORD || env.CSC_KEY_PASSWORD;
    if (certificate && !password)
      throw new Error('A Windows certificate was configured without its password.');
    return {
      config: { forceCodeSigning: !!certificate },
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
