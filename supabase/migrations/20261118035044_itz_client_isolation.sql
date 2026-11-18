-- Fail closed: legacy links have no proven recipient binding. Retire them.
-- Existing owner-only receipts/comments remain retained. Create a new document/link.
begin;
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
commit;
