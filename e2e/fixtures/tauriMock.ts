import { test as base } from "@playwright/test";

// Default mock AppSettings returned from read_settings.
const MOCK_SETTINGS = {
  general: { fontSize: 14, darkMode: false, fontFamily: "JetBrains Mono", highContrast: false },
  uml: {
    showDependencies: true,
    codeHighlight: true,
    showPackages: false,
    showSwingAttributes: false,
    showParameterNames: true,
    edgeStrokeWidth: 1,
    lineHeight: 1.6,
  },
  objectBench: {
    showPrivateObjectFields: false,
    showInheritedObjectFields: false,
    showStaticObjectFields: false,
    useObjectParameterDropdowns: false,
  },
  editor: {
    theme: "vs-dark",
    tabSize: 4,
    insertSpaces: true,
    autoCloseBrackets: true,
    autoCloseQuotes: true,
    autoCloseComments: true,
    wordWrap: false,
    scopeHighlighting: true,
    autoFormatOnSave: false,
  },
  advanced: {
    debugLogging: false,
    debugLogCategories: {
      startup: false,
      launch: false,
      languageServer: false,
      editor: false,
      uml: false,
      structogram: false,
      jshell: false,
    },
    updateChannel: "stable",
  },
  structogram: {
    colorsEnabled: true,
    loopHeaderColor: "#4a90d9",
    ifHeaderColor: "#e8a838",
    switchHeaderColor: "#7c4dff",
    tryWrapperColor: "#2ea44f",
  },
  recentProjects: [],
  layout: {
    umlSplitRatio: 0.65,
    consoleSplitRatio: 0.3,
    objectBenchSplitRatio: 0.25,
  },
};

// Default IPC responses keyed by command name (after stripping plugin prefix).
const DEFAULT_RESPONSES: Record<string, unknown> = {
  read_settings: MOCK_SETTINGS,
  read_default_settings: MOCK_SETTINGS,
  write_settings: null,
  get_platform: "windows",
  check_for_updates: null,
  get_windows_mapped_drive_aliases: [],
  // Window plugin commands — no-ops in the browser.
  set_title: null,
  set_theme: null,
  set_decorations: null,
  // Event plugin commands — listen returns an eventId; unlisten is a no-op.
  listen: 1,
  unlisten: null,
};

// Extend the base Playwright `test` to inject a complete window.__TAURI_INTERNALS__ shim
// before page scripts run, so that all Tauri API calls succeed in the browser.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript((defaultResponses: Record<string, unknown>) => {
      let nextEventId = 1;

      // ---------------------------------------------------------------
      // Core internals: invoke + transformCallback + metadata
      // ---------------------------------------------------------------
      (window as Record<string, unknown>)["__TAURI_INTERNALS__"] = {
        // Metadata needed by @tauri-apps/api/window's getCurrentWindow().
        metadata: {
          currentWindow: { label: "main" },
          windows: [{ label: "main" }],
        },

        transformCallback(_callback: (value: unknown) => void, _once: boolean) {
          // Return a numeric id; the callback registration is unused since
          // our invoke mock resolves synchronously rather than via IPC messages.
          return nextEventId++;
        },

        async invoke(cmd: string, _args: unknown, _options: unknown): Promise<unknown> {
          // Strip plugin prefix, e.g. "plugin:event|listen" → "listen"
          const key = typeof cmd === "string" ? cmd.replace(/^plugin:[^|]+\|/, "") : cmd;
          if (Object.prototype.hasOwnProperty.call(defaultResponses, key)) {
            // For listen, return a unique eventId each time.
            if (key === "listen") return Promise.resolve(nextEventId++);
            return Promise.resolve(defaultResponses[key]);
          }
          // Unknown commands resolve to null to avoid crashing the UI.
          return Promise.resolve(null);
        },
      };

      // ---------------------------------------------------------------
      // Event plugin internals: used by @tauri-apps/api/event's _unlisten.
      // ---------------------------------------------------------------
      (window as Record<string, unknown>)["__TAURI_EVENT_PLUGIN_INTERNALS__"] = {
        unregisterListener(_event: string, _eventId: number) {
          // No-op: we have no real event bus, so cleanup is a no-op.
        },
      };
    }, DEFAULT_RESPONSES);

    await use(page);
  },
});

export { expect } from "@playwright/test";
