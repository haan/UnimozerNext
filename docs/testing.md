# Unit Test Setup

This document describes the automated test infrastructure for Unimozer Next.

## Overview

Tests are organised by layer:

| Layer | Tool | Command |
|-------|------|---------|
| Frontend (TypeScript/React) | Vitest | `npm run test:unit` |
| Rust backend | cargo test | `npm run cargo:test` |
| Java parser bridge | JUnit 5 (Gradle) | `npm run test:java:parser` |
| JShell bridge | JUnit 5 (Gradle) | `npm run test:java:jshell` |
| End-to-end (browser) | Playwright | `npm run test:e2e` |

The full gate (lint + typecheck + Rust + Vitest) runs as one command:

```bash
npm run test
```

Everything including Java and Playwright:

```bash
npm run test:all
```

---

## Frontend unit tests (Vitest)

### Configuration

**`vitest.config.ts`** — separate from `vite.config.ts` so the production build is unaffected.

Key settings:
- `environment: "jsdom"` — DOM APIs available in every test
- `globals: true` — `describe`, `it`, `expect`, `vi` etc. available without importing
- `setupFiles: ["./src/test/setup.ts"]` — runs before every test file
- `include: ["src/**/*.{test,spec}.{ts,tsx}"]` — picks up all test files under `src/`

### Global setup (`src/test/setup.ts`)

Runs before every test file. It:
1. Imports `@testing-library/jest-dom` (adds matchers like `toBeInTheDocument`)
2. Mocks `@tauri-apps/api/core` — `invoke` is a no-op `vi.fn()` by default
3. Mocks `@tauri-apps/plugin-dialog` — `open` and `save` return `null`
4. Calls `vi.clearAllMocks()` in `beforeEach` so each test starts clean

Any test that needs specific `invoke` behaviour overrides the mock locally:

```ts
import { invoke } from "@tauri-apps/api/core";
vi.mocked(invoke).mockResolvedValueOnce({ ... });
```

---

## Running tests

```bash
# Run once (CI mode)
npm run test:unit

# Watch mode — reruns on file save
npm run test:unit:watch

# Browser UI — interactive test explorer
npm run test:unit:ui

# Coverage report (written to /coverage/)
npm run test:unit:coverage
```

Note: the first invocation of `vitest run` in a fresh shell sometimes prints a
"Vitest failed to find the runner" warning. This is a transient Vitest startup
issue — running the same command a second time (or using `npm run test:unit`)
always succeeds.

---

## What is tested

### Services (`src/services/__tests__/`)

| File | Functions covered |
|------|-------------------|
| `crashLogging.test.ts` | `hasCancellationText`, `shouldIgnoreUnhandledRejection`, `toCrashSnapshot` |
| `diagram.test.ts` | `createDefaultDiagramState`, `normalizeDiagramState`, `mergeDiagramState`, `parseLegacyPck` |
| `java.test.ts` | `isValidJavaIdentifier`, `JAVA_KEYWORDS` |
| `javaCodegen.test.ts` | `escapeJavaString`, `escapeJavaChar`, `normalizeConstructorArg`, `resolveConstructorParamClass`, `buildClassSource` |
| `lsp.test.ts` | `isTextEdit`, `isInsertReplaceEdit`, `isCompletionList`, `parseLsDiagnosticsEvent`, `normalizeCompletionResponse`, `toFileUri`, `sortTextEditsDescending`, `applyTextEdits` |
| `monacoThemes.test.ts` | `normalizeColor`, `matchesRuleToken`, `findRuleColor`, `upsertRuleColor`, `sanitizeThemeRules`, `resolveMonacoTheme` |
| `paths.test.ts` | `basename`, `joinPath`, `toDisplayPath`, `toRelativePath` |
| `recentProjects.test.ts` | `normalizeRecentPath`, `recentEntryKey`, `upsertRecentProject`, `removeRecentProject` |
| `scopeHighlighting.test.ts` | `computeScopeLineInfo`, `shouldRefreshScopeForContentChanges` |
| `status.test.ts` | `formatStatusText`, `trimStatusText` |
| `tauriValidation.test.ts` | `parseSchemaOrNull`, `parseSchemaOrThrow` |
| `umlGraph.test.ts` | `getUmlSignature` |

### Hooks (`src/hooks/__tests__/`)

Hook tests use `renderHook` + `act` from `@testing-library/react`. They mock
`tauriValidation` entirely so no real IPC is needed.

| File | Functions covered |
|------|-------------------|
| `useClassEditActions.test.ts` | `handleCreateClass`, `handleCreateField`, `handleCreateConstructor`, `handleCreateMethod` |
| `useClassRemovalActions.test.ts` | `confirmRemoveClass` |
| `useClassRenameActions.test.ts` | `deriveRenamedClassId`, `handleRenameClass` |

### Components (`src/components/*/__tests__/`)

| File | What is tested |
|------|----------------|
| `ui/__tests__/button.test.tsx` | Render, click, disabled state, variants, ref forwarding |
| `wizards/__tests__/AddClassDialog.test.tsx` | Form validation, submission payload, checkbox interactions |
| `diagram/__tests__/methodSignature.test.ts` | `formatMethodSignature` (raw vs reconstructed display) |
| `structogram/__tests__/layoutBuilder.test.ts` | `buildStructogramLayout` — statement, sequence, if/else, loop, switch, try/catch |

---

## What is not unit tested (and why)

| Category | Reason |
|----------|--------|
| Tauri IPC wrappers (`jshell.ts`, `settings.ts`, `updater.ts`, etc.) | No pure logic; testing requires a running Tauri binary — covered by e2e tests |
| Monaco editor integration (`monacoJavaTokenizer.ts`) | Requires a live editor context |
| Large React hooks not in `__tests__/` | Tightly coupled to Monaco, app state, and IPC; integration-test territory |
| SVG/canvas export (`svgExport.ts`) | Browser Canvas API; better tested via e2e |
| Constants files | No executable logic |

---

## Exporting private functions for testing

Several service files contain private pure functions that were exported specifically
to make them testable. These exports are marked by their `export const` declaration
sitting next to unexported helpers in the same file:

- `crashLogging.ts` — `hasCancellationText`, `shouldIgnoreUnhandledRejection`, `toCrashSnapshot`
- `monacoThemes.ts` — `normalizeColor`, `matchesRuleToken`, `findRuleColor`, `upsertRuleColor`, `sanitizeThemeRules`
- `scopeHighlighting.ts` — the entire module was extracted from `CodePanel.tsx` to allow testing
- `useClassRenameActions.ts` — `deriveRenamedClassId`

When adding tests for new private logic, prefer extracting it to a service file
and exporting it over testing it indirectly through the full hook or component.

---

## Adding new tests

1. Create `__tests__/<name>.test.ts` (or `.test.tsx` for React components) next to the file under test.
2. Import from vitest if needed — though `describe`, `it`, `expect`, `vi` are global.
3. The Tauri IPC mock is already in place via `setup.ts`. Override per-test with `vi.mocked(invoke).mockResolvedValueOnce(...)`.
4. Run `npm run test:unit:watch` for live feedback while writing.

### Example: pure function test

```ts
import { describe, it, expect } from "vitest";
import { myPureFunction } from "../myService";

describe("myPureFunction", () => {
  it("returns expected output", () => {
    expect(myPureFunction("input")).toBe("expected");
  });
});
```

### Example: hook test

```ts
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { useMyHook } from "../useMyHook";

vi.mock("../tauriValidation", () => ({
  invokeValidated: vi.fn(),
}));

describe("useMyHook", () => {
  it("calls invoke on action", async () => {
    const { result } = renderHook(() => useMyHook());
    await act(async () => { result.current.doSomething(); });
    expect(invoke).toHaveBeenCalled();
  });
});
```

---

## CI integration

Tests run automatically via `.github/workflows/test.yml` on every push to `main`
and on every pull request. The workflow runs on `ubuntu-latest` and installs
Linux system dependencies required by Tauri before running the Rust tests.

Steps in order:
1. Install Node 22, Java 17 (Temurin), Rust stable
2. `npm ci`
3. `npm run lint` + `npm run typecheck`
4. Install Linux system deps (GTK, WebKit, etc.) then `npm run cargo:test`
5. `cd java-parser && gradle test --no-daemon`
6. `cd jshell-bridge && gradle test --no-daemon`
7. `npm run test:unit`
8. Playwright install + `npm run test:e2e`

The same lint + typecheck + Rust + Vitest gate is also wired into both release
workflows (Windows and macOS builds) before the build steps run.
