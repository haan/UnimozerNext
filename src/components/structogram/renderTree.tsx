import type { ReactNode } from "react";

import {
  STRUCTOGRAM_COLORS as COLORS,
  STRUCTOGRAM_HEADER_HEIGHT,
  STRUCTOGRAM_LEGACY_NO_ELSE_LABEL,
  STRUCTOGRAM_NO_ELSE_LABEL
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
    normalized === STRUCTOGRAM_NO_ELSE_LABEL ||
    normalized.toLowerCase() === STRUCTOGRAM_LEGACY_NO_ELSE_LABEL
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
    const footerHeight = node.footer ? STRUCTOGRAM_HEADER_HEIGHT : 0;
    const availableBodyHeight = node.height - STRUCTOGRAM_HEADER_HEIGHT - footerHeight;
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
      colors: COLORS,
      renderLeftAlignedText,
      renderPaddedRemainder,
      renderNode: renderStructogramNode
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
      colors: COLORS,
      fitColumnWidths,
      renderPaddedRemainder,
      renderNode: renderStructogramNode
    });
  }

  if (node.kind === "switch") {
    const stretchedSwitchNode = {
      ...node,
      cases: node.cases.map((entry) => ({
        ...entry,
        body: stretchLoopBodyToHeight(entry.body, node.branchHeight)
      }))
    };
    return renderSwitchNode({
      node: stretchedSwitchNode,
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
