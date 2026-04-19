import { test, expect } from "./fixtures/tauriMock";

test.describe("App menubar", () => {
  test("shows Edit menu trigger in the menubar", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("menubar")).toBeVisible({ timeout: 10_000 });

    await expect(
      page.getByRole("menubar").getByText("Edit", { exact: true })
    ).toBeVisible({ timeout: 5_000 });
  });

  test("shows all expected top-level menus", async ({ page }) => {
    await page.goto("/");
    const menubar = page.getByRole("menubar");
    await expect(menubar).toBeVisible({ timeout: 10_000 });

    for (const label of ["File", "Edit", "View", "Diagram"]) {
      await expect(menubar.getByText(label, { exact: true })).toBeVisible();
    }
  });
});
