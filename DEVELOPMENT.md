# Development Guide

This document covers everything needed to go from a fresh clone to a running dev build of Unimozer Next, and to set up CI/CD on a fork.

## Prerequisites

- Node.js matching `.node-version` (the version used in CI)
- Rust toolchain (cargo)
- JDK 25 LTS (to build, test, and run Java bridge modules)
- Native build tools and webview dependencies for your platform: follow the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) (Windows C++ Build Tools and WebView2, macOS Xcode Command Line Tools, or Linux system packages).

Set `JAVA_HOME` to your JDK 25 installation. Both Java bridges use a Java 25
toolchain and produce JARs that require Java 25 or newer. The application already
bundles Java 25 for runtime use.

No separate Gradle installation is required. Each bridge includes a Gradle 9.8.0
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

## Release Workflow

### Release Process

`main` accumulates reviewed features and fixes between releases and should remain usable. The application version can stay at the previous release's version during development; individual feature PRs do not need a version bump.

1. **Develop:** Merge reviewed and tested feature/fix PRs into `main`.
2. **Choose the release scope:** Confirm the intended features are merged, identify remaining blockers, and decide what will wait for a later release.
3. **Review dependencies and tooling:** Complete [checklist A](#a-dependency-and-tooling-review). Make selected updates in maintenance PRs, test them, and merge them into `main`. Resolve release blockers before proceeding; a review does not require an upgrade in every area.
4. **Prepare the candidate:** Create a short-lived branch from `main`, for example `release/0.18.0`, and open a release-preparation PR. Freeze dependency changes, update the application version, and prepare release notes using [checklist B](#b-release-preparation-and-validation).
5. **Validate the candidate:** Complete the automated checks in checklist B and have the maintainer record the manual smoke-test result or mark it pending. Successful CI and candidate builds complete automated validation; stop there unless further testing is explicitly requested or a failure needs investigation. Pause unrelated code merges into `main` until the release is tagged. Fix problems and repeat only the affected checks. If a dependency change becomes necessary, revisit its checklist A item and validate the revised candidate.
6. **Merge and tag:** Merge the release-preparation PR once its checks pass. Verify the final commit on `main` using checklist B, then create and push the matching version tag. If the merge introduces changes beyond the tested candidate, validate them before tagging.
7. **Resume development:** Remove the merged preparation branch and continue work on `main` for the next release. The release tag identifies the exact released commit; do not move it to later work.

See [docs/updater.md](docs/updater.md) for version-file locations, prerelease publishing, tagging, and updater validation. The checklist is used throughout the process: A before the dependency freeze, B during preparation and final validation.

### Before Releasing

Record checklist outcomes and links to maintenance PRs in the release-preparation PR. For review items, record **checked—no update needed**, **updated and tested**, or **deferred with a reason and follow-up issue**. For validation items, record the result and any limitations; unresolved release blockers prevent tagging.

#### A. Dependency and Tooling Review

Complete this section in step 3, before preparing the release candidate. Cargo manages Rust libraries, called *crates*; Rust is the language/compiler toolchain. Gradle builds the Java bridges and manages their libraries. Dependabot supports these reviews, while bundled runtime downloads and toolchain selections require separate attention.

Review dependency status and known advisories using the listed tools and existing reports. A review does not require upgrading every dependency or performing a new security investigation. Record relevant findings, selected updates, and deliberate deferrals.

- [ ] **JavaScript/TypeScript dependencies (npm):** Run `npm outdated` and `npm audit`; review Dependabot alerts and PRs for `package.json` and `package-lock.json`, including development tools.
- [ ] **Java dependencies (Gradle):** Review available updates and security alerts for both `java-parser/build.gradle` and `jshell-bridge/build.gradle`. Confirm the `Java Dependency Graph` workflow has submitted current snapshots, including indirect dependencies.
- [ ] **Gradle build tool:** Review the pinned wrappers in both bridge directories. Keep their versions and distribution checksums aligned when updating.
- [ ] **Rust dependencies (Cargo crates):** Review updates for `src-tauri/Cargo.toml` and `src-tauri/Cargo.lock`, run `cargo audit` from `src-tauri/` (requires the separately installed `cargo-audit` tool), and revisit previously deferred advisories.
- [ ] **Build toolchains:** Review Node.js/npm (`.node-version` and `package.json` engines), the Java build JDK and bridge runtime requirement, and the Rust compiler/Cargo toolchain used locally and in CI.
- [ ] **Bundled runtime components:** Review Temurin JDK and Eclipse JDT Language Server releases. Check every platform's download URL and SHA-256 in Actions variables. Updating the build JDK does not update the JDK shipped with the app.
- [ ] **CI and platform tooling:** Review GitHub Actions versions, runner images, native build dependencies, and webview compatibility. Major upgrades are excluded by the current Dependabot configuration and need a separate review.

#### B. Release Preparation and Validation

Complete this section in steps 4–6, after the selected maintenance changes are merged.

**Validation scope:** Use the existing test suite and GitHub Actions workflows. Run each relevant check once; investigate failures and repeat only affected checks. Successful CI and candidate builds complete automated validation. Do not duplicate passing CI checks locally without a specific reason.

Manual desktop checks are performed by the maintainer and may be recorded as pending. Do not automatically download, unpack, install, or inspect generated packages, verify signatures separately, create additional validation scripts, or automate desktop testing. Do these only when explicitly requested or needed to investigate a specific failure. Do not turn optional checks into release blockers. Publishing a prerelease is a separate, explicitly requested action.

- [ ] **Version and release notes:** Align the application version across npm, Cargo, and Tauri files, including lockfiles; run `npm run check:versions`. Describe user-visible changes, compatibility changes, and known limitations in the release notes.
- [ ] **Automated tests:** Confirm existing CI passes for the candidate. Run local checks only where CI does not cover the change or when diagnosing a failure.
- [ ] **Candidate builds:** Confirm the existing release workflows build the intended platforms successfully with publishing disabled.
- [ ] **Maintainer smoke test:** Manually check the changed feature and basic project opening, saving, compiling, and running. Record the result or mark it pending; this is not an instruction for an agent to automate desktop testing.
- [ ] **Before tagging:** After merging the release-preparation PR, verify the intended commit and matching version on `main`. Reuse candidate validation results where applicable; repeat affected checks only if the merge introduces changes that require them. Documentation-only changes do not require rebuilding or retesting the application.

See [docs/updater.md](docs/updater.md) for the full release and update rollout procedure, including prerelease channel testing, stable release tagging, and troubleshooting updater issues.
