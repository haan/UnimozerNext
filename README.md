# Unimozer Next

Unimozer Next is a modern desktop rewrite of Unimozer: a visual Java learning tool that combines UML class diagrams, source editing, compilation, execution, and object interaction in one classroom-friendly UI.

The original Unimozer focused on UML-first Java learning with BlueJ-like interaction (draw classes, generate code, compile, create objects, call methods). Unimozer Next keeps that educational workflow and rebuilds it on a modern stack.

## Project Goals

- Keep the original teaching workflow simple and fast.
- Bundle core Java tooling so students can work without complex setup.
- Support modern Java syntax and modern desktop UX.
- Stay practical for schools and offline usage.

## Current Feature Set

- Java source-tree discovery/indexing for project operations and UML parsing, plus file editing with Monaco.
- UML generation from Java source via `java-parser/parser-bridge.jar`.
- Two-way model workflow:
  - generate UML from source
  - update source with wizards (add class/field/constructor/method).
- Diagram interaction:
  - drag class nodes
  - zoom in/out/reset
  - package display toggle
  - class and diagram PNG export/copy (compiled and uncompiled styles).
- Compile and run:
  - compile with bundled `javac`
  - run selected `main` classes
  - stream output to the in-app console panel.
- Object Bench (BlueJ-style) via JShell bridge:
  - create objects
  - inspect fields
  - call methods.
- Settings for UML/editor/object bench behavior, including debug logging.
- Language Server integration (JDT LS) for diagnostics/formatting pipeline.

## Architecture

- Frontend: React + Vite + TypeScript + Monaco.
- Desktop shell/backend: Tauri (Rust).
- Java helper modules:
  - `java-parser/` -> `parser-bridge.jar`
  - `jshell-bridge/` -> `jshell-bridge.jar`
- Bundled resources (Windows packaging):
  - JDK
  - JDT LS
  - parser bridge
  - JShell bridge.

## Repository Layout

```text
unimozer-next/
  src/                  React frontend
  src-tauri/            Rust backend (Tauri)
  java-parser/          Java parser + code-edit bridge
  jshell-bridge/        JShell JSON bridge
  resources/            Bundled runtime resources
  SPEC.md               Product/architecture specification
```

## Prerequisites (Development)

- Node.js + npm
- Rust toolchain (cargo)
- JDK 17+ (to build Java bridge modules)
- Gradle (or Gradle wrapper if added later)

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Build Java bridge JARs (recommended after bridge changes):

```bash
npm run build:parser
npm run build:jshell
```

3. Run in development mode:

```bash
npm run tauri dev
```

## Build and Packaging

- Frontend build: `npm run build`
- Desktop bundle: `npm run tauri build`

Current Tauri bundle targets are Windows installers (`msi`, `nsis`) as configured in `src-tauri/tauri.conf.json`.

## Useful Scripts

- `npm run dev` - Vite frontend dev server
- `npm run tauri dev` - full desktop app in dev mode
- `npm run build` - frontend production build
- `npm run tauri build` - desktop installer build
- `npm run typecheck` - TypeScript check (`tsc --noEmit`)
- `npm run cargo:check` - Rust check for `src-tauri`
- `npm run lint` - ESLint
- `npm run build:parser` - rebuild parser bridge jar
- `npm run build:jshell` - rebuild JShell bridge jar

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