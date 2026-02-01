import { useCallback, useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { AppSettings } from "../models/settings";
import { createDefaultSettings } from "../models/settings";
import { readSettings, writeSettings } from "../services/settings";

type AppSettingsHook = {
  settings: AppSettings;
  setSettings: Dispatch<SetStateAction<AppSettings>>;
  settingsOpen: boolean;
  setSettingsOpen: Dispatch<SetStateAction<boolean>>;
  handleSettingsChange: (next: AppSettings) => void;
  updateUmlSplitRatioSetting: (ratio: number) => void;
  updateConsoleSplitRatioSetting: (ratio: number) => void;
};

export const useAppSettings = (): AppSettingsHook => {
  const [settings, setSettings] = useState<AppSettings>(createDefaultSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadSettings = async () => {
      try {
        const stored = await readSettings();
        const defaults = createDefaultSettings();
        const merged: AppSettings = {
          ...defaults,
          ...stored,
          uml: {
            ...defaults.uml,
            ...(stored as AppSettings).uml
          },
          editor: {
            ...defaults.editor,
            ...(stored as AppSettings).editor
          },
          advanced: {
            ...defaults.advanced,
            ...(stored as AppSettings).advanced
          },
          layout: {
            ...defaults.layout,
            ...(stored as AppSettings).layout
          }
        };
        if (!cancelled) {
          setSettings(merged);
        }
      } catch {
        if (!cancelled) {
          setSettings(createDefaultSettings());
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
    void writeSettings(next);
  }, []);

  const updateUmlSplitRatioSetting = useCallback((ratio: number) => {
    setSettings((prev) => {
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

  return {
    settings,
    setSettings,
    settingsOpen,
    setSettingsOpen,
    handleSettingsChange,
    updateUmlSplitRatioSetting,
    updateConsoleSplitRatioSetting
  };
};
