import { expect, test as base, type Locator, type Page } from "@playwright/test";

export const SUPABASE = "http://127.0.0.1:54321";
export const PASSWORD = "Password123!"; // demo password from supabase/seed.sql
export const ACCOUNTS = { owner: "alina@bookly.test", admin: "pavel@bookly.test", staff: "anna@bookly.test" } as const;

/**
 * Every test fails on browser console errors, uncaught page errors, failed requests and HTTP >= 400 responses,
 * unless the test lists them in `allowedStatuses` (e.g. the 403 that is the point of a permission test).
 */
export const test = base.extend<{ allowedStatuses: number[]; monitor: void }>({
  allowedStatuses: [[], { option: true }],
  monitor: [
    async ({ page, allowedStatuses }, use) => {
      const problems: string[] = [];
      page.on("console", (m) => {
        if (m.type() === "error") problems.push(`console.error: ${m.text()}`);
      });
      page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
      page.on("requestfailed", (r) => {
        // Navigations aborted by the next click or by a redirect are not failures of the app.
        if (r.failure()?.errorText !== "net::ERR_ABORTED") problems.push(`requestfailed: ${r.method()} ${r.url()} ${r.failure()?.errorText}`);
      });
      page.on("response", (r) => {
        if (r.status() >= 400 && !allowedStatuses.includes(r.status())) problems.push(`HTTP ${r.status()}: ${r.request().method()} ${r.url()}`);
      });
      await use();
      expect(problems, "browser console / network problems").toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

/** Opens a page and waits until the client JavaScript is running: React 19 hydrates lazily, early clicks are lost. */
export async function open(page: Page, url: string) {
  await page.goto(url);
  await page.waitForLoadState("networkidle");
}

/** Clicks a trigger until its dialog is really open (covers the short window before hydration). */
export async function openDialog(page: Page, trigger: Locator, title: string | RegExp) {
  const dialog = page.getByRole("dialog");
  await expect(async () => {
    await trigger.click();
    await expect(dialog.getByRole("heading", { name: title })).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15_000 });
  return dialog;
}

export async function login(page: Page, email: string, password = PASSWORD) {
  await open(page, "/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.waitForLoadState("networkidle");
}

export async function logout(page: Page) {
  await page.locator("header").getByRole("button", { name: /Владелец|Администратор|Сотрудник/ }).click();
  await page.getByRole("menuitem", { name: "Выйти" }).click();
  await expect(page).toHaveURL(/\/login/);
}

/** Today in the organization's time zone (Europe/Moscow) plus n days, as yyyy-mm-dd. */
export function day(n = 0): string {
  const base = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow" }).format(new Date());
  const d = new Date(`${base}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** A short unique suffix so repeated runs and parallel entities never collide. */
export const uid = () => Math.random().toString(36).slice(2, 7);

/** Access token of a seeded user through the real auth endpoint, for checking the database through the real REST API. */
export async function token(email: string): Promise<string> {
  const r = await fetch(`${SUPABASE}/auth/v1/token?grant_type=password`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD }) });
  return (await r.json()).access_token;
}

export async function rest<T = Record<string, unknown>[]>(email: string, path: string): Promise<T> {
  const r = await fetch(`${SUPABASE}/rest/v1/${path}`, { headers: { Authorization: `Bearer ${await token(email)}`, apikey: "e2e" } });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return (await r.json()) as T;
}

/** Anonymous call of a public database function, exactly like the public page does. */
export async function rpc<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
  const r = await fetch(`${SUPABASE}/rest/v1/rpc/${name}`, { method: "POST", headers: { "Content-Type": "application/json", apikey: "e2e" }, body: JSON.stringify(args) });
  return (await r.json()) as T;
}
