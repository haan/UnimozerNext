import type { AdvancedSettings } from "../models/settings";

export type DebugLogCategory = keyof AdvancedSettings["debugLogCategories"];

export const DEFAULT_DEBUG_LOG_CATEGORIES: AdvancedSettings["debugLogCategories"] = {
  startup: true,
  launch: true,
  languageServer: true,
  editor: true,
  uml: true,
  structogram: true,
  jshell: true
};

export const DEBUG_LOG_CATEGORY_ORDER: DebugLogCategory[] = [
  "startup",
  "launch",
  "languageServer",
  "editor",
  "uml",
  "structogram",
  "jshell"
];

export const DEBUG_LOG_CATEGORY_LABELS: Record<
  DebugLogCategory,
  { title: string; description: string; tag: string }
> = {
  startup: {
    title: "Startup",
    description: "App startup environment diagnostics and resource resolution.",
    tag: "startup"
  },
  launch: {
    title: "Launch",
    description: "Launch/open queue handling and startup project selection flow.",
    tag: "launch"
  },
  languageServer: {
    title: "Language server",
    description: "JDTLS completion and editor synchronization diagnostics.",
    tag: "ls"
  },
  editor: {
    title: "Editor",
    description: "Monaco editor focus/cursor/change diagnostics.",
    tag: "editor"
  },
  uml: {
    title: "UML",
    description: "UML parse/reveal/click diagnostics.",
    tag: "uml"
  },
  structogram: {
    title: "Structogram",
    description: "Structogram resolution and method lookup diagnostics.",
    tag: "structogram"
  },
  jshell: {
    title: "JShell",
    description: "Object bench JShell eval/inspect/restart diagnostics.",
    tag: "jshell"
  }
};

export const ensureDebugLogPrefix = (category: DebugLogCategory, message: string): string => {
  const tag = DEBUG_LOG_CATEGORY_LABELS[category].tag;
  const prefix = `[${tag}]`;
  const trimmedStart = message.trimStart();
  if (trimmedStart.toLowerCase().startsWith(prefix.toLowerCase())) {
    return message;
  }
  return `${prefix} ${message}`;
};

