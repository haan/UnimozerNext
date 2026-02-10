import { useCallback } from "react";
import { toast } from "sonner";
import type { MutableRefObject } from "react";

import type { UmlNode } from "../models/uml";
import type { ExportStyle, ExportControls } from "../components/diagram/UmlDiagram";
import type { StructogramExportControls } from "../components/structogram/StructogramView";

type ZoomControls = {
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
};

type UseMenuCommandActionsArgs = {
  selectedNode: UmlNode | null;
  zoomControlsRef: MutableRefObject<ZoomControls | null>;
  exportControlsRef: MutableRefObject<ExportControls | null>;
  structogramExportControlsRef: MutableRefObject<StructogramExportControls | null>;
  openAddClassDialog: () => void;
  openAddFieldDialog: (node: UmlNode) => void;
  openAddConstructorDialog: (node: UmlNode) => void;
  openAddMethodDialog: (node: UmlNode) => void;
  handleCompileProject: () => Promise<void>;
  setStatus: (status: string) => void;
};

type UseMenuCommandActionsResult = {
  handleMenuAddClass: () => void;
  handleMenuAddField: () => void;
  handleMenuAddConstructor: () => void;
  handleMenuAddMethod: () => void;
  handleMenuCompileProject: () => void;
  handleZoomIn: () => void;
  handleZoomOut: () => void;
  handleZoomReset: () => void;
  handleExportStatus: (message: string) => void;
  handleCopyDiagramPng: (style: ExportStyle) => void;
  handleExportDiagramPng: (style: ExportStyle) => void;
  handleCopyStructogramPng: () => void;
  handleExportStructogramPng: () => void;
};

export const useMenuCommandActions = ({
  selectedNode,
  zoomControlsRef,
  exportControlsRef,
  structogramExportControlsRef,
  openAddClassDialog,
  openAddFieldDialog,
  openAddConstructorDialog,
  openAddMethodDialog,
  handleCompileProject,
  setStatus
}: UseMenuCommandActionsArgs): UseMenuCommandActionsResult => {
  const handleMenuAddClass = useCallback(() => {
    openAddClassDialog();
  }, [openAddClassDialog]);

  const handleMenuAddConstructor = useCallback(() => {
    if (selectedNode) {
      openAddConstructorDialog(selectedNode);
    }
  }, [openAddConstructorDialog, selectedNode]);

  const handleMenuAddField = useCallback(() => {
    if (selectedNode) {
      openAddFieldDialog(selectedNode);
    }
  }, [openAddFieldDialog, selectedNode]);

  const handleMenuAddMethod = useCallback(() => {
    if (selectedNode) {
      openAddMethodDialog(selectedNode);
    }
  }, [openAddMethodDialog, selectedNode]);

  const handleMenuCompileProject = useCallback(() => {
    void handleCompileProject();
  }, [handleCompileProject]);

  const handleZoomIn = useCallback(() => {
    zoomControlsRef.current?.zoomIn();
  }, [zoomControlsRef]);

  const handleZoomOut = useCallback(() => {
    zoomControlsRef.current?.zoomOut();
  }, [zoomControlsRef]);

  const handleZoomReset = useCallback(() => {
    zoomControlsRef.current?.resetZoom();
  }, [zoomControlsRef]);

  const handleExportStatus = useCallback(
    (message: string) => {
      setStatus(message);
      const lowered = message.toLowerCase();
      if (lowered.startsWith("failed") || lowered.includes("failed")) {
        toast.error(message);
      } else {
        toast.success(message);
      }
    },
    [setStatus]
  );

  const handleCopyDiagramPng = useCallback((style: ExportStyle) => {
    exportControlsRef.current?.copyDiagramPng(style);
  }, [exportControlsRef]);

  const handleExportDiagramPng = useCallback((style: ExportStyle) => {
    exportControlsRef.current?.exportDiagramPng(style);
  }, [exportControlsRef]);

  const handleCopyStructogramPng = useCallback(() => {
    structogramExportControlsRef.current?.copyStructogramPng();
  }, [structogramExportControlsRef]);

  const handleExportStructogramPng = useCallback(() => {
    structogramExportControlsRef.current?.exportStructogramPng();
  }, [structogramExportControlsRef]);

  return {
    handleMenuAddClass,
    handleMenuAddField,
    handleMenuAddConstructor,
    handleMenuAddMethod,
    handleMenuCompileProject,
    handleZoomIn,
    handleZoomOut,
    handleZoomReset,
    handleExportStatus,
    handleCopyDiagramPng,
    handleExportDiagramPng,
    handleCopyStructogramPng,
    handleExportStructogramPng
  };
};
