import {
  STRUCTOGRAM_FONT_SIZE,
  STRUCTOGRAM_IF_CONDITION_LINE_CLEARANCE_PX,
  STRUCTOGRAM_IF_CONDITION_SIDE_CLEARANCE_PX,
  STRUCTOGRAM_IF_CONDITION_TOP_PADDING,
  STRUCTOGRAM_IF_HEADER_BASE_HEIGHT,
  STRUCTOGRAM_IF_HEADER_MAX_HEIGHT
} from "./constants";

export type IfLayoutNode<TBranch> = {
  kind: "if";
  condition: string;
  thenBranch: TBranch;
  elseBranch: TBranch;
  leftWidth: number;
  rightWidth: number;
  headerHeight: number;
  branchHeight: number;
  width: number;
  height: number;
};

type BuildIfLayoutArgs<TBranch extends { width: number; height: number }> = {
  condition: string;
  thenBranch: TBranch;
  elseBranch: TBranch;
  estimatedInlineTextWidth: (value: string) => number;
};

const fitIfGeometry = (
  condition: string,
  preferredLeftWidth: number,
  preferredRightWidth: number,
  estimatedInlineTextWidth: (value: string) => number
) => {
  const conditionLabel = condition;
  const conditionWidth = estimatedInlineTextWidth(conditionLabel);
  const conditionHalfWidth = conditionWidth / 2;
  const conditionBottomY =
    STRUCTOGRAM_IF_CONDITION_TOP_PADDING +
    STRUCTOGRAM_FONT_SIZE +
    STRUCTOGRAM_IF_CONDITION_LINE_CLEARANCE_PX;
  const requiredSideWidth = conditionHalfWidth + STRUCTOGRAM_IF_CONDITION_SIDE_CLEARANCE_PX;

  let leftWidth = Math.max(preferredLeftWidth, requiredSideWidth);
  let rightWidth = Math.max(preferredRightWidth, requiredSideWidth);

  const minRatioAtMaxHeader = conditionBottomY / STRUCTOGRAM_IF_HEADER_MAX_HEIGHT;
  if (minRatioAtMaxHeader > 0 && minRatioAtMaxHeader < 1) {
    const ratioSafeSideWidth = conditionHalfWidth / (1 - minRatioAtMaxHeader);
    leftWidth = Math.max(leftWidth, ratioSafeSideWidth);
    rightWidth = Math.max(rightWidth, ratioSafeSideWidth);
  }

  const baseWidth = leftWidth + rightWidth;
  const width = Math.max(baseWidth, conditionWidth);
  const splitX = leftWidth;
  const leftRatio = splitX > 0 ? (splitX - conditionHalfWidth) / splitX : 0;
  const rightDenominator = width - splitX;
  const rightRatio =
    rightDenominator > 0 ? (rightDenominator - conditionHalfWidth) / rightDenominator : 0;
  const minRatio = Math.max(0, Math.min(leftRatio, rightRatio));
  const requiredHeaderHeight =
    minRatio > 0 ? Math.ceil(conditionBottomY / minRatio) : STRUCTOGRAM_IF_HEADER_MAX_HEIGHT;
  const headerHeight = Math.max(
    STRUCTOGRAM_IF_HEADER_BASE_HEIGHT,
    Math.min(STRUCTOGRAM_IF_HEADER_MAX_HEIGHT, requiredHeaderHeight)
  );

  return {
    leftWidth: Math.ceil(leftWidth),
    rightWidth: Math.ceil(rightWidth),
    width: Math.ceil(width),
    headerHeight: Math.ceil(headerHeight)
  };
};

export const buildIfLayout = <TBranch extends { width: number; height: number }>({
  condition,
  thenBranch,
  elseBranch,
  estimatedInlineTextWidth
}: BuildIfLayoutArgs<TBranch>): IfLayoutNode<TBranch> => {
  const geometry = fitIfGeometry(
    condition,
    thenBranch.width,
    elseBranch.width,
    estimatedInlineTextWidth
  );
  const branchHeight = Math.max(thenBranch.height, elseBranch.height);

  return {
    kind: "if",
    condition,
    thenBranch,
    elseBranch,
    leftWidth: geometry.leftWidth,
    rightWidth: geometry.rightWidth,
    headerHeight: geometry.headerHeight,
    branchHeight,
    width: geometry.width,
    height: geometry.headerHeight + branchHeight
  };
};
