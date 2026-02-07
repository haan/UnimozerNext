import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  CONSOLE_MIN_HEIGHT_PX,
  DIAGRAM_EDITOR_SPLIT_MIN_PANEL_WIDTH_PX,
  EDITOR_MIN_HEIGHT_PX,
  HORIZONTAL_SPLIT_SNAP_RATIO,
  MAIN_SPLIT_SNAP_RATIO,
  SPLIT_SNAP_DISTANCE
} from "../constants/layout";

type UseSplitRatiosArgs = {
  umlSplitRatio: number;
  consoleSplitRatio: number;
  onCommitUmlSplitRatio: (ratio: number) => void;
  onCommitConsoleSplitRatio: (ratio: number) => void;
  minUmlPanel?: number;
  minEditorPanel?: number;
  minConsolePanel?: number;
  splitSnapDistance?: number;
  umlSplitSnapRatio?: number;
  consoleSplitSnapRatio?: number;
};

type UseSplitRatiosResult = {
  containerRef: RefObject<HTMLDivElement | null>;
  consoleContainerRef: RefObject<HTMLDivElement | null>;
  splitRatio: number;
  consoleSplitRatio: number;
  startUmlResize: (event: ReactPointerEvent<HTMLElement>) => void;
  startConsoleResize: (event: ReactPointerEvent<HTMLElement>) => void;
};

export const useSplitRatios = ({
  umlSplitRatio,
  consoleSplitRatio,
  onCommitUmlSplitRatio,
  onCommitConsoleSplitRatio,
  minUmlPanel = DIAGRAM_EDITOR_SPLIT_MIN_PANEL_WIDTH_PX,
  minEditorPanel = EDITOR_MIN_HEIGHT_PX,
  minConsolePanel = CONSOLE_MIN_HEIGHT_PX,
  splitSnapDistance = SPLIT_SNAP_DISTANCE,
  umlSplitSnapRatio = MAIN_SPLIT_SNAP_RATIO,
  consoleSplitSnapRatio = HORIZONTAL_SPLIT_SNAP_RATIO
}: UseSplitRatiosArgs): UseSplitRatiosResult => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const consoleContainerRef = useRef<HTMLDivElement | null>(null);
  const [splitRatio, setSplitRatio] = useState(umlSplitRatio);
  const [consoleSplit, setConsoleSplit] = useState(consoleSplitRatio);
  const splitRatioRef = useRef(splitRatio);
  const consoleSplitRatioRef = useRef(consoleSplit);
  const [isResizing, setIsResizing] = useState(false);
  const [isConsoleResizing, setIsConsoleResizing] = useState(false);

  const snapRatio = useCallback(
    (ratio: number, target: number) => {
      if (Math.abs(ratio - target) <= splitSnapDistance) {
        return target;
      }
      return ratio;
    },
    [splitSnapDistance]
  );

  useEffect(() => {
    setSplitRatio(umlSplitRatio);
  }, [umlSplitRatio]);

  useEffect(() => {
    setConsoleSplit(consoleSplitRatio);
  }, [consoleSplitRatio]);

  useEffect(() => {
    splitRatioRef.current = splitRatio;
  }, [splitRatio]);

  useEffect(() => {
    consoleSplitRatioRef.current = consoleSplit;
  }, [consoleSplit]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMove = (event: PointerEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      let x = event.clientX - rect.left;
      x = Math.max(minUmlPanel, Math.min(rect.width - minUmlPanel, x));
      const ratio = x / rect.width;
      setSplitRatio(snapRatio(ratio, umlSplitSnapRatio));
    };

    const handleUp = () => {
      setIsResizing(false);
      const ratio = splitRatioRef.current;
      if (Number.isFinite(ratio)) {
        onCommitUmlSplitRatio(ratio);
      }
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);

    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [isResizing, minUmlPanel, onCommitUmlSplitRatio, snapRatio, umlSplitSnapRatio]);

  useEffect(() => {
    if (!isConsoleResizing) return;

    const handleMove = (event: PointerEvent) => {
      if (!consoleContainerRef.current) return;
      const rect = consoleContainerRef.current.getBoundingClientRect();
      let y = event.clientY - rect.top;
      y = Math.max(minEditorPanel, Math.min(rect.height - minConsolePanel, y));
      const ratio = y / rect.height;
      setConsoleSplit(snapRatio(ratio, consoleSplitSnapRatio));
    };

    const handleUp = () => {
      setIsConsoleResizing(false);
      const ratio = consoleSplitRatioRef.current;
      if (Number.isFinite(ratio)) {
        onCommitConsoleSplitRatio(ratio);
      }
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);

    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [
    consoleSplitSnapRatio,
    isConsoleResizing,
    minConsolePanel,
    minEditorPanel,
    onCommitConsoleSplitRatio,
    snapRatio
  ]);

  const startUmlResize = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault();
    setIsResizing(true);
  }, []);

  const startConsoleResize = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault();
    setIsConsoleResizing(true);
  }, []);

  return {
    containerRef,
    consoleContainerRef,
    splitRatio,
    consoleSplitRatio: consoleSplit,
    startUmlResize,
    startConsoleResize
  };
};
