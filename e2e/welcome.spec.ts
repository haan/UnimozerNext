import { test, expect } from "./fixtures/tauriMock";

test.describe("Welcome state", () => {
  test("renders the File menu trigger", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("menubar")).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("menubar").getByText("File", { exact: true })
    ).toBeVisible();
  });

  test("renders the Help menu trigger", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("menubar")).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("menubar").getByText("Help", { exact: true })
    ).toBeVisible();
  });

  test("app root is not empty after load", async ({ page }) => {
    await page.goto("/");
    const root = page.locator("#root");
    await expect(root).not.toBeEmpty({ timeout: 10_000 });
  });
});
