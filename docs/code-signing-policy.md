# Code signing policy

## Current status

MineDock **0.5.0** is already released. Its Windows downloads are **unsigned**. MineDock has not been accepted by SignPath Foundation and no Foundation signing service, certificate, token, signing approver account or GitHub signing workflow has been provisioned. This policy documents current release provenance and the proposed controls for a future signing application; it does not re-sign or replace existing assets.

MineDock's original application code is **MIT-licensed**, maintained and reviewed by the project owner. Its official homepage and public source are [Bobydeluxe/MineDock](https://github.com/Bobydeluxe/MineDock). Windows packages are distributed through [GitHub Releases](https://github.com/Bobydeluxe/MineDock/releases), with [README download instructions](../README.md#download-and-installation). Builds use the [GitHub Actions distribution workflow](../.github/workflows/build-release.yml). Release evidence: [0.5.0 validation](validation-records/0.5.0-release.json). The project intends to apply for SignPath Foundation Windows code signing, subject to the Foundation's approval.

## Maintainer roles

GitHub repository permissions were inspected on 10 October 2026. **[Bobydeluxe](https://github.com/Bobydeluxe)** is the sole returned collaborator with write/admin permission and the repository owner.

| Role               | Responsible member and boundary                                                                                                                                                                                                                                                                    |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Committer / author | Bobydeluxe controls source, build scripts and repository writes. Outside contributors propose pull requests. Automated coding assistance does not become a signing authority.                                                                                                                      |
| Reviewer           | Bobydeluxe reviews proposed contributions and build/release changes. The API did not report a protected `main` rule; this is a governance policy, not a claim of enforced independent or two-person review.                                                                                        |
| Signing approver   | Proposed sole authority: Bobydeluxe, after the Foundation accepts the project and the owner is enrolled in its approver role. **No signing approvals are operational today.** Each release must receive an explicit human signing approval; workflow execution or a Git tag alone is insufficient. |

Changes to membership or signing authority must be documented and reviewed. MFA is required before signing access is enabled, for both repository and signing accounts. The owner's MFA settings were not verified by this audit; no private account details are published.

## Builds, review and release verification

GitHub Actions builds the desktop packages from identified repository commits, with a frozen pnpm lockfile, source checks and native OS/architecture jobs. Maintain the link between commit, workflow/job, artifact, package version and public release. Review dependency and build-script changes with particular care; a hash alone does not establish source provenance or absence of malware.

Before publication, relevant lint/type/build, unit, interface and packaged checks must pass, migrations must be reviewed, and each intended release file must be checked. Record artifact source when it differs from the release-tag commit and verify that packaged application inputs match. Do not silently replace released binaries or signed update metadata. The 0.5.0 record documents twelve packages, six updater metadata files, the public Windows download and actual Windows migration checks, with explicit coverage limits.

If accepted by SignPath, use its supported CI artifact-provenance integration and approved product/version restrictions. Restrict signing credentials and release approvals; do not expose them to untrusted PR workflows. An authorized human must approve each release for signing. Verify returned signatures and package identity before publishing new signed artifacts with fresh checksums and updater metadata. Announce the first signed version and any certificate/publisher details only after they exist. Approval and future service availability are not promised.

The following attribution is **conditional wording for use only after acceptance and actual provision of signing**, not a present endorsement: “Free code signing provided by SignPath.io, certificate by SignPath Foundation”. Current downloads must continue to be described as unsigned until verified otherwise.

## Privacy, licenses and eligibility review

Desktop [Privacy Policy](PRIVACY_POLICY.md): **https://github.com/Bobydeluxe/MineDock/blob/main/docs/PRIVACY_POLICY.md**. This is the intended canonical policy link after this change is merged; until then, review the file in the pull request. The [completed application network audit](privacy-audit.md) documents the source evidence. Contact: `minedockapp@gmail.com`. Correspondence access, roles/bases and deletion practice still need maintainer review; a public policy alone does not establish signing eligibility.

MineDock has online update/download/catalog, skin and optional observer features. There is no blanket promise of zero network traffic. Automatic update checks default off, but opening some views triggers provider requests. The released installer does not display the newly prepared policy and no global network-disable option exists. Ask the Foundation to assess these facts against its installation/privacy requirements; do not claim eligibility is established by this document.

Original code is MIT. [Third-party notices](THIRD_PARTY_NOTICES.md), Electron/Chromium distribution notices, the lockfile and [asset policy](asset-policy.md) identify other licenses and boundaries. Downloaded Minecraft clients/server resources, mods and plugins are separate user-selected resources; Minecraft proprietary content is not MIT and is not bundled for signing. Upstream runtime/library files keep their identity and licenses; acceptance must determine what can be included or signed, rather than treating every packaged dependency as MineDock-authored code.

The README's **Code signing policy** section and download links identify the maintainer roles, privacy notice and current unsigned status. Future release/download descriptions must retain links to both policies. Add the conditional credit above only after acceptance and actual signing; no existing binary or cryptographic update metadata is replaced by this documentation work.

Reviewed requirements: [SignPath Foundation terms](https://signpath.org/terms.html), accessed 11 October 2026. The Foundation makes its own acceptance decision. Before applying, confirm the outstanding correspondence practices, request an assessment of installer/privacy controls, verify maintainer MFA and enroll a human signing approver. No host-disclosure or separate-site launch is part of this distribution model.
