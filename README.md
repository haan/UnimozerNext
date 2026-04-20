# Unimozer Next

Unimozer Next is a modern desktop rewrite of Unimozer: a visual Java learning tool that combines UML class diagrams, source editing, compilation, execution, and object interaction in one classroom-friendly UI.

The original Unimozer focused on UML-first Java learning with BlueJ-like interaction (draw classes, generate code, compile, create objects, call methods). Unimozer Next keeps that educational workflow and rebuilds it on a modern stack.

## Project Goals

- Keep the original teaching workflow simple and fast.
- Bundle core Java tooling so students can work without complex setup.
- Support modern Java syntax and modern desktop UX.
- Stay practical for schools and offline usage.

## Current Feature Set

- Project workflows for packed `.umz` archives and folder projects, including create/open/save/reload operations.
- Java source-tree discovery/indexing for project operations and UML parsing, plus file editing with Monaco.
- UML generation from Java source via `java-parser/parser-bridge.jar`.
- Two-way model workflow: generate UML from source and update source with wizards (add class/field/constructor/method).
- Diagram interaction: drag class nodes, zoom in/out/reset, package/dependency display toggles.
- Diagram PNG copy/export in both uncompiled and compiled visual styles.
- Structogram (Nassi-Shneiderman) view for the method at the editor caret, with optional colorized headers and PNG copy/export.
- Code navigation/highlighting features:
  - Jump to code when selecting UML members.
  - Optional BlueJ-style nested scope highlighting in the code editor.
- Compile and run using bundled Java tools (`javac` / `java`) with streamed console output and run cancellation.
- Object Bench (BlueJ-style) via JShell bridge: create objects, inspect fields, and call methods.
- Language Server integration (JDT LS) for diagnostics and formatting (including optional auto-format on save).
- Settings for UML, editor, structogram, object bench, layout, and debug logging behavior.

## Architecture

- Frontend: React + Vite + TypeScript + Monaco.
- Desktop shell/backend: Tauri (Rust).
- Java helper modules:
  - `java-parser/` → `parser-bridge.jar`
  - `jshell-bridge/` → `jshell-bridge.jar`
- Bundled runtime resources: JDK, JDT LS, parser bridge, JShell bridge.

## Repository Layout

```text
unimozer-next/
  src/                  React frontend
  src-tauri/            Rust backend (Tauri)
  java-parser/          Java parser + code-edit bridge
  jshell-bridge/        JShell JSON bridge
  resources/            Bundled runtime resources (folder skeleton tracked)
  docs/                 Developer notes (testing, updater, known issues)
  examples/             Six example projects (UML, structogram, JShell, etc.)
  DEVELOPMENT.md        Full developer setup and build guide
```

## Getting Started

> **First time?** See [DEVELOPMENT.md](DEVELOPMENT.md) for the full setup guide, including how to populate the required JDK, JDT LS, and bridge JAR resources.

```bash
npm install
npm run build:parser
npm run build:jshell
npm run tauri dev
```

## Useful Scripts

- `npm run dev` - Vite frontend dev server
- `npm run tauri dev` - full desktop app in dev mode
- `npm run build` - frontend production build
- `npm run tauri:build` - desktop installer build
- `npm run typecheck` - TypeScript check (`tsc --noEmit`)
- `npm run cargo:check` - Rust check for `src-tauri`
- `npm run lint` - ESLint
- `npm run build:parser` - rebuild parser bridge jar
- `npm run build:jshell` - rebuild JShell bridge jar
- `npm run test:all` - run all tests (unit, integration, e2e, Java)
- `npm run assets:logo-runtime` - regenerate About dialog runtime logo/depth assets

## Data and Compatibility Notes

- Diagram state is persisted in `unimozer.json` in the project root.
- Legacy `unimozer.pck` layout data is imported when available.
- For NetBeans-style projects, source/classpath properties from `nbproject/project.properties` are respected where applicable.

## Licensing

- Project source license: MIT (`LICENSE`).
- Bundled third-party components and attributions: `THIRD_PARTY_NOTICES.md`.

## Attribution and Background

This project is based on the original Unimozer concept and educational workflow.

- Original Unimozer developer: **Bob Fisch**
- Original project page: https://unimozer.fisch.lu/
- Original GitHub repository: https://github.com/fesch/Unimozer
