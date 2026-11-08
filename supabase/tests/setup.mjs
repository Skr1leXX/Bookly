// Shared PGlite bootstrap: Supabase stubs + migrations + seed (used by rls.test.mjs and queries.test.mjs).
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

export async function createDb() {
  const db = new PGlite({ extensions: { pgcrypto, btree_gist } });

  // Stubs for what Supabase provides out of the box.
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth; create schema extensions;
    create extension pgcrypto schema extensions;
    create table auth.users(instance_id uuid, id uuid primary key, aud text, role text, email text,
      encrypted_password text, email_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb,
      created_at timestamptz, updated_at timestamptz, confirmation_token text, recovery_token text,
      email_change text, email_change_token_new text);
    create table auth.identities(id uuid, user_id uuid, provider_id text, identity_data jsonb, provider text,
      last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `);

  for (const f of fs.readdirSync(`${root}/migrations`).sort()) {
    await db.exec(fs.readFileSync(`${root}/migrations/${f}`, "utf8"));
    console.log("applied", f);
  }
  const seed = fs.readFileSync(`${root}/seed.sql`, "utf8");
  await db.exec(seed);
  await db.exec(seed); // the seed must be re-runnable
  return db;
}

const U = (p, n) => `${p}0000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
export const ids = {
  users: { alina: U("b", 1), pavel: U("b", 2), anna: U("b", 3), maria: U("b", 4), boris: U("b", 5), vera: U("b", 6) },
  ORG1: U("a", 1),
  ORG2: U("a", 2),
  U,
};

// Runs sql as `who` inside a transaction that is rolled back (or committed with { commit: true }).
export function makeRunner(db, { commit = false } = {}) {
  return async function run(who, sql) {
    await db.exec("begin");
    try {
      if (who === "anon") await db.exec("set local role anon");
      else {
        await db.exec("set local role authenticated");
        await db.exec(`select set_config('request.jwt.claim.sub', '${ids.users[who] ?? who}', true)`);
      }
      let r;
      for (const q of [].concat(sql)) r = await db.query(q);
      await db.exec(commit ? "commit" : "rollback");
      return { rows: r.rows, affected: r.affectedRows };
    } catch (e) {
      await db.exec("rollback");
      return { error: e.message };
    }
  };
}
