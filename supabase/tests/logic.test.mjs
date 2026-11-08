// Pure app logic: validation, CSV, scheduling hints, timezone conversion, DB error mapping. Needs Node 22.18+.
import assert from "node:assert/strict";
import { csvCell, toCsv } from "../../src/lib/csv.ts";
import { localToIso } from "../../src/lib/dates.ts";
import { dbError } from "../../src/lib/actions/util.ts";
import { findConflict, slotProblem } from "../../src/lib/scheduling.ts";
import { appointmentSchema, clientSchema, serviceSchema, staffSchema } from "../../src/lib/validation.ts";

let n = 0;
const t = (name, fn) => (fn(), console.log("PASS ", name), n++);
const ok = (s, v) => s.safeParse(v).success;
const U = "c0000000-0000-0000-0000-000000000001";

t("client: name and phone required, email/phone formats", () => {
  const base = { name: "Анна", phone: "+7 (900) 111-22-33", email: "", note: "" };
  assert.ok(ok(clientSchema, base));
  assert.ok(!ok(clientSchema, { ...base, name: "  " }));
  assert.ok(!ok(clientSchema, { ...base, phone: "" }));
  assert.ok(!ok(clientSchema, { ...base, phone: "abc" }));
  assert.ok(!ok(clientSchema, { ...base, phone: "12" }));
  assert.ok(!ok(clientSchema, { ...base, email: "x@" }));
  assert.ok(ok(clientSchema, { ...base, email: "a@b.ru" }));
  assert.ok(!ok(clientSchema, { ...base, note: "x".repeat(1001) }));
});
t("service: duration 5..720, price >= 0", () => {
  const base = { name: "S", category: "", description: "", duration: "60", price: "100", active: true };
  assert.ok(ok(serviceSchema, base));
  assert.ok(!ok(serviceSchema, { ...base, duration: "4" }));
  assert.ok(!ok(serviceSchema, { ...base, duration: "1.5" }));
  assert.ok(!ok(serviceSchema, { ...base, price: "-1" }));
  assert.ok(!ok(serviceSchema, { ...base, price: "" }));
});
t("staff: schedule end after start, known colour", () => {
  const base = { name: "M", jobTitle: "", phone: "", email: "", color: "sky", active: true, services: [U], hours: [{ weekday: 1, start: "10:00", end: "18:00" }] };
  assert.ok(ok(staffSchema, base));
  assert.ok(!ok(staffSchema, { ...base, hours: [{ weekday: 1, start: "18:00", end: "10:00" }] }));
  assert.ok(!ok(staffSchema, { ...base, color: "red" }));
  assert.ok(!ok(staffSchema, { ...base, services: ["nope"] }));
});
t("appointment: status list includes no_show, date/time formats", () => {
  const base = { clientId: U, serviceId: U, staffId: U, date: "2026-11-05", time: "10:30", status: "no_show", notes: "" };
  assert.ok(ok(appointmentSchema, base));
  assert.ok(!ok(appointmentSchema, { ...base, time: "25:00" }));
  assert.ok(!ok(appointmentSchema, { ...base, date: "5.11.2026" }));
  assert.ok(!ok(appointmentSchema, { ...base, status: "done" }));
});
t("csv: escaping and formula injection", () => {
  assert.equal(csvCell('a;b"c'), '"a;b""c"');
  assert.equal(csvCell("=HYPERLINK(1)"), "'=HYPERLINK(1)");
  assert.equal(csvCell("+7 (915) 120-45-67"), "+7 (915) 120-45-67");
  assert.equal(csvCell("line1\nline2"), "line1 line2");
  assert.ok(toCsv(["a"], [["b"]]).startsWith("\uFEFFa\r\nb"));
});
t("localToIso handles Moscow and DST", () => {
  assert.equal(localToIso("2026-11-05", "09:30", "Europe/Moscow"), "2026-11-05T06:30:00.000Z");
  assert.equal(localToIso("2026-07-01", "09:30", "Europe/Berlin"), "2026-07-01T07:30:00.000Z");
});
const staff = { hours: [{ weekday: 4, start: "10:00", end: "19:00" }] };
t("scheduling: working window and conflicts", () => {
  assert.equal(slotProblem(staff, "2026-11-05", "10:00", 60), null); // Thursday
  assert.match(slotProblem(staff, "2026-11-05", "18:30", 60), /работает с 10:00 до 19:00/);
  assert.match(slotProblem(staff, "2026-11-06", "10:00", 60), /выходной/);
  const a = [{ id: "1", staffId: "s", date: "d", time: "10:00", endTime: "11:00", status: "confirmed" }];
  const q = { staffId: "s", date: "d", duration: 30 };
  assert.ok(findConflict(a, { ...q, time: "10:30" }));
  assert.ok(!findConflict(a, { ...q, time: "11:00" })); // back to back is fine
  assert.ok(!findConflict(a, { ...q, time: "10:30", excludeId: "1" }));
  assert.ok(!findConflict([{ ...a[0], status: "cancelled" }], { ...q, time: "10:30" }));
});
t("dbError maps codes to user messages", () => {
  assert.match(dbError({ code: "42501" }).error, /прав/);
  assert.match(dbError({ code: "23P01" }).error, /занято/);
  assert.equal(dbError({ code: "P0001", message: "Специалист не работает в это время" }).error, "Специалист не работает в это время");
  assert.doesNotMatch(dbError({ code: "XX000", message: "secret internals" }).error, /secret/);
});
console.log(`\nALL PASSED (${n})`);
