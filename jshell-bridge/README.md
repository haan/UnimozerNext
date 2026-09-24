# JShell Bridge (`jshell-bridge.jar`)

This module builds a small "bridge" JAR used by Unimozer Next’s **Object Bench**. It provides a
JSON-over-stdin/stdout protocol for driving a long-lived JShell session and inspecting objects.

The bridge reads **newline-delimited JSON** requests from `stdin`. Responses on `stdout` have a
`__UNIMOZER_BRIDGE__:` prefix; output chunks may arrive before the final response.

### About temp files (and escaping)

Unimozer Next does **not** communicate with this bridge via temporary files. The normal transport is
**stdin/stdout**. Newlines/quotes inside
fields (for example the `code` string sent to `eval`) are handled by JSON escaping (`\n`, `\"`,
etc.) and are restored when the bridge parses the JSON.

`inspect` calls `com.unimozer.jshell.Inspector.inspect(...)` inside JShell and captures its JSON
through an in-memory stdout buffer. It does not write an inspection temp file. The older
`inspectToFile(...)` helper still exists but is not used by the command.

## Build

Requirements:
- JDK 25 LTS, with `JAVA_HOME` pointing to the JDK installation (uses `jdk.jshell`)
- The included Gradle Wrapper downloads the pinned Gradle 9.8.0; no global Gradle installation is needed.

```bash
cd jshell-bridge
./gradlew copyBridgeJar
```

On Windows PowerShell, use `.\gradlew.bat copyBridgeJar` instead. From the
repository root, `npm run build:jshell` works on all platforms.

The bridge is compiled and tested with Java 25 and requires Java 25 or newer to run.

This builds a fat JAR (dependencies included) and copies it to:

```text
resources/jshell-bridge/jshell-bridge.jar
```

Unimozer Next bundles `resources/jshell-bridge/` via the platform-specific Tauri config (for example
`src-tauri/tauri.windows.conf.json`).

## Run (optional)

You can run the bridge directly from the repository root:

```bash
java -jar resources/jshell-bridge/jshell-bridge.jar --classpath "path/to/project/build/classes"
```

- `--classpath` (or `--class-path`) is optional. It can be a directory, JAR, or a path-separator
  separated list.
- JShell uses the `local` execution engine, in the bridge JVM. Set JVM options before `-jar`
  (for example `java -Duser.home=... -jar ...`). The legacy `--remote-vm-option` argument is still
  accepted, but there is no separate remote execution VM in the current configuration.

## Protocol

Each request must fit on a single line (avoid pretty-printed multi-line JSON; JSON encoders will
escape `\n` and quotes inside strings).

Process requests sequentially and distinguish these output frames:

- `__UNIMOZER_BRIDGE__:<JSON>` on stdout: the final command response.
- `__UNIMOZER_BRIDGE_CHUNK__:{"stdout":"..."}` on stdout: captured output emitted while evaluating.
  Chunks have trailing line endings stripped. The final `eval` response also contains the complete
  captured stdout; do not display it twice when streaming chunks.
- `__UNIMOZER_BRIDGE_DIAG__:<JSON>` on stderr: timing diagnostics, separate from command responses.

The response examples below show the JSON payload **after removing the prefix**. They omit optional
diagnostic fields and are formatted across multiple lines for readability.

### `eval`

Evaluate code in the current JShell session.

Request:

```json
{ "cmd": "eval", "code": "int x = 1 + 2;" }
```

Response:

```json
{ "ok": true, "stdout": "", "stderr": "" }
```

On failure:

```json
{ "ok": false, "stdout": "", "stderr": "", "error": "..." }
```

Notes:
- `stdout` / `stderr` are captured for the evaluation.
- `value` is included when the evaluated snippet yields one.

### `inspect`

Inspect an object stored in a JShell variable using reflection (fields + inherited public methods).

Request:

```json
{ "cmd": "inspect", "var": "myObj" }
```

Response:

```json
{
  "ok": true,
  "typeName": "com.example.Foo",
  "fields": [
    {
      "name": "count",
      "type": "int",
      "value": "3",
      "visibility": "private",
      "isStatic": false,
      "isInherited": false
    }
  ],
  "inheritedMethods": [
    {
      "className": "java.util.AbstractList",
      "methods": [
        {
          "name": "size",
          "returnType": "int",
          "paramTypes": [],
          "visibility": "public",
          "isStatic": false
        }
      ]
    }
  ]
}
```

Notes:
- The bridge returns the JSON payload captured from `com.unimozer.jshell.Inspector.inspect(...)`.
- Field values are stringified (`String.valueOf(...)`); failures may show as `"<error>"`.

### `vars`

List JShell variables.

Request:

```json
{ "cmd": "vars" }
```

Response:

```json
{
  "ok": true,
  "vars": [
    { "name": "x", "type": "int", "value": "3", "visibility": "public", "isStatic": false }
  ]
}
```

### `reset`

Close the current JShell instance and create a fresh one with the same classpath and configuration.

Request:

```json
{ "cmd": "reset" }
```

Response:

```json
{ "ok": true }
```

Note: Unimozer Next typically resets by restarting the bridge process.
