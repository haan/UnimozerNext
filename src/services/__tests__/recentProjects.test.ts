import { describe, it, expect } from "vitest";
import {
  normalizeRecentPath,
  recentEntryKey,
  upsertRecentProject,
  removeRecentProject,
} from "../recentProjects";
import type { RecentProjectEntry } from "../../models/settings";

function folder(path: string): RecentProjectEntry {
  return { path, kind: "folder" };
}

function packed(path: string): RecentProjectEntry {
  return { path, kind: "packed" };
}

// ---------------------------------------------------------------------------
// normalizeRecentPath
// ---------------------------------------------------------------------------

describe("normalizeRecentPath — folder", () => {
  it("strips trailing slash from folder path", () => {
    expect(normalizeRecentPath("/home/user/project/", "folder")).toBe("/home/user/project");
  });

  it("strips trailing backslash from Windows folder path", () => {
    expect(normalizeRecentPath("C:\\Projects\\MyApp\\", "folder")).toBe("C:\\Projects\\MyApp");
  });

  it("preserves Unix root /", () => {
    expect(normalizeRecentPath("/", "folder")).toBe("/");
  });

  it("preserves Windows drive root C:\\", () => {
    expect(normalizeRecentPath("C:\\", "folder")).toBe("C:\\");
  });

  it("preserves Windows drive root C:/", () => {
    expect(normalizeRecentPath("C:/", "folder")).toBe("C:/");
  });

  it("preserves UNC root \\\\server\\share\\", () => {
    expect(normalizeRecentPath("\\\\server\\share\\", "folder")).toBe("\\\\server\\share\\");
  });

  it("trims leading/trailing whitespace", () => {
    expect(normalizeRecentPath("  /home/user/project  ", "folder")).toBe("/home/user/project");
  });

  it("returns empty string for blank input", () => {
    expect(normalizeRecentPath("   ", "folder")).toBe("");
  });

  it("path without trailing slash is unchanged", () => {
    expect(normalizeRecentPath("/home/user/project", "folder")).toBe("/home/user/project");
  });
});

describe("normalizeRecentPath — packed", () => {
  it("does not strip trailing slash from packed path", () => {
    expect(normalizeRecentPath("/home/user/project.zip/", "packed")).toBe("/home/user/project.zip/");
  });

  it("trims whitespace from packed path", () => {
    expect(normalizeRecentPath("  /home/user/project.zip  ", "packed")).toBe("/home/user/project.zip");
  });
});

// ---------------------------------------------------------------------------
// recentEntryKey
// ---------------------------------------------------------------------------

describe("recentEntryKey", () => {
  it("includes kind prefix in key", () => {
    expect(recentEntryKey(folder("/home/user/project"))).toMatch(/^folder:/);
  });

  it("lowercases Windows paths for case-insensitive comparison", () => {
    const a = recentEntryKey(folder("C:\\Projects\\MyApp"));
    const b = recentEntryKey(folder("C:\\PROJECTS\\MYAPP"));
    expect(a).toBe(b);
  });

  it("does not lowercase Unix paths", () => {
    const a = recentEntryKey(folder("/home/User/Project"));
    const b = recentEntryKey(folder("/home/user/project"));
    expect(a).not.toBe(b);
  });

  it("folder and packed with same path produce different keys", () => {
    expect(recentEntryKey(folder("/proj"))).not.toBe(recentEntryKey(packed("/proj")));
  });

  it("strips trailing slash before keying", () => {
    expect(recentEntryKey(folder("/proj/"))).toBe(recentEntryKey(folder("/proj")));
  });
});

// ---------------------------------------------------------------------------
// upsertRecentProject
// ---------------------------------------------------------------------------

describe("upsertRecentProject", () => {
  it("adds a new entry to an empty list", () => {
    const result = upsertRecentProject([], folder("/proj/a"));
    expect(result).toHaveLength(1);
    expect(result[0]!.path).toBe("/proj/a");
  });

  it("prepends the new entry to the front", () => {
    const list = [folder("/proj/a")];
    const result = upsertRecentProject(list, folder("/proj/b"));
    expect(result[0]!.path).toBe("/proj/b");
    expect(result[1]!.path).toBe("/proj/a");
  });

  it("moves an existing entry to the front", () => {
    const list = [folder("/proj/a"), folder("/proj/b"), folder("/proj/c")];
    const result = upsertRecentProject(list, folder("/proj/b"));
    expect(result[0]!.path).toBe("/proj/b");
    expect(result).toHaveLength(3);
  });

  it("deduplicates case-insensitively on Windows paths", () => {
    const list = [folder("C:\\Projects\\MyApp")];
    const result = upsertRecentProject(list, folder("C:\\PROJECTS\\MYAPP"));
    expect(result).toHaveLength(1);
    expect(result[0]!.path).toBe("C:\\PROJECTS\\MYAPP");
  });

  it("does not deduplicate different kinds", () => {
    const list = [folder("/proj/a")];
    const result = upsertRecentProject(list, packed("/proj/a"));
    expect(result).toHaveLength(2);
  });

  it("ignores entries with blank paths", () => {
    const list = [folder("/proj/a")];
    const result = upsertRecentProject(list, folder("   "));
    expect(result).toEqual(list);
  });

  it("respects the max limit", () => {
    const list = Array.from({ length: 5 }, (_, i) => folder(`/proj/${i}`));
    const result = upsertRecentProject(list, folder("/proj/new"), 5);
    expect(result).toHaveLength(5);
    expect(result[0]!.path).toBe("/proj/new");
  });

  it("normalizes trailing slash on insert", () => {
    const result = upsertRecentProject([], folder("/proj/a/"));
    expect(result[0]!.path).toBe("/proj/a");
  });
});

// ---------------------------------------------------------------------------
// removeRecentProject
// ---------------------------------------------------------------------------

describe("removeRecentProject", () => {
  it("removes an entry by path and kind", () => {
    const list = [folder("/proj/a"), folder("/proj/b")];
    const result = removeRecentProject(list, folder("/proj/a"));
    expect(result).toHaveLength(1);
    expect(result[0]!.path).toBe("/proj/b");
  });

  it("returns list unchanged when entry not found", () => {
    const list = [folder("/proj/a")];
    const result = removeRecentProject(list, folder("/proj/z"));
    expect(result).toEqual(list);
  });

  it("does not remove entry with same path but different kind", () => {
    const list = [folder("/proj/a")];
    const result = removeRecentProject(list, packed("/proj/a"));
    expect(result).toHaveLength(1);
  });

  it("removes case-insensitively on Windows paths", () => {
    const list = [folder("C:\\Projects\\MyApp")];
    const result = removeRecentProject(list, folder("C:\\PROJECTS\\MYAPP"));
    expect(result).toHaveLength(0);
  });

  it("returns empty list when removing the only entry", () => {
    const list = [folder("/proj/a")];
    const result = removeRecentProject(list, folder("/proj/a"));
    expect(result).toHaveLength(0);
  });
});
