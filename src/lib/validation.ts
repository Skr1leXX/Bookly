import { z } from "zod";

const digits = (v: string) => v.replace(/\D/g, "");

const phone = z
  .string()
  .trim()
  .max(25, "Слишком длинный номер")
  .refine((v) => v === "" || (/^\+?[\d\s()-]+$/.test(v) && digits(v).length >= 7 && digits(v).length <= 15), "Некорректный телефон");

const email = z
  .string()
  .trim()
  .max(120, "Слишком длинный email")
  .refine((v) => v === "" || z.email().safeParse(v).success, "Некорректный email");

const id = z.guid("Выберите значение из списка");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Укажите дату");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Укажите время");

const optionalTime = z.union([z.literal(""), time]).optional().transform((v) => v || undefined);

export const clientSchema = z.object({
  name: z.string().trim().min(1, "Укажите имя").max(120, "Не более 120 символов"),
  phone: phone.refine((v) => v !== "", "Укажите телефон"),
  email,
  note: z.string().trim().max(1000, "Не более 1000 символов"),
});

export const serviceSchema = z.object({
  name: z.string().trim().min(1, "Укажите название").max(120, "Не более 120 символов"),
  category: z.string().trim().max(60, "Не более 60 символов"),
  description: z.string().trim().max(500, "Не более 500 символов"),
  duration: z.string().trim().min(1, "Укажите длительность").transform(Number).pipe(z.number("Укажите длительность").int("Целое число минут").min(5, "Не менее 5 минут").max(720, "Не более 720 минут")),
  price: z.string().trim().min(1, "Укажите цену").transform(Number).pipe(z.number("Укажите цену").min(0, "Цена не может быть отрицательной").max(10_000_000, "Слишком большая цена")),
  active: z.boolean(),
});

export const STAFF_COLORS = ["violet", "fuchsia", "indigo", "purple", "sky"] as const;

export const staffSchema = z.object({
  name: z.string().trim().min(1, "Укажите имя").max(120, "Не более 120 символов"),
  jobTitle: z.string().trim().max(80, "Не более 80 символов"),
  phone,
  email,
  color: z.enum(STAFF_COLORS, "Выберите цвет"),
  active: z.boolean(),
  services: z.array(id),
  hours: z
    .array(z.object({ weekday: z.number().int().min(1).max(7), start: time, end: time, breakStart: optionalTime, breakEnd: optionalTime }))
    .refine((h) => h.every((d) => d.start < d.end), "Окончание работы должно быть позже начала")
    .refine((h) => h.every((d) => !d.breakStart === !d.breakEnd), "Укажите начало и конец перерыва или оставьте оба поля пустыми")
    .refine((h) => h.every((d) => !d.breakStart || (d.breakStart < d.breakEnd! && d.breakStart >= d.start && d.breakEnd! <= d.end)), "Перерыв должен быть внутри рабочего времени"),
});

export const APPOINTMENT_STATUSES = ["pending", "confirmed", "completed", "cancelled", "no_show"] as const;

export const appointmentSchema = z.object({
  clientId: z.guid("Выберите клиента"),
  serviceId: z.guid("Выберите услугу"),
  staffId: z.guid("Выберите специалиста"),
  date,
  time,
  status: z.enum(APPOINTMENT_STATUSES, "Выберите статус"),
  notes: z.string().trim().max(1000, "Не более 1000 символов"),
});

export const moveSchema = z.object({ id, staffId: id, date, time });
export const statusSchema = z.object({ id, status: z.enum(APPOINTMENT_STATUSES) });

export const companySchema = z.object({
  name: z.string().trim().min(1, "Укажите название").max(120, "Не более 120 символов"),
  phone,
  email,
  address: z.string().trim().max(200, "Не более 200 символов"),
  description: z.string().trim().max(1000, "Не более 1000 символов"),
  hours: z
    .array(z.object({ weekday: z.number().int().min(1).max(7), start: time, end: time }))
    .refine((h) => h.every((d) => d.start < d.end), "Закрытие должно быть позже открытия"),
});

/** Contact details on the public booking page. All three of name, phone and email are required there. */
export const bookingContactSchema = z.object({
  name: z.string().trim().min(1, "Укажите имя").max(120, "Не более 120 символов"),
  phone: phone.refine((v) => v !== "", "Укажите телефон"),
  email: email.refine((v) => v !== "", "Укажите email"),
  note: z.string().trim().max(500, "Не более 500 символов"),
});

export const bookingSchema = bookingContactSchema.extend({
  serviceId: z.guid("Выберите услугу"),
  staffId: z.union([z.literal("any"), z.guid("Выберите специалиста")]),
  date,
  time,
});
