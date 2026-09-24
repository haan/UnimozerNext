import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useProjectActionFlow, type ProjectAction } from "../useProjectActionFlow";

const dropped: ProjectAction = { type: "openPath", target: { path: "/first.umz", kind: "packed" } };
const makeArgs = () => ({
  busy: false,
  projectPath: "/current",
  hasPendingProjectChanges: true,
  projectDropPendingRef: { current: true },
  onOpenProjectPath: vi.fn().mockResolvedValue(undefined),
  onOpenProject: vi.fn(),
  onOpenFolderProject: vi.fn(),
  onOpenRecentProject: vi.fn(),
  onNewProject: vi.fn(),
  onExit: vi.fn(),
  onSave: vi.fn().mockResolvedValue(true),
  onZoomIn: vi.fn(),
  onZoomOut: vi.fn(),
  onZoomReset: vi.fn()
});

describe("project path actions", () => {
  it("opens a clean project directly without a picker or confirmation", async () => {
    const args = { ...makeArgs(), hasPendingProjectChanges: false };
    const { result } = renderHook(() => useProjectActionFlow(args));
    await act(async () => { await result.current.requestProjectAction(dropped); });
    expect(args.onOpenProjectPath).toHaveBeenCalledWith(dropped.target);
    expect(args.onOpenProject).not.toHaveBeenCalled();
    expect(result.current.confirmProjectActionOpen).toBe(false);
    expect(result.current.isProjectActionPending()).toBe(false);
  });

  it.each(["save", "discard"])("opens the retained target after %s", async (choice) => {
    const args = makeArgs();
    const { result } = renderHook(() => useProjectActionFlow(args));
    let finished = false;
    act(() => { void result.current.requestProjectAction(dropped).then(() => { finished = true; }); });
    expect(result.current.confirmProjectActionOpen).toBe(true);
    expect(args.onOpenProjectPath).not.toHaveBeenCalled();
    expect(finished).toBe(false);
    await act(async () => {
      if (choice === "save") await result.current.saveAndConfirmProjectAction();
      else result.current.confirmProjectAction();
    });
    expect(args.onOpenProjectPath).toHaveBeenCalledExactlyOnceWith(dropped.target);
    expect(args.onSave).toHaveBeenCalledTimes(choice === "save" ? 1 : 0);
    expect(finished).toBe(true);
    expect(result.current.pendingProjectAction).toBeNull();
  });

  it("cancels without opening and releases request ownership", async () => {
    const args = makeArgs();
    const { result } = renderHook(() => useProjectActionFlow(args));
    let finished = false;
    act(() => { void result.current.requestProjectAction(dropped).then(() => { finished = true; }); });
    await act(async () => { result.current.onConfirmProjectActionOpenChange(false); });
    expect(args.onOpenProjectPath).not.toHaveBeenCalled();
    expect(finished).toBe(true);
    expect(result.current.isProjectActionPending()).toBe(false);
    expect(result.current.pendingProjectAction).toBeNull();
  });

  it("keeps the original confirmation pending when saving fails or is cancelled", async () => {
    const args = makeArgs();
    args.onSave.mockResolvedValue(false);
    const { result } = renderHook(() => useProjectActionFlow(args));
    act(() => { void result.current.requestProjectAction(dropped); });
    await act(async () => { await result.current.saveAndConfirmProjectAction(); });
    expect(args.onOpenProjectPath).not.toHaveBeenCalled();
    expect(result.current.pendingProjectAction).toEqual(dropped);
    expect(result.current.confirmProjectActionOpen).toBe(true);
    expect(result.current.projectActionConfirmBusy).toBe(false);
    expect(result.current.isProjectActionPending()).toBe(true);
    args.onSave.mockResolvedValue(true);
    await act(async () => { await result.current.saveAndConfirmProjectAction(); });
    expect(args.onOpenProjectPath).toHaveBeenCalledWith(dropped.target);
  });

  it("prevents replacing a drop with another drop, menu action, shortcut, or close", async () => {
    const args = makeArgs();
    const { result } = renderHook(() => useProjectActionFlow(args));
    act(() => {
      void result.current.requestProjectAction(dropped);
      void result.current.requestProjectAction({ type: "openPath", target: { path: "/second", kind: "folder" } });
      for (const action of ["open", "openFolder", "openRecent", "new", "exit"] as const) {
        void result.current.requestProjectAction(action);
      }
      window.dispatchEvent(new KeyboardEvent("keydown", { ctrlKey: true, key: "o" }));
      window.dispatchEvent(new KeyboardEvent("keydown", { ctrlKey: true, key: "s" }));
    });
    expect(result.current.pendingProjectAction).toEqual(dropped);
    await act(async () => { result.current.confirmProjectAction(); });
    expect(args.onOpenProjectPath).toHaveBeenCalledExactlyOnceWith(dropped.target);
    expect(args.onOpenProject).not.toHaveBeenCalled();
    expect(args.onExit).not.toHaveBeenCalled();
    expect(args.onSave).not.toHaveBeenCalled();
  });

  it("blocks other actions during classification before confirmation exists", async () => {
    const args = { ...makeArgs(), hasPendingProjectChanges: false };
    const { result } = renderHook(() => useProjectActionFlow(args));
    await act(async () => { await result.current.requestProjectAction("open"); });
    expect(args.onOpenProject).not.toHaveBeenCalled();
  });

  it("keeps ownership until opening completes and prevents duplicate confirmation", async () => {
    let finish!: () => void;
    const args = makeArgs();
    args.onOpenProjectPath.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    const { result } = renderHook(() => useProjectActionFlow(args));
    act(() => { void result.current.requestProjectAction(dropped); });
    act(() => {
      result.current.confirmProjectAction();
      result.current.confirmProjectAction();
      result.current.onConfirmProjectActionOpenChange(false);
    });
    expect(result.current.isProjectActionPending()).toBe(true);
    expect(args.onOpenProjectPath).toHaveBeenCalledOnce();
    await act(async () => { finish(); });
    expect(result.current.isProjectActionPending()).toBe(false);
  });

  it("releases ownership when opening rejects", async () => {
    const args = { ...makeArgs(), hasPendingProjectChanges: false };
    args.onOpenProjectPath.mockRejectedValue(new Error("open failed"));
    const { result } = renderHook(() => useProjectActionFlow(args));
    await act(async () => {
      await expect(result.current.requestProjectAction(dropped)).rejects.toThrow("open failed");
    });
    expect(result.current.isProjectActionPending()).toBe(false);
  });

  it("blocks drops during an existing file picker", async () => {
    let finish!: () => void;
    const args = { ...makeArgs(), hasPendingProjectChanges: false, projectDropPendingRef: { current: false } };
    args.onOpenProject.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    const { result } = renderHook(() => useProjectActionFlow(args));
    act(() => { void result.current.requestProjectAction("open"); });
    expect(result.current.isProjectActionPending()).toBe(true);
    await act(async () => { await result.current.requestProjectAction(dropped); });
    expect(args.onOpenProjectPath).not.toHaveBeenCalled();
    await act(async () => { finish(); });
    expect(result.current.isProjectActionPending()).toBe(false);
  });
});
