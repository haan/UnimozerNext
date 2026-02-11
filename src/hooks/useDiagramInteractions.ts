import { invoke } from "@tauri-apps/api/core";
import { useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import { UML_REVEAL_REQUEST_TTL_SECONDS } from "../constants/app";
import type { DiagramState, DiagramViewport } from "../models/diagram";
import type { UmlNode, UmlGraph } from "../models/uml";
import { basename } from "../services/paths";

export type PendingRevealRequest = {
  path: string;
  line: number;
  column: number;
  durationSeconds: number;
  requestedAtMs: number;
};

type UseDiagramInteractionsArgs = {
  umlGraph: UmlGraph | null;
  diagramPath: string | null;
  setDiagramState: Dispatch<SetStateAction<DiagramState | null>>;
  requestPackedArchiveSync: () => void;
  pendingRevealRef: MutableRefObject<PendingRevealRequest | null>;
  appendDebugOutput: (text: string) => void;
  openFileByPath: (path: string) => Promise<void>;
  openFilePath: string | null;
  applyPendingReveal: () => void;
  clearPendingReveal: () => void;
  setSelectedClassId: Dispatch<SetStateAction<string | null>>;
};

type UseDiagramInteractionsResult = {
  handleNodePositionChange: (id: string, x: number, y: number, commit: boolean) => void;
  handleViewportChange: (viewport: DiagramViewport, commit: boolean) => void;
  handleNodeSelect: (id: string) => void;
  handleFieldSelect: (field: UmlNode["fields"][number], node: UmlNode) => void;
  handleMethodSelect: (method: UmlNode["methods"][number], node: UmlNode) => void;
};

export const useDiagramInteractions = ({
  umlGraph,
  diagramPath,
  setDiagramState,
  requestPackedArchiveSync,
  pendingRevealRef,
  appendDebugOutput,
  openFileByPath,
  openFilePath,
  applyPendingReveal,
  clearPendingReveal,
  setSelectedClassId
}: UseDiagramInteractionsArgs): UseDiagramInteractionsResult => {
  const handleNodePositionChange = useCallback(
    (id: string, x: number, y: number, commit: boolean) => {
      let nextToPersist: DiagramState | null = null;
      setDiagramState((prev) => {
        if (!prev) return prev;
        const current = prev.nodes[id];
        const isSamePosition = Boolean(current && current.x === x && current.y === y);
        if (isSamePosition) {
          if (commit) {
            nextToPersist = prev;
          }
          return prev;
        }
        const next = {
          ...prev,
          nodes: {
            ...prev.nodes,
            [id]: { x, y }
          }
        };
        if (commit) {
          nextToPersist = next;
        }
        return next;
      });
      if (!commit || !diagramPath || !nextToPersist) {
        return;
      }
      void invoke("write_text_file", {
        path: diagramPath,
        contents: JSON.stringify(nextToPersist, null, 2)
      })
        .then(() => {
          requestPackedArchiveSync();
        })
        .catch(() => undefined);
    },
    [diagramPath, requestPackedArchiveSync, setDiagramState]
  );

  const handleViewportChange = useCallback(
    (viewport: DiagramViewport, commit: boolean) => {
      let nextToPersist: DiagramState | null = null;
      setDiagramState((prev) => {
        if (!prev) return prev;
        const current = prev.viewport;
        const unchanged =
          current.panX === viewport.panX &&
          current.panY === viewport.panY &&
          current.zoom === viewport.zoom;
        if (unchanged) {
          if (commit) {
            nextToPersist = prev;
          }
          return prev;
        }
        const next = {
          ...prev,
          viewport
        };
        if (commit) {
          nextToPersist = next;
        }
        return next;
      });

      if (!commit || !diagramPath || !nextToPersist) {
        return;
      }

      void invoke("write_text_file", {
        path: diagramPath,
        contents: JSON.stringify(nextToPersist, null, 2)
      })
        .then(() => {
          requestPackedArchiveSync();
        })
        .catch(() => undefined);
    },
    [diagramPath, requestPackedArchiveSync, setDiagramState]
  );

  const getNodeById = useCallback(
    (id: string) => umlGraph?.nodes.find((item) => item.id === id) ?? null,
    [umlGraph]
  );

  const queueEditorReveal = useCallback(
    async (
      path: string,
      range: { startLine: number; startColumn: number },
      durationSeconds = UML_REVEAL_REQUEST_TTL_SECONDS
    ) => {
      if (!range?.startLine) return;
      pendingRevealRef.current = {
        path,
        line: range.startLine,
        column: range.startColumn ?? 1,
        durationSeconds,
        requestedAtMs: Date.now()
      };
      appendDebugOutput(
        `[UML] Reveal ${basename(path)} @ ${range.startLine}:${range.startColumn ?? 1}`
      );
      if (openFilePath !== path) {
        await openFileByPath(path);
      }
      applyPendingReveal();
    },
    [appendDebugOutput, applyPendingReveal, openFileByPath, openFilePath, pendingRevealRef]
  );

  const handleNodeSelect = useCallback(
    (id: string) => {
      const node = getNodeById(id);
      if (!node) return;
      clearPendingReveal();
      setSelectedClassId(node.id);
      void openFileByPath(node.path);
    },
    [clearPendingReveal, getNodeById, openFileByPath, setSelectedClassId]
  );

  const handleFieldSelect = useCallback(
    (field: UmlNode["fields"][number], node: UmlNode) => {
      setSelectedClassId(node.id);
      appendDebugOutput(
        `[UML] Field click ${node.name} :: ${field.signature} (${field.range ? "has range" : "no range"})`
      );
      if (field.range) {
        void queueEditorReveal(node.path, field.range);
      } else {
        clearPendingReveal();
        void openFileByPath(node.path);
      }
    },
    [appendDebugOutput, clearPendingReveal, openFileByPath, queueEditorReveal, setSelectedClassId]
  );

  const handleMethodSelect = useCallback(
    (method: UmlNode["methods"][number], node: UmlNode) => {
      setSelectedClassId(node.id);
      appendDebugOutput(
        `[UML] Method click ${node.name} :: ${method.signature} (${method.range ? "has range" : "no range"})`
      );
      if (method.range) {
        void queueEditorReveal(node.path, method.range);
      } else {
        clearPendingReveal();
        void openFileByPath(node.path);
      }
    },
    [appendDebugOutput, clearPendingReveal, openFileByPath, queueEditorReveal, setSelectedClassId]
  );

  return {
    handleNodePositionChange,
    handleViewportChange,
    handleNodeSelect,
    handleFieldSelect,
    handleMethodSelect
  };
};

