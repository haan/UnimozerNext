# Auto-Update Rollout Procedure (Tauri v2)

This is the exact procedure for the current Unimozer Next updater setup.

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
Edit `src-tauri/tauri.conf.json`:
- Replace:
  - `plugins.updater.pubkey = "REPLACE_WITH_UPDATER_PUBLIC_KEY"`
- With:
  - your real public key from step 1.1.

Commit this change.

### 1.3 Add GitHub Actions secrets
Repository Settings -> Secrets and variables -> Actions -> Secrets:
- `TAURI_SIGNING_PRIVATE_KEY` = full private key contents
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` = password (if your key is encrypted; otherwise can be empty string)

### 1.4 Ensure required Actions variables exist
Repository Settings -> Secrets and variables -> Actions -> Variables:
- `TEMURIN_WIN_X64_ZIP_URL`
- `TEMURIN_WIN_X64_SHA256`
- `TEMURIN_MAC_X64_TAR_GZ_URL`
- `TEMURIN_MAC_X64_SHA256`
- `TEMURIN_MAC_ARM64_TAR_GZ_URL`
- `TEMURIN_MAC_ARM64_SHA256`
- `JDTLS_DIST_URL`
- `JDTLS_DIST_SHA256`
- `PUBLISH_GH_RELEASE` (`true` for auto publish on tag push)

## 2) Version rule before every updater test/release

Updater only installs if remote version is higher than installed version.

Before each test/release:
- bump `version` in `src-tauri/Cargo.toml`
- keep `src-tauri/tauri.conf.json` version aligned (currently both are used in project release flow)

## 3) Prerelease channel testing (recommended)

This publishes to the moving GitHub release tag: `updater-prerelease`.

### 3.1 Build and publish prerelease assets
Run both workflows manually from GitHub Actions:

1. `Windows Release Build`
2. `macOS Release Build`

Use these `workflow_dispatch` inputs:
- `ref`: commit/branch to build
- `publish_release`: `true`
- `release_channel`: `prerelease`
- `release_tag`: leave empty

Result:
- assets/manifests are published under release tag `updater-prerelease`
- rerunning overwrites that prerelease feed for next test cycle
- stale versioned assets for the same platform are pruned **after** publish (no pre-upload delete window)

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
- Help stays `Check for updates...`
- manual check shows blocked message

For MSI or unknown installer detection on Windows:
- updater menu is hidden
- in-app self-update is disabled by design

## 4) Stable release flow

## Option A: tag push (automatic)

Prerequisite:
- `PUBLISH_GH_RELEASE=true`

Then push a version tag (example):

```bash
git tag v0.10.10
git push origin v0.10.10
```

Both workflows run and publish to release tag `v0.10.10`.

## Option B: manual stable publish

Run both workflows manually with:
- `ref`: commit/branch to build
- `publish_release`: `true`
- `release_channel`: `stable`
- `release_tag`: exact tag name (example `v0.10.10`)

Important:
- Do not use `main` as `release_tag` (that creates/updates a `main` release tag).
- Windows and macOS runs must use the same `release_tag`.

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

## 6) Installer kind detection on Windows

Current logic:
1. registry marker (`Software\com.unimozer.next\Installer`) written by MSI/NSIS installers
2. uninstall registry heuristic fallback
3. final fallback = `unknown` (self-update disabled)

If old installs predate marker support and heuristics cannot determine installer type, detection resolves to `unknown` and self-update remains disabled until a known installer marker is present.

## 7) Current endpoints used by app

- Stable:
  - `https://github.com/haan/UnimozerNext/releases/latest/download/latest-{{target}}.json`
- Prerelease:
  - `https://github.com/haan/UnimozerNext/releases/download/updater-prerelease/latest-{{target}}.json`

Targets currently resolved by backend:
- `windows-x86_64-nsis`, `windows-x86_64-msi`, or `windows-x86_64-unknown`
- `darwin-x86_64`
- `darwin-aarch64`

## 8) Quick troubleshooting

- Help never shows `Update is available`:
  - check app is on expected channel (stable/prerelease)
  - check remote version is higher than installed
  - check installability (managed machine may block self-update)
  - on Windows MSI/unknown installs, updater menu is intentionally hidden

- Update check finds nothing:
  - verify release has correct `latest-<target>.json` files
  - verify JSON points to real asset URLs and signatures

- Signature/pk failure:
  - confirm `pubkey` in `src-tauri/tauri.conf.json` matches private key used in CI secrets
