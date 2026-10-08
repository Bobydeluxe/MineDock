# MineDock public website

Buildless, English-first product site. `node scripts/build-site.mjs` copies the HTML, CSS, original MIT engine symbols and actual Electron screenshots into ignored `data/website-publish/dist`. The Sites publishing helper manages that isolated source checkout; it does not replace the MineDock Git remote.

The site clearly separates the released 0.3.0 beta download from proposed 0.4.0 features and QA captures. No analytics, cookies, account system or external font service is included. Links lead to the official GitHub repository, documentation and release notes.

Project identity is retained in `.openai/hosting.json`. The requested public audience is set through Sites after local review. Credentials are short-lived and passed through the helper's hidden stdin, never committed.

Published: [MineDock website](https://minedock-friends.arcane-rhea-3082.chatgpt.site), saved version 1 from source `d0f39cfd373e663c8022d638b5a0a56105097bc9`. Production desktop/mobile checks pass. The app release remains 0.3.0.
