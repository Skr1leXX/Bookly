// CSV for Excel in Russian locales: ";" separator, UTF-8 BOM, CRLF.

const PLAIN_PHONE = /^\+?[\d\s()-]+$/;

/** One cell. Text starting with = + - @ would be run as a formula by spreadsheets, so it gets a leading apostrophe (phone numbers are left as they are). */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  let s = value.replace(/\r?\n/g, " ");
  if (/^[=+\-@\t\r]/.test(s) && !PLAIN_PHONE.test(s)) s = "'" + s;
  return /[";]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  return "\uFEFF" + [header, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n") + "\r\n";
}
