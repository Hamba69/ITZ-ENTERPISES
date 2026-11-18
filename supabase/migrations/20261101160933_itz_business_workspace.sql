-- One private business workspace per authenticated owner. No shared team access.
create table public.itz_workspaces (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null check (jsonb_typeof(data) = 'object' and data @> '{"schemaVersion":1}'::jsonb and octet_length(data::text) <= 5000000),
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default now()
);

-- Supabase service-managed app_metadata can assign both admins to one workspace owner.
create function public.itz_workspace_owner_id()
returns uuid language sql stable set search_path = '' as $$
  select case
    when coalesce(auth.jwt()->'app_metadata'->>'itz_workspace_access', '') = 'shared_admin'
      and coalesce(auth.jwt()->'app_metadata'->>'itz_workspace_owner_id', '')
        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then (auth.jwt()->'app_metadata'->>'itz_workspace_owner_id')::uuid
    else auth.uid()
  end
$$;
revoke all on function public.itz_workspace_owner_id() from public, anon;
grant execute on function public.itz_workspace_owner_id() to authenticated;

alter table public.itz_workspaces enable row level security;
create policy "Owners read their business" on public.itz_workspaces for select to authenticated using ((select public.itz_workspace_owner_id()) = owner_id);
create policy "Owners create their business" on public.itz_workspaces for insert to authenticated with check ((select public.itz_workspace_owner_id()) = owner_id);
create policy "Owners update their business" on public.itz_workspaces for update to authenticated using ((select public.itz_workspace_owner_id()) = owner_id) with check ((select public.itz_workspace_owner_id()) = owner_id);
-- Supabase default grants can include TRUNCATE, which bypasses RLS. Reset all
-- inherited table grants before allowing only the operations this app needs.
revoke all on public.itz_workspaces from public, anon, authenticated;
grant select, insert, update on public.itz_workspaces to authenticated;

-- Compare-and-swap prevents stale tabs/devices silently overwriting records.
create or replace function public.itz_save_workspace(payload jsonb, expected_version bigint)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare next_version bigint;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if expected_version = 0 then
    insert into public.itz_workspaces(owner_id, data) values(public.itz_workspace_owner_id(), payload)
    on conflict do nothing returning version into next_version;
  else
    update public.itz_workspaces set data=payload, version=version+1, updated_at=now()
    where owner_id=public.itz_workspace_owner_id() and version=expected_version returning version into next_version;
  end if;
  if next_version is null then raise exception 'Workspace conflict' using errcode = '40001'; end if;
  return next_version;
end;
$$;
revoke all on function public.itz_save_workspace(jsonb,bigint) from public, anon;
grant execute on function public.itz_save_workspace(jsonb,bigint) to authenticated;
