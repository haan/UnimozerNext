import type { ReactNode } from "react";

import { STRUCTOGRAM_COLORS as COLORS, STRUCTOGRAM_LEGACY_NO_ELSE_LABEL, STRUCTOGRAM_NO_ELSE_LABEL } from "./constants";
import { renderIfNode } from "./renderIfNode";
import { renderLoopNode } from "./renderLoopNode";
import { renderSwitchNode } from "./renderSwitchNode";
import { renderTryNode } from "./renderTryNode";
import {
  fitColumnWidths,
  renderCenteredText,
  renderLeftAlignedText,
  renderPaddedRemainder
} from "./renderUtils";
import type { LayoutNode } from "./layoutBuilder";

const isNoElsePlaceholder = (value: string): boolean => {
  const normalized = value.trim();
  return (
    normalized === STRUCTOGRAM_NO_ELSE_LABEL ||
    normalized.toLowerCase() === STRUCTOGRAM_LEGACY_NO_ELSE_LABEL
  );
};

export const renderStructogramNode = (
  node: LayoutNode,
  x: number,
  y: number,
  forcedWidth?: number,
  keyPrefix = "node"
): ReactNode => {
  const width = forcedWidth ?? node.width;

  if (node.kind === "statement") {
    return (
      <g key={keyPrefix}>
        <rect x={x} y={y} width={width} height={node.height} fill={COLORS.body} stroke={COLORS.border} />
        {isNoElsePlaceholder(node.text)
          ? renderCenteredText(node.text, x, y, width, node.height, `${keyPrefix}-text`)
          : renderLeftAlignedText(node.text, x, y, node.height, COLORS.text, `${keyPrefix}-text`)}
      </g>
    );
  }

  if (node.kind === "sequence") {
    let offsetY = y;
    return (
      <g key={keyPrefix}>
        {node.children.map((child, index) => {
          const rendered = renderStructogramNode(child, x, offsetY, width, `${keyPrefix}-${index}`);
          offsetY += child.height;
          return rendered;
        })}
      </g>
    );
  }

  if (node.kind === "loop") {
    return renderLoopNode({
      node,
      x,
      y,
      width,
      keyPrefix,
      colors: COLORS,
      renderLeftAlignedText,
      renderPaddedRemainder,
      renderNode: renderStructogramNode
    });
  }

  if (node.kind === "if") {
    return renderIfNode({
      node,
      x,
      y,
      width,
      keyPrefix,
      colors: COLORS,
      fitColumnWidths,
      renderPaddedRemainder,
      renderNode: renderStructogramNode
    });
  }

  if (node.kind === "switch") {
    return renderSwitchNode({
      node,
      x,
      y,
      width,
      keyPrefix,
      colors: COLORS,
      fitColumnWidths,
      renderCenteredText,
      renderPaddedRemainder,
      renderNode: renderStructogramNode
    });
  }

  if (node.kind === "try") {
    return renderTryNode({
      node,
      x,
      y,
      width,
      keyPrefix,
      colors: COLORS,
      renderLeftAlignedText,
      renderNode: renderStructogramNode
    });
  }

  return null;
};
