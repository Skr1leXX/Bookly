import { CalendarCheck, CalendarClock, ClipboardList, Globe, ShieldCheck, Smartphone, UserCog, Users } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Bookly — онлайн-запись и расписание для салонов и студий",
  description: "Демо-проект: админ-панель с календарём, клиентами и сотрудниками и публичная страница онлайн-записи. Next.js, TypeScript, Supabase.",
};

const GITHUB = "https://github.com/Skr1leXX/Bookly";

const features = [
  { icon: CalendarClock, title: "Календарь и записи", text: "Недельный и дневной вид, перенос записи перетаскиванием, пять статусов, проверка пересечений и перерывов." },
  { icon: Globe, title: "Онлайн-запись без регистрации", text: "Клиент выбирает услугу, мастера и время, видит только реально свободные слоты и получает подтверждение." },
  { icon: Users, title: "Клиенты и история", text: "База клиентов с поиском, фильтрами, историей визитов и экспортом в CSV." },
  { icon: UserCog, title: "Сотрудники и расписание", text: "Услуги специалистов, рабочие часы, перерывы, временное отключение мастера." },
  { icon: ClipboardList, title: "Дашборд", text: "Записи, выручка, новые клиенты, популярные услуги и ближайшие визиты — всё из реальной базы." },
  { icon: ShieldCheck, title: "Роли и безопасность", text: "Владелец, администратор, сотрудник. Права на уровне базы (RLS), защита от спама и CAPTCHA." },
];

const stack = ["Next.js 16", "React 19", "TypeScript", "Tailwind CSS", "shadcn/ui", "Supabase", "PostgreSQL + RLS", "Playwright"];

function Shot({ src, alt, w, h, priority, className }: { src: string; alt: string; w: number; h: number; priority?: boolean; className?: string }) {
  return <Image src={src} alt={alt} width={w} height={h} priority={priority} className={`rounded-2xl border bg-card shadow-xl shadow-primary/10 ${className ?? ""}`} />;
}

export default function Home() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <span className="flex items-center gap-2.5 text-lg font-semibold tracking-tight">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/30">
            <CalendarCheck className="size-5" />
          </span>
          Bookly
        </span>
        <a href={GITHUB} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-muted-foreground hover:text-primary">
          GitHub
        </a>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-4 pt-10 pb-16 text-center sm:px-6 sm:pt-16">
          <p className="mx-auto mb-4 w-fit rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">Демо-проект для портфолио</p>
          <h1 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">Онлайн-запись и расписание для салонов и студий</h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground text-balance sm:text-lg">
            Админ-панель для команды и публичная страница записи для клиентов — на Next.js и Supabase, с реальной базой данных, ролями и автотестами.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/login" className={buttonVariants({ size: "lg", className: "h-11 w-full px-6 sm:w-auto" })}>
              Открыть админ-панель
            </Link>
            <Link href="/book/lavanda-demo" className={buttonVariants({ variant: "outline", size: "lg", className: "h-11 w-full px-6 sm:w-auto" })}>
              <Smartphone /> Записаться как клиент
            </Link>
          </div>

          <div className="mx-auto mt-8 max-w-xl rounded-2xl border bg-card p-4 text-left text-sm shadow-sm shadow-primary/5">
            <p className="font-medium">Вход в демо (роль «администратор»)</p>
            <p className="mt-1 text-muted-foreground">
              Email <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">pavel@bookly.test</code>, пароль{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">Password123!</code>
            </p>
            <p className="mt-2 text-xs text-muted-foreground">Данные общие и вымышленные и могут периодически сбрасываться. Реальные данные вводить не нужно.</p>
          </div>

          <div className="mt-14">
            <Shot src="/demo/dashboard.png" alt="Дашборд Bookly: записи, выручка, график и популярные услуги" w={1360} h={860} priority className="mx-auto w-full max-w-5xl" />
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">Что умеет Bookly</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, text }) => (
              <div key={title} className="rounded-2xl border bg-card p-5 shadow-sm shadow-primary/5">
                <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-primary">
                  <Icon className="size-5" />
                </span>
                <h3 className="mt-3 font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 sm:px-6 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Запись за минуту — с телефона</h2>
            <ol className="mt-5 space-y-3 text-sm text-muted-foreground">
              {["Выбрать услугу и специалиста (или «любой»)", "Выбрать день и свободное время — с учётом перерывов и уже занятых слотов", "Ввести имя, телефон и email, проверить и подтвердить", "Запись сразу появляется в админ-панели и календаре"].map((s, i) => (
                <li key={s} className="flex gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{i + 1}</span>
                  <span className="pt-0.5">{s}</span>
                </li>
              ))}
            </ol>
            <Link href="/book/lavanda-demo" className={buttonVariants({ className: "mt-6" })}>
              Попробовать запись
            </Link>
          </div>
          <div className="flex justify-center gap-4">
            <Shot src="/demo/booking-2-time.png" alt="Выбор времени на странице онлайн-записи" w={780} h={1688} className="w-[46%] max-w-52" />
            <Shot src="/demo/booking-4-success.png" alt="Страница успешной записи" w={780} h={1688} className="mt-8 w-[46%] max-w-52" />
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <Shot src="/demo/calendar.png" alt="Календарь записей по специалистам" w={1360} h={860} className="mx-auto w-full max-w-5xl" />
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-20 text-center sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight">Технологии</h2>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {stack.map((t) => (
              <span key={t} className="rounded-full border bg-card px-3 py-1 text-sm">
                {t}
              </span>
            ))}
          </div>
          <p className="mx-auto mt-5 max-w-xl text-sm text-muted-foreground">Исходный код, миграции базы, инструкция по запуску и отчёт о тестировании — в репозитории.</p>
          <a href={GITHUB} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", className: "mt-4" })}>
            Исходный код на GitHub
          </a>
        </section>
      </main>

      <footer className="border-t py-6 text-center text-xs text-muted-foreground">Bookly — демо-проект. Все данные вымышлены.</footer>
    </div>
  );
}
