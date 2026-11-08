// Public online booking: availability, validation, double booking, abuse limits and what an anonymous visitor can see.
// Runs the real migrations in PGlite as the `anon` role (exactly what the public page uses). Run: npm run test:db
import { createDb, ids, makeRunner } from "./setup.mjs";

const { ORG1, U, users } = ids;
const db = await createDb();
const run = makeRunner(db); // rolled back
const commit = makeRunner(db, { commit: true }); // persists, like real requests
const q = async (sql) => (await db.query(sql)).rows;

let failed = 0;
function check(name, ok, detail = "") {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + detail}`);
}

const lit = (v) => (v === null || v === undefined ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const rpc = async (fn, ...args) => {
  const r = await commit("anon", `select public.${fn}(${args.map(lit).join(", ")}) as r`);
  if (r.error) throw new Error(`${fn}: ${r.error}`);
  return r.rows[0].r;
};

// Dates in the organization's time zone (Europe/Moscow)
const today = (await q("select to_char((now() at time zone 'Europe/Moscow')::date, 'YYYY-MM-DD') d"))[0].d;
const plus = async (n) => (await q(`select to_char((${lit(today)}::date + ${n}), 'YYYY-MM-DD') d`))[0].d;
const isoDow = async (d) => Number((await q(`select extract(isodow from ${lit(d)}::date)::int n`))[0].n);
let TUE = await plus(7);
while ((await isoDow(TUE)) !== 2) TUE = await plus(Number((await q(`select (${lit(TUE)}::date - ${lit(today)}::date) n`))[0].n) + 1);
const WED = await plus(Number((await q(`select (${lit(TUE)}::date - ${lit(today)}::date) n`))[0].n) + 1);

const F_CUT = U("f", 1), F_STYLE = U("f", 3), F_COLOR = U("f", 2), F_FACE = U("f", 6);
const M1 = U("e", 1), M4 = U("e", 4);
const SLUG = "lavanda-demo";
const resetAttempts = () => db.exec("delete from public.booking_attempts");
const book = (o) =>
  rpc("public_book", SLUG, o.service ?? F_CUT, "staff" in o ? o.staff : M1, o.date ?? TUE, o.time ?? "10:00", o.name ?? "Ирина Тестова", o.phone ?? "+7 (900) 555-01-01", o.email ?? "irina@example.com", o.note ?? "", o.fp ?? "fp-default");
const times = (s) => s.map((x) => x.time);

// What a visitor sees --------------------------------------------------------------------------------------------
const org = await rpc("public_org", SLUG);
check("public page data: name, description, today", org.name.includes("Лаванда") && org.description.length > 0 && org.today === today);
check("only active services with a specialist are listed (7 of 8)", org.services.length === 7 && !org.services.some((s) => s.name.includes("Лечебный")), String(org.services.length));
check("no contact data of staff is exposed", org.staff.length === 5 && org.staff.every((s) => !("phone" in s) && !("email" in s) && !("userId" in s)));
check("an unknown organization returns null", (await rpc("public_org", "no-such-salon")) === null);
check("another organization's data is not mixed in", (await rpc("public_org", "borodach-demo")).services.length === 2);
await db.exec(`update public.staff set is_active=false where id='${M4}'`);
check("a disabled specialist hides services only they perform", !(await rpc("public_org", SLUG)).services.some((s) => s.id === F_FACE));
await db.exec(`update public.staff set is_active=true where id='${M4}'`);
await db.exec(`update public.services set is_active=false where id='${F_STYLE}'`);
check("a disabled service has no slots", (await rpc("public_slots", SLUG, F_STYLE, null, TUE)).length === 0);
await db.exec(`update public.services set is_active=true where id='${F_STYLE}'`);

// Availability ---------------------------------------------------------------------------------------------------
const cut = times(await rpc("public_slots", SLUG, F_CUT, M1, TUE));
check("slots follow the working window (10:00 first, 18:00 last for 60 min)", cut[0] === "10:00" && cut.at(-1) === "18:00" && !cut.includes("18:15" ) && !cut.includes("09:45"), cut.join(","));
check("the lunch break 13:00-14:00 is excluded, incl. visits that would run into it",
  !cut.some((t) => t >= "12:15" && t <= "13:45") && cut.includes("12:00") && cut.includes("14:00"), cut.join(","));
const color = times(await rpc("public_slots", SLUG, F_COLOR, null, TUE));
check("duration is respected (210 min: no start before the break, last start 16:30)", color[0] === "14:00" && color.at(-1) === "16:30", color.join(","));
check("a day off has no slots (Anna does not work on Saturday)", (await rpc("public_slots", SLUG, F_CUT, M1, await plus(Number((await q(`select (${lit(TUE)}::date - ${lit(today)}::date) n`))[0].n) + 4))).length === 0);
check("past dates and dates beyond 60 days have no slots",
  (await rpc("public_slots", SLUG, F_CUT, null, await plus(-1))).length === 0 && (await rpc("public_slots", SLUG, F_CUT, null, await plus(61))).length === 0);
const todaySlots = await rpc("public_slots", SLUG, F_CUT, null, today);
const nowLocal = (await q("select to_char((now() at time zone 'Europe/Moscow') + interval '1 hour', 'HH24:MI') t"))[0].t;
check("today only offers times at least an hour from now", todaySlots.every((s) => s.time >= nowLocal) || nowLocal < "01:00", `${nowLocal} ${times(todaySlots).slice(0, 3)}`);

// Booking: success ------------------------------------------------------------------------------------------------
await resetAttempts();
const ok1 = await book({ time: "10:00", fp: "fp-a" });
check("booking succeeds and returns an id", ok1.ok === true && /^[0-9a-f-]{36}$/.test(ok1.id), JSON.stringify(ok1));
const row = (await q(`select a.*, c.name cname, c.phone cphone, c.email cemail, to_char(a.starts_at at time zone 'Europe/Moscow','YYYY-MM-DD HH24:MI') local_start from public.appointments a join public.clients c on c.id=a.client_id where a.id='${ok1.id}'`))[0];
check("the appointment is stored: pending, online, fixed price, local time, 60 min",
  row.status === "pending" && row.source === "online" && Number(row.price) === 2500 && row.local_start === `${TUE} 10:00` && row.staff_id === M1 && row.ends_at - row.starts_at === 3_600_000, JSON.stringify(row));
check("a client record is created with the contact data", row.cname === "Ирина Тестова" && row.cphone.includes("555-01-01") && row.cemail === "irina@example.com");
check("it is visible to the administrator through RLS (admin panel / calendar)",
  (await run("pavel", `select count(*)::int c from public.appointments where id='${ok1.id}'`)).rows[0].c === 1 && (await run("alina", `select count(*)::int c from public.appointments where id='${ok1.id}'`)).rows[0].c === 1);
check("it is invisible to another organization", (await run("boris", `select count(*)::int c from public.appointments where id='${ok1.id}'`)).rows[0].c === 0);
const notes = await q(`select user_id from public.notifications where appointment_id='${ok1.id}'`);
check("owner, admin and the specialist's login are notified", [users.alina, users.pavel, users.anna].every((u) => notes.some((n) => n.user_id === u)) && notes.length === 3, JSON.stringify(notes));
const detail = await rpc("public_appointment", ok1.id);
check("confirmation details: service, specialist, time, no contacts", detail.service === "Женская стрижка" && detail.staff === "Анна Ковалёва" && detail.time === "10:00" && detail.endTime === "11:00" && detail.clientName === "Ирина" && !JSON.stringify(detail).includes("555") && !JSON.stringify(detail).includes("example.com"), JSON.stringify(detail));
check("an unknown id has no details", (await rpc("public_appointment", U("d", 9999))) === null);
check("admin-created appointments are not exposed to the public", (await rpc("public_appointment", U("d", 2))) === null);

// Booking: conflicts ----------------------------------------------------------------------------------------------
const after = times(await rpc("public_slots", SLUG, F_CUT, M1, TUE));
check("a taken slot disappears (and overlapping starts too)", !after.includes("10:00") && !after.includes("10:15") && !after.includes("10:45") && after.includes("11:00"), after.join(","));
const dup = await book({ time: "10:00", name: "Другой Человек", phone: "+7 (900) 555-02-02", fp: "fp-b" });
check("booking an occupied time fails with slot_taken", dup.ok === false && dup.error === "slot_taken", JSON.stringify(dup));
check("overlapping start is rejected too", (await book({ time: "10:30", fp: "fp-b" })).error === "slot_taken");
check("back-to-back is allowed", (await book({ time: "11:00", name: "Пётр Иванов", phone: "+7 (900) 555-03-03", email: "p@example.com", fp: "fp-c" })).ok === true);
check("booking inside the break is rejected", (await book({ time: "13:00", name: "Пётр Иванов", phone: "+7 (900) 555-03-03", fp: "fp-c" })).error === "slot_taken");
check("a specialist who does not perform the service is rejected", (await book({ staff: M4, time: "11:00", fp: "fp-d" })).error === "slot_taken");
check("outside working hours is rejected", (await book({ time: "19:00", fp: "fp-d" })).error === "slot_taken" && (await book({ time: "08:00", fp: "fp-d" })).error === "slot_taken");
await resetAttempts();
check("past time is rejected", (await book({ date: await plus(-1), fp: "fp-d" })).error === "past");
check("more than 60 days ahead is rejected", (await book({ date: await plus(90), fp: "fp-d" })).ok === false);
check("only one row exists per taken slot", (await q(`select count(*)::int c from public.appointments where staff_id='${M1}' and starts_at = (${lit(TUE)}::date + time '10:00') at time zone 'Europe/Moscow'`))[0].c === 1);

// "Any specialist" --------------------------------------------------------------------------------------------------
await resetAttempts();
const anyA = await rpc("public_slots", SLUG, F_STYLE, null, TUE);
check("any specialist: one entry per time", anyA.filter((s) => s.time === "10:00").length === 1);
const b1 = await book({ service: F_STYLE, staff: null, time: "15:00", name: "Анна Один", phone: "+7 (900) 600-00-01", fp: "fp-e" });
const b2 = await book({ service: F_STYLE, staff: null, time: "15:00", name: "Анна Два", phone: "+7 (900) 600-00-02", fp: "fp-e" });
const b3 = await book({ service: F_STYLE, staff: null, time: "15:00", name: "Анна Три", phone: "+7 (900) 600-00-03", fp: "fp-e" });
const who = await q(`select distinct staff_id from public.appointments where id in ('${b1.id}','${b2.id}')`);
check("any specialist: two parallel visits go to two different specialists, the third fails", b1.ok && b2.ok && who.length === 2 && b3.error === "slot_taken", JSON.stringify([b1, b2, b3]));

// Validation ----------------------------------------------------------------------------------------------------------
await resetAttempts();
const before = (await q("select (select count(*) from public.clients)::int c, (select count(*) from public.appointments)::int a"))[0];
for (const [field, patch] of [["name", { name: "   " }], ["phone", { phone: "abc" }], ["phone", { phone: "12345" }], ["email", { email: "no-at.example.com" }], ["email", { email: "" }], ["note", { note: "x".repeat(501) }], ["time", { time: "25:99" }]]) {
  const r = await book({ time: "16:00", fp: `fp-v-${field}`, ...patch, phone: patch.phone ?? `+7 (900) 7${String(Math.random()).slice(2, 8)}` });
  check(`invalid ${field} is rejected with a message`, r.ok === false && r.error === "invalid" && r.field === field && !!r.message, JSON.stringify(r));
}
const after2 = (await q("select (select count(*) from public.clients)::int c, (select count(*) from public.appointments)::int a"))[0];
check("invalid requests create nothing", before.c === after2.c && before.a === after2.a);

// Clients: reuse without overwriting ---------------------------------------------------------------------------------
await resetAttempts();
const r1 = await book({ time: "16:00", name: "Олег Повторов", phone: "+7 (900) 800-00-01", email: "oleg@example.com", fp: "fp-f" });
const r2 = await book({ date: WED, time: "10:00", name: "олег повторов", phone: "8 900 800 00 01", email: "other@example.com", fp: "fp-f" });
check("same phone and name reuse one client and keep the stored email", r1.ok && r2.ok &&
  (await q(`select count(distinct client_id)::int c, min(c.email) e from public.appointments a join public.clients c on c.id=a.client_id where a.id in ('${r1.id}','${r2.id}')`))[0].c === 1, "");
const r3 = await book({ date: WED, time: "11:00", name: "Другой Олег", phone: "+7 (900) 800-00-01", email: "x@example.com", fp: "fp-f" });
check("same phone, different name: a new client is created, the old one is untouched",
  r3.ok && (await q(`select count(*)::int c from public.clients where name='Олег Повторов' and email='oleg@example.com'`))[0].c === 1, JSON.stringify(r3));
const r4 = await book({ date: WED, time: "12:00", name: "Олег Повторов", phone: "+7 (900) 800-00-01", fp: "fp-f2" });
check("at most 3 live bookings per phone", r4.ok === false && r4.error === "too_many_bookings", JSON.stringify(r4));

// Abuse protection ---------------------------------------------------------------------------------------------------
await resetAttempts();
const attempt = (fp, i, phone) => book({ time: "17:00", fp, name: "Спам", phone: phone ?? `+7 (900) 9${String(i).padStart(2, "0")}-00-00`, email: "bad" });
for (let i = 0; i < 5; i++) await attempt("fp-spam", i);
check("per-IP limit: the 6th attempt in 10 minutes is rate limited", (await attempt("fp-spam", 6)).error === "rate_limited");
check("another IP is not affected", (await attempt("fp-other", 7)).error === "invalid");
await resetAttempts();
for (let i = 0; i < 5; i++) await attempt(`fp-ph-${i}`, 0, "+7 (900) 111-11-11");
check("per-phone limit holds even when the IP changes", (await attempt("fp-ph-new", 0, "+7 (900) 111-11-11")).error === "rate_limited");
await resetAttempts();
await db.exec(`insert into public.booking_attempts (org_id, fingerprint, phone_key) select '${ORG1}', 'f' || g, 'p' || g from generate_series(1, 30) g`);
check("organization-wide limit holds for any caller (even a forged fingerprint)", (await attempt("never-seen", 1)).error === "rate_limited");
check("the limit is per organization", (await rpc("public_book", "borodach-demo", U("f", 101), U("e", 101), TUE, "11:00", "Сергей Тест", "+7 (900) 222-22-22", "s@example.com", "", "fp-x")).ok === true);
await resetAttempts();

// Direct access ------------------------------------------------------------------------------------------------------
for (const t of ["clients", "appointments", "services", "staff", "working_hours", "notifications", "booking_attempts", "organizations"]) {
  check(`anon cannot read ${t} directly`, !!(await run("anon", `select * from public.${t} limit 1`)).error);
}
check("anon cannot insert an appointment directly", !!(await run("anon", `insert into public.appointments (org_id, client_id, service_id, staff_id, starts_at, ends_at) values ('${ORG1}', '${U("c", 1)}', '${F_CUT}', '${M1}', now(), now() + interval '1 hour')`)).error);
check("the internal slot function is not callable", !!(await run("anon", `select * from public._slots('${ORG1}', '${F_CUT}', null, '${TUE}')`)).error);
check("an authenticated user cannot read the attempt log either", !!(await run("alina", "select * from public.booking_attempts")).error);

// Admin rules know about breaks ------------------------------------------------------------------------------------------
const adminInsert = (time) => `insert into public.appointments (org_id, client_id, service_id, staff_id, starts_at, ends_at, price, created_by)
  values ('${ORG1}', '${U("c", 1)}', '${F_CUT}', '${M1}', (${lit(WED)}::date + time '${time}') at time zone 'Europe/Moscow', (${lit(WED)}::date + time '${time}' + interval '1 hour') at time zone 'Europe/Moscow', 1, '${users.alina}')`;
check("the admin cannot book into a break either", ((await run("alina", adminInsert("13:00"))).error ?? "").includes("перерыв"));
check("the admin can book outside the break", !(await run("alina", adminInsert("15:00"))).error);
check("break must lie inside working hours", !!(await run("alina", `update public.working_hours set break_start='08:00', break_end='09:00' where staff_id='${M1}' and weekday=2`)).error);

console.log(failed ? `\n${failed} FAILED` : "\nALL PASSED");
process.exit(failed ? 1 : 0);
