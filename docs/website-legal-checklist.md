# Website legal publication checklist

**BLOCKED — awaiting contact/hosting disclosure confirmation and review, 10 October 2026.** The owner confirmed a **non-professional individual** publisher, requested **anonymity**, and has **no public email address yet**. Four English legal source pages exist for local review. They are not represented as completed legal notices or proof of compliance. The production build refuses unapproved statuses and TODO/DRAFT content. Do not publish the review export as production.

## Publisher information required

- Publisher classification is confirmed as a non-professional individual. Keep this choice and the anonymity preference recorded in `site/publication.json`; neither establishes that GitHub has received the required personal identification. No public email exists yet. Do not infer identity from the GitHub account.
- For a professional individual/entity, review the applicable identity, professional address, public contact/telephone, business registration, legal form/capital and VAT information where relevant, plus publication responsibility. Do not collect or publish identifiers that do not apply.
- A non-professional individual may have an anonymity option under the conditions of [LCEN Article 1-1 II](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000049568614): disclosure to the host is a condition, not something proved by owning a GitHub username. Confirm the route with the owner and host. Do not ask the owner to post a private address in a public GitHub issue or this repository merely to complete a template.
- The owner can contact [GitHub Support](https://support.github.com/) privately to confirm how the required identity details can be communicated to GitHub for this purpose. No such support request was sent on the owner's behalf, and no host confirmation is claimed. A public profile name or repository ownership alone does not settle the condition.
- Confirm an appropriate public contact and a private channel for data-rights requests, who receives messages, applicable purpose/basis, retention period or criteria, and any providers. No mailbox, response period or data deletion power is invented.
- Confirm controller/host roles, lawful bases where applicable, recipients and transfers for the actual arrangement. Prefer qualified legal review before setting the publication approval flags. [CNIL transparency guidance](https://www.cnil.fr/fr/conformite-rgpd-information-des-personnes-et-transparence) explains the information to assess. Website terms do not remove mandatory rights.

For professional publishers, consult current official guidance for [an individual entrepreneur](https://entreprendre.service-public.gouv.fr/vosdroits/F31228), [a company](https://entreprendre.service-public.gouv.fr/vosdroits/F37351) and [the Ministry of Economy](https://www.economie.gouv.fr/entreprises/developper-son-entreprise/innover-et-numeriser-son-entreprise/mentions-sur-votre-site-internet-les-obligations-respecter). This checklist is a review aid, not a legal opinion or certification.

## Host verification

The planned host is GitHub Pages / GitHub, Inc. Its postal identification and official support/privacy links are sourced in the draft notice from [GitHub's statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement). A suitable current general hosting telephone contact has **not** been verified; leave this marked pending where the applicable notice requires it. The official [SIRT description](https://docs.github.com/en/site-policy/security-policies/github-sirt-description-rfc-2350) says no telephone is available for that team; a security team contact must not be repurposed as an invented host phone number.

GitHub Pages is not yet active for this repo. The new notice does not purport to identify the current ChatGPT Sites host. Keep the legacy host/audience until the replacement and its legal text are approved. The separately authorized 0.5.0 application release updates that existing homepage’s version/download links; it does not deploy Pages or legal drafts.

## Actual technology audit

| Item                                       | Source/export finding                                          | Remaining check                                     |
| ------------------------------------------ | -------------------------------------------------------------- | --------------------------------------------------- |
| Executable scripts, embeds, analytics, ads | None                                                           | Recheck live host resources                         |
| Fonts                                      | System stack only, no web font request                         | Recheck live network                                |
| Images / CSS / icons                       | Same-site local files only                                     | Recheck public hashes/loading                       |
| Accounts / contact forms / payments        | None                                                           | Reassess before introduction                        |
| Cookies / local/session storage            | No source that sets or reads them                              | Confirm host cookies after live deployment          |
| External links                             | GitHub source/docs/downloads, official legal/privacy resources | Destination policies apply when followed            |
| Search Console                             | Not connected; future static owner verification only           | Real token and Google confirmation required         |
| Hosting logs                               | GitHub documents security IP logging for Pages                 | No exact log retention or deletion power is claimed |
| Email contact / controller identity        | Not supplied                                                   | Owner must resolve before launch                    |

No optional tracking means there is no reason to add a consent banner to the present export. If future nonessential trackers are introduced, review and implement applicable consent before loading them: [CNIL cookie guidance](https://www.cnil.fr/fr/cookies-et-autres-traceurs/regles/cookies/comment-mettre-mon-site-web-en-conformite). The desktop application's local files and optional provider calls are a separate scope.

### Legacy hosting runtime observation

An anonymous browser visit to the current legacy site on 10 October 2026 returned 200 and observed three HttpOnly/Secure cookies: `__Host-appgarden-visitor`, `cf_clearance` and `__cf_bm`, plus a provider-injected inline challenge script and an iframe without a source URL. No remote images, contact forms, browser storage or third-party resource origins were observed in that visit. Source-only inspection would not reveal these host additions; `document.cookie` also does not expose HttpOnly cookies. Cookie values are deliberately excluded from the committed audit.

[Cloudflare's documentation](https://developers.cloudflare.com/fundamentals/reference/policies-compliances/cloudflare-cookies/) identifies `__cf_bm` with bot protection and `cf_clearance` with challenge/JavaScript detection state. The purpose and processing/retention terms of `__Host-appgarden-visitor` were not established and must not be invented. This observation is about the existing host, not the prepared GitHub Pages export. No Cloudflare account, DNS, custom domain or new hosting service was configured. Host-level cookie behavior for the replacement remains pending real deployment; the lack of cookies in a local export does not prove a cookie-free public host.

## IP and final approval

Keep the MIT code license distinct from the supplied icon's provenance, dependencies, Minecraft textures/skins and mod licenses. Captures have existing explicit owner permission for public website/GitHub use, while original game/client/cache files remain excluded. Keep synthetic-data/version disclosures and links to [asset policy](asset-policy.md), [brand provenance](../assets/brand/README.md) and [dependency notices](THIRD_PARTY_NOTICES.md). Owner permission is not a legal certification of third-party rights.

Before launch: fill and review every TODO, resolve applicable host contact gaps, review terms/privacy/IP pages, record the actual review date/statuses, obtain explicit approval for the reviewed legal changes and Pages publication, configure Pages/environment, deploy from `main` and verify the real host. Google verification can follow separately. The application release was authorized and published separately; it does not approve these legal drafts.
