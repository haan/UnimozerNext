import type { ReactNode } from "react";

import {
  STRUCTOGRAM_COLORS,
  STRUCTOGRAM_HEADER_HEIGHT,
  STRUCTOGRAM_SECTION_HEADER_HEIGHT
} from "./constants";
import type { TryLayoutNode } from "./tryLayout";

type RenderTryNodeArgs<TNode extends { height: number }> = {
  node: TryLayoutNode<TNode>;
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
  let offsetY = y + STRUCTOGRAM_HEADER_HEIGHT;

  blocks.push(renderNode(node.body, x, offsetY, width, `${keyPrefix}-try-body`));
  offsetY += node.body.height;

  node.catches.forEach((entry, index) => {
    blocks.push(
      <g key={`${keyPrefix}-catch-${index}`}>
        <rect
          x={x}
          y={offsetY}
          width={width}
          height={STRUCTOGRAM_SECTION_HEADER_HEIGHT}
          fill={colors.section}
          stroke={colors.border}
        />
        {renderLeftAlignedText(
          `catch (${entry.exception})`,
          x,
          offsetY,
          STRUCTOGRAM_SECTION_HEADER_HEIGHT,
          colors.text,
          `${keyPrefix}-catch-label-${index}`
        )}
      </g>
    );
    offsetY += STRUCTOGRAM_SECTION_HEADER_HEIGHT;
    blocks.push(renderNode(entry.body, x, offsetY, width, `${keyPrefix}-catch-body-${index}`));
    offsetY += entry.body.height;
  });

  if (node.finallyBranch) {
    blocks.push(
      <g key={`${keyPrefix}-finally`}>
        <rect
          x={x}
          y={offsetY}
          width={width}
          height={STRUCTOGRAM_SECTION_HEADER_HEIGHT}
          fill={colors.section}
          stroke={colors.border}
        />
        {renderLeftAlignedText(
          "finally",
          x,
          offsetY,
          STRUCTOGRAM_SECTION_HEADER_HEIGHT,
          colors.text,
          `${keyPrefix}-finally-label`
        )}
      </g>
    );
    offsetY += STRUCTOGRAM_SECTION_HEADER_HEIGHT;
    blocks.push(renderNode(node.finallyBranch, x, offsetY, width, `${keyPrefix}-finally-body`));
  }

  return (
    <g key={keyPrefix}>
      <rect x={x} y={y} width={width} height={node.height} fill={colors.body} stroke={colors.border} />
      <rect
        x={x}
        y={y}
        width={width}
        height={STRUCTOGRAM_HEADER_HEIGHT}
        fill={colors.condition}
        stroke={colors.border}
      />
      {renderLeftAlignedText("try", x, y, STRUCTOGRAM_HEADER_HEIGHT, colors.text, `${keyPrefix}-header`)}
      {blocks}
    </g>
  );
};
