import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn()
  })
}));

vi.mock("../../services/updater", () => ({
  updaterCheck: vi.fn(),
  updaterInstall: vi.fn(),
  updaterInstallability: vi.fn()
}));

import { useAppUpdater } from "../useAppUpdater";
import {
  updaterCheck,
  updaterInstall,
  updaterInstallability
} from "../../services/updater";

const mockUpdaterCheck = vi.mocked(updaterCheck);
const mockUpdaterInstall = vi.mocked(updaterInstall);
const mockUpdaterInstallability = vi.mocked(updaterInstallability);
const mockSetStatus = vi.fn();

const INSTALLABILITY_SUPPORTED = {
  installable: true,
  reason: null,
  installPath: "/Applications/Unimozer Next.app"
};

const INSTALLABILITY_UNSUPPORTED = {
  installable: false,
  reason: "Self-update is not supported for Linux installations.",
  installPath: "/usr/bin"
};

const UPDATE_SUMMARY = {
  currentVersion: "0.16.0",
  version: "0.17.0",
  notes: "Release notes",
  pubDate: "2026-05-13T00:00:00Z",
  target: "darwin-x86_64",
  downloadUrl: "https://example.com/update.tar.gz"
};

const renderUpdater = () =>
  renderHook(() => useAppUpdater({ channel: "stable", setStatus: mockSetStatus }));

beforeEach(() => {
  mockUpdaterCheck.mockReset();
  mockUpdaterInstall.mockReset();
  mockUpdaterInstallability.mockReset();
  mockSetStatus.mockReset();
});

describe("useAppUpdater", () => {
  it("hides updater menu items and skips checks for unsupported installations", async () => {
    mockUpdaterInstallability.mockResolvedValue(INSTALLABILITY_UNSUPPORTED);

    const { result } = renderUpdater();

    await waitFor(() => {
      expect(mockUpdaterInstallability).toHaveBeenCalledTimes(1);
    });

    expect(result.current.showUpdateMenuItem).toBe(false);
    expect(result.current.updateMenuState).toBe("default");
    expect(mockUpdaterCheck).not.toHaveBeenCalled();
  });

  it("checks for updates and marks the menu available for supported installations", async () => {
    mockUpdaterInstallability.mockResolvedValue(INSTALLABILITY_SUPPORTED);
    mockUpdaterCheck.mockResolvedValue({
      channel: "stable",
      target: "darwin-x86_64",
      update: UPDATE_SUMMARY,
      installability: INSTALLABILITY_SUPPORTED
    });

    const { result } = renderUpdater();

    await waitFor(() => {
      expect(mockUpdaterCheck).toHaveBeenCalledWith("stable");
    });
    await waitFor(() => {
      expect(result.current.showUpdateMenuItem).toBe(true);
      expect(result.current.updateMenuState).toBe("available");
      expect(result.current.updateSummary?.version).toBe("0.17.0");
    });
  });

  it("does not install when no update is available", async () => {
    mockUpdaterInstallability.mockResolvedValue(INSTALLABILITY_SUPPORTED);
    mockUpdaterCheck.mockResolvedValue({
      channel: "stable",
      target: "darwin-x86_64",
      update: null,
      installability: INSTALLABILITY_SUPPORTED
    });

    const { result } = renderUpdater();

    await waitFor(() => {
      expect(mockUpdaterCheck).toHaveBeenCalledWith("stable");
    });

    await act(async () => {
      await result.current.installUpdate();
    });

    expect(mockUpdaterInstall).not.toHaveBeenCalled();
    expect(mockSetStatus).not.toHaveBeenCalled();
  });
});
