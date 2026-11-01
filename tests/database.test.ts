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
