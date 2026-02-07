import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  HORIZONTAL_SPLIT_SNAP_RATIO,
  SPLIT_SNAP_DISTANCE,
  STACKED_SPLIT_BOTTOM_MIN_HEIGHT_PX,
  STACKED_SPLIT_TOP_MIN_HEIGHT_PX
} from "../constants/layout";

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

export const useVerticalSplit = ({
  ratio,
  onCommit,
  minTop = STACKED_SPLIT_TOP_MIN_HEIGHT_PX,
  minBottom = STACKED_SPLIT_BOTTOM_MIN_HEIGHT_PX,
  splitSnapDistance = SPLIT_SNAP_DISTANCE,
  splitSnapRatio = HORIZONTAL_SPLIT_SNAP_RATIO
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
      let y = event.clientY - rect.top;
      y = Math.max(minTop, Math.min(rect.height - minBottom, y));
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
