import type { ReactNode } from "react";

import {
  STRUCTOGRAM_FONT_SIZE,
  STRUCTOGRAM_IF_CONDITION_TOP_PADDING,
  STRUCTOGRAM_LABEL_TEXT_OFFSET_Y,
  STRUCTOGRAM_TEXT_PADDING_X
} from "./constants";
import type { IfLayoutNode } from "./ifLayout";
import type { STRUCTOGRAM_COLORS } from "./constants";

type RenderIfNodeArgs<TNode extends { height: number }> = {
  node: IfLayoutNode<TNode>;
  x: number;
  y: number;
  width: number;
  keyPrefix: string;
  colors: typeof STRUCTOGRAM_COLORS;
  fitColumnWidths: (baseWidths: number[], targetWidth: number) => number[];
  renderPaddedRemainder: (
    x: number,
    y: number,
    width: number,
    contentHeight: number,
    fullHeight: number,
    key: string
  ) => ReactNode;
  renderNode: (
    node: TNode,
    x: number,
    y: number,
    forcedWidth?: number,
    keyPrefix?: string
  ) => ReactNode;
};

export const renderIfNode = <TNode extends { height: number },>({
  node,
  x,
  y,
  width,
  keyPrefix,
  colors,
  fitColumnWidths,
  renderPaddedRemainder,
  renderNode
}: RenderIfNodeArgs<TNode>): ReactNode => {
  const branchTop = y + node.headerHeight;
  const [leftWidth, rightWidth] = fitColumnWidths([node.leftWidth, node.rightWidth], width);
  const splitX = x + leftWidth;

  return (
    <g key={keyPrefix}>
      <rect x={x} y={y} width={width} height={node.height} fill={colors.body} stroke={colors.border} />
      <rect
        x={x}
        y={y}
        width={width}
        height={node.headerHeight}
        fill={colors.ifHeader}
        stroke={colors.border}
      />
      <line x1={x} y1={y} x2={splitX} y2={branchTop} stroke={colors.border} />
      <line x1={x + width} y1={y} x2={splitX} y2={branchTop} stroke={colors.border} />
      <line x1={splitX} y1={branchTop} x2={splitX} y2={y + node.height} stroke={colors.border} />
      <line x1={x} y1={branchTop} x2={x + width} y2={branchTop} stroke={colors.border} />

      <text
        x={splitX}
        y={y + STRUCTOGRAM_FONT_SIZE + STRUCTOGRAM_IF_CONDITION_TOP_PADDING}
        textAnchor="middle"
        fontSize={STRUCTOGRAM_FONT_SIZE}
        fill={colors.text}
      >
        {`if (${node.condition})`}
      </text>

      <text
        x={x + STRUCTOGRAM_TEXT_PADDING_X}
        y={branchTop - STRUCTOGRAM_LABEL_TEXT_OFFSET_Y}
        fontSize={STRUCTOGRAM_FONT_SIZE}
        fill={colors.mutedText}
      >
        T
      </text>
      <text
        x={x + width - STRUCTOGRAM_TEXT_PADDING_X}
        y={branchTop - STRUCTOGRAM_LABEL_TEXT_OFFSET_Y}
        textAnchor="end"
        fontSize={STRUCTOGRAM_FONT_SIZE}
        fill={colors.mutedText}
      >
        F
      </text>

      <rect
        x={x}
        y={branchTop}
        width={leftWidth}
        height={node.branchHeight}
        fill={colors.branch}
        stroke={colors.border}
      />
      <rect
        x={splitX}
        y={branchTop}
        width={rightWidth}
        height={node.branchHeight}
        fill={colors.branch}
        stroke={colors.border}
      />

      {renderNode(node.thenBranch, x, branchTop, leftWidth, `${keyPrefix}-then`)}
      {renderPaddedRemainder(
        x,
        branchTop,
        leftWidth,
        node.thenBranch.height,
        node.branchHeight,
        `${keyPrefix}-then-remainder`
      )}

      {renderNode(node.elseBranch, splitX, branchTop, rightWidth, `${keyPrefix}-else`)}
      {renderPaddedRemainder(
        splitX,
        branchTop,
        rightWidth,
        node.elseBranch.height,
        node.branchHeight,
        `${keyPrefix}-else-remainder`
      )}
    </g>
  );
};
