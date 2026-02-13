import { useCallback, useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { AppSettings } from "../models/settings";
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
  handleSettingsChange: (next: AppSettings) => void;
  updateUmlSplitRatioSetting: (ratio: number) => void;
  updateConsoleSplitRatioSetting: (ratio: number) => void;
  updateObjectBenchSplitRatioSetting: (ratio: number) => void;
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
        if (!cancelled) {
          const parsed = stored as AppSettings;
          setSettings(parsed);
          persistDarkModeHint(parsed.general.darkMode);
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

  const handleSettingsChange = useCallback((next: AppSettings) => {
    setSettings(next);
    persistDarkModeHint(next.general.darkMode);
    void writeSettings(next);
  }, []);

  const updateUmlSplitRatioSetting = useCallback((ratio: number) => {
    setSettings((prev) => {
      if (!prev) {
        return prev;
      }
      const next = {
        ...prev,
        layout: {
          ...prev.layout,
          umlSplitRatio: ratio
        }
      };
      void writeSettings(next);
      return next;
    });
  }, []);

  const updateConsoleSplitRatioSetting = useCallback((ratio: number) => {
    setSettings((prev) => {
      if (!prev) {
        return prev;
      }
      const next = {
        ...prev,
        layout: {
          ...prev.layout,
          consoleSplitRatio: ratio
        }
      };
      void writeSettings(next);
      return next;
    });
  }, []);

  const updateObjectBenchSplitRatioSetting = useCallback((ratio: number) => {
    setSettings((prev) => {
      if (!prev) {
        return prev;
      }
      const next = {
        ...prev,
        layout: {
          ...prev.layout,
          objectBenchSplitRatio: ratio
        }
      };
      void writeSettings(next);
      return next;
    });
  }, []);

  return {
    settings,
    setSettings,
    settingsLoading,
    settingsError,
    settingsOpen,
    setSettingsOpen,
    handleSettingsChange,
    updateUmlSplitRatioSetting,
    updateConsoleSplitRatioSetting,
    updateObjectBenchSplitRatioSetting
  };
};
