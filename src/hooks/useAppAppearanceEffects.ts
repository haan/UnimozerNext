import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef } from "react";

import { getThemeColors } from "../services/monacoThemes";
import { toDisplayPath } from "../services/paths";

type UseAppAppearanceEffectsArgs = {
  titlePrefix: string;
  projectPath: string | null;
  projectStorageMode: "folder" | "packed" | "scratch" | null;
  packedArchivePath: string | null;
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
  editorTheme,
  structogramLoopHeaderColor,
  structogramIfHeaderColor,
  structogramSwitchHeaderColor,
  structogramTryWrapperColor,
  debugLogging,
  appendConsoleOutput
}: UseAppAppearanceEffectsArgs) => {
  const consoleThemeDefaults = useRef<{ bg: string; fg: string } | null>(null);

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
    if (!consoleThemeDefaults.current) {
      const styles = getComputedStyle(root);
      consoleThemeDefaults.current = {
        bg: styles.getPropertyValue("--console-bg").trim(),
        fg: styles.getPropertyValue("--console-fg").trim()
      };
    }
    const defaults = consoleThemeDefaults.current;
    if (editorTheme === "default") {
      if (defaults) {
        root.style.setProperty("--console-bg", defaults.bg);
        root.style.setProperty("--console-fg", defaults.fg);
      }
      root.style.removeProperty("--editor-separator-color");
      root.style.removeProperty("--editor-separator-hover");
      return;
    }

    let cancelled = false;
    const applyTheme = async () => {
      const colors = await getThemeColors(editorTheme);
      if (cancelled) return;
      if (!colors || (!colors.background && !colors.foreground)) {
        if (defaults) {
          root.style.setProperty("--console-bg", defaults.bg);
          root.style.setProperty("--console-fg", defaults.fg);
        }
        root.style.removeProperty("--editor-separator-color");
        root.style.removeProperty("--editor-separator-hover");
        return;
      }
      if (colors.background) {
        root.style.setProperty("--console-bg", colors.background);
      }
      if (colors.foreground) {
        root.style.setProperty("--console-fg", colors.foreground);
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
    root.style.setProperty("--structogram-loop-header", structogramLoopHeaderColor);
    root.style.setProperty("--structogram-if-header", structogramIfHeaderColor);
    root.style.setProperty("--structogram-switch-header", structogramSwitchHeaderColor);
    root.style.setProperty("--structogram-try-wrapper", structogramTryWrapperColor);
  }, [
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
