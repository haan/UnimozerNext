import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { DiagramViewMode } from "../components/diagram/DiagramPanel";
import type { AppSettings } from "../models/settings";

type UseMenuPreferenceActionsArgs = {
  settings: AppSettings;
  handleSettingsChange: (next: AppSettings) => void;
  setLeftPanelViewMode: Dispatch<SetStateAction<DiagramViewMode>>;
};

type UseMenuPreferenceActionsResult = {
  handleToggleShowPrivate: (value: boolean) => void;
  handleToggleShowInherited: (value: boolean) => void;
  handleToggleShowStatic: (value: boolean) => void;
  handleToggleShowDependencies: (value: boolean) => void;
  handleToggleShowPackages: (value: boolean) => void;
  handleToggleShowSwingAttributes: (value: boolean) => void;
  handleToggleStructogramMode: (value: boolean) => void;
  handleToggleStructogramColors: (value: boolean) => void;
  handleToggleWordWrap: (value: boolean) => void;
  handleToggleScopeHighlighting: (value: boolean) => void;
};

export const useMenuPreferenceActions = ({
  settings,
  handleSettingsChange,
  setLeftPanelViewMode
}: UseMenuPreferenceActionsArgs): UseMenuPreferenceActionsResult => {
  const updateUmlSettings = useCallback(
    (partial: Partial<typeof settings.uml>) => {
      handleSettingsChange({
        ...settings,
        uml: {
          ...settings.uml,
          ...partial
        }
      });
    },
    [handleSettingsChange, settings]
  );

  const updateObjectBenchSettings = useCallback(
    (partial: Partial<typeof settings.objectBench>) => {
      handleSettingsChange({
        ...settings,
        objectBench: {
          ...settings.objectBench,
          ...partial
        }
      });
    },
    [handleSettingsChange, settings]
  );

  const handleToggleShowPrivate = useCallback(
    (value: boolean) => {
      updateObjectBenchSettings({ showPrivateObjectFields: value });
    },
    [updateObjectBenchSettings]
  );

  const handleToggleShowInherited = useCallback(
    (value: boolean) => {
      updateObjectBenchSettings({ showInheritedObjectFields: value });
    },
    [updateObjectBenchSettings]
  );

  const handleToggleShowStatic = useCallback(
    (value: boolean) => {
      updateObjectBenchSettings({ showStaticObjectFields: value });
    },
    [updateObjectBenchSettings]
  );

  const handleToggleShowDependencies = useCallback(
    (value: boolean) => {
      updateUmlSettings({ showDependencies: value });
    },
    [updateUmlSettings]
  );

  const handleToggleShowPackages = useCallback(
    (value: boolean) => {
      updateUmlSettings({ showPackages: value });
    },
    [updateUmlSettings]
  );

  const handleToggleShowSwingAttributes = useCallback(
    (value: boolean) => {
      updateUmlSettings({ showSwingAttributes: value });
    },
    [updateUmlSettings]
  );

  const handleToggleStructogramMode = useCallback(
    (value: boolean) => {
      setLeftPanelViewMode(value ? "structogram" : "uml");
    },
    [setLeftPanelViewMode]
  );

  const handleToggleStructogramColors = useCallback(
    (value: boolean) => {
      handleSettingsChange({
        ...settings,
        advanced: {
          ...settings.advanced,
          structogramColors: value
        }
      });
    },
    [handleSettingsChange, settings]
  );

  const handleToggleWordWrap = useCallback(
    (value: boolean) => {
      handleSettingsChange({
        ...settings,
        editor: {
          ...settings.editor,
          wordWrap: value
        }
      });
    },
    [handleSettingsChange, settings]
  );

  const handleToggleScopeHighlighting = useCallback(
    (value: boolean) => {
      handleSettingsChange({
        ...settings,
        editor: {
          ...settings.editor,
          scopeHighlighting: value
        }
      });
    },
    [handleSettingsChange, settings]
  );

  return {
    handleToggleShowPrivate,
    handleToggleShowInherited,
    handleToggleShowStatic,
    handleToggleShowDependencies,
    handleToggleShowPackages,
    handleToggleShowSwingAttributes,
    handleToggleStructogramMode,
    handleToggleStructogramColors,
    handleToggleWordWrap,
    handleToggleScopeHighlighting
  };
};
