import { createContext } from 'react';
import type { Product, Order, CartItem, Tenant, Driver, OrderStatus, PaymentMethod, Transaction, UserRole, Post, Story, UserAccount, UserRegistrationOptions, City, Zone, CheckoutDetails, RestaurantApplication, UserLocationState, RestaurantMember } from '../types';
import type { ApplicationAssetFiles } from '../services/supabaseDataService';

export interface AppContextType {
  cities: City[];
  zones: Zone[];
  selectedCityId: string;
  selectedZoneId: string | null;
  userLocationState: UserLocationState;
  locationPreference: 'gps' | 'manual';
  setSelectedCity: (cityId: string) => void;
  setSelectedZone: (zoneId: string | null) => void;
  refreshCities: () => Promise<void>;
  refreshZones: (cityId?: string) => Promise<void>;
  requestUserLocation: () => Promise<void>;
  clearUserLocation: () => void;
  resolveCityFromCoordinates: (latitude: number, longitude: number) => Promise<boolean>;
  switchToManualLocation: () => void;
  tenants: Tenant[];
  currentTenant: Tenant;
  products: Product[];
  orders: Order[];
  transactions: Transaction[];
  posts: Post[];
  stories: Story[];
  cart: CartItem[];
  drivers: Driver[];
  equityWeight: number;
  authMode: 'remote' | 'demo';
  emailVerificationState: import('../types').EmailVerificationState;
  pendingVerificationEmail: string | null;
  resendVerificationEmail: () => Promise<void>;
  refreshEmailVerification: () => Promise<void>;
  signOutUnverifiedUser: () => Promise<void>;
  isAuthLoading: boolean;
  isCatalogLoading: boolean;
  catalogError: string | null;
  remoteTenants: Tenant[];
  remoteProducts: Product[];
  remotePosts: Post[];
  isSubmittingOrder: boolean;
  orderError: string | null;
  userRole: UserRole;
  currentUser: UserAccount | null;
  toast: string | null;
  restaurantApplications: RestaurantApplication[];
  loginWithCredentials: (email: string, pass: string) => Promise<{ success: boolean; error?: string }> | boolean;
  loginWithGoogle: () => Promise<{ success: boolean; error?: string }> | void;
  registerAccount: (name: string, email: string, pass: string, role?: UserRole, options?: UserRegistrationOptions) => Promise<{ success: boolean; error?: string }> | void;
  updateUserProfile: (
    updates: {
      name?: string;
      username?: string;
      phone?: string;
      defaultAddress?: string;
      defaultDeliveryNotes?: string;
      avatarUrl?: string;
    },
    avatarFile?: File | null
  ) => Promise<{ success: boolean; error?: string }>;
  sendPasswordReset: (email: string) => Promise<{ success: boolean; error?: string }>;
  setCurrentTenantBySlug: (slug: string) => void;
  toggleTenantOpenStatus: (tenantId: string) => Promise<void>;
  addTenant: (tenantData: Omit<Tenant, 'id' | 'slug' | 'salesWeekly' | 'rating' | 'distanceKm' | 'isNew' | 'commissionRate' | 'tablesCount' | 'isOpen'>) => Tenant;
  updateTenant: (tenantId: string, updates: Partial<Tenant>) => void;
  syncTenantRating: (tenantId: string, ratingAvg?: number, ratingCount?: number) => void;
  toggleLikePost: (postId: string) => void;
  addComment: (postId: string, text: string, userName?: string) => Promise<boolean>;
  deleteComment: (postId: string, commentId: string) => void;
  createPost: (postData: Omit<Post, 'id' | 'likes' | 'isLiked' | 'commentsCount' | 'viewCount' | 'ordersFromPost' | 'timeAgo'>) => Promise<boolean> | void;
  deletePost: (postId: string) => Promise<void> | void;
  addDriver: (driver: Omit<Driver, 'id' | 'tenantId' | 'status'>) => void;
  deleteProduct: (productId: string) => Promise<void>;
  setEquityWeight: (weight: number) => void;
  addToCart: (product: Product) => { success: boolean; requiresClear?: boolean; activeTenantName?: string; } | void;
  clearCartAndAdd: (product: Product) => void;
  removeFromCart: (productId: string) => void;
  clearCart: () => void;
  submitOrderWithPayment: (typeOrDetails: string | CheckoutDetails, method: PaymentMethod, transaction?: Transaction) => Promise<{ success: boolean; isRemote?: boolean; orderId?: string; paymentId?: string; sandboxUrl?: string; wompiConfig?: unknown }>;
  retryRemotePayment: (orderId: string) => Promise<{ success: boolean; paymentId?: string; sandboxUrl?: string; wompiConfig?: unknown }>;
  updateOrderStatus: (orderId: string, status: OrderStatus) => Promise<boolean>;
  confirmCashPayment: (paymentId: string, orderId: string) => Promise<{ success: boolean; error?: string }>;
  toggleProductAvailability: (productId: string) => Promise<void> | void;
  addProduct: (product: Omit<Product, 'id' | 'tenantId'>) => Promise<boolean>;
  updateProduct: (productId: string, updates: Partial<Product>) => Promise<void>;
  assignDriverToOrder: (orderId: string, driverId: string) => void;
  submitRestaurantApplication: (applicationData: Omit<RestaurantApplication, 'id' | 'submittedAt' | 'status'>, assets?: ApplicationAssetFiles) => Promise<boolean>;
  reviewRestaurantApplication: (applicationId: string, nextStatus: 'reviewing' | 'approved' | 'rejected', reviewNote?: string) => Promise<boolean>;
  activateApprovedRestaurant: (applicationId: string) => Promise<{ success: boolean; tenantId?: string; error?: string; message?: string }>;
  showToast: (message: string) => void;
  triggerTestOrder: () => void;
  
  // Member Management
  fetchRestaurantMembers: (restaurantId: string) => Promise<RestaurantMember[]>;
  inviteRestaurantStaff: (restaurantId: string, email: string) => Promise<{ success: boolean; error?: string }>;
  resendStaffInvitation: (memberId: string) => Promise<{ success: boolean; error?: string }>;
  suspendRestaurantMember: (memberId: string) => Promise<{ success: boolean; error?: string }>;
  reactivateRestaurantMember: (memberId: string) => Promise<{ success: boolean; error?: string }>;
  revokeRestaurantMember: (memberId: string) => Promise<{ success: boolean; error?: string }>;
  acceptRestaurantInvitation: (memberId: string) => Promise<{ success: boolean; error?: string }>;
  
  logout: () => void;
}

export const AppContext = createContext<AppContextType | undefined>(undefined);
