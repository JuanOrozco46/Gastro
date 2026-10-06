import type { Tenant, Product, Post, Order, OrderItem, OrderFulfillment, OrderStatus, RestaurantDeliveryMode } from '../types';

export interface DbProfile {
  id: string;
  full_name: string;
  platform_role: 'customer' | 'platform_admin';
  created_at: string;
  updated_at: string;
}

export interface DbCity {
  id: string;
  slug: string;
  name: string;
  country_code: string;
  currency_code: string;
  is_active: boolean;
  created_at: string;
}

export interface DbZone {
  id: string;
  city_id: string;
  name: string;
  slug: string;
  is_active: boolean;
  created_at: string;
}

export interface DbRestaurant {
  id: string;
  owner_user_id: string | null;
  city_id: string;
  zone_id: string;
  slug: string;
  name: string;
  category: string;
  description: string | null;
  address: string;
  phone: string | null;
  whatsapp: string | null;
  status: 'draft' | 'pending_approval' | 'active' | 'suspended';
  is_open: boolean;
  delivery_modes: string[];
  min_order: number;
  delivery_fee: number | null;
  delivery_radius_km: number | null;
  commission_rate: number;
  created_at: string;
  updated_at: string;
  logo_url?: string;
  logo_emoji?: string;
  banner_url?: string;
  estimated_delivery_minutes?: number;
  specialties?: string[];
  accepting_orders?: boolean;
  restaurant_hours?: {
    id: string;
    day_of_week: number;
    is_closed: boolean;
    open_time: string;
    close_time: string;
    interval_index: number;
  }[];
}

export interface DbRestaurantMember {
  restaurant_id: string;
  user_id: string;
  role: 'owner' | 'staff';
  created_at: string;
}

export interface DbRestaurantTable {
  id: string;
  restaurant_id: string;
  table_number: string;
  display_name: string | null;
  capacity: number | null;
  is_active: boolean;
  public_token: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface DbProduct {
  id: string;
  restaurant_id: string;
  name: string;
  description: string | null;
  category: string;
  price_cop: number;
  available: boolean;
  image_url: string | null;
  is_archived?: boolean;
  sort_order?: number;
  tags?: string[];
  preparation_time_minutes?: number;
  ingredients?: string[];
  allergens?: string[];
  created_at: string;
  updated_at: string;
}

export interface DbPost {
  id: string;
  restaurant_id: string;
  product_id: string | null;
  title: string;
  description: string | null;
  media_url: string | null;
  media_type: 'photo' | 'video';
  price_cop: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
  media_width?: number | null;
  media_height?: number | null;
  aspect_ratio?: number | null;
}

export interface DbRestaurantApplication {
  id: string;
  owner_name: string;
  owner_email: string;
  owner_phone: string;
  restaurant_name: string;
  category: string;
  city_id: string;
  zone_id: string;
  address: string;
  description?: string | null;
  whatsapp: string | null;
  min_order: number | null;
  delivery_fee: number | null;
  delivery_radius_km: number | null;
  delivery_modes: string[];
  estimated_delivery_minutes?: number | null;
  schedule_hours?: string | null;
  logo_url?: string | null;
  banner_url?: string | null;
  logo_path?: string | null;
  banner_path?: string | null;
  commission_rate_accepted?: number | null;
  terms_accepted_at?: string | null;
  terms_version?: string | null;
  notes: string | null;
  status: 'submitted' | 'reviewing' | 'approved' | 'rejected';
  review_note: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  activated_at: string | null;
  activated_restaurant_id: string | null;
  activated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbOrder {
  id: string;
  restaurant_id: string;
  customer_id: string | null;
  fulfillment: string;
  status: string;
  customer_name: string;
  customer_phone: string;
  delivery_address: unknown;
  table_number: string | null;
  restaurant_notes: string | null;
  cancellation_reason: string | null;
  subtotal_cop: number;
  delivery_fee_cop: number;
  total_cop: number;
  created_at: string;
  updated_at: string;
  order_items?: DbOrderItem[];
  payments?: Pick<DbPayment, 'id' | 'status' | 'provider'>[];
}

export interface DbOrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  unit_price_cop: number;
  quantity: number;
}

export interface DbPayment {
  id: string;
  order_id: string;
  provider: string;
  provider_reference: string | null;
  amount_cop: number;
  platform_fee_cop: number;
  restaurant_payout_cop: number;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export function mapDbRestaurantToTenant(db: DbRestaurant): Tenant {
  return {
    id: db.id,
    slug: db.slug,
    name: db.name,
    category: db.category,
    logoUrl: db.logo_url || undefined,
    logoEmoji: db.logo_emoji || '🍽️',
    bannerUrl: db.banner_url || undefined,
    description: db.description || '',
    address: db.address,
    phone: db.phone || undefined,
    whatsapp: db.whatsapp || undefined,
    cityId: db.city_id,
    zoneId: db.zone_id,
    status: db.status,
    isOpen: db.is_open,
    acceptingOrders: db.accepting_orders,
    estimatedDeliveryMinutes: db.estimated_delivery_minutes,
    specialties: db.specialties || [],
    deliveryModes: db.delivery_modes as RestaurantDeliveryMode[],
    minOrder: db.min_order,
    deliveryFee: db.delivery_fee || 0,
    deliveryRadiusKm: db.delivery_radius_km || 0,
    commissionRate: db.commission_rate,
    salesWeekly: 0,
    rating: 0,
    distanceKm: 0,
    isNew: false,
    tablesCount: 0,
    ownerUserId: db.owner_user_id || undefined,
    hours: db.restaurant_hours ? db.restaurant_hours.map(h => ({
      id: h.id,
      restaurantId: db.id,
      dayOfWeek: h.day_of_week,
      isOpen: !h.is_closed,
      openTime: h.open_time,
      closeTime: h.close_time
    })) : undefined
  };
}

export function mapDbProductToProduct(db: DbProduct): Product {
  // Determinar emoji basado en categoría
  let emoji = '🍽️';
  const category = db.category.toLowerCase();
  
  if (category.includes('plato') || category.includes('principal')) {
    emoji = '🍽️';
  } else if (category.includes('bebida')) {
    emoji = '🥤';
  } else if (category.includes('postre')) {
    emoji = '🍰';
  } else if (category.includes('entrada')) {
    emoji = '🥗';
  }
  
  return {
    id: db.id,
    tenantId: db.restaurant_id,
    name: db.name,
    desc: db.description || '',
    category: db.category as Product['category'],
    price: db.price_cop,
    available: db.available,
    image: db.image_url || undefined,
    emoji: emoji,
    isArchived: db.is_archived,
    sortOrder: db.sort_order,
    tags: db.tags,
    preparationTimeMinutes: db.preparation_time_minutes,
    ingredients: db.ingredients,
    allergens: db.allergens
  };
}

export function mapDbPostToPost(db: DbPost): Post {
  return {
    id: db.id,
    tenantId: db.restaurant_id,
    tenantName: 'Restaurante',
    tenantCategory: 'Gastronomía',
    tenantLogoEmoji: '🍽️',
    dishName: db.title,
    dishEmoji: '🍽️',
    desc: db.description || '',
    price: db.price_cop,
    image: db.media_url || '',
    mediaType: db.media_type,
    likes: 0,
    isLiked: false,
    commentsCount: 0,
    timeAgo: db.created_at,
    productId: db.product_id || '',
    hasValidProduct: !!db.product_id,
    width: db.media_width || undefined,
    height: db.media_height || undefined
  };
}

function mapDbFulfillmentToType(fulfillment: string, tableNumber?: string | null): string {
  if (fulfillment === 'table_service') {
    return `Mesa #${tableNumber || '1'}`;
  }
  if (fulfillment === 'restaurant_delivery') {
    return 'Domicilio';
  }
  return 'Recoger en local';
}

export function mapDbOrderItemToOrderItem(db: DbOrderItem): OrderItem {
  return {
    id: db.id,
    name: db.product_name,
    qty: db.quantity,
    price: db.unit_price_cop
  };
}

export function mapDbOrderToOrder(db: DbOrder): Order {
  const parsedAddress = typeof db.delivery_address === 'string'
    ? JSON.parse(db.delivery_address)
    : db.delivery_address;

  return {
    id: db.id,
    tenantId: db.restaurant_id,
    type: mapDbFulfillmentToType(db.fulfillment, db.table_number),
    items: (db.order_items || []).map(mapDbOrderItemToOrderItem),
    subtotal: db.subtotal_cop,
    deliveryFeeApplied: db.delivery_fee_cop,
    total: db.total_cop,
    status: db.status as OrderStatus,
    createdAt: new Date(db.created_at).getTime(),
    customerName: db.customer_name,
    customerPhone: db.customer_phone,
    fulfillment: db.fulfillment as OrderFulfillment,
    customerId: db.customer_id || undefined,
    deliveryAddress: parsedAddress || undefined,
    tableNumber: db.table_number || undefined,
    restaurantNotes: db.restaurant_notes || undefined,
    cancellationReason: db.cancellation_reason || undefined,
    paymentId: db.payments?.[0]?.id,
    paymentStatus: db.payments?.[0]?.status,
    paymentMethod: (db.payments?.[0]?.provider as any) || undefined
  };
}
