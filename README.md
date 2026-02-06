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

## External Resources (Required, Not Tracked in Git)

This repository intentionally does **not** commit large bundled runtime resources.
They are excluded in `.gitignore`:

- `/resources/jdk/`
- `/resources/jdtls/`
- `/resources/java-parser/*.jar`
- `/resources/jshell-bridge/*.jar`

You must populate these before running `npm run tauri dev` or `npm run tauri build`.

### 1) Prepare directory structure

Create these directories if they do not exist:

```powershell
New-Item -ItemType Directory -Force -Path resources\jdk\win-x64 | Out-Null
New-Item -ItemType Directory -Force -Path resources\jdtls | Out-Null
New-Item -ItemType Directory -Force -Path resources\java-parser | Out-Null
New-Item -ItemType Directory -Force -Path resources\jshell-bridge | Out-Null
```

### 2) Install bundled JDK files

Download a **Windows x64 JDK ZIP** (not an installer) and extract it so these files exist:

- `resources/jdk/win-x64/bin/java.exe`
- `resources/jdk/win-x64/bin/javac.exe`

Important: If the archive extracts as a nested top folder (for example `jdk-xx/...`), move the folder **contents** into `resources/jdk/win-x64/` so `bin/` is directly under `win-x64`.

Current project metadata references Temurin `25.0.1+8-LTS` in `resources/jdk/win-x64/release`, so that version is the safest match.

Verify:

```powershell
Test-Path resources\jdk\win-x64\bin\java.exe
Test-Path resources\jdk\win-x64\bin\javac.exe
```

### 3) Install bundled JDT LS files

Download an Eclipse JDT Language Server distribution archive and extract it so these paths exist:

- `resources/jdtls/plugins/`
- `resources/jdtls/features/`
- `resources/jdtls/config_win/config.ini`

Verify:

```powershell
Test-Path resources\jdtls\plugins
Test-Path resources\jdtls\features
Test-Path resources\jdtls\config_win\config.ini
Get-ChildItem resources\jdtls\plugins\org.eclipse.equinox.launcher_*.jar
```

### 4) Build local Java bridge JARs

Build and copy bridge artifacts into `resources/`:

```bash
npm run build:parser
npm run build:jshell
```

Expected outputs:

- `resources/java-parser/parser-bridge.jar`
- `resources/jshell-bridge/jshell-bridge.jar`

Verify:

```powershell
Test-Path resources\java-parser\parser-bridge.jar
Test-Path resources\jshell-bridge\jshell-bridge.jar
```

### 5) Quick preflight checks

Run:

```bash
npm run typecheck
npm run cargo:check
```

Then launch:

```bash
npm run tauri dev
```

If resources are missing, common errors include:

- `Bundled Java compiler not found`
- `Bundled Java runtime not found`
- `JDT LS not found`

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Prepare external resources (JDK, JDT LS, bridge JARs) using the section above.

3. Build Java bridge JARs (recommended after bridge changes):

```bash
npm run build:parser
npm run build:jshell
```

4. Run in development mode:

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
