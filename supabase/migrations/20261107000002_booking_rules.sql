-- Bookly: business rules enforced in the database (the UI repeats them only as hints).
--  1. An active appointment (pending/confirmed) needs an active specialist and service,
--     a specialist who performs that service, and a slot inside the specialist's working hours.
--  2. Double booking is already rejected by the exclusion constraint (see schema migration).
--  3. save_staff(): one transaction for a specialist + their services + weekly schedule.

create function public.validate_appointment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_staff_active   boolean;
  v_service_active boolean;
  v_tz             text;
  v_start          timestamp;
  v_end            timestamp;
begin
  -- Finished / cancelled visits are history: never re-validated.
  if new.status not in ('pending', 'confirmed') then
    return new;
  end if;
  -- Unchanged slot of an already active visit (e.g. pending -> confirmed): nothing to re-check.
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

  if not exists (
    select 1 from public.working_hours w
    where w.staff_id = new.staff_id and w.weekday = extract(isodow from v_start)
      and w.start_time <= v_start::time and w.end_time >= v_end::time
  ) then
    raise exception 'Специалист не работает в это время';
  end if;
  return new;
end $$;

create trigger appointments_validate before insert or update on public.appointments
  for each row execute function public.validate_appointment();
revoke all on function public.validate_appointment() from public, anon, authenticated;

-- p_hours: [{"weekday": 1, "start": "10:00", "end": "19:00"}, ...] (days that are not listed are days off).
-- SECURITY INVOKER: every statement still passes through RLS, so only owners/admins can use it.
create function public.save_staff(
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
  insert into public.working_hours (org_id, staff_id, weekday, start_time, end_time)
  select p_org, v_id, (h ->> 'weekday')::smallint, (h ->> 'start')::time, (h ->> 'end')::time
  from jsonb_array_elements(coalesce(p_hours, '[]')) h;

  return v_id;
end $$;
revoke all on function public.save_staff(uuid, uuid, text, text, text, text, text, boolean, uuid[], jsonb) from public, anon;
grant execute on function public.save_staff(uuid, uuid, text, text, text, text, text, boolean, uuid[], jsonb) to authenticated;

-- Organization profile + opening hours (staff_id is null) in one transaction. SECURITY INVOKER: RLS limits it to owners/admins.
-- p_hours has the same shape as in save_staff.
create function public.save_company(
  p_org uuid, p_name text, p_phone text, p_email text, p_address text, p_description text, p_hours jsonb
) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  update public.organizations
     set name = p_name, phone = p_phone, email = p_email, address = p_address, description = p_description
   where id = p_org;
  if not found then
    raise exception 'Организация не найдена или нет прав на изменение';
  end if;

  delete from public.working_hours where org_id = p_org and staff_id is null;
  insert into public.working_hours (org_id, staff_id, weekday, start_time, end_time)
  select p_org, null, (h ->> 'weekday')::smallint, (h ->> 'start')::time, (h ->> 'end')::time
  from jsonb_array_elements(coalesce(p_hours, '[]')) h;
end $$;
revoke all on function public.save_company(uuid, text, text, text, text, text, jsonb) from public, anon;
grant execute on function public.save_company(uuid, text, text, text, text, text, jsonb) to authenticated;
