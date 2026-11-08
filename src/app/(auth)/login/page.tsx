import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { signIn } from "../actions";

export const metadata: Metadata = { title: "Вход" };

export default function LoginPage() {
  return (
    <AuthForm
      title="Вход в Bookly"
      description="Введите данные своего аккаунта"
      action={signIn}
      submitLabel="Войти"
      fields={[
        { name: "email", label: "Email", type: "email", autoComplete: "email" },
        { name: "password", label: "Пароль", type: "password", autoComplete: "current-password" },
      ]}
      footer={{ text: "Нет аккаунта?", linkLabel: "Зарегистрироваться", href: "/register" }}
    />
  );
}
