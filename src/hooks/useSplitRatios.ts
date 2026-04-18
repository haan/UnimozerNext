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
import { useSplitHandle } from "./useSplitHandle";

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
  const {
    containerRef,
    ratio: splitRatio,
    startResize: startUmlResize
  } = useSplitHandle({
    orientation: "vertical",
    initialRatio: umlSplitRatio,
    minBefore: minUmlPanel,
    minAfter: minUmlPanel,
    snapRatio: umlSplitSnapRatio,
    snapDistance: splitSnapDistance,
    onCommit: onCommitUmlSplitRatio
  });

  const {
    containerRef: consoleContainerRef,
    ratio: consoleSplit,
    startResize: startConsoleResize
  } = useSplitHandle({
    orientation: "horizontal",
    initialRatio: consoleSplitRatio,
    minBefore: minEditorPanel,
    minAfter: minConsolePanel,
    snapRatio: consoleSplitSnapRatio,
    snapDistance: splitSnapDistance,
    onCommit: onCommitConsoleSplitRatio
  });

  return {
    containerRef,
    consoleContainerRef,
    splitRatio,
    consoleSplitRatio: consoleSplit,
    startUmlResize,
    startConsoleResize
  };
};
