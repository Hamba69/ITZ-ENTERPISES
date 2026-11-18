import { createClient } from '@/lib/supabase/server';
import { getAdminConfigurationStatus, getAdminRole } from './roles';

function getWorkspaceOwnerId(user: { id: string; app_metadata?: Record<string, unknown> }) {
  const ownerId = user.app_metadata?.itz_workspace_owner_id;
  return user.app_metadata?.itz_workspace_access === 'shared_admin' &&
    typeof ownerId === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ownerId)
    ? ownerId
    : user.id;
}

export async function authorizeAdmin() {
  const configurationStatus = getAdminConfigurationStatus();
  if (configurationStatus !== 'ready') {
    return {
      ok: false as const,
      status: 503,
      message:
        configurationStatus === 'duplicate'
          ? 'Business and technical admin emails must be different.'
          : 'Admin email configuration is missing.',
    };
  }

  const client = await createClient();
  const { data, error } = await client.auth.getUser();
  if (!data.user) {
    return { ok: false as const, status: 401, message: 'Sign in to access ITZ Studio.' };
  }
  if (error) {
    return { ok: false as const, status: 503, message: 'Could not verify the sign-in session.' };
  }

  const role = getAdminRole(data.user.email);
  if (!role) {
    return { ok: false as const, status: 403, message: 'This account is not authorized.' };
  }

  return {
    ok: true as const,
    client,
    user: data.user,
    role,
    workspaceOwnerId: getWorkspaceOwnerId(data.user),
  };
}
