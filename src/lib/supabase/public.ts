import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./env";

/** Anonymous client for the public booking page: no cookies, no session, only the SECURITY DEFINER public_* functions. */
export function createPublicClient() {
  const { url, anonKey } = supabaseEnv();
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
