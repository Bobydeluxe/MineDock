# MineDock public website

English-first static product site for the public MineDock 0.4.0 release. `node scripts/build-site.mjs` copies the HTML, CSS, original MIT engine symbols and actual Electron screenshots into ignored `data/website-publish/dist`. The Sites helper manages that isolated source checkout without changing MineDock Git remotes.

No analytics, cookies, account system or external fonts. Release/download and guide links point to v0.4.0 and main. Captures disclose isolated QA records, without gameplay claims.

The existing public Site is [MineDock](https://minedock-friends.arcane-rhea-3082.chatgpt.site). Its retained identity is in `.openai/hosting.json`. Short-lived credentials are supplied through hidden stdin and never committed.
