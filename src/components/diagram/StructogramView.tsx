import { useMemo, type ReactNode } from "react";

import type {
  UmlMethod,
  UmlStructogramCatchClause,
  UmlStructogramNode,
  UmlStructogramSwitchCase
} from "../../models/uml";
import {
  STRUCTOGRAM_CANVAS_PADDING,
  STRUCTOGRAM_CHAR_WIDTH,
  STRUCTOGRAM_FONT_SIZE,
  STRUCTOGRAM_HEADER_HEIGHT,
  STRUCTOGRAM_ROW_HEIGHT,
  STRUCTOGRAM_SECTION_HEADER_HEIGHT,
  STRUCTOGRAM_TEXT_BASELINE_OFFSET,
  STRUCTOGRAM_TEXT_PADDING_X
} from "./constants";

type StructogramViewProps = {
  method: UmlMethod;
};

type SequenceLayoutNode = {
  kind: "sequence";
  children: LayoutNode[];
  width: number;
  height: number;
};

type StatementLayoutNode = {
  kind: "statement";
  text: string;
  width: number;
  height: number;
};

type IfLayoutNode = {
  kind: "if";
  condition: string;
  thenBranch: LayoutNode;
  elseBranch: LayoutNode;
  leftWidth: number;
  rightWidth: number;
  branchHeight: number;
  width: number;
  height: number;
};

type LoopLayoutNode = {
  kind: "loop";
  header: string;
  footer: string | null;
  bodyInsetWidth: number;
  body: LayoutNode;
  width: number;
  height: number;
};

type SwitchLayoutNode = {
  kind: "switch";
  expression: string;
  cases: Array<{ label: string; body: LayoutNode; width: number }>;
  branchHeight: number;
  width: number;
  height: number;
};

type TryLayoutNode = {
  kind: "try";
  body: LayoutNode;
  catches: Array<{ exception: string; body: LayoutNode }>;
  finallyBranch: LayoutNode | null;
  width: number;
  height: number;
};

type LayoutNode =
  | StatementLayoutNode
  | SequenceLayoutNode
  | IfLayoutNode
  | LoopLayoutNode
  | SwitchLayoutNode
  | TryLayoutNode;

const COLORS = {
  border: "hsl(var(--foreground) / 0.78)",
  text: "hsl(var(--foreground))",
  mutedText: "hsl(var(--muted-foreground))",
  body: "hsl(var(--background))",
  condition: "hsl(var(--accent) / 0.55)",
  branch: "hsl(var(--muted) / 0.30)",
  section: "hsl(var(--muted) / 0.50)"
} as const;

const EMPTY_BODY_LABEL = "(empty)";
const NO_ELSE_LABEL = "(no else)";
const LABEL_TEXT_OFFSET_Y = 6;
const IF_HEADER_HEIGHT = STRUCTOGRAM_HEADER_HEIGHT + 10;
const IF_CONDITION_TOP_PADDING = 5;
const LOOP_BODY_INSET_WIDTH = 28;
const SVG_STROKE_WIDTH = 1.1;
const STRUCTOGRAM_VIEWPORT_PADDING_PX = 8;
const STRUCTOGRAM_HEADER_TOP_PADDING_PX = 10;
const STRUCTOGRAM_HEADER_BOTTOM_PADDING_PX = 0;
const NS_ASSIGNMENT_SYMBOL = "←";
const STRUCTOGRAM_MIN_CONTENT_WIDTH = Math.max(
  64,
  STRUCTOGRAM_TEXT_PADDING_X * 2 + STRUCTOGRAM_CHAR_WIDTH * 4
);

const stripComments = (value: string): string =>
  value.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, " ");

const normalizeLabel = (value: string | null | undefined, fallback: string) => {
  const normalized = stripComments(value ?? "").replace(/\s+/g, " ").trim();
  return normalized && normalized.length > 0 ? normalized : fallback;
};

const estimatedTextWidth = (value: string) =>
  Math.max(
    STRUCTOGRAM_MIN_CONTENT_WIDTH,
    value.length * STRUCTOGRAM_CHAR_WIDTH + STRUCTOGRAM_TEXT_PADDING_X * 2
  );

const createStatement = (text: string): StatementLayoutNode => ({
  kind: "statement",
  text,
  width: estimatedTextWidth(text),
  height: STRUCTOGRAM_ROW_HEIGHT
});

const normalizeStatementText = (value: string | null | undefined): string | null => {
  const normalized = stripComments(value ?? "").replace(/\s+/g, " ").trim();
  const withoutSemicolon = normalized.replace(/;+$/g, "").trim();
  if (withoutSemicolon.length === 0) return null;

  const declarationAssignmentMatch = withoutSemicolon.match(
    /^(?:(?:final|volatile|transient|static)\s+)*(?:[^\s=]+\s+)+([A-Za-z_$][\w$]*)\s*=\s*(.+)$/
  );
  if (declarationAssignmentMatch) {
    const [, variableName, expression] = declarationAssignmentMatch;
    return `${variableName} ${NS_ASSIGNMENT_SYMBOL} ${expression.trim()}`;
  }

  const plainAssignmentMatch = withoutSemicolon.match(
    /^([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\[[^\]]+\])*)\s*=\s*(.+)$/
  );
  if (plainAssignmentMatch) {
    const [, target, expression] = plainAssignmentMatch;
    return `${target} ${NS_ASSIGNMENT_SYMBOL} ${expression.trim()}`;
  }

  return withoutSemicolon;
};

const normalizeVisibility = (visibility: string | undefined): string => {
  if (!visibility) return "";
  switch (visibility.trim()) {
    case "+":
    case "public":
      return "public";
    case "-":
    case "private":
      return "private";
    case "#":
    case "protected":
      return "protected";
    default:
      return "";
  }
};

const fallbackMethodNameFromSignature = (signature: string): string => {
  const namePart = signature.split("(")[0] ?? signature;
  const pieces = namePart.trim().split(/\s+/);
  return pieces[pieces.length - 1] || signature;
};

const fallbackParamsFromSignature = (signature: string): string => {
  const match = signature.match(/\((.*)\)/);
  return match?.[1]?.trim() ?? "";
};

const toMethodDeclaration = (method: UmlMethod): string => {
  const visibility = normalizeVisibility(method.visibility);
  const staticToken = method.isStatic ? "static" : "";
  const returnType = method.returnType?.trim() || "void";
  const methodName = method.name?.trim() || fallbackMethodNameFromSignature(method.signature);
  const params =
    method.params && method.params.length > 0
      ? method.params
          .map((param, index) => {
            const type = (param.type ?? "").trim();
            const name = (param.name ?? "").trim();
            if (type && name) return `${type} ${name}`;
            if (type) return type;
            if (name) return name;
            return `arg${index}`;
          })
          .join(", ")
      : fallbackParamsFromSignature(method.signature);
  const prefix = [visibility, staticToken, returnType].filter((value) => value.length > 0).join(" ");
  return `${prefix} ${methodName}(${params})`.trim();
};

const toSequence = (nodes: UmlStructogramNode[] | undefined): SequenceLayoutNode => {
  const children = (nodes ?? []).map(toLayoutNode).filter((item): item is LayoutNode => Boolean(item));
  if (children.length === 0) {
    return {
      kind: "sequence",
      children: [createStatement(EMPTY_BODY_LABEL)],
      width: estimatedTextWidth(EMPTY_BODY_LABEL),
      height: STRUCTOGRAM_ROW_HEIGHT
    };
  }
  const width = Math.max(...children.map((child) => child.width));
  const height = children.reduce((sum, child) => sum + child.height, 0);
  return { kind: "sequence", children, width, height };
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

const loopHeader = (loopKind: string | null | undefined, condition: string | null | undefined) => {
  const kind = loopKind?.trim() || "loop";
  const normalizedCondition = normalizeLabel(condition, "condition");
  if (kind === "doWhile") {
    return { header: "do", footer: `while (${normalizedCondition})` };
  }
  return {
    header: `${kind} (${normalizedCondition})`,
    footer: null
  };
};

const toSwitchCases = (
  cases: UmlStructogramSwitchCase[] | undefined
): Array<{ label: string; body: LayoutNode }> => {
  const mapped =
    cases?.map((entry) => ({
      label: normalizeLabel(entry.label, "default"),
      body: toSequence(entry.body)
    })) ?? [];
  if (mapped.length === 0) {
    return [{ label: "default", body: createStatement(EMPTY_BODY_LABEL) }];
  }
  return mapped;
};

const toCatchLayouts = (
  catches: UmlStructogramCatchClause[] | undefined
): Array<{ exception: string; body: LayoutNode }> =>
  catches?.map((item) => ({
    exception: normalizeLabel(item.exception, "catch"),
    body: toSequence(item.body)
  })) ?? [];

const toLayoutNode = (node: UmlStructogramNode | null | undefined): LayoutNode | null => {
  if (!node) {
    return null;
  }

  if (node.kind === "statement") {
    const statementText = normalizeStatementText(node.text);
    return statementText ? createStatement(statementText) : null;
  }

  if (node.kind === "sequence") {
    return toSequence(node.children);
  }

  if (node.kind === "if") {
    const condition = normalizeLabel(node.condition, "condition");
    const thenBranch = toSequence(node.thenBranch);
    const hasElseBranch = (node.elseBranch ?? []).length > 0;
    const elseBranch = hasElseBranch ? toSequence(node.elseBranch) : createStatement(NO_ELSE_LABEL);
    const leftWidth = thenBranch.width;
    const rightWidth = elseBranch.width;
    const width = Math.max(estimatedTextWidth(`if (${condition})`), leftWidth + rightWidth);
    const branchHeight = Math.max(thenBranch.height, elseBranch.height);
    return {
      kind: "if",
      condition,
      thenBranch,
      elseBranch,
      leftWidth,
      rightWidth,
      branchHeight,
      width,
      height: IF_HEADER_HEIGHT + branchHeight
    };
  }

  if (node.kind === "loop") {
    const body = toSequence(node.children);
    const labels = loopHeader(node.loopKind, node.condition);
    if (labels.footer) {
      const width = Math.max(
        estimatedTextWidth(labels.header),
        estimatedTextWidth(labels.footer),
        body.width
      );
      const height = STRUCTOGRAM_HEADER_HEIGHT + body.height + STRUCTOGRAM_HEADER_HEIGHT;
      return {
        kind: "loop",
        header: labels.header,
        footer: labels.footer,
        bodyInsetWidth: 0,
        body,
        width,
        height
      };
    }

    const width = Math.max(estimatedTextWidth(labels.header), body.width + LOOP_BODY_INSET_WIDTH);
    const height = Math.max(STRUCTOGRAM_ROW_HEIGHT * 2, body.height);
    return {
      kind: "loop",
      header: labels.header,
      footer: labels.footer,
      bodyInsetWidth: LOOP_BODY_INSET_WIDTH,
      body,
      width,
      height
    };
  }

  if (node.kind === "switch") {
    const expression = normalizeLabel(node.condition, "selector");
    const cases = toSwitchCases(node.switchCases);
    const branchHeight = Math.max(STRUCTOGRAM_ROW_HEIGHT, ...cases.map((entry) => entry.body.height));
    const initialWidths = cases.map((entry) =>
      Math.max(entry.body.width, estimatedTextWidth(`case ${entry.label}`))
    );
    const requiredHeaderWidth = estimatedTextWidth(`switch (${expression})`);
    const caseWidths = distributeCaseWidths(initialWidths, requiredHeaderWidth);
    const resolvedCases = cases.map((entry, index) => ({
      ...entry,
      width: caseWidths[index]
    }));
    const width = resolvedCases.reduce((sum, entry) => sum + entry.width, 0);
    return {
      kind: "switch",
      expression,
      cases: resolvedCases,
      branchHeight,
      width,
      height: STRUCTOGRAM_HEADER_HEIGHT + STRUCTOGRAM_SECTION_HEADER_HEIGHT + branchHeight
    };
  }

  if (node.kind === "try") {
    const body = toSequence(node.children);
    const catches = toCatchLayouts(node.catches);
    const finallyBranch =
      node.finallyBranch && node.finallyBranch.length > 0 ? toSequence(node.finallyBranch) : null;
    const catchWidths = catches.map((entry) =>
      Math.max(estimatedTextWidth(`catch (${entry.exception})`), entry.body.width)
    );
    const finallyWidth =
      finallyBranch === null
        ? estimatedTextWidth("finally")
        : Math.max(estimatedTextWidth("finally"), finallyBranch.width);
    const width = Math.max(
      estimatedTextWidth("try"),
      body.width,
      ...catchWidths,
      finallyWidth
    );

    let height = STRUCTOGRAM_HEADER_HEIGHT + body.height;
    for (const entry of catches) {
      height += STRUCTOGRAM_SECTION_HEADER_HEIGHT + entry.body.height;
    }
    if (finallyBranch) {
      height += STRUCTOGRAM_SECTION_HEADER_HEIGHT + finallyBranch.height;
    }

    return {
      kind: "try",
      body,
      catches,
      finallyBranch,
      width,
      height
    };
  }

  return createStatement(normalizeLabel(node.text, node.kind));
};

const textBaseline = (top: number, rowHeight: number) =>
  top + rowHeight / 2 + STRUCTOGRAM_TEXT_BASELINE_OFFSET / 2;

const renderLeftAlignedText = (
  value: string,
  x: number,
  y: number,
  rowHeight: number,
  fill = COLORS.text,
  key: string
) => (
  <text
    key={key}
    x={x + STRUCTOGRAM_TEXT_PADDING_X}
    y={textBaseline(y, rowHeight)}
    fontSize={STRUCTOGRAM_FONT_SIZE}
    fill={fill}
  >
    {value}
  </text>
);

const renderCenteredText = (
  value: string,
  x: number,
  y: number,
  width: number,
  rowHeight: number,
  key: string
) => (
  <text
    key={key}
    x={x + width / 2}
    y={textBaseline(y, rowHeight)}
    textAnchor="middle"
    fontSize={STRUCTOGRAM_FONT_SIZE}
    fill={COLORS.text}
  >
    {value}
  </text>
);

const renderPaddedRemainder = (
  x: number,
  y: number,
  width: number,
  contentHeight: number,
  fullHeight: number,
  key: string
) => {
  if (contentHeight >= fullHeight) {
    return null;
  }
  return (
    <rect
      key={key}
      x={x}
      y={y + contentHeight}
      width={width}
      height={fullHeight - contentHeight}
      fill={COLORS.body}
      stroke={COLORS.border}
    />
  );
};

const fitColumnWidths = (baseWidths: number[], targetWidth: number): number[] => {
  if (baseWidths.length === 0) {
    return [];
  }
  const baseTotal = baseWidths.reduce((sum, width) => sum + width, 0);
  if (baseTotal <= 0 || targetWidth <= 0) {
    return baseWidths;
  }
  if (Math.abs(baseTotal - targetWidth) < 0.5) {
    return baseWidths;
  }

  const scaled = baseWidths.map((width) => Math.floor((width / baseTotal) * targetWidth));
  let used = scaled.reduce((sum, width) => sum + width, 0);
  let remainder = targetWidth - used;
  const widths = [...scaled];
  let index = 0;
  while (remainder > 0) {
    widths[index % widths.length] += 1;
    remainder -= 1;
    index += 1;
  }
  used = widths.reduce((sum, width) => sum + width, 0);
  if (used !== targetWidth) {
    widths[widths.length - 1] += targetWidth - used;
  }
  return widths;
};

const renderNode = (
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
        {renderLeftAlignedText(node.text, x, y, node.height, COLORS.text, `${keyPrefix}-text`)}
      </g>
    );
  }

  if (node.kind === "sequence") {
    let offsetY = y;
    return (
      <g key={keyPrefix}>
        {node.children.map((child, index) => {
          const rendered = renderNode(child, x, offsetY, width, `${keyPrefix}-${index}`);
          offsetY += child.height;
          return rendered;
        })}
      </g>
    );
  }

  if (node.kind === "loop") {
    const bodyY = y + STRUCTOGRAM_HEADER_HEIGHT;
    const footerHeight = node.footer ? STRUCTOGRAM_HEADER_HEIGHT : 0;
    const bodyHeight = node.height - STRUCTOGRAM_HEADER_HEIGHT - footerHeight;
    const footerY = bodyY + bodyHeight;
    const loopContentX = x + node.bodyInsetWidth;
    const loopContentWidth = width - node.bodyInsetWidth;

    return (
      <g key={keyPrefix}>
        <rect x={x} y={y} width={width} height={node.height} fill={COLORS.body} stroke={COLORS.border} />
        <rect
          x={x}
          y={y}
          width={width}
          height={STRUCTOGRAM_HEADER_HEIGHT}
          fill={COLORS.condition}
          stroke={node.bodyInsetWidth > 0 ? "none" : COLORS.border}
        />
        {renderLeftAlignedText(node.header, x, y, STRUCTOGRAM_HEADER_HEIGHT, COLORS.text, `${keyPrefix}-header`)}
        {node.bodyInsetWidth > 0 ? (
          <g key={`${keyPrefix}-inset`}>
            <rect
              x={x}
              y={bodyY}
              width={width}
              height={bodyHeight}
              fill={COLORS.branch}
              stroke="none"
            />
            <rect
              x={x}
              y={bodyY}
              width={node.bodyInsetWidth}
              height={bodyHeight}
              fill={COLORS.condition}
              stroke="none"
            />
            <line
              x1={loopContentX}
              y1={bodyY}
              x2={x + width}
              y2={bodyY}
              stroke={COLORS.border}
            />
            <line
              x1={loopContentX}
              y1={bodyY}
              x2={loopContentX}
              y2={footerY}
              stroke={COLORS.border}
            />
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
              fill={COLORS.condition}
              stroke={COLORS.border}
            />
            {renderLeftAlignedText(
              node.footer,
              x,
              footerY,
              STRUCTOGRAM_HEADER_HEIGHT,
              COLORS.text,
              `${keyPrefix}-footer-text`
            )}
          </g>
        ) : null}
      </g>
    );
  }

  if (node.kind === "if") {
    const branchTop = y + IF_HEADER_HEIGHT;
    const [leftWidth, rightWidth] = fitColumnWidths([node.leftWidth, node.rightWidth], width);
    const splitX = x + leftWidth;

    return (
      <g key={keyPrefix}>
        <rect x={x} y={y} width={width} height={node.height} fill={COLORS.body} stroke={COLORS.border} />
        <rect
          x={x}
          y={y}
          width={width}
          height={IF_HEADER_HEIGHT}
          fill={COLORS.condition}
          stroke={COLORS.border}
        />
        <line x1={x} y1={y} x2={splitX} y2={branchTop} stroke={COLORS.border} />
        <line x1={x + width} y1={y} x2={splitX} y2={branchTop} stroke={COLORS.border} />
        <line x1={splitX} y1={branchTop} x2={splitX} y2={y + node.height} stroke={COLORS.border} />
        <line x1={x} y1={branchTop} x2={x + width} y2={branchTop} stroke={COLORS.border} />

        <text
          x={splitX}
          y={y + STRUCTOGRAM_FONT_SIZE + IF_CONDITION_TOP_PADDING}
          textAnchor="middle"
          fontSize={STRUCTOGRAM_FONT_SIZE}
          fill={COLORS.text}
        >
          {`if (${node.condition})`}
        </text>

        <text
          x={x + STRUCTOGRAM_TEXT_PADDING_X}
          y={branchTop - LABEL_TEXT_OFFSET_Y}
          fontSize={STRUCTOGRAM_FONT_SIZE}
          fill={COLORS.mutedText}
        >
          T
        </text>
        <text
          x={x + width - STRUCTOGRAM_TEXT_PADDING_X}
          y={branchTop - LABEL_TEXT_OFFSET_Y}
          textAnchor="end"
          fontSize={STRUCTOGRAM_FONT_SIZE}
          fill={COLORS.mutedText}
        >
          F
        </text>

        <rect
          x={x}
          y={branchTop}
          width={leftWidth}
          height={node.branchHeight}
          fill={COLORS.branch}
          stroke={COLORS.border}
        />
        <rect
          x={splitX}
          y={branchTop}
          width={rightWidth}
          height={node.branchHeight}
          fill={COLORS.branch}
          stroke={COLORS.border}
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
  }

  if (node.kind === "switch") {
    const headerBottom = y + STRUCTOGRAM_HEADER_HEIGHT;
    const caseLabelTop = headerBottom;
    const caseBodyTop = caseLabelTop + STRUCTOGRAM_SECTION_HEADER_HEIGHT;
    const fanOriginX = x + width / 2;
    const renderedCaseWidths = fitColumnWidths(
      node.cases.map((entry) => entry.width),
      width
    );

    let columnX = x;

    return (
      <g key={keyPrefix}>
        <rect x={x} y={y} width={width} height={node.height} fill={COLORS.body} stroke={COLORS.border} />
        <rect
          x={x}
          y={y}
          width={width}
          height={STRUCTOGRAM_HEADER_HEIGHT}
          fill={COLORS.condition}
          stroke={COLORS.border}
        />
        {renderCenteredText(
          `switch (${node.expression})`,
          x,
          y,
          width,
          STRUCTOGRAM_HEADER_HEIGHT,
          `${keyPrefix}-header`
        )}

        {node.cases.map((entry, index) => {
          const currentX = columnX;
          const caseWidth = renderedCaseWidths[index] ?? entry.width;
          columnX += caseWidth;

          const columnElements: ReactNode[] = [
            <line
              key={`${keyPrefix}-fan-${index}`}
              x1={fanOriginX}
              y1={y}
              x2={currentX}
              y2={headerBottom}
              stroke={COLORS.border}
            />,
            <rect
              key={`${keyPrefix}-label-bg-${index}`}
              x={currentX}
              y={caseLabelTop}
              width={caseWidth}
              height={STRUCTOGRAM_SECTION_HEADER_HEIGHT}
              fill={COLORS.section}
              stroke={COLORS.border}
            />,
            renderCenteredText(
              `case ${entry.label}`,
              currentX,
              caseLabelTop,
              caseWidth,
              STRUCTOGRAM_SECTION_HEADER_HEIGHT,
              `${keyPrefix}-label-${index}`
            ),
            <rect
              key={`${keyPrefix}-body-bg-${index}`}
              x={currentX}
              y={caseBodyTop}
              width={caseWidth}
              height={node.branchHeight}
              fill={COLORS.branch}
              stroke={COLORS.border}
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
                y1={headerBottom}
                x2={currentX}
                y2={y + node.height}
                stroke={COLORS.border}
              />
            );
          }

          if (index === node.cases.length - 1) {
            columnElements.push(
              <line
                key={`${keyPrefix}-fan-end`}
                x1={fanOriginX}
                y1={y}
                x2={currentX + caseWidth}
                y2={headerBottom}
                stroke={COLORS.border}
              />
            );
          }

          return <g key={`${keyPrefix}-case-${index}`}>{columnElements}</g>;
        })}
      </g>
    );
  }

  if (node.kind === "try") {
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
            fill={COLORS.section}
            stroke={COLORS.border}
          />
          {renderLeftAlignedText(
            `catch (${entry.exception})`,
            x,
            offsetY,
            STRUCTOGRAM_SECTION_HEADER_HEIGHT,
            COLORS.text,
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
            fill={COLORS.section}
            stroke={COLORS.border}
          />
          {renderLeftAlignedText(
            "finally",
            x,
            offsetY,
            STRUCTOGRAM_SECTION_HEADER_HEIGHT,
            COLORS.text,
            `${keyPrefix}-finally-label`
          )}
        </g>
      );
      offsetY += STRUCTOGRAM_SECTION_HEADER_HEIGHT;
      blocks.push(renderNode(node.finallyBranch, x, offsetY, width, `${keyPrefix}-finally-body`));
    }

    return (
      <g key={keyPrefix}>
        <rect x={x} y={y} width={width} height={node.height} fill={COLORS.body} stroke={COLORS.border} />
        <rect
          x={x}
          y={y}
          width={width}
          height={STRUCTOGRAM_HEADER_HEIGHT}
          fill={COLORS.condition}
          stroke={COLORS.border}
        />
        {renderLeftAlignedText("try", x, y, STRUCTOGRAM_HEADER_HEIGHT, COLORS.text, `${keyPrefix}-header`)}
        {blocks}
      </g>
    );
  }

  return null;
};

export const StructogramView = ({ method }: StructogramViewProps) => {
  const layout = useMemo(() => toLayoutNode(method.controlTree), [method.controlTree]);
  const declaration = useMemo(() => toMethodDeclaration(method), [method]);

  if (!layout) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No control-tree data available for this method.
      </div>
    );
  }

  const width = layout.width + STRUCTOGRAM_CANVAS_PADDING * 2;
  const height = layout.height + STRUCTOGRAM_CANVAS_PADDING * 2;
  const signatureLeftPaddingPx = STRUCTOGRAM_VIEWPORT_PADDING_PX + STRUCTOGRAM_CANVAS_PADDING;

  return (
    <div
      className="flex h-full w-full min-w-0 flex-col overflow-hidden p-3 text-sm"
      style={{ fontFamily: "var(--uml-font)" }}
    >
      <div
        style={{
          paddingTop: `${STRUCTOGRAM_HEADER_TOP_PADDING_PX}px`,
          paddingBottom: `${STRUCTOGRAM_HEADER_BOTTOM_PADDING_PX}px`,
          paddingLeft: `${signatureLeftPaddingPx}px`,
          paddingRight: `${STRUCTOGRAM_VIEWPORT_PADDING_PX}px`
        }}
      >
        <div className="truncate text-sm font-semibold text-foreground" title={declaration}>
          {declaration}
        </div>
      </div>
      <div
        className="min-h-0 min-w-0 flex-1 overflow-auto bg-background"
        style={{ padding: `${STRUCTOGRAM_VIEWPORT_PADDING_PX}px` }}
      >
        <svg
          className="block"
          width={width}
          height={height}
          strokeWidth={SVG_STROKE_WIDTH}
          style={{ fontFamily: "var(--uml-font)" }}
          role="img"
          aria-label="Nassi-Shneiderman structogram"
        >
          {renderNode(layout, STRUCTOGRAM_CANVAS_PADDING, STRUCTOGRAM_CANVAS_PADDING, layout.width)}
        </svg>
      </div>
    </div>
  );
};
