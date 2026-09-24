# Dependency review for 0.18.0

Reviewed on 2026-09-24. This maintenance change leaves the application version at
0.17.3; release versioning and Gradle Wrapper adoption are separate changes.

## Scope and method

- Updated npm dependencies within the existing declared version ranges and
  checked the resulting lockfile with `npm audit` and `npm outdated`.
- Updated Jackson Databind from 2.22.2 to 2.22.3 in both Java bridges. The resolved
  Jackson Core version is also 2.22.3. The [Jackson release notes](https://github.com/FasterXML/jackson/wiki/Jackson-Release-2.22.3)
  include security fixes in both modules.
- Queried the [OSV API](https://google.github.io/osv.dev/post-v1-querybatch/) for
  all 14 distinct resolved Maven module/version pairs from both bridges'
  runtime and test classpaths, including BOMs.
- Queried OSV for all 573 registry package/version entries in the final
  `src-tauri/Cargo.lock`, including dependencies for other platforms and build
  tools. OSV includes the [RustSec advisory database](https://google.github.io/osv.dev/data/).
  These are version-based checks, not a complete analysis of reachable code.

## Results and compatible fixes

The npm audit reports zero vulnerabilities. The resolved Maven dependency check
reports no matching advisories. The Rust check still reports the entries listed
below; it is not a clean Rust audit.

| Rust package | Before | After |
| --- | --- | --- |
| anyhow | 1.0.100 | 1.0.104 |
| rand (0.8 line) | 0.8.5 | 0.8.8 |
| rustls | 0.23.36 | 0.23.45 |
| rustls-webpki | 0.103.9 | 0.103.15 |
| serde_with | 3.16.1 | 3.23.0 |
| tar | 0.4.44 | 0.4.46 |
| quick-xml | 0.38.4 | 0.41.0 |

Updating `plist` to 1.10.0 and `wayland-scanner` to 0.31.11 allowed the XML fix
within existing parent dependency constraints. Cargo also updated supporting
dependencies as required; no direct Rust version requirements changed.

## Remaining Rust findings

- **glib 0.18.5:** [RUSTSEC-2024-0429](https://rustsec.org/advisories/RUSTSEC-2024-0429.html)
  / GHSA-wrw7-89jp-8q8g concerns unsound `VariantStrIter` iteration. This enters
  through Tauri's Linux GTK/WebKit dependencies. The advisory's fixed line starts
  at 0.20, outside the GTK 0.18 dependency requirements. Application source does
  not directly use this iterator, but reachability through upstream code has not
  been established. Follow up on the GTK/glib migration before release; this
  maintenance change does not resolve or suppress the finding.
- **rand 0.7.3:** [RUSTSEC-2026-0097](https://rustsec.org/advisories/RUSTSEC-2026-0097.html)
  / GHSA-cq8v-f236-94qc remains through `phf_generator 0.8 -> phf_codegen 0.8 ->
  selectors -> kuchikiki -> tauri-utils`. The advisory requires logging and a
  custom logger that re-enters the thread RNG. The resolved all-target feature
  tree does not enable `rand`'s `log` feature, so that prerequisite is absent.
  Reassess when this dependency chain or feature set changes.
- **Maintenance warnings:** `fxhash 0.2.1` (RUSTSEC-2025-0057),
  `proc-macro-error 1.0.4` (RUSTSEC-2024-0370), and `unic-char-range`,
  `unic-char-property`, `unic-common`, `unic-ucd-ident`, `unic-ucd-version` at
  0.9.0 (RUSTSEC-2025-0075, -0081, -0080, -0100, -0098 respectively).
  These are unmaintained-package notices in Tauri's selectors, GTK macros, and
  URL-pattern dependency chains, rather than seven additional vulnerability
  findings. Replacing them requires upstream dependency changes.

## Deferred upgrades

TypeScript 7, Vitest 5 (including its UI and coverage packages), and JUnit 6 are
left for separate migrations. Monaco is now an explicit dependency constrained
to `^0.55.1`: npm's implicit peer upgrade to 0.56.0 broke the Java tokenizer's
deep import in the production build. The existing DOMPurify override remains.

Local Java validation uses Gradle 8.14.4 with a temporary Temurin Java 17 build;
the system Java installation and repository Gradle setup are unchanged.
