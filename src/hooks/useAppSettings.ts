import { useCallback, useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { AppSettings, RecentProjectEntry } from "../models/settings";
import { readSettings, writeSettings } from "../services/settings";

const DARK_MODE_STORAGE_KEY = "unimozer.darkMode";

const persistDarkModeHint = (darkMode: boolean) => {
  try {
    localStorage.setItem(DARK_MODE_STORAGE_KEY, darkMode ? "1" : "0");
  } catch {
    // Ignore storage access failures.
  }
};

type AppSettingsHook = {
  settings: AppSettings | null;
  setSettings: Dispatch<SetStateAction<AppSettings | null>>;
  settingsLoading: boolean;
  settingsError: string | null;
  settingsOpen: boolean;
  setSettingsOpen: Dispatch<SetStateAction<boolean>>;
  updateSettings: (updater: (prev: AppSettings) => AppSettings) => void;
  handleSettingsChange: (next: AppSettings) => void;
  updateUmlSplitRatioSetting: (ratio: number) => void;
  updateConsoleSplitRatioSetting: (ratio: number) => void;
  updateObjectBenchSplitRatioSetting: (ratio: number) => void;
};

const isRecentProjectKind = (value: unknown): value is RecentProjectEntry["kind"] =>
  value === "packed" || value === "folder";

const isRecentProjectEntry = (value: unknown): value is RecentProjectEntry => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as { path?: unknown; kind?: unknown };
  return typeof candidate.path === "string" && isRecentProjectKind(candidate.kind);
};

export const useAppSettings = (): AppSettingsHook => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadSettings = async () => {
      try {
        const stored = await readSettings();
        const parsed = stored as AppSettings;
        const recentProjects = Array.isArray(parsed.recentProjects)
          ? parsed.recentProjects.filter(isRecentProjectEntry)
          : [];
        const nextSettings: AppSettings = {
          ...parsed,
          recentProjects
        };
        if (!cancelled) {
          setSettings(nextSettings);
          persistDarkModeHint(nextSettings.general.darkMode);
          setSettingsError(null);
          setSettingsLoading(false);
        }
      } catch {
        if (!cancelled) {
          setSettings(null);
          setSettingsError("Failed to load settings.");
          setSettingsLoading(false);
        }
      }
    };
    void loadSettings();
    return () => {
      cancelled = true;
    };
  }, []);

  const updateSettings = useCallback((updater: (prev: AppSettings) => AppSettings) => {
    setSettings((prev) => {
      if (!prev) {
        return prev;
      }
      const next = updater(prev);
      persistDarkModeHint(next.general.darkMode);
      void writeSettings(next);
      return next;
    });
  }, []);

  const handleSettingsChange = useCallback((next: AppSettings) => {
    updateSettings(() => next);
  }, [updateSettings]);

  const updateUmlSplitRatioSetting = useCallback((ratio: number) => {
    updateSettings((prev) => ({
      ...prev,
      layout: {
        ...prev.layout,
        umlSplitRatio: ratio
      }
    }));
  }, [updateSettings]);

  const updateConsoleSplitRatioSetting = useCallback((ratio: number) => {
    updateSettings((prev) => ({
      ...prev,
      layout: {
        ...prev.layout,
        consoleSplitRatio: ratio
      }
    }));
  }, [updateSettings]);

  const updateObjectBenchSplitRatioSetting = useCallback((ratio: number) => {
    updateSettings((prev) => ({
      ...prev,
      layout: {
        ...prev.layout,
        objectBenchSplitRatio: ratio
      }
    }));
  }, [updateSettings]);

  return {
    settings,
    setSettings,
    settingsLoading,
    settingsError,
    settingsOpen,
    setSettingsOpen,
    updateSettings,
    handleSettingsChange,
    updateUmlSplitRatioSetting,
    updateConsoleSplitRatioSetting,
    updateObjectBenchSplitRatioSetting
  };
};
