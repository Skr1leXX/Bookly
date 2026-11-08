-- Bookly: core schema. Multi-tenant: every business row carries org_id.
-- unique (id, org_id) lets children use composite FKs, so a row can never
-- reference a parent from another organization.

create extension if not exists btree_gist with schema extensions;

create type public.member_role        as enum ('owner', 'admin', 'staff');
create type public.appointment_status as enum ('pending', 'confirmed', 'completed', 'cancelled');
create type public.notification_type  as enum ('appointment_created', 'appointment_cancelled', 'system');

create function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Organizations and people ---------------------------------------------------

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null default '',
  phone      text not null default '',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 120),
  slug        text not null unique,
  phone       text not null default '',
  email       text not null default '',
  address     text not null default '',
  description text not null default '',
  timezone    text not null default 'Europe/Moscow',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger organizations_updated before update on public.organizations
  for each row execute function public.set_updated_at();

create table public.organization_members (
  org_id     uuid not null references public.organizations (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       public.member_role not null default 'staff',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index organization_members_user_idx on public.organization_members (user_id);

-- Business tables --------------------------------------------------------------

create table public.clients (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  name       text not null check (char_length(btrim(name)) > 0),
  phone      text not null default '',
  email      text not null default '',
  note       text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id)
);
create index clients_org_created_idx on public.clients (org_id, created_at desc);
create index clients_org_name_idx    on public.clients (org_id, name);
create trigger clients_updated before update on public.clients
  for each row execute function public.set_updated_at();

create table public.services (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id) on delete cascade,
  name         text not null check (char_length(btrim(name)) > 0),
  category     text not null default '',
  description  text not null default '',
  duration_min integer not null check (duration_min between 5 and 720),
  price        numeric(12, 2) not null default 0 check (price >= 0),
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, org_id)
);
create index services_org_category_idx on public.services (org_id, category);
create trigger services_updated before update on public.services
  for each row execute function public.set_updated_at();

-- A specialist. user_id links the record to a login (optional: not every master has one).
create table public.staff (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  user_id    uuid references public.profiles (id) on delete set null,
  full_name  text not null check (char_length(btrim(full_name)) > 0),
  job_title  text not null default '',
  phone      text not null default '',
  email      text not null default '',
  rating     numeric(2, 1) check (rating between 0 and 5),
  color      text not null default 'violet',
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id)
);
create unique index staff_org_user_uniq on public.staff (org_id, user_id) where user_id is not null;
create index staff_user_idx on public.staff (user_id);
create trigger staff_updated before update on public.staff
  for each row execute function public.set_updated_at();

create table public.staff_services (
  org_id     uuid not null references public.organizations (id) on delete cascade,
  staff_id   uuid not null,
  service_id uuid not null,
  primary key (staff_id, service_id),
  foreign key (staff_id, org_id)   references public.staff (id, org_id)    on delete cascade,
  foreign key (service_id, org_id) references public.services (id, org_id) on delete cascade
);
create index staff_services_service_idx on public.staff_services (service_id);
create index staff_services_org_idx     on public.staff_services (org_id);

-- Weekly schedule. staff_id null = opening hours of the whole organization. weekday: 1 = Monday ... 7 = Sunday.
create table public.working_hours (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  staff_id   uuid,
  weekday    smallint not null check (weekday between 1 and 7),
  start_time time not null,
  end_time   time not null,
  check (end_time > start_time),
  foreign key (staff_id, org_id) references public.staff (id, org_id) on delete cascade
);
create unique index working_hours_day_uniq
  on public.working_hours (org_id, coalesce(staff_id, '00000000-0000-0000-0000-000000000000'::uuid), weekday);
create index working_hours_staff_idx on public.working_hours (staff_id);

create table public.appointments (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  client_id  uuid not null,
  service_id uuid not null,
  staff_id   uuid not null,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  status     public.appointment_status not null default 'pending',
  price      numeric(12, 2) not null default 0 check (price >= 0), -- fixed at booking time
  notes      text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  foreign key (client_id, org_id)  references public.clients (id, org_id)  on delete cascade,
  foreign key (service_id, org_id) references public.services (id, org_id) on delete restrict,
  foreign key (staff_id, org_id)   references public.staff (id, org_id)    on delete restrict,
  -- one specialist cannot be double-booked (cancelled visits free the slot)
  exclude using gist (staff_id with =, tstzrange(starts_at, ends_at) with &&) where (status <> 'cancelled')
);
create index appointments_org_starts_idx   on public.appointments (org_id, starts_at);
create index appointments_staff_starts_idx on public.appointments (staff_id, starts_at);
create index appointments_client_idx       on public.appointments (client_id);
create index appointments_service_idx      on public.appointments (service_id);
create index appointments_creator_idx      on public.appointments (created_by);
create trigger appointments_updated before update on public.appointments
  for each row execute function public.set_updated_at();

create table public.notifications (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id) on delete cascade,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  type           public.notification_type not null default 'system',
  title          text not null,
  body           text not null default '',
  appointment_id uuid references public.appointments (id) on delete cascade,
  is_read        boolean not null default false,
  created_at     timestamptz not null default now()
);
create index notifications_user_unread_idx on public.notifications (user_id, is_read, created_at desc);
create index notifications_org_idx         on public.notifications (org_id);
create index notifications_appointment_idx on public.notifications (appointment_id);

-- Notify the specialist about new / cancelled visits. SECURITY DEFINER: users cannot insert notifications themselves.
create function public.notify_appointment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_user    uuid;
  v_client  text;
  v_service text;
begin
  select s.user_id into v_user from public.staff s where s.id = new.staff_id;
  if v_user is null or v_user is not distinct from (select auth.uid()) then
    return new;
  end if;
  select c.name into v_client from public.clients c where c.id = new.client_id;
  select sv.name into v_service from public.services sv where sv.id = new.service_id;

  if tg_op = 'INSERT' then
    insert into public.notifications (org_id, user_id, type, title, body, appointment_id)
    values (new.org_id, v_user, 'appointment_created', 'Новая запись',
            v_client || ' — ' || v_service, new.id);
  elsif new.status = 'cancelled' and old.status <> 'cancelled' then
    insert into public.notifications (org_id, user_id, type, title, body, appointment_id)
    values (new.org_id, v_user, 'appointment_cancelled', 'Запись отменена',
            v_client || ' — ' || v_service, new.id);
  end if;
  return new;
end $$;

create trigger appointments_notify after insert or update of status on public.appointments
  for each row execute function public.notify_appointment();

-- Registration: profile + (optionally) a new organization owned by the user ----
-- Runs inside the auth.users insert, so sign-up is atomic.

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_company text := nullif(btrim(new.raw_user_meta_data ->> 'company'), '');
  v_org     uuid;
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(btrim(new.raw_user_meta_data ->> 'full_name'), ''));

  if v_company is not null then
    insert into public.organizations (name, slug)
    values (
      left(v_company, 120),
      coalesce(nullif(btrim(lower(regexp_replace(v_company, '[^a-zA-Z0-9]+', '-', 'g')), '-'), ''), 'org')
        || '-' || substr(md5(random()::text), 1, 8)
    )
    returning id into v_org;

    insert into public.organization_members (org_id, user_id, role) values (v_org, new.id, 'owner');
  end if;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
