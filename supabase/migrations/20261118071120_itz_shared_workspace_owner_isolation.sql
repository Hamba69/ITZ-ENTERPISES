alter table public.itz_shared_workspaces
  add column owner_id uuid references auth.users(id) on delete cascade;

create or replace function public.itz_create_shared_workspace(p_token_hash text, payload jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  created_version bigint;
  workspace_owner uuid := public.itz_workspace_owner_id();
begin
  if workspace_owner is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
    or payload is null
    or jsonb_typeof(payload) <> 'object'
    or not payload @> '{"schemaVersion":1}'::jsonb
    or octet_length(payload::text) > 5000000
  then
    raise exception 'Invalid shared workspace data' using errcode = '22023';
  end if;

  insert into public.itz_shared_workspaces(token_hash, data, owner_id)
  values (p_token_hash, payload, workspace_owner)
  returning version into created_version;
  return created_version;
end;
$$;

create or replace function public.itz_get_shared_workspace(p_token_hash text)
returns table(data jsonb, version bigint)
language sql stable security definer set search_path = '' as $$
  select workspace.data, workspace.version
  from public.itz_shared_workspaces as workspace
  where workspace.token_hash = p_token_hash
    and workspace.owner_id = public.itz_workspace_owner_id()
$$;

create or replace function public.itz_save_shared_workspace(
  p_token_hash text,
  payload jsonb,
  expected_version bigint
)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  next_version bigint;
  workspace_owner uuid := public.itz_workspace_owner_id();
begin
  if workspace_owner is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
    or payload is null
    or jsonb_typeof(payload) <> 'object'
    or not payload @> '{"schemaVersion":1}'::jsonb
    or octet_length(payload::text) > 5000000
    or expected_version is null
    or expected_version < 1
  then
    raise exception 'Invalid shared workspace data' using errcode = '22023';
  end if;

  update public.itz_shared_workspaces
  set data = payload, version = version + 1, updated_at = now()
  where token_hash = p_token_hash
    and owner_id = workspace_owner
    and version = expected_version
  returning version into next_version;

  if next_version is null then
    raise exception 'Workspace conflict' using errcode = '40001';
  end if;
  return next_version;
end;
$$;

revoke all on function public.itz_create_shared_workspace(text, jsonb) from public, anon, authenticated;
revoke all on function public.itz_get_shared_workspace(text) from public, anon, authenticated;
revoke all on function public.itz_save_shared_workspace(text, jsonb, bigint) from public, anon, authenticated;
grant execute on function public.itz_create_shared_workspace(text, jsonb) to authenticated;
grant execute on function public.itz_get_shared_workspace(text) to authenticated;
grant execute on function public.itz_save_shared_workspace(text, jsonb, bigint) to authenticated;
