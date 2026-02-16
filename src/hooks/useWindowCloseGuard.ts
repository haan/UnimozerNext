import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useRef } from "react";

type UseWindowCloseGuardArgs = {
  awaitBeforeExit: () => Promise<void>;
  onCloseRequested: () => void;
  shouldHandleCloseRequest?: () => boolean;
};

export const useWindowCloseGuard = ({
  awaitBeforeExit,
  onCloseRequested,
  shouldHandleCloseRequest
}: UseWindowCloseGuardArgs): (() => void) => {
  const allowWindowCloseRef = useRef(false);
  const closeRequestedUnlistenRef = useRef<(() => void) | null>(null);
  const onCloseRequestedRef = useRef(onCloseRequested);
  const shouldHandleCloseRequestRef = useRef(shouldHandleCloseRequest);

  useEffect(() => {
    onCloseRequestedRef.current = onCloseRequested;
  }, [onCloseRequested]);

  useEffect(() => {
    shouldHandleCloseRequestRef.current = shouldHandleCloseRequest;
  }, [shouldHandleCloseRequest]);

  const handleExit = useCallback(() => {
    const closeWindow = async () => {
      await awaitBeforeExit();
      const unlisten = closeRequestedUnlistenRef.current;
      if (unlisten) {
        closeRequestedUnlistenRef.current = null;
        unlisten();
      }
      const window = getCurrentWindow();
      allowWindowCloseRef.current = true;
      await window.close();
    };
    void closeWindow().catch(() => undefined);
  }, [awaitBeforeExit]);

  useEffect(() => {
    let disposed = false;
    const window = getCurrentWindow();
    const register = async () => {
      const unlisten = await window.onCloseRequested((event) => {
        if (allowWindowCloseRef.current) {
          return;
        }
        event.preventDefault();
        if (shouldHandleCloseRequestRef.current && !shouldHandleCloseRequestRef.current()) {
          return;
        }
        onCloseRequestedRef.current();
      });
      if (disposed) {
        unlisten();
        return;
      }
      closeRequestedUnlistenRef.current = unlisten;
    };
    void register();
    return () => {
      disposed = true;
      const unlisten = closeRequestedUnlistenRef.current;
      if (unlisten) {
        closeRequestedUnlistenRef.current = null;
        unlisten();
      }
    };
  }, []);

  return handleExit;
};
