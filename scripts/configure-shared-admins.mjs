import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());

const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERCICE_ROLE_KEY;
const businessEmail = process.env.BUSINESS_ADMIN_EMAIL?.trim().toLowerCase();
const technicalEmail = process.env.TECH_ADMIN_EMAIL?.trim().toLowerCase();

if (!baseUrl || !serviceKey || !businessEmail || !technicalEmail) {
  console.error('Shared-admin setup stopped: required environment configuration is missing.');
  process.exit(1);
}
if (businessEmail === technicalEmail) {
  console.error('Shared-admin setup stopped: administrator emails must be different.');
  process.exit(1);
}

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  'Content-Type': 'application/json',
};
const usersUrl = `${baseUrl}/auth/v1/admin/users`;

async function getUsers() {
  const users = [];
  for (let page = 1; ; page++) {
    const response = await fetch(`${usersUrl}?page=${page}&per_page=100`, { headers });
    if (!response.ok) throw new Error('Could not list Supabase Auth users.');
    const result = await response.json();
    users.push(...(result.users || []));
    if (!result.users || result.users.length < 100) return users;
  }
}

try {
  const users = await getUsers();
  const businessUser = users.find((user) => user.email?.toLowerCase() === businessEmail);
  const technicalUser = users.find((user) => user.email?.toLowerCase() === technicalEmail);
  if (!businessUser || !technicalUser) {
    console.error('Shared-admin setup stopped: both configured Auth users must exist.');
    process.exit(1);
  }

  for (const user of [businessUser, technicalUser]) {
    const response = await fetch(`${usersUrl}/${encodeURIComponent(user.id)}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        app_metadata: {
          ...(user.app_metadata || {}),
          itz_workspace_access: 'shared_admin',
          itz_workspace_owner_id: businessUser.id,
        },
      }),
    });
    if (!response.ok) throw new Error('Could not configure a shared admin account.');
  }

  const verifiedUsers = await getUsers();
  const verified = [businessEmail, technicalEmail].every((email) =>
    verifiedUsers.some(
      (user) =>
        user.email?.toLowerCase() === email &&
        user.app_metadata?.itz_workspace_access === 'shared_admin' &&
        user.app_metadata?.itz_workspace_owner_id === businessUser.id,
    ),
  );
  if (!verified) throw new Error('Shared-admin metadata verification failed.');
  console.log('Shared workspace access configured for both admins. Sign out and sign back in to refresh sessions.');
} catch {
  console.error('Shared-admin setup failed. No credential values were logged.');
  process.exitCode = 1;
}
