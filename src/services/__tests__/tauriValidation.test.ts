import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  parseSchemaOrNull,
  parseSchemaOrThrow,
  stringArraySchema,
  stringSchema,
  voidResponseSchema,
} from "../tauriValidation";

const personSchema = z.object({ name: z.string(), age: z.number() });

describe("parseSchemaOrNull", () => {
  it("returns parsed value on valid input", () => {
    expect(parseSchemaOrNull(personSchema, { name: "Alice", age: 30 })).toEqual({
      name: "Alice",
      age: 30,
    });
  });
  it("returns null when type is wrong", () => {
    expect(parseSchemaOrNull(personSchema, { name: 42, age: "old" })).toBeNull();
  });
  it("returns null on null input", () => {
    expect(parseSchemaOrNull(personSchema, null)).toBeNull();
  });
  it("returns null on undefined input", () => {
    expect(parseSchemaOrNull(personSchema, undefined)).toBeNull();
  });
  it("returns null when required field is missing", () => {
    expect(parseSchemaOrNull(personSchema, { name: "Alice" })).toBeNull();
  });
});

describe("parseSchemaOrThrow", () => {
  it("returns parsed value on valid input", () => {
    expect(parseSchemaOrThrow(personSchema, { name: "Bob", age: 20 }, "person")).toEqual({
      name: "Bob",
      age: 20,
    });
  });
  it("throws on invalid input with label in message", () => {
    expect(() => parseSchemaOrThrow(personSchema, {}, "person payload")).toThrow(
      "Invalid person payload"
    );
  });
  it("throws on null input", () => {
    expect(() => parseSchemaOrThrow(personSchema, null, "data")).toThrow("Invalid data");
  });
  it("includes field path in error message", () => {
    let message = "";
    try {
      parseSchemaOrThrow(personSchema, { name: 42, age: 30 }, "test");
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("name");
  });
});

describe("stringArraySchema", () => {
  it("accepts array of strings", () => {
    expect(parseSchemaOrNull(stringArraySchema, ["a", "b"])).toEqual(["a", "b"]);
  });
  it("rejects array with non-string elements", () => {
    expect(parseSchemaOrNull(stringArraySchema, [1, 2])).toBeNull();
  });
  it("accepts empty array", () => {
    expect(parseSchemaOrNull(stringArraySchema, [])).toEqual([]);
  });
});

describe("stringSchema", () => {
  it("accepts a string", () => {
    expect(parseSchemaOrNull(stringSchema, "hello")).toBe("hello");
  });
  it("rejects non-string", () => {
    expect(parseSchemaOrNull(stringSchema, 42)).toBeNull();
  });
});

describe("voidResponseSchema", () => {
  it("transforms null to undefined", () => {
    expect(parseSchemaOrNull(voidResponseSchema, null)).toBeUndefined();
  });
  it("transforms undefined to undefined", () => {
    expect(parseSchemaOrNull(voidResponseSchema, undefined)).toBeUndefined();
  });
  it("rejects non-null non-undefined", () => {
    expect(parseSchemaOrNull(voidResponseSchema, "value")).toBeNull();
  });
});
