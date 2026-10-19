# Development Guide

This document covers everything needed to go from a fresh clone to a running dev build of Unimozer Next, and to set up CI/CD on a fork.

## Prerequisites

- Node.js matching `.node-version` (the version used in CI)
- Rust installed through rustup (the version is pinned in `rust-toolchain.toml`)
- JDK 25 LTS (to build, test, and run Java bridge modules)
- Native build tools and webview dependencies for your platform: follow the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) (Windows C++ Build Tools and WebView2, macOS Xcode Command Line Tools, or Linux system packages).

Set `JAVA_HOME` to your JDK 25 installation. Both Java bridges use a Java 25
toolchain and produce JARs that require Java 25 or newer. The application already
bundles Java 25 for runtime use.

CI uses `.node-version` for Node.js and `rust-toolchain.toml` for Rust. Use the
same files for local development. Rustup selects and installs the pinned Rust
toolchain when you run Cargo in this repository; it does not change your global
default. Update these pins in maintenance PRs when adopting new toolchain versions.

No separate Gradle installation is required. Each bridge includes a Gradle 9.8.1
Wrapper, pinned with a distribution SHA-256 checksum. The first build downloads
Gradle; subsequent builds reuse its local cache. The `npm run build:parser`,
`npm run build:jshell`, and `npm run test:java` commands use these wrappers on all
platforms. For direct Gradle commands, use `./gradlew` inside the bridge directory
on Linux/macOS or `.\gradlew.bat` in PowerShell on Windows.

## External Resources (Required Runtime Payloads)

This repository tracks only resource folder skeletons (mainly JDK/JDTLS) but does **not** commit large runtime payloads.
The following are intentionally excluded in `.gitignore`:

- `/resources/jdk/**` (except tracked skeleton folders/files)
- `/resources/jdtls/**` (except tracked skeleton folders/files)
- `/resources/java-parser/*.jar`
- `/resources/jshell-bridge/*.jar`

Populate these before running `npm run tauri dev` or `npm run tauri:build`.

### 1) Verify tracked directory skeletons

Some JDK/JDTLS skeleton folders are tracked in git (`.gitkeep`). Create the target platform's directory if it is missing. On Windows, for example:

```powershell
Test-Path resources\jdk\win-x64
Test-Path resources\jdk\mac-x64
Test-Path resources\jdk\mac-arm64
Test-Path resources\jdtls
```

Create local bridge output folders if missing:

```powershell
New-Item -ItemType Directory -Force -Path resources\java-parser | Out-Null
New-Item -ItemType Directory -Force -Path resources\jshell-bridge | Out-Null
Test-Path resources\java-parser
Test-Path resources\jshell-bridge
```

### 2) Install bundled JDK files

The app bundles **Eclipse Temurin 25**. Release builds pin the archive URL and SHA-256 in GitHub Actions variables (listed below). Use the configured archive to reproduce a release build; those variables are the source of truth for the exact patch version.

For local setup without access to those variables, Java 25 JDK archives and checksums are available from the [Eclipse Temurin 25 releases](https://github.com/adoptium/temurin25-binaries/releases).

Extract the JDK home into the matching directory:

| Platform | Archive | JDK directory | Expected executable |
|---|---|---|---|
| Windows x64 | ZIP | `resources/jdk/win-x64` | `bin/java.exe` |
| Linux x64 | tar.gz | `resources/jdk/linux-x64` | `bin/java` |
| macOS x64 | tar.gz | `resources/jdk/mac-x64` | `bin/java` |
| macOS arm64 | tar.gz | `resources/jdk/mac-arm64` | `bin/java` |

On macOS, copy the archive's `Contents/Home/` contents into the target directory. On Linux and macOS, preserve executable permissions. Only the JDK for the platform being built is required locally.

For Windows development, extract the ZIP so these files exist:

- `resources/jdk/win-x64/bin/java.exe`
- `resources/jdk/win-x64/bin/javac.exe`

If the archive extracts as a nested top folder, move the folder **contents** into `resources/jdk/win-x64/` so `bin/` is directly under `win-x64`.

Verify:

```powershell
Test-Path resources\jdk\win-x64\bin\java.exe
Test-Path resources\jdk\win-x64\bin\javac.exe
```

### 3) Install bundled JDT LS files

The app bundles **Eclipse JDT Language Server**. Download the archive specified by `JDTLS_DIST_URL`, verify it against `JDTLS_DIST_SHA256`, and extract it so these paths exist:

- `resources/jdtls/plugins/`
- `resources/jdtls/features/`
- `resources/jdtls/<platform-config>/config.ini`

The platform configuration is `config_win` on Windows, `config_linux` on Linux, `config_mac` on macOS x64, and `config_mac_arm` on macOS arm64.

Distributions are available from the [JDT LS milestone archive](https://download.eclipse.org/jdtls/milestones/). Use the release's configured version when reproducing a build; changing JDT LS versions should include a diagnostics and formatting smoke test.

Verify:

```powershell
Test-Path resources\jdtls\plugins
Test-Path resources\jdtls\features
Test-Path resources\jdtls\config_win\config.ini
Get-ChildItem resources\jdtls\plugins\org.eclipse.equinox.launcher_*.jar
```

### 4) Build local Java bridge JARs

```bash
npm run build:parser
npm run build:jshell
```

Expected outputs:

- `resources/java-parser/parser-bridge.jar`
- `resources/jshell-bridge/jshell-bridge.jar`

Verify:

```powershell
Test-Path resources\java-parser\parser-bridge.jar
Test-Path resources\jshell-bridge\jshell-bridge.jar
```

## Getting Started

1. Install dependencies:

```bash
npm ci
```

2. Populate external resources (JDK, JDT LS, bridge JARs) using the section above.

3. Preflight checks:

```bash
npm run typecheck
npm run cargo:check
```

4. Launch in development mode:

```bash
npm run tauri dev
```

If resources are missing, common errors include:

- `Bundled Java compiler not found`
- `Bundled Java runtime not found`
- `JDT LS not found`

## Build and Packaging

- Frontend only: `npm run build`
- Desktop bundle (default Windows targets): `npm run tauri:build -- --config src-tauri/tauri.windows.conf.json`

Platform-specific builds:

- Windows (MSI + NSIS):
  - `npm run tauri:build -- --config src-tauri/tauri.windows.conf.json`
- macOS x64 DMG (run on macOS):
  - `npm run tauri:build -- --target x86_64-apple-darwin --bundles dmg --config src-tauri/tauri.macos.x64.conf.json`
- macOS arm64 DMG (run on macOS):
  - `npm run tauri:build -- --target aarch64-apple-darwin --bundles dmg --config src-tauri/tauri.macos.arm64.conf.json`
- Linux x64 Debian package (run on Linux): `npm run tauri:build:linux`
- Linux x64 AppImage (local build; not published by release CI): `npm run tauri:build:linux:appimage`

These npm packaging scripts pass `--no-sign` for local builds. Release CI builds signed artifacts using the platform configurations and signing setup below.

Release CI builds macOS arm64 on `macos-15` and macOS x64 on
`macos-15-intel`. Linux compilation and APT publishing use `ubuntu-24.04`.
Ubuntu 24.04 is the baseline for new Linux release packages; Ubuntu 22.04
compatibility is no longer targeted. Other distributions need compatible system
libraries. The Linux workflow installs Ubuntu 24.04's `libfuse2t64` package.

## Logo Runtime Assets

The About dialog depth-parallax uses preprocessed runtime files generated from source logo assets.

- Source files:
  - `public/icon/icon.png`
  - `public/icon/icon_depthmap.png`
- Generated runtime files (committed):
  - `public/icon/icon_runtime.png`
  - `public/icon/icon_depthmap_runtime.png`

Regenerate after changing either source file:

```bash
npm run assets:logo-runtime
```

## Testing

See [docs/testing.md](docs/testing.md) for the full testing infrastructure overview.

Install the Playwright browser once, then run the complete test suite (including Java bridge tests):

```bash
npx playwright install chromium
npm run test:all
```

---

## GitHub Actions CI/CD Setup

This section applies when setting up CI/CD on a fork or new instance.

### Dependabot

Enable **Dependabot alerts** and **Dependabot security updates** in repository
security settings. These settings are separate from `.github/dependabot.yml`,
which schedules monthly version-update PRs for npm, Cargo, GitHub Actions, and
both Gradle bridges. The current configuration groups patch/minor updates and
ignores major-version updates.

The `Java Dependency Graph` workflow submits both bridges' resolved dependencies
on pushes to `main`, including indirect dependencies needed for Java vulnerability
alerts. It can also be run manually on `main`. Pull requests only validate graph
generation. See [testing](docs/testing.md#ci-integration) for workflow details.

Bundled JDK/JDT LS downloads and toolchain selections still require separate
maintenance; they are not updated by this Dependabot configuration.

### Required Actions Variables

Set these under **Repository Settings → Secrets and variables → Actions → Variables**:

| Variable | Description |
|---|---|
| `TEMURIN_WIN_X64_ZIP_URL` | Download URL for Windows x64 JDK ZIP (Eclipse Temurin) |
| `TEMURIN_WIN_X64_SHA256` | SHA256 of the Windows JDK ZIP |
| `TEMURIN_LINUX_X64_TAR_GZ_URL` | Download URL for Linux x64 JDK tar.gz |
| `TEMURIN_LINUX_X64_SHA256` | SHA256 of the Linux x64 JDK tar.gz |
| `TEMURIN_MAC_X64_TAR_GZ_URL` | Download URL for macOS x64 JDK tar.gz |
| `TEMURIN_MAC_X64_SHA256` | SHA256 of the macOS x64 JDK tar.gz |
| `TEMURIN_MAC_ARM64_TAR_GZ_URL` | Download URL for macOS arm64 JDK tar.gz |
| `TEMURIN_MAC_ARM64_SHA256` | SHA256 of the macOS arm64 JDK tar.gz |
| `JDTLS_DIST_URL` | Download URL for Eclipse JDT LS `.tar.gz` |
| `JDTLS_DIST_SHA256` | SHA256 of the JDT LS archive |
| `PUBLISH_GH_RELEASE` | Required `true` or `false`; controls automatic publishing on version-tag pushes |

Read the configured values in repository settings or with `gh variable list`. Set URLs to specific release archives and SHA-256 values to their verified checksums. The `Release Builds` preflight validates all platform URLs and checksum formats, even for a single-platform build; each platform job verifies downloaded archive contents against the checksum.

### Tauri Updater Signing

The Tauri updater requires a signing key pair so installed apps can verify update authenticity.

**One-time setup (run on a secure machine):**

```bash
npx tauri signer generate -w ./tauri-updater.key
```

This prints a public key and writes the private key to `tauri-updater.key`.

> Keep the private key permanently. If you rotate keys, already-installed apps will reject new updates and users must reinstall manually.

1. Copy the printed public key into `src-tauri/tauri.conf.json`:
   - Set `plugins.updater.pubkey` to your public key. The upstream repository already has its release public key configured.
   - Commit this change.

2. Add to **Repository Settings → Secrets and variables → Actions → Secrets**:
   - `TAURI_SIGNING_PRIVATE_KEY` — full contents of `tauri-updater.key`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — key password (or empty string if unencrypted)

### Windows Authenticode Signing (Azure Trusted Signing)

Authenticode signing runs automatically in CI on tag pushes and `prerelease` branch pushes. It requires Azure Trusted Signing and GitHub OIDC.

Add these to **Actions → Secrets**:

| Secret | Description |
|---|---|
| `AZURE_CLIENT_ID` | Azure app registration client ID (OIDC) |
| `AZURE_TENANT_ID` | Azure tenant ID |
| `AZURE_SUBSCRIPTION_ID` | Azure subscription ID |

Azure requirements:
- An Azure Trusted Signing account with a certificate profile configured for public signing.
- The GitHub OIDC service principal must have the **Artifact Signing signer** role on the certificate profile.

The signing gate depends on the triggering event, not on whether secrets exist. Runs requiring Authenticode fail if Azure credentials are missing; there is no unsigned fallback. For a fork, also adapt the hardcoded Azure endpoint, account, and certificate profile in `.github/workflows/windows-release-build.yml`. See [the release guide](docs/updater.md#7-windows-authenticode-signing-in-ci) for manual-dispatch signing conditions.

### macOS Signing and Notarization

The macOS release workflow requires these Actions secrets, including for manual builds that do not publish:

| Secret | Description |
|---|---|
| `APPLE_CERTIFICATE` | Base64-encoded Developer ID Application `.p12` certificate |
| `APPLE_CERTIFICATE_PASSWORD` | Certificate password |
| `APPLE_KEYCHAIN_PASSWORD` | Password for the temporary CI keychain |
| `APPLE_API_KEY` | App Store Connect API key ID |
| `APPLE_API_KEY_P8` | Full `.p8` private key contents |
| `APPLE_API_ISSUER` | API issuer ID |

### Linux APT Publishing

Stable Linux publishing also deploys a signed APT repository to GitHub Pages. Set `APT_GPG_PRIVATE_KEY` and, for an encrypted key, `APT_GPG_PASSPHRASE` in Actions secrets. Configure Pages to deploy with **GitHub Actions**, and allow the release ref in the `github-pages` environment. The workflow requires `pages: write` and `id-token: write` in addition to release upload permissions. Prereleases publish the `.deb` asset without updating APT.

Only the stable APT publishing job requests the protected `github-pages` environment. Non-publishing builds on maintenance branches build and upload their Debian artifact without requesting deployment access.

## Dependency Maintenance

Invoke `$unimozer-maintenance` for a comprehensive dependency and tooling review. The repository-local [maintenance skill](.agents/skills/unimozer-maintenance/SKILL.md) covers npm, Cargo, Java dependencies, Gradle, build toolchains, bundled runtimes, and CI/platform tooling. It runs only when explicitly invoked; bug fixes, Dependabot questions, and release requests do not automatically trigger it.

The skill reviews every area, applies compatible patch/minor updates, and reports major upgrades or migrations for a separate decision. It prepares changes on a maintenance branch, opens or updates a draft PR, and checks CI results. It leaves the application version unchanged and stops before merging or publishing. Proposed changes to shared runtime download URLs/checksums are recorded for review without changing live GitHub Actions variables. If no tracked changes are needed, it returns a review report without creating an empty PR.

General maintenance is independent of releasing. A tested bug fix can be released without running this skill first.

## Release Workflow

### Release Process

`main` accumulates reviewed features and fixes between releases and should remain usable. The application version can stay at the previous release's version during development; individual feature PRs do not need a version bump.

The default stable release is **merge changes and the final version bump -> passing CI on `main` -> push the matching tag -> build, sign, and publish**. An intermediate RC version, separate release branch, and preliminary packaging run are not required.

1. **Develop:** Prepare reviewed and tested feature/fix PRs and merge them into `main`.
2. **Choose the release scope:** Confirm the intended changes, identify remaining blockers, and decide what will wait for a later release.
3. **Review known blockers:** Review known unresolved release blockers using existing findings and decisions. Resolve them or record explicit maintainer acceptance before proceeding. This does not initiate new outdated-version checks, security scans, or dependency updates; comprehensive maintenance is a separate task.
4. **Prepare the stable version:** Freeze the selected release scope, set all application version files to the intended plain `X.Y.Z`, and prepare release notes using the [release checklist](#release-preparation-and-validation). Include this in the last maintenance/feature PR when practical. If the changes are already merged, use a small PR with the version bump and release notes. Run `npm run check:versions`. Creating a tag does not change the application's version.
5. **Merge and validate:** Merge the final PR once its checks pass, then wait for the existing `Test Suite` workflow on the intended `main` commit to pass. Record the maintainer's smoke-test result or mark it pending. Reuse passing checks; do not repeat them locally or dispatch preliminary platform builds by default. Avoid unrelated merges between selecting the release commit and tagging it.
6. **Tag and publish:** Verify the intended commit and matching version on `main`, then push the matching `vX.Y.Z` tag with `PUBLISH_GH_RELEASE=true`. The tag-triggered `Release Builds` workflow builds, signs, and publishes all platforms once. Confirm the workflow succeeds, including Linux APT deployment, and record the release notes and outcome. Investigate failures and rerun only affected jobs for the same source; do not move a published tag to changed code.
7. **Resume development:** Remove merged task branches and temporary release files, then continue work on `main`. The release tag identifies the exact released commit.

#### Optional prerelease testing and packaging checks

Use the prerelease channel when the maintainer explicitly requests testing a distributed candidate before stable publication. **Only `X.Y.Z-rc.N` application versions may be published to that channel**, starting at `rc.1` and incrementing for changed published candidates. Plain `X.Y.Z` versions are reserved for stable publication. Follow the [candidate version policy](docs/updater.md#candidate-version-policy), including the version-ordering checks; the GitHub prerelease flag alone does not make an application version a release candidate.

For example, `0.19.0-rc.1` -> `0.19.0-rc.2` -> `0.19.0` lets testers update to stable. When ready, remove the suffix in a PR and follow the normal merge, CI, and tag steps above. A dedicated release branch is optional for coordinating this testing.

Non-publishing platform builds are also optional. Use them when explicitly requested or when installer, signing, bundled-runtime, or packaging changes warrant a pre-release build check. They do not promote artifacts into the stable release: the tag run builds again. For an ordinary release, accept that packaging failures may first be found in the tag-triggered run. Publishing a requested prerelease likewise builds its packages; it does not require a separate non-publishing build first.

See [docs/updater.md](docs/updater.md) for version-file locations, channel rules, tagging, and updater validation. Use the release checklist below during preparation and publication.

### Before Releasing

Record checklist outcomes and links to relevant PRs in the PR carrying the final version bump; a separate release-preparation PR is not required. Reuse existing validation and known-issue decisions. Record results and limitations, and mark optional checks not performed as **not requested**. A maintenance review is not a release prerequisite. Known release blockers require resolution or explicit maintainer acceptance before tagging; merely deferring an issue does not establish acceptance.

#### Release Preparation and Validation

Complete this section in steps 4–6, from the final version PR through publication.

**Validation scope:** Use the existing PR and `main` CI runs, then the tag-triggered release build. PR tests validate proposed changes; `main` tests validate the integrated release commit. These automatic runs remain part of normal CI. Do not add manual reruns, duplicate passing checks locally, or require non-publishing platform builds for an ordinary stable release. Investigate failures and repeat only affected checks. Documentation-only changes do not require an additional application build or local test run.

Manual desktop checks are performed by the maintainer and may be recorded as pending. Do not automatically download, unpack, install, or inspect generated packages, verify signatures separately, create additional validation scripts, or automate desktop testing. Do these only when explicitly requested or needed to investigate a specific failure. Do not turn optional checks into release blockers. Publishing a prerelease is a separate, explicitly requested action.

- [ ] **Version and release notes:** Align the application version across npm, Cargo, and Tauri files, including lockfiles; run `npm run check:versions`. Describe user-visible changes, compatibility changes, and known limitations in the release notes.
- [ ] **Known blockers:** Review known unresolved release blockers using existing findings and decisions. Record resolutions or explicit maintainer acceptance. Do not start a fresh dependency/tooling review or upgrade work as part of this check.
- [ ] **Automated tests:** Confirm the final PR checks and the `Test Suite` on the intended `main` commit pass. Run local checks only where CI does not cover the change or when diagnosing a failure.
- [ ] **Optional prerelease publication:** Only when requested, require `X.Y.Z-rc.N` and verify it is higher than the previous published candidate and latest stable version. Increment `N` for changed code; never publish the reserved plain stable version to the prerelease channel. `check:versions` checks alignment only, so record this ordering check separately. See the [recovery guidance](docs/updater.md#candidate-version-policy) if a plain version has already been distributed.
- [ ] **Optional non-publishing builds:** Record the reason and results if preliminary packaging validation was requested or warranted by packaging changes. Otherwise mark not requested; this is not a default release gate.
- [ ] **Maintainer smoke test:** Manually check the changed feature and basic project opening, saving, compiling, and running. Record the result or mark it pending; this is not an instruction for an agent to automate desktop testing.
- [ ] **Before tagging:** Verify the intended commit on `main` has passed CI, the application has the intended plain stable version, the matching tag is unused, and `PUBLISH_GH_RELEASE=true`. Check that the version is newer than the latest stable release; if prereleases were distributed, ensure it is newer than those too.
- [ ] **Publication:** Confirm the tag-triggered release workflow succeeds on every platform, the expected release assets are present, and Linux APT deployment succeeds. Publish the prepared release notes and clean up merged branches and task-created temporary files.

See [docs/updater.md](docs/updater.md) for the full release and update rollout procedure, including prerelease channel testing, stable release tagging, and troubleshooting updater issues.
