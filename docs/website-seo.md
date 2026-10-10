# Website deployment and search discovery

**10 October 2026 — PREPARED ONLY.** Authenticated GitHub API checks confirmed public repository `Bobydeluxe/MineDock`, default branch `main`, administrator/push access and enabled Actions. `GET /pages` and the `github-pages` environment both returned 404; `has_pages` was false. The proposed `https://bobydeluxe.github.io/MineDock/` returned 404. The legacy site returned 200. These are observations, not a completed deployment.

Public application version is **0.5.0**. The merged [PR #9](https://github.com/Bobydeluxe/MineDock/pull/9) includes website preparation alongside the application work. The existing public homepage is updated to 0.5.0, with five-width checks and matching native image hashes recorded in [release validation](validation.md). Application publication does not authorize legal drafts: Pages remains gated separately, and the existing website remains primary.

## Activate only after legal review and owner approval

The public contact **minedockapp@gmail.com** is now confirmed. The [application/website audit](privacy-audit.md), [Code signing policy](code-signing-policy.md) and [secure owner steps](website-owner-actions.md) complete the verifiable preparation. The owner has not contacted GitHub about private identity disclosure yet; publication remains blocked. The prepared privacy URL must not be submitted as live to SignPath.

1. Complete the [legal checklist](website-legal-checklist.md), replace source TODO/DRAFT text with verified details, and record approved publisher/privacy/host statuses plus a review date in `site/publication.json`. Review the concrete pages locally. Do not invent a publisher identity or set approval merely to bypass the build.
2. Obtain explicit approval for the reviewed legal changes and GitHub Pages publication. PR #9 is already merged for the application release; its merge did not approve Pages. No PR deployment is configured. The workflow's build and deploy jobs also reject manual runs from branches other than `main`.
3. On GitHub open **Bobydeluxe/MineDock → Settings → Pages → Build and deployment → Source → GitHub Actions**. This is the free public repository project site; do not enter a custom domain or create CNAME/DNS records.
4. Open **Settings → Environments → github-pages → Deployment branches and tags**. Choose selected branches/tags and permit only branch `main`. The environment does not exist yet; check it after Pages setup and before dispatch. Confirm Pages/Actions remain enabled. Prefer an owner review gate if the account supports it.
5. Merge only the approved changes. The workflow runs for relevant `main` changes; otherwise choose **Actions → Deploy website to GitHub Pages → Run workflow → main**. `configure-pages` reads the configured URL. A mismatched domain or unapproved legal content fails the build; investigate rather than bypass it.
6. Verify the actual deployment output and public HTTPS URL. Check home, `/legal/`, `/terms/`, `/privacy/`, `/licenses/`, `/sitemap.xml`, all assets, trailing slash navigation and an unknown nested path. Confirm five sitemap entries, exact canonical/OG URLs, indexable approved pages and a non-indexable 404. Check host response cookies and external requests again. Confirm all thirteen stable download URLs still respond 200 with nonzero sizes.
7. Only then replace primary legacy links in README, repository About/homepage, current site documentation and future release notes. Record the deployment and follow the [legacy retirement plan](legacy-site/README.md). Historical records retain their original URLs and dates.

The workflow uses Node 24, no package install, `contents: read` and `pages: read` for building/configuration inspection, and `pages: write`/`id-token: write` only for deployment. Pages auto-enablement is explicitly disabled; the owner configures it first. Its artifact is **`dist/site`**. Concurrency serializes production deployments. Review-only builds are also checked in normal CI without any deployment permissions. [GitHub's custom-workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) describes Pages source, artifact and environment requirements.

## Prepared SEO behavior

The English home page keeps useful product information, stable 0.5.0 download links, FAQ, actual screenshots and truthful version/provenance captions. Each of the five pages has one H1 and a unique title/description. Production uses the exact project URL and corresponding child routes for canonical/OG metadata, with the real cube icon for social previews. JSON-LD is intentionally omitted rather than inventing a verified publisher, rating or user count. No Google Analytics is needed or included.

**Review builds are deliberately not SEO publications:** no canonical/OG destination is asserted for the currently unavailable host, all review HTML uses `noindex,follow`, and the review sitemap is empty. Approved production builds remove the review banner, generate five sitemap URLs and use `index,follow`; the custom 404 always stays `noindex`. The 0.5.0 screenshot section is part of the home page, not a separate indexed preview route.

`https://bobydeluxe.github.io/MineDock/robots.txt` is only a project-scoped informational file. Standard robots exclusion is read at `https://bobydeluxe.github.io/robots.txt`. This repository cannot claim origin-wide control or use its nested file to control other projects. Use crawlable links, meta directives and the sitemap; see [Google's robots documentation](https://developers.google.com/search/docs/crawling-indexing/robots/intro).

## Search Console — owner steps after deployment

1. Sign in to [Google Search Console](https://search.google.com/search-console) with the owner's Google account.
2. Add a **URL-prefix** property with the exact verified `https://bobydeluxe.github.io/MineDock/`, including HTTPS, case and trailing slash. Do not create a domain property for `github.io`, which the owner does not control.
3. Choose the HTML **meta tag** method. Copy Google's actual provided `google-site-verification` tag into `site/index.html`'s head, preserve it exactly, commit and deploy the approved source. It is public verification material, not an analytics script. No token has been supplied or invented in this work. If choosing Google's HTML-file method instead, add an explicit build copy and export allowlist entry for that exact owner-provided file and test its published project path first.
4. Open the public home page and inspect its source to confirm the real tag is present. Return to Search Console and click Verify. Keep the tag in later deployments. Only an actual successful Google response establishes verified ownership.
5. In Sitemaps submit `https://bobydeluxe.github.io/MineDock/sitemap.xml`. Inspect the homepage and useful pages with URL Inspection, run the live test and request indexing where available. Record Google's actual statuses.

Sources: [property types](https://support.google.com/webmasters/answer/34592?hl=en), [ownership verification](https://support.google.com/webmasters/answer/9008080?hl=en). No ownership verification, sitemap submission, indexing or ranking has been performed or promised. Discovery and ranking are not guaranteed.
