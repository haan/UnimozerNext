import type {
  UmlMethod,
  UmlStructogramCatchClause,
  UmlStructogramNode,
  UmlStructogramSwitchCase
} from "../../models/uml";
import {
  STRUCTOGRAM_ASSIGNMENT_SYMBOL,
  STRUCTOGRAM_CHAR_WIDTH,
  STRUCTOGRAM_EMPTY_BODY_LABEL,
  STRUCTOGRAM_MIN_CONTENT_WIDTH,
  STRUCTOGRAM_NO_ELSE_LABEL,
  STRUCTOGRAM_ROW_HEIGHT,
  STRUCTOGRAM_TEXT_PADDING_X
} from "./constants";
import { buildIfLayout } from "./ifLayout";
import { buildLoopLayout } from "./loopLayout";
import { buildSwitchLayout } from "./switchLayout";
import { buildTryLayout } from "./tryLayout";

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
  headerHeight: number;
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
  selectorBandHeight: number;
  labelBandHeight: number;
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

export type LayoutNode =
  | StatementLayoutNode
  | SequenceLayoutNode
  | IfLayoutNode
  | LoopLayoutNode
  | SwitchLayoutNode
  | TryLayoutNode;

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

const estimatedInlineTextWidth = (value: string) =>
  value.length * STRUCTOGRAM_CHAR_WIDTH + STRUCTOGRAM_TEXT_PADDING_X * 2;

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
    return `${variableName} ${STRUCTOGRAM_ASSIGNMENT_SYMBOL} ${expression.trim()}`;
  }

  const plainAssignmentMatch = withoutSemicolon.match(
    /^([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\[[^\]]+\])*)\s*=\s*(.+)$/
  );
  if (plainAssignmentMatch) {
    const [, target, expression] = plainAssignmentMatch;
    return `${target} ${STRUCTOGRAM_ASSIGNMENT_SYMBOL} ${expression.trim()}`;
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

export const toMethodDeclaration = (method: UmlMethod): string => {
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
  const children = (nodes ?? [])
    .map((entry) => toLayoutNode(entry))
    .filter((item): item is LayoutNode => Boolean(item));
  if (children.length === 0) {
    return {
      kind: "sequence",
      children: [createStatement(STRUCTOGRAM_EMPTY_BODY_LABEL)],
      width: estimatedTextWidth(STRUCTOGRAM_EMPTY_BODY_LABEL),
      height: STRUCTOGRAM_ROW_HEIGHT
    };
  }
  const width = Math.max(...children.map((child) => child.width));
  const height = children.reduce((sum, child) => sum + child.height, 0);
  return { kind: "sequence", children, width, height };
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
    return [{ label: "default", body: createStatement(STRUCTOGRAM_EMPTY_BODY_LABEL) }];
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
    const elseBranch =
      hasElseBranch ? toSequence(node.elseBranch) : createStatement(STRUCTOGRAM_NO_ELSE_LABEL);
    return buildIfLayout({
      condition,
      thenBranch,
      elseBranch,
      estimatedInlineTextWidth
    });
  }

  if (node.kind === "loop") {
    const body = toSequence(node.children);
    const condition = normalizeLabel(node.condition, "condition");
    return buildLoopLayout({
      loopKind: node.loopKind,
      condition,
      body,
      estimatedTextWidth
    });
  }

  if (node.kind === "switch") {
    const expression = normalizeLabel(node.condition, "selector");
    const cases = toSwitchCases(node.switchCases);
    const branchHeight = Math.max(STRUCTOGRAM_ROW_HEIGHT, ...cases.map((entry) => entry.body.height));
    return buildSwitchLayout({
      expression,
      cases: cases.map((entry) => ({
        label: entry.label,
        body: entry.body,
        minWidth: entry.body.width
      })),
      branchHeight,
      estimatedTextWidth,
      estimatedInlineTextWidth
    });
  }

  if (node.kind === "try") {
    const body = toSequence(node.children);
    const catches = toCatchLayouts(node.catches);
    const finallyBranch =
      node.finallyBranch && node.finallyBranch.length > 0 ? toSequence(node.finallyBranch) : null;
    return buildTryLayout({
      body,
      catches,
      finallyBranch,
      estimatedTextWidth
    });
  }

  return createStatement(normalizeLabel(node.text, node.kind));
};

export const buildStructogramLayout = (
  controlTree: UmlStructogramNode | null | undefined
): LayoutNode | null => toLayoutNode(controlTree);
