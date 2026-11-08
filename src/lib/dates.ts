const MS_DAY = 86_400_000;

export const addDays = (iso: string, n: number) =>
  new Date(Date.parse(iso) + n * MS_DAY).toISOString().slice(0, 10);

export const startOfWeek = (iso: string) => {
  const dow = (new Date(iso).getUTCDay() + 6) % 7; // пн = 0
  return addDays(iso, -dow);
};

export const addMinutes = (time: string, min: number) => {
  const [h, m] = time.split(":").map(Number);
  const t = h * 60 + m + min;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

export const toMinutes = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

const fmt = (opts: Intl.DateTimeFormatOptions) => (iso: string) =>
  new Intl.DateTimeFormat("ru-RU", { ...opts, timeZone: "UTC" }).format(new Date(iso));

export const formatDay = fmt({ day: "numeric", month: "long" });
export const formatDayShort = fmt({ day: "numeric", month: "short" });
export const formatWeekday = fmt({ weekday: "short" });
export const formatFull = fmt({ weekday: "long", day: "numeric", month: "long" });

export const formatMoney = (n: number) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n).replace(/\u00a0/g, " ") + " ₽";

/** Сегодняшняя дата (yyyy-mm-dd) в часовом поясе организации. */
export const todayIn = (tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());

/** Дата и время (yyyy-mm-dd, HH:MM) момента `iso` в часовом поясе организации. */
export function localParts(iso: string, tz: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value]),
  );
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

/** Момент (ISO, UTC) для локальных даты и времени в часовом поясе `tz`. Двойная поправка на смещение учитывает переход на летнее время. */
export function localToIso(date: string, time: string, tz: string) {
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, h, mi);
  const offset = (t: number) => {
    const p = localParts(new Date(t).toISOString(), tz);
    const [py, pm, pd] = p.date.split("-").map(Number);
    const [ph, pmi] = p.time.split(":").map(Number);
    return Date.UTC(py, pm - 1, pd, ph, pmi) - t;
  };
  const first = wall - offset(wall);
  return new Date(wall - offset(first)).toISOString();
}
