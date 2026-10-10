# Owner actions before GitHub Pages and SignPath

## Current status — 10 October 2026

The desktop application remains **0.5.0** with twenty unchanged release assets. GitHub Pages is not enabled and home, privacy, legal, terms, licenses and sitemap return **404**. The existing homepage remains the active website until Pages has actually deployed and passed public verification. A nonexistent privacy URL must not be submitted to SignPath.

Confirmed by the owner: private non-professional publisher, public anonymity preferred, public contact **bobydeluxe18@gmail.com**, and **no GitHub identity-disclosure confirmation yet**. Only that explicitly designated public email is included in the proposed notices. The owner has not supplied private residential information here.

## 1. Resolve anonymous publication privately with GitHub

[LCEN Article 1-1 II](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000049568614) provides a non-professional anonymity arrangement conditional on communicating the required identifying information to the host. This is not established by a public pseudonym, a GitHub account, billing information or enabling Pages. Under that specific paragraph the public host name/address are listed; do not invent a general host telephone number merely to fill the professional-publisher template. Qualified legal review should confirm the arrangement for this project.

Open [GitHub Support](https://support.github.com/) while signed into the repository owner's account and create a **private support ticket**. First ask for the appropriate confidential route, without attaching identity documents or your residential address to the initial inquiry. Suggested message to send yourself:

> Bonjour, je souhaite publier le site du projet open source MineDock avec GitHub Pages, à titre personnel et non professionnel en France, tout en conservant mon anonymat public. L'article 1-1 II de la LCEN prévoit la communication à l'hébergeur des éléments d'identification personnelle visés au I. Pouvez-vous confirmer si GitHub peut recevoir ces éléments pour ce site et m'indiquer la procédure confidentielle et sécurisée appropriée, ainsi que la confirmation que je pourrai conserver une fois cette démarche accomplie ? Merci de ne pas rendre ces informations publiques.

This text is a prepared suggestion; no message has been sent on the owner's behalf. Follow GitHub's verified instructions through its private channel. Confirm that the required information has actually been received under the applicable arrangement; merely finding a support form is insufficient. Share only the non-sensitive confirmation/status back with the project. Do not post an address, phone, identity document or unredacted ticket in a public issue, PR, repository or this chat. If GitHub cannot support the arrangement, obtain advice on a lawful alternative before changing the gate; do not mark disclosure complete anyway.

## 2. Review the prepared privacy text

Review [the privacy source](../site/privacy/index.html), [source audit](privacy-audit.md), legal notice and terms. The technical source audit is complete. The publisher-controlled legal roles/bases and contact arrangements are proposals, not facts invented by a build script.

Confirm or correct these concrete proposed contact rules:

- The project owner receives messages at the designated Gmail mailbox; no additional support team is assumed.
- Messages are used to answer inquiries, handle correction/security requests and exercise applicable privacy rights, without marketing reuse.
- Proposed bases for review: legitimate interests for proportionate support/corrections, and a legal obligation where handling a statutory request is required. Do not equate the in-app ownership/EULA confirmation with blanket GDPR consent.
- Proposed retention criteria: keep correspondence only as needed to resolve the request and any applicable obligation or dispute, then delete or anonymize unnecessary content. Confirm the actual deletion practice and review trigger; no unsupported fixed retention period is supplied.
- Gmail/Google and GitHub process service data under their own notices. Review the actual account arrangements and relevant international-transfer information; no processor agreement, exclusively EU storage or blanket transfer certification is claimed.

Approve the final reviewed text and effective date only after the anonymous-publisher arrangement is resolved. Qualified legal advice is recommended where applicability or responsibility is uncertain. A draft or source audit is not proof of GDPR compliance.

## 3. Deploy the approved site

Repository admin access was verified, so activation can be performed through GitHub's supported Pages API/workflow after legal approval. If the account requires a manual setting, use:

1. Open **Bobydeluxe/MineDock → Settings → Pages**.
2. Under **Build and deployment → Source**, select **GitHub Actions**. Keep the default `github.io` project address; add no custom domain, CNAME, DNS or subscription.
3. In **Settings → Environments → github-pages**, configure deployment branches to permit only `main`; verify the environment before dispatch. Use owner approval protection if available on the account.
4. Merge only the reviewed website/privacy PR after the real publication fields are approved. Do not set `approved: true` or invent disclosure merely to get a successful build.
5. Run **Actions → Deploy website to GitHub Pages → Run workflow → main**. The existing workflow exports `dist/site` and reads the configured project URL.
6. Require successful deployment and actual HTTP 200 for home, `/privacy/`, `/legal/`, `/terms/`, `/licenses/` and `/sitemap.xml`, then inspect images, mobile widths, navigation, cookies and thirteen release/checksum links. Check 404 behavior as well.

Only after those checks replace active legacy links and the repository About/homepage with **https://bobydeluxe.github.io/MineDock/**. Historical evidence keeps its original URLs. Do not delete the old site or claim a redirect without a supported, tested redirect capability. No automatic redirect has been established; [legacy retirement](legacy-site/README.md) documents this limit.

## 4. SignPath submission after publication

Use **https://bobydeluxe.github.io/MineDock/privacy/** as the single Privacy Policy URL only once it is live, reviewed and complete. Include the [Code signing policy](code-signing-policy.md). Confirm the owner as signing approver and MFA before provisioning signing access. Acceptance is the Foundation's decision.

Ask SignPath to assess the disclosed 0.5.0 network behavior and installer against its current requirements. The existing installer does not display this new policy, and some view-triggered requests have no per-feature opt-out. Any required installer/application change needs a separately reviewed future application release; this website task does not rebuild or replace 0.5.0. No signing request, acceptance or certificate is claimed.

## 5. Search Console after the site is live

Follow [the SEO guide](website-seo.md): add the exact **URL-prefix** property `https://bobydeluxe.github.io/MineDock/` in the owner's Google account, obtain Google's real meta verification tag, commit/deploy it, verify with Google and submit the sitemap. No Google token has been invented, no analytics is added and indexing/ranking are not promised.
