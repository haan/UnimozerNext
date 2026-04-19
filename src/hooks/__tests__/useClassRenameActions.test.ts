import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("../../services/tauriValidation", () => ({
  invokeValidated: vi.fn(),
  fileNodeSchema: {},
  stringSchema: {},
  voidResponseSchema: {},
  renameClassResponseSchema: {},
}));

import { useClassRenameActions, deriveRenamedClassId } from "../useClassRenameActions";
import { invokeValidated } from "../../services/tauriValidation";

const mockInvoke = vi.mocked(invokeValidated);

const MOCK_TREE = { name: "proj", path: "/proj", children: [], isDirectory: true };
const MOCK_NODE = {
  id: "OldName",
  name: "OldName",
  kind: "class" as const,
  path: "/proj/src/OldName.java",
  fields: [],
  methods: [],
};
const RENAME_RESPONSE = {
  oldPath: "/proj/src/OldName.java",
  newPath: "/proj/src/NewName.java",
  content: "public class NewName {}",
};

function makeArgs(overrides: Record<string, unknown> = {}) {
  return {
    projectPath: "/proj",
    openFilePath: null,
    renameTarget: MOCK_NODE,
    diagramPath: null,
    diagramState: null,
    requestPackedArchiveSync: vi.fn(),
    monacoRef: { current: null },
    getInternalFileUri: vi.fn((path: string) => `file://${path}`),
    notifyLsClose: vi.fn(),
    notifyLsOpen: vi.fn(),
    fileDrafts: {},
    setDiagramState: vi.fn(),
    setTree: vi.fn(),
    setOpenFile: vi.fn(),
    setContent: vi.fn(),
    setLastSavedContent: vi.fn(),
    setFileDrafts: vi.fn(),
    setCompileStatus: vi.fn(),
    setSelectedClassId: vi.fn(),
    setBusy: vi.fn(),
    setStatus: vi.fn(),
    openRenameClassErrorDialog: vi.fn(),
    formatStatus: vi.fn((e: unknown) => String(e)),
    ...overrides,
  };
}

beforeEach(() => {
  mockInvoke.mockReset();
});

// ---------------------------------------------------------------------------
// deriveRenamedClassId (pure function)
// ---------------------------------------------------------------------------

describe("deriveRenamedClassId", () => {
  it("returns newName when classId equals oldName", () => {
    expect(deriveRenamedClassId("MyClass", "MyClass", "Renamed")).toBe("Renamed");
  });

  it("replaces dotted suffix", () => {
    expect(deriveRenamedClassId("com.example.OldName", "OldName", "NewName")).toBe("com.example.NewName");
  });

  it("returns null when classId does not match", () => {
    expect(deriveRenamedClassId("Unrelated", "OldName", "NewName")).toBeNull();
  });

  it("does not match partial substring without dot", () => {
    expect(deriveRenamedClassId("OldNameExtra", "OldName", "NewName")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// handleRenameClass
// ---------------------------------------------------------------------------

describe("handleRenameClass", () => {
  it("sets status when no project is open", async () => {
    const args = makeArgs({ projectPath: null });
    const { result } = renderHook(() => useClassRenameActions(args));
    await act(async () => { await result.current.handleRenameClass({ name: "NewName" }); });
    expect(args.setStatus).toHaveBeenCalledWith(expect.stringContaining("Open a project"));
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("sets status when no rename target is selected", async () => {
    const args = makeArgs({ renameTarget: null });
    const { result } = renderHook(() => useClassRenameActions(args));
    await act(async () => { await result.current.handleRenameClass({ name: "NewName" }); });
    expect(args.setStatus).toHaveBeenCalledWith(expect.stringContaining("Select a class"));
  });

  it("sets status when new name is same as old", async () => {
    const args = makeArgs();
    const { result } = renderHook(() => useClassRenameActions(args));
    await act(async () => { await result.current.handleRenameClass({ name: "OldName" }); });
    expect(args.setStatus).toHaveBeenCalledWith(expect.stringContaining("different"));
  });

  it("sets status when new name is not a valid Java identifier", async () => {
    const args = makeArgs();
    const { result } = renderHook(() => useClassRenameActions(args));
    await act(async () => { await result.current.handleRenameClass({ name: "1Invalid" }); });
    expect(args.setStatus).toHaveBeenCalledWith(expect.stringContaining("valid Java identifier"));
  });

  it("calls rename_class_in_file and refreshes tree on success", async () => {
    mockInvoke
      .mockResolvedValueOnce(RENAME_RESPONSE)
      .mockResolvedValueOnce(MOCK_TREE);
    const args = makeArgs();
    const { result } = renderHook(() => useClassRenameActions(args));
    await act(async () => { await result.current.handleRenameClass({ name: "NewName" }); });
    expect(mockInvoke).toHaveBeenCalledWith(
      "rename_class_in_file", expect.anything(), expect.anything(),
      expect.objectContaining({
        oldClassName: "OldName",
        newClassName: "NewName",
      })
    );
    expect(args.setTree).toHaveBeenCalledWith(MOCK_TREE);
    expect(args.setCompileStatus).toHaveBeenCalledWith(null);
    expect(args.setStatus).toHaveBeenCalledWith(expect.stringContaining("Renamed OldName.java to NewName.java"));
  });

  it("flushes unsaved draft before renaming", async () => {
    const draft = { content: "modified", lastSavedContent: "original" };
    mockInvoke
      .mockResolvedValueOnce(undefined)         // write_text_file (flush)
      .mockResolvedValueOnce(RENAME_RESPONSE)   // rename_class_in_file
      .mockResolvedValueOnce(MOCK_TREE);        // list_project_tree
    const args = makeArgs({
      fileDrafts: { [MOCK_NODE.path]: draft },
    });
    const { result } = renderHook(() => useClassRenameActions(args));
    await act(async () => { await result.current.handleRenameClass({ name: "NewName" }); });
    expect(mockInvoke).toHaveBeenCalledWith(
      "write_text_file", expect.anything(), expect.anything(),
      expect.objectContaining({ path: MOCK_NODE.path, contents: "modified" })
    );
  });

  it("opens error dialog on IPC failure", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("permission denied"));
    const args = makeArgs();
    const { result } = renderHook(() => useClassRenameActions(args));
    await act(async () => { await result.current.handleRenameClass({ name: "NewName" }); });
    expect(args.openRenameClassErrorDialog).toHaveBeenCalled();
    expect(args.setStatus).toHaveBeenCalledWith(expect.stringContaining("Failed to rename"));
  });

  it("updates open file state when renamed file was open", async () => {
    mockInvoke
      .mockResolvedValueOnce(RENAME_RESPONSE)
      .mockResolvedValueOnce(MOCK_TREE);
    const args = makeArgs({ openFilePath: MOCK_NODE.path });
    const { result } = renderHook(() => useClassRenameActions(args));
    await act(async () => { await result.current.handleRenameClass({ name: "NewName" }); });
    expect(args.setOpenFile).toHaveBeenCalledWith(
      expect.objectContaining({ path: RENAME_RESPONSE.newPath })
    );
    expect(args.setContent).toHaveBeenCalledWith(RENAME_RESPONSE.content);
  });
});
