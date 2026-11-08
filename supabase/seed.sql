-- Bookly demo data. All people, companies, e-mails (.test) and phones are invented.
--
-- Runs automatically on `supabase db reset` (local). For a hosted DEMO project paste it into the
-- SQL Editor; it is re-runnable and resets the demo data every time. Do not run it on a project
-- with real customers: it deletes and recreates the users below.
--
-- Demo logins (password for all: Password123!  -> change it before publishing a public demo):
--   alina@bookly.test   owner  of "Студия красоты «Лаванда»"   <- the demo account
--   pavel@bookly.test   admin  of "Лаванда"
--   anna@bookly.test    staff  of "Лаванда" (stylist Анна Ковалёва)
--   maria@bookly.test   staff  of "Лаванда" (nail master Мария Соколова)
--   boris@borodach.test owner  of "Барбершоп «Борода»"          <- other organization: proves data isolation
--   vera@borodach.test  staff  of "Барбершоп «Борода»"
-- Dates are relative to today (Europe/Moscow), so the demo is always "fresh".

-- Deterministic ids: u('c', 1) -> c0000000-0000-0000-0000-000000000001
create or replace function pg_temp.u(p text, n int) returns uuid language sql immutable as $$
  select (p || '0000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid
$$;
-- Moment "today + d days at time t", Moscow time.
create or replace function pg_temp.ts(d int, t time) returns timestamptz language sql stable as $$
  select ((now() at time zone 'Europe/Moscow')::date + d + t) at time zone 'Europe/Moscow'
$$;

-- Reset: drop earlier demo data (organizations cascade to every business row).
delete from public.organizations where id in (pg_temp.u('a', 1), pg_temp.u('a', 2));
delete from auth.identities
  where user_id in (select id from auth.users where email like '%@bookly.test' or email like '%@borodach.test');
delete from auth.users where email like '%@bookly.test' or email like '%@borodach.test';

-- Users. The on_auth_user_created trigger creates their profiles.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
select
  '00000000-0000-0000-0000-000000000000', pg_temp.u('b', n), 'authenticated', 'authenticated', email,
  extensions.crypt('Password123!', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', full_name),
  now(), now(), '', '', '', ''
from (values
  (1, 'alina@bookly.test',   'Алина Смирнова'),
  (2, 'pavel@bookly.test',   'Павел Дроздов'),
  (3, 'anna@bookly.test',    'Анна Ковалёва'),
  (4, 'maria@bookly.test',   'Мария Соколова'),
  (5, 'boris@borodach.test', 'Борис Тихонов'),
  (6, 'vera@borodach.test',  'Вера Лисицына')
) as t(n, email, full_name);

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), id, id::text,
       jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users where email like '%@bookly.test' or email like '%@borodach.test';

-- Organizations and members ------------------------------------------------------
insert into public.organizations (id, name, slug, phone, email, address, description) values
  (pg_temp.u('a', 1), 'Студия красоты «Лаванда»', 'lavanda-demo', '+7 (495) 123-45-67', 'hello@lavanda-studio.ru',
   'Москва, ул. Тверская, д. 18, офис 4', 'Парикмахерские услуги, маникюр, косметология и массаж в центре Москвы.'),
  (pg_temp.u('a', 2), 'Барбершоп «Борода»', 'borodach-demo', '+7 (812) 555-01-02', 'hi@borodach.test',
   'Санкт-Петербург, Невский пр., д. 50', 'Мужские стрижки и уход за бородой.');

insert into public.organization_members (org_id, user_id, role) values
  (pg_temp.u('a', 1), pg_temp.u('b', 1), 'owner'),
  (pg_temp.u('a', 1), pg_temp.u('b', 2), 'admin'),
  (pg_temp.u('a', 1), pg_temp.u('b', 3), 'staff'),
  (pg_temp.u('a', 1), pg_temp.u('b', 4), 'staff'),
  (pg_temp.u('a', 2), pg_temp.u('b', 5), 'owner'),
  (pg_temp.u('a', 2), pg_temp.u('b', 6), 'staff');

-- Services -------------------------------------------------------------------------
insert into public.services (id, org_id, name, category, description, duration_min, price, is_active)
select pg_temp.u('f', n), pg_temp.u('a', 1), name, category, description, duration, price, active
from (values
  (1, 'Женская стрижка', 'Парикмахерские услуги', 'Консультация, мытьё головы, стрижка и укладка.', 60, 2500, true),
  (2, 'Окрашивание AirTouch', 'Парикмахерские услуги', 'Сложное окрашивание с мягким переходом цвета.', 210, 12000, true),
  (3, 'Укладка', 'Парикмахерские услуги', 'Вечерняя или повседневная укладка.', 45, 1800, true),
  (4, 'Маникюр с покрытием', 'Ногтевой сервис', 'Аппаратный маникюр и стойкое покрытие гель-лаком.', 90, 2800, true),
  (5, 'Педикюр', 'Ногтевой сервис', 'Комплексный уход за стопами с покрытием.', 90, 3200, true),
  (6, 'Чистка лица', 'Косметология', 'Ультразвуковая чистка с увлажняющей маской.', 75, 4500, true),
  (7, 'Классический массаж спины', 'Массаж', 'Расслабляющий массаж спины и шейно-воротниковой зоны.', 45, 2200, true),
  (8, 'Лечебный массаж всего тела', 'Массаж', 'Курсовая процедура по рекомендации специалиста.', 90, 4200, false)
) as t(n, name, category, description, duration, price, active);

insert into public.services (id, org_id, name, category, description, duration_min, price) values
  (pg_temp.u('f', 101), pg_temp.u('a', 2), 'Мужская стрижка', 'Барбер', 'Стрижка машинкой и ножницами.', 45, 1800),
  (pg_temp.u('f', 102), pg_temp.u('a', 2), 'Моделирование бороды', 'Барбер', 'Стрижка и контур бороды, горячее полотенце.', 30, 1200);

-- Specialists (m1 and m3 have logins) --------------------------------------------------
insert into public.staff (id, org_id, user_id, full_name, job_title, phone, email, rating, color)
select pg_temp.u('e', n), pg_temp.u('a', 1), case when uid > 0 then pg_temp.u('b', uid) end, full_name, job_title, phone, email, rating, color
from (values
  (1, 3, 'Анна Ковалёва', 'Стилист-парикмахер', '+7 (916) 214-38-05', 'kovaleva@bookly.demo', 4.9, 'violet'),
  (2, 0, 'Ольга Белова', 'Колорист', '+7 (926) 553-17-42', 'belova@bookly.demo', 4.8, 'fuchsia'),
  (3, 4, 'Мария Соколова', 'Мастер маникюра', '+7 (903) 770-26-91', 'sokolova@bookly.demo', 5.0, 'indigo'),
  (4, 0, 'Екатерина Орлова', 'Косметолог', '+7 (985) 401-63-18', 'orlova@bookly.demo', 4.9, 'purple'),
  (5, 0, 'Дмитрий Назаров', 'Массажист', '+7 (909) 318-72-54', 'nazarov@bookly.demo', 4.7, 'sky')
) as t(n, uid, full_name, job_title, phone, email, rating, color);

insert into public.staff (id, org_id, user_id, full_name, job_title, rating, color)
values (pg_temp.u('e', 101), pg_temp.u('a', 2), pg_temp.u('b', 6), 'Вера Лисицына', 'Барбер', 4.9, 'violet');

insert into public.staff_services (org_id, staff_id, service_id)
select pg_temp.u('a', 1), pg_temp.u('e', m), pg_temp.u('f', s)
from (values (1,1),(1,3),(2,2),(2,3),(3,4),(3,5),(4,6),(5,7),(5,8)) as t(m, s);
insert into public.staff_services (org_id, staff_id, service_id) values
  (pg_temp.u('a', 2), pg_temp.u('e', 101), pg_temp.u('f', 101)),
  (pg_temp.u('a', 2), pg_temp.u('e', 101), pg_temp.u('f', 102));

-- Working hours: organization (staff_id null) and specialists. weekday 1 = Monday ------------
insert into public.working_hours (org_id, staff_id, weekday, start_time, end_time)
select pg_temp.u('a', 1), null, d, case d when 6 then '10:00' when 7 then '11:00' else '09:00' end::time,
       case d when 6 then '20:00' when 7 then '18:00' else '21:00' end::time
from generate_series(1, 7) d;

insert into public.working_hours (org_id, staff_id, weekday, start_time, end_time)
select pg_temp.u('a', 1), pg_temp.u('e', m), d, s::time, e::time
from (values
  (1, 1, 5, '10:00', '19:00'), (2, 2, 6, '10:00', '20:00'), (3, 1, 6, '09:00', '18:00'),
  (4, 1, 5, '11:00', '20:00'), (5, 3, 7, '12:00', '21:00')
) as t(m, d1, d2, s, e), generate_series(d1, d2) d;

-- Lunch break 13:00-14:00 for the salon's specialists.
update public.working_hours set break_start = '13:00', break_end = '14:00'
 where org_id = pg_temp.u('a', 1) and staff_id is not null;

insert into public.working_hours (org_id, staff_id, weekday, start_time, end_time)
select pg_temp.u('a', 2), pg_temp.u('e', 101), d, '10:00', '20:00' from generate_series(1, 6) d;

-- Clients -----------------------------------------------------------------------------------
insert into public.clients (id, org_id, name, phone, email, note, created_at)
select pg_temp.u('c', n), pg_temp.u('a', 1), name, phone, email, note,
       case when ago is not null then now() - ago * interval '1 day' else created::timestamptz end
from (values
  (1, 'Елена Миронова', '+7 (915) 120-45-67', 'e.mironova@mail.ru', 'Предпочитает утренние записи', null::int, '2025-03-12'),
  (2, 'Светлана Прохорова', '+7 (903) 245-18-90', 's.prohorova@yandex.ru', '', null, '2025-06-02'),
  (3, 'Игорь Левин', '+7 (926) 877-01-33', 'levin.igor@gmail.com', '', null, '2025-09-18'),
  (4, 'Наталья Григорьева', '+7 (916) 332-64-71', 'n.grigorieva@mail.ru', 'Аллергия на латекс', null, '2024-11-25'),
  (5, 'Алексей Фёдоров', '+7 (985) 590-12-48', 'fedorov.a@yandex.ru', '', null, '2026-01-14'),
  (6, 'Дарья Морозова', '+7 (909) 641-27-35', 'd.morozova@gmail.com', '', 4, null),
  (7, 'Виктория Беляева', '+7 (919) 704-83-26', 'v.belyaeva@mail.ru', '', null, '2025-12-05'),
  (8, 'Артём Зайцев', '+7 (977) 218-55-09', 'zaytsev.art@gmail.com', '', 2, null),
  (9, 'Ксения Богданова', '+7 (925) 463-90-17', 'k.bogdanova@yandex.ru', '', null, '2025-04-20'),
  (10, 'Мария Сидорова', '+7 (903) 852-36-74', 'm.sidorova@mail.ru', '', 1, null),
  (11, 'Павел Орлов', '+7 (916) 075-41-62', 'p.orlov@gmail.com', '', null, '2026-02-09'),
  (12, 'Юлия Калинина', '+7 (999) 126-70-83', 'y.kalinina@mail.ru', 'VIP-клиент', null, '2025-01-30')
) as t(n, name, phone, email, note, ago, created);

insert into public.clients (id, org_id, name, phone, email) values
  (pg_temp.u('c', 101), pg_temp.u('a', 2), 'Сергей Волков', '+7 (921) 100-20-30', 's.volkov@mail.test'),
  (pg_temp.u('c', 102), pg_temp.u('a', 2), 'Антон Крылов', '+7 (921) 200-30-40', 'a.krylov@mail.test'),
  (pg_temp.u('c', 103), pg_temp.u('a', 2), 'Максим Лебедев', '+7 (921) 300-40-50', 'm.lebedev@mail.test');

-- Appointments ----------------------------------------------------------------------------
-- Notifications for seeded rows are written explicitly below, not by the trigger.
alter table public.appointments disable trigger appointments_notify;
-- Demo visits are placed by weekday offsets, so they are not run through the working-hours rule either.
alter table public.appointments disable trigger appointments_validate;

-- History: the last 29 days. Specialists work their weekly hours, up to three 4-hour slots per day.
with slots as (
  select d, wh.staff_id, wh.end_time, wh.start_time + k * interval '4 hours' as slot,
         d * 13 + k * 7 + ascii(right(wh.staff_id::text, 1)) as h
  from generate_series(1, 29) d
  cross join generate_series(0, 2) k
  join public.working_hours wh on wh.org_id = pg_temp.u('a', 1) and wh.staff_id is not null
       and wh.weekday = extract(isodow from (now() at time zone 'Europe/Moscow')::date - d)
)
insert into public.appointments (org_id, client_id, service_id, staff_id, starts_at, ends_at, status, price)
select pg_temp.u('a', 1), cl.id, sv.id, sl.staff_id,
       pg_temp.ts(-sl.d, sl.slot), pg_temp.ts(-sl.d, sl.slot) + sv.duration_min * interval '1 minute',
       case when sl.h % 11 = 0 then 'cancelled' else 'completed' end::public.appointment_status, sv.price
from slots sl
join lateral (
  select s.id, s.price, s.duration_min
  from public.staff_services ss join public.services s on s.id = ss.service_id and s.is_active
  where ss.staff_id = sl.staff_id
  order by s.id
  offset sl.h % (select count(*) from public.staff_services z join public.services y on y.id = z.service_id and y.is_active
                 where z.staff_id = sl.staff_id)
  limit 1
) sv on true
join lateral (
  select c.id from public.clients c
  where c.org_id = pg_temp.u('a', 1) and c.created_at < pg_temp.ts(-sl.d, '00:00')
  order by c.id
  offset sl.h % (select count(*) from public.clients c2
                 where c2.org_id = pg_temp.u('a', 1) and c2.created_at < pg_temp.ts(-sl.d, '00:00'))
  limit 1
) cl on true
where sl.slot + sv.duration_min * interval '1 minute' <= sl.end_time
  and sl.h % 5 <> 0;

-- Today and the coming days (explicit, so the dashboard has a realistic schedule).
-- (day offset, time, client, service, specialist, status)
insert into public.appointments (id, org_id, client_id, service_id, staff_id, starts_at, ends_at, status, price)
select pg_temp.u('d', n), pg_temp.u('a', 1), pg_temp.u('c', c), pg_temp.u('f', s), pg_temp.u('e', m),
       pg_temp.ts(d, t::time), pg_temp.ts(d, t::time) + sv.duration_min * interval '1 minute', st::public.appointment_status, sv.price
from (values
  (1, 0, '09:30', 4, 4, 3, 'completed'), (2, 0, '10:00', 1, 1, 1, 'confirmed'), (3, 0, '11:00', 12, 2, 2, 'confirmed'),
  (4, 0, '12:30', 10, 4, 3, 'confirmed'), (5, 0, '14:00', 6, 6, 4, 'pending'), (6, 0, '15:30', 5, 7, 5, 'confirmed'),
  (7, 0, '17:00', 9, 3, 1, 'pending'),
  (8, 1, '10:00', 2, 3, 1, 'confirmed'), (9, 1, '11:00', 7, 2, 2, 'confirmed'), (10, 1, '13:00', 11, 5, 3, 'pending'),
  (11, 1, '15:00', 1, 6, 4, 'confirmed'),
  (12, 2, '10:30', 3, 1, 1, 'confirmed'), (13, 2, '12:00', 12, 4, 3, 'confirmed'), (14, 2, '16:00', 8, 7, 5, 'pending'),
  (15, 3, '11:00', 9, 1, 1, 'confirmed'), (16, 3, '14:00', 4, 2, 2, 'confirmed'), (17, 3, '15:30', 6, 5, 3, 'pending'),
  (18, 4, '11:00', 10, 6, 4, 'confirmed'), (19, 4, '13:30', 5, 3, 2, 'confirmed'),
  (20, 5, '12:00', 7, 4, 3, 'confirmed'), (21, 5, '15:00', 11, 7, 5, 'pending')
) as t(n, d, t, c, s, m, st)
join public.services sv on sv.id = pg_temp.u('f', t.s);

-- Notifications (read state varies) ---------------------------------------------------------------
insert into public.notifications (org_id, user_id, type, title, body, appointment_id, is_read, created_at) values
  (pg_temp.u('a', 1), pg_temp.u('b', 3), 'appointment_created', 'Новая запись', 'Елена Миронова — Женская стрижка', pg_temp.u('d', 2), false, now() - interval '3 hours'),
  (pg_temp.u('a', 1), pg_temp.u('b', 3), 'appointment_created', 'Новая запись', 'Ксения Богданова — Женская стрижка', pg_temp.u('d', 15), false, now() - interval '1 hour'),
  (pg_temp.u('a', 1), pg_temp.u('b', 3), 'system', 'Добро пожаловать в Bookly', 'Здесь появляются уведомления о ваших записях.', null, true, now() - interval '2 days'),
  (pg_temp.u('a', 1), pg_temp.u('b', 4), 'appointment_created', 'Новая запись', 'Мария Сидорова — Маникюр с покрытием', pg_temp.u('d', 4), false, now() - interval '30 minutes'),
  (pg_temp.u('a', 1), pg_temp.u('b', 1), 'system', 'Добро пожаловать в Bookly', 'Демо-данные студии «Лаванда» загружены.', null, false, now() - interval '1 day'),
  (pg_temp.u('a', 2), pg_temp.u('b', 6), 'system', 'Добро пожаловать в Bookly', 'Это отдельная организация для проверки изоляции данных.', null, false, now());

-- Second organization -----------------------------------------------------------------------------
insert into public.appointments (id, org_id, client_id, service_id, staff_id, starts_at, ends_at, status, price)
select pg_temp.u('d', n), pg_temp.u('a', 2), pg_temp.u('c', c), pg_temp.u('f', s), pg_temp.u('e', 101),
       pg_temp.ts(d, t::time), pg_temp.ts(d, t::time) + sv.duration_min * interval '1 minute', st::public.appointment_status, sv.price
from (values
  (101, 0, '11:00', 101, 101, 'confirmed'), (102, 0, '13:00', 102, 102, 'pending'),
  (103, 1, '12:00', 103, 101, 'confirmed'), (104, -2, '15:00', 101, 102, 'completed')
) as t(n, d, t, c, s, st)
join public.services sv on sv.id = pg_temp.u('f', t.s);

alter table public.appointments enable trigger appointments_notify;
alter table public.appointments enable trigger appointments_validate;
