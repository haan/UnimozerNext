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
  STRUCTOGRAM_EMPTY_ELSE_LABEL,
  STRUCTOGRAM_MIN_CONTENT_WIDTH,
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

type TextWidthEstimator = (value: string) => number;

type LayoutEstimators = {
  estimatedTextWidth: (value: string) => number;
  estimatedInlineTextWidth: (value: string) => number;
  createStatement: (text: string) => StatementLayoutNode;
};

type BuildStructogramLayoutOptions = {
  estimateTextWidth?: TextWidthEstimator;
};

const normalizeLabel = (value: string | null | undefined, fallback: string) => {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();
  return normalized && normalized.length > 0 ? normalized : fallback;
};

const normalizeStatementText = (value: string | null | undefined): string | null => {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();
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
  const resolvedReturnType = method.returnType?.trim() ?? "";
  const returnType = resolvedReturnType.length > 0 ? resolvedReturnType : "";
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

const toSequence = (
  nodes: UmlStructogramNode[] | undefined,
  estimators: LayoutEstimators,
  emptyLabel: string = STRUCTOGRAM_EMPTY_BODY_LABEL
): SequenceLayoutNode => {
  const children = (nodes ?? [])
    .map((entry) => toLayoutNode(entry, estimators))
    .filter((item): item is LayoutNode => Boolean(item));
  if (children.length === 0) {
    const emptyStatement = estimators.createStatement(emptyLabel);
    return {
      kind: "sequence",
      children: [emptyStatement],
      width: emptyStatement.width,
      height: emptyStatement.height
    };
  }
  const width = Math.max(...children.map((child) => child.width));
  const height = children.reduce((sum, child) => sum + child.height, 0);
  return { kind: "sequence", children, width, height };
};

const stripTrailingSwitchBreak = (
  nodes: UmlStructogramNode[] | undefined
): UmlStructogramNode[] | undefined => {
  if (!nodes || nodes.length === 0) {
    return nodes;
  }
  let endIndex = nodes.length;
  while (endIndex > 0) {
    const lastNode = nodes[endIndex - 1];
    const normalizedText =
      lastNode.kind === "statement" ? normalizeStatementText(lastNode.text) : null;
    if (normalizedText !== "break") {
      break;
    }
    endIndex -= 1;
  }
  return endIndex === nodes.length ? nodes : nodes.slice(0, endIndex);
};

const hasRenderableNode = (node: UmlStructogramNode | null | undefined): boolean => {
  if (!node) {
    return false;
  }
  if (node.kind === "statement") {
    return normalizeStatementText(node.text) !== null;
  }
  if (node.kind === "sequence") {
    return (node.children ?? []).some((entry) => hasRenderableNode(entry));
  }
  return true;
};

const hasRenderableSwitchBody = (nodes: UmlStructogramNode[] | undefined): boolean =>
  (nodes ?? []).some((entry) => hasRenderableNode(entry));

const lastRenderableNode = (
  nodes: UmlStructogramNode[] | undefined
): UmlStructogramNode | null => {
  const entries = nodes ?? [];
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const candidate = entries[index];
    if (hasRenderableNode(candidate)) {
      return candidate;
    }
  }
  return null;
};

const isTerminatingStatement = (text: string | null | undefined): boolean => {
  const normalized = normalizeStatementText(text);
  if (!normalized) {
    return false;
  }
  const keyword = normalized.split(/\s+/, 1)[0]?.toLowerCase();
  return (
    keyword === "break" ||
    keyword === "return" ||
    keyword === "throw" ||
    keyword === "continue" ||
    keyword === "yield"
  );
};

const sequenceDefinitelyTerminates = (nodes: UmlStructogramNode[] | undefined): boolean => {
  const lastNode = lastRenderableNode(nodes);
  if (!lastNode) {
    return false;
  }
  return nodeDefinitelyTerminates(lastNode);
};

const nodeDefinitelyTerminates = (node: UmlStructogramNode | null | undefined): boolean => {
  if (!node) {
    return false;
  }
  switch (node.kind) {
    case "statement":
      return isTerminatingStatement(node.text);
    case "sequence":
      return sequenceDefinitelyTerminates(node.children);
    case "if": {
      const thenTerminates = sequenceDefinitelyTerminates(node.thenBranch);
      const elseTerminates = sequenceDefinitelyTerminates(node.elseBranch);
      return thenTerminates && elseTerminates;
    }
    case "try": {
      if (sequenceDefinitelyTerminates(node.finallyBranch)) {
        return true;
      }
      if (!sequenceDefinitelyTerminates(node.children)) {
        return false;
      }
      if (!node.catches || node.catches.length === 0) {
        return true;
      }
      return node.catches.every((entry) => sequenceDefinitelyTerminates(entry.body));
    }
    case "loop":
    case "switch":
    default:
      return false;
  }
};

const caseHasExplicitTerminator = (nodes: UmlStructogramNode[] | undefined): boolean => {
  return sequenceDefinitelyTerminates(nodes);
};

const toSwitchCases = (
  cases: UmlStructogramSwitchCase[] | undefined,
  estimators: LayoutEstimators
): Array<{ label: string; body: LayoutNode }> => {
  type MergedCaseGroup = {
    labels: string[];
    ownBodyNodes: UmlStructogramNode[] | undefined;
    terminates: boolean;
  };

  const groups: MergedCaseGroup[] = [];
  let pendingLabels: string[] = [];

  for (const entry of cases ?? []) {
    const label = normalizeLabel(entry.label, "default");
    const ownBodyNodes = stripTrailingSwitchBreak(entry.body);
    const hasBody = hasRenderableSwitchBody(ownBodyNodes);
    const terminates = caseHasExplicitTerminator(entry.body);

    if (!hasBody) {
      if (terminates) {
        groups.push({
          labels: [...pendingLabels, label],
          ownBodyNodes,
          terminates: true
        });
        pendingLabels = [];
      } else {
        pendingLabels.push(label);
      }
      continue;
    }

    groups.push({
      labels: [...pendingLabels, label],
      ownBodyNodes,
      terminates
    });
    pendingLabels = [];
  }

  if (pendingLabels.length > 0) {
    groups.push({
      labels: pendingLabels,
      ownBodyNodes: undefined,
      terminates: false
    });
  }

  if (groups.length === 0) {
    return [{ label: "default", body: estimators.createStatement(STRUCTOGRAM_EMPTY_BODY_LABEL) }];
  }

  const propagatedBodies: Array<UmlStructogramNode[] | undefined> = new Array(groups.length);
  for (let index = groups.length - 1; index >= 0; index -= 1) {
    const currentNodes = groups[index].ownBodyNodes ?? [];
    const nextNodes =
      !groups[index].terminates && index + 1 < groups.length
        ? propagatedBodies[index + 1] ?? []
        : [];
    propagatedBodies[index] = [...currentNodes, ...nextNodes];
  }

  return groups.map((group, index) => {
    const nodes = propagatedBodies[index];
    return {
      label: group.labels.join(", "),
      body: hasRenderableSwitchBody(nodes)
        ? toSequence(nodes, estimators)
        : estimators.createStatement(STRUCTOGRAM_EMPTY_BODY_LABEL)
    };
  });
};

const toCatchLayouts = (
  catches: UmlStructogramCatchClause[] | undefined,
  estimators: LayoutEstimators
): Array<{ exception: string; body: LayoutNode }> =>
  catches?.map((item) => ({
    exception: normalizeLabel(item.exception, "catch"),
    body: toSequence(item.body, estimators)
  })) ?? [];

const toLayoutNode = (
  node: UmlStructogramNode | null | undefined,
  estimators: LayoutEstimators
): LayoutNode | null => {
  if (!node) {
    return null;
  }

  if (node.kind === "statement") {
    const statementText = normalizeStatementText(node.text);
    return statementText ? estimators.createStatement(statementText) : null;
  }

  if (node.kind === "sequence") {
    return toSequence(node.children, estimators);
  }

  if (node.kind === "if") {
    const condition = normalizeLabel(node.condition, "condition");
    const thenBranch = toSequence(node.thenBranch, estimators, STRUCTOGRAM_EMPTY_ELSE_LABEL);
    const hasElseBranch = (node.elseBranch ?? []).length > 0;
    const elseBranch =
      hasElseBranch
        ? toSequence(node.elseBranch, estimators, STRUCTOGRAM_EMPTY_ELSE_LABEL)
        : estimators.createStatement(STRUCTOGRAM_EMPTY_ELSE_LABEL);
    return buildIfLayout({
      condition,
      thenBranch,
      elseBranch,
      estimatedInlineTextWidth: estimators.estimatedInlineTextWidth
    });
  }

  if (node.kind === "loop") {
    const body = toSequence(node.children, estimators);
    const condition = normalizeLabel(node.condition, "condition");
    return buildLoopLayout({
      loopKind: node.loopKind,
      condition,
      body,
      estimatedTextWidth: estimators.estimatedTextWidth
    });
  }

  if (node.kind === "switch") {
    const expression = normalizeLabel(node.condition, "selector");
    const cases = toSwitchCases(node.switchCases, estimators);
    const branchHeight = Math.max(STRUCTOGRAM_ROW_HEIGHT, ...cases.map((entry) => entry.body.height));
    return buildSwitchLayout({
      expression,
      cases: cases.map((entry) => ({
        label: entry.label,
        body: entry.body,
        minWidth: entry.body.width
      })),
      branchHeight,
      estimatedTextWidth: estimators.estimatedTextWidth,
      estimatedInlineTextWidth: estimators.estimatedInlineTextWidth
    });
  }

  if (node.kind === "try") {
    const body = toSequence(node.children, estimators);
    const catches = toCatchLayouts(node.catches, estimators);
    const finallyBranch =
      node.finallyBranch && node.finallyBranch.length > 0
        ? toSequence(node.finallyBranch, estimators)
        : null;
    return buildTryLayout({
      body,
      catches,
      finallyBranch,
      estimatedTextWidth: estimators.estimatedTextWidth
    });
  }

  return estimators.createStatement(normalizeLabel(node.text, node.kind));
};

export const buildStructogramLayout = (
  controlTree: UmlStructogramNode | null | undefined,
  options: BuildStructogramLayoutOptions = {}
): LayoutNode | null => {
  const estimateRawTextWidth: TextWidthEstimator =
    options.estimateTextWidth ?? ((value: string) => value.length * STRUCTOGRAM_CHAR_WIDTH);
  const estimatedInlineTextWidth = (value: string) =>
    Math.ceil(estimateRawTextWidth(value) + STRUCTOGRAM_TEXT_PADDING_X * 2);
  const estimatedTextWidth = (value: string) =>
    Math.max(STRUCTOGRAM_MIN_CONTENT_WIDTH, estimatedInlineTextWidth(value));
  const createStatement = (text: string): StatementLayoutNode => ({
    kind: "statement",
    text,
    width: estimatedTextWidth(text),
    height: STRUCTOGRAM_ROW_HEIGHT
  });

  return toLayoutNode(controlTree, {
    estimatedTextWidth,
    estimatedInlineTextWidth,
    createStatement
  });
};
