import AppContainer from "./AppContainer";
import { useAppSettings } from "./hooks/useAppSettings";
import type { AppSettings } from "./models/settings";
import type { Dispatch, SetStateAction } from "react";

type LoadedAppSettings = {
  settings: AppSettings;
  settingsOpen: boolean;
  setSettingsOpen: Dispatch<SetStateAction<boolean>>;
  handleSettingsChange: (next: AppSettings) => void;
  updateUmlSplitRatioSetting: (ratio: number) => void;
  updateConsoleSplitRatioSetting: (ratio: number) => void;
  updateObjectBenchSplitRatioSetting: (ratio: number) => void;
};

export default function App() {
  const appSettings = useAppSettings();
  if (appSettings.settingsLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading settings...
      </div>
    );
  }
  if (!appSettings.settings) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-destructive">
        {appSettings.settingsError ?? "Failed to load settings."}
      </div>
    );
  }

  const {
    settings,
    settingsOpen,
    setSettingsOpen,
    handleSettingsChange,
    updateUmlSplitRatioSetting,
    updateConsoleSplitRatioSetting,
    updateObjectBenchSplitRatioSetting
  } = appSettings as LoadedAppSettings;

  return (
    <AppContainer
      settings={settings}
      settingsOpen={settingsOpen}
      setSettingsOpen={setSettingsOpen}
      handleSettingsChange={handleSettingsChange}
      updateUmlSplitRatioSetting={updateUmlSplitRatioSetting}
      updateConsoleSplitRatioSetting={updateConsoleSplitRatioSetting}
      updateObjectBenchSplitRatioSetting={updateObjectBenchSplitRatioSetting}
    />
  );
}
