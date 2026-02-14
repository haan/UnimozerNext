import type { RecentProjectEntry, RecentProjectKind } from "../models/settings";

const WINDOWS_DRIVE_ROOT_PATTERN = /^[A-Za-z]:[\\/]?$/;
const UNC_ROOT_PATTERN = /^\\\\[^\\/]+[\\/][^\\/]+[\\/]?$/;

const isLikelyWindowsPath = (path: string) =>
  path.includes("\\") ||
  path.startsWith("\\\\") ||
  path.startsWith("//") ||
  /^[A-Za-z]:/.test(path);

const normalizeFolderPath = (path: string) => {
  if (path === "/" || WINDOWS_DRIVE_ROOT_PATTERN.test(path) || UNC_ROOT_PATTERN.test(path)) {
    return path;
  }
  return path.replace(/[\\/]+$/, "");
};

export const normalizeRecentPath = (path: string, kind: RecentProjectKind) => {
  const trimmed = path.trim();
  if (!trimmed) {
    return trimmed;
  }
  return kind === "folder" ? normalizeFolderPath(trimmed) : trimmed;
};

export const recentEntryKey = (entry: RecentProjectEntry) => {
  const normalizedPath = normalizeRecentPath(entry.path, entry.kind);
  const pathKey = isLikelyWindowsPath(normalizedPath)
    ? normalizedPath.toLowerCase()
    : normalizedPath;
  return `${entry.kind}:${pathKey}`;
};

export const upsertRecentProject = (
  list: RecentProjectEntry[],
  entry: RecentProjectEntry,
  max = 10
) => {
  const normalizedPath = normalizeRecentPath(entry.path, entry.kind);
  if (!normalizedPath) {
    return list;
  }
  const normalizedEntry: RecentProjectEntry = {
    path: normalizedPath,
    kind: entry.kind
  };
  const key = recentEntryKey(normalizedEntry);
  const withoutExisting = list.filter((item) => recentEntryKey(item) !== key);
  return [normalizedEntry, ...withoutExisting].slice(0, max);
};

export const removeRecentProject = (list: RecentProjectEntry[], entry: RecentProjectEntry) => {
  const key = recentEntryKey(entry);
  return list.filter((item) => recentEntryKey(item) !== key);
};
