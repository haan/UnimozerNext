import { describe, it, expect } from "vitest";
import { basename, joinPath, toDisplayPath, toRelativePath } from "../paths";

describe("basename", () => {
  it("returns last segment for unix path", () => {
    expect(basename("/workspace/project/Main.java")).toBe("Main.java");
  });
  it("returns last segment for windows path", () => {
    expect(basename("C:\\Projects\\SampleProject\\Main.java")).toBe("Main.java");
  });
  it("strips trailing slash before splitting", () => {
    expect(basename("/workspace/project/")).toBe("project");
  });
  it("returns path unchanged when no separator", () => {
    expect(basename("Main.java")).toBe("Main.java");
  });
  it("handles mixed separators", () => {
    expect(basename("C:/Projects/SampleProject/Main.java")).toBe("Main.java");
  });
});

describe("joinPath", () => {
  it("joins with forward slash for unix root", () => {
    expect(joinPath("/workspace/project", "Main.java")).toBe("/workspace/project/Main.java");
  });
  it("joins with backslash for windows root", () => {
    expect(joinPath("C:\\Projects\\SampleProject", "Main.java")).toBe("C:\\Projects\\SampleProject\\Main.java");
  });
  it("strips trailing separator from root before joining", () => {
    expect(joinPath("/workspace/project/", "Main.java")).toBe("/workspace/project/Main.java");
  });
});

describe("toDisplayPath", () => {
  it("strips windows extended-length prefix", () => {
    expect(toDisplayPath("\\\\?\\C:\\Projects\\SampleProject")).toBe("C:\\Projects\\SampleProject");
  });
  it("strips windows UNC extended-length prefix", () => {
    expect(toDisplayPath("\\\\?\\UNC\\server\\share")).toBe("\\\\server\\share");
  });
  it("returns unchanged for normal unix path", () => {
    expect(toDisplayPath("/workspace/project")).toBe("/workspace/project");
  });
  it("returns unchanged for normal windows path", () => {
    expect(toDisplayPath("C:\\Projects\\SampleProject")).toBe("C:\\Projects\\SampleProject");
  });
  it("returns unchanged for empty string", () => {
    expect(toDisplayPath("")).toBe("");
  });
});

describe("toRelativePath", () => {
  it("strips root prefix on unix path", () => {
    expect(toRelativePath("/project/src/Main.java", "/project")).toBe("src/Main.java");
  });
  it("strips root prefix on windows path", () => {
    expect(toRelativePath("C:\\project\\src\\Main.java", "C:\\project")).toBe("src\\Main.java");
  });
  it("returns full path when not under root", () => {
    expect(toRelativePath("/other/Main.java", "/project")).toBe("/other/Main.java");
  });
  it("strips trailing separator from root before comparing", () => {
    expect(toRelativePath("/project/src/Main.java", "/project/")).toBe("src/Main.java");
  });
  it("returns full path when root is empty", () => {
    expect(toRelativePath("/project/src/Main.java", "")).toBe("/project/src/Main.java");
  });
});
