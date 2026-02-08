import type { ReactNode } from "react";

import {
  STRUCTOGRAM_FONT_SIZE,
  STRUCTOGRAM_SWITCH_CONDITION_TOP_PADDING,
  type StructogramColors
} from "./constants";
import type { SwitchLayoutNode } from "./switchLayout";

type RenderSwitchNodeArgs<TNode extends { height: number }> = {
  node: SwitchLayoutNode<TNode>;
  x: number;
  y: number;
  width: number;
  keyPrefix: string;
  colors: StructogramColors;
  fitColumnWidths: (baseWidths: number[], targetWidth: number) => number[];
  renderCenteredText: (
    value: string,
    x: number,
    y: number,
    width: number,
    rowHeight: number,
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

export const renderSwitchNode = <TNode extends { height: number },>({
  node,
  x,
  y,
  width,
  keyPrefix,
  colors,
  fitColumnWidths,
  renderCenteredText,
  renderPaddedRemainder,
  renderNode
}: RenderSwitchNodeArgs<TNode>): ReactNode => {
  const switchHeaderHeight = node.selectorBandHeight + node.labelBandHeight;
  const switchHeaderBottom = y + switchHeaderHeight;
  const caseBodyTop = switchHeaderBottom;
  const renderedCaseWidths = fitColumnWidths(
    node.cases.map((entry) => entry.width),
    width
  );
  const columnStarts: number[] = [];
  let cumulativeX = x;
  for (const caseWidth of renderedCaseWidths) {
    columnStarts.push(cumulativeX);
    cumulativeX += caseWidth;
  }
  const hasMultipleColumns = renderedCaseWidths.length >= 2;
  const defaultColumnStartX = hasMultipleColumns
    ? (columnStarts[columnStarts.length - 1] ?? x + width)
    : x + width / 2;
  const safeDiagonalRun = Math.max(defaultColumnStartX - x, 1);
  const switchApexY = y + node.selectorBandHeight;
  const labelBandTop = switchApexY;
  const labelBandHeight = node.labelBandHeight;

  let columnX = x;

  return (
    <g key={keyPrefix}>
      <rect x={x} y={y} width={width} height={node.height} fill={colors.body} stroke={colors.border} />
      <rect
        x={x}
        y={y}
        width={width}
        height={switchHeaderHeight}
        fill={colors.switchHeader}
        stroke={colors.border}
      />
      <line x1={x} y1={y} x2={defaultColumnStartX} y2={switchApexY} stroke={colors.border} />
      <line x1={x + width} y1={y} x2={defaultColumnStartX} y2={switchApexY} stroke={colors.border} />
      <line
        x1={defaultColumnStartX}
        y1={switchApexY}
        x2={defaultColumnStartX}
        y2={switchHeaderBottom}
        stroke={colors.border}
      />
      {hasMultipleColumns
        ? columnStarts.slice(1, -1).map((columnStartX, index) => {
            const diagonalY =
              y + ((columnStartX - x) * (switchApexY - y)) / safeDiagonalRun;
            return (
              <line
                key={`${keyPrefix}-header-drop-${index}`}
                x1={columnStartX}
                y1={diagonalY}
                x2={columnStartX}
                y2={switchHeaderBottom}
                stroke={colors.border}
              />
            );
          })
        : null}
      <text
        x={defaultColumnStartX}
        y={y + STRUCTOGRAM_FONT_SIZE + STRUCTOGRAM_SWITCH_CONDITION_TOP_PADDING}
        textAnchor="middle"
        fontSize={STRUCTOGRAM_FONT_SIZE}
        fill={colors.text}
      >
        {node.expression}
      </text>

      {node.cases.map((entry, index) => {
        const currentX = columnX;
        const caseWidth = renderedCaseWidths[index] ?? entry.width;
        columnX += caseWidth;

        const columnElements: ReactNode[] = [
          renderCenteredText(
            entry.label,
            currentX,
            labelBandTop,
            caseWidth,
            labelBandHeight,
            `${keyPrefix}-label-${index}`
          ),
          <rect
            key={`${keyPrefix}-body-bg-${index}`}
            x={currentX}
            y={caseBodyTop}
            width={caseWidth}
            height={node.branchHeight}
            fill={colors.branch}
            stroke={colors.border}
          />,
          renderNode(entry.body, currentX, caseBodyTop, caseWidth, `${keyPrefix}-body-${index}`),
          renderPaddedRemainder(
            currentX,
            caseBodyTop,
            caseWidth,
            entry.body.height,
            node.branchHeight,
            `${keyPrefix}-body-remainder-${index}`
          )
        ];

        if (index > 0) {
          columnElements.push(
            <line
              key={`${keyPrefix}-divider-${index}`}
              x1={currentX}
              y1={switchHeaderBottom}
              x2={currentX}
              y2={y + node.height}
              stroke={colors.border}
            />
          );
        }

        return <g key={`${keyPrefix}-case-${index}`}>{columnElements}</g>;
      })}
    </g>
  );
};
