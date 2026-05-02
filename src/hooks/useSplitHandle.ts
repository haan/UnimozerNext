import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { SPLIT_SNAP_DISTANCE } from "../constants/layout";

type UseSplitHandleArgs = {
  orientation: "vertical" | "horizontal";
  initialRatio: number;
  minBefore: number;
  minAfter: number;
  snapRatio?: number;
  snapDistance?: number;
  onCommit: (ratio: number) => void;
};

type UseSplitHandleResult = {
  containerRef: RefObject<HTMLDivElement | null>;
  ratio: number;
  startResize: (event: ReactPointerEvent<HTMLElement>) => void;
};

export const useSplitHandle = ({
  orientation,
  initialRatio,
  minBefore,
  minAfter,
  snapRatio,
  snapDistance = SPLIT_SNAP_DISTANCE,
  onCommit
}: UseSplitHandleArgs): UseSplitHandleResult => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [ratioState, setRatioState] = useState({ initialRatio, ratio: initialRatio });
  const ratio =
    ratioState.initialRatio === initialRatio ? ratioState.ratio : initialRatio;
  const ratioRef = useRef(ratio);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    ratioRef.current = ratio;
  }, [ratio]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMove = (event: PointerEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (orientation === "vertical") {
        let x = event.clientX - rect.left;
        x = Math.max(minBefore, Math.min(rect.width - minAfter, x));
        const next = x / rect.width;
        setRatioState({
          initialRatio,
          ratio: snapRatio !== undefined && Math.abs(next - snapRatio) <= snapDistance ? snapRatio : next
        });
      } else {
        let y = event.clientY - rect.top;
        y = Math.max(minBefore, Math.min(rect.height - minAfter, y));
        const next = y / rect.height;
        setRatioState({
          initialRatio,
          ratio: snapRatio !== undefined && Math.abs(next - snapRatio) <= snapDistance ? snapRatio : next
        });
      }
    };

    const handleUp = () => {
      setIsResizing(false);
      const next = ratioRef.current;
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
  }, [initialRatio, isResizing, minBefore, minAfter, onCommit, orientation, snapDistance, snapRatio]);

  const startResize = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault();
    setIsResizing(true);
  }, []);

  return { containerRef, ratio, startResize };
};
