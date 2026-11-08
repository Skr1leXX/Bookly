import { ACCOUNTS, expect, login, open, openDialog, test, uid } from "./fixtures";
import { adminRest, createClient, rowOf } from "./helpers";

test.describe("clients", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ACCOUNTS.admin);
  });

  test("create: validation messages, then the client is saved to the database", async ({ page }) => {
    const name = `Клиент ${uid()}`;
    await open(page, "/clients");
    const dialog = await openDialog(page, page.getByRole("button", { name: "Добавить клиента" }), "Новый клиент");

    await dialog.getByRole("button", { name: "Добавить" }).click();
    await expect(dialog.getByText("Укажите имя")).toBeVisible();
    await expect(dialog.getByText("Укажите телефон")).toBeVisible();

    await dialog.getByLabel("Имя").fill(name);
    await dialog.getByLabel("Телефон").fill("abc");
    await dialog.getByLabel("Email").fill("broken@");
    await dialog.getByRole("button", { name: "Добавить" }).click();
    await expect(dialog.getByText("Некорректный телефон")).toBeVisible();
    await expect(dialog.getByText("Некорректный email")).toBeVisible();
    // what was typed is still there after a validation error
    await expect(dialog.getByLabel("Имя")).toHaveValue(name);

    await dialog.getByLabel("Телефон").fill("+7 (999) 100-20-30");
    await dialog.getByLabel("Email").fill("ok@example.com");
    await dialog.getByLabel("Заметки").fill("Аллергия на лак");
    await dialog.getByRole("button", { name: "Добавить" }).click();
    await expect(dialog).toBeHidden();

    await expect(rowOf(page, name)).toBeVisible();
    const saved = await adminRest(`clients?select=name,phone,email,note&name=eq.${encodeURIComponent(name)}`);
    expect(saved).toEqual([{ name, phone: "+7 (999) 100-20-30", email: "ok@example.com", note: "Аллергия на лак" }]);
  });

  test("edit: changes are shown and stored", async ({ page }) => {
    const name = `Правка ${uid()}`;
    await createClient(page, name, "+7 (999) 200-00-01");
    await page.getByRole("button", { name: `Изменить: ${name}` }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Редактирование клиента" })).toBeVisible();
    await expect(dialog.getByLabel("Имя")).toHaveValue(name);
    await dialog.getByLabel("Телефон").fill("+7 (999) 200-00-02");
    await dialog.getByLabel("Заметки").fill("VIP");
    await dialog.getByRole("button", { name: "Сохранить" }).click();
    await expect(dialog).toBeHidden();
    await expect(rowOf(page, name)).toContainText("+7 (999) 200-00-02");
    await expect(rowOf(page, name)).toContainText("VIP");
    const [row] = await adminRest(`clients?select=phone,note&name=eq.${encodeURIComponent(name)}`);
    expect(row).toEqual({ phone: "+7 (999) 200-00-02", note: "VIP" });
  });

  test("search by name, phone and e-mail; filters; empty result", async ({ page }) => {
    const tag = uid();
    await createClient(page, `Поиск ${tag}`, "+7 (999) 300-00-03", { email: `find-${tag}@example.com` });
    const search = page.getByPlaceholder("Имя, телефон или email…");
    await search.fill(tag);
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await search.fill("999 300-00-03".replace(/\D/g, ""));
    await expect(rowOf(page, `Поиск ${tag}`)).toBeVisible();
    await search.fill(`find-${tag}@`);
    await expect(page.locator("tbody tr")).toHaveCount(1);

    await search.fill(`нет такого ${uid()}`);
    await expect(page.getByText("Клиенты не найдены")).toBeVisible();
    await search.fill("");

    await page.getByLabel("Фильтр клиентов").selectOption({ label: "Новые (7 дней)" });
    await expect(rowOf(page, `Поиск ${tag}`)).toBeVisible();
    await page.getByLabel("Фильтр клиентов").selectOption({ label: "Без визитов" });
    await expect(rowOf(page, `Поиск ${tag}`)).toBeVisible();
    await page.getByLabel("Фильтр клиентов").selectOption({ label: "Постоянные (3+ визита)" });
    await expect(rowOf(page, `Поиск ${tag}`)).toHaveCount(0);
  });

  test("the search box in the top bar opens the clients page with the query applied", async ({ page }) => {
    await open(page, "/dashboard");
    await page.locator("header").getByPlaceholder("Поиск клиентов…").fill("Миронова");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/clients\?q=/);
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody tr")).toContainText("Елена Миронова");
  });

  test("client page shows contacts and visit history", async ({ page }) => {
    await open(page, "/clients");
    await page.getByRole("link", { name: /Елена Миронова/ }).click();
    await expect(page.getByRole("heading", { name: "Елена Миронова" })).toBeVisible();
    await expect(page.getByText("История посещений")).toBeVisible();
    await expect(page.locator("tbody tr").first()).toBeVisible();
    await open(page, "/clients");
    const name = `Без истории ${uid()}`;
    await createClient(page, name, "+7 (999) 400-00-04");
    await page.getByRole("link", { name }).click();
    await expect(page.getByText("У клиента пока нет записей")).toBeVisible();
  });

  test("delete: cancel keeps the client, confirm removes it from the database", async ({ page }) => {
    const name = `Удалить ${uid()}`;
    await createClient(page, name, "+7 (999) 500-00-05");
    await page.getByRole("button", { name: `Удалить: ${name}` }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("без возможности восстановления");
    await dialog.getByRole("button", { name: "Отмена" }).click();
    await expect(dialog).toBeHidden();
    await expect(rowOf(page, name)).toBeVisible();

    await page.getByRole("button", { name: `Удалить: ${name}` }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Удалить" }).click();
    await expect(rowOf(page, name)).toHaveCount(0);
    expect(await adminRest(`clients?select=id&name=eq.${encodeURIComponent(name)}`)).toEqual([]);
  });

  test("delete from the client page redirects to the list", async ({ page }) => {
    const name = `Со страницы ${uid()}`;
    await createClient(page, name, "+7 (999) 600-00-06");
    await page.getByRole("link", { name }).click();
    await page.getByRole("button", { name: "Удалить" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Удалить" }).click();
    await expect(page).toHaveURL(/\/clients$/);
    await expect(rowOf(page, name)).toHaveCount(0);
  });

  test("CSV export contains the clients and is escaped for spreadsheets", async ({ page }) => {
    const name = `=CMD ${uid()}`;
    await createClient(page, name, "+7 (999) 700-00-07");
    const res = await page.request.get("/api/export/clients");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/csv");
    const csv = await res.text();
    expect(csv.startsWith("﻿Имя;Телефон;Email")).toBe(true);
    expect(csv).toContain(`'${name}`); // a leading "=" would run as a formula in Excel
    expect(csv).toContain("Елена Миронова");
  });
});
