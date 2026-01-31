import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

type UseSplitRatiosArgs = {
  umlSplitRatio: number;
  consoleSplitRatio: number;
  onCommitUmlSplitRatio: (ratio: number) => void;
  onCommitConsoleSplitRatio: (ratio: number) => void;
  minUmlPanel?: number;
};

type UseSplitRatiosResult = {
  containerRef: RefObject<HTMLDivElement>;
  consoleContainerRef: RefObject<HTMLDivElement>;
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
  minUmlPanel = 260
}: UseSplitRatiosArgs): UseSplitRatiosResult => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const consoleContainerRef = useRef<HTMLDivElement | null>(null);
  const [splitRatio, setSplitRatio] = useState(umlSplitRatio);
  const [consoleSplit, setConsoleSplit] = useState(consoleSplitRatio);
  const splitRatioRef = useRef(splitRatio);
  const consoleSplitRatioRef = useRef(consoleSplit);
  const [isResizing, setIsResizing] = useState(false);
  const [isConsoleResizing, setIsConsoleResizing] = useState(false);

  const getConsoleMinHeight = useCallback(() => {
    if (typeof window === "undefined") return 100;
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue("--console-min-height")
      .trim();
    const value = Number.parseFloat(raw);
    return Number.isFinite(value) && value > 0 ? value : 100;
  }, []);

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
      setSplitRatio(x / rect.width);
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
  }, [isResizing, minUmlPanel, onCommitUmlSplitRatio]);

  useEffect(() => {
    if (!isConsoleResizing) return;

    const handleMove = (event: PointerEvent) => {
      if (!consoleContainerRef.current) return;
      const rect = consoleContainerRef.current.getBoundingClientRect();
      const minPanel = getConsoleMinHeight();
      let y = event.clientY - rect.top;
      y = Math.max(minPanel, Math.min(rect.height - minPanel, y));
      setConsoleSplit(y / rect.height);
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
  }, [getConsoleMinHeight, isConsoleResizing, onCommitConsoleSplitRatio]);

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
