# Auto-Update Rollout Procedure (Tauri v2)

This guide covers the `Release Builds` workflow and the app's update channels. Windows NSIS and macOS installations support in-app updates when writable. Linux releases use Debian packages and a signed APT repository; Linux in-app updates are disabled.

For a normal stable release, merge the changes, commit and push the version-only bump directly to `main`, wait for CI on that commit to pass, then push the matching version tag. The tag workflow builds, signs, and publishes the release. See [section 4](#4-stable-release-flow). Prerelease distribution and preliminary non-publishing builds are optional.

Comprehensive dependency and tooling maintenance is a separate, explicitly invoked [maintenance skill](../.agents/skills/unimozer-maintenance/SKILL.md). Releasing does not invoke that skill or start fresh outdated-version checks or updates. Review known blockers using existing findings and decisions.

## 1) One-time setup

### 1.1 Generate updater signing key pair
Run once on a secure machine:

```bash
npx tauri signer generate -w ./tauri-updater.key
```

This prints a public key and creates a private key file.

Important:
- Keep the private key forever (do not rotate casually).
- If you change keys, already-installed apps will stop trusting new updates.

### 1.2 Set public key in app config
For a fork, set `plugins.updater.pubkey` in `src-tauri/tauri.conf.json` to the public key from step 1.1. Upstream already has a release key configured; normal releases reuse that key pair.

Commit this change.

### 1.3 Add GitHub Actions secrets
Repository Settings -> Secrets and variables -> Actions -> Secrets:
- `TAURI_SIGNING_PRIVATE_KEY` = full private key contents
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` = password (if your key is encrypted; otherwise can be empty string)

### 1.4 Ensure required Actions variables exist
Repository Settings -> Secrets and variables -> Actions -> Variables:
- `TEMURIN_WIN_X64_ZIP_URL`
- `TEMURIN_WIN_X64_SHA256`
- `TEMURIN_LINUX_X64_TAR_GZ_URL`
- `TEMURIN_LINUX_X64_SHA256`
- `TEMURIN_MAC_X64_TAR_GZ_URL`
- `TEMURIN_MAC_X64_SHA256`
- `TEMURIN_MAC_ARM64_TAR_GZ_URL`
- `TEMURIN_MAC_ARM64_SHA256`
- `JDTLS_DIST_URL`
- `JDTLS_DIST_SHA256`
- `PUBLISH_GH_RELEASE` (must be `true` or `false`; `true` enables auto publish on version-tag push)

The preflight checks every platform's archive URL and checksum format before any platform build. For macOS signing secrets, Windows Azure configuration, and Linux APT signing/Pages setup, see [DEVELOPMENT.md](../DEVELOPMENT.md#github-actions-cicd-setup).

## 2) Version rule before every updater test/release

Updater only installs if remote version is higher than installed version. A newer publication date, different commit, replaced assets, or switching channels does not make the same version an update.

### Candidate version policy

- **Reserve plain `X.Y.Z` versions for stable releases.** Every version published to the prerelease channel must use `X.Y.Z-rc.N`, starting at `rc.1` and increasing for each revised candidate.
- This rule applies to both pushes to `prerelease` and manual dispatches with `release_channel=prerelease`. A normal stable release goes directly to `X.Y.Z`; it does not need an intermediate RC.
- For example: `0.19.0-rc.1` -> `0.19.0-rc.2` -> `0.19.0`. Each version is higher than the previous one, and the final stable version is higher than all its candidates.
- Never reuse a published candidate version for changed code. Retrying a failed job or completing another platform for the exact same source candidate may reuse its version.
- Do not use build metadata such as `+build.2` to signal an update; it does not increase semantic-version precedence.
- The GitHub prerelease flag and moving `updater-prerelease` tag select the distribution channel; they do not add a candidate suffix to the application's version.

**If a plain version was already published as a prerelease:** for example, an installed `0.18.1` will not update to a rebuilt stable `0.18.1`, and `0.18.1-rc.1` is older. GitHub can still publish a stable release with that version; the problem is that it is not a newer version for the updater. Use a higher unused stable version, such as `0.18.2`, to preserve automatic updates. If further prerelease testing is needed, use `0.18.2-rc.1` -> `0.18.2`. Otherwise, testers must manually install the replacement. Changing the channel or release flag does not solve equal-version updates.

Before each test/release, keep the app version aligned in all of these locations:

- `package.json`
- `package-lock.json` (top-level version and `packages[""].version`)
- `src-tauri/Cargo.toml`
- `src-tauri/Cargo.lock` (the `unimozer-next` package entry)
- `src-tauri/tauri.conf.json`

Also set `bundle.windows.wix.version` in `src-tauri/tauri.windows.conf.json` to the numeric `X.Y.Z` portion (for example, `0.18.1` for app version `0.18.1-rc.1`). WiX rejects text prerelease identifiers. This is installer metadata only: the application, asset names, and updater manifests retain the full candidate version. MSI metadata does not distinguish candidates within the same release; MSI installations use manual installation rather than the in-app updater. `check:versions` verifies this numeric mapping too.

Run `npm run check:versions` to verify alignment. This check only verifies consistency; it does not enforce candidate suffixes or increasing versions. Stable version tags must match the app version; prereleases use the moving `updater-prerelease` tag. Java bridge module versions are independent.

The RC-only prerelease rule is a release policy. The current workflows do not automatically reject a plain version sent to the prerelease channel, so check the source application's version before either publishing route. Automated enforcement would require a workflow validation change; neither the channel selection nor `check:versions` provides that protection today.

## 3) Prerelease channel testing (optional)

Use this flow only when prerelease distribution is explicitly requested. It publishes to the moving GitHub release tag `updater-prerelease`. Under the policy above, publish only application versions of the form `X.Y.Z-rc.N` to this channel.

### 3.1 Build and publish prerelease assets

Before either a branch push or manual dispatch:

1. Check the previously published app version in the prerelease updater manifests and the latest stable release.
2. Set all version files listed in section 2 to the next `X.Y.Z-rc.N`. Verify that it is higher than the previous candidate and latest stable version. Do not publish a plain `X.Y.Z` to this channel.
3. Run `npm run check:versions`, commit the version change, and confirm existing CI passes for that candidate using the release checklist in [DEVELOPMENT.md](../DEVELOPMENT.md#release-preparation-and-validation).
4. Publish that validated source commit. The publishing run builds the packages; a separate non-publishing build is not required first. For a revised candidate, increment `N` before publishing again.

From your local machine (no GitHub Actions UI needed):

```bash
# commit and validate the next X.Y.Z-rc.N first, then:
git push origin HEAD:prerelease
```

The `Release Builds` workflow (`.github/workflows/release-build.yml`) triggers on a push to `prerelease`. After resource preflight, it calls the Windows, macOS (x64 and arm64), and Linux Debian reusable workflows. Result:
- assets/manifests are published under release tag `updater-prerelease`
- Authenticode signing runs automatically (same as a stable release)
- stale versioned assets for the same platform are pruned **after** publish (no pre-upload delete window)
- Linux publishes a `.deb`; the stable APT repository is unchanged

Note: you do not need to have a `prerelease` branch locally — the refspec `HEAD:prerelease` pushes your current commit directly to that remote branch without creating it locally.

#### Alternative: manual workflow dispatch
For building from a specific commit, run **Release Builds** manually from GitHub Actions with these inputs:
- `ref`: commit/branch to build
- `publish_release`: `true`
- `release_channel`: `prerelease`
- `release_tag`: leave empty
- `platform`: `all` (or select `windows`, `macos`, or `linux` for a partial build)

Launch the workflow from `main` or `prerelease` for Windows Authenticode signing. This workflow ref is separate from the `ref` input specifying the source to build. To validate resource configuration without building, use `platform=preflight-only`.

### 3.2 Configure test app to prerelease channel
In app:
- `Settings -> Advanced -> Update channel -> Prerelease`

Note:
- On prerelease channel, the app checks both `updater-prerelease` and stable (`latest`) and uses whichever version is ahead.

### 3.3 Validate behavior
On a machine with an older installed build:
- launch app (silent check runs)
- if user can update, Help menu should show `Update is available`
- click `Help -> Update is available` and install

If install path is not writable (school-managed user, NSIS install):
- startup shows no popup
- the updater menu is hidden after the startup installability check

For MSI or unknown installer detection on Windows:
- updater menu is hidden
- in-app self-update is disabled by design

Linux also hides the updater menu. Update Linux installations through APT or a newer `.deb` package.

## 4) Stable release flow

This is the default release path. No version-only PR, intermediate RC, dedicated release branch, or non-publishing platform build is required.

1. Prepare and merge application/dependency changes through normal PRs and complete the [release checklist](../DEVELOPMENT.md#before-releasing). Align every version file from section 2 to the final plain `X.Y.Z`, prepare release notes, and run `npm run check:versions`. Commit and push the version-only change directly to `main`. The bump may instead be included in the last maintenance/feature PR when practical; an extra PR solely for version metadata is unnecessary.
2. Wait for the `Test Suite` workflow on the intended `main` commit to pass, and verify that commit has the intended version. If the bump was included in a change PR, merge it after its checks pass before waiting for `main` CI. Avoid unrelated changes before tagging.
3. Push the matching stable tag as shown below. Creating the tag does not bump application versions. With `PUBLISH_GH_RELEASE=true`, the tag-triggered workflow builds, signs, and publishes all platforms.
4. Confirm the release workflow succeeds, including Linux APT deployment, and that the assets listed in section 5 are present. Publish the prepared notes and remove merged task branches and temporary release files.

If an RC was actually distributed, remove its `-rc.N` suffix in the version-only commit and follow the same steps. For example, `0.19.0-rc.2` becomes `0.19.0`. If the plain version was already distributed, follow the recovery guidance in section 2. Always select a version newer than the latest stable release and any distributed candidates.

Use optional non-publishing builds when explicitly requested or when packaging-related changes warrant them. The stable tag workflow rebuilds packages; it does not reuse candidate artifacts. Existing PR and `main` CI are sufficient before tagging an ordinary release, with packaging validated by the tag run. Investigate failures and retry affected jobs for the same source; do not move a published tag to changed code.

### Option A: tag push (default)

Prerequisite:
- `PUBLISH_GH_RELEASE=true`
- the intended release commit has passed the separate `Test Suite` workflow

Then push a version tag (example):

```bash
# On main at the intended commit whose Test Suite has passed:
git tag v0.19.0
git push origin v0.19.0
```

`Release Builds` runs all platforms and publishes to release tag `v0.19.0` in this example. Use an unused tag matching the version committed in section 2. Waiting for the intended commit's `Test Suite` to pass is a release-process prerequisite; the current tag workflow does not enforce that check automatically.

### Option B: manual stable publish (special cases)

Run **Release Builds** manually with:
- `ref`: commit/branch to build
- `publish_release`: `true`
- `release_channel`: `stable`
- `release_tag`: exact tag name (example `v0.19.0`)
- `platform`: `all`

Important:
- Do not use `main` as `release_tag` (that creates/updates a `main` release tag).
- Separate platform runs must use the same source commit and `release_tag`.
- Manual stable publishing does **not** enable Windows Authenticode under the current gate. Use the tag-push flow for a stable release with Authenticode-signed Windows installers.

## 5) What must exist in the published release

Windows updater manifests/assets:
- `latest-windows-x86_64-nsis.json`
- `latest-windows-x86_64-msi.json`
- `UnimozerNext_{version}_x64-setup.exe`
- `UnimozerNext_{version}_x64-setup.exe.sig`
- `UnimozerNext_{version}_x64-setup.msi`
- `UnimozerNext_{version}_x64-setup.msi.sig`

### Stable alias assets for website downloads

For the public install website, stable releases also publish fixed alias names:

- `UnimozerNext_latest_x64-setup.exe`
- `UnimozerNext_latest_x64-setup.exe.sig`
- `UnimozerNext_latest_x64-setup.msi`
- `UnimozerNext_latest_x64-setup.msi.sig`
- `UnimozerNext_latest_x64.dmg`
- `UnimozerNext_latest_arm64.dmg`

These aliases are intended for direct links via:

- `https://github.com/haan/UnimozerNext/releases/latest/download/<alias-name>`

Example:

- `https://github.com/haan/UnimozerNext/releases/latest/download/UnimozerNext_latest_x64-setup.exe`

Scope note:

- The website uses stable-channel links only.
- It does not consume prerelease (`updater-prerelease`) feeds.

macOS updater manifests/assets:
- `latest-darwin-x86_64.json`
- `latest-darwin-aarch64.json`
- `UnimozerNext_{version}_x64.app.tar.gz`
- `UnimozerNext_{version}_x64.app.tar.gz.sig`
- `UnimozerNext_{version}_arm64.app.tar.gz`
- `UnimozerNext_{version}_arm64.app.tar.gz.sig`
- `UnimozerNext_{version}_x64.dmg`
- `UnimozerNext_{version}_arm64.dmg`

Notes:
- `.dmg` is for normal user download/install.
- updater consumes signed updater artifacts/manifests, not dmg.
- macOS CI must build with `app` + `dmg` so updater `.app.tar.gz` artifacts exist.

Linux release assets:

- `UnimozerNext_{version}_amd64.deb`
- No Linux updater manifest or AppImage is published by the current release workflow.

Stable Linux releases also deploy the APT repository to the repository's GitHub Pages site under `/apt`. It contains `dists/stable/` metadata, the package under `pool/`, and the public signing key at `/apt/unimozer-next.gpg`. The workflow generates `InRelease` and `Release.gpg` signatures using `APT_GPG_PRIVATE_KEY`. Check the Linux job's Pages deployment as well as the GitHub release upload; the upload can succeed before APT deployment fails.

## 6) Installer kind detection on Windows

Current logic:
1. registry marker (`Software\com.unimozer.next\Installer`) written by MSI/NSIS installers
2. uninstall registry heuristic fallback
3. final fallback = `unknown` (self-update disabled)

If old installs predate marker support and heuristics cannot determine installer type, detection resolves to `unknown` and self-update remains disabled until a known installer marker is present.

## 7) Windows Authenticode signing in CI

Windows CI now supports Authenticode via Azure Trusted Signing.

Current behavior:
- Authenticode signing runs on tag push runs (`refs/tags/v*`).
- Authenticode also runs on any push to the `prerelease` branch.
- Authenticode also runs on `workflow_dispatch` only when all are true:
  - `publish_release=true`
  - `release_channel=prerelease`
  - run was launched from `refs/heads/main` or `refs/heads/prerelease`
- App `exe/dll` binaries are signed first, then installers are built (embedding the signed binary) and signed.
- After Authenticode, updater `.sig` files are regenerated for installer artifacts so Tauri updater manifests remain valid.
- Missing Azure credentials fail a signing-enabled run; the workflow does not fall back to unsigned installers.

Required workflow permissions:
- `id-token: write` (for Azure OIDC login)
- `contents: write` (release upload/publish)

Required GitHub secrets for Azure OIDC login:
- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`

Required GitHub secrets for Tauri updater signatures:
- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

Azure requirements:
- An Azure Trusted Signing account with a certificate profile configured for public signing.
- The GitHub OIDC service principal must have signer permissions on the certificate profile (Artifact Signing signer role).

## 8) Current endpoints used by app

- Stable:
  - `https://github.com/haan/UnimozerNext/releases/latest/download/latest-{{target}}.json`
- Prerelease:
  - `https://github.com/haan/UnimozerNext/releases/download/updater-prerelease/latest-{{target}}.json`

Targets currently resolved by backend:
- `windows-x86_64-nsis`, `windows-x86_64-msi`, or `windows-x86_64-unknown`
- `darwin-x86_64`
- `darwin-aarch64`
- `linux-x86_64` is resolved on Linux x64, but installability prevents network update checks and installs; there is no corresponding published manifest.

## 9) Quick troubleshooting

- Help never shows `Update is available`:
  - check app is on expected channel (stable/prerelease)
  - check remote version is higher than installed
  - check installability (managed machine may block self-update)
  - on Linux, Windows MSI/unknown installs, or non-writable installations, the updater menu is intentionally hidden

- Update check finds nothing:
  - verify release has correct `latest-<target>.json` files
  - verify JSON points to real asset URLs and signatures

- Signature/pk failure:
  - confirm `pubkey` in `src-tauri/tauri.conf.json` matches private key used in CI secrets

- Authenticode step skipped unexpectedly:
  - confirm run is either:
    - a tag push (`refs/tags/v*`), or
    - a push to the `prerelease` branch, or
    - a manual prerelease publish from `main`/`prerelease`
  - confirm Azure OIDC federation includes your tag and branch subjects/claims

- Updater signature mismatch after signed release:
  - confirm updater `.sig` files were regenerated after Authenticode in Windows workflow
