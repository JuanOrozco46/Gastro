import type { City, Zone, Tenant, Product, Post, Story, Order, Transaction, Driver } from '../types';

export const DEFAULT_CITIES: City[] = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Armenia',
    slug: 'armenia-quindio',
    countryCode: 'CO',
    currencyCode: 'COP',
    isActive: true
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    name: 'Pereira',
    slug: 'pereira-risaralda',
    countryCode: 'CO',
    currencyCode: 'COP',
    isActive: true
  }
];

export const DEFAULT_ZONES: Zone[] = [
  { id: '00000000-0000-0000-0000-000000000011', cityId: '00000000-0000-0000-0000-000000000001', name: 'Centro', slug: 'armenia-centro', isActive: true },
  { id: '00000000-0000-0000-0000-000000000012', cityId: '00000000-0000-0000-0000-000000000001', name: 'Norte', slug: 'armenia-norte', isActive: true },
  { id: '00000000-0000-0000-0000-000000000013', cityId: '00000000-0000-0000-0000-000000000001', name: 'Sur', slug: 'armenia-sur', isActive: true },
  { id: '00000000-0000-0000-0000-000000000021', cityId: '00000000-0000-0000-0000-000000000002', name: 'Circunvalar', slug: 'pereira-circunvalar', isActive: true },
  { id: '00000000-0000-0000-0000-000000000022', cityId: '00000000-0000-0000-0000-000000000002', name: 'Cerritos', slug: 'pereira-cerritos', isActive: true },
  { id: '00000000-0000-0000-0000-000000000023', cityId: '00000000-0000-0000-0000-000000000002', name: 'Centro', slug: 'pereira-centro', isActive: true }
];

export const EMPTY_TENANT: Tenant = {
  id: 'empty_tenant',
  slug: 'sin-restaurante',
  name: 'Sin Restaurante',
  category: 'General',
  logoEmoji: '🏪',
  bannerUrl: '',
  description: 'No hay restaurantes registrados aún.',
  address: 'Dirección del restaurante',
  deliveryTime: '0 min',
  priceRange: '$',
  minOrder: 0,
  specialties: [],
  salesWeekly: 0,
  rating: 5.0,
  distanceKm: 0,
  isNew: false,
  commissionRate: 0,
  tablesCount: 0,
  isOpen: false,
  cityId: '00000000-0000-0000-0000-000000000001',
  zoneId: '00000000-0000-0000-0000-000000000011',
  status: 'draft',
  deliveryModes: []
};

export const DEFAULT_TENANTS: Tenant[] = [];
export const DEFAULT_PRODUCTS: Product[] = [];
export const DEFAULT_POSTS: Post[] = [];
export const DEFAULT_STORIES: Story[] = [];
export const DEFAULT_ORDERS: Order[] = [];
export const DEFAULT_TRANSACTIONS: Transaction[] = [];
export const DEFAULT_DRIVERS: Driver[] = [];
