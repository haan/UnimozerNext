export const basename = (path: string) => {
  const normalized = path.replace(/[\\/]+$/, "");
  const parts = normalized.split(/[\\/]/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : path;
};

export const joinPath = (root: string, file: string) => {
  const separator = root.includes("\\") ? "\\" : "/";
  return `${root.replace(/[\\/]+$/, "")}${separator}${file}`;
};

export const toRelativePath = (fullPath: string, rootPath: string) => {
  const normalizedRoot = rootPath.replace(/[\\/]+$/, "").toLowerCase();
  const normalizedFull = fullPath.toLowerCase();
  if (normalizedFull.startsWith(normalizedRoot)) {
    const sliced = fullPath.slice(normalizedRoot.length).replace(/^[\\/]/, "");
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
