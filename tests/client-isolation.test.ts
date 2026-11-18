import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { demoWorkspace } from '../src/lib/business';
import { receiptChanges } from '../src/lib/client-links';

test('a client token cannot cross recipient, document, comment, receipt or gallery boundaries', async () => {
  const db = new PGlite();
  const owner = '00000000-0000-4000-8000-000000000001';
  const hashA = 'a'.repeat(64),
    hashB = 'b'.repeat(64),
    hashC = 'c'.repeat(64);
  const w = demoWorkspace();
  const a = w.documents[0],
    b = w.documents[1],
    c = { ...a, id: 'same-client-second-document', number: 'I-SAME-CLIENT', payments: [] };
  a.client.name = 'ALICE_ONLY';
  b.client.name = 'BOB_ONLY';
  const reusedClientId = { ...a, id: 'changed-client-details', number: 'I-CHANGED-CLIENT', client: { ...a.client, name: 'DIFFERENT_PERSON' }, payments: [] };
  w.documents = [a, b, c, reusedClientId];
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated; grant execute on function auth.jwt() to authenticated;
      insert into auth.users values('${owner}');
      alter default privileges in schema public grant all on tables to anon,authenticated;`);
    for (const file of [
      '20261101160933_itz_business_workspace.sql',
      '20261103100000_itz_shared_link_workspaces.sql',
      '20261118031149_itz_client_links.sql',
      '20261118035044_itz_client_isolation.sql',
    ]) {
      await db.exec(
        (await readFile(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8')).split(
          '-- STORAGE SECTION:',
        )[0],
      );
    }
    const asOwner = () =>
      db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${owner}';`);
    const asAnon = () => db.exec('reset role; set role anon;');
    await asOwner();
    await db.query('select public.itz_save_workspace($1,0)', [JSON.stringify(w)]);
    async function create(id: string, hash: string) {
      return (
        await db.query<{ id: string }>('select public.itz_manage_client_link($1,$2,$3,$4) id', [
          id,
          'create',
          hash,
          hash.slice(0, 43),
        ])
      ).rows[0].id;
    }
    const linkA = await create(a.id, hashA),
      linkB = await create(b.id, hashB);
    await create(c.id, hashC);
    for (const [link, doc] of [
      [linkA, a],
      [linkB, b],
    ] as const) {
      const changes = receiptChanges(doc, []);
      // Unknown nested fields must never pass through the public RPC.
      Object.assign(changes.additions[0].snapshot, { privateNote: 'SNAPSHOT_SECRET' });
      Object.assign(changes.additions[0].snapshot.company, { internal: 'COMPANY_SECRET' });
      await db.query('select public.itz_sync_receipts($1,1,$2)', [link, JSON.stringify(changes)]);
      await db.query('select public.itz_reply_client($1,$2)', [
        link,
        doc.client.name + '_STAFF_COMMENT',
      ]);
    }
    const gallery = (
      await db.query<{ id: string }>(
        'insert into public.itz_galleries(owner_id,title) values($1,$2) returning id',
        [owner, 'ALICE_GALLERY'],
      )
    ).rows[0].id;
    const settings = (doc: string) =>
      db.query('select public.itz_manage_client_link($1,$2,null,null,null,$3)', [
        doc,
        'settings',
        gallery,
      ]);
    await settings(a.id);
    await settings(c.id);
    await assert.rejects(() => settings(b.id), /another client/);
    await create(reusedClientId.id, 'e'.repeat(64));
    await assert.rejects(() => settings(reusedClientId.id), /another client/);
    await assert.rejects(
      () =>
        db.query('update public.itz_galleries set recipient_id=$1 where id=$2', [
          b.client.id,
          gallery,
        ]),
      /permission denied/,
    );
    const path = `${owner}/${gallery}/00000000-0000-4000-8000-000000000003.jpg`;
    const media = (
      await db.query<{ id: string }>(
        "insert into public.itz_gallery_media(owner_id,gallery_id,kind,path,width,height,bytes,ready) values($1,$2,'image',$3,800,500,1000,true) returning id",
        [owner, gallery, path],
      )
    ).rows[0].id;
    await db.exec('reset role;');
    // Simulate extra fields stored through another authenticated database client.
    await db.query(
      "update public.itz_workspaces set data=jsonb_set(data,'{documents,0,company,internal}', '\"NESTED_SECRET\"')",
    );
    await asAnon();
    const page = async (hash: string) =>
      (await db.query<{ value: any }>('select public.itz_get_client_page_v2($1) value', [hash]))
        .rows[0].value;
    const alice = await page(hashA),
      bob = await page(hashB);
    assert.match(JSON.stringify(alice), /ALICE_ONLY/);
    assert.doesNotMatch(JSON.stringify(alice), /BOB_ONLY|SECRET|auditTrail|owner_id|raw_token/);
    assert.doesNotMatch(JSON.stringify(bob), /ALICE_ONLY|ALICE_GALLERY|SECRET/);
    assert.equal(alice.receipts.length, 1);
    assert.equal(bob.receipts.length, 1);
    assert.equal(bob.gallery, null);
    await db.query('select public.itz_add_client_comment_v2($1,$2,$3)', [
      hashA,
      'Alice',
      'ALICE_PRIVATE_COMMENT',
    ]);
    assert.doesNotMatch(JSON.stringify(await page(hashB)), /ALICE_PRIVATE_COMMENT/);
    const mediaPath = async (hash: string) =>
      (
        await db.query<{ path: string | null }>(
          'select public.itz_client_media_path_v2($1,$2,false) path',
          [hash, media],
        )
      ).rows[0].path;
    assert.equal(await mediaPath(hashB), null);
    assert.equal(await mediaPath(hashA), path);
    await db.query("select set_config('request.headers',$1,false)", [
      JSON.stringify({ 'x-client-link-hash': hashB }),
    ]);
    assert.equal(
      (await db.query<{ ok: boolean }>('select public.itz_can_read_media($1) ok', [path])).rows[0]
        .ok,
      false,
    );
    for (const sql of [
      "select public.itz_get_client_page_internal('" + hashB + "')",
      "select public.itz_add_client_comment_internal('" + hashB + "','Alice','Attack')",
      "select public.itz_public_company('{}')",
    ])
      await assert.rejects(() => db.query(sql), /permission denied/);
    await asOwner();
    // Ordinary line-item revisions remain live.
    const revised = structuredClone(w);
    revised.documents[0].notes = 'LIVE_REVISION';
    await db.query('select public.itz_save_workspace($1,1)', [JSON.stringify(revised)]);
    await asAnon();
    assert.match(JSON.stringify(await page(hashA)), /LIVE_REVISION/);
    await asOwner();
    // Reassigning even the same document ID must permanently kill its old token.
    const reassigned = structuredClone(revised);
    reassigned.documents[0].client = { ...b.client };
    await db.query('select public.itz_save_workspace($1,2)', [JSON.stringify(reassigned)]);
    await asAnon();
    assert.equal(await page(hashA), null);
    assert.equal(await mediaPath(hashA), null);
    await assert.rejects(
      () => db.query('select public.itz_add_client_comment_v2($1,$2,$3)', [hashA, 'Alice', 'Attack']),
      /unavailable/,
    );
    await asOwner();
    await assert.rejects(
      () =>
        db.query('select public.itz_manage_client_link($1,$2,$3,$4)', [
          a.id,
          'regenerate',
          'd'.repeat(64),
          'd'.repeat(43),
        ]),
      /retired/,
    );
    await db.query('select public.itz_save_workspace($1,3)', [JSON.stringify(revised)]);
    await asAnon();
    assert.equal(await page(hashA), null);
    await asOwner();
    const removed = { ...revised, documents: revised.documents.filter((d) => d.id !== b.id) };
    await db.query('select public.itz_save_workspace($1,4)', [JSON.stringify(removed)]);
    await db.query('select public.itz_save_workspace($1,5)', [JSON.stringify(revised)]);
    await asAnon();
    assert.equal(await page(hashB), null);
    // Other unaffected documents for the same client still work.
    assert.equal((await page(hashC)).document.id, c.id);
  } finally {
    await db.close();
  }
});

test('installing isolation retires legacy links and preserves private records', async () => {
  const db = new PGlite();
  const owner = '00000000-0000-4000-8000-000000000001';
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated; grant execute on function auth.jwt() to authenticated; insert into auth.users values('${owner}');`);
    for (const file of ['20261101160933_itz_business_workspace.sql','20261118031149_itz_client_links.sql']) await db.exec((await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8')).split('-- STORAGE SECTION:')[0]);
    const w=demoWorkspace(), doc=w.documents[0], hash='a'.repeat(64);
    await db.exec(`set role authenticated; set request.jwt.claim.sub='${owner}';`);
    await db.query('select public.itz_save_workspace($1,0)',[JSON.stringify(w)]);
    const link=(await db.query<{id:string}>('select public.itz_manage_client_link($1,$2,$3,$4) id',[doc.id,'create',hash,'a'.repeat(43)])).rows[0].id;
    await db.query('select public.itz_reply_client($1,$2)',[link,'Legacy private thread']);
    await db.exec('reset role;');
    await db.exec(await readFile(new URL('../supabase/migrations/20261118035044_itz_client_isolation.sql',import.meta.url),'utf8'));
    await db.exec('set role anon;');
    assert.equal((await db.query<{value:unknown}>('select public.itz_get_client_page_v2($1) value',[hash])).rows[0].value,null);
    await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${owner}';`);
    assert.equal((await db.query('select * from public.itz_client_comments')).rows.length,1);
    await assert.rejects(()=>db.query('select public.itz_manage_client_link($1,$2,$3,$4)',[doc.id,'regenerate','b'.repeat(64),'b'.repeat(43)]),/retired/);
  } finally { await db.close(); }
});
