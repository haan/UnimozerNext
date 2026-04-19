import { test, expect } from "./fixtures/tauriMock";

test.describe("App launch", () => {
  test("renders the app root without crashing", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#root")).toBeVisible({ timeout: 10_000 });
  });

  test("loads past the settings-loading screen", async ({ page }) => {
    await page.goto("/");
    // The loading screen shows "Loading settings..." — it should disappear once
    // mock settings are resolved.
    const loadingText = page.getByText("Loading settings...");
    await expect(loadingText).not.toBeVisible({ timeout: 10_000 });
  });

  test("does not show a settings error", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Failed to load settings.")).not.toBeVisible({ timeout: 10_000 });
  });

  test("renders the application menu bar", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("menubar")).toBeVisible({ timeout: 10_000 });
  });
});
