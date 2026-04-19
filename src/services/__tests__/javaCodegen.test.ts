import { describe, it, expect } from "vitest";
import {
  escapeJavaString,
  escapeJavaChar,
  normalizeConstructorArg,
  resolveConstructorParamClass,
  buildClassSource,
} from "../javaCodegen";
import type { AddClassForm } from "../../components/wizards/AddClassDialog";

function form(overrides: Partial<AddClassForm> = {}): AddClassForm {
  return {
    name: "MyClass",
    isInterface: false,
    extendsName: "",
    packageName: "",
    isFinal: false,
    isAbstract: false,
    includeMain: false,
    includeJavadoc: false,
    ...overrides,
  };
}

describe("escapeJavaString", () => {
  it("escapes double quotes", () => {
    expect(escapeJavaString('say "hello"')).toBe('say \\"hello\\"');
  });
  it("escapes backslashes", () => {
    expect(escapeJavaString("C:\\path\\file")).toBe("C:\\\\path\\\\file");
  });
  it("returns unchanged string with no special chars", () => {
    expect(escapeJavaString("hello world")).toBe("hello world");
  });
  it("handles empty string", () => {
    expect(escapeJavaString("")).toBe("");
  });
});

describe("escapeJavaChar", () => {
  it("escapes single quotes", () => {
    expect(escapeJavaChar("it's")).toBe("it\\'s");
  });
  it("escapes backslashes", () => {
    expect(escapeJavaChar("C:\\path")).toBe("C:\\\\path");
  });
  it("returns unchanged string with no special chars", () => {
    expect(escapeJavaChar("A")).toBe("A");
  });
});

describe("normalizeConstructorArg", () => {
  it("wraps bare string in double quotes", () => {
    expect(normalizeConstructorArg("hello", "String")).toBe('"hello"');
  });
  it("leaves already-quoted string unchanged", () => {
    expect(normalizeConstructorArg('"already quoted"', "String")).toBe('"already quoted"');
  });
  it("escapes internal quotes in string", () => {
    expect(normalizeConstructorArg('say "hi"', "String")).toBe('"say \\"hi\\""');
  });
  it("wraps bare char in single quotes", () => {
    expect(normalizeConstructorArg("A", "char")).toBe("'A'");
  });
  it("leaves already-quoted char unchanged", () => {
    expect(normalizeConstructorArg("'A'", "char")).toBe("'A'");
  });
  it("passes through primitive int value unchanged", () => {
    expect(normalizeConstructorArg("42", "int")).toBe("42");
  });
  it("passes through boolean value unchanged", () => {
    expect(normalizeConstructorArg("true", "boolean")).toBe("true");
  });
  it("returns empty string for empty input", () => {
    expect(normalizeConstructorArg("  ", "String")).toBe("");
  });
});

describe("resolveConstructorParamClass", () => {
  it("resolves int", () => {
    expect(resolveConstructorParamClass("int")).toBe("int.class");
  });
  it("resolves String to fully-qualified name", () => {
    expect(resolveConstructorParamClass("String")).toBe("java.lang.String.class");
  });
  it("resolves char", () => {
    expect(resolveConstructorParamClass("char")).toBe("char.class");
  });
  it("resolves unknown type via Class.forName", () => {
    expect(resolveConstructorParamClass("MyClass")).toBe('Class.forName("MyClass")');
  });
  it("strips spaces before resolving", () => {
    expect(resolveConstructorParamClass("int ")).toBe("int.class");
  });
});

describe("buildClassSource", () => {
  it("generates a simple public class", () => {
    const src = buildClassSource(form());
    expect(src).toContain("public class MyClass");
    expect(src).not.toContain("package");
    expect(src).not.toContain("abstract");
  });

  it("generates a class with a package declaration", () => {
    const src = buildClassSource(form({ packageName: "com.example" }));
    expect(src).toMatch(/^package com\.example;/);
    expect(src).toContain("public class MyClass");
  });

  it("generates an interface", () => {
    const src = buildClassSource(form({ isInterface: true }));
    expect(src).toContain("public interface MyClass");
    expect(src).not.toContain("class MyClass");
  });

  it("generates an abstract class", () => {
    const src = buildClassSource(form({ isAbstract: true }));
    expect(src).toContain("public abstract class MyClass");
  });

  it("generates a final class", () => {
    const src = buildClassSource(form({ isFinal: true }));
    expect(src).toContain("public final class MyClass");
  });

  it("generates a class with extends", () => {
    const src = buildClassSource(form({ extendsName: "Vehicle" }));
    expect(src).toContain("extends Vehicle");
  });

  it("generates a class with main method", () => {
    const src = buildClassSource(form({ includeMain: true }));
    expect(src).toContain("public static void main(String[] args)");
  });

  it("does not add main method to interface", () => {
    const src = buildClassSource(form({ isInterface: true, includeMain: true }));
    expect(src).not.toContain("main");
  });

  it("strips .java extension from name", () => {
    const src = buildClassSource(form({ name: "MyClass.java" }));
    expect(src).toContain("public class MyClass");
    expect(src).not.toContain("MyClass.java");
  });

  it("includes javadoc block when requested", () => {
    const src = buildClassSource(form({ includeJavadoc: true }));
    expect(src).toContain("/**");
    expect(src).toContain("*/");
  });
});
