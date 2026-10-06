import { test, expect } from "./fixtures/tauriMock";

for (const newName of ["Test", "Renamed"]) {
  test(`keeps the editor usable after renaming test to ${newName}`, async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("menubar")).toBeVisible();
    await page.evaluate(() => {
      // Mock disk/parser IPC, while exercising the real React and Monaco lifecycle.
      const root = "C:\\rename-project";
      const files = new Map<string, string>();
      const internals = (window as unknown as {
        __TAURI_INTERNALS__: { invoke: (cmd: string, args: Record<string, string>) => Promise<unknown> };
      }).__TAURI_INTERNALS__;
      const originalInvoke = internals.invoke;
      internals.invoke = async (cmd, args) => {
        switch (cmd) {
          case "create_scratch_project":
            return { projectRoot: root, projectName: "rename-project" };
          case "list_project_tree":
            return {
              name: "rename-project", path: root, kind: "dir",
              children: Array.from(files.keys()).filter((path) => path.endsWith(".java"))
                .map((path) => ({ name: path.split("\\").at(-1), path, kind: "file" }))
            };
          case "read_text_file":
            if (!files.has(args.path)) throw new Error("File not found");
            return files.get(args.path);
          case "write_text_file":
            files.set(args.path, args.contents);
            return null;
          case "resolve_file_uri":
            return `file:///${args.path.replace(/\\/g, "/")}`;
          case "parse_uml_graph":
            return {
              graph: {
                nodes: Array.from(files.entries()).filter(([path]) => path.endsWith(".java"))
                  .map(([path, content]) => {
                    const name = /class\s+(\w+)/.exec(content)![1];
                    return { id: name, name, path, kind: "class", fields: [], methods: [] };
                  }),
                edges: []
              },
              raw: "{}"
            };
          case "rename_class_in_file": {
            const oldPath = args.filePath;
            const newPath = `${root}\\src\\${args.newClassName}.java`;
            const content = files.get(oldPath)!.replace(
              `class ${args.oldClassName}`, `class ${args.newClassName}`
            );
            files.delete(oldPath);
            files.set(newPath, content);
            return { oldPath, newPath, content };
          }
          default:
            return originalInvoke(cmd, args);
        }
      };
    });

    await page.getByRole("menubar").getByText("File", { exact: true }).click();
    await page.getByRole("menuitem", { name: /^New Project/ }).click();
    await page.getByRole("menubar").getByText("Diagram", { exact: true }).click();
    await page.getByRole("menuitem", { name: /Add.*class/i }).click();
    const addDialog = page.getByRole("dialog", { name: "Add a new class" });
    await addDialog.getByRole("textbox").fill("test");
    await addDialog.getByRole("button", { name: "OK", exact: true }).click();
    await expect(addDialog).not.toBeVisible();
    const editorLines = page.locator(".monaco-editor .view-lines");
    await expect(editorLines).toContainText("class test");

    // Type a draft before renaming to check that its contents survive too.
    await editorLines.click();
    await page.keyboard.press("Control+Home");
    await page.keyboard.type("// retained draft", { delay: 50 });
    await page.keyboard.press("Enter");
    await expect(editorLines).toContainText("retained draft");

    await page.locator('[data-uml-node-id="test"]').click({ button: "right" });
    await page.getByRole("menuitem", { name: "Rename class", exact: true }).click();
    const renameDialog = page.getByRole("dialog", { name: "Rename class" });
    await renameDialog.getByRole("textbox").fill(newName);
    await renameDialog.getByRole("button", { name: "Rename", exact: true }).click();
    await expect(renameDialog).not.toBeVisible();
    const renamedNode = page.locator(`[data-uml-node-id="${newName}"]`);
    await expect(renamedNode).toBeVisible();
    await expect(editorLines).toContainText(`class ${newName}`);
    await expect(editorLines).toContainText("retained draft");
    await renamedNode.click();
    await expect(editorLines).toContainText(`class ${newName}`);
    await editorLines.click();
    await page.keyboard.press("Control+Home");
    await page.keyboard.type("// still editable", { delay: 50 });
    await page.keyboard.press("Enter");
    await expect(editorLines).toContainText("still editable");
  });
}
