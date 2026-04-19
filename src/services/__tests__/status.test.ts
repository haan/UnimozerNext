import { describe, it, expect } from "vitest";
import { formatStatusText, trimStatusText } from "../status";

describe("formatStatusText", () => {
  it("returns a plain string unchanged", () => {
    expect(formatStatusText("something went wrong")).toBe("something went wrong");
  });

  it("returns empty string as-is", () => {
    expect(formatStatusText("")).toBe("");
  });

  it("returns Error.message", () => {
    expect(formatStatusText(new Error("disk full"))).toBe("disk full");
  });

  it("returns Error.name when message is empty", () => {
    const e = new Error("");
    Object.defineProperty(e, "message", { value: "" });
    expect(formatStatusText(e)).toBe("Error");
  });

  it("returns object.message string field", () => {
    expect(formatStatusText({ message: "ipc error" })).toBe("ipc error");
  });

  it("returns object.error string field when no message", () => {
    expect(formatStatusText({ error: "permission denied" })).toBe("permission denied");
  });

  it("prefers message over error when both present", () => {
    expect(formatStatusText({ message: "primary", error: "secondary" })).toBe("primary");
  });

  it("returns 'Unknown error' for null", () => {
    expect(formatStatusText(null)).toBe("Unknown error");
  });

  it("returns 'Unknown error' for undefined", () => {
    expect(formatStatusText(undefined)).toBe("Unknown error");
  });

  it("returns 'Unknown error' for empty object", () => {
    expect(formatStatusText({})).toBe("Unknown error");
  });

  it("serializes an object with known fields to JSON", () => {
    const result = formatStatusText({ code: 42, reason: "timeout" });
    expect(result).toBe('{"code":42,"reason":"timeout"}');
  });

  it("serializes a number via JSON", () => {
    expect(formatStatusText(42)).toBe("42");
  });

  it("serializes a boolean via JSON", () => {
    expect(formatStatusText(false)).toBe("false");
  });
});

describe("trimStatusText", () => {
  it("returns short strings unchanged", () => {
    expect(trimStatusText("ok")).toBe("ok");
  });

  it("truncates strings longer than the default max (200)", () => {
    const long = "x".repeat(250);
    const result = trimStatusText(long);
    expect(result).toHaveLength(203); // 200 + "..."
    expect(result.endsWith("...")).toBe(true);
  });

  it("returns exactly max-length string unchanged", () => {
    const exact = "a".repeat(200);
    expect(trimStatusText(exact)).toBe(exact);
  });

  it("truncates at a custom max", () => {
    const result = trimStatusText("hello world", 5);
    expect(result).toBe("hello...");
  });

  it("empty string is returned unchanged", () => {
    expect(trimStatusText("")).toBe("");
  });
});
