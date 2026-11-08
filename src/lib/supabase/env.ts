/** Public Supabase settings. Only the URL and the anon key (protected by RLS) are used; there is no service_role key anywhere. */
export function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Не заданы NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_ANON_KEY. Скопируйте .env.example в .env.local.");
  }
  return { url, anonKey };
}
