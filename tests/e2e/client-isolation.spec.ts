import { test, expect } from '@playwright/test';

test('a public bearer link is not an owner session', async ({ request }) => {
  const headers = { authorization: `Bearer ${'a'.repeat(43)}`, origin: 'http://localhost:3000' };
  for (const url of ['/api/client-links', '/api/workspace']) {
    expect((await request.get(url, { headers })).status()).toBe(401);
  }
  expect((await request.get('/api/shared-workspace', { headers })).status()).toBe(410);
  expect((await request.post('/api/client-links', { headers, data: { action: 'create', document: 'another-client-document' } })).status()).toBe(401);
  expect((await request.post('/api/client-galleries', { headers, data: { action: 'create', title: 'Unauthorized' } })).status()).toBe(401);
  expect((await request.get(`/api/client-media/not-a-token/00000000-0000-4000-8000-000000000001`)).status()).toBe(404);
});
