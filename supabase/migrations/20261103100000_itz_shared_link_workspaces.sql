create table public.itz_shared_workspaces (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  data jsonb not null check (
    jsonb_typeof(data) = 'object'
    and data @> '{"schemaVersion":1}'::jsonb
    and octet_length(data::text) <= 5000000
  ),
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default now()
);

alter table public.itz_shared_workspaces enable row level security;
revoke all on public.itz_shared_workspaces from public, anon, authenticated;

create or replace function public.itz_create_shared_workspace(p_token_hash text, payload jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare created_version bigint;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
    or payload is null
    or jsonb_typeof(payload) <> 'object'
    or not payload @> '{"schemaVersion":1}'::jsonb
    or octet_length(payload::text) > 5000000
  then
    raise exception 'Invalid shared workspace data' using errcode = '22023';
  end if;

  insert into public.itz_shared_workspaces(token_hash, data)
  values (p_token_hash, payload)
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
$$;

create or replace function public.itz_save_shared_workspace(
  p_token_hash text,
  payload jsonb,
  expected_version bigint
)
returns bigint language plpgsql security definer set search_path = '' as $$
declare next_version bigint;
begin
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
  where token_hash = p_token_hash and version = expected_version
  returning version into next_version;

  if next_version is null then
    raise exception 'Workspace conflict' using errcode = '40001';
  end if;
  return next_version;
end;
$$;

revoke all on function public.itz_create_shared_workspace(text, jsonb) from public;
revoke all on function public.itz_get_shared_workspace(text) from public;
revoke all on function public.itz_save_shared_workspace(text, jsonb, bigint) from public;
grant execute on function public.itz_create_shared_workspace(text, jsonb) to anon, authenticated;
grant execute on function public.itz_get_shared_workspace(text) to anon, authenticated;
grant execute on function public.itz_save_shared_workspace(text, jsonb, bigint) to anon, authenticated;
