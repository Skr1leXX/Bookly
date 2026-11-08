// RLS, roles, constraints and triggers, checked against the real migrations in an in-process Postgres (PGlite).
// Run: npm run test:db
import { createDb, ids, makeRunner } from "./setup.mjs";

const { users, ORG1, ORG2, U } = ids;
const db = await createDb();
const run = makeRunner(db);
// These tests place visits at fixed UTC hours; breaks are covered in booking.test.mjs.
await db.exec("update public.working_hours set break_start = null, break_end = null");

let failed = 0;
function check(name, ok, detail = "") {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + detail}`);
}
const q = async (sql) => (await db.query(sql)).rows;
const count = async (who, table, where = "true") => (await run(who, `select count(*)::int c from public.${table} where ${where}`)).rows?.[0]?.c;
const total = async (table, org) => (await q(`select count(*)::int c from public.${table} where org_id='${org}'`))[0].c;

check("seed is idempotent (re-run kept 6 users, 2 orgs)",
  (await q("select (select count(*) from auth.users)::int u, (select count(*) from public.organizations)::int o"))[0].u === 6);

// Isolation: reads ------------------------------------------------------------------------------
for (const t of ["clients", "services", "staff", "appointments", "working_hours", "staff_services"]) {
  check(`alina sees exactly the ${t} of org1`, (await count("alina", t)) === (await total(t, ORG1)));
  check(`boris sees exactly the ${t} of org2`, (await count("boris", t)) === (await total(t, ORG2)));
  check(`boris sees 0 ${t} of org1`, (await count("boris", t, `org_id='${ORG1}'`)) === 0);
}
check("every member of org1 sees the whole org (staff role too)",
  (await count("anna", "appointments")) === (await total("appointments", ORG1)));
check("each user sees exactly 1 organization", (await count("alina", "organizations")) === 1 && (await count("vera", "organizations")) === 1);
check("boris sees only org2 members", (await count("boris", "organization_members", `org_id='${ORG1}'`)) === 0 && (await count("boris", "organization_members")) === 2);
check("boris sees 2 profiles, alina sees 4",
  (await count("boris", "profiles")) === 2 && (await count("alina", "profiles")) === 4);
check("anon cannot read anything",
  !!(await run("anon", "select * from public.clients")).error && !!(await run("anon", "select * from public.appointments")).error);
check("user without membership sees nothing",
  (await run("00000000-0000-0000-0000-00000000dead", "select count(*)::int c from public.appointments")).rows[0].c === 0);

// Isolation: writes -----------------------------------------------------------------------------
const insClient = (org) => `insert into public.clients (org_id, name) values ('${org}', 'X')`;
check("alina can insert client into own org", !(await run("alina", insClient(ORG1))).error);
check("alina cannot insert client into org2", !!(await run("alina", insClient(ORG2))).error);
check("alina cannot move own client to org2",
  !!(await run("alina", `update public.clients set org_id='${ORG2}' where id='${U("c", 1)}'`)).error);
check("alina updates 0 rows of org2 client", (await run("alina", `update public.clients set name='hacked' where id='${U("c", 101)}'`)).affected === 0);
check("alina deletes 0 rows of org2 client", (await run("alina", `delete from public.clients where id='${U("c", 101)}'`)).affected === 0);
check("alina cannot rename org2", (await run("alina", `update public.organizations set name='x' where id='${ORG2}'`)).affected === 0);

// Cross-tenant references -------------------------------------------------------------------------
const insAppt = (o) => `insert into public.appointments (org_id, client_id, service_id, staff_id, starts_at, ends_at, price${o.by ? ", created_by" : ""})
  values ('${o.org ?? ORG1}', '${o.client ?? U("c", 1)}', '${o.service ?? U("f", 1)}', '${o.staff ?? U("e", 1)}', '${o.start ?? "2031-01-01 10:00+00"}', '${o.end ?? "2031-01-01 11:00+00"}', 100${o.by ? `, '${o.by}'` : ""})`;
check("valid appointment is OK", !(await run("alina", insAppt({}))).error);
check("appointment cannot use another org's client", !!(await run("alina", insAppt({ client: U("c", 101) }))).error);
check("appointment cannot use another org's service", !!(await run("alina", insAppt({ service: U("f", 101) }))).error);
check("appointment cannot use another org's specialist", !!(await run("alina", insAppt({ staff: U("e", 101) }))).error);
check("staff_services cannot link across orgs",
  !!(await run("alina", `insert into public.staff_services (org_id, staff_id, service_id) values ('${ORG1}', '${U("e", 4)}', '${U("f", 101)}')`)).error);
check("specialist cannot be tied to a user outside the org",
  !!(await run("alina", `insert into public.staff (org_id, user_id, full_name) values ('${ORG1}', '${users.boris}', 'Чужой')`)).error);
check("specialist can be tied to an org member",
  !(await run("alina", `insert into public.staff (org_id, user_id, full_name) values ('${ORG1}', '${users.pavel}', 'Павел')`)).error);
check("cannot spoof created_by", !!(await run("pavel", insAppt({ by: users.alina }))).error);
check("created_by = self is OK", !(await run("pavel", insAppt({ by: users.pavel }))).error);

// Roles ---------------------------------------------------------------------------------------------
const svc = `insert into public.services (org_id, name, duration_min, price) values ('${ORG1}', 'Новая', 30, 1000)`;
check("owner can add a service", !(await run("alina", svc)).error);
check("admin can add a service", !(await run("pavel", svc)).error);
check("staff cannot add a service", !!(await run("anna", svc)).error);
check("staff cannot edit a service", (await run("anna", `update public.services set price=1 where id='${U("f", 1)}'`)).affected === 0);
check("admin can edit a service", (await run("pavel", `update public.services set price=2600 where id='${U("f", 1)}'`)).affected === 1);
check("staff cannot add a specialist",
  !!(await run("anna", `insert into public.staff (org_id, full_name) values ('${ORG1}', 'Z')`)).error);
check("staff cannot change working hours", (await run("anna", `update public.working_hours set end_time='23:00' where org_id='${ORG1}'`)).affected === 0);
check("admin can change working hours", (await run("pavel", `update public.working_hours set end_time='22:00' where org_id='${ORG1}' and staff_id is null and weekday=1`)).affected === 1);
check("staff cannot link a service to a specialist",
  !!(await run("anna", `insert into public.staff_services (org_id, staff_id, service_id) values ('${ORG1}', '${U("e", 4)}', '${U("f", 1)}')`)).error);
check("staff can insert a client", !(await run("anna", insClient(ORG1))).error);
check("staff can update a client", (await run("anna", `update public.clients set note='n' where id='${U("c", 3)}'`)).affected === 1);
check("staff cannot delete a client", (await run("anna", `delete from public.clients where id='${U("c", 3)}'`)).affected === 0);
check("admin can delete a client", (await run("pavel", `delete from public.clients where id='${U("c", 3)}'`)).affected === 1);
check("staff can book an appointment", !(await run("anna", insAppt({ by: users.anna, staff: U("e", 2), service: U("f", 3), start: "2031-02-01 10:00+00", end: "2031-02-01 11:00+00" }))).error);
check("staff can update own appointment (m1 = anna)", (await run("anna", `update public.appointments set status='confirmed', notes='ok' where id='${U("d", 2)}'`)).affected === 1);
check("staff cannot update a colleague's appointment (m3)", (await run("anna", `update public.appointments set status='cancelled' where id='${U("d", 1)}'`)).affected === 0);
check("staff cannot hand own appointment to a colleague",
  !!(await run("anna", `update public.appointments set staff_id='${U("e", 3)}' where id='${U("d", 2)}'`)).error);
check("staff cannot delete appointments", (await run("anna", `delete from public.appointments where id='${U("d", 2)}'`)).affected === 0);
check("admin can update any appointment", (await run("pavel", `update public.appointments set notes='checked' where id='${U("d", 1)}'`)).affected === 1);
check("admin can delete an appointment", (await run("pavel", `delete from public.appointments where id='${U("d", 1)}'`)).affected === 1);
check("staff cannot add members",
  !!(await run("anna", `insert into public.organization_members (org_id, user_id, role) values ('${ORG1}', '${users.vera}', 'staff')`)).error);
check("admin can add a member",
  !(await run("pavel", `insert into public.organization_members (org_id, user_id, role) values ('${ORG1}', '${users.vera}', 'staff')`)).error);
check("admin cannot grant owner",
  !!(await run("pavel", `insert into public.organization_members (org_id, user_id, role) values ('${ORG1}', '${users.vera}', 'owner')`)).error);
check("admin cannot self-promote to owner",
  !!(await run("pavel", `update public.organization_members set role='owner' where org_id='${ORG1}' and user_id='${users.pavel}'`)).error);
check("owner can promote to owner",
  !(await run("alina", `update public.organization_members set role='owner' where org_id='${ORG1}' and user_id='${users.pavel}'`)).error);
check("admin cannot remove the owner",
  (await run("pavel", `delete from public.organization_members where org_id='${ORG1}' and user_id='${users.alina}'`)).affected === 0);
check("staff cannot rename org", (await run("anna", `update public.organizations set name='x' where id='${ORG1}'`)).affected === 0);
check("admin can edit org", (await run("pavel", `update public.organizations set phone='+7 000' where id='${ORG1}'`)).affected === 1);
check("nobody can change the public booking address through the API",
  ((await run("pavel", `update public.organizations set slug='hacked' where id='${ORG1}'`)).error ?? "").includes("нельзя изменить") &&
  ((await run("alina", `update public.organizations set slug='hacked' where id='${ORG1}'`)).error ?? "").includes("нельзя изменить"));
check("editing the company without touching the slug still works", (await run("pavel", `update public.organizations set name='Новое имя', slug=slug where id='${ORG1}'`)).affected === 1);
check("the slug can be changed without an API user (SQL Editor, seed)", !(await db.query(`update public.organizations set slug='lavanda-demo' where id='${ORG1}'`).then(() => null, (e) => e)));
check("admin cannot delete org", (await run("pavel", `delete from public.organizations where id='${ORG1}'`)).affected === 0);
check("user edits own profile", (await run("anna", `update public.profiles set full_name='A' where id='${users.anna}'`)).affected === 1);
check("user cannot edit others' profile", (await run("anna", `update public.profiles set full_name='A' where id='${users.alina}'`)).affected === 0);
check("nobody can insert organizations directly", !!(await run("alina", `insert into public.organizations (name, slug) values ('x', 'x')`)).error);
check("trigger functions are not callable",
  !!(await run("alina", `select public.handle_new_user()`)).error && !!(await run("alina", `select public.notify_appointment()`)).error);

// Constraints ---------------------------------------------------------------------------------------
check("end must be after start", !!(await run("alina", insAppt({ start: "2031-03-01 11:00+00", end: "2031-03-01 10:00+00" }))).error);
check("price cannot be negative", !!(await run("alina", `update public.services set price=-1 where id='${U("f", 1)}'`)).error);
check("working hours: end after start",
  !!(await run("alina", `insert into public.working_hours (org_id, staff_id, weekday, start_time, end_time) values ('${ORG1}', '${U("e", 1)}', 7, '10:00', '09:00')`)).error);
check("working hours: one row per specialist per weekday",
  !!(await run("alina", `insert into public.working_hours (org_id, staff_id, weekday, start_time, end_time) values ('${ORG1}', '${U("e", 1)}', 1, '10:00', '12:00')`)).error);
check("working hours: weekday 1..7",
  !!(await run("alina", `insert into public.working_hours (org_id, staff_id, weekday, start_time, end_time) values ('${ORG1}', null, 8, '10:00', '12:00')`)).error);
check("empty client name rejected", !!(await run("alina", `insert into public.clients (org_id, name) values ('${ORG1}', '  ')`)).error);
const slot = { start: "2031-04-01 10:00+00", end: "2031-04-01 11:00+00" };
check("double booking of a specialist is rejected",
  !!(await run("alina", [insAppt(slot), insAppt({ ...slot, start: "2031-04-01 10:30+00", end: "2031-04-01 11:30+00" })])).error);
check("back-to-back appointments are fine",
  !(await run("alina", [insAppt(slot), insAppt({ start: "2031-04-01 11:00+00", end: "2031-04-01 12:00+00" })])).error);
check("same time with another specialist is fine",
  !(await run("alina", [insAppt(slot), insAppt({ ...slot, staff: U("e", 2), service: U("f", 3) })])).error);
check("a cancelled visit frees the slot",
  !(await run("alina", [insAppt(slot), `update public.appointments set status='cancelled' where starts_at='${slot.start}'`, insAppt(slot)])).error);
check("service in use cannot be deleted", !!(await run("alina", `delete from public.services where id='${U("f", 1)}'`)).error);

// Notifications -------------------------------------------------------------------------------------
check("notifications are personal (anna 3, maria 1, alina 1)",
  (await count("anna", "notifications")) === 3 && (await count("maria", "notifications")) === 1 && (await count("alina", "notifications")) === 1);
check("pavel sees no notifications", (await count("pavel", "notifications")) === 0);
check("boris cannot see org1 notifications", (await count("boris", "notifications", `org_id='${ORG1}'`)) === 0);
check("user can mark own notification as read",
  (await run("anna", `update public.notifications set is_read=true where user_id='${users.anna}'`)).affected === 3);
check("user cannot touch others' notifications",
  (await run("maria", `update public.notifications set is_read=true where user_id='${users.anna}'`)).affected === 0);
check("user cannot rewrite notification text",
  !!(await run("anna", `update public.notifications set title='x' where user_id='${users.anna}'`)).error);
check("users cannot insert notifications",
  !!(await run("alina", `insert into public.notifications (org_id, user_id, title) values ('${ORG1}', '${users.anna}', 'x')`)).error);
const note = await run("alina", [
  insAppt({ staff: U("e", 1), start: "2031-05-01 10:00+00", end: "2031-05-01 11:00+00" }),
  "reset role",
  `select title, body, is_read from public.notifications where user_id='${users.anna}' and title='Новая запись' and body like 'Елена%' and is_read=false order by created_at desc limit 1`,
]);
check("booking a visit notifies the specialist's login", !note.error && note.rows.length === 1 && note.rows[0].body.startsWith("Елена Миронова"), JSON.stringify(note));
check("booking your own visit does not notify yourself",
  (await run("anna", [insAppt({ staff: U("e", 1), by: users.anna, start: "2031-05-02 10:00+00", end: "2031-05-02 11:00+00" }),
    `select count(*)::int c from public.notifications where user_id='${users.anna}' and created_at > now() - interval '1 minute' and body like 'Елена%'`])).rows[0].c === 0);
check("cancelling notifies the specialist",
  (await run("alina", [`update public.appointments set status='cancelled' where id='${U("d", 2)}'`, "reset role",
    `select count(*)::int c from public.notifications where user_id='${users.anna}' and type='appointment_cancelled'`])).rows[0].c === 1);
check("user can delete own notification", (await run("anna", `delete from public.notifications where user_id='${users.anna}'`)).affected === 3);

// Booking rules (trigger) and save_staff() -------------------------------------------------------------
const msg = async (who, sql) => (await run(who, sql)).error ?? "";
check("no_show status is available", (await run("pavel", `update public.appointments set status='no_show' where id='${U("d", 2)}'`)).affected === 1);
check("inactive specialist cannot be booked",
  (await msg("alina", [`update public.staff set is_active=false where id='${U("e", 1)}'`, insAppt({})])).includes("отключён"));
check("inactive service cannot be booked",
  (await msg("alina", [`update public.services set is_active=false where id='${U("f", 1)}'`, insAppt({})])).includes("Услуга отключена"));
check("specialist must perform the service", (await msg("alina", insAppt({ staff: U("e", 4) }))).includes("не оказывает"));
check("booking outside working hours is rejected", (await msg("alina", insAppt({ start: "2031-01-01 17:00+00", end: "2031-01-01 18:00+00" }))).includes("не работает"));
check("booking on a day off is rejected (Sunday)", (await msg("alina", insAppt({ start: "2031-01-05 10:00+00", end: "2031-01-05 11:00+00" }))).includes("не работает"));
check("booking cannot cross midnight", (await msg("alina", insAppt({ start: "2031-01-01 20:30+00", end: "2031-01-01 21:30+00" }))).includes("следующий день"));
check("completed history is not re-validated (inactive specialist)",
  !(await run("alina", [`update public.staff set is_active=false where id='${U("e", 1)}'`,
    `insert into public.appointments (org_id, client_id, service_id, staff_id, starts_at, ends_at, price, status) values ('${ORG1}', '${U("c", 1)}', '${U("f", 1)}', '${U("e", 1)}', '2031-01-05 10:00+00', '2031-01-05 11:00+00', 1, 'completed')`])).error);
check("rescheduling is validated",
  !!(await run("pavel", `update public.appointments set starts_at='2031-01-05 10:00+00', ends_at='2031-01-05 11:00+00' where id='${U("d", 2)}'`)).error &&
  (await run("pavel", `update public.appointments set starts_at='2031-01-01 10:00+00', ends_at='2031-01-01 11:00+00' where id='${U("d", 2)}'`)).affected === 1);
check("editing notes of an active visit does not re-validate the slot",
  (await run("pavel", `update public.appointments set notes='x' where id='${U("d", 3)}'`)).affected === 1);
check("moving onto an occupied slot is rejected",
  !!(await run("pavel", [`update public.appointments set starts_at='2031-06-02 10:00+00', ends_at='2031-06-02 11:00+00' where id='${U("d", 2)}'`,
    `update public.appointments set starts_at='2031-06-02 10:30+00', ends_at='2031-06-02 11:30+00' where id='${U("d", 12)}'`])).error);

const saveStaff = (id, name, services, hours, active = true) =>
  `select public.save_staff('${ORG1}', ${id ? `'${id}'` : "null"}, '${name}', 'Мастер', '+7 900', 'x@y.test', 'sky', ${active}, array[${services.map((s) => `'${s}'::uuid`).join(",")}]::uuid[], '${JSON.stringify(hours)}'::jsonb) id`;
const hrs = [{ weekday: 1, start: "10:00", end: "18:00" }, { weekday: 3, start: "12:00", end: "20:00" }];
const created = await run("pavel", [saveStaff(null, "Новый мастер", [U("f", 1), U("f", 3)], hrs),
  `select (select count(*)::int from public.staff_services ss join public.staff s on s.id = ss.staff_id where s.full_name = 'Новый мастер') svc,
          (select count(*)::int from public.working_hours w join public.staff s on s.id = w.staff_id where s.full_name = 'Новый мастер') hrs`]);
check("save_staff creates a specialist with services and schedule", created.rows?.[0]?.svc === 2 && created.rows[0].hrs === 2, JSON.stringify(created));
const updated = await run("pavel", [saveStaff(U("e", 1), "Анна К.", [U("f", 1)], [hrs[0]], false),
  `select s.full_name, s.is_active, (select count(*)::int from public.staff_services where staff_id = s.id) svc,
          (select count(*)::int from public.working_hours where staff_id = s.id) hrs from public.staff s where s.id = '${U("e", 1)}'`]);
check("save_staff replaces services and schedule, can disable", updated.rows?.[0]?.full_name === "Анна К." && updated.rows[0].is_active === false && updated.rows[0].svc === 1 && updated.rows[0].hrs === 1, JSON.stringify(updated));
check("staff role cannot call save_staff", !!(await run("anna", saveStaff(null, "X", [], []))).error);
check("save_staff cannot edit another org's specialist", (await msg("boris", saveStaff(U("e", 1), "Hack", [], []))).length > 0);
check("save_staff rejects another org's service", !!(await run("pavel", saveStaff(null, "X", [U("f", 101)], []))).error);
check("save_staff is atomic (bad schedule rolls back the specialist)",
  (await run("pavel", [saveStaff(null, "Атомарный", [], [{ weekday: 9, start: "10:00", end: "11:00" }])])).error !== undefined &&
  (await q("select count(*)::int c from public.staff where full_name = 'Атомарный'"))[0].c === 0);
check("anon cannot call save_staff", !!(await run("anon", saveStaff(null, "X", [], []))).error);

const saveCompany = (org, name, hours) =>
  `select public.save_company('${org}', '${name}', '+7 1', 'a@b.test', 'Адрес', 'Описание', '${JSON.stringify(hours)}'::jsonb)`;
const comp = await run("pavel", [saveCompany(ORG1, "Новое имя", [{ weekday: 1, start: "09:00", end: "20:00" }]),
  `select (select name from public.organizations where id='${ORG1}') name, (select count(*)::int from public.working_hours where org_id='${ORG1}' and staff_id is null) hrs,
          (select count(*)::int from public.working_hours where org_id='${ORG1}' and staff_id is not null) staff_hrs`]);
check("save_company updates the profile and replaces opening hours only", comp.rows?.[0]?.name === "Новое имя" && comp.rows[0].hrs === 1 && comp.rows[0].staff_hrs > 0, JSON.stringify(comp));
check("staff role cannot save the company", !!(await run("anna", saveCompany(ORG1, "X", []))).error);
check("another org's admin cannot save the company", !!(await run("boris", saveCompany(ORG1, "X", []))).error);
check("anon cannot save the company", !!(await run("anon", saveCompany(ORG1, "X", []))).error);

// Sign-up trigger -----------------------------------------------------------------------------------
await db.exec(`insert into auth.users (id, email, raw_user_meta_data)
  values ('${U("b", 50)}', 'new@x.test', '{"full_name":"Новый","company":"Моя Студия"}')`);
const org = (await q(`select o.name, o.slug, m.role from public.organizations o
  join public.organization_members m on m.org_id=o.id where m.user_id='${U("b", 50)}'`))[0];
check("sign-up creates org + owner membership", org?.name === "Моя Студия" && org.role === "owner" && org.slug.startsWith("org-"), JSON.stringify(org));
await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('${U("b", 51)}', 'solo@x.test', '{"full_name":"Solo"}')`);
check("sign-up without company creates profile only",
  (await q(`select count(*)::int c from public.profiles where id='${U("b", 51)}'`))[0].c === 1 &&
  (await q(`select count(*)::int c from public.organization_members where user_id='${U("b", 51)}'`))[0].c === 0);
check("new owner sees none of the demo data", (await run(U("b", 50), "select count(*)::int c from public.clients")).rows[0].c === 0);
check("new owner can create data in the new org",
  !(await run(U("b", 50), `insert into public.clients (org_id, name) select org_id, 'Первый клиент' from public.organization_members where user_id='${U("b", 50)}'`)).error);

// Cascades --------------------------------------------------------------------------------------------
await db.exec(`delete from public.organizations where id='${ORG2}'`);
check("deleting org cascades to its data",
  (await q(`select (select count(*) from public.clients where org_id='${ORG2}') + (select count(*) from public.appointments where org_id='${ORG2}') + (select count(*) from public.notifications where org_id='${ORG2}') c`))[0].c == 0);

console.log(failed ? `\n${failed} FAILED` : "\nALL PASSED");
process.exit(failed ? 1 : 0);
