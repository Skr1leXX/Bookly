"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createPublicClient } from "@/lib/supabase/public";
import { bookingSchema } from "@/lib/validation";
import type { PublicSlot } from "@/types/booking";
import { parse, str } from "./util";

export type BookingState = {
  error?: string;
  /** What the form should do next: go back to the contact step, or pick another time. */
  code?: "invalid" | "slot_taken" | "past" | "rate_limited" | "other";
  fields?: Record<string, string>;
};

const SLUG = /^[a-z0-9][a-z0-9-]{0,80}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Hash of the caller's IP: used only to rate limit, never stored in the clear. */
async function fingerprint() {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "unknown";
  return createHash("sha256").update(`${process.env.BOOKING_RATE_SALT ?? "bookly"}:${ip}`).digest("hex").slice(0, 32);
}

/** Free start times for a service on a date. staffId = null means "any specialist". */
export async function loadSlots(slug: string, serviceId: string, staffId: string | null, date: string): Promise<{ slots: PublicSlot[]; error?: string }> {
  if (!SLUG.test(slug) || !UUID.test(serviceId) || (staffId !== null && !UUID.test(staffId)) || !DAY.test(date)) return { slots: [], error: "Некорректный запрос" };
  const { data, error } = await createPublicClient().rpc("public_slots", { p_slug: slug, p_service: serviceId, p_staff: staffId, p_date: date });
  if (error) {
    console.error("public_slots", error.code, error.message);
    return { slots: [], error: "Не удалось загрузить время. Попробуйте ещё раз" };
  }
  return { slots: (data ?? []) as PublicSlot[] };
}

/** Creates the appointment. The database re-checks availability, limits and contact data before saving. */
export async function createBooking(slug: string, _: BookingState, fd: FormData): Promise<BookingState> {
  // Bots: a filled honeypot or a form submitted faster than a person could (elapsed is measured in the browser).
  const elapsed = Number(str(fd, "elapsed"));
  if (str(fd, "website") !== "" || !(elapsed >= 3000)) return { code: "other", error: "Не удалось отправить форму. Обновите страницу и попробуйте снова" };
  if (!SLUG.test(slug)) return { code: "other", error: "Страница записи не найдена" };

  const v = parse(bookingSchema, {
    name: str(fd, "name"), phone: str(fd, "phone"), email: str(fd, "email"), note: str(fd, "note"),
    serviceId: str(fd, "serviceId"), staffId: str(fd, "staffId"), date: str(fd, "date"), time: str(fd, "time"),
  });
  if ("state" in v) return { code: "invalid", error: v.state.error, fields: v.state.fields };
  const d = v.data;

  const { data, error } = await createPublicClient().rpc("public_book", {
    p_slug: slug, p_service: d.serviceId, p_staff: d.staffId === "any" ? null : d.staffId, p_date: d.date, p_time: d.time,
    p_name: d.name, p_phone: d.phone, p_email: d.email, p_note: d.note, p_fingerprint: await fingerprint(),
  });
  if (error || !data) {
    console.error("public_book", error?.code, error?.message);
    return { code: "other", error: "Не удалось создать запись. Попробуйте ещё раз" };
  }

  const r = data as { ok: boolean; id?: string; error?: string; field?: string; message?: string };
  if (r.ok && r.id) redirect(`/book/${slug}/success/${r.id}`);
  switch (r.error) {
    case "slot_taken": return { code: "slot_taken", error: "Это время только что заняли. Выберите другое." };
    case "past": return { code: "past", error: "Нельзя записаться на прошедшее время. Выберите другое." };
    case "rate_limited": return { code: "rate_limited", error: "Слишком много попыток. Подождите несколько минут и попробуйте снова." };
    case "too_many_bookings": return { code: "other", error: "У вас уже есть несколько активных записей. Дождитесь визита или свяжитесь с нами." };
    case "invalid": return { code: "invalid", error: "Проверьте данные", fields: r.field ? { [r.field]: r.message ?? "Некорректное значение" } : {} };
    default: return { code: "other", error: r.message ?? "Запись недоступна. Выберите другую услугу или время." };
  }
}
