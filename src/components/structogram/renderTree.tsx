import type { ReactNode } from "react";

import {
  STRUCTOGRAM_COLORS as COLORS,
  STRUCTOGRAM_EMPTY_ELSE_LABEL,
  STRUCTOGRAM_HEADER_HEIGHT,
  STRUCTOGRAM_LEGACY_EMPTY_ELSE_LABEL,
  type StructogramColors
} from "./constants";
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
    normalized === STRUCTOGRAM_EMPTY_ELSE_LABEL ||
    normalized.toLowerCase() === STRUCTOGRAM_LEGACY_EMPTY_ELSE_LABEL
  );
};

const stretchLoopBodyToHeight = (body: LayoutNode, targetHeight: number): LayoutNode => {
  if (body.height >= targetHeight) {
    return body;
  }

  if (body.kind === "loop" && body.footer === null) {
    return {
      ...body,
      height: targetHeight
    };
  }

  if (body.kind === "sequence" && body.children.length > 0) {
    const lastChildIndex = body.children.length - 1;
    const lastChild = body.children[lastChildIndex];
    if (lastChild.kind === "loop" && lastChild.footer === null) {
      const heightDelta = targetHeight - body.height;
      const stretchedLoop = {
        ...lastChild,
        height: lastChild.height + heightDelta
      };
      const nextChildren = [...body.children];
      nextChildren[lastChildIndex] = stretchedLoop;
      return {
        ...body,
        children: nextChildren,
        height: targetHeight
      };
    }
  }

  return body;
};

const stretchLastStatementToHeight = (body: LayoutNode, targetHeight: number): LayoutNode => {
  if (body.height >= targetHeight) {
    return body;
  }
  if (body.kind === "statement") {
    return {
      ...body,
      height: targetHeight
    };
  }
  if (body.kind !== "sequence" || body.children.length === 0) {
    return body;
  }
  const lastIndex = body.children.length - 1;
  const lastChild = body.children[lastIndex];
  if (lastChild.kind !== "statement") {
    return body;
  }

  const heightDelta = targetHeight - body.height;
  const nextChildren = [...body.children];
  nextChildren[lastIndex] = {
    ...lastChild,
    height: lastChild.height + heightDelta
  };

  return {
    ...body,
    children: nextChildren,
    height: targetHeight
  };
};

const stretchSwitchCaseBodyToHeight = (body: LayoutNode, targetHeight: number): LayoutNode => {
  const loopStretched = stretchLoopBodyToHeight(body, targetHeight);
  return stretchLastStatementToHeight(loopStretched, targetHeight);
};

export const renderStructogramNode = (
  node: LayoutNode,
  x: number,
  y: number,
  forcedWidth?: number,
  keyPrefix = "node",
  colors: StructogramColors = COLORS
): ReactNode => {
  const width = forcedWidth ?? node.width;

  if (node.kind === "statement") {
    return (
      <g key={keyPrefix}>
        <rect x={x} y={y} width={width} height={node.height} fill={colors.body} stroke={colors.border} />
        {isNoElsePlaceholder(node.text)
          ? renderCenteredText(node.text, x, y, width, node.height, `${keyPrefix}-text`)
          : renderLeftAlignedText(node.text, x, y, node.height, colors.text, `${keyPrefix}-text`)}
      </g>
    );
  }

  if (node.kind === "sequence") {
    let offsetY = y;
    return (
      <g key={keyPrefix}>
        {node.children.map((child, index) => {
          const rendered = renderStructogramNode(
            child,
            x,
            offsetY,
            width,
            `${keyPrefix}-${index}`,
            colors
          );
          offsetY += child.height;
          return rendered;
        })}
      </g>
    );
  }

  if (node.kind === "loop") {
    const topHeaderHeight = node.footer ? 0 : STRUCTOGRAM_HEADER_HEIGHT;
    const footerHeight = node.footer ? STRUCTOGRAM_HEADER_HEIGHT : 0;
    const availableBodyHeight = node.height - topHeaderHeight - footerHeight;
    const stretchedBody = stretchLastStatementToHeight(node.body, availableBodyHeight);
    const renderableLoop =
      stretchedBody === node.body
        ? node
        : {
            ...node,
            body: stretchedBody
          };
    return renderLoopNode({
      node: renderableLoop,
      x,
      y,
      width,
      keyPrefix,
      colors,
      renderLeftAlignedText,
      renderPaddedRemainder,
      renderNode: (childNode, childX, childY, childForcedWidth, childKeyPrefix) =>
        renderStructogramNode(
          childNode,
          childX,
          childY,
          childForcedWidth,
          childKeyPrefix,
          colors
        )
    });
  }

  if (node.kind === "if") {
    const stretchedThen = stretchLastStatementToHeight(node.thenBranch, node.branchHeight);
    const stretchedElse = stretchLastStatementToHeight(node.elseBranch, node.branchHeight);
    const renderableIf =
      stretchedThen === node.thenBranch && stretchedElse === node.elseBranch
        ? node
        : {
            ...node,
            thenBranch: stretchedThen,
            elseBranch: stretchedElse
          };
    return renderIfNode({
      node: renderableIf,
      x,
      y,
      width,
      keyPrefix,
      colors,
      fitColumnWidths,
      renderPaddedRemainder,
      renderNode: (childNode, childX, childY, childForcedWidth, childKeyPrefix) =>
        renderStructogramNode(
          childNode,
          childX,
          childY,
          childForcedWidth,
          childKeyPrefix,
          colors
        )
    });
  }

  if (node.kind === "switch") {
    const stretchedSwitchNode = {
      ...node,
      cases: node.cases.map((entry) => ({
        ...entry,
        body: stretchSwitchCaseBodyToHeight(entry.body, node.branchHeight)
      }))
    };
    return renderSwitchNode({
      node: stretchedSwitchNode,
      x,
      y,
      width,
      keyPrefix,
      colors,
      fitColumnWidths,
      renderCenteredText,
      renderPaddedRemainder,
      renderNode: (childNode, childX, childY, childForcedWidth, childKeyPrefix) =>
        renderStructogramNode(
          childNode,
          childX,
          childY,
          childForcedWidth,
          childKeyPrefix,
          colors
        )
    });
  }

  if (node.kind === "try") {
    return renderTryNode({
      node,
      x,
      y,
      width,
      keyPrefix,
      colors,
      renderLeftAlignedText,
      renderNode: (childNode, childX, childY, childForcedWidth, childKeyPrefix) =>
        renderStructogramNode(
          childNode,
          childX,
          childY,
          childForcedWidth,
          childKeyPrefix,
          colors
        )
    });
  }

  return null;
};
