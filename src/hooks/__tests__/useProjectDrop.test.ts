import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { useProjectDrop } from "../useProjectDrop";
import { useDialogState } from "../useDialogState";

const { subscribe, unlisten } = vi.hoisted(() => ({ subscribe: vi.fn(), unlisten: vi.fn() }));
vi.mock("@tauri-apps/api/webviewWindow", () => ({
  getCurrentWebviewWindow: () => ({ onDragDropEvent: subscribe })
}));

type Listener = (event: { payload: { type: string; paths: string[] } }) => void;
let listener: Listener;
const emit = (paths: string[], type = "drop") => act(async () => {
  listener({ payload: { type, paths } });
});
const makeArgs = () => ({
  blocked: false,
  projectDropPendingRef: { current: false },
  isProjectActionPending: vi.fn(() => false),
  onOpenProjectPath: vi.fn().mockResolvedValue(undefined),
  onDropError: vi.fn(),
  setStatus: vi.fn(),
  formatStatus: (error: unknown) => String(error)
});

beforeEach(() => {
  subscribe.mockReset().mockImplementation((callback: Listener) => {
    listener = callback;
    return Promise.resolve(unlisten);
  });
  vi.mocked(invoke).mockReset().mockResolvedValue("folder");
});

describe("useProjectDrop", () => {
  it("shows the overlay on enter and keeps it visible while hovering without opening anything", async () => {
    const args = makeArgs();
    const { result } = renderHook(() => useProjectDrop(args));
    expect(result.current).toBe(false);
    await emit(["/project"], "enter");
    expect(result.current).toBe(true);
    await emit([], "over");
    expect(result.current).toBe(true);
    expect(invoke).not.toHaveBeenCalled();
    expect(args.onOpenProjectPath).not.toHaveBeenCalled();
  });

  it.each(["leave", "drop"])("hides the overlay on %s", async (type) => {
    const args = makeArgs();
    const { result } = renderHook(() => useProjectDrop(args));
    await emit(["/project"], "enter");
    await emit(["/project"], type);
    expect(result.current).toBe(false);
    expect(args.onOpenProjectPath).toHaveBeenCalledTimes(type === "drop" ? 1 : 0);
  });

  it("clears the overlay when the app becomes blocked and does not revive a stale drag", async () => {
    const args = makeArgs();
    const { result, rerender } = renderHook((props) => useProjectDrop(props), { initialProps: args });
    await emit(["/project"], "enter");
    expect(result.current).toBe(true);
    rerender({ ...args, blocked: true });
    expect(result.current).toBe(false);
    await emit(["/project"], "enter");
    expect(result.current).toBe(false);
    rerender(args);
    await emit([], "over");
    expect(result.current).toBe(false);
    await emit(["/project"], "enter");
    expect(result.current).toBe(true);
  });

  it("hides the overlay when another action starts during a drag", async () => {
    const args = makeArgs();
    const { result } = renderHook(() => useProjectDrop(args));
    await emit(["/project"], "enter");
    args.isProjectActionPending.mockReturnValue(true);
    await emit([], "over");
    expect(result.current).toBe(false);
    await emit(["/project"], "enter");
    expect(result.current).toBe(false);
  });

  it("does not show the overlay for empty drags or while processing a drop", async () => {
    const args = makeArgs();
    const { result } = renderHook(() => useProjectDrop(args));
    await emit([], "enter");
    expect(result.current).toBe(false);
    args.projectDropPendingRef.current = true;
    await emit(["/project"], "enter");
    expect(result.current).toBe(false);
  });

  it("hides the overlay before showing a multi-drop error dialog", async () => {
    const args = makeArgs();
    const { result } = renderHook(() => useProjectDrop(args));
    await emit(["/one", "/two"], "enter");
    expect(result.current).toBe(true);
    await emit(["/one", "/two"]);
    expect(result.current).toBe(false);
    expect(args.onDropError).toHaveBeenCalledOnce();
  });

  it.each(["folder", "packed"])("opens a classified %s using the original path", async (kind) => {
    vi.mocked(invoke).mockResolvedValue(kind);
    const args = makeArgs();
    renderHook(() => useProjectDrop(args));
    await emit(["C:/Über project/test.UMZ"]);
    expect(invoke).toHaveBeenCalledWith("classify_project_path", { path: "C:/Über project/test.UMZ" });
    expect(args.onOpenProjectPath).toHaveBeenCalledWith({ path: "C:/Über project/test.UMZ", kind });
    expect(args.projectDropPendingRef.current).toBe(false);
    expect(args.onDropError).not.toHaveBeenCalled();
  });

  it("ignores hover, leave, and empty events", async () => {
    const args = makeArgs();
    renderHook(() => useProjectDrop(args));
    for (const type of ["enter", "over", "leave"]) await emit(["/project"], type);
    await emit([]);
    expect(invoke).not.toHaveBeenCalled();
    expect(args.setStatus).not.toHaveBeenCalled();
    expect(args.onDropError).not.toHaveBeenCalled();
  });

  it("rejects multiple paths without classifying or opening them", async () => {
    const args = makeArgs();
    renderHook(() => useProjectDrop(args));
    await emit(["/one", "/two.umz"]);
    expect(invoke).not.toHaveBeenCalled();
    expect(args.setStatus).toHaveBeenCalledWith("Drop one folder or .umz file at a time.");
    expect(args.onDropError).toHaveBeenCalledExactlyOnceWith("Drop one folder or .umz file at a time.");
  });

  it("reports unsupported paths without opening a confirmation", async () => {
    vi.mocked(invoke).mockResolvedValue("unsupported");
    const args = makeArgs();
    renderHook(() => useProjectDrop(args));
    await emit(["/Class.java"]);
    expect(args.onOpenProjectPath).not.toHaveBeenCalled();
    expect(args.setStatus).toHaveBeenCalledWith("Drop a project folder or .umz file.");
    expect(args.onDropError).toHaveBeenCalledExactlyOnceWith("Drop a project folder or .umz file.");
  });

  it.each(["missing", "malformed", "open failed"])("releases the guard after %s errors", async (reason) => {
    const args = makeArgs();
    if (reason === "missing") vi.mocked(invoke).mockRejectedValue(new Error("missing"));
    if (reason === "malformed") vi.mocked(invoke).mockResolvedValue("invalid kind");
    if (reason === "open failed") args.onOpenProjectPath.mockRejectedValue(new Error("open failed"));
    renderHook(() => useProjectDrop(args));
    await emit(["/project"]);
    expect(args.setStatus).toHaveBeenCalledWith(expect.stringContaining("Failed to open dropped project:"));
    expect(args.onDropError).toHaveBeenCalledExactlyOnceWith(args.setStatus.mock.calls[0][0]);
    expect(args.projectDropPendingRef.current).toBe(false);
  });

  it("ignores blocked drops and uses the latest state and callback without resubscribing", async () => {
    const args = makeArgs();
    const { rerender } = renderHook((props) => useProjectDrop(props), { initialProps: { ...args, blocked: true } });
    await emit(["/project"]);
    expect(invoke).not.toHaveBeenCalled();
    const onOpenProjectPath = vi.fn().mockResolvedValue(undefined);
    rerender({ ...args, onOpenProjectPath });
    await emit(["/project"]);
    expect(onOpenProjectPath).toHaveBeenCalledOnce();
    expect(args.onOpenProjectPath).not.toHaveBeenCalled();
    expect(subscribe).toHaveBeenCalledOnce();
  });

  it("ignores drops while another project action is pending", async () => {
    const args = makeArgs();
    args.isProjectActionPending.mockReturnValue(true);
    renderHook(() => useProjectDrop(args));
    await emit(["/project"]);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("locks synchronously through classification, confirmation and opening", async () => {
    let classify!: (kind: string) => void;
    let finish!: () => void;
    vi.mocked(invoke).mockReturnValue(new Promise((resolve) => { classify = resolve; }));
    const args = makeArgs();
    args.onOpenProjectPath.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    renderHook(() => useProjectDrop(args));
    await emit(["/first"]);
    await emit(["/second"]);
    expect(invoke).toHaveBeenCalledOnce();
    await act(async () => { classify("folder"); });
    await emit(["/third"]);
    expect(args.onOpenProjectPath).toHaveBeenCalledExactlyOnceWith({ path: "/first", kind: "folder" });
    expect(args.projectDropPendingRef.current).toBe(true);
    await act(async () => { finish(); });
    expect(args.projectDropPendingRef.current).toBe(false);
  });

  it("rechecks blocking after asynchronous classification", async () => {
    let classify!: (kind: string) => void;
    vi.mocked(invoke).mockReturnValue(new Promise((resolve) => { classify = resolve; }));
    const args = makeArgs();
    const { rerender } = renderHook((props) => useProjectDrop(props), { initialProps: args });
    await emit(["/project"]);
    rerender({ ...args, blocked: true });
    await act(async () => { classify("folder"); });
    expect(args.onOpenProjectPath).not.toHaveBeenCalled();
    expect(args.projectDropPendingRef.current).toBe(false);
  });

  it("unlistens on unmount and ignores subsequent events", async () => {
    const args = makeArgs();
    const { unmount } = renderHook(() => useProjectDrop(args));
    await act(async () => {});
    unmount();
    await emit(["/project"]);
    expect(unlisten).toHaveBeenCalledOnce();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("cleans up registration that completes after unmount", async () => {
    let finish!: (cleanup: () => void) => void;
    subscribe.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const { unmount } = renderHook(() => useProjectDrop(makeArgs()));
    unmount();
    await act(async () => { finish(unlisten); });
    expect(unlisten).toHaveBeenCalledOnce();
  });

  it("reports registration failure", async () => {
    subscribe.mockRejectedValue(new Error("listen failed"));
    const args = makeArgs();
    renderHook(() => useProjectDrop(args));
    await act(async () => {});
    expect(args.setStatus).toHaveBeenCalledWith("Project drag and drop unavailable: Error: listen failed");
    expect(args.onDropError).not.toHaveBeenCalled();
  });

  it("blocks further drops until the error dialog is dismissed", async () => {
    const args = makeArgs();
    const { result } = renderHook(() => {
      const dialogs = useDialogState();
      useProjectDrop({
        ...args,
        blocked: dialogs.projectDropErrorOpen,
        onDropError: dialogs.openProjectDropErrorDialog
      });
      return dialogs;
    });
    await emit(["/one", "/two"]);
    expect(result.current.projectDropErrorOpen).toBe(true);
    expect(result.current.projectDropErrorMessage).toBe("Drop one folder or .umz file at a time.");
    await emit(["/project"]);
    expect(invoke).not.toHaveBeenCalled();
    expect(args.setStatus).toHaveBeenCalledOnce();

    act(() => { result.current.handleProjectDropErrorOpenChange(false); });
    expect(result.current.projectDropErrorOpen).toBe(false);
    expect(result.current.projectDropErrorMessage).toBeNull();
    await emit(["/project"]);
    expect(args.onOpenProjectPath).toHaveBeenCalledExactlyOnceWith({ path: "/project", kind: "folder" });
  });
});
