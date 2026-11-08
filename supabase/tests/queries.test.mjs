// The app's real data loader (src/lib/data/load.ts) run against the migrated + seeded database as different users.
// A tiny stub stands in for supabase-js: it turns each query into SQL executed under the user's role, so RLS applies
// and every selected column must exist. (PostgREST itself is not involved: embeds are resolved by hand.)
// Needs Node 22.18+ (runs .ts files natively). Run: npm run test:db
import { createDb, ids, makeRunner } from "./setup.mjs";
import { dailyStats, newClientsCount, popularServices, todayAppointments, upcomingAppointments } from "../../src/lib/data/derive.ts";
import { loadOrgData } from "../../src/lib/data/load.ts";

const { ORG1, ORG2, U } = ids;
const db = await createDb();
const run = makeRunner(db);

function splitTop(s) {
  const out = [];
  let depth = 0, cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; } else cur += ch;
  }
  return [...out, cur.trim()].filter(Boolean);
}
const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;
const plain = (rows) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : v])));

function stubClient(who) {
  return {
    from(table) {
      const q = { cols: "*", where: [], order: [], limit: "", one: false };
      const b = {
        select: (c) => ((q.cols = c), b),
        eq: (k, v) => (q.where.push(`${k} = ${lit(v)}`), b),
        gte: (k, v) => (q.where.push(`${k} >= ${lit(v)}`), b),
        order: (k, o = {}) => (q.order.push(`${k} ${o.ascending === false ? "desc" : "asc"}`), b),
        limit: (n) => ((q.limit = ` limit ${n}`), b),
        single: () => ((q.one = true), b),
        maybeSingle: () => ((q.one = "maybe"), b),
        then: (res, rej) => exec().then(res, rej),
      };
      async function exec() {
        const parts = splitTop(q.cols);
        const base = parts.filter((p) => !p.includes("("));
        const embeds = parts.filter((p) => p.includes("(")).map((p) => ({ rel: p.slice(0, p.indexOf("(")), cols: p.slice(p.indexOf("(") + 1, -1) }));
        const sql = `select ${base.join(", ") || "*"}${embeds.some((e) => e.rel === "staff_services") ? ", id" : ""} from public.${table}` +
          (q.where.length ? ` where ${q.where.join(" and ")}` : "") + (q.order.length ? ` order by ${q.order.join(", ")}` : "") + q.limit;
        const r = await run(who, sql);
        if (r.error) return { data: null, error: { message: r.error } };
        let rows = plain(r.rows);
        for (const e of embeds) {
          if (e.rel !== "staff_services") throw new Error(`stub cannot embed ${e.rel}`);
          const rel = await run(who, `select staff_id, ${e.cols} from public.staff_services`);
          if (rel.error) return { data: null, error: { message: rel.error } };
          rows = rows.map((row) => ({ ...row, staff_services: rel.rows.filter((x) => x.staff_id === row.id).map((x) => Object.fromEntries(Object.entries(x).filter(([k]) => k !== "staff_id"))) }));
          if (!base.includes("id")) rows.forEach((row) => delete row.id);
        }
        if (q.one) {
          if (rows.length === 0) return q.one === "maybe" ? { data: null, error: null } : { data: null, error: { message: "JSON object requested, multiple (or no) rows returned" } };
          return { data: rows[0], error: null };
        }
        return { data: rows, error: null };
      }
      return b;
    },
  };
}

let failed = 0;
function check(name, ok, detail = "") {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + detail}`);
}

const alina = await loadOrgData(stubClient("alina"), ORG1, "Europe/Moscow");
const anna = await loadOrgData(stubClient("anna"), ORG1, "Europe/Moscow");
const boris = await loadOrgData(stubClient("boris"), ORG2, "Europe/Moscow");

// Shape and counts
check("owner loads the whole org", alina.clients.length === 12 && alina.services.length === 8 && alina.staff.length === 5, JSON.stringify([alina.clients.length, alina.services.length, alina.staff.length]));
check("staff role sees the same org data", anna.appointments.length === alina.appointments.length && anna.clients.length === 12);
check("org 2 is separate", boris.clients.length === 3 && boris.services.length === 2 && boris.staff.length === 1 && boris.appointments.length === 4 && boris.company.name.includes("Борода"));
check("org 1 company profile", alina.company.name === "Студия красоты «Лаванда»" && alina.company.address.startsWith("Москва"));
check("a user cannot load another org's data", await loadOrgData(stubClient("boris"), ORG1, "Europe/Moscow").then(() => false, () => true));
check("anon cannot load anything", await loadOrgData(stubClient("anon"), ORG1, "Europe/Moscow").then(() => false, () => true));
check("no appointment references an unknown client/service/specialist", alina.appointments.every((a) => a.client && a.service && a.staff));

// Mapping
const first = alina.appointments.find((a) => a.id === U("d", 1));
check("timestamps map to local date/time (09:30, today)", first?.date === alina.today && first.time === "09:30" && first.endTime === "11:00", JSON.stringify(first && [first.date, first.time, first.endTime]));
check("price is a number", typeof first.price === "number" && first.price === 2800);
const byName = (n) => alina.staff.find((s) => s.name === n);
check("schedule labels", byName("Анна Ковалёва").schedule === "Пн–Пт, 10:00–19:00" && byName("Ольга Белова").schedule === "Вт–Сб, 10:00–20:00" && byName("Дмитрий Назаров").schedule === "Ср–Вс, 12:00–21:00");
check("staff services are linked", byName("Анна Ковалёва").serviceIds.length === 2 && byName("Екатерина Орлова").serviceIds.length === 1);
check("organization hours", alina.company.hours[0].open === "09:00" && alina.company.hours[6].close === "18:00" && alina.company.hours.length === 7);
const elena = alina.clients.find((c) => c.name === "Елена Миронова");
const completed = alina.appointments.filter((a) => a.status === "completed" && a.clientId === elena.id);
check("client stats come from completed visits", elena.visits === completed.length && elena.visits > 0 && elena.totalSpent === completed.reduce((s, a) => s + a.price, 0) && elena.lastVisit < alina.today);

// Dashboard numbers
check("7 appointments today (cancelled excluded)", todayAppointments(alina).length === 7, String(todayAppointments(alina).length));
check("3 new clients in 7 days", newClientsCount(alina) === 3, String(newClientsCount(alina)));
const days = dailyStats(alina, 14);
check("14 daily points ending today", days.length === 14 && days[13].date === alina.today && days[13].bookings === 7);
check("revenue and bookings are real sums", days.reduce((s, d) => s + d.revenue, 0) > 100_000 && days.every((d) => d.revenue >= 0));
const pop = popularServices(alina);
check("popular services sorted, from real data", pop.length >= 4 && pop.every((p, i) => i === 0 || pop[i - 1].count >= p.count));
const up = upcomingAppointments(alina, "00:00", 6);
check("upcoming: 6 unfinished, in order", up.length === 6 && up.every((a) => a.status === "confirmed" || a.status === "pending") && up.every((a, i) => i === 0 || up[i - 1].date + up[i - 1].time <= a.date + a.time));

console.log(failed ? `\n${failed} FAILED` : "\nALL PASSED");
process.exit(failed ? 1 : 0);
