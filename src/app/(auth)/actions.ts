"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; message?: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

const CAPTCHA_FAILED = "Не удалось пройти проверку «Я не робот». Обновите страницу и попробуйте снова";
/** Token of the CAPTCHA widget (present only when NEXT_PUBLIC_TURNSTILE_SITE_KEY is set); Supabase checks it when CAPTCHA protection is on. */
const captchaToken = (fd: FormData) => text(fd, "cf-turnstile-response") || undefined;
const isCaptchaError = (e: { code?: string; message?: string }) => e.code === "captcha_failed" || /captcha/i.test(e.message ?? "");

export async function signIn(_: AuthState, fd: FormData): Promise<AuthState> {
  const email = text(fd, "email");
  const password = String(fd.get("password") ?? "");
  if (!EMAIL.test(email) || !password) return { error: "Введите email и пароль" };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password, options: { captchaToken: captchaToken(fd) } });
  if (error && isCaptchaError(error)) return { error: CAPTCHA_FAILED };
  // One message for every failure so the form does not reveal which emails exist.
  if (error) return { error: "Неверный email или пароль" };
  redirect("/dashboard");
}

export async function signUp(_: AuthState, fd: FormData): Promise<AuthState> {
  const fullName = text(fd, "full_name");
  const company = text(fd, "company");
  const email = text(fd, "email");
  const password = String(fd.get("password") ?? "");

  if (!fullName || !company) return { error: "Укажите имя и название студии" };
  if (!EMAIL.test(email)) return { error: "Введите корректный email" };
  if (password.length < 8) return { error: "Пароль должен быть не короче 8 символов" };

  const origin = (await headers()).get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const supabase = await createClient();
  // full_name and company reach the handle_new_user() trigger, which creates the profile, the organization and the owner role.
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, company }, emailRedirectTo: `${origin}/auth/callback`, captchaToken: captchaToken(fd) },
  });
  if (error && isCaptchaError(error)) return { error: CAPTCHA_FAILED };
  if (error) return { error: "Не удалось создать аккаунт. Проверьте данные или попробуйте войти" };

  if (!data.session) return { message: "Мы отправили письмо со ссылкой для подтверждения. Откройте его, чтобы войти." };
  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
