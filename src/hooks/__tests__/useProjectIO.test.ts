import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useProjectIO } from "../useProjectIO";
import { useProjectDrop } from "../useProjectDrop";
import { useDialogState } from "../useDialogState";
import { formatStatusText } from "../../services/status";

const { subscribe } = vi.hoisted(() => ({ subscribe: vi.fn() }));
vi.mock("@tauri-apps/api/webviewWindow", () => ({
  getCurrentWebviewWindow: () => ({ onDragDropEvent: subscribe })
}));

type Listener = (event: { payload: { type: string; paths: string[] } }) => void;
let emit: Listener;
const archivePath = "/selected.umz";

beforeEach(() => {
  subscribe.mockImplementation((callback: Listener) => {
    emit = callback;
    return Promise.resolve(() => {});
  });
  vi.mocked(open).mockReset().mockResolvedValue(archivePath);
  vi.mocked(invoke).mockReset().mockImplementation(async (command, args) => {
    if (command === "classify_project_path") return "packed";
    if (command === "prefer_user_path") return (args as { path: string }).path;
    if (command === "open_packed_project") {
      return { archivePath, workspaceDir: "/workspace", projectRoot: "/next", projectName: "next" };
    }
    if (command === "list_project_tree") return { name: "next", path: "/next", kind: "dir" };
    return undefined;
  });
});

const renderProjectOpen = () => {
  const onDropError = vi.fn();
  const projectDropPendingRef = { current: false };
  const args = {
    projectPath: "/current", projectStorageMode: "folder" as const, packedArchivePath: null,
    openFilePath: null, fileDrafts: {}, lastGoodGraphRef: { current: null },
    setProjectPath: vi.fn(), setProjectStorageMode: vi.fn(), setPackedArchivePath: vi.fn(),
    setTree: vi.fn(), setUmlGraph: vi.fn(), setDiagramState: vi.fn(), setDiagramPath: vi.fn(),
    setOpenFile: vi.fn(), setContent: vi.fn(), setLastSavedContent: vi.fn(), setFileDrafts: vi.fn(),
    setCompileStatus: vi.fn(), setBusy: vi.fn(), setStatus: vi.fn(), clearConsole: vi.fn(),
    resetLsState: vi.fn(), notifyLsOpen: vi.fn(), updateDraftForPath: vi.fn(),
    formatAndSaveUmlFiles: vi.fn().mockResolvedValue(0), formatStatus: formatStatusText,
    recordRecentProject: vi.fn(), removeRecentProject: vi.fn(), onMissingRecentProject: vi.fn(),
    onFolderProjectOpenError: vi.fn(), onPackedProjectOpenError: vi.fn()
  };
  const hook = renderHook(() => {
    const dialogs = useDialogState();
    const io = useProjectIO({
      ...args,
      onPackedProjectOpenError: (message) => {
        args.onPackedProjectOpenError(message);
        dialogs.openPackedProjectErrorDialog(message);
      }
    });
    useProjectDrop({
      blocked: dialogs.packedProjectErrorOpen,
      projectDropPendingRef,
      isProjectActionPending: () => false,
      onOpenProjectPath: (target) => io.handleOpenPackedProjectPath(target.path),
      onDropError, setStatus: args.setStatus, formatStatus: formatStatusText
    });
    return { io, dialogs };
  });
  const openProject = (route: "menu" | "drop") => act(async () => {
    if (route === "menu") await hook.result.current.io.handleOpenProject();
    else emit({ payload: { type: "drop", paths: [archivePath] } });
  });
  return { ...hook, args, onDropError, openProject };
};

describe.each(["menu", "drop"] as const)("packed project errors from %s", (route) => {
  it.each([
    "invalid Zip archive: Could not find EOCD",
    "Access is denied",
    "Archive has no project folder"
  ])("shows one shared dialog for %s", async (detail) => {
    const defaultInvoke = vi.mocked(invoke).getMockImplementation()!;
    vi.mocked(invoke).mockImplementation(async (command, args, options) => {
      if (command === "open_packed_project") throw detail;
      return defaultInvoke(command, args, options);
    });
    const { result, args, onDropError, openProject } = renderProjectOpen();
    await openProject(route);
    expect(args.setStatus).toHaveBeenCalledWith(`Failed to open project: ${detail}`);
    expect(args.onPackedProjectOpenError).toHaveBeenCalledExactlyOnceWith(detail);
    expect(result.current.dialogs.packedProjectErrorOpen).toBe(true);
    expect(result.current.dialogs.packedProjectErrorMessage).toBe(detail);
    expect(args.setProjectPath).not.toHaveBeenCalled();
    expect(onDropError).not.toHaveBeenCalled();
    expect(args.onFolderProjectOpenError).not.toHaveBeenCalled();

    await act(async () => { emit({ payload: { type: "drop", paths: [archivePath] } }); });
    expect(args.onPackedProjectOpenError).toHaveBeenCalledOnce();
    act(() => { result.current.dialogs.handlePackedProjectErrorOpenChange(false); });
    expect(result.current.dialogs.packedProjectErrorOpen).toBe(false);
    expect(result.current.dialogs.packedProjectErrorMessage).toBeNull();
  });

  it("does not show a dialog on a successful open", async () => {
    const { result, args, onDropError, openProject } = renderProjectOpen();
    await openProject(route);
    expect(args.setProjectPath).toHaveBeenCalledWith("/next");
    expect(args.recordRecentProject).toHaveBeenCalledWith({ path: archivePath, kind: "packed" });
    expect(result.current.dialogs.packedProjectErrorOpen).toBe(false);
    expect(args.onPackedProjectOpenError).not.toHaveBeenCalled();
    expect(onDropError).not.toHaveBeenCalled();
  });
});

it("does not show an error when the menu file picker is cancelled", async () => {
  vi.mocked(open).mockResolvedValue(null);
  const { result, args, openProject } = renderProjectOpen();
  await openProject("menu");
  expect(args.setStatus).toHaveBeenCalledWith("Open project cancelled.");
  expect(args.onPackedProjectOpenError).not.toHaveBeenCalled();
  expect(result.current.dialogs.packedProjectErrorOpen).toBe(false);
});
