import { invoke } from "@tauri-apps/api/core";

const CRASH_TAG = "[crash]";
const CRASH_EVENT_NAME = "unimozer:frontend-crash-lines";
const MAX_LINE_CHARS = 4000;
const MAX_STACK_LINES = 40;

type CrashSnapshot = {
  message: string;
  stackLines: string[];
};

let globalHandlersInstalled = false;
let writeQueue: Promise<void> = Promise.resolve();
const pendingConsoleLines: string[] = [];

const truncate = (value: string, max = MAX_LINE_CHARS): string =>
  value.length > max ? `${value.slice(0, max)}...` : value;

const normalizeLine = (value: string): string => truncate(value.replace(/\r/g, ""));

const normalizeLines = (lines: string[]): string[] =>
  lines
    .flatMap((line) => line.split("\n"))
    .map((line) => normalizeLine(line))
    .filter((line) => line.length > 0);

const toDisplayText = (value: unknown): string => {
  if (value instanceof Error) {
    return value.message || value.name;
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const toCrashSnapshot = (value: unknown): CrashSnapshot => {
  if (value instanceof Error) {
    return {
      message: value.message || value.name || "Unknown error",
      stackLines: (value.stack ?? "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .slice(0, MAX_STACK_LINES)
    };
  }
  return {
    message: toDisplayText(value),
    stackLines: []
  };
};

const emitConsoleLines = (lines: string[]) => {
  const normalized = normalizeLines(lines);
  if (!normalized.length) {
    return;
  }
  pendingConsoleLines.push(...normalized);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(CRASH_EVENT_NAME, {
        detail: { lines: normalized }
      })
    );
  }
};

const persistCrashLines = (lines: string[]) => {
  const normalized = normalizeLines(lines);
  if (!normalized.length) {
    return;
  }
  writeQueue = writeQueue
    .catch(() => {})
    .then(async () => {
      try {
        await invoke<void>("append_crash_log", { lines: normalized });
      } catch (error) {
        const fallback = `${CRASH_TAG} failed to persist crash log: ${toDisplayText(error)}`;
        emitConsoleLines([fallback]);
        console.error(fallback, error);
      }
    });
};

export const reportFrontendCrash = (
  kind: string,
  error: unknown,
  contextLines: string[] = []
): void => {
  const snapshot = toCrashSnapshot(error);
  const timestamp = new Date().toISOString();
  const prefix = `${CRASH_TAG} ${timestamp} ${kind}`;
  const lines = [
    `${prefix}: ${snapshot.message}`,
    ...contextLines.map((line) => `${CRASH_TAG} ${line}`),
    ...snapshot.stackLines.map((line) => `${CRASH_TAG} ${line}`)
  ];
  emitConsoleLines(lines);
  persistCrashLines(lines);
};

export const installGlobalCrashHandlers = (): void => {
  if (globalHandlersInstalled || typeof window === "undefined") {
    return;
  }
  globalHandlersInstalled = true;

  window.addEventListener("error", (event) => {
    const location =
      event.filename && event.lineno
        ? `${event.filename}:${event.lineno}:${event.colno}`
        : "unknown location";
    const context = [`href=${window.location.href}`, `source=${location}`];
    reportFrontendCrash("window.error", event.error ?? event.message, context);
  });

  window.addEventListener("unhandledrejection", (event) => {
    reportFrontendCrash("window.unhandledrejection", event.reason, [
      `href=${window.location.href}`
    ]);
  });
};

export const consumePendingCrashConsoleLines = (): string[] => {
  if (!pendingConsoleLines.length) {
    return [];
  }
  const out = pendingConsoleLines.slice();
  pendingConsoleLines.length = 0;
  return out;
};

export const listenForCrashConsoleLines = (
  listener: (line: string) => void
): (() => void) => {
  if (typeof window === "undefined") {
    return () => {};
  }
  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<{ lines?: string[] }>;
    const lines = customEvent.detail?.lines;
    if (!lines?.length) {
      return;
    }
    lines.forEach((line) => listener(line));
  };
  window.addEventListener(CRASH_EVENT_NAME, handler as EventListener);
  return () => {
    window.removeEventListener(CRASH_EVENT_NAME, handler as EventListener);
  };
};
