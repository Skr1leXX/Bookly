import { ACCOUNTS, expect, login, logout, open, PASSWORD, test, uid } from "./fixtures";

const PROTECTED = ["/dashboard", "/calendar", "/appointments", "/clients", "/services", "/staff", "/settings"];

test.describe("authorization", () => {
  test("protected pages redirect an anonymous visitor to the login page", async ({ page }) => {
    for (const path of PROTECTED) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/login$/);
    }
    // the CSV export is protected too
    const r = await page.request.get("/api/export/clients", { maxRedirects: 0 });
    expect([307, 308]).toContain(r.status());
  });

  test("the public booking page and the login/register pages stay open", async ({ page }) => {
    for (const path of ["/login", "/register", "/book/lavanda-demo"]) {
      const r = await page.goto(path);
      expect(r?.status(), path).toBe(200);
      await expect(page).toHaveURL(new RegExp(path.replace(/\//g, "\\/") + "$"));
    }
  });

  test("login: wrong password shows one neutral error and stays on the page", async ({ page }) => {
    await open(page, "/login");
    await page.getByLabel("Email").fill(ACCOUNTS.owner);
    await page.getByLabel("Пароль").fill("definitely-wrong");
    await page.getByRole("button", { name: "Войти" }).click();
    await expect(page.locator("form").getByRole("alert")).toHaveText("Неверный email или пароль");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByLabel("Email")).toHaveValue(ACCOUNTS.owner); // a failed sign-in does not wipe the form
    // an unknown email gives exactly the same message (no account enumeration)
    await page.getByLabel("Email").fill(`nobody-${uid()}@example.com`);
    await page.getByRole("button", { name: "Войти" }).click();
    await expect(page.locator("form").getByRole("alert")).toHaveText("Неверный email или пароль");
  });

  test("login: empty fields are stopped by the browser before any request", async ({ page }) => {
    await open(page, "/login");
    let requests = 0;
    page.on("request", (r) => r.method() === "POST" && requests++);
    await page.getByRole("button", { name: "Войти" }).click();
    await expect(page.getByLabel("Email")).toHaveJSProperty("validity.valueMissing", true);
    expect(requests).toBe(0);
  });

  test("login → dashboard → logout → protected pages are closed again", async ({ page }) => {
    await login(page, ACCOUNTS.owner);
    await expect(page.getByRole("heading", { name: /Добрый день, Алина/ })).toBeVisible();
    await expect(page.locator("header")).toContainText("Владелец");
    await logout(page);
    await page.goto("/clients");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("a signed-in user is sent from /login to the dashboard", async ({ page }) => {
    await login(page, ACCOUNTS.admin);
    await page.goto("/login");
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("registration creates an account, an organization and the owner role", async ({ page }) => {
    const email = `owner-${uid()}@example.com`;
    await open(page, "/register");
    await page.getByLabel("Ваше имя").fill("Мария Новикова");
    await page.getByLabel("Название студии").fill("Студия Тест");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel(/Пароль/).fill(PASSWORD);
    await page.getByRole("button", { name: "Зарегистрироваться" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { name: /Добрый день, Мария/ })).toBeVisible();
    await expect(page.locator("header")).toContainText("Владелец");
    // a brand-new organization starts empty and every page copes with that
    await expect(page.getByText("Ближайших записей нет")).toBeVisible();
    for (const [path, text] of [["/clients", "Клиентов пока нет"], ["/services", "Услуг пока нет"], ["/staff", "Специалистов пока нет"], ["/appointments", "Записей пока нет"]]) {
      await page.goto(path);
      await expect(page.getByText(text), path).toBeVisible();
    }
    await page.goto("/settings");
    await expect(page.getByLabel("Название компании")).toHaveValue("Студия Тест");
    await expect(page.getByText(/\/book\/studiya|\/book\/org-/)).toBeVisible();
    // and the new owner can sign in again with the same password
    await logout(page);
    await login(page, email);
  });

  test("registration validates the form and refuses a duplicate e-mail", async ({ page }) => {
    await open(page, "/register");
    await page.getByLabel("Ваше имя").fill("X");
    await page.getByLabel("Название студии").fill("Y");
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByLabel(/Пароль/).fill("12345678");
    await page.getByRole("button", { name: "Зарегистрироваться" }).click();
    await expect(page.getByLabel("Email")).toHaveJSProperty("validity.typeMismatch", true); // stopped by the browser

    await page.getByLabel("Email").fill(ACCOUNTS.owner);
    await page.getByLabel(/Пароль/).fill("short");
    await page.getByRole("button", { name: "Зарегистрироваться" }).click();
    await expect(page.locator("form").getByRole("alert")).toContainText("не короче 8");

    await page.getByLabel(/Пароль/).fill(PASSWORD);
    await page.getByRole("button", { name: "Зарегистрироваться" }).click();
    await expect(page.locator("form").getByRole("alert")).toContainText("Не удалось создать аккаунт");
    await expect(page).toHaveURL(/\/register/);
  });

  test("roles: staff has no settings and no export; their direct requests are refused", async ({ page }) => {
    await login(page, ACCOUNTS.staff);
    await expect(page.getByRole("navigation").getByRole("link", { name: "Настройки" })).toHaveCount(0);
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goto("/clients");
    await expect(page.getByRole("link", { name: "Экспорт CSV" })).toHaveCount(0);
    expect((await page.request.get("/api/export/clients")).status()).toBe(403);
    await page.goto("/services");
    await expect(page.getByRole("button", { name: "Добавить услугу" })).toHaveCount(0);
  });
});
