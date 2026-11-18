import { createClient } from '@/lib/supabase/server';
import { getAdminConfigurationStatus, getAdminRole } from './roles';

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

  return { ok: true as const, client, user: data.user, role };
}
