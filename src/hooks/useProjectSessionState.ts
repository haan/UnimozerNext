import { useCallback, useReducer } from "react";
import type { SetStateAction } from "react";

import type { ProjectStorageMode } from "./useProjectIO";

type ProjectSessionState = {
  projectPath: string | null;
  projectStorageMode: ProjectStorageMode | null;
  packedArchivePath: string | null;
  status: string;
  busy: boolean;
  compileStatus: "success" | "failed" | null;
  diagramLayoutDirty: boolean;
  packedArchiveSyncFailed: boolean;
};

type ProjectSessionAction =
  | { type: "setProjectPath"; value: SetStateAction<string | null> }
  | { type: "setProjectStorageMode"; value: SetStateAction<ProjectStorageMode | null> }
  | { type: "setPackedArchivePath"; value: SetStateAction<string | null> }
  | { type: "setStatus"; value: SetStateAction<string> }
  | { type: "setBusy"; value: SetStateAction<boolean> }
  | { type: "setCompileStatus"; value: SetStateAction<"success" | "failed" | null> }
  | { type: "setDiagramLayoutDirty"; value: SetStateAction<boolean> }
  | { type: "setPackedArchiveSyncFailed"; value: SetStateAction<boolean> };

type ProjectSessionSetters = {
  setProjectPath: (value: SetStateAction<string | null>) => void;
  setProjectStorageMode: (value: SetStateAction<ProjectStorageMode | null>) => void;
  setPackedArchivePath: (value: SetStateAction<string | null>) => void;
  setStatus: (value: SetStateAction<string>) => void;
  setBusy: (value: SetStateAction<boolean>) => void;
  setCompileStatus: (value: SetStateAction<"success" | "failed" | null>) => void;
  setDiagramLayoutDirty: (value: SetStateAction<boolean>) => void;
  setPackedArchiveSyncFailed: (value: SetStateAction<boolean>) => void;
};

type UseProjectSessionStateResult = ProjectSessionState & ProjectSessionSetters;

const INITIAL_PROJECT_SESSION_STATE: ProjectSessionState = {
  projectPath: null,
  projectStorageMode: null,
  packedArchivePath: null,
  status: "Open a Java project to begin.",
  busy: false,
  compileStatus: null,
  diagramLayoutDirty: false,
  packedArchiveSyncFailed: false
};

const resolveSetStateAction = <T,>(previous: T, action: SetStateAction<T>): T =>
  typeof action === "function"
    ? (action as (previous: T) => T)(previous)
    : action;

const projectSessionReducer = (
  state: ProjectSessionState,
  action: ProjectSessionAction
): ProjectSessionState => {
  switch (action.type) {
    case "setProjectPath":
      return {
        ...state,
        projectPath: resolveSetStateAction(state.projectPath, action.value)
      };
    case "setProjectStorageMode":
      return {
        ...state,
        projectStorageMode: resolveSetStateAction(state.projectStorageMode, action.value)
      };
    case "setPackedArchivePath":
      return {
        ...state,
        packedArchivePath: resolveSetStateAction(state.packedArchivePath, action.value)
      };
    case "setStatus":
      return {
        ...state,
        status: resolveSetStateAction(state.status, action.value)
      };
    case "setBusy":
      return {
        ...state,
        busy: resolveSetStateAction(state.busy, action.value)
      };
    case "setCompileStatus":
      return {
        ...state,
        compileStatus: resolveSetStateAction(state.compileStatus, action.value)
      };
    case "setDiagramLayoutDirty":
      return {
        ...state,
        diagramLayoutDirty: resolveSetStateAction(state.diagramLayoutDirty, action.value)
      };
    case "setPackedArchiveSyncFailed":
      return {
        ...state,
        packedArchiveSyncFailed: resolveSetStateAction(state.packedArchiveSyncFailed, action.value)
      };
    default:
      return state;
  }
};

export const useProjectSessionState = (): UseProjectSessionStateResult => {
  const [state, dispatch] = useReducer(projectSessionReducer, INITIAL_PROJECT_SESSION_STATE);

  const setProjectPath = useCallback((value: SetStateAction<string | null>) => {
    dispatch({ type: "setProjectPath", value });
  }, []);

  const setProjectStorageMode = useCallback(
    (value: SetStateAction<ProjectStorageMode | null>) => {
      dispatch({ type: "setProjectStorageMode", value });
    },
    []
  );

  const setPackedArchivePath = useCallback((value: SetStateAction<string | null>) => {
    dispatch({ type: "setPackedArchivePath", value });
  }, []);

  const setStatus = useCallback((value: SetStateAction<string>) => {
    dispatch({ type: "setStatus", value });
  }, []);

  const setBusy = useCallback((value: SetStateAction<boolean>) => {
    dispatch({ type: "setBusy", value });
  }, []);

  const setCompileStatus = useCallback(
    (value: SetStateAction<"success" | "failed" | null>) => {
      dispatch({ type: "setCompileStatus", value });
    },
    []
  );
  const setDiagramLayoutDirty = useCallback((value: SetStateAction<boolean>) => {
    dispatch({ type: "setDiagramLayoutDirty", value });
  }, []);
  const setPackedArchiveSyncFailed = useCallback((value: SetStateAction<boolean>) => {
    dispatch({ type: "setPackedArchiveSyncFailed", value });
  }, []);

  return {
    ...state,
    setProjectPath,
    setProjectStorageMode,
    setPackedArchivePath,
    setStatus,
    setBusy,
    setCompileStatus,
    setDiagramLayoutDirty,
    setPackedArchiveSyncFailed
  };
};
