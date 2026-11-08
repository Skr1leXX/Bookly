import path from "node:path";
import { ACCOUNTS, day, expect, login, open, test } from "./fixtures";

// Not part of the regular run: `npm run screenshots` regenerates the pictures used in README.md from the real app.
const OUT = path.join(__dirname, "..", "docs", "screenshots");
const shot = (page: import("@playwright/test").Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`), animations: "disabled" });

test.describe("screenshots", () => {
  test("admin panel", async ({ page }) => {
    await page.setViewportSize({ width: 1360, height: 860 });
    await open(page, "/login");
    await shot(page, "login");

    await login(page, ACCOUNTS.owner);
    await expect(page.getByRole("heading", { name: /Добрый день/ })).toBeVisible();
    await page.waitForTimeout(800); // chart animation
    await shot(page, "dashboard");

    await open(page, "/calendar");
    await page.getByRole("button", { name: "Вперёд" }).click();
    await page.waitForTimeout(300);
    await shot(page, "calendar");

    for (const [p, name] of [["/appointments", "appointments"], ["/clients", "clients"], ["/services", "services"], ["/staff", "staff"], ["/settings", "settings"]] as const) {
      await open(page, p);
      await shot(page, name);
    }
  });

  test("public booking on a phone", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "ru-RU", timezoneId: "Europe/Moscow", extraHTTPHeaders: { "x-forwarded-for": "10.9.9.9" } });
    const page = await context.newPage();
    await open(page, "/book/lavanda-demo");
    await shot(page, "booking-1-service");
    await page.getByRole("button", { name: /Женская стрижка/ }).click();
    await page.getByRole("button", { name: /Анна Ковалёва/ }).click();
    let date = "";
    for (let n = 3; n < 20; n++) {
      const d = new Date(`${day(n)}T00:00:00Z`).getUTCDay();
      if (d === 2) { date = day(n); break; }
    }
    await page.getByLabel("Другая дата").fill(date);
    await expect(page.locator("section button").first()).toBeVisible();
    await shot(page, "booking-2-time");
    await page.locator("section button").nth(2).click();
    await page.getByLabel("Имя").fill("Ирина Петрова");
    await page.getByLabel("Телефон").fill("+7 (900) 123-45-67");
    await page.getByLabel("Email").fill("irina@example.com");
    await page.getByRole("button", { name: "Далее" }).click();
    await expect(page.getByRole("heading", { name: "Ваша запись" })).toBeVisible();
    await shot(page, "booking-3-review");
    await page.waitForTimeout(3200);
    await page.getByRole("button", { name: "Подтвердить запись" }).click();
    await expect(page).toHaveURL(/success/);
    await expect(page.getByRole("heading", { name: /Запись создана/ })).toBeVisible();
    await shot(page, "booking-4-success");
    await context.close();
  });

  test("admin panel on a phone", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "ru-RU", timezoneId: "Europe/Moscow" });
    const page = await context.newPage();
    await login(page, ACCOUNTS.owner);
    await page.waitForTimeout(800);
    await shot(page, "mobile-dashboard");
    await context.close();
  });
});
