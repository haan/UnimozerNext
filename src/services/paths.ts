export const basename = (path: string) => {
  const normalized = path.replace(/[\\/]+$/, "");
  const parts = normalized.split(/[\\/]/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : path;
};

export const joinPath = (root: string, file: string) => {
  const separator = root.includes("\\") ? "\\" : "/";
  return `${root.replace(/[\\/]+$/, "")}${separator}${file}`;
};

// Windows extended-length path prefix (for example `\\?\C:\...`).
const WINDOWS_DEVICE_PREFIX = "\\\\?\\";

// Windows UNC extended-length prefix (for example `\\?\UNC\server\share\...`).
const WINDOWS_UNC_DEVICE_PREFIX = "\\\\?\\UNC\\";

// Converts Windows extended-length paths to display-friendly paths.
export const toDisplayPath = (path: string) => {
  if (path.startsWith(WINDOWS_UNC_DEVICE_PREFIX)) {
    return `\\\\${path.slice(WINDOWS_UNC_DEVICE_PREFIX.length)}`;
  }
  if (path.startsWith(WINDOWS_DEVICE_PREFIX)) {
    return path.slice(WINDOWS_DEVICE_PREFIX.length);
  }
  return path;
};

const isLikelyWindowsPath = (path: string) =>
  /^[A-Za-z]:[\\/]/.test(path) ||
  path.startsWith("\\\\") ||
  path.startsWith("//") ||
  path.startsWith("\\\\?\\");

export const toRelativePath = (fullPath: string, rootPath: string) => {
  const normalizedRoot = rootPath.replace(/[\\/]+$/, "");
  if (!normalizedRoot) {
    return fullPath;
  }

  const windowsLike = isLikelyWindowsPath(fullPath) || isLikelyWindowsPath(normalizedRoot);
  const separator = windowsLike ? "\\" : "/";
  const alignedFull = windowsLike ? fullPath.replace(/\//g, "\\") : fullPath.replace(/\\/g, "/");
  const alignedRoot = windowsLike
    ? normalizedRoot.replace(/\//g, "\\")
    : normalizedRoot.replace(/\\/g, "/");

  const compareFull = windowsLike ? alignedFull.toLowerCase() : alignedFull;
  const compareRoot = windowsLike ? alignedRoot.toLowerCase() : alignedRoot;
  const hasMatchingPrefix =
    compareFull === compareRoot || compareFull.startsWith(`${compareRoot}${separator}`);

  if (hasMatchingPrefix) {
    const sliced = alignedFull.slice(alignedRoot.length).replace(/^[\\/]/, "");
    return sliced.length ? sliced : fullPath;
  }

  return fullPath;
};

export const toFqnFromPath = (root: string, srcRoot: string, filePath: string) => {
  const srcPath = joinPath(root, srcRoot);
  const relative = toRelativePath(filePath, srcPath);
  const trimmed = relative === filePath ? basename(filePath) : relative;
  return trimmed.replace(/\.java$/i, "").replace(/[\\/]+/g, ".");
};
