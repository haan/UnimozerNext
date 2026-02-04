# Java Parser Bridge (`parser-bridge.jar`)

This module builds a small "bridge" JAR used by Unimozer Next. It:

- Parses Java source files under a project source root (defaults to `src/`) and emits a UML graph JSON.
- Performs small source-to-source edits used by the wizards (add field / constructor / method).

The bridge reads a JSON request from `stdin` and writes a JSON response to `stdout` (no CLI args).

## Build

Requirements:
- JDK 17+ (the Gradle build targets Java 17)
- Gradle

```bash
cd java-parser
gradle copyBridgeJar
```

This builds a fat JAR (dependencies included) and copies it to:

```text
resources/java-parser/parser-bridge.jar
```

Unimozer Next bundles `resources/java-parser/` via the platform-specific Tauri config (for example `src-tauri/tauri.windows.conf.json`).

## UML parse (`action` omitted / `parseGraph`)

Request:

```json
{
  "root": "E:\\UnimozerNext\\Projects\\Test1",
  "srcRoot": "src",
  "overrides": [
    {
      "path": "E:\\UnimozerNext\\Projects\\Test1\\src\\example\\Foo.java",
      "content": "package example;\\n\\npublic class Foo {}\\n"
    }
  ]
}
```

- `root`: project directory (required)
- `srcRoot`: relative or absolute path to the sources (defaults to `src`)
- `overrides`: optional in-memory file contents (absolute paths), used for unsaved editor buffers

Response:

```json
{
  "nodes": [],
  "edges": [],
  "failedFiles": []
}
```

Notes:
- Only top-level types are parsed (`CompilationUnit.getTypes()`).
- Members (fields/methods/constructors) are reported in source order.
- `failedFiles` contains files that could not be parsed.
- Fields/methods/constructors include `range` (1-based line/column) when available.

### Visibility symbols

- `+` public
- `#` protected
- `-` private
- `~` package (default)

### Edge kinds

- `extends`, `implements`
- `association`: from field types
- `dependency`: from method/constructor signatures and selected type uses in bodies
- `reflexive-association`: self-referencing associations only (self dependencies are skipped)

### Type resolution (no symbol solver)

Types are resolved to project types using:
- explicit imports
- package name
- wildcard imports
- unique simple-name match inside the project

External library types typically do not produce edges.

## Source edits (`addField`, `addConstructor`, `addMethod`)

The bridge supports edits by setting `action` in the request JSON:

- `addField`
- `addConstructor`
- `addMethod`

Each edit returns a JSON response like:

```json
{ "ok": true, "content": "/* updated source */" }
```

or on failure:

```json
{ "ok": false, "error": "..." }
```

The bridge does not write files; Unimozer Next decides when to persist changes to disk.
