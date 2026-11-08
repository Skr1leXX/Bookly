-- The address of the public booking page (organizations.slug) must not change through the API:
-- an owner or an admin who edits the company would otherwise break every link that was shared with clients.
-- Changes made without a signed-in user (SQL Editor, migrations, seed) are still allowed.
create function public.protect_org_slug() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.slug is distinct from old.slug and (select auth.uid()) is not null then
    raise exception 'Адрес страницы записи нельзя изменить';
  end if;
  return new;
end $$;

create trigger organizations_protect_slug before update of slug on public.organizations
  for each row execute function public.protect_org_slug();
revoke all on function public.protect_org_slug() from public, anon, authenticated;
