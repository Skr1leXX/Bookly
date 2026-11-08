-- Bookly: Row Level Security.
-- A user sees only rows of organizations they belong to. Roles:
--   owner  - everything, incl. granting 'owner' and deleting the organization
--   admin  - manages catalog, staff, schedule, members (not owners), appointments
--   staff  - reads the organization, books visits, edits clients and their OWN appointments

-- Helpers are SECURITY DEFINER so policies on organization_members do not recurse.
create function public.is_org_member(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members m
    where m.org_id = p_org and m.user_id = (select auth.uid())
  )
$$;

create function public.has_org_role(p_org uuid, p_roles public.member_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members m
    where m.org_id = p_org and m.user_id = (select auth.uid()) and m.role = any (p_roles)
  )
$$;

-- Is p_user a member of p_org? Used to validate user columns.
create function public.is_org_user(p_org uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.organization_members m where m.org_id = p_org and m.user_id = p_user)
$$;

create function public.shares_org_with(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.organization_members a
    join public.organization_members b on b.org_id = a.org_id
    where a.user_id = p_user and b.user_id = (select auth.uid())
  )
$$;

-- Is the current user the login behind specialist p_staff?
create function public.is_own_staff(p_org uuid, p_staff uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.staff s
    where s.id = p_staff and s.org_id = p_org and s.user_id = (select auth.uid())
  )
$$;

revoke all on function public.is_org_member(uuid), public.has_org_role(uuid, public.member_role[]),
  public.is_org_user(uuid, uuid), public.shares_org_with(uuid), public.is_own_staff(uuid, uuid) from public, anon;
grant execute on function public.is_org_member(uuid), public.has_org_role(uuid, public.member_role[]),
  public.is_org_user(uuid, uuid), public.shares_org_with(uuid), public.is_own_staff(uuid, uuid) to authenticated;

-- Trigger functions: nobody should call them directly.
revoke all on function public.handle_new_user(), public.notify_appointment() from public, anon, authenticated;

-- Privileges: anon gets nothing; authenticated is gated by RLS below.
revoke all on all tables in schema public from anon, authenticated;
grant select, insert, update, delete on
  public.clients, public.services, public.staff, public.staff_services, public.working_hours,
  public.appointments, public.organization_members
  to authenticated;
grant select, update on public.organizations, public.profiles to authenticated;
grant delete on public.organizations to authenticated;
grant select, delete on public.notifications to authenticated; -- rows are created by triggers only
grant update (is_read) on public.notifications to authenticated;

alter table public.organizations        enable row level security;
alter table public.profiles             enable row level security;
alter table public.organization_members enable row level security;
alter table public.clients              enable row level security;
alter table public.services             enable row level security;
alter table public.staff                enable row level security;
alter table public.staff_services       enable row level security;
alter table public.working_hours        enable row level security;
alter table public.appointments         enable row level security;
alter table public.notifications        enable row level security;

-- organizations (created only by the sign-up trigger) ---------------------------
create policy org_select on public.organizations for select to authenticated
  using (public.is_org_member(id));
create policy org_update on public.organizations for update to authenticated
  using (public.has_org_role(id, array['owner', 'admin']::public.member_role[]))
  with check (public.has_org_role(id, array['owner', 'admin']::public.member_role[]));
create policy org_delete on public.organizations for delete to authenticated
  using (public.has_org_role(id, array['owner']::public.member_role[]));

-- profiles (created only by the sign-up trigger) --------------------------------
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_org_with(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- organization_members: members read; owners/admins manage; only owners grant 'owner'
create policy members_select on public.organization_members for select to authenticated
  using (public.is_org_member(org_id));
create policy members_insert on public.organization_members for insert to authenticated
  with check (
    public.has_org_role(org_id, array['owner', 'admin']::public.member_role[])
    and (role <> 'owner' or public.has_org_role(org_id, array['owner']::public.member_role[]))
  );
create policy members_update on public.organization_members for update to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin']::public.member_role[]))
  with check (
    public.has_org_role(org_id, array['owner', 'admin']::public.member_role[])
    and (role <> 'owner' or public.has_org_role(org_id, array['owner']::public.member_role[]))
  );
create policy members_delete on public.organization_members for delete to authenticated
  using (
    public.has_org_role(org_id, array['owner', 'admin']::public.member_role[])
    and (role <> 'owner' or public.has_org_role(org_id, array['owner']::public.member_role[]))
  );

-- clients: every member reads and edits; owners/admins delete --------------------
create policy clients_select on public.clients for select to authenticated
  using (public.is_org_member(org_id));
create policy clients_insert on public.clients for insert to authenticated
  with check (public.is_org_member(org_id));
create policy clients_update on public.clients for update to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy clients_delete on public.clients for delete to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin']::public.member_role[]));

-- catalog, specialists, schedule: every member reads; owners/admins write --------
create policy services_select on public.services for select to authenticated
  using (public.is_org_member(org_id));
create policy services_write on public.services for all to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin']::public.member_role[]))
  with check (public.has_org_role(org_id, array['owner', 'admin']::public.member_role[]));

create policy staff_select on public.staff for select to authenticated
  using (public.is_org_member(org_id));
create policy staff_write on public.staff for all to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin']::public.member_role[]))
  with check (
    public.has_org_role(org_id, array['owner', 'admin']::public.member_role[])
    and (user_id is null or public.is_org_user(org_id, user_id))
  );

create policy staff_services_select on public.staff_services for select to authenticated
  using (public.is_org_member(org_id));
create policy staff_services_write on public.staff_services for all to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin']::public.member_role[]))
  with check (public.has_org_role(org_id, array['owner', 'admin']::public.member_role[]));

create policy working_hours_select on public.working_hours for select to authenticated
  using (public.is_org_member(org_id));
create policy working_hours_write on public.working_hours for all to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin']::public.member_role[]))
  with check (public.has_org_role(org_id, array['owner', 'admin']::public.member_role[]));

-- appointments: members read and create; staff update only their own; admins delete
create policy appointments_select on public.appointments for select to authenticated
  using (public.is_org_member(org_id));
create policy appointments_insert on public.appointments for insert to authenticated
  with check (public.is_org_member(org_id) and (created_by is null or created_by = (select auth.uid())));
create policy appointments_update on public.appointments for update to authenticated
  using (
    public.has_org_role(org_id, array['owner', 'admin']::public.member_role[])
    or public.is_own_staff(org_id, staff_id)
  )
  with check (
    public.has_org_role(org_id, array['owner', 'admin']::public.member_role[])
    or public.is_own_staff(org_id, staff_id)
  );
create policy appointments_delete on public.appointments for delete to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin']::public.member_role[]));

-- notifications: strictly personal -----------------------------------------------
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_delete on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));
