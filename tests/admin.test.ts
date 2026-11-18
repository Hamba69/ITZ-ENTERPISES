import test from 'node:test';
import assert from 'node:assert/strict';
import { getAdminRole } from '../src/lib/auth/roles';

const originalBusinessEmail = process.env.BUSINESS_ADMIN_EMAIL;
const originalTechnicalEmail = process.env.TECH_ADMIN_EMAIL;

test.after(() => {
  if (originalBusinessEmail === undefined) delete process.env.BUSINESS_ADMIN_EMAIL;
  else process.env.BUSINESS_ADMIN_EMAIL = originalBusinessEmail;
  if (originalTechnicalEmail === undefined) delete process.env.TECH_ADMIN_EMAIL;
  else process.env.TECH_ADMIN_EMAIL = originalTechnicalEmail;
});

test('admin allowlist matches normalized emails and assigns distinct roles', () => {
  process.env.BUSINESS_ADMIN_EMAIL = 'business@example.com';
  process.env.TECH_ADMIN_EMAIL = 'tech@example.com';
  assert.equal(getAdminRole(' BUSINESS@example.com '), 'business_admin');
  assert.equal(getAdminRole('Tech@Example.Com'), 'technical_admin');
  assert.equal(getAdminRole('other@example.com'), null);
});

test('admin allowlist fails closed when configuration is missing or duplicated', () => {
  process.env.BUSINESS_ADMIN_EMAIL = 'business@example.com';
  delete process.env.TECH_ADMIN_EMAIL;
  assert.equal(getAdminRole('business@example.com'), null);

  process.env.TECH_ADMIN_EMAIL = 'business@example.com';
  assert.equal(getAdminRole('business@example.com'), null);
});
