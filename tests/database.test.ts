import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('Postgres migration enforces owner isolation, authentication and conflict checks', async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$; grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated; insert into auth.users values ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');`,
    );
    await db.exec(
      'alter default privileges in schema public grant all on tables to anon, authenticated;',
    );
    await db.exec(
      await readFile(
        new URL(
          '../supabase/migrations/20261101160933_itz_business_workspace.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    await db.exec(
      `set role authenticated; set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';`,
    );
    await assert.rejects(() => db.exec('truncate public.itz_workspaces'), /permission denied/);
    let result = await db.query<{ version: number }>(
      `select public.itz_save_workspace(' {"schemaVersion":1,"marker":"owner-one"}'::jsonb,0) as version`,
    );
    assert.equal(result.rows[0].version, 1);
    result = await db.query<{ version: number }>(
      `select public.itz_save_workspace('{"schemaVersion":1,"marker":"updated"}'::jsonb,1) as version`,
    );
    assert.equal(result.rows[0].version, 2);
    await assert.rejects(
      () => db.query(`select public.itz_save_workspace('{"schemaVersion":1}'::jsonb,1)`),
      /Workspace conflict/,
    );
    await db.exec(`set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000002';`);
    assert.equal((await db.query('select * from public.itz_workspaces')).rows.length, 0);
    assert.equal(
      (
        await db.query(
          `update public.itz_workspaces set data='{"schemaVersion":1}' returning owner_id`,
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      () =>
        db.exec(
          `insert into public.itz_workspaces(owner_id,data) values ('00000000-0000-4000-8000-000000000001','{"schemaVersion":1}')`,
        ),
      /row-level security/,
    );
    await db.query(
      `select public.itz_save_workspace('{"schemaVersion":1,"marker":"owner-two"}'::jsonb,0)`,
    );
    await assert.rejects(
      () =>
        db.exec(`update public.itz_workspaces set owner_id='00000000-0000-4000-8000-000000000001'`),
      /row-level security/,
    );
    await db.exec(`set request.jwt.claim.sub = '';`);
    await assert.rejects(
      () => db.query(`select public.itz_save_workspace('{"schemaVersion":1}'::jsonb,0)`),
      /Authentication required/,
    );
    await db.exec('reset role; set role anon;');
    await assert.rejects(
      () => db.query('select * from public.itz_workspaces'),
      /permission denied/,
    );
    await assert.rejects(
      () => db.query(`select public.itz_save_workspace('{"schemaVersion":1}'::jsonb,0)`),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});

test('shared workspace migration restricts table access and enforces link-version checks', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated;`);
    await db.exec(
      'alter default privileges in schema public grant all on tables to anon, authenticated;',
    );
    await db.exec(
      await readFile(
        new URL(
          '../supabase/migrations/20261103100000_itz_shared_link_workspaces.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    const tokenHash = 'a'.repeat(64);
    const payload = `{"schemaVersion":1,"marker":"shared-data"}`;
    await db.exec('set role anon;');
    await assert.rejects(
      () =>
        db.query(`select public.itz_create_shared_workspace('${tokenHash}', '${payload}'::jsonb)`),
      /permission denied/,
    );
    await db.exec('reset role; set role authenticated;');
    const created = await db.query<{ version: number }>(
      `select public.itz_create_shared_workspace('${tokenHash}', '${payload}'::jsonb) as version`,
    );
    assert.equal(created.rows[0].version, 1);
    const fetched = await db.query<{ data: { marker: string }; version: number }>(
      `select * from public.itz_get_shared_workspace('${tokenHash}')`,
    );
    assert.equal(fetched.rows[0].data.marker, 'shared-data');
    assert.equal(fetched.rows[0].version, 1);
    const saved = await db.query<{ version: number }>(
      `select public.itz_save_shared_workspace('${tokenHash}', '{"schemaVersion":1,"marker":"updated"}'::jsonb, 1) as version`,
    );
    assert.equal(saved.rows[0].version, 2);
    await assert.rejects(
      () =>
        db.query(
          `select public.itz_save_shared_workspace('${tokenHash}', '{"schemaVersion":1}'::jsonb, 1)`,
        ),
      /Workspace conflict/,
    );
    await assert.rejects(
      () => db.query('select * from public.itz_shared_workspaces'),
      /permission denied/,
    );
    await assert.rejects(
      () =>
        db.query(
          `select public.itz_create_shared_workspace('not-a-hash', '{"schemaVersion":1}'::jsonb)`,
        ),
      /Invalid shared workspace data/,
    );
    await assert.rejects(
      () =>
        db.query(
          `select public.itz_create_shared_workspace('${'b'.repeat(64)}', '{"schemaVersion":2}'::jsonb)`,
        ),
      /Invalid shared workspace data/,
    );
  } finally {
    await db.close();
  }
});

test('client links isolate documents, freeze receipts and enforce anonymous limits', async () => {
  const db = new PGlite();
  const one = '00000000-0000-4000-8000-000000000001', two = '00000000-0000-4000-8000-000000000002';
  const hash = 'a'.repeat(64), token = 'a'.repeat(43);
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated; insert into auth.users values ('${one}'),('${two}'); alter default privileges in schema public grant all on tables to anon,authenticated;`);
    for (const file of ['20261101160933_itz_business_workspace.sql','20261103100000_itz_shared_link_workspaces.sql','20261118031149_itz_client_links.sql']) {
      const sql = await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8');
      await db.exec(sql.split('-- STORAGE SECTION:')[0]);
    }
    const workspace = {schemaVersion:1,clients:[{secret:'OTHER CLIENT'}],expenses:[{secret:'EXPENSE'}],documents:[{id:'doc',status:'issued',number:'I-1',client:{name:'Intended client'},auditTrail:[{changedAt:'2026-11-17',previous:{secret:'PREVIOUS'},actor:'PRIVATE ACTOR'}]},{id:'other',status:'issued',number:'PRIVATE DOCUMENT'},{id:'draft',status:'draft'}]};
    await db.exec(`set role authenticated; set request.jwt.claim.sub='${one}';`);
    await db.query('select public.itz_save_workspace($1::jsonb,0)',[JSON.stringify(workspace)]);
    const link = (await db.query<{id:string}>('select public.itz_manage_client_link($1,$2,$3,$4) id',['doc','create',hash,token])).rows[0].id;
    await assert.rejects(()=>db.query('select public.itz_manage_client_link($1,$2,$3,$4)',['absent','create','b'.repeat(64),token]),/Issued document/);
    await assert.rejects(()=>db.query('select public.itz_manage_client_link($1,$2,$3,$4)',['draft','create','b'.repeat(64),token]),/Issued document/);
    await assert.rejects(()=>db.query('insert into public.itz_receipts(owner_id,link_id,sequence,payment_id,snapshot) values ($1,$2,1,$3,$4)',[one,link,'p','{}']),/permission denied/);
    const snapshot={number:'R-I-1-01',payment:{id:'p',amount:123},balance:456};
    await db.query('select public.itz_sync_receipts($1,1,$2)',[link,JSON.stringify({supersede:[],additions:[{sequence:1,payment_id:'p',snapshot}]})]);
    const receipt=(await db.query<{id:string}>('select id from public.itz_receipts')).rows[0].id;
    await db.query('select public.itz_sync_receipts($1,1,$2)',[link,JSON.stringify({supersede:[receipt],additions:[{sequence:2,payment_id:'p',snapshot:{...snapshot,number:'R-I-1-02',payment:{id:'p',amount:100}}}]})]);
    const frozen=(await db.query<{snapshot:unknown;superseded:boolean}>('select snapshot,superseded from public.itz_receipts where id=$1',[receipt])).rows[0];
    assert.deepEqual(frozen.snapshot,snapshot);assert.equal(frozen.superseded,true);
    await assert.rejects(()=>db.query('select public.itz_sync_receipts($1,0,$2)',[link,'{"supersede":[],"additions":[]}']),/version conflict/);
    await db.exec(`set request.jwt.claim.sub='${two}';`);
    for(const table of ['itz_client_links','itz_client_comments','itz_galleries','itz_gallery_media','itz_receipts']) assert.equal((await db.query(`select * from public.${table}`)).rows.length,0);
    await assert.rejects(()=>db.query('select public.itz_reply_client($1,$2)',[link,'Intruder']),/unavailable/);
    await assert.rejects(()=>db.query('select public.itz_manage_client_link($1,$2,$3,$4)',['doc','create','b'.repeat(64),token]),/Issued document/);
    await db.exec('reset role; set role anon;');
    for(const table of ['itz_client_links','itz_client_comments','itz_galleries','itz_gallery_media','itz_receipts']) {
      await assert.rejects(()=>db.query(`select * from public.${table}`),/permission denied/);
      await assert.rejects(()=>db.query(`delete from public.${table}`),/permission denied/);
      await assert.rejects(()=>db.query(`insert into public.${table} default values`),/permission denied/);
      await assert.rejects(()=>db.query(`update public.${table} set owner_id='${two}'`),/permission denied/);
    }
    const page=async(h=hash)=>(await db.query<{page:unknown}>('select public.itz_get_client_page($1) page',[h])).rows[0].page;
    assert.equal(await page('bad'),null);assert.equal(await page('b'.repeat(64)),null);
    const publicData=JSON.stringify(await page());
    for(const secret of ['auditTrail','PRIVATE','PREVIOUS','EXPENSE','OTHER CLIENT',one,'raw_token','token_hash']) assert.equal(publicData.includes(secret),false,secret);
    assert.match(publicData,/Intended client/);assert.match(publicData,/revisedAt/);
    await page();
    await assert.rejects(()=>db.query('select public.itz_add_client_comment($1,$2,$3)',[hash,'','hello']),/check constraint/);
    for(let i=0;i<10;i++)await db.query('select public.itz_add_client_comment($1,$2,$3)',[hash,'Client','Message '+i]);
    await assert.rejects(()=>db.query('select public.itz_add_client_comment($1,$2,$3)',[hash,'Client','Eleventh']),/limit/);
    await db.exec('reset role;');
    assert.equal((await db.query<{view_count:number}>('select view_count from public.itz_client_links')).rows[0].view_count,1);
    await db.query("update public.itz_client_comments set created_at=now()-interval '2 hours'");
    await db.query("insert into public.itz_client_comments(owner_id,link_id,name,message,created_at) select $1,$2,'Older','Message',now()-interval '2 hours' from generate_series(1,190)",[one,link]);
    await db.exec('set role anon;');await assert.rejects(()=>db.query('select public.itz_add_client_comment($1,$2,$3)',[hash,'Client','Over 200']),/limit/);
    await db.exec('reset role;');
    const gallery=(await db.query<{id:string}>('insert into public.itz_galleries(owner_id,title) values ($1,$2) returning id',[one,'Works'])).rows[0].id;
    const path=`${one}/${gallery}/00000000-0000-4000-8000-000000000003.jpg`;
    await db.query('insert into public.itz_gallery_media(owner_id,gallery_id,kind,path,width,height,bytes,ready) values ($1,$2,$3,$4,800,500,1000,true)',[one,gallery,'image',path]);
    await db.query('update public.itz_client_links set gallery_id=$1',[gallery]);
    await db.exec(`set role authenticated; set request.jwt.claim.sub='${two}';`);
    await assert.rejects(()=>db.query('insert into public.itz_gallery_media(owner_id,gallery_id,kind,path,width,height,bytes) values ($1,$2,$3,$4,800,500,1000)',[one,gallery,'image',`${one}/${gallery}/00000000-0000-4000-8000-000000000004.jpg`]),/row-level security/);
    await db.exec(`reset role;`);
    for(let i=0;i<39;i++)await db.query("insert into public.itz_gallery_media(owner_id,gallery_id,kind,path,width,height,bytes) values ($1,$2,'image',$1::uuid::text||'/'||$2::uuid::text||'/'||gen_random_uuid()::text||'.jpg',800,500,1000)",[one,gallery]);
    await assert.rejects(()=>db.query("insert into public.itz_gallery_media(owner_id,gallery_id,kind,path,width,height,bytes) values ($1,$2,'image',$1::uuid::text||'/'||$2::uuid::text||'/'||gen_random_uuid()::text||'.jpg',800,500,1000)",[one,gallery]),/capacity/);
    await assert.rejects(()=>db.query('update public.itz_gallery_media set bytes=15000000 where gallery_id=$1',[gallery]),/capacity/);
    await db.query("select set_config('request.headers',$1,false)",[JSON.stringify({'x-client-link-hash':hash})]);
    await db.exec('set role anon;');
    const allowed=async()=>(await db.query<{ok:boolean}>('select public.itz_can_read_media($1) ok',[path])).rows[0].ok;
    assert.equal(await allowed(),true);
    await db.exec('reset role;');
    await db.query("update public.itz_workspaces set data=jsonb_set(data,'{documents,0,status}','\"void\"')");
    await db.exec('set role anon;'); assert.equal(await allowed(),false); assert.match(JSON.stringify(await page()),/void/);
    await db.exec('reset role;');
    await db.query("update public.itz_workspaces set data=jsonb_set(data,'{documents,0,status}','\"issued\"')");
    await db.exec('set role anon;');
    await db.query("select set_config('request.headers','{}',false)");assert.equal(await allowed(),false);
    await db.query("select set_config('request.headers',$1,false)",[JSON.stringify({'x-client-link-hash':hash})]);
    await db.exec('reset role;');await db.query('update public.itz_client_links set revoked_at=now()');await db.exec('set role anon;');assert.equal(await page(),null);assert.equal(await allowed(),false);
    await db.exec('reset role;');await db.query("update public.itz_client_links set revoked_at=null,expires_at=now()-interval '1 hour'");await db.exec('set role anon;');assert.equal(await page(),null);assert.equal(await allowed(),false);
    await db.exec('reset role;');await db.query("update public.itz_client_links set expires_at=null");await db.query("update public.itz_workspaces set data=jsonb_set(data,'{documents}','[]')");await db.exec('set role anon;');assert.equal(await page(),null);assert.equal(await allowed(),false);
  } finally { await db.close(); }
});
