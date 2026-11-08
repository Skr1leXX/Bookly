import type { Page } from "@playwright/test";
import { ACCOUNTS, expect, login, open, openDialog, test } from "./fixtures";

const PAGES = ["/dashboard", "/calendar", "/appointments", "/clients", "/services", "/staff", "/settings"];
const WIDTHS = [
  { name: "phone 375", width: 375, height: 812 },
  { name: "small phone 320", width: 320, height: 640 },
  { name: "tablet 768", width: 768, height: 1024 },
  { name: "laptop 1280", width: 1280, height: 800 },
];

/** The page itself must never scroll sideways; wide tables and the calendar scroll inside their own container. */
async function overflow(page: Page) {
  return page.evaluate(() => ({ page: document.documentElement.scrollWidth - window.innerWidth, inner: window.innerWidth }));
}

test.describe("responsive layout", () => {
  for (const vp of WIDTHS) {
    test(`${vp.name}: no page-level horizontal scroll on any admin page`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await login(page, ACCOUNTS.admin);
      for (const path of PAGES) {
        await open(page, path);
        const o = await overflow(page);
        expect(o.page, `${path} at ${vp.width}px overflows by ${o.page}px`).toBeLessThanOrEqual(0);
      }
    });
  }

  test("phone: the side menu is a drawer that opens, navigates and closes", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await login(page, ACCOUNTS.admin);
    await expect(page.locator("aside")).toBeHidden();
    const burger = page.getByRole("button", { name: "Открыть меню" });
    await expect(burger).toBeVisible();
    await expect(async () => {
      await burger.click();
      await expect(page.getByRole("dialog").getByRole("link", { name: "Клиенты" })).toBeVisible({ timeout: 1500 });
    }).toPass();
    for (const item of ["Дашборд", "Календарь", "Записи", "Клиенты", "Услуги", "Сотрудники", "Настройки"]) await expect(page.getByRole("dialog").getByRole("link", { name: item })).toBeVisible();
    await page.getByRole("dialog").getByRole("link", { name: "Клиенты" }).click();
    await expect(page).toHaveURL(/\/clients/);
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("desktop: the sidebar is always visible and there is no burger", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await login(page, ACCOUNTS.admin);
    await expect(page.locator("aside").getByRole("link", { name: "Календарь" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Открыть меню" })).toBeHidden();
  });

  test("phone: dialogs fit the screen and their buttons are reachable", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await login(page, ACCOUNTS.admin);
    await open(page, "/staff");
    const dialog = await openDialog(page, page.getByRole("button", { name: "Добавить специалиста" }), "Новый специалист");
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(375);
    expect(box.height).toBeLessThanOrEqual(667);
    await dialog.getByRole("button", { name: "Добавить" }).scrollIntoViewIfNeeded();
    await expect(dialog.getByRole("button", { name: "Добавить" })).toBeInViewport();
    expect((await overflow(page)).page).toBeLessThanOrEqual(0);
  });

  test("phone: the public booking page fits at every step", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await open(page, "/book/lavanda-demo");
    expect((await overflow(page)).page, "step 1").toBeLessThanOrEqual(0);
    await page.getByRole("button", { name: /Женская стрижка/ }).click();
    expect((await overflow(page)).page, "step 2").toBeLessThanOrEqual(0);
    await page.getByRole("button", { name: /Любой специалист/ }).click();
    await expect(page.getByRole("heading", { name: "Выберите дату и время" })).toBeVisible();
    expect((await overflow(page)).page, "step 3").toBeLessThanOrEqual(0);
  });
});
