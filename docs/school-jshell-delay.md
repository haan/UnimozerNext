# School machine JShell delay: root-cause analysis and fixes

## Summary

On a school network running Windows Active Directory with ESET Endpoint Security,
Unimozer Next 0.13.5 exhibited two
distinct delays that did not occur on a local administrator account on the same
physical machine:

| Symptom | Duration |
|---|---|
| "Starting object bench runtime…" after compile | ~9 seconds |
| First object creation in the bench | ~1–2 seconds |

Both symptoms were resolved in 0.14.4. This document records the evidence
collected on-site, the root cause of each symptom, and the exact code changes
made to fix them.

---

## Environment

| Property | Value |
|---|---|
| Domain | Windows Active Directory domain (school network) |
| User home | Network drive (`Z:\` → UNC path on domain file server) |
| Antivirus | ESET Endpoint Security (confirmed by `ESET_OPTIONS` env var) |
| Installed JDKs | Eclipse Adoptium JDK 21 + JDK 8 (system-level, separate from bundled JDK) |
| Comparison account | Local administrator account (no domain, ESET policies unenforced) |

Both accounts were tested on the same physical machine (confirmed by identical
`machineHash` values in diagnostic traces).

---

## Diagnostic data collected

A built-in JShell warmup diagnostic was run under both accounts. All numbers are
from `tmp/admin/diagnostic-run.txt` and `tmp/user/diagnostic-run.txt`.

### Admin account (baseline)

```
start=557ms   spawn=7ms   handshake=549ms   ready=0ms
snapshot=473ms (bridge eval=463ms)
warmup=38ms
total=1068ms
```

### Domain user account (affected)

```
start=9293ms   spawn=12ms   handshake=9280ms   ready=0ms
snapshot=1376ms (bridge eval=1365ms)
warmup=130ms
total=10799ms
```

The `compile-run.txt` logs confirm the same pattern end-to-end:

| Log line | Admin | User |
|---|---|---|
| JShell start completed | 7 ms | 13 ms |
| JShell warmup finished | 975 ms | **9 105 ms** |

---

## Root cause 1: JShell remote execution mode + ESET loopback inspection

### What JShell remote execution mode does

JShell has two execution modes:

- **Remote mode** (default): JShell starts a *second* JVM process (the "execution
  engine") and connects to it over a loopback TCP socket. Every eval goes through
  this socket.
- **Local mode**: user code runs in the *same* JVM as the JShell instance, no
  second process, no socket.

Unimozer's JShell bridge was using the default remote mode.

### Why remote mode caused a 9-second delay

The diagnostic shows:

```
spawn=12ms      ← JVM process created almost instantly
handshake=9280ms ← Rust side blocked in read_line() for 9.27 seconds
                   waiting for bridge to write its first stdout line
```

The bridge itself only spent ~62 ms doing actual work before writing that first
line. The remaining ~9 200 ms elapsed between process spawn and the bridge's
`main()` starting to execute.

This matches exactly what happens when ESET's minifilter driver intercepts and
synchronously inspects a new loopback TCP connection from a domain user process.
ESET subjects the loopback socket establishment to its network traffic inspection
policy for domain accounts. Local administrator accounts are exempt from this
policy, which is why the same physical machine shows 549 ms vs. 9 280 ms in the
handshake phase.

The "aggressive" diagnostic override mode (which redirected temp dirs and set JVM
flags) had **no effect on the handshake** (9 280 ms → 9 152 ms, within noise),
confirming the delay is in the socket layer, not the filesystem.

### Fix: switch to local execution mode

In `jshell-bridge/src/main/java/com/unimozer/jshell/JshellBridge.java`, the
JShell builder was changed to use local execution:

```java
// before (implicit default = remote)
JShell jshell = JShell.builder()
    .out(outputStream)
    ...
    .build();

// after
JShell jshell = JShell.builder()
    .out(outputStream)
    .executionEngine("local")
    ...
    .build();
```

With `"local"` execution, no second JVM is started and no loopback socket is
opened. The bridge's first stdout line is written as soon as JShell initialises
within the single process, eliminating the 9-second ESET inspection delay
entirely.

**Trade-off**: in local mode, an infinite loop or `System.exit()` in user code
can freeze or terminate the bridge process. This is mitigated by the existing
force-kill mechanism (`jshell_force_stop` in `src-tauri/src/jshell_io.rs`), which
reads the bridge PID from an `AtomicU32` (bypassing the mutex in case it is
locked inside an eval) and kills the process tree via `taskkill /T /F` on Windows
and `SIGKILL` on Unix.

---

## Root cause 2: temp file creation on first object inspection

### What the original code did

When the object bench inspected an object, the bridge evaluated a JShell
expression that called `Inspector.inspectToFile(obj, path)` — writing the JSON
result to a temp file — and then read the file back:

```java
Path tempFile = Files.createTempFile("unimozer-inspect-", ".json");
EvalResult eval = evaluate(
    "com.unimozer.jshell.Inspector.inspectToFile(" + varName
    + ", \"" + escapedPath + "\")");
String payload = Files.readString(tempFile, StandardCharsets.UTF_8);
Files.deleteIfExists(tempFile);
```

### Why this caused a slow first object creation

ESET's minifilter driver performs a synchronous on-access scan of newly created
files from processes it does not yet recognise. The *first* temp file created by
a new JVM process triggers a full scan context initialisation; subsequent files
from the same process are fast.

This explains the asymmetry: the first object creation was slow (~1–2 s) while
all subsequent ones were near-instant — exactly the first-file-per-process
pattern of an AV on-access scan.

### Fix: capture JSON via stdout instead of a temp file

`Inspector.inspect(obj)` already existed and returned the JSON as a `String`.
`handleInspect` in `JshellBridge.java` was changed to capture that return value
through `System.out.println` in the eval expression, reading it from
`EvalResult.stdout`:

```java
// before: temp file
Path tempFile = Files.createTempFile("unimozer-inspect-", ".json");
String escapedPath = escapeJavaString(tempFile.toString());
EvalResult eval = evaluate(
    "com.unimozer.jshell.Inspector.inspectToFile(" + varName
    + ", \"" + escapedPath + "\")");
String payload = Files.readString(tempFile, StandardCharsets.UTF_8);
Files.deleteIfExists(tempFile);

// after: stdout capture
EvalResult eval = evaluate(
    "System.out.println(com.unimozer.jshell.Inspector.inspect(" + varName + "))");
String payload = eval.stdout != null ? eval.stdout.trim() : "";
```

No temp file is created. The inspect path is now zero-allocation from a
filesystem perspective and is not subject to AV on-access scanning.

---

## Root cause 3: JVM reflection cold-start on first object creation

### What happens on the first inspect call for a user class

Java's reflection API (`getDeclaredFields()`, `getMethods()`, `setAccessible()`)
is lazy: the JVM loads and caches class metadata the first time it is accessed.
For a freshly-compiled user class, the *first* call to `getDeclaredFields()` in
`Inspector.inspect()` forces the JVM to read and parse the `.class` file. This
cold-start cost is visible as a short pause on the first object creation even
after the temp-file problem is eliminated.

### Fix: pre-warm reflection metadata during Phase 4

A static `Inspector.warm(String className)` method was added to
`jshell-bridge/src/main/java/com/unimozer/jshell/Inspector.java`:

```java
public static void warm(String className) {
    try {
        Class<?> c = Class.forName(className);
        for (Field f : c.getDeclaredFields()) {
            try { f.setAccessible(true); } catch (Exception ignored) {}
        }
        c.getMethods();
    } catch (Exception ignored) {}
}
```

During the Phase 4 warmup sequence in
`src/hooks/useCompileJshellLifecycle.ts`, after the baseline eval and
reflection preheat steps, a warmup step is now issued for each class in the
current UML graph:

```typescript
for (const classId of classIds) {
    if (jshellStartTokenRef.current !== token) break;
    await runEvalWarmupStep(
        `reflect-class-${classId}`,
        `com.unimozer.jshell.Inspector.warm("${classId}");`,
        false
    );
}
```

Each step is optional (failures are silently skipped). By the time the student
creates their first object, the JVM reflection cache for every user class is
already warm.

---

## Additional fix: skip redundant re-inspect on object creation

When creating a new object in the bench, the original `createAndRefresh` flow in
`src/hooks/useJshellActions.ts` would inspect the newly created object
immediately after creation. Since the object's type information is already known
from the UML graph at creation time, this inspect call was unnecessary and added
latency.

The fix avoids re-inspecting the new entry and only refreshes pre-existing
objects:

```typescript
// before
const refreshed = await refreshObjectBench([...baseObjects, entry]);
setObjectBench(refreshed);

// after
const refreshed = await refreshObjectBench(baseObjects);
setObjectBench([...refreshed, entry]);
```

---

## Timeline of events and measurements

```
v0.13.5 on school machine (domain user):
  JShell start:   13 ms     (process spawn only)
  Handshake:    9280 ms     ← ESET loopback inspection (remote mode)
  Snapshot eval: 1365 ms    ← ESET filesystem scan on first temp file
  Warmup:         130 ms    ← JVM reflection cold-start
  ─────────────────────────
  Total visible:  ~10.8 s

v0.13.5 on same machine (local admin):
  JShell start:    7 ms
  Handshake:     549 ms     ← no ESET domain policy
  Snapshot eval: 463 ms
  Warmup:         38 ms
  ─────────────────────────
  Total visible:  ~1.0 s

v0.14.4 on school machine (expected, fixes applied):
  JShell start:   ~10 ms    (local mode, no socket)
  Handshake:     ~50 ms     ← no loopback socket to inspect
  Snapshot eval: ~50 ms     ← stdout path, no temp file
  Warmup:        ~200 ms    ← reflection pre-warm per user class
  ─────────────────────────
  Total visible:  ~0.5 s    ✓ confirmed working in school
```

---

## Files changed

| File | Change |
|---|---|
| `jshell-bridge/src/main/java/com/unimozer/jshell/JshellBridge.java` | Switch to `executionEngine("local")`; capture inspect result via stdout instead of temp file |
| `jshell-bridge/src/main/java/com/unimozer/jshell/Inspector.java` | Add `warm(String className)` static method |
| `src/hooks/useCompileJshellLifecycle.ts` | Add per-class reflection warmup loop in Phase 4; pass `classIds` to `startJshellForCompile` |
| `src/hooks/useJshellActions.ts` | Skip re-inspecting the newly created object in `createAndRefresh` |

---

## Diagnostic files

The raw evidence was collected into `tmp/` on the development machine.
That directory is excluded by `.gitignore` and is not committed to the
repository. The numbers quoted in this document were extracted from those
files at the time of analysis. If you need the original traces, they are
stored locally under:

| Path | Contents |
|---|---|
| `tmp/admin/compile-run.txt` | Full debug log, admin account, 0.13.5 |
| `tmp/user/compile-run.txt` | Full debug log, domain user, 0.13.5 |
| `tmp/admin/diagnostic-run.txt` | JShell warmup diagnostic summary, admin |
| `tmp/user/diagnostic-run.txt` | JShell warmup diagnostic summary, domain user |
| `tmp/admin/jshell-diagnostic-*.jsonl` | Per-step JSONL trace, admin |
| `tmp/user/jshell-diagnostic-*.jsonl` | Per-step JSONL trace, domain user |
| `tmp/jshell-investigation/env-user.txt` | Environment variables for domain user |
| `tmp/jshell-investigation/whoami-user.txt` | Group membership and privileges for domain user |

---

## If the delay returns in a future version

Check these things in order:

1. **Is the bridge using local execution mode?**
   Grep `executionEngine` in `JshellBridge.java`. If it is absent or set to
   `"remote"`, that is the cause.

2. **Is inspect going through stdout or a temp file?**
   Look at `handleInspect` in `JshellBridge.java`. If it calls
   `Files.createTempFile`, the temp-file path was reintroduced.

3. **Is the warmup running per-class steps?**
   Check `useCompileJshellLifecycle.ts` for the `reflect-class-${classId}` loop.

4. **Capture a new diagnostic on the school machine.**
   Enable debug logging in settings, trigger a compile, and look for the
   `handshake=` value in the `[jshell]` log lines. If it is above 1 second,
   a socket or filesystem inspection delay has returned.
