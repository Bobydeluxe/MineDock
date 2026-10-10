# Legacy website retirement and rollback

The active website is still `https://minedock-friends.arcane-rhea-3082.chatgpt.site/`. Its last verified deployment was Sites version **10** on 10 October 2026 at 17:33 UTC, source `7d0dae596f6cbd2665b1aef10499ab18cca9b0d2`, with 0.5.0 downloads. The [release record](../validation-records/0.5.0-release.json) retains its deployment identifier; the earlier administration record's version 9 remains historical evidence. The `hosting.json` in this folder preserves its opaque project identity. It is not consumed by the new GitHub Pages build and contains no credential.

## What can actually be done

The exposed Sites connector offers access controls, slug changes, versions and deployments. It does **not** expose a dedicated unpublish/delete-site or permanent HTTP-redirect operation in this session. A slug change is not proof of a redirect. No legacy site settings were changed and no retirement action was attempted. A supported UI or host capability must be verified before promising an HTTP redirect or permanent deletion.

## Controlled switch after approval

1. Complete publisher/privacy review, get explicit approval to merge/publish the website, and deploy from `main` through GitHub Pages.
2. Open the actual public project URL, verify all five pages, favicon, images and styles over HTTPS, the custom 404, sitemap/canonical metadata and the thirteen current 0.5.0 download links. Repeat browser and cookie checks on the real host. Preserve the successful Actions/deployment identifiers and output hashes.
3. Only after these checks pass, update README's primary Website link, the repository About/homepage setting, active website instructions and future release notes to the verified GitHub Pages URL. Keep old URLs in historical evidence explicitly labeled historical. Search for `chatgpt.site` to distinguish live references from records.
4. Ask the owner before retiring the legacy deployment. If the host has no supported redirect, an owner-approved static move notice linking to the verified replacement is an option; it is not an HTTP redirect. Keep the previous version available for rollback until the replacement is accepted. Avoid serving two fully indexable copies indefinitely.
5. If needed, recover the old source from Git commit `f604a18f80320216972dae91d86b1da3eafdf0bd`, which includes the original Sites build script and hosting file. Use an isolated checkout and the existing site identity; do not overwrite the current Pages source or create a new hosting project. The ignored `data/website-publish` checkout has not been removed.

No new domain, CNAME, DNS record, paid hosting or GitHub release is part of this migration.

An anonymous runtime audit observed hosting cookies and a challenge script outside the static source; see the [website audit](../website-legal-checklist.md#legacy-hosting-runtime-observation). The old host must not be described as cookie-free merely because MineDock's HTML sets none. This audit did not change the legacy deployment.
