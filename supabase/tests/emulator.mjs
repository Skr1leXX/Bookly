// Local stand-in for Supabase (GoTrue + PostgREST subset) on top of PGlite, for trying the app without Docker.
// It runs the real migrations and seed, and executes every request as the signed-in user's database role,
// so RLS, constraints and triggers behave as in Postgres. It is NOT PostgREST: only what the app uses is implemented.
//   node supabase/tests/emulator.mjs        -> http://127.0.0.1:54321  (NEXT_PUBLIC_SUPABASE_URL)
import http from "node:http";
import { createDb } from "./setup.mjs";

const PORT = Number(process.env.PORT ?? 54321);
const db = await createDb();

// PGlite is a single connection: requests are processed strictly one after another.
let chain = Promise.resolve();
const serial = (fn) => (chain = chain.then(fn, fn));

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const makeToken = (u) => `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: u.id, email: u.email, role: "authenticated", aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 86400 })}.emulator`;
const subOf = (req) => {
  const t = (req.headers.authorization ?? "").replace(/^Bearer /, "");
  try {
    return JSON.parse(Buffer.from(t.split(".")[1], "base64url").toString()).sub ?? null;
  } catch {
    return null; // the anon key is not a user token
  }
};
const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;
const ident = (s) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw Object.assign(new Error(`bad identifier ${s}`), { code: "PGRST100" });
  return s;
};

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

// Embeds the app uses: resolved with correlated sub-selects.
const EMBEDS = {
  "staff.staff_services": (cols) => `(select coalesce(json_agg(json_build_object(${cols.map((c) => `'${ident(c)}', e.${ident(c)}`)})), '[]'::json) from public.staff_services e where e.staff_id = t.id)`,
  "organization_members.organizations": (cols) => `(select json_build_object(${cols.map((c) => `'${ident(c)}', e.${ident(c)}`)}) from public.organizations e where e.id = t.org_id)`,
};

function projection(table, select) {
  if (!select || select === "*") return "t.*";
  return splitTop(select)
    .map((p) => {
      const m = p.match(/^([a-z_]+)\((.*)\)$/);
      if (!m) return `t.${ident(p)}`;
      const embed = EMBEDS[`${table}.${m[1]}`];
      if (!embed) throw Object.assign(new Error(`embed ${table}.${m[1]} is not supported by the emulator`), { code: "PGRST200" });
      return `${embed(m[2].split(",").map((c) => c.trim()))} as ${m[1]}`;
    })
    .join(", ");
}

const OPS = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" };
function whereOf(params) {
  const parts = [];
  for (const [key, val] of params) {
    if (["select", "order", "limit", "offset", "columns", "on_conflict"].includes(key)) continue;
    const m = val.match(/^(not\.)?([a-z]+)\.(.*)$/);
    if (!m) throw Object.assign(new Error(`bad filter ${key}=${val}`), { code: "PGRST100" });
    const [, not, op, arg] = m;
    let c;
    if (OPS[op]) c = `t.${ident(key)} ${OPS[op]} ${lit(arg)}`;
    else if (op === "is") c = `t.${ident(key)} is ${arg === "null" ? "null" : arg}`;
    else if (op === "in") c = `t.${ident(key)} in (${arg.replace(/^\(|\)$/g, "").split(",").map((x) => lit(x.replace(/^"|"$/g, ""))).join(",")})`;
    else throw Object.assign(new Error(`operator ${op} is not supported by the emulator`), { code: "PGRST100" });
    parts.push(not ? `not (${c})` : c);
  }
  return parts.length ? ` where ${parts.join(" and ")}` : "";
}
const orderOf = (p) => {
  const o = p.get("order");
  return o ? " order by " + o.split(",").map((x) => { const [c, d = "asc", n] = x.split("."); return `t.${ident(c)} ${d === "desc" ? "desc" : "asc"}${n ? ` nulls ${n === "nullsfirst" ? "first" : "last"}` : ""}`; }).join(", ") : "";
};

function jsonRows(r) {
  const numeric = new Set(r.fields.filter((f) => f.dataTypeID === 1700).map((f) => f.name));
  return r.rows.map((row) =>
    Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : numeric.has(k) && v !== null ? Number(v) : v])),
  );
}

async function asRole(sub, fn) {
  await db.exec("begin");
  try {
    await db.exec(sub ? "set local role authenticated" : "set local role anon");
    if (sub) await db.exec(`select set_config('request.jwt.claim.sub', ${lit(sub)}, true)`);
    const out = await fn();
    await db.exec("commit");
    return out;
  } catch (e) {
    await db.exec("rollback");
    throw e;
  }
}

async function rest(req, url, body, sub) {
  const p = url.searchParams;
  const [, , , name, fn] = url.pathname.split("/"); // /rest/v1/<name>[/<fn>]
  const prefer = req.headers.prefer ?? "";
  const wantsRows = prefer.includes("return=representation");
  const accept = req.headers.accept ?? "";

  return asRole(sub, async () => {
    if (name === "rpc") {
      // Literals are typed by the function signature, like PostgREST does: json/jsonb take JSON text, arrays take {..}.
      const types = new Map((await db.query("select a.name, t.typname from pg_proc p, unnest(p.proargnames, p.proargtypes::oid[]) as a(name, typ) join pg_type t on t.oid = a.typ where p.proname = $1", [fn])).rows.map((x) => [x.name, x.typname]));
      const arg = (k, v) => (v === null ? "null" : ["json", "jsonb"].includes(types.get(k)) ? lit(JSON.stringify(v)) : Array.isArray(v) ? lit(`{${v.map((x) => `"${x}"`).join(",")}}`) : lit(v));
      const args = Object.entries(JSON.parse(body || "{}")).map(([k, v]) => `${ident(k)} => ${arg(k, v)}`);
      const r = await db.query(`select public.${ident(fn)}(${args.join(", ")}) as result`);
      const result = jsonRows(r)[0]?.result ?? null;
      return { status: 200, body: result };
    }
    const table = ident(name);
    let r;
    if (req.method === "GET" || req.method === "HEAD") {
      const base = `from public.${table} t${whereOf(p)}`;
      if (req.method === "HEAD") {
        const c = (await db.query(`select count(*)::int c ${base}`)).rows[0].c;
        return { status: 200, headers: { "Content-Range": `*/${c}` }, body: undefined };
      }
      r = await db.query(`select ${projection(table, p.get("select"))} ${base}${orderOf(p)}${p.get("limit") ? ` limit ${Number(p.get("limit"))}` : ""}${p.get("offset") ? ` offset ${Number(p.get("offset"))}` : ""}`);
    } else if (req.method === "POST") {
      const rows = [].concat(JSON.parse(body));
      const cols = [...new Set(rows.flatMap(Object.keys))].map(ident);
      r = await db.query(
        `with t as (insert into public.${table} (${cols.join(", ")}) select ${cols.join(", ")} from json_populate_recordset(null::public.${table}, $1::json) returning *) select ${projection(table, p.get("select"))} from t`,
        [JSON.stringify(rows)],
      );
    } else if (req.method === "PATCH") {
      const patch = JSON.parse(body);
      const sets = Object.keys(patch).map((k) => `${ident(k)} = r.${ident(k)}`).join(", ");
      r = await db.query(
        `with t as (update public.${table} t set ${sets} from json_populate_record(null::public.${table}, $1::json) r${whereOf(p).replace(" where ", " where ")} returning t.*) select ${projection(table, p.get("select"))} from t`,
        [JSON.stringify(patch)],
      );
    } else if (req.method === "DELETE") {
      r = await db.query(`with t as (delete from public.${table} t${whereOf(p)} returning t.*) select ${projection(table, p.get("select"))} from t`);
    } else {
      return { status: 405, body: { message: "method not allowed" } };
    }

    const rows = jsonRows(r);
    if (accept.includes("vnd.pgrst.object")) {
      if (rows.length !== 1) return { status: 406, body: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: `The result contains ${rows.length} rows` } };
      return { status: 200, body: rows[0] };
    }
    if (req.method !== "GET" && !wantsRows) return { status: req.method === "POST" ? 201 : 204, body: undefined };
    return { status: req.method === "POST" ? 201 : 200, body: rows };
  });
}

async function auth(req, url, body, sub) {
  const path = url.pathname.replace("/auth/v1", "");
  const json = body ? JSON.parse(body) : {};
  const userJson = (u) => ({ id: u.id, aud: "authenticated", role: "authenticated", email: u.email, email_confirmed_at: new Date().toISOString(), app_metadata: { provider: "email" }, user_metadata: {}, created_at: new Date().toISOString() });
  const session = (u) => ({ access_token: makeToken(u), token_type: "bearer", expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: `r-${u.id}`, user: userJson(u) });
  const bad = (msg) => ({ status: 400, body: { code: 400, error_code: "invalid_credentials", msg } });

  if (path === "/token" && url.searchParams.get("grant_type") === "password") {
    const r = await db.query("select id, email, (encrypted_password = extensions.crypt($2, encrypted_password)) as ok from auth.users where email = $1", [String(json.email).toLowerCase(), String(json.password)]);
    return r.rows[0]?.ok ? { status: 200, body: session(r.rows[0]) } : bad("Invalid login credentials");
  }
  if (path === "/token" && url.searchParams.get("grant_type") === "refresh_token") {
    const r = await db.query("select id, email from auth.users where id = $1", [String(json.refresh_token).replace(/^r-/, "")]);
    return r.rows[0] ? { status: 200, body: session(r.rows[0]) } : bad("Invalid refresh token");
  }
  if (path === "/user" && req.method === "GET") {
    if (!sub) return { status: 401, body: { code: 401, msg: "missing sub claim" } };
    const r = await db.query("select id, email from auth.users where id = $1", [sub]);
    return r.rows[0] ? { status: 200, body: userJson(r.rows[0]) } : { status: 401, body: { code: 401, msg: "user not found" } };
  }
  if (path === "/signup") {
    const exists = (await db.query("select 1 from auth.users where email = $1", [String(json.email).toLowerCase()])).rows.length;
    if (exists) return { status: 422, body: { code: 422, error_code: "user_already_exists", msg: "User already registered" } };
    const id = crypto.randomUUID();
    await db.query(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
       values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, extensions.crypt($3, extensions.gen_salt('bf')), now(), '{"provider":"email"}', $4::jsonb, now(), now())`,
      [id, String(json.email).toLowerCase(), String(json.password), JSON.stringify(json.data ?? {})],
    );
    return { status: 200, body: session({ id, email: String(json.email).toLowerCase() }) };
  }
  if (path === "/logout") return { status: 204, body: undefined };
  return { status: 404, body: { msg: `emulator: ${path} not implemented` } };
}

http
  .createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () =>
      serial(async () => {
        const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
        const body = Buffer.concat(chunks).toString();
        const sub = subOf(req);
        let out;
        try {
          out = url.pathname.startsWith("/auth/v1") ? await auth(req, url, body, sub) : url.pathname.startsWith("/rest/v1") ? await rest(req, url, body, sub) : { status: 404, body: { message: "not found" } };
        } catch (e) {
          const status = e.code === "42501" ? (sub ? 403 : 401) : ["23505", "23503", "23P01"].includes(e.code) ? 409 : 400;
          out = { status, body: { code: e.code ?? "PGRST000", message: e.message, details: null, hint: null } };
        }
        res.writeHead(out.status, { "Content-Type": "application/json", ...(out.headers ?? {}) });
        res.end(out.body === undefined ? undefined : JSON.stringify(out.body));
      }),
    );
  })
  .listen(PORT, "127.0.0.1", () => console.log(`Supabase emulator on http://127.0.0.1:${PORT} (demo password: Password123!)`));
