import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("../../services/tauriValidation", () => ({
  invokeValidated: vi.fn(),
  fileNodeSchema: {},
  voidResponseSchema: {},
}));

import { useClassRemovalActions } from "../useClassRemovalActions";
import { invokeValidated } from "../../services/tauriValidation";

const mockInvoke = vi.mocked(invokeValidated);

const MOCK_TREE = { name: "proj", path: "/proj", children: [], isDirectory: true };
const MOCK_NODE = {
  id: "MyClass",
  name: "MyClass",
  kind: "class" as const,
  path: "/proj/src/MyClass.java",
  fields: [],
  methods: [],
};

function makeArgs(overrides: Record<string, unknown> = {}) {
  return {
    projectPath: "/proj",
    openFilePath: null,
    selectedClassId: null,
    removeTarget: MOCK_NODE,
    requestPackedArchiveSync: vi.fn(),
    monacoRef: { current: null },
    getInternalFileUri: vi.fn((path: string) => `file://${path}`),
    notifyLsClose: vi.fn(),
    closeRemoveClassDialog: vi.fn(),
    setTree: vi.fn(),
    setOpenFile: vi.fn(),
    setContent: vi.fn(),
    setLastSavedContent: vi.fn(),
    setFileDrafts: vi.fn(),
    setCompileStatus: vi.fn(),
    setSelectedClassId: vi.fn(),
    setBusy: vi.fn(),
    setStatus: vi.fn(),
    formatStatus: vi.fn((e: unknown) => String(e)),
    ...overrides,
  };
}

beforeEach(() => {
  mockInvoke.mockReset();
});

describe("confirmRemoveClass", () => {
  it("does nothing when removeTarget is null", async () => {
    const args = makeArgs({ removeTarget: null });
    const { result } = renderHook(() => useClassRemovalActions(args));
    await act(async () => { await result.current.confirmRemoveClass(); });
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(args.closeRemoveClassDialog).not.toHaveBeenCalled();
  });

  it("calls remove_text_file and refreshes tree on success", async () => {
    mockInvoke
      .mockResolvedValueOnce(undefined)    // remove_text_file
      .mockResolvedValueOnce(MOCK_TREE);   // list_project_tree
    const args = makeArgs();
    const { result } = renderHook(() => useClassRemovalActions(args));
    await act(async () => { await result.current.confirmRemoveClass(); });
    expect(args.closeRemoveClassDialog).toHaveBeenCalled();
    expect(mockInvoke).toHaveBeenCalledWith(
      "remove_text_file", expect.anything(), expect.anything(),
      expect.objectContaining({ path: MOCK_NODE.path })
    );
    expect(args.setTree).toHaveBeenCalledWith(MOCK_TREE);
    expect(args.setCompileStatus).toHaveBeenCalledWith(null);
    expect(args.setStatus).toHaveBeenCalledWith(expect.stringContaining("MyClass.java"));
  });

  it("clears editor state when the removed file was open", async () => {
    mockInvoke
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(MOCK_TREE);
    const args = makeArgs({ openFilePath: MOCK_NODE.path });
    const { result } = renderHook(() => useClassRemovalActions(args));
    await act(async () => { await result.current.confirmRemoveClass(); });
    expect(args.setOpenFile).toHaveBeenCalledWith(null);
    expect(args.setContent).toHaveBeenCalledWith("");
    expect(args.setLastSavedContent).toHaveBeenCalledWith("");
  });

  it("clears selectedClassId when the removed class was selected", async () => {
    mockInvoke
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(MOCK_TREE);
    const args = makeArgs({ selectedClassId: MOCK_NODE.id });
    const { result } = renderHook(() => useClassRemovalActions(args));
    await act(async () => { await result.current.confirmRemoveClass(); });
    expect(args.setSelectedClassId).toHaveBeenCalledWith(null);
  });

  it("sets failure status on IPC error", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("file locked"));
    const args = makeArgs();
    const { result } = renderHook(() => useClassRemovalActions(args));
    await act(async () => { await result.current.confirmRemoveClass(); });
    expect(args.setStatus).toHaveBeenCalledWith(expect.stringContaining("Failed to remove"));
  });
});
