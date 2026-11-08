import { ACCOUNTS, expect, login, open, openDialog, test, uid } from "./fixtures";
import { adminRest, createService, createStaff, DAYS } from "./helpers";

const card = (page: import("@playwright/test").Page, title: string) => page.locator("[data-slot=card]").filter({ has: page.getByRole("heading", { name: title, exact: true }) });

test.describe("services", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ACCOUNTS.admin);
  });

  test("create: validation, then the service is stored with price and duration", async ({ page }) => {
    const name = `Услуга ${uid()}`;
    await open(page, "/services");
    const dialog = await openDialog(page, page.getByRole("button", { name: "Добавить услугу" }), "Новая услуга");

    await dialog.getByLabel("Длительность, мин").fill("");
    await dialog.getByRole("button", { name: "Создать" }).click();
    await expect(dialog.getByText("Укажите название")).toBeVisible();
    await expect(dialog.getByText("Укажите длительность")).toBeVisible();
    await expect(dialog.getByText("Укажите цену")).toBeVisible();

    await dialog.getByLabel("Название").fill(name);
    await dialog.getByLabel("Длительность, мин").fill("3");
    await dialog.getByLabel("Цена, ₽").fill("-10");
    await dialog.getByRole("button", { name: "Создать" }).click();
    await expect(dialog.getByText("Не менее 5 минут")).toBeVisible();
    await expect(dialog.getByText("Цена не может быть отрицательной")).toBeVisible();

    await dialog.getByLabel("Длительность, мин").fill("45");
    await dialog.getByLabel("Цена, ₽").fill("1800");
    await dialog.getByLabel("Категория").fill("Тестовая категория");
    await dialog.getByLabel("Описание").fill("Описание для теста");
    await dialog.getByRole("button", { name: "Создать" }).click();
    await expect(dialog).toBeHidden();

    await expect(card(page, name)).toContainText("45 мин");
    await expect(card(page, name)).toContainText("1 800");
    const [row] = await adminRest(`services?select=duration_min,price,category,is_active&name=eq.${encodeURIComponent(name)}`);
    expect(row).toEqual({ duration_min: 45, price: 1800, category: "Тестовая категория", is_active: true });
  });

  test("edit and deactivate / activate", async ({ page }) => {
    const name = `Правка ${uid()}`;
    await createService(page, { name, price: 1000, duration: 30 });
    await card(page, name).getByRole("button", { name: "Изменить" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Цена, ₽").fill("1250");
    await dialog.getByLabel("Длительность, мин").fill("40");
    await dialog.getByRole("button", { name: "Сохранить" }).click();
    await expect(dialog).toBeHidden();
    await expect(card(page, name)).toContainText("1 250");
    await expect(card(page, name)).toContainText("40 мин");

    await card(page, name).getByRole("button", { name: "Отключить услугу" }).click();
    await expect(card(page, name).getByText("Отключена", { exact: true })).toBeVisible();
    expect(await adminRest(`services?select=is_active&name=eq.${encodeURIComponent(name)}`)).toEqual([{ is_active: false }]);
    await card(page, name).getByRole("button", { name: "Включить услугу" }).click();
    await expect(card(page, name).getByText("Активна", { exact: true })).toBeVisible();
    expect(await adminRest(`services?select=is_active&name=eq.${encodeURIComponent(name)}`)).toEqual([{ is_active: true }]);
  });
});

test.describe("staff", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ACCOUNTS.admin);
  });

  test("create with services and a weekly schedule with a break; schedule rules are validated", async ({ page }) => {
    const service = `Для мастера ${uid()}`;
    const name = `Мастер ${uid()}`;
    await createService(page, { name: service, price: 2000, duration: 60 });

    await open(page, "/staff");
    const dialog = await openDialog(page, page.getByRole("button", { name: "Добавить специалиста" }), "Новый специалист");
    await dialog.getByRole("button", { name: "Добавить" }).click();
    await expect(dialog.getByText("Укажите имя")).toBeVisible();

    await dialog.getByLabel("Имя", { exact: true }).fill(name);
    await dialog.getByLabel("Должность").fill("Стилист");
    await dialog.getByRole("checkbox", { name: service, exact: true }).check();
    // Saturday: 09:00-15:00 with a break 12:00-13:00; Sunday stays a day off
    await dialog.getByRole("checkbox", { name: "Суббота", exact: true }).check();
    await dialog.getByLabel("Суббота: начало", { exact: true }).fill("09:00");
    await dialog.getByLabel("Суббота: конец", { exact: true }).fill("15:00");
    await dialog.getByLabel("Суббота: начало перерыва", { exact: true }).fill("16:00");
    await dialog.getByLabel("Суббота: конец перерыва", { exact: true }).fill("17:00");
    await dialog.getByRole("button", { name: "Добавить" }).click();
    await expect(dialog.getByText("Перерыв должен быть внутри рабочего времени")).toBeVisible();

    await dialog.getByLabel("Суббота: начало перерыва", { exact: true }).fill("12:00");
    await dialog.getByLabel("Суббота: конец перерыва", { exact: true }).fill("");
    await dialog.getByRole("button", { name: "Добавить" }).click();
    await expect(dialog.getByText("Укажите начало и конец перерыва")).toBeVisible();

    await dialog.getByLabel("Суббота: конец перерыва", { exact: true }).fill("13:00");
    await dialog.getByLabel("Пятница: конец", { exact: true }).fill("09:00"); // ends before it starts
    await dialog.getByRole("button", { name: "Добавить" }).click();
    await expect(dialog.getByText("Окончание работы должно быть позже начала")).toBeVisible();
    await dialog.getByLabel("Пятница: конец", { exact: true }).fill("19:00");

    await dialog.getByRole("button", { name: "Добавить" }).click();
    await expect(dialog).toBeHidden();

    const c = card(page, name);
    await expect(c).toContainText("Пн–Пт, 10:00–19:00; Сб, 09:00–15:00");
    await expect(c).toContainText(service);
    await expect(c).toContainText("Стилист");

    const [staff] = await adminRest<{ id: string }[]>(`staff?select=id&full_name=eq.${encodeURIComponent(name)}`);
    const svc = await adminRest<{ id: string }[]>(`services?select=id&name=eq.${encodeURIComponent(service)}`);
    expect(await adminRest(`staff_services?select=service_id&staff_id=eq.${staff.id}`)).toEqual([{ service_id: svc[0].id }]);
    const hours = await adminRest<{ weekday: number; start_time: string; end_time: string; break_start: string | null; break_end: string | null }[]>(
      `working_hours?select=weekday,start_time,end_time,break_start,break_end&staff_id=eq.${staff.id}&order=weekday`,
    );
    expect(hours.map((h) => h.weekday)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(hours.at(-1)).toEqual({ weekday: 6, start_time: "09:00:00", end_time: "15:00:00", break_start: "12:00:00", break_end: "13:00:00" });
    expect(hours[0].break_start).toBeNull();
  });

  test("edit: reassign services and change the schedule; disable and enable", async ({ page }) => {
    const s1 = `Услуга А ${uid()}`;
    const s2 = `Услуга Б ${uid()}`;
    const name = `Мастер ${uid()}`;
    await createService(page, { name: s1, price: 1000, duration: 30 });
    await createService(page, { name: s2, price: 1500, duration: 60 });
    await createStaff(page, name, [s1]);
    await expect(card(page, name)).toContainText(s1);
    await expect(card(page, name)).not.toContainText(s2);
    await expect(card(page, name)).toContainText("Пн–Вс, 08:00–20:00");

    await card(page, name).getByRole("button", { name: "Изменить" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("checkbox", { name: s1, exact: true })).toBeChecked();
    await dialog.getByRole("checkbox", { name: s1, exact: true }).uncheck();
    await dialog.getByRole("checkbox", { name: s2, exact: true }).check();
    await dialog.getByRole("checkbox", { name: DAYS[6], exact: true }).uncheck(); // Sunday off
    await dialog.getByLabel("Среда: начало", { exact: true }).fill("11:00");
    await dialog.getByRole("button", { name: "Сохранить" }).click();
    await expect(dialog).toBeHidden();
    await expect(card(page, name)).toContainText(s2);
    await expect(card(page, name)).not.toContainText(s1);
    await expect(card(page, name)).toContainText("Пн–Вт, Чт–Сб, 08:00–20:00; Ср, 11:00–20:00");
    await expect(card(page, name)).not.toContainText("Вс");

    await card(page, name).getByRole("button", { name: "Отключить" }).click();
    await expect(card(page, name).getByText("Отключён", { exact: true })).toBeVisible();
    expect(await adminRest(`staff?select=is_active&full_name=eq.${encodeURIComponent(name)}`)).toEqual([{ is_active: false }]);
    await card(page, name).getByRole("button", { name: "Включить" }).click();
    await expect(card(page, name).getByText("Отключён", { exact: true })).toHaveCount(0);
    expect(await adminRest(`staff?select=is_active&full_name=eq.${encodeURIComponent(name)}`)).toEqual([{ is_active: true }]);
  });
});
