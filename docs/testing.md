# Testing

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

The default gate (version consistency + lint + typecheck + Rust + Vitest) runs as one command:

```bash
npm run test
```

Everything including Java and Playwright (requires the [development prerequisites](../DEVELOPMENT.md#prerequisites), including JDK 25):

```bash
npx playwright install chromium
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
vi.mocked(invoke).mockResolvedValueOnce("folder"); // e.g. classify_project_path
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
Tauri APIs or the validation wrapper, depending on the behavior under test, so no real IPC is needed.

| File | Functions covered |
|------|-------------------|
| `useClassEditActions.test.ts` | `handleCreateClass`, `handleCreateField`, `handleCreateConstructor`, `handleCreateMethod` |
| `useClassRemovalActions.test.ts` | `confirmRemoveClass` |
| `useClassRenameActions.test.ts` | `deriveRenamedClassId`, `handleRenameClass` |
| `useAppUpdater.test.ts` | Installability, channel selection, update state, and install handling |
| `useLaunchBootstrap.test.tsx` | Startup completion and launch/open behavior |
| `useProjectDrop.test.ts` | Native event handling, overlay state, guards, errors, and listener cleanup |
| `useProjectActionFlow.test.ts` | Save/Discard/Cancel and pending project targets |
| `useProjectActionOrchestration.test.ts` | Project action routing and blocking |
| `useProjectIO.test.ts` | Shared menu/drop packed-project opening and error dialogs |

### Components (`src/components/*/__tests__/`)

| File | What is tested |
|------|----------------|
| `ui/__tests__/button.test.tsx` | Render, click, disabled state, variants, ref forwarding |
| `wizards/__tests__/AddClassDialog.test.tsx` | Form validation, submission payload, checkbox interactions |
| `diagram/__tests__/methodSignature.test.ts` | `formatMethodSignature` (raw vs reconstructed display) |
| `structogram/__tests__/layoutBuilder.test.ts` | `buildStructogramLayout` — statement, sequence, if/else, loop, switch, try/catch |

---

## Browser smoke tests and native coverage

`npm run test:e2e` runs Chromium against the Vite dev server using `playwright.config.ts`. Playwright starts the server automatically and reuses an existing server locally. The fixtures in `e2e/fixtures/tauriMock.ts` mock Tauri IPC and webview metadata. The current specs cover app launch, the welcome screen, and settings.

These are browser smoke tests, not tests against a running Tauri binary. They do not verify native file pickers, operating-system drag events, packaged runtime resources, or updater installation. Keep the mock aligned with the current Tauri webview API when changing startup or event handling.

Use a desktop build for native checks. For project drops, verify the overlay and opening over the editor, diagram, and console; Save/Discard/Cancel; multiple or unsupported items; invalid folders and corrupt archives; paths with spaces/non-ASCII characters; recent projects; and internal editor/diagram dragging. Verify that startup, busy states, and open dialogs block new drops. The [example projects](../examples/README.md) provide additional Java, diagram, console, and reload checks.

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
import { invokeValidated } from "../../services/tauriValidation";
import { useMyHook } from "../useMyHook";

vi.mock("../../services/tauriValidation", () => ({
  invokeValidated: vi.fn(),
}));

describe("useMyHook", () => {
  it("calls the validation wrapper on action", async () => {
    const { result } = renderHook(() => useMyHook());
    await act(async () => { await result.current.doSomething(); });
    expect(invokeValidated).toHaveBeenCalled();
  });
});
```

---

## CI integration

Tests run automatically via `.github/workflows/test.yml` on every push to `main`
and on every pull request. The workflow runs on `ubuntu-latest` and installs
Linux system dependencies required by Tauri before running the Rust tests.

Steps in order:
1. Install Node from `.node-version` and Rust stable
2. `npm ci`
3. `npm run check:versions` + `npm run lint` + `npm run typecheck`
4. Install Linux system deps (GTK, WebKit, etc.) then `npm run cargo:test`
5. `npm run test:unit`
6. Playwright install + `npm run test:e2e`

A separate Java bridge matrix runs on Windows, macOS, and Linux. It installs
Temurin Java 25, validates the committed Gradle Wrapper JARs, and exercises the
native wrapper launchers. It then runs `npm run test:java`, `npm run build:parser`,
and `npm run build:jshell` to verify both tests and JAR packaging through the
portable npm commands. Both bridges use Gradle 9.8.0 and target Java 25.

The separate `Release Builds` workflow checks version consistency and builds the
Java bridges and application bundles, but does not run the full test gate or
wait for `Test Suite`. Confirm the intended release commit has passed that
workflow before publishing.
