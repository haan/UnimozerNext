import type { RefObject } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  HORIZONTAL_SPLIT_SNAP_RATIO,
  SPLIT_SNAP_DISTANCE,
  STACKED_SPLIT_BOTTOM_MIN_HEIGHT_PX,
  STACKED_SPLIT_TOP_MIN_HEIGHT_PX
} from "../constants/layout";
import { useSplitHandle } from "./useSplitHandle";

type UseHorizontalSplitArgs = {
  ratio: number;
  onCommit: (ratio: number) => void;
  minTop?: number;
  minBottom?: number;
  splitSnapDistance?: number;
  splitSnapRatio?: number;
};

type UseHorizontalSplitResult = {
  containerRef: RefObject<HTMLDivElement | null>;
  splitRatio: number;
  startResize: (event: ReactPointerEvent<HTMLElement>) => void;
};

export const useHorizontalSplit = ({
  ratio,
  onCommit,
  minTop = STACKED_SPLIT_TOP_MIN_HEIGHT_PX,
  minBottom = STACKED_SPLIT_BOTTOM_MIN_HEIGHT_PX,
  splitSnapDistance = SPLIT_SNAP_DISTANCE,
  splitSnapRatio = HORIZONTAL_SPLIT_SNAP_RATIO
}: UseHorizontalSplitArgs): UseHorizontalSplitResult => {
  const { containerRef, ratio: splitRatio, startResize } = useSplitHandle({
    orientation: "horizontal",
    initialRatio: ratio,
    minBefore: minTop,
    minAfter: minBottom,
    snapRatio: splitSnapRatio,
    snapDistance: splitSnapDistance,
    onCommit
  });

  return { containerRef, splitRatio, startResize };
};
