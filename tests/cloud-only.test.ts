import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('cloud-only policy shares one workspace, rejects personal fallback and retires copies', async () => {
  const db = new PGlite();
  const owner = '00000000-0000-4000-8000-000000000001';
  const colleague = '00000000-0000-4000-8000-000000000002';
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      insert into auth.users values ('${owner}'), ('${colleague}');
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
      grant usage on schema auth to authenticated;
      grant execute on function auth.uid(), auth.jwt() to authenticated;`);
    for (const name of [
      '20261101160933_itz_business_workspace.sql',
      '20261103100000_itz_shared_link_workspaces.sql',
      '20261118071120_itz_shared_workspace_owner_isolation.sql',
      '20261118091714_itz_cloud_only.sql',
    ])
      await db.exec(
        await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'),
      );
    await db.exec(`set role authenticated; set request.jwt.claim.sub='${owner}'`);
    assert.equal(
      (await db.query<{ id: string | null }>('select public.itz_workspace_owner_id() id')).rows[0]
        .id,
      null,
    );
    await assert.rejects(() =>
      db.query(`select public.itz_save_workspace('{"schemaVersion":1}',0)`),
    );
    const claims = JSON.stringify({
      app_metadata: { itz_workspace_access: 'shared_admin', itz_workspace_owner_id: owner },
    });
    await db.query("select set_config('request.jwt.claims',$1,false)", [claims]);
    await db.query(`select public.itz_save_workspace('{"schemaVersion":1,"marker":"shared"}',0)`);
    await db.exec(`set request.jwt.claim.sub='${colleague}'`);
    assert.equal(
      (await db.query<{ owner_id: string }>('select owner_id from public.itz_workspaces')).rows[0]
        .owner_id,
      owner,
    );
    await db.query(
      `select public.itz_save_workspace('{"schemaVersion":1,"marker":"colleague"}',1)`,
    );
    await assert.rejects(
      () => db.query(`select public.itz_save_workspace('{"schemaVersion":1}',1)`),
      /Workspace conflict/,
    );
    await assert.rejects(
      () =>
        db.query(`select public.itz_create_shared_workspace($1,'{"schemaVersion":1}')`, [
          'a'.repeat(64),
        ]),
      /permission denied/,
    );
    await assert.rejects(
      () => db.query(`select public.itz_get_shared_workspace($1)`, ['a'.repeat(64)]),
      /permission denied/,
    );
    await db.query("select set_config('request.jwt.claims',$1,false)", [
      JSON.stringify({
        user_metadata: { itz_workspace_access: 'shared_admin', itz_workspace_owner_id: owner },
      }),
    ]);
    assert.equal((await db.query('select * from public.itz_workspaces')).rows.length, 0);
    await db.exec('reset role; set role anon');
    await assert.rejects(
      () => db.query('select * from public.itz_workspaces'),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
