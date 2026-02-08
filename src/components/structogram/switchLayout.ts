import {
  STRUCTOGRAM_FONT_SIZE,
  STRUCTOGRAM_SECTION_HEADER_HEIGHT,
  STRUCTOGRAM_SWITCH_CONDITION_LINE_CLEARANCE,
  STRUCTOGRAM_SWITCH_CONDITION_SIDE_CLEARANCE,
  STRUCTOGRAM_SWITCH_CONDITION_TOP_PADDING,
  STRUCTOGRAM_SWITCH_SELECTOR_BASE_HEIGHT,
  STRUCTOGRAM_SWITCH_SELECTOR_MAX_HEIGHT
} from "./constants";

export type SwitchCaseInput<TBody> = {
  label: string;
  body: TBody;
  minWidth: number;
};

export type SwitchLayoutNode<TBody> = {
  kind: "switch";
  expression: string;
  cases: Array<{ label: string; body: TBody; width: number }>;
  selectorBandHeight: number;
  labelBandHeight: number;
  branchHeight: number;
  width: number;
  height: number;
};

type BuildSwitchLayoutArgs<TBody> = {
  expression: string;
  cases: Array<SwitchCaseInput<TBody>>;
  branchHeight: number;
  estimatedTextWidth: (value: string) => number;
  estimatedInlineTextWidth: (value: string) => number;
};

const distributeExtraWidth = (widths: number[], indices: number[], extra: number): number[] => {
  if (extra <= 0 || indices.length === 0) {
    return widths;
  }
  const next = [...widths];
  const baseIncrement = Math.floor(extra / indices.length);
  let remainder = extra % indices.length;
  for (const index of indices) {
    const extraForIndex = baseIncrement + (remainder > 0 ? 1 : 0);
    next[index] += extraForIndex;
    if (remainder > 0) {
      remainder -= 1;
    }
  }
  return next;
};

const distributeCaseWidths = (widths: number[], targetWidth: number): number[] => {
  const currentWidth = widths.reduce((sum, width) => sum + width, 0);
  if (currentWidth >= targetWidth || widths.length === 0) {
    return widths;
  }
  const remaining = targetWidth - currentWidth;
  const increment = Math.floor(remaining / widths.length);
  let remainder = remaining % widths.length;
  return widths.map((width) => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    return width + increment + extra;
  });
};

const fitSwitchGeometry = (
  expression: string,
  preferredCaseWidths: number[],
  estimatedInlineTextWidth: (value: string) => number
) => {
  const conditionWidth = estimatedInlineTextWidth(expression);
  const conditionHalfWidth = conditionWidth / 2;
  const conditionBottomY =
    STRUCTOGRAM_SWITCH_CONDITION_TOP_PADDING +
    STRUCTOGRAM_FONT_SIZE +
    STRUCTOGRAM_SWITCH_CONDITION_LINE_CLEARANCE;
  const requiredSideRun = conditionHalfWidth + STRUCTOGRAM_SWITCH_CONDITION_SIDE_CLEARANCE;

  let caseWidths = [...preferredCaseWidths];

  const ensureMinimumRuns = (minimumRun: number) => {
    if (caseWidths.length === 0) {
      return;
    }

    if (caseWidths.length === 1) {
      const totalWidth = caseWidths[0];
      const requiredTotalWidth = Math.ceil(minimumRun * 2);
      if (totalWidth < requiredTotalWidth) {
        caseWidths[0] = requiredTotalWidth;
      }
      return;
    }

    const defaultIndex = caseWidths.length - 1;
    const leftIndices = Array.from({ length: defaultIndex }, (_, index) => index);
    const rightIndices = [defaultIndex];

    const computeRuns = () => {
      const totalWidth = caseWidths.reduce((sum, width) => sum + width, 0);
      const rightRun = caseWidths[defaultIndex] ?? 0;
      const leftRun = totalWidth - rightRun;
      return { leftRun, rightRun };
    };

    let { leftRun, rightRun } = computeRuns();
    if (leftRun < minimumRun) {
      caseWidths = distributeExtraWidth(caseWidths, leftIndices, Math.ceil(minimumRun - leftRun));
      ({ leftRun, rightRun } = computeRuns());
    }
    if (rightRun < minimumRun) {
      caseWidths = distributeExtraWidth(caseWidths, rightIndices, Math.ceil(minimumRun - rightRun));
    }
  };

  ensureMinimumRuns(requiredSideRun);

  const minRatioAtMaxSelector = conditionBottomY / STRUCTOGRAM_SWITCH_SELECTOR_MAX_HEIGHT;
  if (minRatioAtMaxSelector > 0 && minRatioAtMaxSelector < 1) {
    const safeRunAtMaxSelector = conditionHalfWidth / (1 - minRatioAtMaxSelector);
    ensureMinimumRuns(safeRunAtMaxSelector);
  }

  const totalWidth = caseWidths.reduce((sum, width) => sum + width, 0);
  const hasDefaultColumn = caseWidths.length >= 2;
  const rightRun = hasDefaultColumn ? (caseWidths[caseWidths.length - 1] ?? 0) : totalWidth / 2;
  const leftRun = hasDefaultColumn ? totalWidth - rightRun : totalWidth / 2;

  const leftRatio = leftRun > 0 ? (leftRun - conditionHalfWidth) / leftRun : 0;
  const rightRatio = rightRun > 0 ? (rightRun - conditionHalfWidth) / rightRun : 0;
  const minRatio = Math.max(0, Math.min(leftRatio, rightRatio));
  const requiredSelectorBandHeight =
    minRatio > 0
      ? Math.ceil(conditionBottomY / minRatio)
      : STRUCTOGRAM_SWITCH_SELECTOR_MAX_HEIGHT;
  const selectorBandHeight = Math.max(
    STRUCTOGRAM_SWITCH_SELECTOR_BASE_HEIGHT,
    Math.min(STRUCTOGRAM_SWITCH_SELECTOR_MAX_HEIGHT, requiredSelectorBandHeight)
  );
  const labelBandHeight = STRUCTOGRAM_SECTION_HEADER_HEIGHT;

  return {
    caseWidths: caseWidths.map((width) => Math.ceil(width)),
    width: Math.ceil(totalWidth),
    selectorBandHeight: Math.ceil(selectorBandHeight),
    labelBandHeight
  };
};

export const buildSwitchLayout = <TBody>({
  expression,
  cases,
  branchHeight,
  estimatedTextWidth,
  estimatedInlineTextWidth
}: BuildSwitchLayoutArgs<TBody>): SwitchLayoutNode<TBody> => {
  const initialWidths = cases.map((entry) =>
    Math.max(entry.minWidth, estimatedTextWidth(entry.label))
  );
  const requiredHeaderWidth = estimatedTextWidth(expression);
  const caseWidths = distributeCaseWidths(initialWidths, requiredHeaderWidth);
  const geometry = fitSwitchGeometry(expression, caseWidths, estimatedInlineTextWidth);
  const resolvedCases = cases.map((entry, index) => ({
    label: entry.label,
    body: entry.body,
    width: geometry.caseWidths[index]
  }));

  return {
    kind: "switch",
    expression,
    cases: resolvedCases,
    selectorBandHeight: geometry.selectorBandHeight,
    labelBandHeight: geometry.labelBandHeight,
    branchHeight,
    width: geometry.width,
    height: geometry.selectorBandHeight + geometry.labelBandHeight + branchHeight
  };
};
