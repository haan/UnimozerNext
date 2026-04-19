import { describe, it, expect } from "vitest";
import {
  hasCancellationText,
  shouldIgnoreUnhandledRejection,
  toCrashSnapshot,
} from "../crashLogging";

// ---------------------------------------------------------------------------
// hasCancellationText
// ---------------------------------------------------------------------------

describe("hasCancellationText", () => {
  it.each(["cancel", "canceled", "cancelled", "abort", "aborted"])(
    "returns true for word '%s'",
    (word) => {
      expect(hasCancellationText(word)).toBe(true);
    }
  );

  it("matches case-insensitively", () => {
    expect(hasCancellationText("Operation Cancelled by user")).toBe(true);
  });

  it("matches substring", () => {
    expect(hasCancellationText("request was aborted by the client")).toBe(true);
  });

  it("returns false for unrelated text", () => {
    expect(hasCancellationText("network error")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(hasCancellationText("")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// shouldIgnoreUnhandledRejection
// ---------------------------------------------------------------------------

describe("shouldIgnoreUnhandledRejection", () => {
  it("ignores DOMException with name AbortError", () => {
    const e = new DOMException("aborted", "AbortError");
    expect(shouldIgnoreUnhandledRejection(e)).toBe(true);
  });

  it("ignores DOMException with cancellation text in message", () => {
    const e = new DOMException("request was cancelled");
    expect(shouldIgnoreUnhandledRejection(e)).toBe(true);
  });

  it("does not ignore DOMException with unrelated name and message", () => {
    const e = new DOMException("bad data", "DataError");
    expect(shouldIgnoreUnhandledRejection(e)).toBe(false);
  });

  it("ignores Error with 'cancelled' in message", () => {
    expect(shouldIgnoreUnhandledRejection(new Error("operation cancelled"))).toBe(true);
  });

  it("ignores Error with cancellation word in name", () => {
    const e = new Error("something");
    Object.defineProperty(e, "name", { value: "AbortError" });
    expect(shouldIgnoreUnhandledRejection(e)).toBe(true);
  });

  it("does not ignore Error with neutral message", () => {
    expect(shouldIgnoreUnhandledRejection(new Error("disk full"))).toBe(false);
  });

  it("ignores string with cancellation word", () => {
    expect(shouldIgnoreUnhandledRejection("request canceled")).toBe(true);
  });

  it("does not ignore unrelated string", () => {
    expect(shouldIgnoreUnhandledRejection("timeout")).toBe(false);
  });

  it("ignores plain object with cancellation type field", () => {
    expect(shouldIgnoreUnhandledRejection({ type: "canceled" })).toBe(true);
  });

  it("ignores plain object with cancellation code field", () => {
    expect(shouldIgnoreUnhandledRejection({ code: "ABORT" })).toBe(true);
  });

  it("ignores plain object with cancellation msg field", () => {
    expect(shouldIgnoreUnhandledRejection({ msg: "operation aborted" })).toBe(true);
  });

  it("ignores plain object with cancellation message field", () => {
    expect(shouldIgnoreUnhandledRejection({ message: "user cancelled" })).toBe(true);
  });

  it("does not ignore plain object with unrelated fields", () => {
    expect(shouldIgnoreUnhandledRejection({ code: "TIMEOUT", message: "slow" })).toBe(false);
  });

  it("does not ignore null", () => {
    expect(shouldIgnoreUnhandledRejection(null)).toBe(false);
  });

  it("does not ignore a number", () => {
    expect(shouldIgnoreUnhandledRejection(42)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// toCrashSnapshot
// ---------------------------------------------------------------------------

describe("toCrashSnapshot", () => {
  it("returns Error message when present", () => {
    const snapshot = toCrashSnapshot(new Error("disk full"));
    expect(snapshot.message).toBe("disk full");
  });

  it("falls back to Error name when message is empty", () => {
    const e = new Error("");
    Object.defineProperty(e, "message", { value: "" });
    const snapshot = toCrashSnapshot(e);
    expect(snapshot.message).toBe("Error");
  });

  it("populates stackLines from error.stack", () => {
    const e = new Error("boom");
    const snapshot = toCrashSnapshot(e);
    expect(snapshot.stackLines.length).toBeGreaterThan(0);
    expect(snapshot.stackLines[0]).toMatch(/Error|boom|at /);
  });

  it("returns empty stackLines when stack is undefined", () => {
    const e = new Error("boom");
    Object.defineProperty(e, "stack", { value: undefined });
    const snapshot = toCrashSnapshot(e);
    expect(snapshot.stackLines).toEqual([]);
  });

  it("limits stackLines to 40", () => {
    const e = new Error("overflow");
    const manyLines = Array.from({ length: 60 }, (_, i) => `  at frame${i}`).join("\n");
    Object.defineProperty(e, "stack", { value: `Error: overflow\n${manyLines}` });
    const snapshot = toCrashSnapshot(e);
    expect(snapshot.stackLines.length).toBeLessThanOrEqual(40);
  });

  it("returns empty stackLines for string reason", () => {
    const snapshot = toCrashSnapshot("something went wrong");
    expect(snapshot.stackLines).toEqual([]);
  });

  it("uses string directly as message", () => {
    expect(toCrashSnapshot("bad stuff").message).toBe("bad stuff");
  });

  it("JSON-stringifies object reason as message", () => {
    const snapshot = toCrashSnapshot({ code: 42, error: "timeout" });
    expect(snapshot.message).toBe('{"code":42,"error":"timeout"}');
    expect(snapshot.stackLines).toEqual([]);
  });

  it("returns 'Unknown error' for null", () => {
    expect(toCrashSnapshot(null).message).toBe("null");
  });
});
