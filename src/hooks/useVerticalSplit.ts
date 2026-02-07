import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

type UseVerticalSplitArgs = {
  ratio: number;
  onCommit: (ratio: number) => void;
  minTop?: number;
  minBottom?: number;
  splitSnapDistance?: number;
  splitSnapRatio?: number;
};

type UseVerticalSplitResult = {
  containerRef: RefObject<HTMLDivElement | null>;
  splitRatio: number;
  startResize: (event: ReactPointerEvent<HTMLElement>) => void;
};

const resolveMinBottom = (fallback: number) => {
  if (typeof window === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--bench-min-height")
    .trim();
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

export const useVerticalSplit = ({
  ratio,
  onCommit,
  minTop = 200,
  minBottom = 120,
  splitSnapDistance = 0.03,
  splitSnapRatio = 0.75
}: UseVerticalSplitArgs): UseVerticalSplitResult => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [splitRatio, setSplitRatio] = useState(ratio);
  const splitRatioRef = useRef(splitRatio);
  const [isResizing, setIsResizing] = useState(false);

  const snapRatio = useCallback(
    (nextRatio: number) => {
      if (Math.abs(nextRatio - splitSnapRatio) <= splitSnapDistance) {
        return splitSnapRatio;
      }
      return nextRatio;
    },
    [splitSnapDistance, splitSnapRatio]
  );

  useEffect(() => {
    setSplitRatio(ratio);
  }, [ratio]);

  useEffect(() => {
    splitRatioRef.current = splitRatio;
  }, [splitRatio]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMove = (event: PointerEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const bottomMin = resolveMinBottom(minBottom);
      let y = event.clientY - rect.top;
      y = Math.max(minTop, Math.min(rect.height - bottomMin, y));
      const ratio = y / rect.height;
      setSplitRatio(snapRatio(ratio));
    };

    const handleUp = () => {
      setIsResizing(false);
      const next = splitRatioRef.current;
      if (Number.isFinite(next)) {
        onCommit(next);
      }
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);

    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [isResizing, minBottom, minTop, onCommit, snapRatio]);

  const startResize = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault();
    setIsResizing(true);
  }, []);

  return {
    containerRef,
    splitRatio,
    startResize
  };
};
