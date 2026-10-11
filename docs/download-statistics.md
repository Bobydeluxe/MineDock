# Download statistics

The [README](../README.md#download-statistics) adds the `download_count` of actual MineDock packages returned by the official [GitHub Releases API](https://docs.github.com/en/rest/releases/releases#list-releases). All currently published releases count, including older versions and prereleases. Drafts, unpublished releases and plain Git tags do not count.

## Counting rules

- Windows: uploaded MineDock `.exe` packages, including Setup and Portable.
- Linux: uploaded MineDock `.AppImage` and `.deb` packages.
- macOS: uploaded MineDock `.dmg` packages and ZIP distributions named `MineDock-<version>-<architecture>.zip` with an uploaded `.dmg` of exactly the same basename in the same release, or `MineDock-<version>-<mac|macos|darwin>-<architecture>.zip`. Recognized ZIP architectures are `x64`, `arm64`, `x86_64` and `universal`. This identifies the existing Intel/Apple Silicon ZIPs produced alongside DMGs by MineDock's release workflow while excluding source/symbol archives. Unidentified ZIPs are excluded; adjust this rule and its tests if the distribution naming changes.
- Auxiliary documents, checksums, signatures, update JSON, source archives and other files do not count. The automatic GitHub source ZIP/tar downloads are not release assets and are never queried.

Both releases and each published release's assets are paginated with 100 results per page, following GitHub's `Link` header. Release IDs and asset IDs are deduplicated. No counters come from stars, clones, page views or CI artifacts.

These are download events, not unique people or confirmed installations. Repeated downloads, automated updater downloads and maintainer verification downloads are included in GitHub's counters. Downloads outside GitHub are not measured. Deleted releases/assets cannot be recovered from this API, so their historical downloads cannot be included. Counts may change during collection; the API does not provide a single atomic snapshot of all assets.

## Automatic refresh

[Download statistics](../.github/workflows/download-statistics.yml) runs approximately daily at **04:37 UTC**, with a manual **Run workflow** option in GitHub Actions after this PR is merged into the default branch. It uses Node's built-in APIs, requires no dependency installation or external service and uses the built-in `GITHUB_TOKEN`.

The workflow also tests script changes on pushes and pull requests using a read-only token. Only scheduled/manual runs on this repository's default branch can run the update job with `contents: write`. It never runs a write-enabled job for pull requests. It updates only the marked README table and commits only when that table changes; no timestamp-only commits are made. Updates pushed with `GITHUB_TOKEN` do not trigger ordinary push workflows. The application CI additionally ignores changes confined to these statistics files or the README; the release workflow remains tag/manual only and is unchanged.

Requests have a 20-second timeout and at most three attempts. Temporary network/server failures use exponential backoff; rate limits respect `Retry-After` or `X-RateLimit-Reset`. A required wait over one minute ends the run instead of retrying early. Any failed page, invalid response, count or pagination link fails the run before the README is changed. The last complete statistics remain visible until a successful refresh. A valid empty release list produces zero totals.

GitHub can delay scheduled runs or disable schedules in public repositories after 60 days without activity. Check the Actions page and re-enable or manually run the workflow if needed. Branch protections that forbid bot pushes also require maintainer configuration; the script does not bypass them. Concurrent maintainer edits can reject a non-fast-forward push; the job fails safely and the next run starts from the current default branch.

## Local checks

```sh
node --test scripts/update-download-stats.test.mjs
node scripts/update-download-stats.mjs
```

The second command reads public GitHub data and updates the README; an optional `GITHUB_TOKEN` raises the unauthenticated API limit. Never commit a token. Tests use sample responses and temporary files, without network access or release mutations.
