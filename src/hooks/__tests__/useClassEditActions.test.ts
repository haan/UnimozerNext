import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("../../services/tauriValidation", () => ({
  invokeValidated: vi.fn(),
  fileNodeSchema: {},
  stringSchema: {},
  voidResponseSchema: {},
}));

import { useClassEditActions } from "../useClassEditActions";
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
    selectedNode: null,
    fieldTarget: null,
    constructorTarget: null,
    methodTarget: null,
    fileDrafts: {},
    openFilePath: null,
    openFileByPath: vi.fn().mockResolvedValue(undefined),
    clearPendingReveal: vi.fn(),
    updateDraftForPath: vi.fn(),
    notifyLsChangeImmediate: vi.fn(),
    notifyLsOpen: vi.fn(),
    setTree: vi.fn(),
    setOpenFile: vi.fn(),
    setContent: vi.fn(),
    setLastSavedContent: vi.fn(),
    setCompileStatus: vi.fn(),
    setBusy: vi.fn(),
    setStatus: vi.fn(),
    formatStatus: vi.fn((e: unknown) => String(e)),
    ...overrides,
  };
}

function classForm(overrides: Record<string, unknown> = {}) {
  return {
    name: "Foo",
    isInterface: false,
    extendsName: "",
    packageName: "",
    isFinal: false,
    isAbstract: false,
    includeMain: false,
    includeJavadoc: false,
    ...overrides,
  };
}

function fieldForm(overrides: Record<string, unknown> = {}) {
  return {
    name: "count",
    type: "int",
    visibility: "private" as const,
    initialValue: "",
    isStatic: false,
    isFinal: false,
    includeSetter: false,
    useParamPrefix: false,
    includeGetter: false,
    includeJavadoc: false,
    ...overrides,
  };
}

function methodForm(overrides: Record<string, unknown> = {}) {
  return {
    name: "doWork",
    returnType: "void",
    visibility: "public" as const,
    isStatic: false,
    isAbstract: false,
    includeJavadoc: false,
    params: [],
    ...overrides,
  };
}

function constructorForm(overrides: Record<string, unknown> = {}) {
  return {
    params: [],
    includeJavadoc: false,
    ...overrides,
  };
}

beforeEach(() => {
  mockInvoke.mockReset();
});

// ---------------------------------------------------------------------------
// handleCreateClass
// ---------------------------------------------------------------------------

describe("handleCreateClass", () => {
  it("sets status when no project is open", async () => {
    const args = makeArgs({ projectPath: null });
    const { result } = renderHook(() => useClassEditActions(args));
    await act(async () => { await result.current.handleCreateClass(classForm()); });
    expect(args.setStatus).toHaveBeenCalledWith(expect.stringContaining("Open a project"));
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("sets status when class file already exists", async () => {
    mockInvoke.mockResolvedValueOnce("existing content");
    const args = makeArgs();
    const { result } = renderHook(() => useClassEditActions(args));
    await act(async () => { await result.current.handleCreateClass(classForm({ name: "Foo" })); });
    expect(args.setStatus).toHaveBeenCalledWith(expect.stringContaining("already exists"));
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it("writes file and refreshes tree on success", async () => {
    mockInvoke
      .mockRejectedValueOnce(new Error("not found"))
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(MOCK_TREE);
    const args = makeArgs();
    const { result } = renderHook(() => useClassEditActions(args));
    await act(async () => { await result.current.handleCreateClass(classForm({ name: "Foo" })); });
    expect(mockInvoke).toHaveBeenCalledWith(
      "write_text_file", expect.anything(), expect.anything(),
      expect.objectContaining({ path: "/proj/src/Foo.java" })
    );
    expect(args.setTree).toHaveBeenCalledWith(MOCK_TREE);
    expect(args.setCompileStatus).toHaveBeenCalledWith(null);
    expect(args.setStatus).toHaveBeenCalledWith("Created Foo.java");
  });

  it("places file in package subdirectory", async () => {
    mockInvoke
      .mockRejectedValueOnce(new Error("not found"))
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(MOCK_TREE);
    const args = makeArgs();
    const { result } = renderHook(() => useClassEditActions(args));
    await act(async () => {
      await result.current.handleCreateClass(classForm({ name: "Bar", packageName: "com.example" }));
    });
    expect(mockInvoke).toHaveBeenCalledWith(
      "write_text_file", expect.anything(), expect.anything(),
      expect.objectContaining({ path: expect.stringContaining("com") })
    );
  });

  it("strips .java extension from name", async () => {
    mockInvoke
      .mockRejectedValueOnce(new Error("not found"))
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(MOCK_TREE);
    const args = makeArgs();
    const { result } = renderHook(() => useClassEditActions(args));
    await act(async () => { await result.current.handleCreateClass(classForm({ name: "Baz.java" })); });
    expect(mockInvoke).toHaveBeenCalledWith(
      "write_text_file", expect.anything(), expect.anything(),
      expect.objectContaining({ path: "/proj/src/Baz.java" })
    );
  });

  it("sets failure status when write fails", async () => {
    mockInvoke
      .mockRejectedValueOnce(new Error("not found"))
      .mockRejectedValueOnce(new Error("disk full"));
    const args = makeArgs();
    const { result } = renderHook(() => useClassEditActions(args));
    await act(async () => { await result.current.handleCreateClass(classForm()); });
    expect(args.setStatus).toHaveBeenCalledWith(expect.stringContaining("Failed to create class"));
  });
});

// ---------------------------------------------------------------------------
// handleCreateField
// ---------------------------------------------------------------------------

describe("handleCreateField", () => {
  it("sets status when no project is open", async () => {
    const args = makeArgs({ projectPath: null });
    const { result } = renderHook(() => useClassEditActions(args));
    await act(async () => { await result.current.handleCreateField(fieldForm()); });
    expect(args.setStatus).toHaveBeenCalledWith(expect.stringContaining("Open a project"));
  });

  it("sets status when no class is selected", async () => {
    const args = makeArgs({ selectedNode: null, fieldTarget: null });
    const { result } = renderHook(() => useClassEditActions(args));
    await act(async () => { await result.current.handleCreateField(fieldForm()); });
    expect(args.setStatus).toHaveBeenCalledWith(expect.stringContaining("Select a class"));
  });

  it("calls add_field_to_class with correct payload using selectedNode", async () => {
    mockInvoke.mockResolvedValueOnce("updated content");
    const args = makeArgs({ selectedNode: MOCK_NODE });
    const { result } = renderHook(() => useClassEditActions(args));
    await act(async () => { await result.current.handleCreateField(fieldForm({ name: "score" })); });
    expect(mockInvoke).toHaveBeenCalledWith(
      "add_field_to_class", expect.anything(), expect.anything(),
      expect.objectContaining({
        request: expect.objectContaining({
          action: "addField",
          path: MOCK_NODE.path,
          field: expect.objectContaining({ name: "score" }),
        })
      })
    );
    expect(args.setCompileStatus).toHaveBeenCalledWith(null);
    expect(args.setStatus).toHaveBeenCalledWith(expect.stringContaining("Added field"));
  });

  it("uses existing draft content instead of reading file", async () => {
    mockInvoke.mockResolvedValueOnce("updated content");
    const draft = { content: "draft source", lastSavedContent: "saved source" };
    const args = makeArgs({
      selectedNode: MOCK_NODE,
      fileDrafts: { [MOCK_NODE.path]: draft },
    });
    const { result } = renderHook(() => useClassEditActions(args));
    await act(async () => { await result.current.handleCreateField(fieldForm()); });
    // read_text_file should NOT have been called since draft is available
    expect(mockInvoke).not.toHaveBeenCalledWith("read_text_file", expect.anything(), expect.anything(), expect.anything());
    expect(mockInvoke).toHaveBeenCalledWith(
      "add_field_to_class", expect.anything(), expect.anything(),
      expect.objectContaining({
        request: expect.objectContaining({ content: "draft source" })
      })
    );
  });

  it("fieldTarget takes precedence over selectedNode", async () => {
    const fieldTarget = { ...MOCK_NODE, id: "OtherClass", path: "/proj/src/OtherClass.java", name: "OtherClass" };
    mockInvoke.mockResolvedValueOnce("file content").mockResolvedValueOnce("updated");
    const args = makeArgs({ selectedNode: MOCK_NODE, fieldTarget });
    const { result } = renderHook(() => useClassEditActions(args));
    await act(async () => { await result.current.handleCreateField(fieldForm()); });
    expect(mockInvoke).toHaveBeenCalledWith(
      "add_field_to_class", expect.anything(), expect.anything(),
      expect.objectContaining({ request: expect.objectContaining({ path: fieldTarget.path }) })
    );
  });
});

// ---------------------------------------------------------------------------
// handleCreateConstructor
// ---------------------------------------------------------------------------

describe("handleCreateConstructor", () => {
  it("sets status when no project is open", async () => {
    const args = makeArgs({ projectPath: null });
    const { result } = renderHook(() => useClassEditActions(args));
    await act(async () => { await result.current.handleCreateConstructor(constructorForm()); });
    expect(args.setStatus).toHaveBeenCalledWith(expect.stringContaining("Open a project"));
  });

  it("sets status when no class is selected", async () => {
    const args = makeArgs();
    const { result } = renderHook(() => useClassEditActions(args));
    await act(async () => { await result.current.handleCreateConstructor(constructorForm()); });
    expect(args.setStatus).toHaveBeenCalledWith(expect.stringContaining("Select a class"));
  });

  it("calls add_constructor_to_class with params", async () => {
    mockInvoke.mockResolvedValueOnce("file content").mockResolvedValueOnce("updated");
    const args = makeArgs({ selectedNode: MOCK_NODE });
    const params = [{ name: "name", type: "String", id: "p1" }];
    const { result } = renderHook(() => useClassEditActions(args));
    await act(async () => {
      await result.current.handleCreateConstructor(constructorForm({ params }));
    });
    expect(mockInvoke).toHaveBeenCalledWith(
      "add_constructor_to_class", expect.anything(), expect.anything(),
      expect.objectContaining({
        request: expect.objectContaining({
          action: "addConstructor",
          params: [{ name: "name", paramType: "String" }],
        })
      })
    );
    expect(args.setStatus).toHaveBeenCalledWith(expect.stringContaining("Added constructor"));
  });
});

// ---------------------------------------------------------------------------
// handleCreateMethod
// ---------------------------------------------------------------------------

describe("handleCreateMethod", () => {
  it("sets status when no project is open", async () => {
    const args = makeArgs({ projectPath: null });
    const { result } = renderHook(() => useClassEditActions(args));
    await act(async () => { await result.current.handleCreateMethod(methodForm()); });
    expect(args.setStatus).toHaveBeenCalledWith(expect.stringContaining("Open a project"));
  });

  it("sets status when no class is selected", async () => {
    const args = makeArgs();
    const { result } = renderHook(() => useClassEditActions(args));
    await act(async () => { await result.current.handleCreateMethod(methodForm()); });
    expect(args.setStatus).toHaveBeenCalledWith(expect.stringContaining("Select a class"));
  });

  it("calls add_method_to_class with correct payload", async () => {
    mockInvoke.mockResolvedValueOnce("file content").mockResolvedValueOnce("updated");
    const args = makeArgs({ selectedNode: MOCK_NODE });
    const { result } = renderHook(() => useClassEditActions(args));
    await act(async () => {
      await result.current.handleCreateMethod(methodForm({ name: "getScore", returnType: "int" }));
    });
    expect(mockInvoke).toHaveBeenCalledWith(
      "add_method_to_class", expect.anything(), expect.anything(),
      expect.objectContaining({
        request: expect.objectContaining({
          action: "addMethod",
          method: expect.objectContaining({ name: "getScore", returnType: "int" }),
        })
      })
    );
    expect(args.setStatus).toHaveBeenCalledWith(expect.stringContaining("Added method"));
  });

  it("methodTarget takes precedence over selectedNode", async () => {
    const methodTarget = { ...MOCK_NODE, id: "Other", path: "/proj/src/Other.java", name: "Other" };
    mockInvoke.mockResolvedValueOnce("content").mockResolvedValueOnce("updated");
    const args = makeArgs({ selectedNode: MOCK_NODE, methodTarget });
    const { result } = renderHook(() => useClassEditActions(args));
    await act(async () => { await result.current.handleCreateMethod(methodForm()); });
    expect(mockInvoke).toHaveBeenCalledWith(
      "add_method_to_class", expect.anything(), expect.anything(),
      expect.objectContaining({ request: expect.objectContaining({ path: methodTarget.path }) })
    );
  });
});
