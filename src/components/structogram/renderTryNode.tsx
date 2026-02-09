import type { ReactNode } from "react";

import {
  STRUCTOGRAM_SECTION_HEADER_HEIGHT,
  STRUCTOGRAM_TRY_FRAME_BOTTOM_HEIGHT,
  STRUCTOGRAM_TRY_FRAME_SIDE_WIDTH,
  STRUCTOGRAM_TRY_FRAME_TOP_HEIGHT,
  STRUCTOGRAM_TRY_HEADER_LABEL,
  type StructogramColors
} from "./constants";
import type { TryLayoutNode } from "./tryLayout";

type RenderTryNodeArgs<TNode extends { height: number }> = {
  node: TryLayoutNode<TNode>;
  x: number;
  y: number;
  width: number;
  keyPrefix: string;
  colors: StructogramColors;
  renderLeftAlignedText: (
    value: string,
    x: number,
    y: number,
    rowHeight: number,
    fill: string,
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

export const renderTryNode = <TNode extends { height: number },>({
  node,
  x,
  y,
  width,
  keyPrefix,
  colors,
  renderLeftAlignedText,
  renderNode
}: RenderTryNodeArgs<TNode>): ReactNode => {
  const blocks: ReactNode[] = [];
  const sideWidth = Math.min(STRUCTOGRAM_TRY_FRAME_SIDE_WIDTH, Math.max(1, Math.floor(width / 3)));
  const contentX = x + sideWidth;
  const contentWidth = Math.max(1, width - sideWidth);
  const footerY = y + node.height - STRUCTOGRAM_TRY_FRAME_BOTTOM_HEIGHT;
  let offsetY = y + STRUCTOGRAM_TRY_FRAME_TOP_HEIGHT;

  const renderHorizontalDivider = (dividerY: number, dividerKey: string): ReactNode => (
    <g key={dividerKey}>
      <line x1={x} y1={dividerY} x2={contentX} y2={dividerY} stroke={colors.tryWrapper} />
      <line x1={contentX} y1={dividerY} x2={x + width} y2={dividerY} stroke={colors.border} />
    </g>
  );

  const renderSectionHeader = (
    label: string,
    headerY: number,
    headerHeight: number,
    headerKey: string,
    options?: { fullTopBorder?: boolean }
  ): ReactNode => (
    <g key={headerKey}>
      <rect
        x={x}
        y={headerY}
        width={width}
        height={headerHeight}
        fill={colors.tryWrapper}
        stroke="none"
      />
      {options?.fullTopBorder ? (
        <line x1={x} y1={headerY} x2={x + width} y2={headerY} stroke={colors.border} />
      ) : (
        renderHorizontalDivider(headerY, `${headerKey}-top-divider`)
      )}
      {renderHorizontalDivider(
        headerY + headerHeight,
        `${headerKey}-bottom-divider`
      )}
      {renderLeftAlignedText(label, x, headerY, headerHeight, colors.text, `${headerKey}-label`)}
    </g>
  );

  const renderFramedBody = (bodyY: number, bodyHeight: number, bodyKey: string): ReactNode => (
    <g key={bodyKey}>
      <rect
        x={x}
        y={bodyY}
        width={sideWidth}
        height={bodyHeight}
        fill={colors.tryWrapper}
        stroke="none"
      />
      {renderHorizontalDivider(bodyY, `${bodyKey}-top-divider`)}
      {renderHorizontalDivider(bodyY + bodyHeight, `${bodyKey}-bottom-divider`)}
      <line x1={contentX} y1={bodyY} x2={contentX} y2={bodyY + bodyHeight} stroke={colors.border} />
    </g>
  );

  blocks.push(renderFramedBody(offsetY, node.body.height, `${keyPrefix}-try-body-frame`));
  blocks.push(renderNode(node.body, contentX, offsetY, contentWidth, `${keyPrefix}-try-body`));
  offsetY += node.body.height;

  node.catches.forEach((entry, index) => {
    blocks.push(
      renderSectionHeader(
        `catch (${entry.exception})`,
        offsetY,
        STRUCTOGRAM_SECTION_HEADER_HEIGHT,
        `${keyPrefix}-catch-${index}`
      )
    );
    offsetY += STRUCTOGRAM_SECTION_HEADER_HEIGHT;
    blocks.push(renderFramedBody(offsetY, entry.body.height, `${keyPrefix}-catch-frame-${index}`));
    blocks.push(
      renderNode(entry.body, contentX, offsetY, contentWidth, `${keyPrefix}-catch-body-${index}`)
    );
    offsetY += entry.body.height;
  });

  if (node.finallyBranch) {
    blocks.push(
      renderSectionHeader(
        "finally",
        offsetY,
        STRUCTOGRAM_SECTION_HEADER_HEIGHT,
        `${keyPrefix}-finally`
      )
    );
    offsetY += STRUCTOGRAM_SECTION_HEADER_HEIGHT;
    blocks.push(renderFramedBody(offsetY, node.finallyBranch.height, `${keyPrefix}-finally-frame`));
    blocks.push(
      renderNode(
        node.finallyBranch,
        contentX,
        offsetY,
        contentWidth,
        `${keyPrefix}-finally-body`
      )
    );
  }

  return (
    <g key={keyPrefix}>
      <rect x={x} y={y} width={width} height={node.height} fill={colors.body} stroke={colors.border} />
      {renderSectionHeader(
        STRUCTOGRAM_TRY_HEADER_LABEL,
        y,
        STRUCTOGRAM_TRY_FRAME_TOP_HEIGHT,
        `${keyPrefix}-header`,
        { fullTopBorder: true }
      )}
      {blocks}
      <rect
        x={x}
        y={footerY}
        width={width}
        height={STRUCTOGRAM_TRY_FRAME_BOTTOM_HEIGHT}
        fill={colors.tryWrapper}
        stroke="none"
      />
      {renderHorizontalDivider(footerY, `${keyPrefix}-footer-divider`)}
    </g>
  );
};
