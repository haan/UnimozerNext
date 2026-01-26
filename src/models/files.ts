export type FileNode = {
  name: string;
  path: string;
  kind: "file" | "dir";
  children?: FileNode[];
};
