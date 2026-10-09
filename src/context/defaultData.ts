import type { City, Zone, Tenant, Product, Post, Story, Order, Transaction, Driver } from '../types';

export const DEFAULT_CITIES: City[] = [
  { id: '00000000-0000-0000-0000-000000000001', name: 'Armenia', slug: 'armenia-quindio', countryCode: 'CO', currencyCode: 'COP', isActive: true },
  { id: '00000000-0000-0000-0000-000000000002', name: 'Pereira', slug: 'pereira-risaralda', countryCode: 'CO', currencyCode: 'COP', isActive: true },
  { id: '00000000-0000-0000-0000-000000000003', name: 'Bogotá D.C.', slug: 'bogota-dc', countryCode: 'CO', currencyCode: 'COP', isActive: true },
  { id: '00000000-0000-0000-0000-000000000004', name: 'Medellín', slug: 'medellin-antioquia', countryCode: 'CO', currencyCode: 'COP', isActive: true },
  { id: '00000000-0000-0000-0000-000000000005', name: 'Cali', slug: 'cali-valle', countryCode: 'CO', currencyCode: 'COP', isActive: true },
  { id: '00000000-0000-0000-0000-000000000006', name: 'Barranquilla', slug: 'barranquilla-atlantico', countryCode: 'CO', currencyCode: 'COP', isActive: true },
  { id: '00000000-0000-0000-0000-000000000007', name: 'Cartagena', slug: 'cartagena-bolivar', countryCode: 'CO', currencyCode: 'COP', isActive: true },
  { id: '00000000-0000-0000-0000-000000000008', name: 'Bucaramanga', slug: 'bucaramanga-santander', countryCode: 'CO', currencyCode: 'COP', isActive: true },
  { id: '00000000-0000-0000-0000-000000000009', name: 'Manizales', slug: 'manizales-caldas', countryCode: 'CO', currencyCode: 'COP', isActive: true },
  { id: '00000000-0000-0000-0000-000000000010', name: 'Ibagué', slug: 'ibague-tolima', countryCode: 'CO', currencyCode: 'COP', isActive: true },
  { id: '00000000-0000-0000-0000-000000000011', name: 'Santa Marta', slug: 'santa-marta-magdalena', countryCode: 'CO', currencyCode: 'COP', isActive: true },
  { id: '00000000-0000-0000-0000-000000000012', name: 'Villavicencio', slug: 'villavicencio-meta', countryCode: 'CO', currencyCode: 'COP', isActive: true },
  { id: '00000000-0000-0000-0000-000000000013', name: 'Cúcuta', slug: 'cucuta-norte-santander', countryCode: 'CO', currencyCode: 'COP', isActive: true },
  { id: '00000000-0000-0000-0000-000000000014', name: 'Pasto', slug: 'pasto-narino', countryCode: 'CO', currencyCode: 'COP', isActive: true },
  { id: '00000000-0000-0000-0000-000000000015', name: 'Montería', slug: 'monteria-cordoba', countryCode: 'CO', currencyCode: 'COP', isActive: true },
  { id: '00000000-0000-0000-0000-000000000016', name: 'Neiva', slug: 'neiva-huila', countryCode: 'CO', currencyCode: 'COP', isActive: true }
];

export const DEFAULT_ZONES: Zone[] = [
  // Armenia
  { id: '00000000-0000-0000-0000-000000000011', cityId: '00000000-0000-0000-0000-000000000001', name: 'Centro', slug: 'armenia-centro', isActive: true },
  { id: '00000000-0000-0000-0000-000000000012', cityId: '00000000-0000-0000-0000-000000000001', name: 'Norte', slug: 'armenia-norte', isActive: true },
  { id: '00000000-0000-0000-0000-000000000013', cityId: '00000000-0000-0000-0000-000000000001', name: 'Sur', slug: 'armenia-sur', isActive: true },
  // Pereira
  { id: '00000000-0000-0000-0000-000000000021', cityId: '00000000-0000-0000-0000-000000000002', name: 'Circunvalar', slug: 'pereira-circunvalar', isActive: true },
  { id: '00000000-0000-0000-0000-000000000022', cityId: '00000000-0000-0000-0000-000000000002', name: 'Cerritos', slug: 'pereira-cerritos', isActive: true },
  { id: '00000000-0000-0000-0000-000000000023', cityId: '00000000-0000-0000-0000-000000000002', name: 'Centro', slug: 'pereira-centro', isActive: true },
  // Bogotá D.C.
  { id: '00000000-0000-0000-0000-000000000031', cityId: '00000000-0000-0000-0000-000000000003', name: 'Chapinero / Zona T', slug: 'bogota-chapinero-zona-t', isActive: true },
  { id: '00000000-0000-0000-0000-000000000032', cityId: '00000000-0000-0000-0000-000000000003', name: 'Usaquén / Norte', slug: 'bogota-usaquen-norte', isActive: true },
  { id: '00000000-0000-0000-0000-000000000033', cityId: '00000000-0000-0000-0000-000000000003', name: 'Centro / Teusaquillo', slug: 'bogota-centro-teusaquillo', isActive: true },
  { id: '00000000-0000-0000-0000-000000000034', cityId: '00000000-0000-0000-0000-000000000003', name: 'Occidente / Salitre', slug: 'bogota-occidente-salitre', isActive: true },
  { id: '00000000-0000-0000-0000-000000000035', cityId: '00000000-0000-0000-0000-000000000003', name: 'Sur', slug: 'bogota-sur', isActive: true },
  // Medellín
  { id: '00000000-0000-0000-0000-000000000041', cityId: '00000000-0000-0000-0000-000000000004', name: 'El Poblado', slug: 'medellin-el-poblado', isActive: true },
  { id: '00000000-0000-0000-0000-000000000042', cityId: '00000000-0000-0000-0000-000000000004', name: 'Laureles / Estadio', slug: 'medellin-laureles-estadio', isActive: true },
  { id: '00000000-0000-0000-0000-000000000043', cityId: '00000000-0000-0000-0000-000000000004', name: 'Envigado / Sabaneta', slug: 'medellin-envigado-sabaneta', isActive: true },
  { id: '00000000-0000-0000-0000-000000000044', cityId: '00000000-0000-0000-0000-000000000004', name: 'Centro / Belén', slug: 'medellin-centro-belen', isActive: true },
  // Cali
  { id: '00000000-0000-0000-0000-000000000051', cityId: '00000000-0000-0000-0000-000000000005', name: 'Granada / Norte', slug: 'cali-granada-norte', isActive: true },
  { id: '00000000-0000-0000-0000-000000000052', cityId: '00000000-0000-0000-0000-000000000005', name: 'Ciudad Jardín / Sur', slug: 'cali-ciudad-jardin-sur', isActive: true },
  { id: '00000000-0000-0000-0000-000000000053', cityId: '00000000-0000-0000-0000-000000000005', name: 'El Peñón / San Antonio', slug: 'cali-peñon-san-antonio', isActive: true },
  { id: '00000000-0000-0000-0000-000000000054', cityId: '00000000-0000-0000-0000-000000000005', name: 'Centro / Oriente', slug: 'cali-centro-oriente', isActive: true },
  // Barranquilla
  { id: '00000000-0000-0000-0000-000000000061', cityId: '00000000-0000-0000-0000-000000000006', name: 'Norte / Alto Prado', slug: 'barranquilla-norte-prado', isActive: true },
  { id: '00000000-0000-0000-0000-000000000062', cityId: '00000000-0000-0000-0000-000000000006', name: 'Buenavista / Villa Carolina', slug: 'barranquilla-buenavista', isActive: true },
  { id: '00000000-0000-0000-0000-000000000063', cityId: '00000000-0000-0000-0000-000000000006', name: 'Centro / Sur', slug: 'barranquilla-centro-sur', isActive: true },
  // Cartagena
  { id: '00000000-0000-0000-0000-000000000071', cityId: '00000000-0000-0000-0000-000000000007', name: 'Centro Histórico / Getsemaní', slug: 'cartagena-centro-getsemani', isActive: true },
  { id: '00000000-0000-0000-0000-000000000072', cityId: '00000000-0000-0000-0000-000000000007', name: 'Bocagrande / Castillogrande', slug: 'cartagena-bocagrande', isActive: true },
  { id: '00000000-0000-0000-0000-000000000073', cityId: '00000000-0000-0000-0000-000000000007', name: 'Manga / Zona Norte', slug: 'cartagena-manga-norte', isActive: true },
  // Bucaramanga
  { id: '00000000-0000-0000-0000-000000000081', cityId: '00000000-0000-0000-0000-000000000008', name: 'Cabecera / Sotomayor', slug: 'bucaramanga-cabecera', isActive: true },
  { id: '00000000-0000-0000-0000-000000000082', cityId: '00000000-0000-0000-0000-000000000008', name: 'Cañaveral / Floridablanca', slug: 'bucaramanga-canaveral', isActive: true },
  { id: '00000000-0000-0000-0000-000000000083', cityId: '00000000-0000-0000-0000-000000000008', name: 'Centro / Real de Minas', slug: 'bucaramanga-centro', isActive: true },
  // Manizales
  { id: '00000000-0000-0000-0000-000000000091', cityId: '00000000-0000-0000-0000-000000000009', name: 'El Cable / Milán', slug: 'manizales-el-cable-milan', isActive: true },
  { id: '00000000-0000-0000-0000-000000000092', cityId: '00000000-0000-0000-0000-000000000009', name: 'Palermo / Laureles', slug: 'manizales-palermo', isActive: true },
  { id: '00000000-0000-0000-0000-000000000093', cityId: '00000000-0000-0000-0000-000000000009', name: 'Centro / Chipre', slug: 'manizales-centro-chipre', isActive: true },
  // Ibagué
  { id: '00000000-0000-0000-0000-000000000101', cityId: '00000000-0000-0000-0000-000000000010', name: 'Milla de Oro / El Vergel', slug: 'ibague-milla-de-oro', isActive: true },
  { id: '00000000-0000-0000-0000-000000000102', cityId: '00000000-0000-0000-0000-000000000010', name: 'Centro / Cádiz', slug: 'ibague-centro', isActive: true },
  // Santa Marta
  { id: '00000000-0000-0000-0000-000000000111', cityId: '00000000-0000-0000-0000-000000000011', name: 'Centro Histórico / Parque de los Novios', slug: 'santa-marta-centro-historico', isActive: true },
  { id: '00000000-0000-0000-0000-000000000112', cityId: '00000000-0000-0000-0000-000000000011', name: 'El Rodadero / Pozos Colorados', slug: 'santa-marta-rodadero', isActive: true },
  // Villavicencio
  { id: '00000000-0000-0000-0000-000000000121', cityId: '00000000-0000-0000-0000-000000000012', name: 'El Buque / Trapiche', slug: 'villavicencio-el-buque', isActive: true },
  { id: '00000000-0000-0000-0000-000000000122', cityId: '00000000-0000-0000-0000-000000000012', name: 'Centro / Barzal', slug: 'villavicencio-centro', isActive: true },
  // Cúcuta
  { id: '00000000-0000-0000-0000-000000000131', cityId: '00000000-0000-0000-0000-000000000013', name: 'Caobos / Los Pinos', slug: 'cucuta-caobos-pinos', isActive: true },
  { id: '00000000-0000-0000-0000-000000000132', cityId: '00000000-0000-0000-0000-000000000013', name: 'Centro / Quinta Vélez', slug: 'cucuta-centro', isActive: true },
  // Pasto
  { id: '00000000-0000-0000-0000-000000000141', cityId: '00000000-0000-0000-0000-000000000014', name: 'Av. Los Estudiantes / Norte', slug: 'pasto-avenida-estudiantes', isActive: true },
  { id: '00000000-0000-0000-0000-000000000142', cityId: '00000000-0000-0000-0000-000000000014', name: 'Centro / Las Cuadras', slug: 'pasto-centro', isActive: true },
  // Montería
  { id: '00000000-0000-0000-0000-000000000151', cityId: '00000000-0000-0000-0000-000000000015', name: 'La Castellana / Recreo', slug: 'monteria-castellana-norte', isActive: true },
  { id: '00000000-0000-0000-0000-000000000152', cityId: '00000000-0000-0000-0000-000000000015', name: 'Centro / Alamedas', slug: 'monteria-centro', isActive: true },
  // Neiva
  { id: '00000000-0000-0000-0000-000000000161', cityId: '00000000-0000-0000-0000-000000000016', name: 'Altico / Quirinal', slug: 'neiva-altico-quirinal', isActive: true },
  { id: '00000000-0000-0000-0000-000000000162', cityId: '00000000-0000-0000-0000-000000000016', name: 'Centro / Norte', slug: 'neiva-centro-norte', isActive: true }
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

export const DEFAULT_TENANTS: Tenant[] = [
  {
    id: 't1',
    slug: 'la-trattoria-artesanal',
    name: 'La Trattoria Artesanal',
    category: 'Italiana & Pizzería',
    logoEmoji: '🍕',
    logoUrl: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=300&q=80',
    bannerUrl: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=1200&q=80',
    description: 'Pizzas napolitanas de masa madre horneadas a la leña y pastas frescas artesanales.',
    address: 'Cra. 14 #19N-42, Zona Norte',
    deliveryTime: '25-35 min',
    priceRange: '$$',
    minOrder: 22000,
    deliveryFee: 5000,
    specialties: ['Pizza Napolitana', 'Pasta Fresca', 'Horno de Leña'],
    salesWeekly: 42,
    rating: 4.9,
    distanceKm: 1.4,
    isNew: false,
    commissionRate: 0.03,
    tablesCount: 12,
    isOpen: true,
    acceptsCash: true,
    cityId: '00000000-0000-0000-0000-000000000001',
    zoneId: '00000000-0000-0000-0000-000000000012',
    status: 'active',
    deliveryModes: ['restaurant_delivery', 'pickup', 'table_service']
  }
];

export const DEFAULT_PRODUCTS: Product[] = [
  {
    id: 'p_demo_1',
    tenantId: 't1',
    name: 'Pizza Margherita D.O.P.',
    desc: 'Salsa San Marzano, mozzarella fior di latte fresca, albahaca orgánica y aceite de oliva extra virgen.',
    price: 34000,
    category: 'Platos Principales',
    emoji: '🍕',
    image: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=800&q=80',
    preparationTimeMinutes: 18,
    available: true
  },
  {
    id: 'p_demo_2',
    tenantId: 't1',
    name: 'Tagliatelle al Tartufo & Funghi',
    desc: 'Pasta fresca artesanal salteada con portobellos, crema de trufa negra y parmesano reggiano.',
    price: 42000,
    category: 'Platos Principales',
    emoji: '🍝',
    image: 'https://images.unsplash.com/photo-1555949258-eb67b1ef0ceb?auto=format&fit=crop&w=800&q=80',
    preparationTimeMinutes: 20,
    available: true
  },
  {
    id: 'p_demo_3',
    tenantId: 't1',
    name: 'Tiramisú Clásico de la Nonna',
    desc: 'Bizcochos savoiardi bañados en espresso de origen Quindío y crema de mascarpone.',
    price: 18500,
    category: 'Postres',
    emoji: '🍰',
    image: 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?auto=format&fit=crop&w=800&q=80',
    preparationTimeMinutes: 8,
    available: true
  }
];

export const DEFAULT_POSTS: Post[] = [
  {
    id: 'post_demo_1',
    tenantId: 't1',
    tenantName: 'La Trattoria Artesanal',
    tenantCategory: 'Italiana & Pizzería',
    tenantLogoEmoji: '🍕',
    tenantAddress: 'Cra. 14 #19N-42, Zona Norte',
    productId: 'p_demo_1',
    dishName: 'Pizza Margherita D.O.P.',
    dishEmoji: '🍕',
    desc: 'Masa fermentada 48 horas e ingredientes frescos locales. Pide directo sin recargos ocultos.',
    price: 34000,
    image: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=900&q=80',
    mediaType: 'photo',
    likes: 28,
    isLiked: false,
    commentsCount: 0,
    timeAgo: 'Hace 2 horas',
    comments: [],
    hasValidProduct: true
  }
];

export const DEFAULT_STORIES: Story[] = [];
export const DEFAULT_ORDERS: Order[] = [];
export const DEFAULT_TRANSACTIONS: Transaction[] = [];
export const DEFAULT_DRIVERS: Driver[] = [
  {
    id: 'drv_demo_1',
    tenantId: 't1',
    name: 'Santiago Mejía',
    phone: '3115550199',
    vehicle: 'Moto Yamaha FZ 150',
    status: 'available'
  }
];
