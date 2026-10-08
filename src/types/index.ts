// Domain models for GastroSync single-city local MVP

export type EmailVerificationState =
  | 'not_required'
  | 'pending'
  | 'confirmed'
  | 'expired'
  | 'error';

export type OrderStatus =
  | 'pending'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

export type OrderFulfillment = 'pickup' | 'restaurant_delivery' | 'table_service';

export type PaymentMethod = 'cash' | 'apple_pay' | 'google_pay' | 'card' | 'mercadopago' | 'wompi';

export type RestaurantMemberRole = 'owner' | 'staff';
export type RestaurantMemberStatus = 'invited' | 'active' | 'suspended' | 'revoked';

export interface RestaurantMember {
  id: string;
  restaurantId: string;
  userId: string | null;
  email: string;
  role: RestaurantMemberRole;
  status: RestaurantMemberStatus;
  invitedBy?: string;
  invitedAt?: string;
  acceptedAt?: string;
  revokedAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export type UserRole = 'login' | 'client_delivery' | 'kitchen' | 'admin' | 'table_qr' | 'platform_admin';

export type BusinessUserRole = 'customer' | 'restaurant_owner' | 'restaurant_staff' | 'platform_admin';

export interface UserAccount {
  id?: string;
  email: string;
  name: string;
  /** Handle de usuario sin el signo @ inicial (ej. "maria_lopez") */
  username?: string;
  /** URL pública o DataURL comprimido de la foto de perfil */
  avatarUrl?: string;
  /** Teléfono de contacto para autocompletar en pedidos */
  phone?: string;
  /** Dirección habitual de entrega para autocompletar en pedidos */
  defaultAddress?: string;
  /** Notas de entrega habituales (ej. Apto, portería) */
  defaultDeliveryNotes?: string;
  role: UserRole;
  businessRole?: BusinessUserRole;
  tenantId?: string;
  needsPasswordSet?: boolean;
}

export interface UserRegistrationOptions {
  username?: string;
  phone?: string;
  defaultAddress?: string;
  defaultDeliveryNotes?: string;
  avatarFile?: File | null;
  avatarDataUrl?: string;
}

export interface City {
  id: string;
  name: string;
  slug?: string;
  countryCode: string;
  currencyCode: string;
  isActive: boolean;
}

export interface Zone {
  id: string;
  cityId: string;
  name: string;
  slug?: string;
  isActive: boolean;
}

export type LocationPermissionState =
  | 'unknown'
  | 'prompt'
  | 'granted'
  | 'denied'
  | 'unavailable';

export type UserLocationState = {
  permission: LocationPermissionState;
  latitude?: number;
  longitude?: number;
  cityId?: string;
  zoneId?: string;
  isResolving: boolean;
  error?: string;
};

export type RestaurantDeliveryMode = 'pickup' | 'restaurant_delivery' | 'table_service';

export type RestaurantStatus = 'draft' | 'pending_approval' | 'active' | 'suspended';

export type RestaurantApplicationStatus = 'submitted' | 'reviewing' | 'approved' | 'rejected';

export interface ProvisionedOwnerAccount {
  id: string;
  name: string;
  email: string;
  tenantId: string;
  businessRole: 'restaurant_owner';
  userRole: 'admin';
  createdAt: number;
}

export interface RestaurantApplication {
  id: string;
  submittedAt: number;
  status: RestaurantApplicationStatus;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  restaurantName: string;
  category: string;
  cityId: string;
  zoneId: string;
  address: string;
  description?: string;
  whatsapp?: string;
  minOrder?: number;
  deliveryModes: OrderFulfillment[];
  deliveryFee?: number;
  deliveryRadiusKm?: number;
  estimatedDeliveryMinutes?: number;
  scheduleHours?: string;
  logoUrl?: string;
  bannerUrl?: string;
  /** Tasa de comisión (0.03 = 3%) aceptada explícitamente por el solicitante. */
  commissionRateAccepted?: number;
  termsAcceptedAt?: number;
  termsVersion?: string;
  notes?: string;
  reviewedAt?: number;
  reviewedByEmail?: string;
  reviewNote?: string;
  activatedAt?: number;
  activatedTenantId?: string;
  activatedByEmail?: string;
}

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  category: string;
  logoUrl?: string;
  logoEmoji?: string;
  bannerUrl?: string;
  description?: string;
  address?: string;
  deliveryTime?: string; // e.g. "20-30 min"
  priceRange?: '$' | '$$' | '$$$';
  minOrder?: number; // e.g. 15000 COP
  specialties?: string[];
  promotionBadge?: string;
  salesWeekly: number;
  rating: number;
  distanceKm: number;
  isNew: boolean;
  commissionRate: number; // e.g. 0.03 (3%)
  tablesCount: number;
  isOpen: boolean; // Controls whether restaurant accepts orders
  // Extended domain fields for location, status, and delivery modes
  cityId?: string;
  zoneId?: string;
  status?: RestaurantStatus;
  deliveryModes?: RestaurantDeliveryMode[];
  phone?: string;
  whatsapp?: string;
  deliveryFee?: number;
  deliveryRadiusKm?: number;
  estimatedDeliveryMinutes?: string | number;
  ownerUserId?: string;
  acceptingOrders?: boolean;
  hours?: RestaurantHour[];
  googlePlaceId?: string;
  tableServiceEnabled?: boolean;
  acceptsCash?: boolean;
}

export interface RestaurantHour {
  id?: string;
  restaurantId: string;
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, etc.
  isOpen: boolean;
  openTime?: string; // HH:mm format
  closeTime?: string; // HH:mm format
  openTime2?: string; // HH:mm format (for split shifts)
  closeTime2?: string; // HH:mm format (for split shifts)
}

export interface RestaurantTable {
  id: string;
  restaurantId: string;
  tableNumber: string;
  displayName?: string;
  capacity?: number;
  isActive: boolean;
  publicToken: string;
  createdAt: string;
}

export type Restaurant = Tenant;

export interface PostComment {
  id: string;
  postId: string;
  userId?: string;
  userName: string;
  userHandle?: string;
  userAvatar: string;
  userAvatarUrl?: string;
  text: string;
  timeAgo: string;
  likes: number;
}

export interface Post {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantCategory: string;
  tenantLogoEmoji: string;
  tenantAddress?: string;
  dishName: string;
  dishEmoji: string;
  desc: string;
  hashtags?: string[];
  price: number;
  image: string;           // thumbnail or photo URL
  mediaType: 'photo' | 'video';
  mediaPath?: string;      // Path in Supabase Storage
  mediaUrl?: string;       // Public/Signed URL of the media
  thumbnailPath?: string;  // Path to thumbnail in Supabase Storage
  legacyExternalYoutubeId?: string; // Marker for old YouTube posts
  width?: number;
  height?: number;
  duration?: number;
  status?: 'draft' | 'published';
  createdAt?: number;
  updatedAt?: number;
  likes: number;
  isLiked: boolean;
  commentsCount: number;
  comments?: PostComment[];
  viewCount?: number;
  ordersFromPost?: number;
  timeAgo: string;
  productId: string;
  hasValidProduct?: boolean; // Flag to indicate if product exists in catalog for ordering
}

export interface StoryItem {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantEmoji: string;
  image: string;
  mediaUrl?: string;
  legacyExternalYoutubeId?: string;
  dishName: string;
  price: number;
  productId: string;
  timeAgo: string;
  seen?: boolean;
}

export interface Story {
  id: string;
  tenantId: string;
  tenantName: string;
  emoji: string;
  title: string;
  isLive: boolean;
  items: StoryItem[];
}

export interface Transaction {
  id: string;
  orderId: string;
  tenantId: string;
  amount: number;
  restaurantPayout: number;
  platformFee: number;
  paymentMethod: PaymentMethod;
  status: 'approved' | 'pending' | 'rejected';
  authorizationCode: string;
  timestamp: number;
}

export interface Product {
  id: string;
  tenantId: string;
  name: string;
  desc: string;
  price: number;
  category: 'Platos Principales' | 'Bebidas' | 'Postres' | 'Entradas';
  emoji: string;
  image?: string;
  available: boolean;
  isArchived?: boolean;
  sortOrder?: number;
  tags?: string[];
  preparationTimeMinutes?: number;
  ingredients?: string[];
  allergens?: string[];
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface OrderItem {
  id: string;
  name: string;
  qty: number;
  price: number;
}

export interface CustomerDeliveryAddress {
  label: string;
  addressLine: string;
  zoneId?: string;
  notes?: string;
}

export interface CheckoutDetails {
  fulfillment: OrderFulfillment;
  customerName: string;
  customerPhone: string;
  deliveryAddress?: CustomerDeliveryAddress;
  tableNumber?: string;
  tableId?: string;
  tableToken?: string;
  restaurantNotes?: string;
}

export interface Order {
  id: string;
  tenantId: string;
  type: string; // e.g. "Recoger en local", "Domicilio" or "Mesa #4"
  items: OrderItem[];
  subtotal?: number;
  deliveryFeeApplied?: number;
  total: number;
  status: OrderStatus;
  createdAt: number;
  customerName?: string;
  driverId?: string;
  paymentMethod?: PaymentMethod;
  transactionId?: string;
  paymentId?: string;
  paymentStatus?: string;
  // Extended domain fields for order fulfillment and delivery
  fulfillment?: OrderFulfillment;
  customerId?: string;
  customerPhone?: string;
  deliveryAddress?: CustomerDeliveryAddress;
  tableNumber?: string;
  tableId?: string;
  tableToken?: string;
  restaurantNotes?: string;
  cancellationReason?: string;
}

export interface Driver {
  id: string;
  tenantId: string;
  name: string;
  vehicle: string;
  phone: string;
  status: 'available' | 'busy' | 'offline';
  assignedOrderId?: string;
}
