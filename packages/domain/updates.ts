export type UpdateTarget = 'nsis' | 'portable' | 'appimage' | 'deb' | 'maczip' | 'dmg';
export interface UpdateArtifact {
  platform: 'win32' | 'linux' | 'darwin';
  arch: 'x64' | 'arm64';
  target: UpdateTarget;
  filename: string;
  url: string;
  size: number;
  sha256: string;
}
export interface VerifiedUpdate {
  version: string;
  notes: string;
  publishedAt: string;
  artifact: UpdateArtifact;
}
export interface UpdateStatus {
  currentVersion: string;
  automaticChecks: boolean;
  trustedKeyConfigured: boolean;
  packaged: boolean;
  available?: VerifiedUpdate;
  downloaded?: boolean;
  lastChecked?: string;
  error?: string;
}
