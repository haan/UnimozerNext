import { STATUS_TEXT_MAX_CHARS } from "../constants/app";

export const formatStatusText = (input: unknown): string =>
  typeof input === "string" ? input : JSON.stringify(input);

export const trimStatusText = (input: string, max = STATUS_TEXT_MAX_CHARS): string =>
  input.length > max ? `${input.slice(0, max)}...` : input;
