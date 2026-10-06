import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCachedInternalFileUri,
  invalidateInternalFileUri,
  resolveInternalFileUri,
  toFileUri
} from "../lsp";

const oldPath = "C:\\project\\src\\test.java";
const newPath = "C:\\project\\src\\Test.java";

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  invalidateInternalFileUri(oldPath);
});

describe("file URI cache after a rename", () => {
  it("resolves the new casing instead of retaining the old Windows URI", async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce(toFileUri(oldPath))
      .mockResolvedValueOnce(toFileUri(newPath));
    await resolveInternalFileUri(oldPath);
    expect(getCachedInternalFileUri(newPath)).toBe(toFileUri(oldPath));

    invalidateInternalFileUri(newPath);
    expect(getCachedInternalFileUri(newPath)).toBe(toFileUri(newPath));
    expect(await resolveInternalFileUri(newPath)).toBe(toFileUri(newPath));
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it.each([false, true])("ignores a stale lookup completing after invalidation (failure=%s)", async (fail) => {
    let resolveOld!: (uri: string) => void;
    let rejectOld!: (reason: Error) => void;
    vi.mocked(invoke)
      .mockImplementationOnce(() => new Promise<string>((resolve, reject) => {
        resolveOld = resolve;
        rejectOld = reject;
      }))
      .mockResolvedValueOnce(toFileUri(newPath));
    const pending = resolveInternalFileUri(oldPath);
    invalidateInternalFileUri(oldPath);
    await resolveInternalFileUri(newPath);
    if (fail) rejectOld(new Error("old file no longer exists"));
    else resolveOld(toFileUri(oldPath));
    await pending;
    expect(getCachedInternalFileUri(newPath)).toBe(toFileUri(newPath));
  });

  it("invalidates Windows aliases but preserves distinct POSIX paths", async () => {
    const posixOld = "/project/src/test.java";
    const posixNew = "/project/src/Test.java";
    vi.mocked(invoke).mockResolvedValueOnce(toFileUri(oldPath));
    await resolveInternalFileUri(oldPath);
    invalidateInternalFileUri("c:/PROJECT/src/TEST.java");
    expect(getCachedInternalFileUri(newPath)).toBe(toFileUri(newPath));

    vi.mocked(invoke).mockResolvedValueOnce("file:///canonical/test.java");
    await resolveInternalFileUri(posixOld);
    invalidateInternalFileUri(posixNew);
    expect(getCachedInternalFileUri(posixOld)).toBe("file:///canonical/test.java");
    invalidateInternalFileUri(posixOld);
  });
});
