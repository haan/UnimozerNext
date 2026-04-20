# Development Guide

This document covers everything needed to go from a fresh clone to a running dev build of Unimozer Next, and to set up CI/CD on a fork.

## Prerequisites

- Node.js 22+ (22 is the tested version in CI)
- Rust toolchain (cargo)
- JDK 17+ (to build Java bridge modules)
- Gradle (required for `java-parser` and `jshell-bridge` module builds)

## External Resources (Required Runtime Payloads)

This repository tracks only resource folder skeletons (mainly JDK/JDTLS) but does **not** commit large runtime payloads.
The following are intentionally excluded in `.gitignore`:

- `/resources/jdk/**` (except tracked skeleton folders/files)
- `/resources/jdtls/**` (except tracked skeleton folders/files)
- `/resources/java-parser/*.jar`
- `/resources/jshell-bridge/*.jar`

Populate these before running `npm run tauri dev` or `npm run tauri:build`.

### 1) Verify tracked directory skeletons

JDK/JDTLS skeleton folders are tracked in git (`.gitkeep`). Verify they exist:

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

The app bundles **Eclipse Temurin 25** (current pinned version: `25.0.2+10`). Download the ZIP for your target platform from the [Eclipse Temurin releases](https://github.com/adoptium/temurin25-binaries/releases) and extract it into the matching `resources/jdk/` subfolder.

Currently pinned downloads (check GitHub Actions variables for updates):

- **Windows x64**: `OpenJDK25U-jdk_x64_windows_hotspot_25.0.2_10.zip`
- **macOS x64**: `OpenJDK25U-jdk_x64_mac_hotspot_25.0.2_10.tar.gz`
- **macOS arm64**: `OpenJDK25U-jdk_aarch64_mac_hotspot_25.0.2_10.tar.gz`

For Windows development, extract the ZIP so these files exist:

- `resources/jdk/win-x64/bin/java.exe`
- `resources/jdk/win-x64/bin/javac.exe`

If the archive extracts as a nested top folder (e.g. `jdk-25.0.2+10/...`), move the folder **contents** into `resources/jdk/win-x64/` so `bin/` is directly under `win-x64`.

Verify:

```powershell
Test-Path resources\jdk\win-x64\bin\java.exe
Test-Path resources\jdk\win-x64\bin\javac.exe
```

### 3) Install bundled JDT LS files

The app bundles **Eclipse JDT Language Server** (current pinned version: `1.56.0-202601291528`). Download the `.tar.gz` from the [Eclipse JDT LS milestone releases](https://download.eclipse.org/jdtls/milestones/) and extract it so these paths exist:

- `resources/jdtls/plugins/`
- `resources/jdtls/features/`
- `resources/jdtls/config_win/config.ini`

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
npm install
```

2. Populate external resources (JDK, JDT LS, bridge JARs) using the section above.

3. Build Java bridge JARs:

```bash
npm run build:parser
npm run build:jshell
```

4. Preflight checks:

```bash
npm run typecheck
npm run cargo:check
```

5. Launch in development mode:

```bash
npm run tauri dev
```

If resources are missing, common errors include:

- `Bundled Java compiler not found`
- `Bundled Java runtime not found`
- `JDT LS not found`

## Build and Packaging

- Frontend only: `npm run build`
- Desktop bundle (default Windows targets): `npm run tauri:build`

Platform-specific builds:

- Windows (MSI + NSIS):
  - `npx tauri build --config src-tauri/tauri.windows.conf.json`
- macOS x64 DMG (run on macOS):
  - `npx tauri build --target x86_64-apple-darwin --bundles dmg --config src-tauri/tauri.macos.x64.conf.json`
- macOS arm64 DMG (run on macOS):
  - `npx tauri build --target aarch64-apple-darwin --bundles dmg --config src-tauri/tauri.macos.arm64.conf.json`

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

Run the complete test suite:

```bash
npm run test:all
```

---

## GitHub Actions CI/CD Setup

This section applies when setting up CI/CD on a fork or new instance.

### Required Actions Variables

Set these under **Repository Settings → Secrets and variables → Actions → Variables**:

| Variable | Description |
|---|---|
| `TEMURIN_WIN_X64_ZIP_URL` | Download URL for Windows x64 JDK ZIP (Eclipse Temurin) |
| `TEMURIN_WIN_X64_SHA256` | SHA256 of the Windows JDK ZIP |
| `TEMURIN_MAC_X64_TAR_GZ_URL` | Download URL for macOS x64 JDK tar.gz |
| `TEMURIN_MAC_X64_SHA256` | SHA256 of the macOS x64 JDK tar.gz |
| `TEMURIN_MAC_ARM64_TAR_GZ_URL` | Download URL for macOS arm64 JDK tar.gz |
| `TEMURIN_MAC_ARM64_SHA256` | SHA256 of the macOS arm64 JDK tar.gz |
| `JDTLS_DIST_URL` | Download URL for Eclipse JDT LS `.tar.gz` |
| `JDTLS_DIST_SHA256` | SHA256 of the JDT LS archive |
| `PUBLISH_GH_RELEASE` | Set to `true` to auto-publish GitHub releases on tag push |

Current pinned values (as of the last update to this document):

| Variable | Value |
|---|---|
| `TEMURIN_WIN_X64_ZIP_URL` | `https://github.com/adoptium/temurin25-binaries/releases/download/jdk-25.0.2%2B10/OpenJDK25U-jdk_x64_windows_hotspot_25.0.2_10.zip` |
| `TEMURIN_WIN_X64_SHA256` | `06ac5f5444a1269dd11d11cbb7ab6ebaecedc60dc1caca82cdb56f29100b7b8c` |
| `TEMURIN_MAC_X64_TAR_GZ_URL` | `https://github.com/adoptium/temurin25-binaries/releases/download/jdk-25.0.2%2B10/OpenJDK25U-jdk_x64_mac_hotspot_25.0.2_10.tar.gz` |
| `TEMURIN_MAC_X64_SHA256` | `7caddeb2d1d06a21487fdf55198349f122ba7b24bfc613b8923a42a133a92dc5` |
| `TEMURIN_MAC_ARM64_TAR_GZ_URL` | `https://github.com/adoptium/temurin25-binaries/releases/download/jdk-25.0.2%2B10/OpenJDK25U-jdk_aarch64_mac_hotspot_25.0.2_10.tar.gz` |
| `TEMURIN_MAC_ARM64_SHA256` | `74ff6e892924a49767c35eb61251b1969c03213819d51065d9b8f9e0238c4f97` |
| `JDTLS_DIST_URL` | `https://download.eclipse.org/jdtls/milestones/1.56.0/jdt-language-server-1.56.0-202601291528.tar.gz` |
| `JDTLS_DIST_SHA256` | `988492f1a4350be52aafbe538dc04f5c4dae08ad0e1f2aa35317622ed2dbe3c6` |

### Tauri Updater Signing

The Tauri updater requires a signing key pair so installed apps can verify update authenticity.

**One-time setup (run on a secure machine):**

```bash
npx tauri signer generate -w ./tauri-updater.key
```

This prints a public key and writes the private key to `tauri-updater.key`.

> Keep the private key permanently. If you rotate keys, already-installed apps will reject new updates and users must reinstall manually.

1. Copy the printed public key into `src-tauri/tauri.conf.json`:
   - Replace `plugins.updater.pubkey = "REPLACE_WITH_UPDATER_PUBLIC_KEY"` with your public key.
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

Authenticode signing is optional for local/fork builds — the workflow falls back to unsigned installers if the secrets are not present.

## Release Workflow

See [docs/updater.md](docs/updater.md) for the full release and update rollout procedure, including prerelease channel testing, stable release tagging, and troubleshooting updater issues.
