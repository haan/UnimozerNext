import { STATUS_TEXT_MAX_CHARS } from "../constants/app";

const hasStringField = (value: unknown, key: string): value is Record<string, string> =>
  typeof value === "object" &&
  value !== null &&
  key in value &&
  typeof (value as Record<string, unknown>)[key] === "string";

const safeJsonStringify = (value: unknown): string | null => {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
};

export const formatStatusText = (input: unknown): string => {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof Error) {
    return input.message || input.name || "Unknown error";
  }
  if (hasStringField(input, "message")) {
    return input.message;
  }
  if (hasStringField(input, "error")) {
    return input.error;
  }
  if (input === null || input === undefined) {
    return "Unknown error";
  }

  const serialized = safeJsonStringify(input);
  if (!serialized || serialized === "{}") {
    return "Unknown error";
  }
  return serialized;
};

export const trimStatusText = (input: string, max = STATUS_TEXT_MAX_CHARS): string =>
  input.length > max ? `${input.slice(0, max)}...` : input;
