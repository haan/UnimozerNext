import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import type {
  UpdateChannel,
  UpdateInstallability,
  UpdateSummary
} from "../services/updater";
import { updaterCheck, updaterInstall, updaterInstallability } from "../services/updater";
import { trimStatusText } from "../services/status";

type UseAppUpdaterArgs = {
  channel: UpdateChannel;
  setStatus: (status: string) => void;
};

type UpdateMenuState = "default" | "checking" | "available" | "installing";

type UseAppUpdaterResult = {
  showUpdateMenuItem: boolean;
  updateMenuState: UpdateMenuState;
  updateAvailableOpen: boolean;
  updateInstallBusy: boolean;
  updateSummary: UpdateSummary | null;
  blockedReason: string | null;
  checkForUpdates: () => void;
  openUpdateDialog: () => void;
  handleUpdateAvailableOpenChange: (open: boolean) => void;
  installUpdate: () => Promise<void>;
};

const BLOCKED_UPDATE_MESSAGE = "This installation cannot self-update on this computer.";
const INSTALLING_UPDATE_MESSAGE =
  "Downloading update... Unimozer Next will close to apply it.";
const INSTALLED_UPDATE_MESSAGE =
  "Update downloaded. Unimozer Next is closing to apply it.";

type VersionIdentifier = number | string;

type ParsedVersion = {
  core: number[];
  prerelease: VersionIdentifier[] | null;
};

type UpdateCandidate = {
  channel: UpdateChannel;
  summary: UpdateSummary;
};

type UpdateUiState = {
  channel: UpdateChannel;
  summary: UpdateSummary | null;
  sourceChannel: UpdateChannel | null;
  blockedReason: string | null;
  availableOpen: boolean;
};

const parseVersion = (value: string): ParsedVersion | null => {
  const normalized = value.trim().split("+")[0];
  if (!normalized) {
    return null;
  }

  const [corePart, prereleasePart] = normalized.split("-", 2);
  if (!corePart) {
    return null;
  }
  const coreSegments = corePart.split(".");
  const core: number[] = [];
  for (const segment of coreSegments) {
    if (!/^\d+$/.test(segment)) {
      return null;
    }
    core.push(Number.parseInt(segment, 10));
  }

  let prerelease: VersionIdentifier[] | null = null;
  if (prereleasePart) {
    prerelease = prereleasePart
      .split(".")
      .filter((segment) => segment.length > 0)
      .map((segment) => (/^\d+$/.test(segment) ? Number.parseInt(segment, 10) : segment));
  }

  return { core, prerelease };
};

const compareIdentifiers = (left: VersionIdentifier, right: VersionIdentifier): number => {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  if (typeof left === "number") {
    return -1;
  }
  if (typeof right === "number") {
    return 1;
  }
  return left.localeCompare(right);
};

const compareParsedVersions = (left: ParsedVersion, right: ParsedVersion): number => {
  const coreLen = Math.max(left.core.length, right.core.length);
  for (let index = 0; index < coreLen; index += 1) {
    const leftPart = left.core[index] ?? 0;
    const rightPart = right.core[index] ?? 0;
    if (leftPart !== rightPart) {
      return leftPart - rightPart;
    }
  }

  const leftPre = left.prerelease;
  const rightPre = right.prerelease;
  if (!leftPre && !rightPre) {
    return 0;
  }
  if (!leftPre) {
    return 1;
  }
  if (!rightPre) {
    return -1;
  }

  const preLen = Math.max(leftPre.length, rightPre.length);
  for (let index = 0; index < preLen; index += 1) {
    const leftPart = leftPre[index];
    const rightPart = rightPre[index];
    if (leftPart === undefined) {
      return -1;
    }
    if (rightPart === undefined) {
      return 1;
    }
    const cmp = compareIdentifiers(leftPart, rightPart);
    if (cmp !== 0) {
      return cmp;
    }
  }
  return 0;
};

const compareVersionStrings = (left: string, right: string): number => {
  const leftParsed = parseVersion(left);
  const rightParsed = parseVersion(right);
  if (leftParsed && rightParsed) {
    return compareParsedVersions(leftParsed, rightParsed);
  }
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
};

const pickAheadUpdate = (candidates: UpdateCandidate[]): UpdateCandidate | null => {
  if (candidates.length === 0) {
    return null;
  }
  return candidates.reduce((best, candidate) => {
    const cmp = compareVersionStrings(candidate.summary.version, best.summary.version);
    if (cmp > 0) {
      return candidate;
    }
    if (cmp === 0 && best.channel !== "stable" && candidate.channel === "stable") {
      // Deterministic tie-breaker: prefer stable when versions are equal.
      return candidate;
    }
    return best;
  });
};

const createEmptyUpdateUiState = (channel: UpdateChannel): UpdateUiState => ({
  channel,
  summary: null,
  sourceChannel: null,
  blockedReason: null,
  availableOpen: false
});

export const useAppUpdater = ({
  channel,
  setStatus
}: UseAppUpdaterArgs): UseAppUpdaterResult => {
  const [updaterSupport, setUpdaterSupport] = useState<"pending" | "enabled" | "disabled">(
    "pending"
  );
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [updateUiState, setUpdateUiState] = useState<UpdateUiState>(() =>
    createEmptyUpdateUiState(channel)
  );
  const activeCheckTokenRef = useRef(0);
  const currentUpdateUiState =
    updaterSupport === "enabled" && updateUiState.channel === channel
      ? updateUiState
      : createEmptyUpdateUiState(channel);
  const updateSummary = currentUpdateUiState.summary;
  const updateSourceChannel = currentUpdateUiState.sourceChannel;
  const blockedReason = currentUpdateUiState.blockedReason;
  const updateAvailableOpen = currentUpdateUiState.availableOpen;

  useEffect(() => {
    let cancelled = false;
    const detectSupport = async () => {
      try {
        const installability = await updaterInstallability();
        if (cancelled) {
          return;
        }
        setUpdaterSupport(installability.installable ? "enabled" : "disabled");
      } catch {
        if (cancelled) {
          return;
        }
        setUpdaterSupport("disabled");
      }
    };
    void detectSupport();
    return () => {
      cancelled = true;
    };
  }, []);

  const performCheck = useCallback(
    async (manual: boolean) => {
      if (updaterSupport !== "enabled") {
        return;
      }
      const checkToken = Date.now();
      activeCheckTokenRef.current = checkToken;
      setChecking(true);

      try {
        const channelsToCheck: UpdateChannel[] =
          channel === "prerelease" ? ["prerelease", "stable"] : [channel];
        const results = await Promise.allSettled(
          channelsToCheck.map(async (candidateChannel) => ({
            channel: candidateChannel,
            result: await updaterCheck(candidateChannel)
          }))
        );

        if (activeCheckTokenRef.current !== checkToken) {
          return;
        }

        let installability: UpdateInstallability | null = null;
        const candidates: UpdateCandidate[] = [];
        const errors: string[] = [];

        for (const settled of results) {
          if (settled.status === "fulfilled") {
            const { channel: checkedChannel, result } = settled.value;
            if (!installability) {
              installability = result.installability;
            }
            const update = result.update ?? null;
            if (update) {
              candidates.push({
                channel: checkedChannel,
                summary: update
              });
            }
            continue;
          }
          errors.push(
            settled.reason instanceof Error ? settled.reason.message : String(settled.reason)
          );
        }

        if (!installability) {
          throw new Error(errors[0] ?? "Could not check for updates.");
        }

        if (!installability.installable) {
          const reason = installability.reason ?? BLOCKED_UPDATE_MESSAGE;
          setUpdateUiState({
            channel,
            summary: null,
            sourceChannel: null,
            blockedReason: reason,
            availableOpen: false
          });
          if (manual) {
            setStatus(BLOCKED_UPDATE_MESSAGE);
            toast(BLOCKED_UPDATE_MESSAGE, {
              description: trimStatusText(reason, 220)
            });
          }
          return;
        }

        const selected = pickAheadUpdate(candidates);
        if (selected) {
          setUpdateUiState({
            channel,
            summary: selected.summary,
            sourceChannel: selected.channel,
            blockedReason: null,
            availableOpen: manual
          });
          if (manual) {
            setStatus(`Update ${selected.summary.version} is available.`);
          }
          return;
        }

        setUpdateUiState(createEmptyUpdateUiState(channel));
        if (manual) {
          setStatus("You are up to date.");
          toast.success("You are up to date.");
        }
      } catch (error) {
        if (activeCheckTokenRef.current !== checkToken) {
          return;
        }
        setUpdateUiState({
          channel,
          summary: null,
          sourceChannel: null,
          blockedReason: error instanceof Error ? error.message : String(error),
          availableOpen: false
        });
        if (manual) {
          setStatus("Could not check for updates.");
          toast.error("Could not check for updates.");
        }
      } finally {
        if (activeCheckTokenRef.current === checkToken) {
          setChecking(false);
        }
      }
    },
    [channel, setStatus, updaterSupport]
  );

  useEffect(() => {
    if (updaterSupport !== "enabled") {
      return;
    }
    // Defer to avoid calling setChecking(true) synchronously inside an effect body.
    const checkHandle = window.setTimeout(() => {
      void performCheck(false);
    }, 0);
    return () => {
      window.clearTimeout(checkHandle);
    };
  }, [channel, performCheck, updaterSupport]);

  const checkForUpdates = useCallback(() => {
    if (updaterSupport !== "enabled" || checking || installing) {
      return;
    }
    void performCheck(true);
  }, [checking, installing, performCheck, updaterSupport]);

  const openUpdateDialog = useCallback(() => {
    if (updaterSupport !== "enabled" || !updateSummary) {
      return;
    }
    setUpdateUiState((prev) =>
      prev.channel === channel ? { ...prev, availableOpen: true } : prev
    );
  }, [channel, updateSummary, updaterSupport]);

  const handleUpdateAvailableOpenChange = useCallback((open: boolean) => {
    setUpdateUiState((prev) =>
      prev.channel === channel ? { ...prev, availableOpen: open } : prev
    );
  }, [channel]);

  const installUpdate = useCallback(async () => {
    if (updaterSupport !== "enabled" || installing || !updateSummary) {
      return;
    }
    setStatus(INSTALLING_UPDATE_MESSAGE);
    setInstalling(true);
    try {
      const installChannel = updateSourceChannel ?? channel;
      const result = await updaterInstall(installChannel);
      const message = result.message?.trim() || INSTALLED_UPDATE_MESSAGE;
      if (result.installed) {
        setStatus(message);
        toast.success(message);
        setUpdateUiState(createEmptyUpdateUiState(channel));
      } else {
        setStatus(message);
        toast.error(message);
      }
    } catch (error) {
      const message = trimStatusText(
        error instanceof Error ? error.message : String(error),
        220
      );
      setStatus("Update installation failed.");
      toast.error(`Update installation failed: ${message}`);
    } finally {
      setInstalling(false);
    }
  }, [channel, installing, setStatus, updateSourceChannel, updateSummary, updaterSupport]);

  const updateMenuState = useMemo<UpdateMenuState>(() => {
    if (installing) {
      return "installing";
    }
    if (checking) {
      return "checking";
    }
    if (updateSummary) {
      return "available";
    }
    return "default";
  }, [checking, installing, updateSummary]);

  return {
    showUpdateMenuItem: updaterSupport === "enabled",
    updateMenuState,
    updateAvailableOpen,
    updateInstallBusy: installing,
    updateSummary,
    blockedReason,
    checkForUpdates,
    openUpdateDialog,
    handleUpdateAvailableOpenChange,
    installUpdate
  };
};
