import { StrictMode, type ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { useLaunchBootstrap } from "../useLaunchBootstrap";

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));

const makeArgs = () => ({
  projectPath: null as string | null,
  startupDebugEnabled: false,
  handleNewProject: vi.fn().mockResolvedValue(undefined),
  handleOpenPackedProjectPath: vi.fn().mockResolvedValue(undefined),
  formatStatus: String,
  trimStatus: (value: string) => value
});

beforeEach(() => { vi.mocked(invoke).mockReset().mockResolvedValue([]); });

describe("startup completion for project drops", () => {
  it("waits for scratch creation to finish even if projectPath changes first", async () => {
    let finish!: () => void;
    const args = makeArgs();
    args.handleNewProject.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    const { result, rerender } = renderHook((props) => useLaunchBootstrap(props), { initialProps: args });
    await waitFor(() => expect(args.handleNewProject).toHaveBeenCalledOnce());
    expect(result.current).toBe(false);
    rerender({ ...args, projectPath: "/scratch" });
    expect(result.current).toBe(false);
    await act(async () => { finish(); });
    expect(result.current).toBe(true);
  });

  it("waits for an archive supplied at launch", async () => {
    vi.mocked(invoke).mockResolvedValue(["/project.umz"]);
    let finish!: () => void;
    const args = makeArgs();
    args.handleOpenPackedProjectPath.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    const { result } = renderHook(() => useLaunchBootstrap(args));
    await waitFor(() => expect(args.handleOpenPackedProjectPath).toHaveBeenCalledOnce());
    expect(result.current).toBe(false);
    expect(args.handleNewProject).not.toHaveBeenCalled();
    await act(async () => { finish(); });
    expect(result.current).toBe(true);
  });

  it("allows recovery after startup fails", async () => {
    const args = makeArgs();
    args.handleNewProject.mockRejectedValue(new Error("startup failed"));
    const { result } = renderHook(() => useLaunchBootstrap(args));
    await waitFor(() => expect(result.current).toBe(true));
  });

  it("does not mark startup complete when a cancelled Strict Mode attempt finishes", async () => {
    let finish!: () => void;
    const args = makeArgs();
    args.handleNewProject.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;
    const { result } = renderHook(() => useLaunchBootstrap(args), { wrapper });
    await waitFor(() => expect(args.handleNewProject).toHaveBeenCalledOnce());
    expect(result.current).toBe(false);
    await act(async () => { finish(); });
    expect(result.current).toBe(true);
  });
});
