# GitHub Pages migration — local review captures

These historical pre-release images are actual browser captures of the built `dist/site` export mounted at `/MineDock/`, not a public deployment. The visible banner identifies the review-only build. Existing homepage artwork, real Electron screenshots and 0.4.1/unreleased 0.5.0 labels are retained. The legal notice remains a draft: the owner selected non-professional publication and anonymity and has no public email yet.

- [Desktop home, 1440 px](home-1440.png)
- [Mobile legal notice, 390 px](legal-390.png)

Run `pnpm build:site`, `pnpm test:site`, then `pnpm test:site:browser`. The browser command mounts only `/MineDock/` on a temporary localhost port and checks six pages at five widths. It uses Edge headless on Windows and Playwright Chromium elsewhere. Add `--capture --downloads` to the Node command (`node scripts/check-site-browser.mjs --capture --downloads`) to refresh these review images and verify all thirteen public stable downloads. Browser evidence is written to ignored `test-results/website-browser.json`. Do not use the review export as a production artifact.

The checks cover English/one H1, image loading and seven exact native screenshot hashes per width, overflow, runtime/network errors, local cookies/storage, fixed palette contrast, visible keyboard skip/focus, FAQ and cross-page links. Trailing slash and custom nested 404 behavior are checked on the local server. This is a basic accessibility check, not a complete WCAG audit. Real GitHub Pages headers, cookies, HTTPS and deployment behavior remain pending activation. The [machine evidence](../../validation-records/0.5.0-website-pages.json) records the scope and current block.
