import { ACCOUNTS, expect, login, open, openDialog, test } from "./fixtures";

// The `monitor` fixture (fixtures.ts) already fails every test on console errors, uncaught exceptions, failed
// requests and HTTP >= 400. This file walks through the whole interface so that all of it is covered at once.
test.describe("console and network", () => {
  test("every admin page, menu and dialog opens without console errors or failed requests", async ({ page }) => {
    await login(page, ACCOUNTS.owner);
    for (const path of ["/dashboard", "/calendar", "/appointments", "/clients", "/services", "/staff", "/settings"]) {
      await open(page, path);
      await expect(page.getByRole("main")).toBeVisible();
    }
    // menus
    await expect(async () => {
      await page.getByRole("button", { name: /Уведомления/ }).click();
      await expect(page.getByRole("menu")).toContainText("Уведомления", { timeout: 1500 });
    }).toPass();
    await page.keyboard.press("Escape");
    await expect(async () => {
      await page.locator("header").getByRole("button", { name: /Владелец/ }).click();
      await expect(page.getByRole("menuitem", { name: "Выйти" })).toBeVisible({ timeout: 1500 });
    }).toPass();
    await page.keyboard.press("Escape");
    // dialogs
    await open(page, "/clients");
    await (await openDialog(page, page.getByRole("button", { name: "Добавить клиента" }), "Новый клиент")).getByRole("button", { name: "Отмена" }).click();
    await open(page, "/services");
    await (await openDialog(page, page.getByRole("button", { name: "Добавить услугу" }), "Новая услуга")).getByRole("button", { name: "Отмена" }).click();
    await open(page, "/staff");
    await (await openDialog(page, page.getByRole("button", { name: "Добавить специалиста" }), "Новый специалист")).getByRole("button", { name: "Отмена" }).click();
    await open(page, "/appointments");
    await (await openDialog(page, page.getByRole("main").getByRole("button", { name: "Новая запись" }), "Новая запись")).getByRole("button", { name: "Отмена" }).click();
    await page.getByRole("button", { name: "Действия с записью" }).first().click();
    await expect(page.getByRole("menuitem", { name: "Изменить" })).toBeVisible();
    await page.keyboard.press("Escape");
    // client page and a calendar week
    await open(page, "/clients");
    await page.getByRole("link", { name: /Юлия Калинина/ }).click();
    await expect(page.getByRole("heading", { name: "Юлия Калинина" })).toBeVisible();
    await open(page, "/calendar");
    await page.getByRole("button", { name: "День", exact: true }).click();
    await page.getByRole("button", { name: "Вперёд" }).click();
  });

  test("the staff role walks through its pages without errors", async ({ page }) => {
    await login(page, ACCOUNTS.staff);
    for (const path of ["/dashboard", "/calendar", "/appointments", "/clients", "/services", "/staff"]) {
      await open(page, path);
      await expect(page.getByRole("main")).toBeVisible();
    }
  });

  test("public pages load without errors", async ({ page }) => {
    for (const path of ["/login", "/register", "/book/lavanda-demo", "/book/borodach-demo"]) {
      await open(page, path);
      await expect(page.locator("body")).not.toBeEmpty();
    }
  });
});
