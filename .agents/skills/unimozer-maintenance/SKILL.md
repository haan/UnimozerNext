---
name: unimozer-maintenance
description: "Review Unimozer Next dependencies, security findings, toolchains, and bundled runtimes; apply compatible updates and prepare a draft PR. Use only when explicitly invoked, independently of bug fixes and releases."
---

# Unimozer maintenance

Perform the comprehensive maintenance review when the user explicitly invokes `$unimozer-maintenance`. A bug fix, a Dependabot question, or a release request alone does not invoke this workflow. Follow any narrower scope or additional authorization supplied by the user.

By default, review every area below, apply compatible patch/minor updates, and finish with a draft PR and its CI results. Keep the application version unchanged. Do not merge PRs (including Dependabot PRs), tag, publish, dismiss security alerts, or change live GitHub Actions variables as part of routine maintenance. Major upgrades and migrations require a separate decision, even when they fix a security advisory.

## Establish the scope

- Work from the Unimozer Next repository root. Inspect applicable repository instructions, the working tree, branch/base, existing maintenance work, and remotes before changing files. Preserve unrelated edits; use an isolated checkout when necessary. Create a maintenance branch from current `main`, or reuse the branch already assigned to this maintenance task. Do not overwrite another task's branch or force-push its history.
- Read current manifests, lockfiles, toolchain pins, both Java build files, `.github/dependabot.yml`, and the relevant CI workflows. Use [DEVELOPMENT.md](../../../DEVELOPMENT.md) for project commands, runtime layout, and configuration, and [testing.md](../../../docs/testing.md) for existing test coverage. Do not enter the release procedure.
- Inspect open Dependabot PRs and alerts, relevant issues, and recorded maintenance deferrals. Use the repository's actual owner/name with GitHub tools or `gh`. Reuse reviewed update work where applicable and identify superseded PRs in the report instead of silently duplicating, merging, or closing them.
- Obtain current update information from official registries, upstream releases, and advisory sources. Do not hardcode the versions or issue numbers from a previous review. Missing tooling, credentials, network access, or dependency snapshots must be reported as unavailable/blocked, not as a clean result. Continue independent checks that remain possible.

## Review all seven areas

### 1. npm dependencies

Run `npm outdated` and `npm audit` from the repository root. Review direct and transitive findings in `package.json` and `package-lock.json`, including development dependencies, overrides, and peer requirements. An outdated/audit command reporting findings is different from a command failing to perform its check.

Apply compatible patch/minor updates and update the lockfile consistently. Review changes beyond current manifest ranges before editing those ranges. Keep related tooling and Tauri npm/Rust components compatible; do not assume matching version numbers are required across every Tauri package. Do not use forceful audit fixes or bypass peer constraints to obtain a clean report.

### 2. Cargo crates

Review `src-tauri/Cargo.toml` and `src-tauri/Cargo.lock`, including transitive dependencies. Use `cargo outdated` when available. Otherwise combine a compatible-update dry run with official registry/release information to identify newer incompatible versions too; `cargo update --dry-run` alone is not a complete outdated-version review.

Run `cargo audit` from `src-tauri/` and revisit tracked advisories. If the separate audit/outdated tools are unavailable, use an available equivalent for version discovery or report the check's limitation; never treat an unperformed audit as passed. Select compatible updates with attention to minimum Rust versions, Tauri/plugin compatibility, and native platform dependencies. Keep advisory and unmaintained/yanked-package findings distinct.

### 3. Java dependencies

Review both `java-parser/build.gradle` and `jshell-bridge/build.gradle`, their resolved dependency reports, official releases, and security findings. Use the existing Gradle wrappers and dependency reports; do not add a dependency-update plugin merely to discover versions.

Inspect the existing `Java Dependency Graph` workflow results and whether current `main` snapshots were submitted for both bridges, including indirect dependencies. PR graph validation does not submit a new main snapshot. Record stale/unavailable snapshots and account for them when interpreting GitHub alerts. Keep shared library versions aligned where the projects require it and retain compatible Java bytecode/runtime requirements.

### 4. Gradle wrappers

Review both wrapper distributions, supporting wrapper files, and distribution SHA-256 values against official Gradle releases. Update both wrappers together using the supported wrapper mechanism and authoritative checksums. Preserve Windows and Unix launchers and executable permissions. Treat major Gradle upgrades or build migrations as separate decisions.

### 5. Build toolchains

Review `.node-version`, npm compatibility, `package.json` engines, `rust-toolchain.toml`, the Java toolchains in both bridges, and their CI setup. Apply compatible maintenance updates within the supported release lines; keep local and CI expectations consistent. Check dependency minimum compiler/runtime requirements before selecting versions. A newer Java feature release or Node major/LTS-line migration is not an automatic maintenance update.

Updating the JDK used to compile the bridges does not update the JDK shipped with the application.

### 6. Bundled runtimes

Review official Temurin releases within the supported Java line and Eclipse JDT LS releases. Read the existing GitHub Actions runtime variables listed in [updater.md](../../../docs/updater.md#14-ensure-required-actions-variables-exist), including every Windows, Linux, Intel macOS, and Apple Silicon JDK URL/checksum pair and the JDT LS pair.

Verify proposed archives match the intended version, operating system, architecture, and layout; obtain SHA-256 values from authoritative upstream sources. If upstream checksums are unavailable, download the proposed upstream archive to a task-specific temporary location to compute its checksum, and record the verification limitation. Do not invent a checksum or label an unreachable resource verified. Record source links and current/proposed variable values in the draft PR. Check JDT LS's Java requirements and identify any diagnostics/formatting smoke test needed.

Do not apply live variable changes without separate authorization: they affect builds outside the draft PR. Clearly mark these runtime changes as proposed, not applied or CI-validated against the new runtime. The normal CI/build workflow continues using current values until they are changed. Do not dispatch builds with old variables as evidence that a proposed runtime works. Do not download or inspect generated release packages as part of this review.

### 7. CI and platform tooling

Review action versions, runner selections, native build dependencies, and relevant webview compatibility using current workflows and upstream information. Dependabot covers only configured ecosystems and currently excludes major updates; its PR list is not the complete review. Apply compatible action/tooling updates where justified. Report runner migrations, platform support changes, and major action upgrades for a separate decision.

## Apply and validate

- Inspect compatibility and release notes before updating. Version labels alone do not establish safety, particularly for pre-1.0 libraries. Prefer coherent groups of related updates that can be assessed and reverted independently.
- Preserve the app's existing version in npm, Cargo, Tauri, lockfiles, and installer metadata. Update generated files only when the selected changes require them, and inspect their diff for unintended permission or behavior changes.
- Use existing PR CI for checks it covers. Consult the current workflow rather than maintaining a duplicate test matrix here. Run local checks for uncovered behavior, useful targeted feedback, or failure diagnosis; do not rerun every passing CI check locally. Confirm version consistency without bumping the version.
- Use targeted non-publishing packaging checks only when the changes warrant them, recording why and which platforms are affected. Do not dispatch a routine all-platform release build for every maintenance run. Never publish a candidate as a validation shortcut.
- Desktop smoke tests belong to the maintainer. Record the tested commit/scope and passed, failed, or pending status accurately. Do not attribute an earlier smoke test to later runtime/dependency changes or automate desktop testing by default.
- Fix failures caused by the updates and repeat only affected checks. If a particular update requires an out-of-scope migration, remove/defer that update and preserve the remaining validated work. Report unrelated failures and external blockers instead of claiming validation succeeded.
- Recheck affected security findings after applying fixes. Keep remaining findings visible; passing tests do not prove an advisory is unreachable, and deferral does not imply maintainer acceptance. Do not add ignore rules, disable checks, or dismiss alerts merely to obtain a green result.

## Draft PR and handoff

When tracked changes are ready, inspect the final diff, commit only task changes, push the maintenance branch, and open or update a draft PR against `main`. Invocation authorizes these steps without an additional routine confirmation. Monitor the existing CI on the final pushed commit; address update-related failures and report any unresolved checks. Keep the PR in draft and stop before merging.

Include a compact review table covering all seven areas: current and selected/proposed versions, status (`unchanged`, `updated`, `deferred`, or `blocked`), reasons, and source links. Under an area with mixed results, distinguish applied updates from deferred or unavailable items. Include:

- A user-relevant summary of changes and compatibility considerations.
- Validation results and CI links for the final commit, plus smoke-test scope/status and any coverage limitations.
- Remaining advisories and major/migration follow-ups, linking existing issues. Record new follow-up work in the PR without automatically creating separate issues or treating a deferral as risk acceptance.
- Any verified runtime variable proposals and the separate action required to apply them.

If no tracked changes are needed, return the same review report without an empty commit or PR. Include runtime-only proposals in that report. If checks or GitHub access are blocked, retain completed work and report exactly what remains; do not describe a PR as validated when required results are missing. Clean up only task-created temporary files after preserving the useful findings in the PR or final report.
