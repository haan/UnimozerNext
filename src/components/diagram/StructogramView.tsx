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
  STRUCTOGRAM_MIN_BRANCH_WIDTH,
  STRUCTOGRAM_MIN_NODE_WIDTH,
  STRUCTOGRAM_ROW_HEIGHT,
  STRUCTOGRAM_SECTION_HEADER_HEIGHT,
  STRUCTOGRAM_TEXT_BASELINE_OFFSET,
  STRUCTOGRAM_TEXT_PADDING_X
} from "./constants";

type StructogramViewProps = {
  ownerName: string;
  method: UmlMethod;
};

type LayoutNode =
  | {
      kind: "statement";
      text: string;
      width: number;
      height: number;
    }
  | {
      kind: "sequence";
      children: LayoutNode[];
      width: number;
      height: number;
    }
  | {
      kind: "if";
      condition: string;
      thenBranch: LayoutNode;
      elseBranch: LayoutNode;
      width: number;
      height: number;
    }
  | {
      kind: "loop";
      label: string;
      body: LayoutNode;
      width: number;
      height: number;
    }
  | {
      kind: "switch";
      expression: string;
      cases: Array<{ label: string; body: LayoutNode }>;
      width: number;
      height: number;
    }
  | {
      kind: "try";
      body: LayoutNode;
      catches: Array<{ exception: string; body: LayoutNode }>;
      finallyBranch: LayoutNode | null;
      width: number;
      height: number;
    };

const COLORS = {
  border: "hsl(var(--border))",
  text: "hsl(var(--foreground))",
  mutedText: "hsl(var(--muted-foreground))",
  cell: "hsl(var(--card))",
  header: "hsl(var(--muted) / 0.7)",
  alternate: "hsl(var(--muted) / 0.45)",
  branchLeft: "hsl(220 85% 92%)",
  branchRight: "hsl(355 80% 93%)"
} as const;

const EMPTY_BODY_LABEL = "(empty)";

const estimatedTextWidth = (value: string) =>
  Math.max(
    STRUCTOGRAM_MIN_NODE_WIDTH,
    value.length * STRUCTOGRAM_CHAR_WIDTH + STRUCTOGRAM_TEXT_PADDING_X * 2
  );

const withRow = (text: string): LayoutNode => ({
  kind: "statement",
  text,
  width: estimatedTextWidth(text),
  height: STRUCTOGRAM_ROW_HEIGHT
});

const branchLabel = (value: string | null | undefined, prefix: string) => {
  const normalized = value?.trim();
  if (!normalized) return prefix;
  return `${prefix} (${normalized})`;
};

const loopLabel = (kind: string | null | undefined, condition: string | null | undefined) => {
  const normalizedKind = kind?.trim() || "loop";
  if (normalizedKind === "doWhile") {
    return branchLabel(condition, "do ... while");
  }
  return branchLabel(condition, normalizedKind);
};

const toSequence = (nodes: UmlStructogramNode[] | undefined): LayoutNode => {
  const items = (nodes ?? []).map(toLayoutNode).filter((item): item is LayoutNode => Boolean(item));
  if (items.length === 0) {
    return withRow(EMPTY_BODY_LABEL);
  }
  const width = Math.max(STRUCTOGRAM_MIN_NODE_WIDTH, ...items.map((item) => item.width));
  const height = items.reduce((acc, item) => acc + item.height, 0);
  return {
    kind: "sequence",
    children: items,
    width,
    height
  };
};

const normalizeLabel = (value: string | null | undefined, fallback: string) => {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : fallback;
};

const toSwitchCases = (
  cases: UmlStructogramSwitchCase[] | undefined
): Array<{ label: string; body: LayoutNode }> => {
  const resolved =
    cases?.map((entry) => ({
      label: normalizeLabel(entry.label, "default"),
      body: toSequence(entry.body)
    })) ?? [];
  if (resolved.length === 0) {
    return [{ label: "default", body: withRow(EMPTY_BODY_LABEL) }];
  }
  return resolved;
};

const toCatchLayouts = (
  catches: UmlStructogramCatchClause[] | undefined
): Array<{ exception: string; body: LayoutNode }> => {
  return (
    catches?.map((item) => ({
      exception: normalizeLabel(item.exception, "catch"),
      body: toSequence(item.body)
    })) ?? []
  );
};

const toLayoutNode = (node: UmlStructogramNode | null | undefined): LayoutNode | null => {
  if (!node) return null;

  if (node.kind === "statement") {
    return withRow(normalizeLabel(node.text, EMPTY_BODY_LABEL));
  }

  if (node.kind === "sequence") {
    return toSequence(node.children);
  }

  if (node.kind === "if") {
    const condition = normalizeLabel(node.condition, "condition");
    const thenBranch = toSequence(node.thenBranch);
    const elseBranch = toSequence(node.elseBranch);
    const width = Math.max(
      estimatedTextWidth(`if (${condition})`),
      thenBranch.width + elseBranch.width,
      STRUCTOGRAM_MIN_BRANCH_WIDTH * 2
    );
    const height = STRUCTOGRAM_HEADER_HEIGHT + Math.max(thenBranch.height, elseBranch.height);
    return {
      kind: "if",
      condition,
      thenBranch,
      elseBranch,
      width,
      height
    };
  }

  if (node.kind === "loop") {
    const label = loopLabel(node.loopKind, node.condition);
    const body = toSequence(node.children);
    const width = Math.max(estimatedTextWidth(label), body.width);
    const height = STRUCTOGRAM_HEADER_HEIGHT + body.height;
    return {
      kind: "loop",
      label,
      body,
      width,
      height
    };
  }

  if (node.kind === "switch") {
    const expression = normalizeLabel(node.condition, "selector");
    const cases = toSwitchCases(node.switchCases);
    const width = Math.max(
      estimatedTextWidth(`switch (${expression})`),
      ...cases.map((entry) => Math.max(estimatedTextWidth(`case ${entry.label}`), entry.body.width))
    );
    const height =
      STRUCTOGRAM_HEADER_HEIGHT +
      cases.reduce(
        (acc, entry) => acc + STRUCTOGRAM_SECTION_HEADER_HEIGHT + entry.body.height,
        0
      );
    return {
      kind: "switch",
      expression,
      cases,
      width,
      height
    };
  }

  if (node.kind === "try") {
    const body = toSequence(node.children);
    const catches = toCatchLayouts(node.catches);
    const finallyBranch =
      node.finallyBranch && node.finallyBranch.length > 0
        ? toSequence(node.finallyBranch)
        : null;
    const width = Math.max(
      estimatedTextWidth("try"),
      body.width,
      ...catches.map((item) => Math.max(estimatedTextWidth(`catch (${item.exception})`), item.body.width)),
      finallyBranch
        ? Math.max(estimatedTextWidth("finally"), finallyBranch.width)
        : STRUCTOGRAM_MIN_NODE_WIDTH
    );
    let height = STRUCTOGRAM_HEADER_HEIGHT + body.height;
    for (const item of catches) {
      height += STRUCTOGRAM_SECTION_HEADER_HEIGHT + item.body.height;
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

  return withRow(normalizeLabel(node.text, node.kind));
};

const centeredTextY = (top: number, rowHeight: number) =>
  top + rowHeight / 2 + STRUCTOGRAM_TEXT_BASELINE_OFFSET / 2;

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
        <rect x={x} y={y} width={width} height={node.height} fill={COLORS.cell} stroke={COLORS.border} />
        <text
          x={x + STRUCTOGRAM_TEXT_PADDING_X}
          y={centeredTextY(y, node.height)}
          fontSize={STRUCTOGRAM_FONT_SIZE}
          fill={COLORS.text}
        >
          {node.text}
        </text>
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
    return (
      <g key={keyPrefix}>
        <rect x={x} y={y} width={width} height={node.height} fill={COLORS.cell} stroke={COLORS.border} />
        <rect
          x={x}
          y={y}
          width={width}
          height={STRUCTOGRAM_HEADER_HEIGHT}
          fill={COLORS.header}
          stroke={COLORS.border}
        />
        <text
          x={x + STRUCTOGRAM_TEXT_PADDING_X}
          y={centeredTextY(y, STRUCTOGRAM_HEADER_HEIGHT)}
          fontSize={STRUCTOGRAM_FONT_SIZE}
          fill={COLORS.text}
        >
          {node.label}
        </text>
        {renderNode(
          node.body,
          x,
          y + STRUCTOGRAM_HEADER_HEIGHT,
          width,
          `${keyPrefix}-body`
        )}
      </g>
    );
  }

  if (node.kind === "if") {
    const leftWidth = Math.max(STRUCTOGRAM_MIN_BRANCH_WIDTH, Math.floor(width / 2));
    const rightWidth = Math.max(STRUCTOGRAM_MIN_BRANCH_WIDTH, width - leftWidth);
    const branchHeight = Math.max(node.thenBranch.height, node.elseBranch.height);
    return (
      <g key={keyPrefix}>
        <rect x={x} y={y} width={width} height={node.height} fill={COLORS.cell} stroke={COLORS.border} />
        <rect
          x={x}
          y={y}
          width={width}
          height={STRUCTOGRAM_HEADER_HEIGHT}
          fill={COLORS.header}
          stroke={COLORS.border}
        />
        <text
          x={x + STRUCTOGRAM_TEXT_PADDING_X}
          y={centeredTextY(y, STRUCTOGRAM_HEADER_HEIGHT)}
          fontSize={STRUCTOGRAM_FONT_SIZE}
          fill={COLORS.text}
        >
          {`if (${node.condition})`}
        </text>
        <rect
          x={x}
          y={y + STRUCTOGRAM_HEADER_HEIGHT}
          width={leftWidth}
          height={branchHeight}
          fill={COLORS.branchLeft}
          stroke={COLORS.border}
        />
        <rect
          x={x + leftWidth}
          y={y + STRUCTOGRAM_HEADER_HEIGHT}
          width={rightWidth}
          height={branchHeight}
          fill={COLORS.branchRight}
          stroke={COLORS.border}
        />
        <text
          x={x + STRUCTOGRAM_TEXT_PADDING_X}
          y={y + STRUCTOGRAM_HEADER_HEIGHT + STRUCTOGRAM_SECTION_HEADER_HEIGHT - 6}
          fontSize={STRUCTOGRAM_FONT_SIZE}
          fill={COLORS.mutedText}
        >
          T
        </text>
        <text
          x={x + leftWidth + STRUCTOGRAM_TEXT_PADDING_X}
          y={y + STRUCTOGRAM_HEADER_HEIGHT + STRUCTOGRAM_SECTION_HEADER_HEIGHT - 6}
          fontSize={STRUCTOGRAM_FONT_SIZE}
          fill={COLORS.mutedText}
        >
          F
        </text>
        {renderNode(
          node.thenBranch,
          x,
          y + STRUCTOGRAM_HEADER_HEIGHT,
          leftWidth,
          `${keyPrefix}-then`
        )}
        {renderNode(
          node.elseBranch,
          x + leftWidth,
          y + STRUCTOGRAM_HEADER_HEIGHT,
          rightWidth,
          `${keyPrefix}-else`
        )}
      </g>
    );
  }

  if (node.kind === "switch") {
    let offsetY = y + STRUCTOGRAM_HEADER_HEIGHT;
    return (
      <g key={keyPrefix}>
        <rect x={x} y={y} width={width} height={node.height} fill={COLORS.cell} stroke={COLORS.border} />
        <rect
          x={x}
          y={y}
          width={width}
          height={STRUCTOGRAM_HEADER_HEIGHT}
          fill={COLORS.header}
          stroke={COLORS.border}
        />
        <text
          x={x + STRUCTOGRAM_TEXT_PADDING_X}
          y={centeredTextY(y, STRUCTOGRAM_HEADER_HEIGHT)}
          fontSize={STRUCTOGRAM_FONT_SIZE}
          fill={COLORS.text}
        >
          {`switch (${node.expression})`}
        </text>
        {node.cases.map((entry, index) => {
          const headerY = offsetY;
          offsetY += STRUCTOGRAM_SECTION_HEADER_HEIGHT;
          const contentY = offsetY;
          offsetY += entry.body.height;
          return (
            <g key={`${keyPrefix}-case-${index}`}>
              <rect
                x={x}
                y={headerY}
                width={width}
                height={STRUCTOGRAM_SECTION_HEADER_HEIGHT}
                fill={COLORS.alternate}
                stroke={COLORS.border}
              />
              <text
                x={x + STRUCTOGRAM_TEXT_PADDING_X}
                y={centeredTextY(headerY, STRUCTOGRAM_SECTION_HEADER_HEIGHT)}
                fontSize={STRUCTOGRAM_FONT_SIZE}
                fill={COLORS.text}
              >
                {`case ${entry.label}`}
              </text>
              {renderNode(entry.body, x, contentY, width, `${keyPrefix}-case-body-${index}`)}
            </g>
          );
        })}
      </g>
    );
  }

  if (node.kind === "try") {
    let offsetY = y + STRUCTOGRAM_HEADER_HEIGHT;
    const rows: ReactNode[] = [];
    rows.push(renderNode(node.body, x, offsetY, width, `${keyPrefix}-try-body`));
    offsetY += node.body.height;

    node.catches.forEach((entry, index) => {
      const headerY = offsetY;
      offsetY += STRUCTOGRAM_SECTION_HEADER_HEIGHT;
      const bodyY = offsetY;
      offsetY += entry.body.height;
      rows.push(
        <g key={`${keyPrefix}-catch-${index}`}>
          <rect
            x={x}
            y={headerY}
            width={width}
            height={STRUCTOGRAM_SECTION_HEADER_HEIGHT}
            fill={COLORS.alternate}
            stroke={COLORS.border}
          />
          <text
            x={x + STRUCTOGRAM_TEXT_PADDING_X}
            y={centeredTextY(headerY, STRUCTOGRAM_SECTION_HEADER_HEIGHT)}
            fontSize={STRUCTOGRAM_FONT_SIZE}
            fill={COLORS.text}
          >
            {`catch (${entry.exception})`}
          </text>
          {renderNode(entry.body, x, bodyY, width, `${keyPrefix}-catch-body-${index}`)}
        </g>
      );
    });

    if (node.finallyBranch) {
      const headerY = offsetY;
      offsetY += STRUCTOGRAM_SECTION_HEADER_HEIGHT;
      rows.push(
        <g key={`${keyPrefix}-finally`}>
          <rect
            x={x}
            y={headerY}
            width={width}
            height={STRUCTOGRAM_SECTION_HEADER_HEIGHT}
            fill={COLORS.alternate}
            stroke={COLORS.border}
          />
          <text
            x={x + STRUCTOGRAM_TEXT_PADDING_X}
            y={centeredTextY(headerY, STRUCTOGRAM_SECTION_HEADER_HEIGHT)}
            fontSize={STRUCTOGRAM_FONT_SIZE}
            fill={COLORS.text}
          >
            finally
          </text>
          {renderNode(
            node.finallyBranch,
            x,
            offsetY,
            width,
            `${keyPrefix}-finally-body`
          )}
        </g>
      );
    }

    return (
      <g key={keyPrefix}>
        <rect x={x} y={y} width={width} height={node.height} fill={COLORS.cell} stroke={COLORS.border} />
        <rect
          x={x}
          y={y}
          width={width}
          height={STRUCTOGRAM_HEADER_HEIGHT}
          fill={COLORS.header}
          stroke={COLORS.border}
        />
        <text
          x={x + STRUCTOGRAM_TEXT_PADDING_X}
          y={centeredTextY(y, STRUCTOGRAM_HEADER_HEIGHT)}
          fontSize={STRUCTOGRAM_FONT_SIZE}
          fill={COLORS.text}
        >
          try
        </text>
        {rows}
      </g>
    );
  }

  return null;
};

export const StructogramView = ({ ownerName, method }: StructogramViewProps) => {
  const layout = useMemo(() => toLayoutNode(method.controlTree), [method.controlTree]);

  if (!layout) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No control-tree data available for this method.
      </div>
    );
  }

  const width = Math.max(STRUCTOGRAM_MIN_NODE_WIDTH, layout.width) + STRUCTOGRAM_CANVAS_PADDING * 2;
  const height = layout.height + STRUCTOGRAM_CANVAS_PADDING * 2;

  return (
    <div className="flex h-full w-full min-w-0 flex-col overflow-hidden p-3 text-sm">
      <div className="rounded-md border border-border bg-card p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Active Method
        </div>
        <div className="truncate text-sm font-semibold text-foreground" title={`${ownerName} • ${method.signature}`}>
          {ownerName} • {method.signature}
        </div>
      </div>
      <div className="mt-3 min-h-0 min-w-0 flex-1 overflow-auto rounded-md border border-border bg-background p-2">
        <svg
          className="block"
          width={width}
          height={height}
          role="img"
          aria-label="Nassi-Shneiderman structogram"
        >
          {renderNode(layout, STRUCTOGRAM_CANVAS_PADDING, STRUCTOGRAM_CANVAS_PADDING, layout.width)}
        </svg>
      </div>
    </div>
  );
};
