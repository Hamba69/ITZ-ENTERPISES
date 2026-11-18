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
  execute format('create policy owner_access on public.%I for all to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id)',t);
 end loop;
end $$;
grant insert,update,delete on public.itz_galleries,public.itz_gallery_media to authenticated;
grant update(hidden,read_at),delete on public.itz_client_comments to authenticated;

create function public.itz_manage_client_link(p_document text,p_action text,p_hash text default null,p_token text default null,p_expiry timestamptz default null,p_gallery uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare d jsonb; l uuid; begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select x into d from public.itz_workspaces w, lateral jsonb_array_elements(w.data->'documents') x where w.owner_id=auth.uid() and x->>'id'=p_document;
 if d is null or d->>'status'='draft' then raise exception 'Issued document required'; end if;
 if p_action in ('create','regenerate') then
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' or p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then raise exception 'Invalid token'; end if;
  if p_action='create' then
   insert into public.itz_client_links(owner_id,document_id,token_hash,raw_token) values(auth.uid(),p_document,p_hash,p_token)
   on conflict(owner_id,document_id) do nothing;
  else update public.itz_client_links set token_hash=p_hash,raw_token=p_token,revoked_at=null where owner_id=auth.uid() and document_id=p_document;
  end if;
 elsif p_action='revoke' then update public.itz_client_links set revoked_at=now() where owner_id=auth.uid() and document_id=p_document;
 elsif p_action='settings' then update public.itz_client_links set expires_at=p_expiry,gallery_id=p_gallery where owner_id=auth.uid() and document_id=p_document;
 else raise exception 'Invalid action'; end if;
 select id into l from public.itz_client_links where owner_id=auth.uid() and document_id=p_document;
 return l;
end $$;

create function public.itz_sync_receipts(p_link uuid,p_version bigint,p_changes jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare l public.itz_client_links; v bigint; a jsonb; begin
 select version into v from public.itz_workspaces where owner_id=auth.uid() for update;
 if v is distinct from p_version then raise exception 'Receipt version conflict'; end if;
 select * into l from public.itz_client_links where id=p_link and owner_id=auth.uid() for update;
 if l.id is null then raise exception 'Link unavailable'; end if;
 update public.itz_receipts set superseded=true where link_id=l.id and id::text in (select jsonb_array_elements_text(p_changes->'supersede'));
 for a in select jsonb_array_elements(p_changes->'additions') loop
  insert into public.itz_receipts(owner_id,link_id,sequence,payment_id,snapshot) values(auth.uid(),l.id,(a->>'sequence')::integer,a->>'payment_id',a->'snapshot');
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
 select * into l from public.itz_client_links where id=p_link and owner_id=auth.uid() for update;
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
create policy itz_media_owner_select on storage.objects for select to authenticated using(bucket_id='itz-project-media' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy itz_media_owner_insert on storage.objects for insert to authenticated with check(bucket_id='itz-project-media' and (storage.foldername(name))[1]=(select auth.uid())::text and exists(select 1 from public.itz_gallery_media m where m.owner_id=(select auth.uid()) and (m.path=name or m.poster_path=name) and not m.ready));
create policy itz_media_owner_delete on storage.objects for delete to authenticated using(bucket_id='itz-project-media' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy itz_media_client_select on storage.objects for select to anon using(bucket_id='itz-project-media' and public.itz_can_read_media(name));
