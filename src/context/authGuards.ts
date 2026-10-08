import type { UserRole, BusinessUserRole, UserAccount, ProvisionedOwnerAccount } from '../types';

// Internal typed authorization helpers
export const isRestaurantOwner = (user: UserAccount | null): boolean => {
  if (!user) return false;
  return user.businessRole === 'restaurant_owner' || user.role === 'admin';
};

export const isRestaurantStaff = (user: UserAccount | null): boolean => {
  if (!user) return false;
  return user.businessRole === 'restaurant_staff' || user.role === 'kitchen';
};

export const isPlatformAdmin = (user: UserAccount | null): user is UserAccount => {
  if (!user) return false;
  return user.businessRole === 'platform_admin';
};

export const hasOwnershipOfTenant = (user: UserAccount | null, tenantId: string): boolean => {
  if (!isRestaurantOwner(user) || !user?.tenantId) return false;
  return user.tenantId === tenantId;
};

export const validateAndGetProvisionedAccounts = (): ProvisionedOwnerAccount[] => {
  try {
    const saved = localStorage.getItem('gs_provisioned_owner_accounts_v1');
    if (!saved) return [];
    const parsed: unknown = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];

    const valid: ProvisionedOwnerAccount[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const obj = item as Record<string, unknown>;
      if (
        typeof obj.id === 'string' && obj.id.trim() !== '' &&
        typeof obj.name === 'string' && obj.name.trim() !== '' &&
        typeof obj.email === 'string' && obj.email.trim() !== '' &&
        typeof obj.temporaryPassword === 'string' && obj.temporaryPassword.trim() !== '' &&
        typeof obj.tenantId === 'string' && obj.tenantId.trim() !== '' &&
        obj.businessRole === 'restaurant_owner' &&
        obj.userRole === 'admin' &&
        typeof obj.createdAt === 'number'
      ) {
        valid.push({
          id: obj.id,
          name: obj.name.trim(),
          email: obj.email.trim().toLowerCase(),
          tenantId: obj.tenantId.trim(),
          businessRole: 'restaurant_owner',
          userRole: 'admin',
          createdAt: obj.createdAt
        });
      }
    }
    return valid;
  } catch {
    return [];
  }
};

// Validates a cached session from localStorage for Supabase session recovery fallback.
// In production, onAuthStateChange handles session restoration. This is a safety net.
export const validateCachedSession = (): UserAccount | null => {
  try {
    const saved = localStorage.getItem('gs_demo_session_v1');
    if (!saved) return null;

    const parsed: unknown = JSON.parse(saved);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      localStorage.removeItem('gs_demo_session_v1');
      return null;
    }

    const obj = parsed as Record<string, unknown>;

    if (typeof obj.name !== 'string' || obj.name.trim() === '') {
      localStorage.removeItem('gs_demo_session_v1');
      return null;
    }
    if (typeof obj.email !== 'string' || obj.email.trim() === '') {
      localStorage.removeItem('gs_demo_session_v1');
      return null;
    }

    const validUserRoles: UserRole[] = ['login', 'client_delivery', 'kitchen', 'admin', 'table_qr', 'platform_admin'];
    if (typeof obj.role !== 'string' || !validUserRoles.includes(obj.role as UserRole)) {
      localStorage.removeItem('gs_demo_session_v1');
      return null;
    }

    const validBusinessRoles: BusinessUserRole[] = ['customer', 'restaurant_owner', 'restaurant_staff', 'platform_admin'];
    if (obj.businessRole !== undefined && (typeof obj.businessRole !== 'string' || !validBusinessRoles.includes(obj.businessRole as BusinessUserRole))) {
      localStorage.removeItem('gs_demo_session_v1');
      return null;
    }

    if (obj.tenantId !== undefined && typeof obj.tenantId !== 'string') {
      localStorage.removeItem('gs_demo_session_v1');
      return null;
    }

    return {
      id: typeof obj.id === 'string' ? obj.id : undefined,
      name: obj.name.trim(),
      email: obj.email.trim().toLowerCase(),
      username: typeof obj.username === 'string' && obj.username.trim() ? obj.username.trim() : undefined,
      avatarUrl: typeof obj.avatarUrl === 'string' && obj.avatarUrl.trim() ? obj.avatarUrl.trim() : undefined,
      phone: typeof obj.phone === 'string' && obj.phone.trim() ? obj.phone.trim() : undefined,
      defaultAddress: typeof obj.defaultAddress === 'string' && obj.defaultAddress.trim() ? obj.defaultAddress.trim() : undefined,
      defaultDeliveryNotes: typeof obj.defaultDeliveryNotes === 'string' && obj.defaultDeliveryNotes.trim() ? obj.defaultDeliveryNotes.trim() : undefined,
      role: obj.role as UserRole,
      businessRole: obj.businessRole as BusinessUserRole | undefined,
      tenantId: obj.tenantId as string | undefined
    };
  } catch {
    localStorage.removeItem('gs_demo_session_v1');
    return null;
  }
};

