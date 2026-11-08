-- Bookly: public online booking.
-- Anonymous visitors never touch tables. They call four SECURITY DEFINER functions that return only public data
-- (no phones/emails of staff or clients) and that create an appointment after re-checking everything in one place.

-- 1. Breaks (one per working day) and the origin of an appointment ----------------------------------------------
alter table public.working_hours
  add column break_start time,
  add column break_end   time,
  add constraint working_hours_break_chk check (
    (break_start is null and break_end is null)
    or (break_start is not null and break_end is not null and break_end > break_start
        and break_start >= start_time and break_end <= end_time)
  );

alter table public.appointments
  add column source text not null default 'admin' check (source in ('admin', 'online'));

-- 2. The booking rule trigger now knows about breaks ----------------------------------------------------------
create or replace function public.validate_appointment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_staff_active   boolean;
  v_service_active boolean;
  v_tz             text;
  v_start          timestamp;
  v_end            timestamp;
  v_w              public.working_hours;
begin
  if new.status not in ('pending', 'confirmed') then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status in ('pending', 'confirmed')
     and new.staff_id = old.staff_id and new.service_id = old.service_id
     and new.starts_at = old.starts_at and new.ends_at = old.ends_at then
    return new;
  end if;

  select s.is_active into v_staff_active from public.staff s where s.id = new.staff_id;
  if not coalesce(v_staff_active, false) then
    raise exception 'Специалист временно отключён';
  end if;

  select s.is_active into v_service_active from public.services s where s.id = new.service_id;
  if not coalesce(v_service_active, false) then
    raise exception 'Услуга отключена';
  end if;

  if not exists (select 1 from public.staff_services ss where ss.staff_id = new.staff_id and ss.service_id = new.service_id) then
    raise exception 'Этот специалист не оказывает выбранную услугу';
  end if;

  select o.timezone into v_tz from public.organizations o where o.id = new.org_id;
  v_start := new.starts_at at time zone coalesce(v_tz, 'UTC');
  v_end   := new.ends_at   at time zone coalesce(v_tz, 'UTC');
  if v_start::date <> v_end::date then
    raise exception 'Запись не может переходить на следующий день';
  end if;

  select w.* into v_w from public.working_hours w
   where w.staff_id = new.staff_id and w.weekday = extract(isodow from v_start)
     and w.start_time <= v_start::time and w.end_time >= v_end::time;
  if not found then
    raise exception 'Специалист не работает в это время';
  end if;
  if v_w.break_start is not null and v_start::time < v_w.break_end and v_end::time > v_w.break_start then
    raise exception 'У специалиста перерыв в это время';
  end if;
  return new;
end $$;

-- 3. save_staff stores breaks too: hours items are {"weekday":1,"start":"10:00","end":"19:00","breakStart":"13:00","breakEnd":"14:00"}
create or replace function public.save_staff(
  p_org uuid, p_id uuid, p_full_name text, p_job_title text, p_phone text, p_email text,
  p_color text, p_is_active boolean, p_services uuid[], p_hours jsonb
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid := p_id;
begin
  if p_id is null then
    insert into public.staff (org_id, full_name, job_title, phone, email, color, is_active)
    values (p_org, p_full_name, p_job_title, p_phone, p_email, p_color, p_is_active)
    returning id into v_id;
  else
    update public.staff
       set full_name = p_full_name, job_title = p_job_title, phone = p_phone, email = p_email,
           color = p_color, is_active = p_is_active
     where id = p_id and org_id = p_org;
    if not found then
      raise exception 'Специалист не найден или нет прав на изменение';
    end if;
  end if;

  delete from public.staff_services where staff_id = v_id and org_id = p_org;
  insert into public.staff_services (org_id, staff_id, service_id)
  select p_org, v_id, s from unnest(coalesce(p_services, '{}')) s;

  delete from public.working_hours where staff_id = v_id and org_id = p_org;
  insert into public.working_hours (org_id, staff_id, weekday, start_time, end_time, break_start, break_end)
  select p_org, v_id, (h ->> 'weekday')::smallint, (h ->> 'start')::time, (h ->> 'end')::time,
         nullif(h ->> 'breakStart', '')::time, nullif(h ->> 'breakEnd', '')::time
  from jsonb_array_elements(coalesce(p_hours, '[]')) h;

  return v_id;
end $$;

-- 4. Abuse protection: every call is logged, limits are counted from the log ---------------------------------
create table public.booking_attempts (
  id          bigint generated always as identity primary key,
  org_id      uuid not null references public.organizations (id) on delete cascade,
  fingerprint text not null default '',
  phone_key   text not null default '',
  created_at  timestamptz not null default now()
);
create index booking_attempts_org_idx   on public.booking_attempts (org_id, created_at desc);
create index booking_attempts_fp_idx    on public.booking_attempts (org_id, fingerprint, created_at desc);
create index booking_attempts_phone_idx on public.booking_attempts (org_id, phone_key, created_at desc);
alter table public.booking_attempts enable row level security; -- no policies: only the functions below write/read it
revoke all on public.booking_attempts from public, anon, authenticated;

-- Digits of a phone number; a Russian 8XXXXXXXXXX is the same number as +7XXXXXXXXXX.
create function public.phone_key(p text) returns text
language sql immutable set search_path = '' as $$
  select case when length(d) = 11 and left(d, 1) = '8' then '7' || substr(d, 2) else d end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x
$$;

-- 5. Free slots. Internal: not callable by API roles -----------------------------------------------------------
-- Candidate starts every 15 minutes inside the specialist's window, not in a break, not overlapping a live appointment,
-- at least one hour from now. With p_staff = null the least busy specialist of that day is assigned to each time.
create function public._slots(p_org uuid, p_service uuid, p_staff uuid, p_date date)
returns table (slot_time time, slot_staff uuid)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_tz  text;
  v_dur interval;
  v_now timestamp;
begin
  select o.timezone into v_tz from public.organizations o where o.id = p_org;
  select make_interval(mins => s.duration_min) into v_dur
    from public.services s where s.id = p_service and s.org_id = p_org and s.is_active;
  if v_tz is null or v_dur is null then
    return;
  end if;
  v_now := now() at time zone v_tz;

  return query
  with cand as (
    select st.id as sid, g.s as s_local,
           (select count(*) from public.appointments a
             where a.staff_id = st.id and a.status <> 'cancelled' and (a.starts_at at time zone v_tz)::date = p_date) as load
    from public.staff st
    join public.staff_services ss on ss.staff_id = st.id and ss.service_id = p_service
    join public.working_hours w on w.staff_id = st.id and w.weekday = extract(isodow from p_date)
    cross join lateral generate_series(p_date + w.start_time, p_date + w.end_time - v_dur, interval '15 minutes') as g(s)
    where st.org_id = p_org and st.is_active and (p_staff is null or st.id = p_staff)
      and g.s >= v_now + interval '1 hour'
      and (w.break_start is null or not (g.s < p_date + w.break_end and g.s + v_dur > p_date + w.break_start))
      and not exists (
        select 1 from public.appointments a
         where a.staff_id = st.id and a.status <> 'cancelled'
           and tstzrange(a.starts_at, a.ends_at) && tstzrange(g.s at time zone v_tz, (g.s + v_dur) at time zone v_tz))
  )
  select distinct on (c.s_local) c.s_local::time, c.sid from cand c order by c.s_local, c.load, c.sid;
end $$;

-- 6. Public API -------------------------------------------------------------------------------------------------
create function public.public_org(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v jsonb;
begin
  select jsonb_build_object(
    'name', o.name, 'description', o.description, 'address', o.address, 'phone', o.phone, 'timezone', o.timezone,
    'today', to_char(now() at time zone o.timezone, 'YYYY-MM-DD'),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'category', s.category, 'description', s.description,
                                          'duration', s.duration_min, 'price', s.price) order by s.category, s.name)
      from public.services s
      where s.org_id = o.id and s.is_active
        and exists (select 1 from public.staff_services ss join public.staff st on st.id = ss.staff_id
                     where ss.service_id = s.id and st.is_active
                       and exists (select 1 from public.working_hours w where w.staff_id = st.id))
    ), '[]'::jsonb),
    'staff', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', st.id, 'name', st.full_name, 'jobTitle', st.job_title,
        'serviceIds', (select coalesce(jsonb_agg(ss.service_id), '[]'::jsonb) from public.staff_services ss where ss.staff_id = st.id),
        'weekdays', (select coalesce(jsonb_agg(w.weekday), '[]'::jsonb) from public.working_hours w where w.staff_id = st.id)
      ) order by st.created_at)
      from public.staff st where st.org_id = o.id and st.is_active
    ), '[]'::jsonb)
  ) into v
  from public.organizations o where o.slug = p_slug;
  return v;
end $$;

create function public.public_slots(p_slug text, p_service uuid, p_staff uuid, p_date date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_org   uuid;
  v_tz    text;
  v_today date;
  v       jsonb;
begin
  select o.id, o.timezone into v_org, v_tz from public.organizations o where o.slug = p_slug;
  if v_org is null or p_date is null then
    return '[]'::jsonb;
  end if;
  v_today := (now() at time zone v_tz)::date;
  if p_date < v_today or p_date > v_today + 60 then
    return '[]'::jsonb;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('time', to_char(s.slot_time, 'HH24:MI'), 'staffId', s.slot_staff) order by s.slot_time), '[]'::jsonb)
    into v from public._slots(v_org, p_service, p_staff, p_date) s;
  return v;
end $$;

-- Never raises for business failures (so the attempt log survives); returns {ok, error, field?, message?, id?}.
create function public.public_book(
  p_slug text, p_service uuid, p_staff uuid, p_date date, p_time text,
  p_name text, p_phone text, p_email text, p_note text, p_fingerprint text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org     uuid;
  v_tz      text;
  v_fp      text := left(coalesce(p_fingerprint, ''), 64);
  v_name    text := btrim(coalesce(p_name, ''));
  v_phone   text := btrim(coalesce(p_phone, ''));
  v_email   text := lower(btrim(coalesce(p_email, '')));
  v_note    text := btrim(coalesce(p_note, ''));
  v_digits  text := public.phone_key(p_phone);
  v_time    time;
  v_start   timestamp;
  v_service public.services;
  v_staff   uuid;
  v_client  uuid;
  v_appt    uuid;
  v_staff_user uuid;
  v_today   date;
begin
  select o.id, o.timezone into v_org, v_tz from public.organizations o where o.slug = p_slug;
  if v_org is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Rate limits. They do not trust the fingerprint alone (a caller can invent it): the organization-wide and
  -- per-phone limits hold for any caller.
  delete from public.booking_attempts where created_at < now() - interval '2 days';
  if (select count(*) from public.booking_attempts where org_id = v_org and created_at > now() - interval '10 minutes') >= 30
     or (v_fp <> '' and (select count(*) from public.booking_attempts where org_id = v_org and fingerprint = v_fp and created_at > now() - interval '10 minutes') >= 5)
     or (v_digits <> '' and (select count(*) from public.booking_attempts where org_id = v_org and phone_key = v_digits and created_at > now() - interval '10 minutes') >= 5)
     or (select count(*) from public.appointments where org_id = v_org and source = 'online' and created_at > now() - interval '1 day') >= 200 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  insert into public.booking_attempts (org_id, fingerprint, phone_key) values (v_org, v_fp, v_digits);

  -- Contact validation
  if char_length(v_name) < 1 or char_length(v_name) > 120 then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'field', 'name', 'message', 'Укажите имя');
  end if;
  if v_phone !~ '^\+?[0-9\s()\-]{7,25}$' or char_length(v_digits) not between 7 and 15 then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'field', 'phone', 'message', 'Некорректный телефон');
  end if;
  if char_length(v_email) > 120 or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'field', 'email', 'message', 'Некорректный email');
  end if;
  if char_length(v_note) > 500 then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'field', 'note', 'message', 'Не более 500 символов');
  end if;
  begin
    v_time := p_time::time;
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'field', 'time', 'message', 'Некорректное время');
  end;

  select s.* into v_service from public.services s where s.id = p_service and s.org_id = v_org and s.is_active;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'unavailable', 'message', 'Услуга недоступна');
  end if;

  -- Not in the past (one hour lead time) and not too far ahead
  v_today := (now() at time zone v_tz)::date;
  v_start := p_date + v_time;
  if v_start < (now() at time zone v_tz) + interval '1 hour' then
    return jsonb_build_object('ok', false, 'error', 'past');
  end if;
  if p_date > v_today + 60 then
    return jsonb_build_object('ok', false, 'error', 'unavailable', 'message', 'Запись доступна не более чем на 60 дней вперёд');
  end if;

  -- At most 3 live future bookings per phone
  if (select count(*) from public.appointments a join public.clients c on c.id = a.client_id
       where a.org_id = v_org and a.status in ('pending', 'confirmed') and a.starts_at > now()
         and public.phone_key(c.phone) = v_digits) >= 3 then
    return jsonb_build_object('ok', false, 'error', 'too_many_bookings');
  end if;

  begin
    -- Serialize bookings of the same pool of specialists, then re-check the slot against fresh data.
    perform pg_advisory_xact_lock(hashtextextended(v_org::text || p_service::text, 0));
    select s.slot_staff into v_staff from public._slots(v_org, p_service, p_staff, p_date) s where s.slot_time = v_time limit 1;
    if v_staff is null then
      return jsonb_build_object('ok', false, 'error', 'slot_taken');
    end if;

    -- Reuse a client only when phone AND name match; never overwrite an existing client's data.
    select c.id into v_client from public.clients c
     where c.org_id = v_org and public.phone_key(c.phone) = v_digits and lower(btrim(c.name)) = lower(v_name) limit 1;
    if v_client is null then
      insert into public.clients (org_id, name, phone, email, note)
      values (v_org, v_name, v_phone, v_email, 'Создан через онлайн-запись') returning id into v_client;
    end if;

    insert into public.appointments (org_id, client_id, service_id, staff_id, starts_at, ends_at, status, price, notes, source)
    values (v_org, v_client, p_service, v_staff, v_start at time zone v_tz,
            (v_start + make_interval(mins => v_service.duration_min)) at time zone v_tz,
            'pending', v_service.price, v_note, 'online')
    returning id into v_appt;
  exception
    when exclusion_violation then
      return jsonb_build_object('ok', false, 'error', 'slot_taken');
    when raise_exception then
      return jsonb_build_object('ok', false, 'error', 'unavailable', 'message', sqlerrm);
  end;

  -- The specialist's login is notified by the appointments trigger; owners and admins are notified here.
  select st.user_id into v_staff_user from public.staff st where st.id = v_staff;
  insert into public.notifications (org_id, user_id, type, title, body, appointment_id)
  select v_org, m.user_id, 'appointment_created', 'Новая онлайн-запись', v_name || ' — ' || v_service.name, v_appt
    from public.organization_members m
   where m.org_id = v_org and m.role in ('owner', 'admin') and m.user_id is distinct from v_staff_user;

  return jsonb_build_object('ok', true, 'id', v_appt);
end $$;

-- Details for the confirmation page. The id is a random UUID; only online bookings are exposed and no contact data.
create function public.public_appointment(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v jsonb;
begin
  select jsonb_build_object(
    'status', a.status, 'date', to_char(a.starts_at at time zone o.timezone, 'YYYY-MM-DD'),
    'time', to_char(a.starts_at at time zone o.timezone, 'HH24:MI'), 'endTime', to_char(a.ends_at at time zone o.timezone, 'HH24:MI'),
    'service', s.name, 'price', a.price, 'staff', st.full_name,
    'org', jsonb_build_object('name', o.name, 'address', o.address, 'phone', o.phone, 'slug', o.slug),
    'clientName', split_part(c.name, ' ', 1)
  ) into v
  from public.appointments a
  join public.organizations o on o.id = a.org_id
  join public.services s on s.id = a.service_id
  join public.staff st on st.id = a.staff_id
  join public.clients c on c.id = a.client_id
  where a.id = p_id and a.source = 'online';
  return v;
end $$;

revoke all on function public._slots(uuid, uuid, uuid, date) from public, anon, authenticated;
revoke all on function public.public_org(text), public.public_slots(text, uuid, uuid, date),
  public.public_book(text, uuid, uuid, date, text, text, text, text, text, text), public.public_appointment(uuid) from public;
grant execute on function public.public_org(text), public.public_slots(text, uuid, uuid, date),
  public.public_book(text, uuid, uuid, date, text, text, text, text, text, text), public.public_appointment(uuid) to anon, authenticated;
