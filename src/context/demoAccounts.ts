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

export const COMMON_DEMO_PASSWORD = 'GastroSyncDemo2026!';

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    id: 'demo_customer',
    name: 'Cliente Demo (Armenia)',
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
