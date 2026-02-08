import type { ReactNode } from "react";

import { STRUCTOGRAM_COLORS, STRUCTOGRAM_HEADER_HEIGHT } from "./constants";
import type { LoopLayoutNode } from "./loopLayout";

type RenderLoopNodeArgs<TNode extends { height: number }> = {
  node: LoopLayoutNode<TNode>;
  x: number;
  y: number;
  width: number;
  keyPrefix: string;
  colors: typeof STRUCTOGRAM_COLORS;
  renderLeftAlignedText: (
    value: string,
    x: number,
    y: number,
    rowHeight: number,
    fill: string,
    key: string
  ) => ReactNode;
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

export const renderLoopNode = <TNode extends { height: number },>({
  node,
  x,
  y,
  width,
  keyPrefix,
  colors,
  renderLeftAlignedText,
  renderPaddedRemainder,
  renderNode
}: RenderLoopNodeArgs<TNode>): ReactNode => {
  const bodyY = y + STRUCTOGRAM_HEADER_HEIGHT;
  const footerHeight = node.footer ? STRUCTOGRAM_HEADER_HEIGHT : 0;
  const bodyHeight = node.height - STRUCTOGRAM_HEADER_HEIGHT - footerHeight;
  const footerY = bodyY + bodyHeight;
  const loopContentX = x + node.bodyInsetWidth;
  const loopContentWidth = width - node.bodyInsetWidth;
  const headerFill = node.bodyInsetWidth > 0 ? colors.loopHeader : colors.condition;

  return (
    <g key={keyPrefix}>
      <rect x={x} y={y} width={width} height={node.height} fill={colors.body} stroke={colors.border} />
      <rect
        x={x}
        y={y}
        width={width}
        height={STRUCTOGRAM_HEADER_HEIGHT}
        fill={headerFill}
        stroke={node.bodyInsetWidth > 0 ? "none" : colors.border}
      />
      {renderLeftAlignedText(
        node.header,
        x,
        y,
        STRUCTOGRAM_HEADER_HEIGHT,
        colors.text,
        `${keyPrefix}-header`
      )}
      {node.bodyInsetWidth > 0 ? (
        <g key={`${keyPrefix}-inset`}>
          <rect
            x={x}
            y={bodyY}
            width={width}
            height={bodyHeight}
            fill={colors.branch}
            stroke="none"
          />
          <rect
            x={x}
            y={bodyY}
            width={node.bodyInsetWidth}
            height={bodyHeight}
            fill={colors.loopHeader}
            stroke="none"
          />
          <line x1={loopContentX} y1={bodyY} x2={x + width} y2={bodyY} stroke={colors.border} />
          <line x1={loopContentX} y1={bodyY} x2={loopContentX} y2={footerY} stroke={colors.border} />
        </g>
      ) : null}
      {renderNode(
        node.body,
        node.bodyInsetWidth > 0 ? loopContentX : x,
        bodyY,
        node.bodyInsetWidth > 0 ? loopContentWidth : width,
        `${keyPrefix}-body`
      )}
      {node.bodyInsetWidth > 0
        ? renderPaddedRemainder(
            loopContentX,
            bodyY,
            loopContentWidth,
            node.body.height,
            bodyHeight,
            `${keyPrefix}-body-remainder`
          )
        : renderPaddedRemainder(
            x,
            bodyY,
            width,
            node.body.height,
            bodyHeight,
            `${keyPrefix}-body-remainder`
          )}
      {node.footer ? (
        <g key={`${keyPrefix}-footer`}>
          <rect
            x={x}
            y={footerY}
            width={width}
            height={STRUCTOGRAM_HEADER_HEIGHT}
            fill={colors.condition}
            stroke={colors.border}
          />
          {renderLeftAlignedText(
            node.footer,
            x,
            footerY,
            STRUCTOGRAM_HEADER_HEIGHT,
            colors.text,
            `${keyPrefix}-footer-text`
          )}
        </g>
      ) : null}
    </g>
  );
};
