import type { BusinessUserRole, UserRole } from '../types';

export interface DemoAccount {
  id: string;
  name: string;
  email: string;
  demoPassword: string;
  businessRole: BusinessUserRole;
  userRole: UserRole;
  tenantId?: string;
}

// Doble defensa: aunque el chunk llegara a emitirse en producción, la
// contraseña real no existe en builds de producción (import.meta.env.DEV es
// estáticamente false y el literal se elimina del bundle).
export const COMMON_DEMO_PASSWORD = import.meta.env.DEV ? 'GastroSyncDemo2026!' : '';

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    id: 'demo_customer',
    name: 'Cliente Demo (Colombia)',
    email: 'cliente@demo.gastrosync.co',
    demoPassword: COMMON_DEMO_PASSWORD,
    businessRole: 'customer',
    userRole: 'client_delivery'
  },
  {
    id: 'demo_owner',
    name: 'Dueño La Trattoria',
    email: 'restaurante@demo.gastrosync.co',
    demoPassword: COMMON_DEMO_PASSWORD,
    businessRole: 'restaurant_owner',
    userRole: 'admin',
    tenantId: 't1'
  },
  {
    id: 'demo_kitchen',
    name: 'Jefe de Cocina (Trattoria)',
    email: 'cocina@demo.gastrosync.co',
    demoPassword: COMMON_DEMO_PASSWORD,
    businessRole: 'restaurant_staff',
    userRole: 'kitchen',
    tenantId: 't1'
  },
  {
    id: 'demo_platform_admin',
    name: 'Administrador de GastroSync',
    email: 'admin@demo.gastrosync.co',
    demoPassword: COMMON_DEMO_PASSWORD,
    businessRole: 'platform_admin',
    userRole: 'platform_admin'
  }
];
