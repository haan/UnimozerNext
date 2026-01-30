# Unimozer Next — Codex Spec: Embed JDT LS from day one + Errors-only inline diagnostics + Autoformat

## 0) Goal (narrow scope)
Implement a “light” Eclipse JDT Language Server (JDT LS) integration that is **embedded/bundled** with the app from the start and provides ONLY:

1) **Errors-only inline feedback in Monaco**
   - red squiggles
   - gutter error icon (glyph margin)
   - hover message
   - no Problems panel
   - ignore warnings/info/hints (e.g., unused variable)

2) **Autoformat**
   - format on save (whole file formatting using LS)

Non-goals:
- completion, hover documentation, go-to-definition, references, rename, quick fixes UI, code actions UI, semantic tokens

---

## 1) Requirements & constraints

### 1.1 Runtime requirements
- JDT LS requires **Java 21+** to run. We will bundle a JDK 21+ with the app and always use it to launch JDT LS. :contentReference[oaicite:1]{index=1}

### 1.2 Embedded/bundled from day one
- No external install for users.
- JDT LS is shipped inside the app as a resource folder (not a single executable).
- We’ll run it via a `java -jar plugins/org.eclipse.equinox.launcher_*.jar -configuration ... -data ...` style invocation. :contentReference[oaicite:2]{index=2}

### 1.3 Workspace “-data” must be unique per project
- JDT LS stores workspace state under `-data`, so it must be a per-project folder under app data. :contentReference[oaicite:3]{index=3}

### 1.4 Configuration directory must be writable
- JDT LS docs suggest pointing `-configuration` to a user folder to avoid touching the shipped `config_*` directories. We will copy the correct `config_<os>` to a writable location in app data on first run per machine/version, and point `-configuration` there. :contentReference[oaicite:4]{index=4}

---

## 2) Repo layout & bundled resources

### 2.1 Place resources in `src-tauri/resources/`
We will check-in or CI-download and place:

src-tauri/resources/
jdtls/
plugins/
config_win/
config_linux/
config_mac/ (optional if you plan macOS)
jdk/
win/...
linux/...
mac/... (optional)

markdown
Copy code

Notes:
- The Equinox launcher jar lives in `jdtls/plugins/` and has a versioned filename; do not hardcode it.
- Bundled JDK path differs by OS; define a helper to locate the `java` executable.

### 2.2 Tauri v2 config: bundle resources
In `src-tauri/tauri.conf.json`, include resources (folder or glob). Tauri v2 supports `bundle.resources`. :contentReference[oaicite:5]{index=5}

Example intent (exact syntax may vary by your config file format):
- include `resources/jdtls/**`
- include `resources/jdk/**`

---

## 3) Backend architecture (Tauri/Rust)

### 3.1 Modules (recommended)
Create:

- `src-tauri/src/ls/mod.rs` — LS manager + public Tauri commands
- `src-tauri/src/ls/jsonrpc.rs` — JSON-RPC framing (Content-Length) read/write over stdio
- `src-tauri/src/ls/jdtls.rs` — locate embedded JDTLS + build command args + spawn process
- `src-tauri/src/ls/uri.rs` — OS path <-> file URI helpers

### 3.2 Resource path resolution
At runtime:
- Use Tauri resource APIs to get the absolute path of the bundled `resources/jdtls` and `resources/jdk/...`.
- Never assume working directory.

### 3.3 Writable directories
Use Tauri app data directory for:
- `jdtls-config/<version>/<os>/` (copied config)
- `jdtls-workspaces/<hash(projectRoot)>/` (LS `-data` directory)
- `logs/jdtls/<hash(projectRoot)>.log` (optional)

### 3.4 Copy JDT LS config to app data
Implement:

- `ensure_writable_config(osConfigName: config_win|config_linux|config_mac) -> PathBuf`
  - source: bundled `resources/jdtls/config_<os>`
  - dest: `<app_data>/jdtls-config/<jdtlsBuildId>/<config_<os>>`
  - copy recursively if dest missing
  - return dest path

(We keep it versioned by `<jdtlsBuildId>` so an update doesn’t reuse old caches.)

### 3.5 Locate Equinox launcher jar
Implement:
- scan `resources/jdtls/plugins/` for `org.eclipse.equinox.launcher_*.jar`
- if multiple matches, pick the one with the highest version lexicographically (or newest modified time)

JDT LS docs explicitly say the jar name must match what’s shipped and varies by version. :contentReference[oaicite:6]{index=6}

### 3.6 Launch command
Spawn using bundled `java`:

JDT LS “running from command line” base is: :contentReference[oaicite:7]{index=7}

- `-Declipse.application=org.eclipse.jdt.ls.core.id1`
- `-Dosgi.bundles.defaultStartLevel=4`
- `-Declipse.product=org.eclipse.jdt.ls.core.product`
- `-Dlog.level=ALL` (may reduce later)
- `-Xmx1G` (tune later)
- `--add-modules=ALL-SYSTEM`
- `--add-opens java.base/java.util=ALL-UNNAMED`
- `--add-opens java.base/java.lang=ALL-UNNAMED`
- `-jar <equinox_launcher_jar>`
- `-configuration <writable_config_dir>`
- `-data <project_workspace_data_dir>`

Transport:
- Use stdio by default (do NOT set socket env vars). JDT LS supports stdio fallback. :contentReference[oaicite:8]{index=8}

### 3.7 Lifecycle
- One LS instance per opened project
- When switching project: stop LS cleanly (best-effort) then start new instance
- Stop strategy:
  - send `shutdown` request
  - send `exit` notification
  - kill process if it doesn’t exit within a short timeout

---

## 4) JSON-RPC / LSP support (backend)

### 4.1 Implement JSON-RPC framing over stdio
- Parse `Content-Length: N\r\n\r\n<json bytes>`
- Handle partial reads (buffering)
- Write outgoing messages with correct content length

### 4.2 Minimal request/notification set
Implement exactly:

Requests:
- `initialize`
- `shutdown`
- `textDocument/formatting`  (for format-on-save)

Notifications:
- `initialized`
- `textDocument/didOpen`
- `textDocument/didChange`
- `textDocument/didClose`
- `exit`

Inbound notifications to handle:
- `textDocument/publishDiagnostics`

Do not implement anything else.

### 4.3 Initialize params
Send:
- `rootUri` = project root file URI
- `capabilities` minimal, but must include:
  - `textDocument.synchronization` (open/close, change)
  - formatting support (documentFormattingProvider)
- include `workspaceFolders` (optional but recommended)

---

## 5) Frontend architecture (React/TS + Monaco)

### 5.1 Monaco configuration (NetBeans-like inline feedback)
Editor options:
- `glyphMargin: true` (required for gutter icons)
- keep default hover enabled
- (optional) show minimap off for simplicity

### 5.2 Diagnostics display: errors only
When backend emits `publishDiagnostics`:
- Filter diagnostics to **severity == 1 (Error)** only
- Convert to Monaco markers:
  - startLineNumber = lsp.start.line + 1
  - startColumn     = lsp.start.character + 1
  - endLineNumber   = lsp.end.line + 1
  - endColumn       = lsp.end.character + 1
  - severity = `monaco.MarkerSeverity.Error`
  - message = diagnostic.message
- Set markers:
  - `monaco.editor.setModelMarkers(model, "jdtls", markers)`

No Problems panel. No warnings.

### 5.3 URI consistency is critical
- The Monaco model URI must match the LSP `textDocument.uri` exactly.
- Use file URIs everywhere.
- Keep a mapping: `uri -> monaco.editor.ITextModel`.

---

## 6) Feature implementation plan (in order)

### Phase 1 — Embed & launch JDT LS (no Monaco integration yet)
Deliverables:
1) Bundle `resources/jdtls/**` and `resources/jdk/**`.
2) Resolve resource paths at runtime.
3) Copy `config_<os>` to writable app data folder.
4) Spawn JDT LS with correct args.
5) Send `initialize` and receive response; then send `initialized`.

Acceptance:
- LS starts without crashing
- initialize returns successfully for a project root

### Phase 2 — Document sync (open/change/close)
Deliverables:
1) Tauri commands: `ls_start(projectRoot)`, `ls_stop()`
2) Tauri commands: `ls_didOpen(uri,text)`, `ls_didChange(uri,text,version)`, `ls_didClose(uri)`
3) Maintain per-document version increments on the frontend
4) Send `didChange` with full text contentChanges for MVP

Acceptance:
- You can open a Java file and send didOpen
- Edits in Monaco send didChange to LS without errors

### Phase 3 — Errors-only inline markers (NetBeans-like)
Deliverables:
1) Backend listens for `publishDiagnostics`
2) Backend emits an event `{ uri, diagnostics }` to frontend
3) Frontend applies markers to Monaco models, **filtering to severity==Error**

Acceptance:
- Introduce a syntax error: squiggle + gutter icon appears
- Fix it: markers disappear
- Unused variable does NOT produce any markers (warnings ignored)

### Phase 4 — Autoformat on save (whole file)
Deliverables:
1) On save, frontend calls backend request `textDocument/formatting` with:
   - `tabSize`, `insertSpaces`
2) Backend sends LSP request and returns `TextEdit[]`
3) Frontend applies edits to Monaco model (apply in reverse order to avoid shifting)
4) Save final text to disk

Acceptance:
- Saving formats the whole file deterministically
- Cursor behavior remains acceptable (no wild jumps)

### Phase 5 — Hardening (still no extra LS features)
Deliverables:
- Restart LS cleanly on project switch
- Logging toggle (dev only)
- Handle LS crash: show toast “Java analysis restarted” and relaunch automatically

Acceptance:
- Switching projects repeatedly does not leak processes
- LS restart works

---

## 7) Public APIs (Tauri commands & events)

### Commands (frontend -> backend)
- `ls_start(projectRootUriOrPath: string)`
- `ls_stop()`
- `ls_did_open(uri: string, text: string, languageId: "java")`
- `ls_did_change(uri: string, version: number, text: string)`
- `ls_did_close(uri: string)`
- `ls_format_document(uri: string, tabSize: number, insertSpaces: boolean) -> TextEdit[]`

### Events (backend -> frontend)
- `ls_diagnostics` payload:
```ts
type LspPosition = { line: number; character: number };
type LspRange = { start: LspPosition; end: LspPosition };
type LspDiagnostic = { range: LspRange; severity?: 1|2|3|4; message: string; source?: string };

type DiagnosticsEvent = { uri: string; diagnostics: LspDiagnostic[] };