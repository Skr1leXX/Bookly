"use client";

import { AlertCircle, ArrowLeft, CalendarDays, Check, Clock, Loader2, MapPin, Phone, User, Users } from "lucide-react";
import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createBooking, loadSlots } from "@/lib/actions/booking";
import { addDays, formatDayShort, formatFull, formatMoney, formatWeekday } from "@/lib/dates";
import { isoWeekday } from "@/lib/scheduling";
import { cn } from "@/lib/utils";
import { bookingContactSchema } from "@/lib/validation";
import type { PublicOrg, PublicService, PublicSlot, PublicStaff } from "@/types/booking";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Step = 1 | 2 | 3 | 4 | 5;
const STEPS = ["Услуга", "Специалист", "Время", "Контакты", "Проверка"];
const HORIZON_DAYS = 60;
const CHIP_DAYS = 14;

interface Contact {
  name: string;
  phone: string;
  email: string;
  note: string;
}

export function BookingWizard({ slug, org }: { slug: string; org: PublicOrg }) {
  const [step, setStep] = useState<Step>(1);
  const [service, setService] = useState<PublicService | null>(null);
  const [staffId, setStaffId] = useState<string>("any");
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState<PublicSlot | null>(null);
  const [contact, setContact] = useState<Contact>({ name: "", phone: "", email: "", note: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const startedAt = useRef(0);
  const top = useRef<HTMLDivElement>(null);

  useEffect(() => {
    startedAt.current = performance.now();
  }, []);
  useEffect(() => {
    if (step > 1) top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [step]);

  const eligibleStaff = useMemo(() => org.staff.filter((m) => service && m.serviceIds.includes(service.id)), [org.staff, service]);
  const chosenStaff = staffId === "any" ? null : org.staff.find((m) => m.id === staffId) ?? null;
  const slotStaff = org.staff.find((m) => m.id === slot?.staffId);

  const back = () => setStep((s) => Math.max(1, s - 1) as Step);

  return (
    <div ref={top} className="scroll-mt-4 space-y-5">
      <Progress step={step} />
      {step > 1 && (
        <Button type="button" variant="ghost" size="sm" className="-ml-2" onClick={back}>
          <ArrowLeft /> Назад
        </Button>
      )}

      {step === 1 && (
        <ServiceStep
          services={org.services}
          onPick={(s) => {
            setService(s);
            setStaffId("any");
            setDate("");
            setSlot(null);
            setStep(2);
          }}
        />
      )}
      {step === 2 && service && (
        <StaffStep
          staff={eligibleStaff}
          selected={staffId}
          onPick={(id) => {
            setStaffId(id);
            setDate("");
            setSlot(null);
            setStep(3);
          }}
        />
      )}
      {step === 3 && service && (
        <TimeStep
          slug={slug}
          org={org}
          service={service}
          staff={chosenStaff ? [chosenStaff] : eligibleStaff}
          staffId={staffId}
          date={date}
          onDate={(d) => {
            setDate(d);
            setSlot(null);
          }}
          slot={slot}
          onPick={(s) => {
            setSlot(s);
            setStep(4);
          }}
        />
      )}
      {step === 4 && (
        <ContactStep
          contact={contact}
          errors={errors}
          onChange={(c) => setContact(c)}
          onNext={() => {
            const r = bookingContactSchema.safeParse(contact);
            if (!r.success) {
              setErrors(Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message])));
              return;
            }
            setErrors({});
            setContact({ ...r.data });
            setStep(5);
          }}
        />
      )}
      {step === 5 && service && slot && (
        <ReviewStep
          slug={slug}
          org={org}
          service={service}
          staffName={slotStaff?.name ?? "—"}
          anyStaff={staffId === "any"}
          date={date}
          slot={slot}
          contact={contact}
          serviceId={service.id}
          staffId={staffId}
          elapsed={() => Math.round(performance.now() - startedAt.current)}
          onFieldErrors={(f) => {
            setErrors(f);
            setStep(4);
          }}
          onPickAnother={() => {
            setSlot(null);
            setStep(3);
          }}
        />
      )}
    </div>
  );
}

function Progress({ step }: { step: Step }) {
  return (
    <ol className="flex items-center gap-1.5" aria-label="Шаги записи">
      {STEPS.map((label, i) => {
        const n = i + 1;
        return (
          <li key={label} className="flex flex-1 flex-col gap-1" aria-current={n === step ? "step" : undefined}>
            <span className={cn("h-1.5 rounded-full", n <= step ? "bg-primary" : "bg-border")} />
            <span className={cn("hidden text-[11px] sm:block", n === step ? "font-medium text-foreground" : "text-muted-foreground")}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function StepTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight">{children}</h2>
      {hint && <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}

const card = "w-full rounded-2xl border bg-card p-4 text-left shadow-sm shadow-primary/5 transition-colors hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring";

function ServiceStep({ services, onPick }: { services: PublicService[]; onPick: (s: PublicService) => void }) {
  const groups = [...new Set(services.map((s) => s.category))];
  if (services.length === 0) return <p className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">Онлайн-запись пока недоступна: нет доступных услуг.</p>;
  return (
    <div className="space-y-4">
      <StepTitle hint="Показаны только услуги, на которые сейчас можно записаться">Выберите услугу</StepTitle>
      {groups.map((g) => (
        <section key={g} className="space-y-2">
          {g && <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{g}</h3>}
          {services.filter((s) => s.category === g).map((s) => (
            <button key={s.id} type="button" className={card} onClick={() => onPick(s)}>
              <span className="flex items-start justify-between gap-3">
                <span className="font-medium">{s.name}</span>
                <span className="shrink-0 font-semibold text-primary">{formatMoney(s.price)}</span>
              </span>
              {s.description && <span className="mt-1 block text-sm text-muted-foreground">{s.description}</span>}
              <span className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="size-3.5" /> {s.duration} мин
              </span>
            </button>
          ))}
        </section>
      ))}
    </div>
  );
}

function StaffStep({ staff, selected, onPick }: { staff: PublicStaff[]; selected: string; onPick: (id: string) => void }) {
  return (
    <div className="space-y-3">
      <StepTitle hint="Любой специалист — быстрее найдём свободное время">Выберите специалиста</StepTitle>
      <button type="button" className={cn(card, selected === "any" && "border-primary")} onClick={() => onPick("any")}>
        <span className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-full bg-accent text-primary"><Users className="size-5" /></span>
          <span>
            <span className="block font-medium">Любой специалист</span>
            <span className="block text-sm text-muted-foreground">Подберём свободного мастера</span>
          </span>
        </span>
      </button>
      {staff.map((m) => (
        <button key={m.id} type="button" className={cn(card, selected === m.id && "border-primary")} onClick={() => onPick(m.id)}>
          <span className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-accent font-medium text-accent-foreground">
              {m.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
            </span>
            <span>
              <span className="block font-medium">{m.name}</span>
              {m.jobTitle && <span className="block text-sm text-muted-foreground">{m.jobTitle}</span>}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

function TimeStep({
  slug, org, service, staff, staffId, date, onDate, slot, onPick,
}: {
  slug: string; org: PublicOrg; service: PublicService; staff: PublicStaff[]; staffId: string;
  date: string; onDate: (d: string) => void; slot: PublicSlot | null; onPick: (s: PublicSlot) => void;
}) {
  const key = `${service.id}|${staffId}|${date}`;
  const [result, setResult] = useState<{ key: string; slots: PublicSlot[]; error?: string } | null>(null);
  const days = Array.from({ length: CHIP_DAYS }, (_, i) => addDays(org.today, i));
  const worksOn = (d: string) => staff.some((m) => m.weekdays.includes(isoWeekday(d)));
  const lastDay = addDays(org.today, HORIZON_DAYS);

  // The answer is stored with the key it was asked for, so a slow reply for an earlier date is ignored.
  useEffect(() => {
    if (!date) return;
    let stale = false;
    loadSlots(slug, service.id, staffId === "any" ? null : staffId, date).then((r) => {
      if (!stale) setResult({ key, slots: r.slots, error: r.error });
    });
    return () => {
      stale = true;
    };
  }, [key, date, slug, service.id, staffId]);
  const loaded = result?.key === key ? result : null;
  const slots = loaded ? loaded.slots : null;
  const error = loaded?.error;

  return (
    <div className="space-y-4">
      <StepTitle hint={`${service.name} · ${service.duration} мин`}>Выберите дату и время</StepTitle>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="listbox" aria-label="Дата">
        {days.map((d) => {
          const off = !worksOn(d);
          return (
            <button
              key={d}
              type="button"
              role="option"
              aria-selected={d === date}
              disabled={off}
              onClick={() => onDate(d)}
              className={cn(
                "flex w-14 shrink-0 flex-col items-center rounded-xl border bg-card py-2 text-sm transition-colors",
                d === date ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary/50",
                off && "cursor-not-allowed opacity-40",
              )}
            >
              <span className="text-[11px] uppercase opacity-80">{formatWeekday(d)}</span>
              <span className="text-base font-semibold">{Number(d.slice(8))}</span>
              <span className="text-[10px] opacity-70">{formatDayShort(d).replace(/^\d+\s/, "")}</span>
            </button>
          );
        })}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="other-date">Другая дата</Label>
        <Input id="other-date" type="date" min={org.today} max={lastDay} value={date} onChange={(e) => e.target.value && onDate(e.target.value)} />
      </div>

      {date && (
        <section aria-live="polite" className="space-y-2">
          <h3 className="text-sm font-medium">{formatFull(date)}</h3>
          {slots === null && !error && (
            <div className="grid grid-cols-4 gap-2" aria-busy="true">
              {Array.from({ length: 8 }, (_, i) => <div key={i} className="h-10 animate-pulse rounded-xl bg-muted" />)}
            </div>
          )}
          {error && <p role="alert" className="flex items-center gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive"><AlertCircle className="size-4" /> {error}</p>}
          {slots && slots.length === 0 && !error && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">На этот день нет свободного времени. Выберите другую дату.</p>}
          {slots && slots.length > 0 && (
            <div className="grid grid-cols-4 gap-2">
              {slots.map((s) => (
                <button
                  key={s.time}
                  type="button"
                  onClick={() => onPick(s)}
                  className={cn("h-10 rounded-xl border bg-card text-sm font-medium transition-colors hover:border-primary hover:text-primary", slot?.time === s.time && "border-primary bg-primary text-primary-foreground hover:text-primary-foreground")}
                >
                  {s.time}
                </button>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function ContactStep({ contact, errors, onChange, onNext }: { contact: Contact; errors: Record<string, string>; onChange: (c: Contact) => void; onNext: () => void }) {
  const field = (name: keyof Contact, label: string, props: React.ComponentProps<"input">) => (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} value={contact[name]} onChange={(e) => onChange({ ...contact, [name]: e.target.value })} aria-invalid={!!errors[name]} className="h-11 text-base sm:text-sm" {...props} />
      {errors[name] && <p role="alert" className="text-xs text-destructive">{errors[name]}</p>}
    </div>
  );
  return (
    <form
      className="space-y-4"
      method="post"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onNext();
      }}
    >
      <StepTitle hint="Мы свяжемся с вами, если нужно уточнить запись">Ваши контакты</StepTitle>
      {field("name", "Имя", { autoComplete: "name", maxLength: 120, required: true })}
      {field("phone", "Телефон", { type: "tel", inputMode: "tel", autoComplete: "tel", placeholder: "+7 (900) 000-00-00", maxLength: 25, required: true })}
      {field("email", "Email", { type: "email", inputMode: "email", autoComplete: "email", placeholder: "name@example.com", maxLength: 120, required: true })}
      <div className="space-y-1.5">
        <Label htmlFor="note">Комментарий (необязательно)</Label>
        <textarea id="note" value={contact.note} onChange={(e) => onChange({ ...contact, note: e.target.value })} maxLength={500} rows={3}
          className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm" />
        {errors.note && <p role="alert" className="text-xs text-destructive">{errors.note}</p>}
      </div>
      <Button type="submit" size="lg" className="h-11 w-full">Далее</Button>
    </form>
  );
}

function ReviewStep({
  slug, org, service, staffName, anyStaff, date, slot, contact, serviceId, staffId, elapsed, onFieldErrors, onPickAnother,
}: {
  slug: string; org: PublicOrg; service: PublicService; staffName: string; anyStaff: boolean; date: string; slot: PublicSlot; contact: Contact;
  serviceId: string; staffId: string; elapsed: () => number; onFieldErrors: (f: Record<string, string>) => void; onPickAnother: () => void;
}) {
  const [state, action, pending] = useActionState(createBooking.bind(null, slug), {});
  const [, startSubmit] = useTransition();

  useEffect(() => {
    if (state.code === "invalid" && state.fields) onFieldErrors(state.fields);
  }, [state, onFieldErrors]);

  const rows: [React.ReactNode, string, string][] = [
    [<CalendarDays key="d" className="size-4" />, "Дата и время", `${formatFull(date)}, ${slot.time}`],
    [<User key="s" className="size-4" />, "Специалист", anyStaff ? `${staffName} (подобран автоматически)` : staffName],
    [<Phone key="c" className="size-4" />, "Вы", `${contact.name}, ${contact.phone}`],
  ];
  const taken = state.code === "slot_taken" || state.code === "past";

  return (
    <form
      method="post"
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.set("elapsed", String(elapsed()));
        startSubmit(() => action(fd));
      }}
    >
      <StepTitle hint="Проверьте детали и подтвердите запись">Ваша запись</StepTitle>
      <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm shadow-primary/5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold">{service.name}</p>
            <p className="text-sm text-muted-foreground">{service.duration} мин</p>
          </div>
          <p className="text-lg font-semibold text-primary">{formatMoney(service.price)}</p>
        </div>
        <ul className="space-y-2 border-t pt-3 text-sm">
          {rows.map(([icon, label, value]) => (
            <li key={label} className="flex items-start gap-2.5">
              <span className="mt-0.5 text-muted-foreground">{icon}</span>
              <span><span className="block text-xs text-muted-foreground">{label}</span>{value}</span>
            </li>
          ))}
          {org.address && (
            <li className="flex items-start gap-2.5">
              <span className="mt-0.5 text-muted-foreground"><MapPin className="size-4" /></span>
              <span><span className="block text-xs text-muted-foreground">Адрес</span>{org.address}</span>
            </li>
          )}
        </ul>
      </div>

      {/* Values the server validates again; website is a honeypot that people never see. */}
      <input type="hidden" name="serviceId" value={serviceId} />
      <input type="hidden" name="staffId" value={staffId === "any" ? "any" : staffId} />
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="time" value={slot.time} />
      <input type="hidden" name="name" value={contact.name} />
      <input type="hidden" name="phone" value={contact.phone} />
      <input type="hidden" name="email" value={contact.email} />
      <input type="hidden" name="note" value={contact.note} />
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Не заполняйте это поле<input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" /></label>
      </div>

      {state.error && state.code !== "invalid" && (
        <div role="alert" className="space-y-2 rounded-xl bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <p className="flex items-start gap-2"><AlertCircle className="mt-0.5 size-4 shrink-0" /> {state.error}</p>
          {taken && <Button type="button" size="sm" variant="outline" onClick={onPickAnother}>Выбрать другое время</Button>}
        </div>
      )}
      <Button type="submit" size="lg" className="h-11 w-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Check />}
        {pending ? "Записываем…" : "Подтвердить запись"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">Нажимая кнопку, вы соглашаетесь на обработку контактных данных для записи.</p>
    </form>
  );
}
