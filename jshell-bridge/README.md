# JShell Bridge (`jshell-bridge.jar`)

This module builds a small "bridge" JAR used by Unimozer Next’s **Object Bench**. It provides a
JSON-over-stdin/stdout protocol for driving a long-lived JShell session and inspecting objects.

The bridge reads **newline-delimited JSON** requests from `stdin` and writes one JSON response per
line to `stdout`.

### About temp files (and escaping)

Unimozer Next does **not** communicate with this bridge via temporary files. The normal transport is
**stdin/stdout** (one JSON request per line, one JSON response per line). Newlines/quotes inside
fields (for example the `code` string sent to `eval`) are handled by JSON escaping (`\\n`, `\\\"`,
etc.) and are restored when the bridge parses the JSON.

The only temp-file usage is internal to the bridge for `inspect`: it uses
`com.unimozer.jshell.Inspector.inspectToFile(...)` to write a structured JSON payload, then reads
that payload back and returns it as the `inspect` response. This avoids relying on JShell’s snippet
value formatting for large/structured data.

## Build

Requirements:
- JDK 17+ (uses `jdk.jshell`)
- Gradle

```bash
cd jshell-bridge
gradle copyBridgeJar
```

This builds a fat JAR (dependencies included) and copies it to:

```text
resources/jshell-bridge/jshell-bridge.jar
```

Unimozer Next bundles `resources/jshell-bridge/` via the platform-specific Tauri config (for example
`src-tauri/tauri.windows.conf.json`).

## Run (optional)

You can run the bridge directly:

```bash
java -jar jshell-bridge.jar --classpath "E:\Projects\Test1\build\classes"
```

- `--classpath` (or `--class-path`) is optional. It can be a directory, JAR, or a path-separator
  separated list.

## Protocol

Each request must fit on a single line (avoid pretty-printed multi-line JSON; JSON encoders will
escape `\n` and quotes inside strings).

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
- The bridge uses `com.unimozer.jshell.Inspector.inspectToFile(...)` internally and then returns the
  JSON payload.
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

Close the current JShell instance.

Request:

```json
{ "cmd": "reset" }
```

Response:

```json
{ "ok": true }
```

Note: Unimozer Next typically resets by restarting the bridge process.
