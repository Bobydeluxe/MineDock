# MineDock website source

**Status: PREPARED ONLY, 10 October 2026.** The active website remains [the legacy site](https://minedock-friends.arcane-rhea-3082.chatgpt.site/). The proposed free project URL `https://bobydeluxe.github.io/MineDock/` returned HTTP 404 during the authenticated repository audit: Pages is not configured. Do not advertise that address as live yet.

The existing English home design, icon, original landscape and real Electron screenshots are retained. Downloads point to public **0.5.0** packages. The seven administration/item screenshots are labeled **MineDock 0.5.0**, with their existing provenance captions. No game-resource archives are exported.

The combined desktop/website Privacy Policy, [source network audit](../docs/privacy-audit.md) and [Code signing policy](../docs/code-signing-policy.md) are prepared. The public email **minedockapp@gmail.com** is confirmed. The owner has not yet arranged confidential identity disclosure with GitHub; correspondence handling and final legal review remain pending. Follow [secure owner actions](../docs/website-owner-actions.md). The planned privacy URL is not live or ready for SignPath submission.

## Local review

Run `pnpm build:site`, then `pnpm test:site`. Node 24 is enough for these commands; the static build needs no installed packages. Output is the disposable, allowlisted **`dist/site`**, alongside the desktop build. `pnpm test:site:browser` adds reproducible Playwright checks at the five requested widths using a temporary HTTP server mounted at **`/MineDock/`**, not at the web origin. Edge is used on Windows; install Playwright Chromium for other systems. To inspect manually, serve the same project prefix. See the [browser reproduction steps and captures](../docs/design/github-pages-050/README.md) and [validation record](../docs/validation-records/0.5.0-website-pages.json).

Review exports contain a visible draft banner, `noindex,follow`, no canonical and an empty sitemap. They are local review artifacts, not a public preview. `legal/`, `terms/`, `privacy/` and `licenses/` share a footer. `404.html` uses absolute project assets so unknown nested paths still render.

## Publication gate

The dedicated [Pages workflow](../.github/workflows/deploy-pages.yml) has no PR trigger and both jobs require this repository's `main` ref. It uploads only `dist/site`; no Electron install, game cache, private QA files or Sites credentials are needed. A production build fails before touching output while [publication.json](publication.json) is unapproved, required contact/date/status fields are invalid, anonymous-host disclosure is unconfirmed, or legal HTML contains TODO/DRAFT markers. In-memory gate fixtures never approve the actual configuration. The configured Pages URL must exactly match the expected project URL; custom domains are refused.

After the owner completes and reviews the legal pages, the approval statuses and review date can be recorded. Merge/publication still needs explicit owner authorization. Only then enable GitHub Actions as the Pages source, limit the `github-pages` environment to `main`, and run the production workflow. See the [deployment/SEO guide](../docs/website-seo.md) for activation and public verification steps. Do not clear the legal gate merely to make a workflow green.

Production generates unique titles/descriptions, canonical and Open Graph URLs, Twitter metadata and a five-page absolute sitemap from the configured project URL. The 404 remains `noindex`. Optional JSON-LD is omitted; no ratings, publisher identity or other structured facts are fabricated. A real Google verification meta tag can be added to the home head once supplied by the owner; none exists yet.

The old Sites configuration is retained only as [rollback evidence](../docs/legacy-site/hosting.json), outside the active site tree. No current build reads it. Historical screenshots/validation records and the isolated ignored Sites checkout remain intact; see the [retirement plan](../docs/legacy-site/README.md).
