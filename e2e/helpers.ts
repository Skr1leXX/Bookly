import type { Locator, Page } from "@playwright/test";
import { ACCOUNTS, expect, open, openDialog, rest } from "./fixtures";

export const DAYS = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];

export async function createClient(page: Page, name: string, phone: string, extra: { email?: string; note?: string } = {}) {
  await open(page, "/clients");
  const dialog = await openDialog(page, page.getByRole("button", { name: "Добавить клиента" }), "Новый клиент");
  await dialog.getByLabel("Имя").fill(name);
  await dialog.getByLabel("Телефон").fill(phone);
  if (extra.email) await dialog.getByLabel("Email").fill(extra.email);
  if (extra.note) await dialog.getByLabel("Заметки").fill(extra.note);
  await dialog.getByRole("button", { name: "Добавить" }).click();
  await expect(dialog).toBeHidden();
}

export async function createService(page: Page, o: { name: string; price: number; duration: number; category?: string }) {
  await open(page, "/services");
  const dialog = await openDialog(page, page.getByRole("button", { name: "Добавить услугу" }), "Новая услуга");
  await dialog.getByLabel("Название").fill(o.name);
  if (o.category) await dialog.getByLabel("Категория").fill(o.category);
  await dialog.getByLabel("Длительность, мин").fill(String(o.duration));
  await dialog.getByLabel("Цена, ₽").fill(String(o.price));
  await dialog.getByRole("button", { name: "Создать" }).click();
  await expect(dialog).toBeHidden();
}

/** Staff working every day 08:00-20:00 with a 13:00-14:00 break, performing the given services. */
export async function createStaff(page: Page, name: string, serviceNames: string[], hours = { start: "08:00", end: "20:00", breakStart: "13:00", breakEnd: "14:00" }) {
  await open(page, "/staff");
  const dialog = await openDialog(page, page.getByRole("button", { name: "Добавить специалиста" }), "Новый специалист");
  await dialog.getByLabel("Имя", { exact: true }).fill(name);
  await dialog.getByLabel("Должность").fill("Мастер тестов");
  for (const s of serviceNames) await dialog.getByRole("checkbox", { name: s, exact: true }).check();
  for (const day of DAYS) {
    await dialog.getByRole("checkbox", { name: day, exact: true }).check();
    await dialog.getByLabel(`${day}: начало`, { exact: true }).fill(hours.start);
    await dialog.getByLabel(`${day}: конец`, { exact: true }).fill(hours.end);
    await dialog.getByLabel(`${day}: начало перерыва`, { exact: true }).fill(hours.breakStart);
    await dialog.getByLabel(`${day}: конец перерыва`, { exact: true }).fill(hours.breakEnd);
  }
  await dialog.getByRole("button", { name: "Добавить" }).click();
  await expect(dialog).toBeHidden();
}

export interface Booking {
  client: string;
  service: string;
  staff: string;
  date: string;
  time: string;
  status?: string;
}

export async function fillAppointmentFields(page: Page, b: Booking) {
  const dialog = page.getByRole("dialog");
  const option = async (label: string, text: string) => {
    const select = dialog.getByLabel(label, { exact: true });
    const value = await select.locator("option", { hasText: text }).first().getAttribute("value");
    await select.selectOption(value!);
  };
  await option("Клиент", b.client);
  await option("Услуга", b.service);
  await option("Специалист", b.staff);
  await dialog.getByLabel("Дата").fill(b.date);
  await dialog.getByLabel("Время начала").fill(b.time);
  if (b.status) await dialog.getByLabel("Статус").selectOption({ label: b.status });
  return dialog;
}

/** Opens the new-appointment dialog on the appointments page and fills it in, without submitting. */
export async function startBooking(page: Page, b: Booking) {
  await open(page, "/appointments");
  await openDialog(page, page.getByRole("main").getByRole("button", { name: "Новая запись" }), "Новая запись");
  return fillAppointmentFields(page, b);
}

export async function bookAppointment(page: Page, b: Booking) {
  const dialog = await startBooking(page, b);
  await dialog.getByRole("button", { name: "Создать запись" }).click();
  return dialog;
}

export const rowOf = (page: Page, text: string | RegExp) => page.locator("tbody tr").filter({ hasText: text });

export const adminRest = <T = Record<string, unknown>[]>(path: string) => rest<T>(ACCOUNTS.admin, path);

/** Real mouse drag with intermediate moves: Chromium only starts an HTML5 drag after the pointer has travelled a few pixels. */
export async function dragTo(page: Page, source: Locator, target: Locator, from: { x: number; y: number }, to: { x: number; y: number }) {
  await source.scrollIntoViewIfNeeded();
  const s = (await source.boundingBox())!;
  const t = (await target.boundingBox())!;
  await page.mouse.move(s.x + from.x, s.y + from.y);
  await page.mouse.down();
  await page.mouse.move(s.x + from.x + 8, s.y + from.y + 8, { steps: 4 });
  await page.mouse.move(t.x + to.x, t.y + to.y, { steps: 20 });
  await page.mouse.up();
}
