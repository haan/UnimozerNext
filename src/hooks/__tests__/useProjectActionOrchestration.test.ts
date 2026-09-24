import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useProjectActionOrchestration } from "../useProjectActionOrchestration";

vi.mock("../useWindowCloseGuard", () => ({ useWindowCloseGuard: () => vi.fn() }));

const makeArgs = () => ({
  busy: false,
  updateInstallBusy: false,
  projectPath: "/current",
  hasPendingProjectChanges: false,
  projectDropPendingRef: { current: true },
  awaitBeforeExit: vi.fn().mockResolvedValue(undefined),
  handleOpenProject: vi.fn().mockResolvedValue(undefined),
  handleOpenFolderProject: vi.fn().mockResolvedValue(undefined),
  handleOpenFolderProjectPath: vi.fn().mockResolvedValue(undefined),
  handleOpenPackedProjectPath: vi.fn().mockResolvedValue(undefined),
  handleOpenRecentProject: vi.fn().mockResolvedValue(undefined),
  handleNewProject: vi.fn().mockResolvedValue(undefined),
  handleSave: vi.fn().mockResolvedValue(true),
  handleSaveAs: vi.fn().mockResolvedValue(true),
  handleZoomIn: vi.fn(), handleZoomOut: vi.fn(), handleZoomReset: vi.fn()
});

describe("dropped project orchestration", () => {
  it.each(["folder", "packed"] as const)("routes %s to the existing path handler", async (kind) => {
    const args = makeArgs();
    const { result } = renderHook(() => useProjectActionOrchestration(args));
    await act(async () => { await result.current.onRequestOpenProjectPath({ path: "/project", kind }); });
    expect(kind === "folder" ? args.handleOpenFolderProjectPath : args.handleOpenPackedProjectPath)
      .toHaveBeenCalledExactlyOnceWith("/project");
    expect(args.handleOpenFolderProject).not.toHaveBeenCalled();
    expect(args.handleOpenProject).not.toHaveBeenCalled();
    expect(args.handleOpenRecentProject).not.toHaveBeenCalled();
  });

  it.each(["busy", "updateInstallBusy"])("rejects a request while %s", async (flag) => {
    const args = { ...makeArgs(), [flag]: true };
    const { result } = renderHook(() => useProjectActionOrchestration(args));
    await act(async () => { await result.current.onRequestOpenProjectPath({ path: "/project", kind: "folder" }); });
    expect(args.handleOpenFolderProjectPath).not.toHaveBeenCalled();
  });
});
