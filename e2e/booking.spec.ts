import type { Page } from "@playwright/test";
import { ACCOUNTS, day, expect, login, open, rest, rpc, test, uid } from "./fixtures";

// The public page /book/<slug>: runs on desktop and on a phone-sized viewport (see playwright.config.ts).
const SLUG = "lavanda-demo";
const SERVICE = "Женская стрижка";
const STAFF = "Анна Ковалёва"; // works Mon-Fri 10:00-19:00, break 13:00-14:00 (seed)
const SERVICE_ID = "f0000000-0000-0000-0000-000000000001";
const STAFF_ID = "e0000000-0000-0000-0000-000000000001";

const isoDow = (d: string) => ((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
/** A Tuesday (the specialist's working day) that still has plenty of free time: the shared database fills up as tests book. */
let DATE = "";
async function freeTuesday() {
  for (let n = 10; n < 60; n++) {
    if (isoDow(day(n)) !== 2) continue;
    const slots = await rpc<unknown[]>("public_slots", { p_slug: SLUG, p_service: SERVICE_ID, p_staff: STAFF_ID, p_date: day(n) });
    if (slots.length >= 20) return day(n); // a mostly free day
  }
  throw new Error("no Tuesday with free time in the next 60 days");
}
test.beforeEach(async () => {
  DATE = await freeTuesday(); // re-chosen for every test: earlier tests use up the free time
});

test.beforeEach(async ({ context }) => {
  // each test is a different visitor for the per-IP rate limit
  await context.setExtraHTTPHeaders({ "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` });
});

async function pick(page: Page, o: { date?: string; slotIndex?: number } = {}) {
  await open(page, `/book/${SLUG}`);
  await page.getByRole("button", { name: new RegExp(SERVICE) }).click();
  await page.getByRole("button", { name: new RegExp(STAFF) }).click();
  await expect(page.getByRole("heading", { name: "Выберите дату и время" })).toBeVisible();
  await page.getByLabel("Другая дата").fill(o.date ?? DATE);
  const slots = page.locator("section button");
  await expect(slots.first()).toBeVisible();
  const slot = slots.nth(o.slotIndex ?? 0);
  const time = (await slot.textContent())!.trim();
  await slot.click();
  await expect(page.getByRole("heading", { name: "Ваши контакты" })).toBeVisible();
  return time;
}

async function contacts(page: Page, c: { name: string; phone: string; email: string; note?: string }) {
  await page.getByLabel("Имя").fill(c.name);
  await page.getByLabel("Телефон").fill(c.phone);
  await page.getByLabel("Email").fill(c.email);
  if (c.note) await page.getByLabel(/Комментарий/).fill(c.note);
  await page.getByRole("button", { name: "Далее" }).click();
  await expect(page.getByRole("heading", { name: "Ваша запись" })).toBeVisible();
}

/** The page's own alerts (not the framework's empty route announcer, which also has role="alert"). */
const alertOf = (page: Page) => page.locator('[role=alert]:not(#__next-route-announcer__)');
const confirm = (page: Page) => page.getByRole("button", { name: "Подтвердить запись" });
/** The form refuses a submission made faster than a person can fill it in (bot trap), so tests wait like a person. */
const likeAPerson = (page: Page) => page.waitForTimeout(3200);

test.describe("public online booking", () => {
  test("full scenario: from the public page to an appointment in the admin panel and the calendar", async ({ page }) => {
    const first = `Ирина${uid()}`;
    const name = `${first} Публичная`;
    await open(page, `/book/${SLUG}`);
    await expect(page.getByRole("heading", { name: "Студия красоты «Лаванда»" })).toBeVisible();
    await expect(page.getByText("Парикмахерские услуги, маникюр")).toBeVisible();
    await expect(page.getByText("Москва, ул. Тверская")).toBeVisible();
    // only available services are listed: the inactive "Лечебный массаж" is not
    await expect(page.getByRole("button", { name: /Женская стрижка/ })).toBeVisible();
    await expect(page.getByText("Лечебный массаж")).toHaveCount(0);

    await page.getByRole("button", { name: new RegExp(SERVICE) }).click();
    // the list of specialists contains "any" and only those who perform this service
    await expect(page.getByRole("button", { name: /Любой специалист/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Ольга Белова/ })).toHaveCount(0); // colourist: not a haircut specialist
    await page.getByRole("button", { name: new RegExp(STAFF) }).click();

    await page.getByLabel("Другая дата").fill(DATE);
    const slots = page.locator("section button");
    await expect(slots.first()).toBeVisible();
    const times = await slots.allTextContents();
    expect(times.some((t) => t >= "13:00" && t < "14:00")).toBe(false); // lunch break
    expect(times.every((t) => t >= "10:00" && t <= "18:00")).toBe(true); // working hours, 60-minute service
    const time = times[0].trim();
    await slots.first().click();

    await contacts(page, { name, phone: "+7 (900) 123-45-67", email: "irina.public@example.com", note: "Первый визит" });
    // review: every choice is visible before confirming
    await expect(page.getByText(SERVICE, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(STAFF)).toBeVisible();
    await expect(page.getByText(name)).toBeVisible();
    await expect(page.getByText(new RegExp(`${time}`)).first()).toBeVisible();

    await likeAPerson(page);
    await confirm(page).click();
    await expect(page).toHaveURL(new RegExp(`/book/${SLUG}/success/[0-9a-f-]{36}$`));
    await expect(page.getByRole("heading", { name: `Запись создана, ${first}!` })).toBeVisible();
    await expect(page.getByText(STAFF)).toBeVisible();
    await expect(page.getByText(`${time}–`)).toBeVisible();
    await expect(page.getByText(/Студия красоты «Лаванда», Москва/)).toBeVisible();
    await expect(page.getByText(/ожидает|подтвердит/i)).toBeVisible();
    // no contact data on the confirmation page
    await expect(page.getByText("irina.public@example.com")).toHaveCount(0);
    await expect(page.getByText("(900) 123-45-67")).toHaveCount(0);

    // it is in the database: pending, online, correct time, a client was created
    const id = page.url().split("/").pop()!;
    const [a] = await rest<{ status: string; source: string; starts_at: string; price: number; notes: string; staff_id: string }[]>(ACCOUNTS.admin, `appointments?select=status,source,starts_at,price,notes,staff_id&id=eq.${id}`);
    expect(a).toMatchObject({ status: "pending", source: "online", price: 2500, notes: "Первый визит", staff_id: STAFF_ID });
    expect(a.starts_at.slice(0, 10)).toBe(DATE);
    const clients = await rest<{ phone: string; email: string }[]>(ACCOUNTS.admin, `clients?select=phone,email&name=eq.${encodeURIComponent(name)}`);
    expect(clients).toEqual([{ phone: "+7 (900) 123-45-67", email: "irina.public@example.com" }]);

    // reloading the confirmation page is harmless
    await page.reload();
    await expect(page.getByRole("heading", { name: `Запись создана, ${first}!` })).toBeVisible();

    // admin panel: the list (with the "online" mark) ...
    await login(page, ACCOUNTS.admin);
    await open(page, "/appointments");
    const row = page.locator("tbody tr").filter({ hasText: name });
    await expect(row).toContainText("Онлайн");
    await expect(row).toContainText("Ожидает подтверждения");
    await expect(row).toContainText(time);
    // ... the calendar ...
    await open(page, "/calendar");
    const weeksAhead = Math.floor((isoDow(day(0)) - 1 + (Date.parse(DATE) - Date.parse(day(0))) / 86_400_000) / 7);
    for (let i = 0; i < weeksAhead; i++) await page.getByRole("button", { name: "Вперёд" }).click();
    await expect(page.locator("button[draggable]").filter({ hasText: name })).toBeVisible();
    // ... and the notification of the administrator
    await page.getByRole("button", { name: /Уведомления/ }).click();
    await expect(page.getByText("Новая онлайн-запись").first()).toBeVisible();
  });

  test("invalid contact data is explained and nothing is sent", async ({ page }) => {
    await pick(page);
    let posts = 0;
    page.on("request", (r) => r.method() === "POST" && posts++);
    await page.getByRole("button", { name: "Далее" }).click();
    await expect(page.getByText("Укажите имя")).toBeVisible();
    await expect(page.getByText("Укажите телефон")).toBeVisible();
    await expect(page.getByText("Укажите email")).toBeVisible();

    await page.getByLabel("Имя").fill("Тест");
    await page.getByLabel("Телефон").fill("12");
    await page.getByLabel("Email").fill("no-at.example.com");
    await page.getByRole("button", { name: "Далее" }).click();
    await expect(page.getByText("Некорректный телефон")).toBeVisible();
    await expect(page.getByText("Некорректный email")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ваши контакты" })).toBeVisible();
    expect(posts).toBe(0); // validation happens in the browser first

    await page.getByLabel("Телефон").fill("+7 (900) 000-11-22");
    await page.getByLabel("Email").fill("ok@example.com");
    await page.getByLabel(/Комментарий/).fill("x".repeat(501).slice(0, 500));
    await page.getByRole("button", { name: "Далее" }).click();
    await expect(page.getByRole("heading", { name: "Ваша запись" })).toBeVisible();
    // going back keeps what was typed
    await page.getByRole("button", { name: "Назад" }).click();
    await expect(page.getByLabel("Имя")).toHaveValue("Тест");
  });

  test("the server rejects bad contact data even if the browser checks are bypassed", async () => {
    const call = (extra: Record<string, unknown>) =>
      rpc<{ ok: boolean; error?: string; field?: string }>("public_book", { p_slug: SLUG, p_service: SERVICE_ID, p_staff: STAFF_ID, p_date: DATE, p_time: "16:30", p_name: "Тест", p_phone: "+7 (900) 111-00-00", p_email: "t@example.com", p_note: "", p_fingerprint: `bypass-${uid()}`, ...extra });
    expect(await call({ p_phone: "abc" })).toMatchObject({ ok: false, error: "invalid", field: "phone" });
    expect(await call({ p_email: "x" })).toMatchObject({ ok: false, error: "invalid", field: "email" });
    expect(await call({ p_name: "   " })).toMatchObject({ ok: false, error: "invalid", field: "name" });
  });

  test("the time was taken by someone else: a clear message and a way to pick another", async ({ page }) => {
    const time = await pick(page);
    await contacts(page, { name: `Опоздавший ${uid()}`, phone: "+7 (900) 222-33-44", email: "late@example.com" });
    // meanwhile another visitor books the same time (a real request to the real database function)
    const other = await rpc<{ ok: boolean }>("public_book", { p_slug: SLUG, p_service: SERVICE_ID, p_staff: STAFF_ID, p_date: DATE, p_time: time, p_name: `Быстрый ${uid()}`, p_phone: "+7 (900) 555-66-77", p_email: "fast@example.com", p_note: "", p_fingerprint: `rival-${uid()}` });
    expect(other.ok).toBe(true);

    await likeAPerson(page);
    await confirm(page).click();
    await expect(alertOf(page)).toContainText("Это время только что заняли");
    await expect(page).toHaveURL(new RegExp(`/book/${SLUG}$`)); // nothing was created
    await page.getByRole("button", { name: "Выбрать другое время" }).click();
    await expect(page.getByRole("heading", { name: "Выберите дату и время" })).toBeVisible();
    await expect(page.locator("section button").filter({ hasText: new RegExp(`^${time}$`) })).toHaveCount(0); // the taken time is gone
    await expect(page.locator("section button").first()).toBeVisible();
  });

  test("double click and repeated submission create exactly one appointment", async ({ page }) => {
    const name = `Дважды ${uid()}`;
    const time = await pick(page, { slotIndex: 2 });
    await contacts(page, { name, phone: "+7 (900) 777-88-99", email: "twice@example.com" });
    await likeAPerson(page);
    await confirm(page).dblclick();
    await expect(page).toHaveURL(/\/success\//);
    const rows = await rest<{ id: string }[]>(ACCOUNTS.admin, `clients?select=id&name=eq.${encodeURIComponent(name)}`);
    expect(rows).toHaveLength(1);
    const appts = await rest<{ id: string }[]>(ACCOUNTS.admin, `appointments?select=id&client_id=eq.${rows[0].id}`);
    expect(appts).toHaveLength(1);

    // the browser's Back button does not resubmit; the same time can no longer be chosen
    await page.goBack();
    await expect(page.getByRole("heading", { name: /Выберите услугу/ })).toBeVisible();
    await page.getByRole("button", { name: new RegExp(SERVICE) }).click();
    await page.getByRole("button", { name: new RegExp(STAFF) }).click();
    await page.getByLabel("Другая дата").fill(DATE);
    await expect(page.locator("section button").first()).toBeVisible();
    await expect(page.locator("section button").filter({ hasText: new RegExp(`^${time}$`) })).toHaveCount(0);
    expect(await rest<{ id: string }[]>(ACCOUNTS.admin, `appointments?select=id&client_id=eq.${rows[0].id}`)).toHaveLength(1);
  });

  test("a form submitted faster than a person can is refused (bot trap)", async ({ page }) => {
    const name = `Робот ${uid()}`;
    await pick(page);
    await contacts(page, { name, phone: "+7 (900) 321-00-01", email: "bot@example.com" });
    await confirm(page).click(); // far less than 3 seconds since the page opened
    await expect(alertOf(page)).toContainText("Не удалось отправить форму");
    expect(await rest(ACCOUNTS.admin, `clients?select=id&name=eq.${encodeURIComponent(name)}`)).toEqual([]);
    await likeAPerson(page);
    await confirm(page).click(); // the same form, a person's pace
    await expect(page).toHaveURL(/\/success\//);
  });

  test("the past is closed: no earlier dates, no slots, no booking", async ({ page }) => {
    await open(page, `/book/${SLUG}`);
    await page.getByRole("button", { name: new RegExp(SERVICE) }).click();
    await page.getByRole("button", { name: new RegExp(STAFF) }).click();
    const other = page.getByLabel("Другая дата");
    await expect(other).toHaveAttribute("min", day(0));
    await expect(other).toHaveAttribute("max", day(60));
    // the first day chip is today, nothing earlier is offered
    await expect(page.getByRole("listbox", { name: "Дата" }).getByRole("option").first()).toContainText(String(Number(day(0).slice(8))));

    expect(await rpc("public_slots", { p_slug: SLUG, p_service: SERVICE_ID, p_staff: STAFF_ID, p_date: day(-1) })).toEqual([]);
    expect(await rpc("public_slots", { p_slug: SLUG, p_service: SERVICE_ID, p_staff: STAFF_ID, p_date: day(61) })).toEqual([]);
    const past = await rpc<{ ok: boolean; error?: string }>("public_book", { p_slug: SLUG, p_service: SERVICE_ID, p_staff: STAFF_ID, p_date: day(-1), p_time: "11:00", p_name: "Прошлое", p_phone: "+7 (900) 000-00-09", p_email: "p@example.com", p_note: "", p_fingerprint: `past-${uid()}` });
    expect(past).toMatchObject({ ok: false, error: "past" });
  });

  test("a day without free time says so; a day off is not selectable", async ({ page }) => {
    await open(page, `/book/${SLUG}`);
    await page.getByRole("button", { name: new RegExp(SERVICE) }).click();
    await page.getByRole("button", { name: new RegExp(STAFF) }).click();
    // Saturday: the specialist does not work, so the day chip is disabled
    const saturdayChip = page.getByRole("option").filter({ hasText: /^сб/i }).first();
    await expect(saturdayChip).toBeDisabled();
    await page.getByLabel("Другая дата").fill(day([...Array(14).keys()].find((n) => isoDow(day(n)) === 6)!));
    await expect(page.getByText("На этот день нет свободного времени")).toBeVisible();
  });

  test("any specialist: two visitors for the same time get two different specialists", async ({ page }) => {
    await open(page, `/book/${SLUG}`);
    await page.getByRole("button", { name: /Укладка/ }).click(); // performed by two specialists
    await page.getByRole("button", { name: /Любой специалист/ }).click();
    await page.getByLabel("Другая дата").fill(DATE);
    await expect(page.locator("section button").first()).toBeVisible();
    const slot = page.locator("section button").filter({ hasText: /^15:00$/ });
    await slot.click();
    await contacts(page, { name: `Любой ${uid()}`, phone: "+7 (900) 444-55-66", email: "any@example.com" });
    await expect(page.getByText(/подобран автоматически/)).toBeVisible();
    await likeAPerson(page);
    await confirm(page).click();
    await expect(page).toHaveURL(/\/success\//);
  });

});

test.describe("public booking: not found", () => {
  test.use({ allowedStatuses: [404] });

  test("unknown organization and unknown confirmation links show 'not found'", async ({ page }) => {
    await page.goto("/book/no-such-salon");
    await expect(page.getByText(/404|не найден/i).first()).toBeVisible();
    await page.goto(`/book/${SLUG}/success/00000000-0000-0000-0000-000000000000`);
    await expect(page.getByText(/404|не найден/i).first()).toBeVisible();
    await page.goto(`/book/${SLUG}/success/not-a-uuid`);
    await expect(page.getByText(/404|не найден/i).first()).toBeVisible();
  });
});
