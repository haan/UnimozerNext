import { describe, it, expect } from "vitest";
import { formatMethodSignature } from "../methodSignature";
import type { UmlMethod } from "../../../models/uml";

function method(overrides: Partial<UmlMethod> = {}): UmlMethod {
  return {
    signature: "public void doWork(int count)",
    name: "doWork",
    returnType: "void",
    params: [{ name: "count", type: "int" }],
    fields: [],
    methods: [],
    ...overrides,
  } as unknown as UmlMethod;
}

// ---------------------------------------------------------------------------
// showParameterNames = false — always returns raw signature
// ---------------------------------------------------------------------------

describe("showParameterNames = false", () => {
  it("returns the raw signature unchanged", () => {
    const m = method({ signature: "public void doWork(int count)" });
    expect(formatMethodSignature(m, false)).toBe("public void doWork(int count)");
  });

  it("returns signature even when name and params are missing", () => {
    const m = method({ signature: "foo()", name: undefined, params: undefined });
    expect(formatMethodSignature(m, false)).toBe("foo()");
  });
});

// ---------------------------------------------------------------------------
// showParameterNames = true — reconstructed format
// ---------------------------------------------------------------------------

describe("showParameterNames = true", () => {
  it("formats method with named params and return type", () => {
    const m = method({
      name: "add",
      returnType: "int",
      params: [{ name: "a", type: "int" }, { name: "b", type: "int" }],
    });
    expect(formatMethodSignature(m, true)).toBe("add(a: int, b: int): int");
  });

  it("omits return type when it is void", () => {
    const m = method({
      name: "print",
      returnType: "void",
      params: [{ name: "msg", type: "String" }],
    });
    expect(formatMethodSignature(m, true)).toBe("print(msg: String): void");
  });

  it("formats method with no parameters", () => {
    const m = method({ name: "getCount", returnType: "int", params: [] });
    expect(formatMethodSignature(m, true)).toBe("getCount(): int");
  });

  it("falls back to signature name when method.name is missing", () => {
    // extractNameFromSignature takes everything before '(', including return type tokens
    const m = method({
      signature: "double calculate(double x)",
      name: undefined,
      returnType: "double",
      params: [{ name: "x", type: "double" }],
    });
    expect(formatMethodSignature(m, true)).toBe("double calculate(x: double): double");
  });

  it("returns raw signature when name cannot be extracted", () => {
    const m = method({ signature: "noparen", name: undefined, params: [] });
    expect(formatMethodSignature(m, true)).toBe("noparen");
  });

  it("falls back to signature return type when method.returnType is missing", () => {
    const m = method({
      signature: "getValue(): String",
      name: "getValue",
      returnType: undefined,
      params: [],
    });
    expect(formatMethodSignature(m, true)).toBe("getValue(): String");
  });

  it("uses arg index fallback when param name and type are both empty", () => {
    const m = method({
      name: "go",
      returnType: "void",
      params: [{ name: "", type: "" }],
    });
    expect(formatMethodSignature(m, true)).toBe("go(arg1): void");
  });

  it("shows only type when param name is missing", () => {
    const m = method({
      name: "go",
      returnType: "void",
      params: [{ name: "", type: "String" }],
    });
    expect(formatMethodSignature(m, true)).toBe("go(String): void");
  });

  it("shows only name when param type is missing", () => {
    const m = method({
      name: "go",
      returnType: "void",
      params: [{ name: "x", type: "" }],
    });
    expect(formatMethodSignature(m, true)).toBe("go(x): void");
  });

  it("handles multiple params correctly", () => {
    const m = method({
      name: "transfer",
      returnType: "boolean",
      params: [
        { name: "from", type: "Account" },
        { name: "to", type: "Account" },
        { name: "amount", type: "double" },
      ],
    });
    expect(formatMethodSignature(m, true)).toBe("transfer(from: Account, to: Account, amount: double): boolean");
  });

  it("handles null/undefined params array gracefully", () => {
    const m = method({ name: "noop", returnType: "void", params: undefined });
    expect(formatMethodSignature(m, true)).toBe("noop(): void");
  });
});
