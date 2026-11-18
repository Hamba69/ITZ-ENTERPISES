export type AdminRole = 'business_admin' | 'technical_admin';

type AdminConfiguration =
  | {
      status: 'ready';
      businessEmail: string;
      technicalEmail: string;
    }
  | { status: 'missing' | 'duplicate' };

function getAdminConfiguration(): AdminConfiguration {
  const businessEmail = process.env.BUSINESS_ADMIN_EMAIL?.trim().toLowerCase();
  const technicalEmail = process.env.TECH_ADMIN_EMAIL?.trim().toLowerCase();
  if (!businessEmail || !technicalEmail) return { status: 'missing' };
  if (businessEmail === technicalEmail) return { status: 'duplicate' };
  return { status: 'ready', businessEmail, technicalEmail };
}

export function getAdminRole(email: string | undefined): AdminRole | null {
  const configuration = getAdminConfiguration();
  if (configuration.status !== 'ready' || !email) return null;

  const normalizedEmail = email.trim().toLowerCase();
  if (normalizedEmail === configuration.businessEmail) return 'business_admin';
  if (normalizedEmail === configuration.technicalEmail) return 'technical_admin';
  return null;
}

export function getAdminConfigurationStatus() {
  return getAdminConfiguration().status;
}

export function getAdminDisplayName(role: AdminRole) {
  const key = role === 'business_admin' ? 'BUSINESS_ADMIN_NAME' : 'TECH_ADMIN_NAME';
  const fallback = role === 'business_admin' ? 'Business administrator' : 'Technical administrator';
  return process.env[key]?.trim() || fallback;
}
