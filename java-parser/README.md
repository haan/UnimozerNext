# JavaParser Bridge

This small Java app parses Java source files under `src/` and emits a UML graph JSON
for Unimozer Next. It uses JavaParser and supports in-memory overrides for unsaved
editor buffers.

## Build

You need Gradle installed.

```
cd java-parser
gradle copyBridgeJar
```

This produces:

```
resources/java-parser/parser-bridge.jar
```

That jar is bundled by Tauri (see `src-tauri/tauri.conf.json`).

## Notes
- Only top-level types are parsed.
- Associations resolve `List<Foo>` and `Foo[]` to `Foo` when `Foo` is a project type.
- Symbol Solver is not used yet (see Milestone 3.1 in `SPEC.md`).
