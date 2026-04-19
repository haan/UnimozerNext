import { describe, it, expect } from "vitest";
import { buildStructogramLayout } from "../layoutBuilder";
import type { LayoutNode } from "../layoutBuilder";
import type { UmlStructogramNode } from "../../../models/uml";
import {
  STRUCTOGRAM_ASSIGNMENT_SYMBOL,
  STRUCTOGRAM_EMPTY_BODY_LABEL,
  STRUCTOGRAM_EMPTY_ELSE_LABEL,
  STRUCTOGRAM_ROW_HEIGHT,
} from "../constants";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stmt(text: string): UmlStructogramNode {
  return { kind: "statement", text };
}

function seq(children: UmlStructogramNode[]): UmlStructogramNode {
  return { kind: "sequence", children };
}

function ifNode(
  condition: string,
  thenBranch: UmlStructogramNode[],
  elseBranch?: UmlStructogramNode[]
): UmlStructogramNode {
  return { kind: "if", condition, thenBranch, elseBranch };
}

function whileLoop(condition: string, children: UmlStructogramNode[]): UmlStructogramNode {
  return { kind: "loop", loopKind: "while", condition, children };
}

function forLoop(condition: string, children: UmlStructogramNode[]): UmlStructogramNode {
  return { kind: "loop", loopKind: "for", condition, children };
}

function doWhile(condition: string, children: UmlStructogramNode[]): UmlStructogramNode {
  return { kind: "loop", loopKind: "doWhile", condition, children };
}

function switchNode(
  condition: string,
  cases: { label: string; body: UmlStructogramNode[] }[]
): UmlStructogramNode {
  return {
    kind: "switch",
    condition,
    switchCases: cases.map((c) => ({ label: c.label, body: c.body })),
  };
}

function tryNode(
  children: UmlStructogramNode[],
  catches: { exception: string; body: UmlStructogramNode[] }[],
  finallyBranch?: UmlStructogramNode[]
): UmlStructogramNode {
  return {
    kind: "try",
    children,
    catches: catches.map((c) => ({ exception: c.exception, body: c.body })),
    finallyBranch,
  };
}

function layout(node: UmlStructogramNode): LayoutNode {
  const result = buildStructogramLayout(node);
  if (!result) throw new Error("buildStructogramLayout returned null unexpectedly");
  return result;
}

// ---------------------------------------------------------------------------
// Null / undefined
// ---------------------------------------------------------------------------

describe("buildStructogramLayout — null input", () => {
  it("returns null for null input", () => {
    expect(buildStructogramLayout(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(buildStructogramLayout(undefined)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Statement
// ---------------------------------------------------------------------------

describe("statement nodes", () => {
  it("produces a statement layout with correct text", () => {
    const result = layout(stmt("return count"));
    expect(result.kind).toBe("statement");
    if (result.kind !== "statement") return;
    expect(result.text).toBe("return count");
  });

  it("height equals ROW_HEIGHT", () => {
    const result = layout(stmt("return count"));
    expect(result.height).toBe(STRUCTOGRAM_ROW_HEIGHT);
  });

  it("strips trailing semicolons", () => {
    const result = layout(stmt("return count;"));
    expect(result.kind).toBe("statement");
    if (result.kind !== "statement") return;
    expect(result.text).toBe("return count");
  });

  it("converts declaration assignment to arrow notation", () => {
    const result = layout(stmt("int count = 0;"));
    expect(result.kind).toBe("statement");
    if (result.kind !== "statement") return;
    expect(result.text).toBe(`count ${STRUCTOGRAM_ASSIGNMENT_SYMBOL} 0`);
  });

  it("converts plain assignment to arrow notation", () => {
    const result = layout(stmt("count = count + 1;"));
    expect(result.kind).toBe("statement");
    if (result.kind !== "statement") return;
    expect(result.text).toBe(`count ${STRUCTOGRAM_ASSIGNMENT_SYMBOL} count + 1`);
  });

  it("returns null for a blank statement", () => {
    // A blank statement inside a sequence is skipped, not rendered
    const result = buildStructogramLayout(seq([stmt(""), stmt("return 0")]));
    expect(result).not.toBeNull();
    if (!result || result.kind !== "sequence") return;
    // Only "return 0" survives — blank is filtered
    expect(result.children.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Sequence
// ---------------------------------------------------------------------------

describe("sequence nodes", () => {
  it("produces a sequence layout", () => {
    const result = layout(seq([stmt("int x = 1"), stmt("return x")]));
    expect(result.kind).toBe("sequence");
  });

  it("height equals sum of children heights", () => {
    const result = layout(seq([stmt("a"), stmt("b"), stmt("c")]));
    expect(result.height).toBe(STRUCTOGRAM_ROW_HEIGHT * 3);
  });

  it("empty sequence produces a placeholder child", () => {
    const result = layout(seq([]));
    expect(result.kind).toBe("sequence");
    if (result.kind !== "sequence") return;
    expect(result.children.length).toBe(1);
    const child = result.children[0];
    expect(child.kind).toBe("statement");
    if (child.kind !== "statement") return;
    expect(child.text).toBe(STRUCTOGRAM_EMPTY_BODY_LABEL);
  });
});

// ---------------------------------------------------------------------------
// If / else
// ---------------------------------------------------------------------------

describe("if nodes", () => {
  it("produces an if layout with condition", () => {
    const result = layout(ifNode("score >= 90", [stmt("return 'A'")]));
    expect(result.kind).toBe("if");
    if (result.kind !== "if") return;
    expect(result.condition).toBe("score >= 90");
  });

  it("thenBranch and elseBranch have equal branchHeight", () => {
    const result = layout(
      ifNode("x > 0", [stmt("positive")], [stmt("non-positive")])
    );
    expect(result.kind).toBe("if");
    if (result.kind !== "if") return;
    expect(result.thenBranch.height).toBe(result.elseBranch.height);
    expect(result.branchHeight).toBe(result.thenBranch.height);
  });

  it("if without else branch gets a ∅ placeholder", () => {
    const result = layout(ifNode("condition", [stmt("do something")]));
    expect(result.kind).toBe("if");
    if (result.kind !== "if") return;
    expect(result.elseBranch.kind).toBe("statement");
    if (result.elseBranch.kind !== "statement") return;
    expect(result.elseBranch.text).toBe(STRUCTOGRAM_EMPTY_ELSE_LABEL);
  });

  it("total height is greater than branchHeight (includes header)", () => {
    const result = layout(ifNode("x > 0", [stmt("yes")], [stmt("no")]));
    expect(result.kind).toBe("if");
    if (result.kind !== "if") return;
    expect(result.height).toBeGreaterThan(result.branchHeight);
  });

  it("nested if: inner if is inside thenBranch", () => {
    const inner = ifNode("b > 0", [stmt("inner then")], [stmt("inner else")]);
    const outer = ifNode("a > 0", [inner], [stmt("outer else")]);
    const result = layout(outer);
    expect(result.kind).toBe("if");
    if (result.kind !== "if") return;
    // thenBranch is a sequence wrapping the inner if
    const then = result.thenBranch;
    expect(then.kind).toBe("sequence");
    if (then.kind !== "sequence") return;
    expect(then.children[0].kind).toBe("if");
  });
});

// ---------------------------------------------------------------------------
// Loops
// ---------------------------------------------------------------------------

describe("loop nodes", () => {
  it("while loop produces a loop layout with no footer", () => {
    const result = layout(whileLoop("i < 10", [stmt("i = i + 1")]));
    expect(result.kind).toBe("loop");
    if (result.kind !== "loop") return;
    expect(result.footer).toBeNull();
    expect(result.header).toContain("i < 10");
  });

  it("for loop produces a loop layout with no footer", () => {
    const result = layout(forLoop("int i = 0; i < n; i++", [stmt("sum = sum + i")]));
    expect(result.kind).toBe("loop");
    if (result.kind !== "loop") return;
    expect(result.footer).toBeNull();
  });

  it("do-while loop produces a loop layout with a footer", () => {
    const result = layout(doWhile("count > 0", [stmt("count = count - 1")]));
    expect(result.kind).toBe("loop");
    if (result.kind !== "loop") return;
    expect(result.footer).not.toBeNull();
    expect(result.footer).toContain("count > 0");
  });

  it("loop height is greater than body height (includes header)", () => {
    const result = layout(whileLoop("x > 0", [stmt("x = x - 1")]));
    expect(result.kind).toBe("loop");
    if (result.kind !== "loop") return;
    expect(result.height).toBeGreaterThan(result.body.height);
  });

  it("nested loop: for containing while", () => {
    const inner = whileLoop("j < i", [stmt("sum = sum + j")]);
    const outer = forLoop("int i = 0; i < limit; i++", [inner]);
    const result = layout(outer);
    expect(result.kind).toBe("loop");
    if (result.kind !== "loop") return;
    const body = result.body;
    expect(body.kind).toBe("sequence");
    if (body.kind !== "sequence") return;
    expect(body.children[0].kind).toBe("loop");
  });
});

// ---------------------------------------------------------------------------
// Switch
// ---------------------------------------------------------------------------

describe("switch nodes", () => {
  it("produces a switch layout with the right expression", () => {
    const result = layout(
      switchNode("month", [
        { label: "1", body: [stmt("return 'Jan'")] },
        { label: "2", body: [stmt("return 'Feb'")] },
      ])
    );
    expect(result.kind).toBe("switch");
    if (result.kind !== "switch") return;
    expect(result.expression).toBe("month");
    expect(result.cases.length).toBe(2);
  });

  it("merges fallthrough cases into a single entry", () => {
    // case 1, case 2 both fall through to case 3 which has a body
    const result = layout(
      switchNode("season", [
        { label: "12", body: [] },
        { label: "1",  body: [] },
        { label: "2",  body: [stmt("return 'Winter'")] },
        { label: "3",  body: [stmt("return 'Spring'")] },
      ])
    );
    expect(result.kind).toBe("switch");
    if (result.kind !== "switch") return;
    // 12, 1, 2 merge into one case; 3 is separate
    expect(result.cases.length).toBe(2);
    expect(result.cases[0].label).toContain("12");
    expect(result.cases[0].label).toContain("1");
    expect(result.cases[0].label).toContain("2");
  });

  it("branchHeight equals the tallest case body", () => {
    // Cases with explicit return so no fallthrough propagation occurs
    const result = layout(
      switchNode("x", [
        { label: "1", body: [stmt("a"), stmt("return a")] },
        { label: "2", body: [stmt("return c")] },
      ])
    );
    expect(result.kind).toBe("switch");
    if (result.kind !== "switch") return;
    // Case "1" has 2 statements (60px); case "2" has 1 (30px) — branchHeight = 60
    expect(result.branchHeight).toBe(STRUCTOGRAM_ROW_HEIGHT * 2);
  });

  it("empty switch produces a default placeholder case", () => {
    const result = layout(switchNode("x", []));
    expect(result.kind).toBe("switch");
    if (result.kind !== "switch") return;
    expect(result.cases.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Try / catch / finally
// ---------------------------------------------------------------------------

describe("try nodes", () => {
  it("produces a try layout with body and catches", () => {
    const result = layout(
      tryNode(
        [stmt("int n = Integer.parseInt(raw)")],
        [{ exception: "NumberFormatException", body: [stmt("return -1")] }],
        [stmt("cleanup()")]
      )
    );
    expect(result.kind).toBe("try");
    if (result.kind !== "try") return;
    expect(result.catches.length).toBe(1);
    expect(result.catches[0].exception).toBe("NumberFormatException");
    expect(result.finallyBranch).not.toBeNull();
  });

  it("try without finally has null finallyBranch", () => {
    const result = layout(
      tryNode(
        [stmt("risky()")],
        [{ exception: "Exception", body: [stmt("handle()")] }]
      )
    );
    expect(result.kind).toBe("try");
    if (result.kind !== "try") return;
    expect(result.finallyBranch).toBeNull();
  });

  it("multiple catches produce separate entries", () => {
    const result = layout(
      tryNode(
        [stmt("Object o = (Integer) obj")],
        [
          { exception: "ClassCastException",  body: [stmt("return -1")] },
          { exception: "NullPointerException", body: [stmt("return -2")] },
        ]
      )
    );
    expect(result.kind).toBe("try");
    if (result.kind !== "try") return;
    expect(result.catches.length).toBe(2);
    expect(result.catches[0].exception).toBe("ClassCastException");
    expect(result.catches[1].exception).toBe("NullPointerException");
  });

  it("try height is positive", () => {
    const result = layout(
      tryNode([stmt("risky()")], [{ exception: "Exception", body: [stmt("handle()")] }])
    );
    expect(result.height).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Complex / composite structures (stress-project patterns)
// ---------------------------------------------------------------------------

describe("complex structures from stress project", () => {
  it("nestedIfElse: 4-level chain has correct depth", () => {
    // nestedIfElse(int score): score>=90 → A, >=80 → B, >=70 → C, else F
    const tree = ifNode("score >= 90",
      [stmt("return 'A'")],
      [ifNode("score >= 80",
        [stmt("return 'B'")],
        [ifNode("score >= 70",
          [stmt("return 'C'")],
          [stmt("return 'F'")]
        )]
      )]
    );
    const result = layout(tree);
    expect(result.kind).toBe("if");
    if (result.kind !== "if") return;
    // else branch is a sequence containing another if
    const elseSeq = result.elseBranch;
    expect(elseSeq.kind).toBe("sequence");
    if (elseSeq.kind !== "sequence") return;
    expect(elseSeq.children[0].kind).toBe("if");
  });

  it("tryCatchFinally: body, catch, and finally all present", () => {
    const tree = tryNode(
      [stmt("int n = Integer.parseInt(raw)")],
      [{ exception: "NumberFormatException e", body: [stmt("return -1")] }],
      [stmt("// cleanup")]
    );
    const result = layout(tree);
    expect(result.kind).toBe("try");
    if (result.kind !== "try") return;
    expect(result.catches.length).toBe(1);
    expect(result.finallyBranch).not.toBeNull();
  });

  it("forAndWhile: outer for contains inner while", () => {
    const tree = seq([
      stmt("int sum = 0"),
      forLoop("int i = 0; i < limit; i++", [
        stmt("int j = 0"),
        whileLoop("j < i", [stmt("j = j + 1")]),
      ]),
      stmt("return sum"),
    ]);
    const result = layout(tree);
    expect(result.kind).toBe("sequence");
    if (result.kind !== "sequence") return;
    const forNode = result.children[1];
    expect(forNode.kind).toBe("loop");
    if (forNode.kind !== "loop") return;
    const forBody = forNode.body;
    expect(forBody.kind).toBe("sequence");
    if (forBody.kind !== "sequence") return;
    expect(forBody.children[1].kind).toBe("loop");
  });

  it("switchWithFallthrough: 12 month cases collapse to 4 season groups", () => {
    // switchWithFallthrough from StructogramCases: months map to 4 seasons
    const tree = switchNode("month", [
      { label: "12", body: [] },
      { label: "1",  body: [] },
      { label: "2",  body: [stmt("return 'Winter'")] },
      { label: "3",  body: [] },
      { label: "4",  body: [] },
      { label: "5",  body: [stmt("return 'Spring'")] },
      { label: "6",  body: [] },
      { label: "7",  body: [] },
      { label: "8",  body: [stmt("return 'Summer'")] },
      { label: "9",  body: [] },
      { label: "10", body: [] },
      { label: "11", body: [stmt("return 'Autumn'")] },
    ]);
    const result = layout(tree);
    expect(result.kind).toBe("switch");
    if (result.kind !== "switch") return;
    expect(result.cases.length).toBe(4);
  });

  it("tryInsideWhile: while body contains try node", () => {
    const tree = whileLoop("i < items.length", [
      tryNode(
        [stmt("process(items[i])")],
        [{ exception: "Exception e", body: [stmt("errors = errors + 1")] }],
        [stmt("i = i + 1")]
      ),
    ]);
    const result = layout(tree);
    expect(result.kind).toBe("loop");
    if (result.kind !== "loop") return;
    const body = result.body;
    expect(body.kind).toBe("sequence");
    if (body.kind !== "sequence") return;
    expect(body.children[0].kind).toBe("try");
  });
});
