import { useMemo } from "react";

import type { DiagramViewMode } from "../components/diagram/DiagramPanel";

type UseAppMenuStateArgs = {
  busy: boolean;
  hasPendingProjectChanges: boolean;
  projectName: string;
  isMac: boolean;
  editDisabled: boolean;
  zoomDisabled: boolean;
  canAddClass: boolean;
  canAddConstructor: boolean;
  canAddField: boolean;
  canAddMethod: boolean;
  canCompileClass: boolean;
  canExportDiagram: boolean;
  canExportStructogram: boolean;
  showPrivateObjectFields: boolean;
  showInheritedObjectFields: boolean;
  showStaticObjectFields: boolean;
  showDependencies: boolean;
  showPackages: boolean;
  showSwingAttributes: boolean;
  canUseStructogramMode: boolean;
  leftPanelViewMode: DiagramViewMode;
  structogramColorsEnabled: boolean;
  wordWrap: boolean;
};

export type AppMenuState = {
  busy: boolean;
  hasUnsavedChanges: boolean;
  projectName: string;
  isMac: boolean;
  editDisabled: boolean;
  zoomDisabled: boolean;
  canAddClass: boolean;
  canAddConstructor: boolean;
  canAddField: boolean;
  canAddMethod: boolean;
  canCompileClass: boolean;
  canExportDiagram: boolean;
  canExportStructogram: boolean;
  showPrivateObjectFields: boolean;
  showInheritedObjectFields: boolean;
  showStaticObjectFields: boolean;
  showDependencies: boolean;
  showPackages: boolean;
  showSwingAttributes: boolean;
  canUseStructogramMode: boolean;
  structogramMode: boolean;
  structogramColorsEnabled: boolean;
  wordWrap: boolean;
};

export const useAppMenuState = ({
  busy,
  hasPendingProjectChanges,
  projectName,
  isMac,
  editDisabled,
  zoomDisabled,
  canAddClass,
  canAddConstructor,
  canAddField,
  canAddMethod,
  canCompileClass,
  canExportDiagram,
  canExportStructogram,
  showPrivateObjectFields,
  showInheritedObjectFields,
  showStaticObjectFields,
  showDependencies,
  showPackages,
  showSwingAttributes,
  canUseStructogramMode,
  leftPanelViewMode,
  structogramColorsEnabled,
  wordWrap
}: UseAppMenuStateArgs): AppMenuState =>
  useMemo(
    () => ({
      busy,
      hasUnsavedChanges: hasPendingProjectChanges,
      projectName,
      isMac,
      editDisabled,
      zoomDisabled,
      canAddClass,
      canAddConstructor,
      canAddField,
      canAddMethod,
      canCompileClass,
      canExportDiagram,
      canExportStructogram,
      showPrivateObjectFields,
      showInheritedObjectFields,
      showStaticObjectFields,
      showDependencies,
      showPackages,
      showSwingAttributes,
      canUseStructogramMode,
      structogramMode: leftPanelViewMode === "structogram",
      structogramColorsEnabled,
      wordWrap
    }),
    [
      busy,
      canAddClass,
      canAddConstructor,
      canAddField,
      canAddMethod,
      canCompileClass,
      canExportDiagram,
      canExportStructogram,
      canUseStructogramMode,
      editDisabled,
      hasPendingProjectChanges,
      isMac,
      leftPanelViewMode,
      projectName,
      showDependencies,
      showInheritedObjectFields,
      showPackages,
      showPrivateObjectFields,
      showStaticObjectFields,
      showSwingAttributes,
      structogramColorsEnabled,
      wordWrap,
      zoomDisabled
    ]
  );
