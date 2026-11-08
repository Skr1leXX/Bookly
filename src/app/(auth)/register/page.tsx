import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { signUp } from "../actions";

export const metadata: Metadata = { title: "Регистрация" };

export default function RegisterPage() {
  return (
    <AuthForm
      title="Создайте аккаунт"
      description="Вы станете владельцем новой студии"
      action={signUp}
      submitLabel="Зарегистрироваться"
      fields={[
        { name: "full_name", label: "Ваше имя", autoComplete: "name" },
        { name: "company", label: "Название студии", autoComplete: "organization" },
        { name: "email", label: "Email", type: "email", autoComplete: "email" },
        { name: "password", label: "Пароль (от 8 символов)", type: "password", autoComplete: "new-password" },
      ]}
      footer={{ text: "Уже есть аккаунт?", linkLabel: "Войти", href: "/login" }}
    />
  );
}
