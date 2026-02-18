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
  showParameterNames: boolean;
  canUseStructogramMode: boolean;
  leftPanelViewMode: DiagramViewMode;
  structogramColorsEnabled: boolean;
  wordWrap: boolean;
  scopeHighlighting: boolean;
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
  showParameterNames: boolean;
  canUseStructogramMode: boolean;
  structogramMode: boolean;
  structogramColorsEnabled: boolean;
  wordWrap: boolean;
  scopeHighlighting: boolean;
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
  showParameterNames,
  canUseStructogramMode,
  leftPanelViewMode,
  structogramColorsEnabled,
  wordWrap,
  scopeHighlighting
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
      showParameterNames,
      canUseStructogramMode,
      structogramMode: leftPanelViewMode === "structogram",
      structogramColorsEnabled,
      wordWrap,
      scopeHighlighting
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
      showParameterNames,
      showPackages,
      showPrivateObjectFields,
      showStaticObjectFields,
      showSwingAttributes,
      structogramColorsEnabled,
      wordWrap,
      scopeHighlighting,
      zoomDisabled
    ]
  );
