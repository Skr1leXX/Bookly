import { ACCOUNTS, day, expect, login, open, openDialog, test, uid } from "./fixtures";
import { adminRest, bookAppointment, startBooking, createClient, createService, createStaff, rowOf } from "./helpers";

// One scenario, built step by step on data created through the UI (a service, a specialist who works every day
// 08:00-20:00 with a 13:00-14:00 break, two clients). Dates are relative to today, so the suite never goes stale.
test.describe.configure({ mode: "serial" });

const tag = uid();
const SERVICE = `Стрижка ${tag}`;
const STAFF = `Мастер ${tag}`;
const C1 = `Клиент Один ${tag}`;
const C2 = `Клиент Два ${tag}`;
const D = day(20);
const D2 = day(21);

const ONE_HOUR = 3_600_000;
const apptsOf = async (date = D) => adminRest<{ id: string; status: string; starts_at: string; ends_at: string; price: number; staff_id: string }[]>(
  `appointments?select=id,status,starts_at,ends_at,price,staff_id&starts_at=gte.${date}T00:00:00Z&starts_at=lt.${date}T23:59:59Z&order=starts_at`,
).then((rows) => rows);

test.describe("appointments", () => {
  test("setup: a service, a specialist and two clients through the UI", async ({ page }) => {
    await login(page, ACCOUNTS.admin);
    await createService(page, { name: SERVICE, price: 1000, duration: 60 });
    await createStaff(page, STAFF, [SERVICE]);
    await createClient(page, C1, "+7 (999) 800-01-01");
    await createClient(page, C2, "+7 (999) 800-01-02");
    await open(page, "/staff");
    await expect(page.getByRole("heading", { name: STAFF })).toBeVisible();
  });

  test("create: validation, then an appointment with fixed price and end time", async ({ page }) => {
    await login(page, ACCOUNTS.admin);
    await open(page, "/appointments");
    const dialog = await openDialog(page, page.getByRole("main").getByRole("button", { name: "Новая запись" }), "Новая запись");
    await dialog.getByRole("button", { name: "Создать запись" }).click(); // no client chosen
    await expect(dialog.getByRole("alert").filter({ hasText: "Выберите клиента" })).toBeVisible();
    await dialog.getByRole("button", { name: "Отмена" }).click();

    const d = await bookAppointment(page, { client: C1, service: SERVICE, staff: STAFF, date: D, time: "10:00" });
    await expect(d).toBeHidden();
    const row = rowOf(page, C1);
    await expect(row).toContainText("Подтверждена");
    await expect(row).toContainText(SERVICE);
    await expect(row).toContainText("10:00");
    const [a] = await apptsOf();
    expect(a.status).toBe("confirmed");
    expect(a.price).toBe(1000);
    expect(Date.parse(a.ends_at) - Date.parse(a.starts_at)).toBe(ONE_HOUR);
    expect(a.starts_at).toBe(`${D}T07:00:00.000Z`); // 10:00 Moscow
  });

  test("busy time: the form warns, the database refuses the overlap, a back-to-back visit is fine", async ({ page }) => {
    await login(page, ACCOUNTS.admin);
    const dialog = await startBooking(page, { client: C2, service: SERVICE, staff: STAFF, date: D, time: "10:30" });
    await expect(dialog.getByRole("status")).toContainText("Время занято");
    await expect(dialog.getByRole("status")).toContainText(C1);
    await dialog.getByRole("button", { name: "Создать запись" }).click();
    await expect(dialog.getByRole("alert")).toContainText("уже занято другой записью");
    expect(await apptsOf()).toHaveLength(1); // nothing was saved

    await dialog.getByLabel("Время начала").fill("11:00"); // starts exactly when the first one ends
    await expect(dialog.getByRole("status")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Создать запись" }).click();
    await expect(dialog).toBeHidden();
    expect((await apptsOf()).map((a) => a.starts_at.slice(11, 16))).toEqual(["07:00", "08:00"]);
  });

  test("break and working hours: the form explains it, the database enforces it", async ({ page }) => {
    await login(page, ACCOUNTS.admin);
    const dialog = await startBooking(page, { client: C2, service: SERVICE, staff: STAFF, date: D, time: "13:30" });
    await expect(dialog.getByRole("status")).toContainText("перерыв");
    await dialog.getByRole("button", { name: "Создать запись" }).click();
    await expect(dialog.getByRole("alert")).toContainText("перерыв");

    await dialog.getByLabel("Время начала").fill("19:30"); // would end at 20:30, after closing
    await expect(dialog.getByRole("status")).toContainText("работает с 08:00 до 20:00");
    await dialog.getByRole("button", { name: "Создать запись" }).click();
    await expect(dialog.getByRole("alert")).toContainText("не работает в это время");
    expect(await apptsOf()).toHaveLength(2);
  });

  test("a disabled specialist cannot be booked", async ({ page }) => {
    await login(page, ACCOUNTS.admin);
    await open(page, "/staff");
    const staffCard = page.locator("[data-slot=card]").filter({ has: page.getByRole("heading", { name: STAFF, exact: true }) });
    await staffCard.getByRole("button", { name: "Отключить" }).click();
    await expect(staffCard.getByText("Отключён", { exact: true })).toBeVisible();

    await open(page, "/appointments");
    const dialog = await openDialog(page, page.getByRole("main").getByRole("button", { name: "Новая запись" }), "Новая запись");
    await dialog.getByLabel("Услуга", { exact: true }).selectOption({ label: new RegExp(SERVICE) as never }).catch(() => undefined);
    const options = await dialog.getByLabel("Специалист", { exact: true }).locator("option").allTextContents();
    expect(options.join("|")).not.toContain(STAFF);

    await open(page, "/staff");
    await staffCard.getByRole("button", { name: "Включить" }).click();
    await expect(staffCard.getByText("Отключён", { exact: true })).toHaveCount(0);
  });

  test("edit: move to another day and time", async ({ page }) => {
    await login(page, ACCOUNTS.admin);
    await open(page, "/appointments");
    const row = rowOf(page, C2);
    await row.getByRole("button", { name: "Действия с записью" }).click();
    await page.getByRole("menuitem", { name: "Изменить" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Редактирование записи" })).toBeVisible();
    await dialog.getByLabel("Дата").fill(D2);
    await dialog.getByLabel("Время начала").fill("15:00");
    await dialog.getByLabel("Заметка").fill("Перенесено по просьбе клиента");
    await dialog.getByRole("button", { name: "Сохранить" }).click();
    await expect(dialog).toBeHidden();
    const [a] = await adminRest<{ starts_at: string; notes: string; price: number }[]>(`appointments?select=starts_at,notes,price&starts_at=gte.${D2}T00:00:00Z&starts_at=lt.${D2}T23:59:59Z`);
    expect(a.starts_at).toBe(`${D2}T12:00:00.000Z`);
    expect(a.notes).toBe("Перенесено по просьбе клиента");
    expect(a.price).toBe(1000); // the price fixed at booking time did not change
  });

  test("status changes: completed, no-show, back to pending; the list reflects them", async ({ page }) => {
    await login(page, ACCOUNTS.admin);
    await open(page, "/appointments");
    const row = rowOf(page, C1);
    for (const [menu, badge, db] of [["Завершена", "Завершена", "completed"], ["Клиент не пришёл", "Клиент не пришёл", "no_show"], ["Ожидает подтверждения", "Ожидает подтверждения", "pending"]]) {
      await row.getByRole("button", { name: "Действия с записью" }).click();
      await page.getByRole("menuitem", { name: menu }).click();
      await expect(row).toContainText(badge);
      expect((await apptsOf())[0].status).toBe(db);
    }
  });

  test("cancel frees the time slot", async ({ page }) => {
    await login(page, ACCOUNTS.admin);
    await open(page, "/appointments");
    const row = rowOf(page, C1);
    await row.getByRole("button", { name: "Действия с записью" }).click();
    await page.getByRole("menuitem", { name: "Отменить запись" }).click();
    await expect(row).toContainText("Отменена");
    expect((await apptsOf())[0].status).toBe("cancelled");

    // the same specialist and time can be booked again
    const dialog = await startBooking(page, { client: C2, service: SERVICE, staff: STAFF, date: D, time: "10:00" });
    await expect(dialog.getByRole("status")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Создать запись" }).click();
    await expect(dialog).toBeHidden();
    expect((await apptsOf()).filter((a) => a.status !== "cancelled")).toHaveLength(1); // C2 moved to the next day earlier, so this is the only live visit
  });

  test("filters and search in the list", async ({ page }) => {
    await login(page, ACCOUNTS.admin);
    await open(page, "/appointments");
    await page.getByLabel("Статус", { exact: true }).selectOption({ label: "Отменена" });
    await expect(rowOf(page, C1)).toBeVisible();
    await expect(rowOf(page, C2)).toHaveCount(0);
    await page.getByLabel("Статус", { exact: true }).selectOption({ label: "Все статусы" });
    await page.getByPlaceholder("Клиент, услуга, специалист…").fill(C2);
    await expect(page.locator("tbody tr")).toHaveCount(2);
    await page.getByLabel("Дата с").fill(D2);
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await page.getByPlaceholder("Клиент, услуга, специалист…").fill(`нет ${uid()}`);
    await expect(page.getByText("Записей не найдено")).toBeVisible();
    await page.getByRole("button", { name: "Сбросить фильтры" }).click();
    await expect(page.locator("tbody tr").first()).toBeVisible();
  });

  test("calendar: views, staff filter, click to create, drag to reschedule, break and overlap refused", async ({ page }) => {
    await login(page, ACCOUNTS.admin);
    await open(page, "/calendar");

    // go to the week that contains day +20 (the grid starts on Monday)
    const isoDow = (d: string) => ((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
    const weeksAhead = Math.floor((isoDow(day(0)) - 1 + 20) / 7);
    for (let i = 0; i < weeksAhead; i++) await page.getByRole("button", { name: "Вперёд" }).click();
    await page.getByLabel("Специалист", { exact: true }).selectOption({ label: STAFF });
    const at = (time: string) => page.locator(`button[draggable][title^="${time}"]`);
    const blocks = page.locator("button[draggable]");
    await expect(at("10:00–11:00")).toHaveCount(1); // C2 on day +20 (C1's cancelled visit at the same time is not drawn)
    await expect(at("10:00–11:00")).toContainText(C2);

    // the staff filter hides everybody else
    await page.getByLabel("Специалист", { exact: true }).selectOption({ label: "Все специалисты" });
    await expect(blocks.first()).toBeVisible();
    await expect(blocks.count()).resolves.toBeGreaterThan(1);
    await page.getByLabel("Специалист", { exact: true }).selectOption({ label: STAFF });
    await expect(blocks).toHaveCount(2); // day +20 and day +21 belong to the same week unless +20 is a Sunday

    // day / week views
    await page.getByRole("button", { name: "День", exact: true }).click();
    await expect(page.getByRole("button", { name: "День", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Неделя", exact: true }).click();
    await expect(page.locator("div.cursor-cell")).toHaveCount(7);

    const column = page.locator("div.cursor-cell").nth(isoDow(D) - 1);
    const visit = at("10:00–11:00");

    // click on a free hour (17:00): the form opens with date, time and specialist prefilled
    await column.click({ position: { x: 30, y: 8 * 64 + 2 } });
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Новая запись" })).toBeVisible();
    await expect(dialog.getByLabel("Дата")).toHaveValue(D);
    await expect(dialog.getByLabel("Время начала")).toHaveValue("17:00");
    await expect(dialog.getByLabel("Специалист", { exact: true }).locator("option:checked")).toHaveText(STAFF);
    await dialog.getByRole("button", { name: "Отмена" }).click();

    // drag into the lunch break (13:30): refused before any request, nothing changes
    const before = await apptsOf();
    await visit.dragTo(column, { sourcePosition: { x: 10, y: 5 }, targetPosition: { x: 30, y: 4.5 * 64 + 5 } });
    await expect(page.getByRole("alert").filter({ hasText: "Нельзя перенести" })).toContainText("перерыв");
    expect((await apptsOf()).map((a) => a.starts_at)).toEqual(before.map((a) => a.starts_at));

    // drag to 16:00: saved
    await page.getByRole("button", { name: "Закрыть" }).click(); // dismiss the previous message
    await visit.dragTo(column, { sourcePosition: { x: 10, y: 5 }, targetPosition: { x: 30, y: 7 * 64 + 5 } });
    await expect(at("16:00–17:00")).toHaveCount(1);
    const live = (await apptsOf()).filter((a) => a.status !== "cancelled");
    expect(live.map((a) => a.starts_at.slice(11, 16))).toEqual(["13:00"]); // 16:00 Moscow

    // drag onto a time that is already taken: create a second visit at 11:00 through the form, then try to land on it
    await column.click({ position: { x: 30, y: 2 * 64 + 2 } }); // 11:00
    await expect(dialog.getByLabel("Время начала")).toHaveValue("11:00");
    await dialog.getByLabel("Клиент", { exact: true }).selectOption({ label: new RegExp(C1) as never }).catch(async () => {
      const v = await dialog.getByLabel("Клиент", { exact: true }).locator("option", { hasText: C1 }).first().getAttribute("value");
      await dialog.getByLabel("Клиент", { exact: true }).selectOption(v!);
    });
    await dialog.getByRole("button", { name: "Создать запись" }).click();
    await expect(dialog).toBeHidden();
    await expect(at("11:00–12:00")).toHaveCount(1);
    const moving = at("16:00–17:00");
    await moving.dragTo(column, { sourcePosition: { x: 10, y: 5 }, targetPosition: { x: 30, y: 2 * 64 + 20 } });
    await expect(page.getByRole("alert").filter({ hasText: "Нельзя перенести" })).toContainText("уже есть запись");
    expect((await apptsOf()).filter((a) => a.status !== "cancelled")).toHaveLength(2);
  });
});
