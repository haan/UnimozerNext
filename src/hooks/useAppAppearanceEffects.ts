import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect } from "react";

import { getThemeColors } from "../services/monacoThemes";
import { toDisplayPath } from "../services/paths";

const STRUCTOGRAM_LIGHT_DEFAULTS = {
  loopHeader: "#d2ebd3",
  ifHeader: "#cec1eb",
  switchHeader: "#d6e1ee",
  tryWrapper: "#f3e2c2"
};

const STRUCTOGRAM_DARK_DEFAULTS = {
  loopHeader: "#2f5a44",
  ifHeader: "#4a3f6b",
  switchHeader: "#2f4f6b",
  tryWrapper: "#5b4a32"
};

const normalizeHexColor = (value: string) => {
  const normalized = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(normalized)) {
    return normalized;
  }
  const shortHex = normalized.match(/^#([0-9a-f]{3})$/);
  if (!shortHex) {
    return normalized;
  }
  const [r, g, b] = shortHex[1].split("");
  return `#${r}${r}${g}${g}${b}${b}`;
};

const resolveStructogramColor = (
  configuredColor: string,
  lightDefault: string,
  darkDefault: string,
  darkMode: boolean
) => {
  if (!darkMode) {
    return configuredColor;
  }
  return normalizeHexColor(configuredColor) === normalizeHexColor(lightDefault)
    ? darkDefault
    : configuredColor;
};

type UseAppAppearanceEffectsArgs = {
  titlePrefix: string;
  projectPath: string | null;
  projectStorageMode: "folder" | "packed" | "scratch" | null;
  packedArchivePath: string | null;
  darkMode: boolean;
  editorTheme: string;
  structogramLoopHeaderColor: string;
  structogramIfHeaderColor: string;
  structogramSwitchHeaderColor: string;
  structogramTryWrapperColor: string;
  debugLogging: boolean;
  appendConsoleOutput: (text: string) => void;
};

export const useAppAppearanceEffects = ({
  titlePrefix,
  projectPath,
  projectStorageMode,
  packedArchivePath,
  darkMode,
  editorTheme,
  structogramLoopHeaderColor,
  structogramIfHeaderColor,
  structogramSwitchHeaderColor,
  structogramTryWrapperColor,
  debugLogging,
  appendConsoleOutput
}: UseAppAppearanceEffectsArgs) => {
  useEffect(() => {
    const window = getCurrentWindow();
    const titleValue =
      projectStorageMode === "scratch"
        ? "Unsaved Project"
        : projectStorageMode === "packed"
          ? packedArchivePath ?? projectPath
          : projectPath;
    const nextTitle = titleValue
      ? `${titlePrefix} - ${toDisplayPath(titleValue)}`
      : titlePrefix;
    window.setTitle(nextTitle).catch(() => undefined);
  }, [packedArchivePath, projectPath, projectStorageMode, titlePrefix]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = darkMode ? "dark" : "light";
    root.style.colorScheme = darkMode ? "dark" : "light";
  }, [darkMode]);

  useEffect(() => {
    if (typeof navigator === "undefined") {
      return;
    }
    if (!navigator.userAgent.toLowerCase().includes("windows")) {
      return;
    }
    const window = getCurrentWindow();
    window.setTheme(darkMode ? "dark" : "light").catch(() => undefined);
  }, [darkMode]);

  useEffect(() => {
    const root = document.documentElement;
    if (editorTheme === "default") {
      root.style.removeProperty("--editor-separator-color");
      root.style.removeProperty("--editor-separator-hover");
      return;
    }

    let cancelled = false;
    const applyTheme = async () => {
      const colors = await getThemeColors(editorTheme);
      if (cancelled) return;
      if (!colors) {
        root.style.removeProperty("--editor-separator-color");
        root.style.removeProperty("--editor-separator-hover");
        return;
      }
      const separatorColor =
        colors.lineHighlightBorder ?? colors.lineHighlightBackground ?? null;
      if (separatorColor) {
        root.style.setProperty("--editor-separator-color", separatorColor);
        root.style.setProperty("--editor-separator-hover", separatorColor);
      } else {
        root.style.removeProperty("--editor-separator-color");
        root.style.removeProperty("--editor-separator-hover");
      }
    };
    void applyTheme();
    return () => {
      cancelled = true;
    };
  }, [editorTheme]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty(
      "--structogram-loop-header",
      resolveStructogramColor(
        structogramLoopHeaderColor,
        STRUCTOGRAM_LIGHT_DEFAULTS.loopHeader,
        STRUCTOGRAM_DARK_DEFAULTS.loopHeader,
        darkMode
      )
    );
    root.style.setProperty(
      "--structogram-if-header",
      resolveStructogramColor(
        structogramIfHeaderColor,
        STRUCTOGRAM_LIGHT_DEFAULTS.ifHeader,
        STRUCTOGRAM_DARK_DEFAULTS.ifHeader,
        darkMode
      )
    );
    root.style.setProperty(
      "--structogram-switch-header",
      resolveStructogramColor(
        structogramSwitchHeaderColor,
        STRUCTOGRAM_LIGHT_DEFAULTS.switchHeader,
        STRUCTOGRAM_DARK_DEFAULTS.switchHeader,
        darkMode
      )
    );
    root.style.setProperty(
      "--structogram-try-wrapper",
      resolveStructogramColor(
        structogramTryWrapperColor,
        STRUCTOGRAM_LIGHT_DEFAULTS.tryWrapper,
        STRUCTOGRAM_DARK_DEFAULTS.tryWrapper,
        darkMode
      )
    );
  }, [
    darkMode,
    structogramIfHeaderColor,
    structogramLoopHeaderColor,
    structogramSwitchHeaderColor,
    structogramTryWrapperColor
  ]);

  useEffect(() => {
    if (!debugLogging) return;
    let active = true;
    const loadStartupLogs = async () => {
      try {
        const lines = await invoke<string[]>("take_startup_logs");
        if (!active || !lines.length) return;
        lines.forEach((line) => appendConsoleOutput(line));
      } catch {
        // Ignore startup log failures.
      }
    };
    void loadStartupLogs();
    return () => {
      active = false;
    };
  }, [appendConsoleOutput, debugLogging]);
};
