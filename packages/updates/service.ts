import { mkdir, stat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import trust from '../../config/update-trust.json' with { type: 'json' };
import { Repository } from '../database/database';
import { OperationService } from '../core/operations';
import { DownloadManager, fetchJson } from '../minecraft/downloads';
import { DomainError, readableError } from '../domain/errors';
import { containedPath } from '../security/paths';
import { sha256 } from '../backups/archive';
import { verifyUpdateMetadata, signedUpdateSchema, type SignedUpdate } from './metadata';
import type { UpdateStatus, UpdateTarget, VerifiedUpdate } from '../domain/updates';
const stateSchema = z.object({
  automaticChecks: z.boolean().default(false),
  lastChecked: z.string().optional(),
  error: z.string().optional(),
  metadata: signedUpdateSchema.optional(),
  downloadedVersion: z.string().optional(),
});
export interface UpdateHost {
  version: string;
  packaged: boolean;
  platform: string;
  arch: string;
  target: UpdateTarget;
}
export class UpdateService {
  private busy = false;
  private closing = false;
  private pending?: Promise<UpdateStatus>;
  private timer?: NodeJS.Timeout;
  constructor(
    private readonly repo: Repository,
    private readonly jobs: OperationService,
    private readonly downloads: DownloadManager,
    private host: UpdateHost,
    private readonly publicKey = trust.publicKey,
  ) {}
  configureHost(host: UpdateHost): void {
    this.host = host;
  }
  private state() {
    const row = this.repo.db.prepare("SELECT value FROM settings WHERE key='updates'").get();
    try {
      return stateSchema.parse(row ? JSON.parse(String(row.value)) : {});
    } catch {
      return stateSchema.parse({});
    }
  }
  private save(value: z.infer<typeof stateSchema>): void {
    this.repo.db
      .prepare(
        "INSERT INTO settings VALUES('updates',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(JSON.stringify(value));
  }
  private verified(metadata?: SignedUpdate): VerifiedUpdate | null {
    return metadata
      ? verifyUpdateMetadata(
          metadata,
          this.publicKey,
          this.host.version,
          this.host.platform,
          this.host.arch,
          this.host.target,
        )
      : null;
  }
  status(): UpdateStatus {
    const state = this.state();
    let available: VerifiedUpdate | null = null,
      error = state.error;
    try {
      available = this.verified(state.metadata);
    } catch {
      error = 'Saved update metadata is no longer trusted. Check for updates again.';
    }
    return {
      currentVersion: this.host.version,
      automaticChecks: state.automaticChecks,
      trustedKeyConfigured: !!this.publicKey,
      packaged: this.host.packaged,
      available: available ?? undefined,
      downloaded: !!available && state.downloadedVersion === available.version,
      lastChecked: state.lastChecked,
      error,
    };
  }
  configure(automaticChecks: boolean): UpdateStatus {
    this.save({ ...this.state(), automaticChecks: z.boolean().parse(automaticChecks) });
    this.repo.audit(
      'app.update.configured',
      automaticChecks ? 'Automatic update checks enabled.' : 'Automatic update checks disabled.',
    );
    return this.status();
  }
  async check(): Promise<UpdateStatus> {
    if (this.closing) throw new DomainError('CLOSING', 'The application is shutting down.');
    if (this.busy)
      throw new DomainError('BUSY', 'An application update operation is already running.');
    this.busy = true;
    try {
      this.pending = this.jobs.run(
        'app.update.check',
        'Check MineDock updates',
        undefined,
        async (context) => {
          const state = this.state();
          try {
            context.phase('downloading');
            const release = z
              .object({
                tag_name: z.string(),
                draft: z.boolean(),
                prerelease: z.boolean(),
                assets: z.array(
                  z.object({ name: z.string(), browser_download_url: z.string().url() }),
                ),
              })
              .parse(
                await fetchJson(
                  'https://api.github.com/repos/Bobydeluxe/MineDock/releases/latest',
                  undefined,
                  context.signal,
                ),
              );
            if (release.draft || release.prerelease)
              throw new DomainError(
                'UPDATE_FEED',
                'No stable published MineDock update was found.',
              );
            const filename = `update-${this.host.platform}-${this.host.arch}.json`,
              asset = release.assets.find((item) => item.name === filename);
            if (
              !asset ||
              asset.browser_download_url !==
                `https://github.com/Bobydeluxe/MineDock/releases/download/${release.tag_name}/${filename}`
            )
              throw new DomainError(
                'UPDATE_FEED',
                'The latest release has no verified update metadata for this platform.',
              );
            const metadata = signedUpdateSchema.parse(
              await fetchJson(asset.browser_download_url, undefined, context.signal),
            );
            context.phase('verifying');
            const available = this.verified(metadata);
            const payload = JSON.parse(
              Buffer.from(metadata.payload, 'base64').toString('utf8'),
            ) as { version: string };
            if (release.tag_name !== 'v' + payload.version)
              throw new DomainError(
                'UPDATE_SIGNATURE',
                'The update metadata does not match its published release.',
              );
            this.save({
              ...state,
              metadata,
              lastChecked: new Date().toISOString(),
              error: undefined,
              downloadedVersion:
                available?.version === state.downloadedVersion
                  ? state.downloadedVersion
                  : undefined,
            });
            return this.status();
          } catch (error) {
            this.save({
              ...state,
              lastChecked: new Date().toISOString(),
              error: context.signal.aborted ? 'Update check cancelled.' : readableError(error),
            });
            throw error;
          }
        },
      );
      return await this.pending;
    } finally {
      this.busy = false;
      this.pending = undefined;
    }
  }
  private async filename(update: VerifiedUpdate): Promise<string> {
    const root = await containedPath(this.repo.root, 'updates');
    await mkdir(root, { recursive: true });
    return containedPath(root, `${update.version}-${update.artifact.filename}`);
  }
  async download(): Promise<UpdateStatus> {
    if (this.closing) throw new DomainError('CLOSING', 'The application is shutting down.');
    if (this.busy)
      throw new DomainError('BUSY', 'An application update operation is already running.');
    const update = this.verified(this.state().metadata);
    if (!update)
      throw new DomainError('UPDATE_FEED', 'Check for a verified newer application update first.');
    if (!this.host.packaged)
      throw new DomainError(
        'UPDATE_INSTALL',
        'Install a packaged MineDock build before installing application updates.',
      );
    this.busy = true;
    try {
      this.pending = this.jobs.run(
        'app.update.download',
        'Download verified MineDock update',
        undefined,
        async (context) => {
          const filename = await this.filename(update);
          context.phase('downloading');
          await this.downloads.download(
            update.artifact.url,
            filename,
            'MineDock ' + update.version,
            { algorithm: 'sha256', value: update.artifact.sha256 },
            Math.min(update.artifact.size, 2 * 1024 ** 3),
            context.signal,
          );
          context.phase('verifying');
          if (
            (await stat(filename)).size !== update.artifact.size ||
            (await sha256(filename, context.signal)) !== update.artifact.sha256
          )
            throw new DomainError(
              'UPDATE_SIGNATURE',
              'The update installer does not match its signed size or checksum.',
            );
          this.save({ ...this.state(), downloadedVersion: update.version, error: undefined });
          return this.status();
        },
      );
      return await this.pending;
    } finally {
      this.busy = false;
      this.pending = undefined;
    }
  }
  async installationFile(): Promise<{ file: string; update: VerifiedUpdate }> {
    if (!this.host.packaged)
      throw new DomainError(
        'UPDATE_INSTALL',
        'Install a packaged MineDock build before installing application updates.',
      );
    const update = this.verified(this.state().metadata);
    if (!update || this.state().downloadedVersion !== update.version)
      throw new DomainError('UPDATE_INSTALL', 'Download a verified update before installing it.');
    const file = await this.filename(update),
      info = await stat(file);
    if (
      !info.isFile() ||
      info.size !== update.artifact.size ||
      (await sha256(file)) !== update.artifact.sha256
    )
      throw new DomainError(
        'UPDATE_SIGNATURE',
        'The update installer changed after download. Download it again.',
      );
    return { file, update };
  }
  async recoverInstallation(): Promise<void> {
    const row = this.repo.db.prepare("SELECT value FROM settings WHERE key='pending-update'").get();
    if (!row) return;
    try {
      const pending = z
        .object({ version: z.string().max(60), request: z.string(), result: z.string() })
        .parse(JSON.parse(String(row.value)));
      const root = await containedPath(this.repo.root, 'updates');
      if (
        path.dirname(path.resolve(pending.result)) !== root ||
        !/^result-[a-f0-9-]{36}\.json$/i.test(path.basename(pending.result))
      )
        throw new DomainError('RECOVERY_PATH', 'Invalid application update recovery path.');
      const filename = await containedPath(root, path.basename(pending.result)),
        info = await stat(filename).catch((error: NodeJS.ErrnoException) => {
          if (error.code === 'ENOENT') return undefined;
          throw error;
        });
      if (!info) return;
      if (info.size > 16000)
        throw new DomainError('SIZE', 'Application update recovery result is too large.');
      const result = z
        .object({
          status: z.enum(['completed', 'failed']),
          message: z.string().max(2000).optional(),
        })
        .parse(JSON.parse((await readFile(filename, 'utf8')).replace(/^\uFEFF/, '')));
      if (result.status === 'completed' && this.host.version === pending.version)
        this.repo.audit('app.update.installed', pending.version);
      else {
        this.save({
          ...this.state(),
          error:
            'The application update did not complete. Review the preserved previous application copy or reinstall the verified package.',
        });
        this.repo.audit('app.update.install_failed', pending.version, undefined, false);
      }
      this.repo.db.prepare("DELETE FROM settings WHERE key='pending-update'").run();
    } catch (error) {
      this.save({ ...this.state(), error: readableError(error) });
      this.repo.audit(
        'app.update.recovery_failed',
        'Application update result needs review.',
        undefined,
        false,
      );
    }
  }
  startAutomaticChecks(): void {
    const check = () => {
      if (this.host.packaged && this.state().automaticChecks && !this.busy)
        void this.check().catch(() => undefined);
    };
    check();
    this.timer = setInterval(check, 6 * 3600000);
    this.timer.unref();
  }
  async close(): Promise<void> {
    this.closing = true;
    clearInterval(this.timer);
    await Promise.allSettled(this.pending ? [this.pending] : []);
  }
}
