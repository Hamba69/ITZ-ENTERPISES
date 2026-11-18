-- Require service-managed shared access; never create a personal fallback workspace.
create or replace function public.itz_workspace_owner_id()
returns uuid language sql stable set search_path = '' as $$
  select case
    when auth.uid() is not null
      and coalesce(auth.jwt()->'app_metadata'->>'itz_workspace_access', '') = 'shared_admin'
      and coalesce(auth.jwt()->'app_metadata'->>'itz_workspace_owner_id', '')
        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then (auth.jwt()->'app_metadata'->>'itz_workspace_owner_id')::uuid
    else null
  end
$$;
revoke all on function public.itz_workspace_owner_id() from public, anon;
grant execute on function public.itz_workspace_owner_id() to authenticated;

-- Retain historical copies for recovery, but retire all application access.
revoke all on public.itz_shared_workspaces from public, anon, authenticated;
revoke all on function public.itz_create_shared_workspace(text, jsonb) from public, anon, authenticated;
revoke all on function public.itz_get_shared_workspace(text) from public, anon, authenticated;
revoke all on function public.itz_save_shared_workspace(text, jsonb, bigint) from public, anon, authenticated;
