-- ITZ first-time database setup. Run the WHOLE file in Supabase SQL Editor as postgres.
-- Intended project: rmmwkuihqmezwdugttsr. Both Auth users must already exist.
-- All authorised app profiles share the business admin's workspace.
-- Does not import device JSON or merge historical workspaces.
-- Stops without changes if any ITZ tables already exist: inspect existing schema first.
begin;
set local lock_timeout = '10s';
do $preflight$
begin
  if exists (select 1 from pg_tables where schemaname='public' and left(tablename,4)='itz_') then
    raise exception 'ITZ tables already exist. Setup cancelled; inspect existing migrations and Data API exposure before proceeding.';
  end if;
  if (select count(*) from auth.users where lower(email) in ('mulumbakacm@gmail.com','shabehamba@gmail.com')) <> 2 then
    raise exception 'Both configured admin Auth users must exist, with unique emails, before setup.';
  end if;
end
$preflight$;


-- SOURCE: 20261101160933_itz_business_workspace.sql
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


-- SOURCE: 20261103100000_itz_shared_link_workspaces.sql
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
grant execute on function public.itz_create_shared_workspace(text, jsonb) to authenticated;
grant execute on function public.itz_get_shared_workspace(text) to authenticated;
grant execute on function public.itz_save_shared_workspace(text, jsonb, bigint) to authenticated;


-- SOURCE: 20261118031149_itz_client_links.sql
-- Client delivery is separate from workspace JSON. Apply after both existing migrations.
create table public.itz_galleries (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 title text not null check(length(title) between 1 and 200), unique(id,owner_id)
);
create table public.itz_client_links (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 document_id text not null, token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),
 raw_token text not null check(raw_token ~ '^[A-Za-z0-9_-]{43}$'),
 gallery_id uuid, expires_at timestamptz, revoked_at timestamptz,
 view_count bigint not null default 0, last_viewed_at timestamptz,
 unique(owner_id,document_id), unique(id,owner_id),
 foreign key(gallery_id,owner_id) references public.itz_galleries(id,owner_id)
);
create index on public.itz_client_links(gallery_id);
create table public.itz_client_comments (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 link_id uuid not null, name text not null check(length(trim(name)) between 1 and 80),
 message text not null check(length(trim(message)) between 1 and 1000), staff boolean not null default false,
 hidden boolean not null default false, read_at timestamptz, created_at timestamptz not null default now(),
 foreign key(link_id,owner_id) references public.itz_client_links(id,owner_id) on delete cascade
);
create index on public.itz_client_comments(link_id,created_at);
create index on public.itz_client_comments(owner_id);
create table public.itz_gallery_media (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 gallery_id uuid not null, kind text not null check(kind in ('image','video')),
 path text not null unique, poster_path text, caption text not null default '' check(length(caption)<=200),
 width integer not null check(width>0), height integer not null check(height>0),
 bytes bigint not null check(bytes>0 and bytes<=31000000), duration numeric not null default 0,
 position integer not null default 0, ready boolean not null default false,
 check((kind='image' and greatest(width,height)<=1600 and bytes<=15000000 and duration=0) or (kind='video' and duration>0 and duration<=90 and poster_path is not null)),
 check(path ~ ('^' || owner_id::text || '/' || gallery_id::text || '/[0-9a-f-]{36}\.(jpg|webp|mp4|webm|mov)$')),
 check(poster_path is null or poster_path ~ ('^' || owner_id::text || '/' || gallery_id::text || '/[0-9a-f-]{36}\.jpg$')),
 foreign key(gallery_id,owner_id) references public.itz_galleries(id,owner_id) on delete cascade
);
create index on public.itz_gallery_media(gallery_id);
create index on public.itz_gallery_media(owner_id);
create table public.itz_receipts (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 link_id uuid not null, sequence integer not null check(sequence>0), payment_id text not null,
 snapshot jsonb not null, superseded boolean not null default false,
 unique(link_id,sequence), foreign key(link_id,owner_id) references public.itz_client_links(id,owner_id) on delete cascade
);
create index on public.itz_receipts(owner_id);
-- Owner-only policies, explicit grants; receipt writes only via reconciliation RPC.
do $$ declare t text; begin
 foreach t in array array['itz_client_links','itz_client_comments','itz_galleries','itz_gallery_media','itz_receipts'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public, anon, authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy owner_access on public.%I for all to authenticated using ((select public.itz_workspace_owner_id())=owner_id) with check ((select public.itz_workspace_owner_id())=owner_id)',t);
 end loop;
end $$;
grant insert,update,delete on public.itz_galleries,public.itz_gallery_media to authenticated;
grant update(hidden,read_at),delete on public.itz_client_comments to authenticated;

create function public.itz_manage_client_link(p_document text,p_action text,p_hash text default null,p_token text default null,p_expiry timestamptz default null,p_gallery uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare d jsonb; l uuid; begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select x into d from public.itz_workspaces w, lateral jsonb_array_elements(w.data->'documents') x where w.owner_id=public.itz_workspace_owner_id() and x->>'id'=p_document;
 if d is null or d->>'status'='draft' then raise exception 'Issued document required'; end if;
 if p_action in ('create','regenerate') then
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' or p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then raise exception 'Invalid token'; end if;
  if p_action='create' then
   insert into public.itz_client_links(owner_id,document_id,token_hash,raw_token) values(public.itz_workspace_owner_id(),p_document,p_hash,p_token)
   on conflict(owner_id,document_id) do nothing;
  else update public.itz_client_links set token_hash=p_hash,raw_token=p_token,revoked_at=null where owner_id=public.itz_workspace_owner_id() and document_id=p_document;
  end if;
 elsif p_action='revoke' then update public.itz_client_links set revoked_at=now() where owner_id=public.itz_workspace_owner_id() and document_id=p_document;
 elsif p_action='settings' then update public.itz_client_links set expires_at=p_expiry,gallery_id=p_gallery where owner_id=public.itz_workspace_owner_id() and document_id=p_document;
 else raise exception 'Invalid action'; end if;
 select id into l from public.itz_client_links where owner_id=public.itz_workspace_owner_id() and document_id=p_document;
 return l;
end $$;

create function public.itz_sync_receipts(p_link uuid,p_version bigint,p_changes jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare l public.itz_client_links; v bigint; a jsonb; begin
 select version into v from public.itz_workspaces where owner_id=public.itz_workspace_owner_id() for update;
 if v is distinct from p_version then raise exception 'Receipt version conflict'; end if;
 select * into l from public.itz_client_links where id=p_link and owner_id=public.itz_workspace_owner_id() for update;
 if l.id is null then raise exception 'Link unavailable'; end if;
 update public.itz_receipts set superseded=true where link_id=l.id and id::text in (select jsonb_array_elements_text(p_changes->'supersede'));
 for a in select jsonb_array_elements(p_changes->'additions') loop
  insert into public.itz_receipts(owner_id,link_id,sequence,payment_id,snapshot) values(public.itz_workspace_owner_id(),l.id,(a->>'sequence')::integer,a->>'payment_id',a->'snapshot');
 end loop;
end $$;

create function public.itz_get_client_page(p_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare l public.itz_client_links; d jsonb; g jsonb; r jsonb; c jsonb; revised text; begin
 if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then return null; end if;
 select * into l from public.itz_client_links where token_hash=p_hash and revoked_at is null and (expires_at is null or expires_at>now());
 if l.id is null then return null; end if;
 select x into d from public.itz_workspaces w, lateral jsonb_array_elements(w.data->'documents') x where w.owner_id=l.owner_id and x->>'id'=l.document_id and x->>'status' in ('issued','void');
 if d is null then return null; end if;
 revised := d->'auditTrail'->-1->>'changedAt';
 -- Explicit document field allowlist: future workspace fields cannot leak by default.
 select jsonb_object_agg(key,value) into d from jsonb_each(d) where key=any(array['id','number','kind','status','client','company','project','issueDate','dueDate','currency','items','discount','tax','payments','notes','terms','template','font','measurements','measurementPosition','createdAt','updatedAt']);
 update public.itz_client_links set view_count=view_count+1,last_viewed_at=now() where id=l.id and (last_viewed_at is null or last_viewed_at<now()-interval '10 minutes');
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'sequence',sequence,'payment_id',payment_id,'snapshot',snapshot,'superseded',superseded) order by sequence),'[]') into r from public.itz_receipts where link_id=l.id;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',case when staff then 'ITZ Engineering' else name end,'message',message,'staff',staff,'created_at',created_at) order by created_at,id),'[]') into c from public.itz_client_comments where link_id=l.id and not hidden;
 select jsonb_build_object('title',title,'media',(select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'kind',kind,'caption',caption,'width',width,'height',height,'bytes',bytes,'position',position,'poster_path',case when poster_path is not null then 'poster' else null end) order by position,m.id),'[]') from public.itz_gallery_media m where gallery_id=l.gallery_id and ready)) into g from public.itz_galleries where id=l.gallery_id;
 return jsonb_build_object('document',d,'revisedAt',revised,'receipts',r,'comments',c,'gallery',g);
end $$;

create function public.itz_add_client_comment(p_hash text,p_name text,p_message text) returns void
language plpgsql security definer set search_path='' as $$
declare l public.itz_client_links; begin
 if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then raise exception 'Link unavailable'; end if;
 select * into l from public.itz_client_links where token_hash=p_hash and revoked_at is null and (expires_at is null or expires_at>now()) for update;
 if l.id is null or not exists(select 1 from public.itz_workspaces w,lateral jsonb_array_elements(w.data->'documents') d where w.owner_id=l.owner_id and d->>'id'=l.document_id and d->>'status' in ('issued','void')) then raise exception 'Link unavailable'; end if;
 if (select count(*) from public.itz_client_comments where link_id=l.id)>=200 or (select count(*) from public.itz_client_comments where link_id=l.id and not staff and created_at>now()-interval '1 hour')>=10 then raise exception 'Comment limit reached'; end if;
 insert into public.itz_client_comments(owner_id,link_id,name,message) values(l.owner_id,l.id,trim(p_name),trim(p_message));
end $$;
create function public.itz_reply_client(p_link uuid,p_message text) returns void
language plpgsql security definer set search_path='' as $$
declare l public.itz_client_links; begin
 select * into l from public.itz_client_links where id=p_link and owner_id=public.itz_workspace_owner_id() for update;
 if l.id is null then raise exception 'Link unavailable'; end if;
 if (select count(*) from public.itz_client_comments where link_id=l.id)>=200 then raise exception 'Comment limit reached'; end if;
 insert into public.itz_client_comments(owner_id,link_id,name,message,staff,read_at) values(l.owner_id,l.id,'ITZ Engineering',trim(p_message),true,now());
end $$;

-- Reservation rows serialize capacity checks before direct-to-storage uploads.
create function public.itz_media_capacity() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.itz_galleries where id=new.gallery_id for update;
 if (select count(*) from public.itz_gallery_media where gallery_id=new.gallery_id and kind=new.kind and id<>new.id)>=(case when new.kind='image' then 40 else 6 end)
 or (select coalesce(sum(bytes),0) from public.itz_gallery_media where gallery_id=new.gallery_id and id<>new.id)+new.bytes>150000000 then raise exception 'Gallery capacity exceeded'; end if;
 return new;
end $$;
create trigger gallery_capacity before insert or update on public.itz_gallery_media for each row execute function public.itz_media_capacity();
-- A token hash must accompany the anon storage request, not merely a guessed path.
create function public.itz_can_read_media(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.itz_gallery_media m join public.itz_client_links l on l.gallery_id=m.gallery_id join public.itz_workspaces w on w.owner_id=l.owner_id
 where m.ready and (m.path=p_path or m.poster_path=p_path) and l.revoked_at is null and (l.expires_at is null or l.expires_at>now())
 and l.token_hash=(nullif(current_setting('request.headers',true),'')::jsonb->>'x-client-link-hash')
 and exists(select 1 from jsonb_array_elements(w.data->'documents') d where d->>'id'=l.document_id and d->>'status'='issued'));
$$;
create function public.itz_client_media_path(p_hash text,p_id uuid,p_poster boolean) returns text
language sql stable security definer set search_path='' as $$
 select case when p_poster then m.poster_path else m.path end from public.itz_gallery_media m join public.itz_client_links l on l.gallery_id=m.gallery_id
 join public.itz_workspaces w on w.owner_id=l.owner_id
 where m.id=p_id and m.ready and p_hash ~ '^[0-9a-f]{64}$' and l.token_hash=p_hash and l.revoked_at is null and (l.expires_at is null or l.expires_at>now())
 and exists(select 1 from jsonb_array_elements(w.data->'documents') d where d->>'id'=l.document_id and d->>'status'='issued') limit 1;
$$;
revoke all on function public.itz_manage_client_link(text,text,text,text,timestamptz,uuid), public.itz_sync_receipts(uuid,bigint,jsonb),public.itz_reply_client(uuid,text),public.itz_get_client_page(text),public.itz_add_client_comment(text,text,text),public.itz_media_capacity(),public.itz_can_read_media(text),public.itz_client_media_path(text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.itz_manage_client_link(text,text,text,text,timestamptz,uuid),public.itz_sync_receipts(uuid,bigint,jsonb),public.itz_reply_client(uuid,text) to authenticated;
grant execute on function public.itz_get_client_page(text),public.itz_add_client_comment(text,text,text),public.itz_can_read_media(text),public.itz_client_media_path(text,uuid,boolean) to anon;

-- STORAGE SECTION: tested manually on hosted Supabase (PGlite has no Storage service).
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('itz-project-media','itz-project-media',false,30000000,array['image/jpeg','image/webp','video/mp4','video/webm','video/quicktime']);
create policy itz_media_owner_select on storage.objects for select to authenticated using(bucket_id='itz-project-media' and (storage.foldername(name))[1]=(select public.itz_workspace_owner_id())::text);
create policy itz_media_owner_insert on storage.objects for insert to authenticated with check(bucket_id='itz-project-media' and (storage.foldername(name))[1]=(select public.itz_workspace_owner_id())::text and exists(select 1 from public.itz_gallery_media m where m.owner_id=(select public.itz_workspace_owner_id()) and (m.path=name or m.poster_path=name) and not m.ready));
create policy itz_media_owner_delete on storage.objects for delete to authenticated using(bucket_id='itz-project-media' and (storage.foldername(name))[1]=(select public.itz_workspace_owner_id())::text);
create policy itz_media_client_select on storage.objects for select to anon using(bucket_id='itz-project-media' and public.itz_can_read_media(name));


-- SOURCE: 20261118035044_itz_client_isolation.sql
-- Fail closed: legacy links have no proven recipient binding. Retire them.
-- Existing owner-only receipts/comments remain retained. Create a new document/link.
alter table public.itz_client_links add column recipient_id text;
alter table public.itz_client_links add column recipient_snapshot jsonb;
alter table public.itz_client_links add column disabled_at timestamptz;
alter table public.itz_galleries add column recipient_id text;
alter table public.itz_galleries add column recipient_snapshot jsonb;
update public.itz_client_links set disabled_at=now(),revoked_at=coalesce(revoked_at,now());
-- Legacy galleries may contain material for multiple recipients: they cannot be reused.
update public.itz_galleries set recipient_id='legacy-retired:' || id::text;
-- Owners can manage titles, but cannot change a gallery's security binding directly.
revoke insert,update on public.itz_galleries from authenticated;
grant insert(id,owner_id,title),update(title) on public.itz_galleries to authenticated;

create function public.itz_bound_document(p_link public.itz_client_links) returns jsonb
language sql stable security definer set search_path='' as $$
 select d from public.itz_workspaces w,lateral jsonb_array_elements(w.data->'documents') d
 where w.owner_id=p_link.owner_id and d->>'id'=p_link.document_id
 and d->>'status' in ('issued','void') and p_link.disabled_at is null
 and p_link.recipient_id is not null and d->'client'->>'id'=p_link.recipient_id
 and d->'client'=p_link.recipient_snapshot;
$$;
create function public.itz_bind_client_link() returns trigger
language plpgsql security definer set search_path='' as $$
declare d jsonb; recipient text; gallery_recipient text; gallery_snapshot jsonb; begin
 -- Revocation and view statistics do not change the access binding.
 if tg_op='UPDATE' then
  if new.owner_id is distinct from old.owner_id or new.document_id is distinct from old.document_id
   or new.recipient_id is distinct from old.recipient_id or new.recipient_snapshot is distinct from old.recipient_snapshot
   or (old.disabled_at is not null and new.disabled_at is distinct from old.disabled_at)
   then raise exception 'Recipient binding is immutable'; end if;
  if new.token_hash=old.token_hash and new.gallery_id is not distinct from old.gallery_id
   and new.expires_at is not distinct from old.expires_at and not(old.revoked_at is not null and new.revoked_at is null) then return new; end if;
  if old.disabled_at is not null then raise exception 'Recipient link retired; create a new document'; end if;
 end if;
 -- Lock workspace before reading; workspace writes use the same ordering.
 select x into d from public.itz_workspaces w,lateral jsonb_array_elements(w.data->'documents') x
 where w.owner_id=new.owner_id and x->>'id'=new.document_id for update of w;
 recipient := nullif(d->'client'->>'id','');
 if recipient is null or d->>'status' not in ('issued','void') then raise exception 'Issued document with a client required'; end if;
 if tg_op='INSERT' then new.recipient_id:=recipient; new.recipient_snapshot:=d->'client';
 elsif recipient is distinct from old.recipient_id or d->'client' is distinct from old.recipient_snapshot
 then raise exception 'Recipient link retired; create a new document'; end if;
 if new.gallery_id is not null then
  select recipient_id,recipient_snapshot into gallery_recipient,gallery_snapshot from public.itz_galleries where id=new.gallery_id and owner_id=new.owner_id for update;
  if not found then raise exception 'Gallery unavailable'; end if;
  if gallery_recipient is not null and (gallery_recipient<>recipient or gallery_snapshot is distinct from d->'client') then raise exception 'Gallery belongs to another client'; end if;
  update public.itz_galleries set recipient_id=recipient,recipient_snapshot=d->'client' where id=new.gallery_id and recipient_id is null;
 end if;
 return new;
end $$;
create trigger bind_client_link before insert or update on public.itz_client_links for each row execute function public.itz_bind_client_link();
create function public.itz_retire_client_links() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then
  update public.itz_client_links set disabled_at=coalesce(disabled_at,now()),revoked_at=coalesce(revoked_at,now()) where owner_id=old.owner_id;
 else
  update public.itz_client_links l set disabled_at=now(),revoked_at=coalesce(revoked_at,now())
  where owner_id=new.owner_id and disabled_at is null and not exists(
   select 1 from jsonb_array_elements(new.data->'documents') d where d->>'id'=l.document_id
   and d->>'status' in ('issued','void') and d->'client'=l.recipient_snapshot);
 end if;
 return null;
end $$;
create trigger retire_client_links after update or delete on public.itz_workspaces for each row execute function public.itz_retire_client_links();

-- Always acquire workspace before link locks, including owner settings/regeneration.
alter function public.itz_manage_client_link(text,text,text,text,timestamptz,uuid) rename to itz_manage_client_link_internal;
revoke all on function public.itz_manage_client_link_internal(text,text,text,text,timestamptz,uuid) from public,anon,authenticated;
create function public.itz_manage_client_link(p_document text,p_action text,p_hash text default null,p_token text default null,p_expiry timestamptz default null,p_gallery uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 perform 1 from public.itz_workspaces where owner_id=public.itz_workspace_owner_id() for update;
 return public.itz_manage_client_link_internal(p_document,p_action,p_hash,p_token,p_expiry,p_gallery);
end $$;
revoke all on function public.itz_manage_client_link(text,text,text,text,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.itz_manage_client_link(text,text,text,text,timestamptz,uuid) to authenticated;

-- A recursive allowlist, not just removing the top-level auditTrail.
create function public.itz_public_fields(p_data jsonb,p_fields text[]) returns jsonb
language sql immutable set search_path='' as $$
 select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) from jsonb_each(coalesce(p_data,'{}')) where key=any(p_fields);
$$;
create function public.itz_public_company(p_data jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select public.itz_public_fields(p_data,array['name','address','email','phone','tin','paymentDetails','currency','terms','notes']);
$$;
alter function public.itz_get_client_page(text) rename to itz_get_client_page_internal;
alter function public.itz_add_client_comment(text,text,text) rename to itz_add_client_comment_internal;
revoke all on function public.itz_get_client_page_internal(text),public.itz_add_client_comment_internal(text,text,text) from public,anon,authenticated;
create function public.itz_get_client_page(p_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare l public.itz_client_links; result jsonb; d jsonb; r jsonb; begin
 if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then return null; end if;
 -- Hold the saved document stable throughout projection; reassignment cannot race this read.
 perform 1 from public.itz_workspaces where owner_id=(select owner_id from public.itz_client_links where token_hash=p_hash) for share;
 select * into l from public.itz_client_links where token_hash=p_hash and revoked_at is null and (expires_at is null or expires_at>now()) for update;
 if l.id is null or public.itz_bound_document(l) is null then return null; end if;
 result:=public.itz_get_client_page_internal(p_hash);
 if result is null then return null; end if;
 d:=result->'document';
 d:=jsonb_set(d,'{client}',public.itz_public_fields(d->'client',array['id','name','email','phone','address','tin']));
 d:=jsonb_set(d,'{company}',public.itz_public_company(d->'company'));
 d:=jsonb_set(d,'{items}',(select coalesce(jsonb_agg(public.itz_public_fields(x,array['id','description','measurement','quantity','unit','price'])),'[]') from jsonb_array_elements(coalesce(d->'items','[]')) x));
 d:=jsonb_set(d,'{payments}',(select coalesce(jsonb_agg(public.itz_public_fields(x,array['id','amount','date','method','reference'])),'[]') from jsonb_array_elements(coalesce(d->'payments','[]')) x));
 d:=jsonb_set(d,'{measurements}',(select coalesce(jsonb_agg(public.itz_public_fields(x,array['id','title','columns','rows'])),'[]') from jsonb_array_elements(coalesce(d->'measurements','[]')) x));
 select coalesce(jsonb_agg(jsonb_build_object('id',x->'id','sequence',x->'sequence','payment_id',x->'payment_id','superseded',x->'superseded','snapshot',
  public.itz_public_fields(x->'snapshot',array['number','invoiceNumber','currency','font','template','balance']) || jsonb_build_object(
  'client',public.itz_public_fields(x->'snapshot'->'client',array['name']),
  'company',public.itz_public_company(x->'snapshot'->'company'),
  'payment',public.itz_public_fields(x->'snapshot'->'payment',array['id','amount','date','method','reference'])))),'[]') into r from jsonb_array_elements(result->'receipts') x;
 result:=jsonb_set(jsonb_set(result,'{document}',d),'{receipts}',r);
 if l.gallery_id is not null and not exists(select 1 from public.itz_galleries where id=l.gallery_id and recipient_id=l.recipient_id and recipient_snapshot=l.recipient_snapshot) then result:=jsonb_set(result,'{gallery}','null'); end if;
 return result;
end $$;
create function public.itz_add_client_comment(p_hash text,p_name text,p_message text) returns void
language plpgsql security definer set search_path='' as $$
declare l public.itz_client_links; begin
 if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then raise exception 'Link unavailable'; end if;
 perform 1 from public.itz_workspaces where owner_id=(select owner_id from public.itz_client_links where token_hash=p_hash) for share;
 select * into l from public.itz_client_links where token_hash=p_hash and revoked_at is null and (expires_at is null or expires_at>now()) for update;
 if l.id is null or public.itz_bound_document(l) is null then raise exception 'Link unavailable'; end if;
 perform public.itz_add_client_comment_internal(p_hash,p_name,p_message);
end $$;
create or replace function public.itz_can_read_media(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.itz_gallery_media m join public.itz_client_links l on l.gallery_id=m.gallery_id
 join public.itz_galleries g on g.id=m.gallery_id and g.recipient_id=l.recipient_id and g.recipient_snapshot=l.recipient_snapshot
 where m.ready and (m.path=p_path or m.poster_path=p_path) and l.revoked_at is null and (l.expires_at is null or l.expires_at>now())
 and l.token_hash=(nullif(current_setting('request.headers',true),'')::jsonb->>'x-client-link-hash')
 and public.itz_bound_document(l)->>'status'='issued');
$$;
create or replace function public.itz_client_media_path(p_hash text,p_id uuid,p_poster boolean) returns text
language sql stable security definer set search_path='' as $$
 select case when p_poster then m.poster_path else m.path end from public.itz_gallery_media m join public.itz_client_links l on l.gallery_id=m.gallery_id
 join public.itz_galleries g on g.id=m.gallery_id and g.recipient_id=l.recipient_id and g.recipient_snapshot=l.recipient_snapshot
 where m.id=p_id and m.ready and p_hash ~ '^[0-9a-f]{64}$' and l.token_hash=p_hash and l.revoked_at is null and (l.expires_at is null or l.expires_at>now())
 and public.itz_bound_document(l)->>'status'='issued' limit 1;
$$;
revoke all on function public.itz_bound_document(public.itz_client_links),public.itz_bind_client_link(),public.itz_retire_client_links(),public.itz_public_fields(jsonb,text[]),public.itz_public_company(jsonb),public.itz_get_client_page(text),public.itz_add_client_comment(text,text,text) from public,anon,authenticated;
grant execute on function public.itz_get_client_page(text),public.itz_add_client_comment(text,text,text) to anon;

-- Versioned entry points make the application fail closed if this migration is missing.
create function public.itz_get_client_page_v2(p_hash text) returns jsonb
language sql security definer set search_path='' as $$ select public.itz_get_client_page(p_hash); $$;
create function public.itz_add_client_comment_v2(p_hash text,p_name text,p_message text) returns void
language sql security definer set search_path='' as $$ select public.itz_add_client_comment(p_hash,p_name,p_message); $$;
create function public.itz_client_media_path_v2(p_hash text,p_id uuid,p_poster boolean) returns text
language sql stable security definer set search_path='' as $$ select public.itz_client_media_path(p_hash,p_id,p_poster); $$;
revoke all on function public.itz_get_client_page_v2(text),public.itz_add_client_comment_v2(text,text,text),public.itz_client_media_path_v2(text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.itz_get_client_page_v2(text),public.itz_add_client_comment_v2(text,text,text),public.itz_client_media_path_v2(text,uuid,boolean) to anon;


-- SOURCE: 20261118071120_itz_shared_workspace_owner_isolation.sql
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


-- SOURCE: 20261118091714_itz_cloud_only.sql
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


-- Preserve unrelated metadata and assign both authorised profiles to one owner.
do $admins$
declare business_id uuid;
begin
  select id into strict business_id from auth.users where lower(email)='mulumbakacm@gmail.com';
  update auth.users
  set raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)
      || jsonb_build_object('itz_workspace_access','shared_admin','itz_workspace_owner_id',business_id::text),
      updated_at=now()
  where lower(email) in ('mulumbakacm@gmail.com','shabehamba@gmail.com');
end
$admins$;
grant usage on schema public to authenticated;
notify pgrst, 'reload schema';
commit;

-- Both rows must show the same workspace_owner_id and shared_admin access.
select email,
       raw_app_meta_data->>'itz_workspace_access' as workspace_access,
       raw_app_meta_data->>'itz_workspace_owner_id' as workspace_owner_id
from auth.users
where lower(email) in ('mulumbakacm@gmail.com','shabehamba@gmail.com')
order by email;

select tablename, rowsecurity from pg_tables
where schemaname='public' and left(tablename,4)='itz_'
order by tablename;
-- Zero is expected before the first save/import in a new database.
select count(*) as cloud_workspace_count from public.itz_workspaces;
