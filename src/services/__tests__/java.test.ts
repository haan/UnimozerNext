import { describe, it, expect } from "vitest";
import { isValidJavaIdentifier, JAVA_KEYWORDS } from "../java";

describe("isValidJavaIdentifier", () => {
  it("accepts typical class names", () => {
    expect(isValidJavaIdentifier("MyClass")).toBe(true);
    expect(isValidJavaIdentifier("Vehicle")).toBe(true);
    expect(isValidJavaIdentifier("AbstractFactory")).toBe(true);
  });
  it("accepts identifiers starting with underscore or dollar", () => {
    expect(isValidJavaIdentifier("_count")).toBe(true);
    expect(isValidJavaIdentifier("$value")).toBe(true);
  });
  it("accepts identifiers with digits after first char", () => {
    expect(isValidJavaIdentifier("camelCase123")).toBe(true);
    expect(isValidJavaIdentifier("x1")).toBe(true);
  });
  it("rejects Java keywords", () => {
    expect(isValidJavaIdentifier("class")).toBe(false);
    expect(isValidJavaIdentifier("int")).toBe(false);
    expect(isValidJavaIdentifier("true")).toBe(false);
    expect(isValidJavaIdentifier("false")).toBe(false);
    expect(isValidJavaIdentifier("null")).toBe(false);
    expect(isValidJavaIdentifier("void")).toBe(false);
  });
  it("rejects identifiers starting with a digit", () => {
    expect(isValidJavaIdentifier("1invalid")).toBe(false);
    expect(isValidJavaIdentifier("123abc")).toBe(false);
  });
  it("rejects empty string", () => {
    expect(isValidJavaIdentifier("")).toBe(false);
  });
  it("rejects strings with spaces", () => {
    expect(isValidJavaIdentifier("my class")).toBe(false);
  });
  it("rejects strings with hyphens", () => {
    expect(isValidJavaIdentifier("my-class")).toBe(false);
  });
});

describe("JAVA_KEYWORDS", () => {
  it("is a Set", () => {
    expect(JAVA_KEYWORDS).toBeInstanceOf(Set);
  });
  it("contains the expected core keywords", () => {
    expect(JAVA_KEYWORDS.has("class")).toBe(true);
    expect(JAVA_KEYWORDS.has("interface")).toBe(true);
    expect(JAVA_KEYWORDS.has("extends")).toBe(true);
    expect(JAVA_KEYWORDS.has("implements")).toBe(true);
    expect(JAVA_KEYWORDS.has("return")).toBe(true);
    expect(JAVA_KEYWORDS.has("static")).toBe(true);
  });
  it("has at least 40 entries", () => {
    expect(JAVA_KEYWORDS.size).toBeGreaterThanOrEqual(40);
  });
});
