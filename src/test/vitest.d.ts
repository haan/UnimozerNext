import "vitest";
import type { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers";

declare module "vitest" {
  // jest-dom's bundled Vitest types still use the pre-v5 Assertion interface.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- module augmentation
  interface Matchers<R extends void | Promise<void>, T> extends TestingLibraryMatchers<T, R> {}
}
