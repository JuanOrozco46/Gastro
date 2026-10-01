import React, { useState, useEffect } from 'react';
import type { Product, Order, CartItem, Tenant, Driver, OrderStatus, PaymentMethod, Transaction, UserRole, BusinessUserRole, Post, Story, UserAccount, City, Zone, CheckoutDetails, OrderFulfillment, CustomerDeliveryAddress, RestaurantApplication, ProvisionedOwnerAccount } from '../types';
import { AppContext } from './AppContextObject';

import { getValidOrderTransitions } from '../utils/tenantHelpers';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { fetchLiveTenants, fetchLiveProducts, fetchLivePosts, submitLiveApplication } from '../services/supabaseDataService';
import { signInWithSupabase, signUpWithSupabase, signInWithGoogleOAuth, sendPasswordResetEmail, signOutFromSupabase, resolveSupabaseUserProfile, subscribeToSupabaseAuthChanges, getCurrentSupabaseSession } from '../services/supabaseAuthService';
import { DEMO_ACCOUNTS } from './demoAccounts';
import { createLiveOrder, fetchLiveOrdersForRestaurant, fetchLiveOrdersForCustomer, updateLiveOrderStatus, subscribeToRestaurantOrders, subscribeToCustomerOrders, createRemotePayment } from '../services/supabaseOrderService';

// Internal typed authorization helpers
const isRestaurantOwner = (user: UserAccount | null): boolean => {
  if (!user) return false;
  return user.businessRole === 'restaurant_owner' || user.role === 'admin';
};

const isRestaurantStaff = (user: UserAccount | null): boolean => {
  if (!user) return false;
  return user.businessRole === 'restaurant_staff' || user.role === 'kitchen';
};

const isPlatformAdmin = (user: UserAccount | null): user is UserAccount => {
  if (!user) return false;
  return user.businessRole === 'platform_admin';
};

const hasOwnershipOfTenant = (user: UserAccount | null, tenantId: string): boolean => {
  if (!isRestaurantOwner(user) || !user?.tenantId) return false;
  return user.tenantId === tenantId;
};

const validateAndGetProvisionedAccounts = (): ProvisionedOwnerAccount[] => {
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
          temporaryPassword: obj.temporaryPassword,
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
const validateCachedSession = (): UserAccount | null => {
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
      name: obj.name.trim(),
      email: obj.email.trim().toLowerCase(),
      role: obj.role as UserRole,
      businessRole: obj.businessRole as BusinessUserRole | undefined,
      tenantId: obj.tenantId as string | undefined
    };
  } catch {
    localStorage.removeItem('gs_demo_session_v1');
    return null;
  }
};

const DEFAULT_CITIES: City[] = [
  {
    id: 'city_armenia_quindio',
    name: 'Armenia',
    countryCode: 'CO',
    currencyCode: 'COP',
    isActive: true
  }
];

const DEFAULT_ZONES: Zone[] = [
  { id: 'zone_armenia_centro', cityId: 'city_armenia_quindio', name: 'Centro', isActive: true },
  { id: 'zone_armenia_norte', cityId: 'city_armenia_quindio', name: 'Norte', isActive: true },
  { id: 'zone_armenia_sur', cityId: 'city_armenia_quindio', name: 'Sur', isActive: true }
];

const EMPTY_TENANT: Tenant = {
  id: 'empty_tenant',
  slug: 'sin-restaurante',
  name: 'Sin Restaurante',
  category: 'General',
  logoEmoji: '🏪',
  bannerUrl: '',
  description: 'No hay restaurantes registrados aún.',
  address: 'Armenia, Quindío',
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
  cityId: 'city_armenia_quindio',
  zoneId: 'zone_armenia_centro',
  status: 'draft',
  deliveryModes: []
};

const DEFAULT_TENANTS: Tenant[] = [];
const DEFAULT_PRODUCTS: Product[] = [];
const DEFAULT_POSTS: Post[] = [];
const DEFAULT_STORIES: Story[] = [];
const DEFAULT_ORDERS: Order[] = [];
const DEFAULT_TRANSACTIONS: Transaction[] = [];
const DEFAULT_DRIVERS: Driver[] = [];



export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [cities] = useState<City[]>(DEFAULT_CITIES);
  const [zones] = useState<Zone[]>(DEFAULT_ZONES);

  const authMode: 'remote' | 'demo' = isSupabaseConfigured ? 'remote' : 'demo';
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(isSupabaseConfigured);
  const [isCatalogLoading, setIsCatalogLoading] = useState<boolean>(isSupabaseConfigured);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState<boolean>(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  
  const [remoteTenants, setRemoteTenants] = useState<Tenant[]>([]);
  const remoteTenantsRef = React.useRef<Tenant[]>([]);
  const [remoteProducts, setRemoteProducts] = useState<Product[]>([]);
  const [remotePosts, setRemotePosts] = useState<Post[]>([]);

  const [tenants, setTenants] = useState<Tenant[]>(() => {
    try {
      const saved = localStorage.getItem('gs_tenants_v5');
      return saved ? JSON.parse(saved) : DEFAULT_TENANTS;
    } catch {
      return DEFAULT_TENANTS;
    }
  });

  const [initialSession] = useState<UserAccount | null>(() => validateCachedSession());
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(initialSession);
  const [userRole, setUserRole] = useState<UserRole>(initialSession ? initialSession.role : 'login');

  const [currentTenant, setCurrentTenant] = useState<Tenant>(() => {
    if (initialSession?.tenantId) {
      const found = tenants.find(t => t.id === initialSession.tenantId);
      if (found) return found;
    }
    return tenants[0] || EMPTY_TENANT;
  });



  const [products, setProducts] = useState<Product[]>(() => {
    try {
      const saved = localStorage.getItem('gs_products_v5');
      return saved ? JSON.parse(saved) : DEFAULT_PRODUCTS;
    } catch {
      return DEFAULT_PRODUCTS;
    }
  });

  const [posts, setPosts] = useState<Post[]>(() => {
    try {
      const saved = localStorage.getItem('gs_posts_v5');
      return saved ? JSON.parse(saved) : DEFAULT_POSTS;
    } catch {
      return DEFAULT_POSTS;
    }
  });

  const [stories] = useState<Story[]>(DEFAULT_STORIES);

  // Sync state to localStorage
  useEffect(() => {
    try { localStorage.setItem('gs_tenants_v5', JSON.stringify(tenants)); } catch {}
  }, [tenants]);

  useEffect(() => {
    try { localStorage.setItem('gs_products_v5', JSON.stringify(products)); } catch {}
  }, [products]);

  useEffect(() => {
    try { localStorage.setItem('gs_posts_v5', JSON.stringify(posts)); } catch {}
  }, [posts]);

  // Carga inicial de datos desde Supabase
  useEffect(() => {
    if (authMode === 'remote') {
      let isSubscribed = true;

      const initializeApp = async () => {
        try {
          const sessionResponse = await getCurrentSupabaseSession();
          let userAccount = null;

          if (sessionResponse.data.session?.user) {
            userAccount = await resolveSupabaseUserProfile(
              sessionResponse.data.session.user.id,
              sessionResponse.data.session.user.email || ''
            );
          }

          const [liveTenants, liveProducts, livePosts] = await Promise.all([
            fetchLiveTenants(),
            fetchLiveProducts(),
            fetchLivePosts()
          ]);

          if (!isSubscribed) return;

          setRemoteTenants(liveTenants);
          remoteTenantsRef.current = liveTenants;
          if (liveTenants.length > 0) {
            setTenants(liveTenants);
          }
          
          setRemoteProducts(liveProducts);
          setRemotePosts(livePosts);

          setCurrentTenant(prev => {
            if (prev.id === EMPTY_TENANT.id && liveTenants.length > 0) {
              return liveTenants[0];
            }
            return prev;
          });

          if (userAccount) {
            setCurrentUser(userAccount);
            setUserRole(userAccount.role);
            if (userAccount.tenantId) {
              const match = liveTenants.find(t => t.id === userAccount.tenantId);
              if (match) setCurrentTenant(match);
            }
          } else {
            await signOutFromSupabase();
          }
        } catch (err) {
          if (!isSubscribed) return;
          console.warn('⚠️ No se pudieron cargar los datos en vivo de Supabase:', err);
          setCatalogError('No fue posible cargar el catálogo remoto. Revisa tu conexión.');
        } finally {
          if (isSubscribed) {
            setIsAuthLoading(false);
            setIsCatalogLoading(false);
          }
        }
      };

      initializeApp();
      
      const { data: { subscription } } = subscribeToSupabaseAuthChanges(async (event, session) => {
        if (session?.user && event !== 'INITIAL_SESSION') {
          const userAccount = await resolveSupabaseUserProfile(session.user.id, session.user.email || '');
          setCurrentUser(userAccount);
          setUserRole(userAccount.role);
          if (userAccount.tenantId) {
            const match = remoteTenantsRef.current.find(t => t.id === userAccount.tenantId);
            if (match) setCurrentTenant(match);
          }
        } else if (event === 'SIGNED_OUT') {
          setCurrentUser(null);
          setUserRole('login');
          setRemoteTenants([]);
          setRemoteProducts([]);
          setRemotePosts([]);
        }
      });

      return () => {
        isSubscribed = false;
        subscription.unsubscribe();
      };
    }
  }, [authMode]);

  const [orders, setOrders] = useState<Order[]>(() => {
    try {
      const saved = localStorage.getItem('gs_orders_v5');
      return saved ? JSON.parse(saved) : DEFAULT_ORDERS;
    } catch {
      return DEFAULT_ORDERS;
    }
  });

  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    try {
      const saved = localStorage.getItem('gs_transactions_v5');
      return saved ? JSON.parse(saved) : DEFAULT_TRANSACTIONS;
    } catch {
      return DEFAULT_TRANSACTIONS;
    }
  });

  const [drivers, setDrivers] = useState<Driver[]>(DEFAULT_DRIVERS);
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('gs_cart_v5');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [equityWeight, setEquityWeight] = useState<number>(0.5);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3200);
  };

  const playChime = () => {
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext!)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);

      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch {
      // AudioContext bloqueado o no soportado sin intervención previa del usuario
    }
  };

  const [restaurantApplications, setRestaurantApplications] = useState<RestaurantApplication[]>(() => {
    try {
      const saved = localStorage.getItem('gs_restaurant_applications_v1');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [provisionedOwnerAccounts] = useState<ProvisionedOwnerAccount[]>(() =>
    validateAndGetProvisionedAccounts()
  );

  useEffect(() => {
    try {
      localStorage.setItem('gs_restaurant_applications_v1', JSON.stringify(restaurantApplications));
    } catch {}
  }, [restaurantApplications]);

  useEffect(() => {
    try {
      localStorage.setItem('gs_provisioned_owner_accounts_v1', JSON.stringify(provisionedOwnerAccounts));
    } catch {}
  }, [provisionedOwnerAccounts]);

  useEffect(() => {
    localStorage.setItem('gs_orders_v5', JSON.stringify(orders));
  }, [orders]);

  useEffect(() => {
    localStorage.setItem('gs_transactions_v5', JSON.stringify(transactions));
  }, [transactions]);

  useEffect(() => {
    localStorage.setItem('gs_cart_v5', JSON.stringify(cart));
  }, [cart]);

  // Carga y suscripción WebSockets en tiempo real para pedidos
  useEffect(() => {
    if (isSupabaseConfigured) {
      let activeUnsub = () => {};

      const syncOrders = async () => {
        if (currentUser?.tenantId) {
          const liveOrders = await fetchLiveOrdersForRestaurant(currentUser.tenantId);
          if (liveOrders.length > 0) {
            setOrders(liveOrders);
          }
          activeUnsub = subscribeToRestaurantOrders(currentUser.tenantId, async () => {
            const updated = await fetchLiveOrdersForRestaurant(currentUser.tenantId!);
            setOrders(updated);
            playChime();
            showToast('🔔 ¡Nueva comanda o actualización recibida en tiempo real!');
          });
        } else if (currentUser?.email) {
          const liveOrders = await fetchLiveOrdersForCustomer(currentUser.email);
          if (liveOrders.length > 0) {
            setOrders(liveOrders);
          }
          activeUnsub = subscribeToCustomerOrders(currentUser.email, async () => {
            const updated = await fetchLiveOrdersForCustomer(currentUser.email!);
            setOrders(updated);
            showToast('🚴 El estado de tu pedido ha sido actualizado por la cocina.');
          });
        }
      };

      syncOrders();

      return () => {
        activeUnsub();
      };
    }
  }, [currentUser, currentTenant]);

  const loginWithCredentials = async (email: string, pass: string): Promise<{ success: boolean; error?: string }> => {
    if (authMode === 'demo') {
      const account = DEMO_ACCOUNTS.find(a => a.email === email.trim().toLowerCase() && a.demoPassword === pass);
      if (account) {
        const userAccount: UserAccount = {
          email: account.email,
          name: account.name,
          role: account.userRole,
          businessRole: account.businessRole,
          tenantId: account.tenantId
        };
        setCurrentUser(userAccount);
        setUserRole(userAccount.role);
        if (userAccount.tenantId) {
          const tenantMatch = tenants.find(t => t.id === userAccount.tenantId);
          if (tenantMatch) setCurrentTenant(tenantMatch);
        }
        try { localStorage.setItem('gs_demo_session_v1', JSON.stringify(userAccount)); } catch {}
        showToast(`👋 ¡Bienvenid@ al modo Demo, ${userAccount.name}!`);
        return { success: true };
      }
      return { success: false, error: 'Correo o contraseña demo incorrectos.' };
    }

    const res = await signInWithSupabase(email, pass);
    if (res.success && res.user) {
      setCurrentUser(res.user);
      setUserRole(res.user.role);
      
      let updatedTenants = tenants;
      if (isSupabaseConfigured) {
        const liveTenants = await fetchLiveTenants();
        if (liveTenants.length > 0) {
          setTenants(liveTenants);
          updatedTenants = liveTenants;
        }
      }

      if (res.user.tenantId) {
        const tenantMatch = updatedTenants.find(t => t.id === res.user!.tenantId);
        if (tenantMatch) setCurrentTenant(tenantMatch);
      }
      showToast(`👋 ¡Bienvenid@, ${res.user.name}!`);
      return { success: true };
    }
    return { success: false, error: res.error || 'Correo o contraseña incorrectos.' };
  };

  const loginWithGoogle = async (): Promise<{ success: boolean; error?: string }> => {
    if (authMode === 'demo') {
      return { success: false, error: 'El servicio de autenticación con Google no está disponible en modo Demo.' };
    }
    return await signInWithGoogleOAuth();
  };

  const registerAccount = async (name: string, email: string, pass: string, _role?: UserRole): Promise<{ success: boolean; error?: string }> => {
    if (authMode === 'demo') {
      const userAccount: UserAccount = {
        email: email.trim().toLowerCase(),
        name: name.trim(),
        role: 'client_delivery',
        businessRole: 'customer'
      };
      setCurrentUser(userAccount);
      setUserRole('client_delivery');
      try { localStorage.setItem('gs_demo_session_v1', JSON.stringify(userAccount)); } catch {}
      showToast(`🎉 ¡Cuenta demo creada exitosamente para ${userAccount.name}!`);
      return { success: true };
    }

    const res = await signUpWithSupabase(email, pass, name);
    if (res.success && res.user) {
      setCurrentUser(res.user);
      setUserRole('client_delivery');
      showToast(`🎉 ¡Cuenta creada exitosamente para ${res.user.name}!`);
      return { success: true };
    }
    return { success: false, error: res.error || 'Error al crear la cuenta.' };
  };

  const sendPasswordReset = async (email: string): Promise<{ success: boolean; error?: string }> => {
    if (authMode === 'demo') {
      return { success: false, error: 'La recuperación de contraseña no está disponible en modo Demo.' };
    }

    const res = await sendPasswordResetEmail(email);
    if (res.success) {
      showToast('✉️ Correo de restablecimiento enviado con éxito.');
      return { success: true };
    }
    return { success: false, error: res.error || 'No se pudo enviar el correo de recuperación.' };
  };

  const logout = async () => {
    if (authMode === 'remote') {
      await signOutFromSupabase();
    }
    setUserRole('login');
    setCurrentUser(null);
    setCart([]);
    try {
      localStorage.removeItem('gs_demo_session_v1');
      localStorage.removeItem('gs_cart_v5');
    } catch {}
    showToast('Sesión cerrada correctamente');
  };

  const toggleLikePost = (postId: string) => {
    setPosts(prev => prev.map(p => {
      if (p.id === postId) {
        const nextLiked = !p.isLiked;
        return { ...p, isLiked: nextLiked, likes: nextLiked ? p.likes + 1 : p.likes - 1 };
      }
      return p;
    }));
  };

  const setCurrentTenantBySlug = (slug: string) => {
    const found = tenants.find(t => t.slug === slug);
    if (found) {
      setCurrentTenant(found);
      setCart([]);
      showToast(`Restaurante seleccionado: ${found.name}`);
    }
  };

  const toggleTenantOpenStatus = (tenantId: string) => {
    if (!isRestaurantOwner(currentUser) || !hasOwnershipOfTenant(currentUser, tenantId)) {
      showToast('⚠️ No tienes autorización para administrar este restaurante.');
      return;
    }
    setTenants(prev => prev.map(t => {
      if (t.id === tenantId) {
        const nextStatus = !t.isOpen;
        showToast(`${t.name}: ${nextStatus ? '¡ABIERTO Y RECIBIENDO PEDIDOS!' : 'CERRADO TEMPORALMENTE'}`);
        return { ...t, isOpen: nextStatus };
      }
      return t;
    }));
    if (currentTenant.id === tenantId) {
      setCurrentTenant(prev => ({ ...prev, isOpen: !prev.isOpen }));
    }
  };

  const updateTenant = (tenantId: string, updates: Partial<Tenant>) => {
    setTenants(prev => prev.map(t => t.id === tenantId ? { ...t, ...updates } : t));
    if (currentTenant.id === tenantId) {
      setCurrentTenant(prev => ({ ...prev, ...updates }));
    }
    showToast('Perfil del restaurante actualizado con éxito');
  };

  const addToCart = (product: Product) => {
    if (product.available === false) {
      showToast(`⚠️ "${product.name}" no se encuentra disponible por el momento.`);
      return;
    }
    const prodTenant = tenants.find(t => t.id === product.tenantId) || currentTenant;
    if (!prodTenant.isOpen) {
      showToast(`⚠️ ${prodTenant.name} se encuentra CERRADO temporalmente.`);
      return;
    }

    if (cart.length > 0) {
      const activeTenantId = cart[0].product.tenantId;
      if (activeTenantId !== product.tenantId) {
        const activeTenant = tenants.find(t => t.id === activeTenantId);
        const activeName = activeTenant ? activeTenant.name : 'otro restaurante';
        showToast(`⚠️ Tu carrito ya contiene productos de "${activeName}". Finaliza o vacía tu pedido actual antes de agregar de otro restaurante.`);
        return;
      }
    }

    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item => item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { product, quantity: 1 }];
    });
    showToast(`Añadido al carrito: ${product.name}`);
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  };

  const clearCart = () => setCart([]);

  const retryRemotePayment = async (orderId: string): Promise<{ success: boolean; paymentId?: string; sandboxUrl?: string; wompiConfig?: any }> => {
    setIsSubmittingOrder(true);
    setOrderError(null);
    const paymentRes = await createRemotePayment(orderId, 'wompi');
    setIsSubmittingOrder(false);
    if (!paymentRes.success) {
      setOrderError(paymentRes.error || 'No fue posible reintentar el pago remoto.');
      return { success: false };
    }
    return {
      success: true,
      paymentId: paymentRes.paymentId,
      sandboxUrl: paymentRes.sandboxUrl,
      wompiConfig: paymentRes.wompiConfig
    };
  };

  const submitOrderWithPayment = async (typeOrDetails: string | CheckoutDetails, method: PaymentMethod, transaction?: Transaction): Promise<{ success: boolean; isRemote?: boolean; orderId?: string; paymentId?: string; sandboxUrl?: string; wompiConfig?: any }> => {
    if (cart.length === 0) return { success: false };

    if (authMode === 'remote' && !currentUser?.email) {
      setOrderError('Debes iniciar sesión para realizar un pedido.');
      return { success: false };
    }

    setIsSubmittingOrder(true);
    setOrderError(null);

    const subtotal = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);

    let fulfillment: OrderFulfillment = 'pickup';
    let typeString = 'Recoger en local';
    let customerName = currentUser?.name || 'Cliente Demo';
    let customerPhone = '';
    let deliveryAddress: CustomerDeliveryAddress | undefined = undefined;
    let tableNumber: string | undefined = undefined;
    let restaurantNotes: string | undefined = undefined;
    let deliveryFeeApplied = 0;

    if (typeof typeOrDetails === 'object') {
      const details = typeOrDetails;
      fulfillment = details.fulfillment;
      customerName = details.customerName || customerName;
      customerPhone = details.customerPhone;
      deliveryAddress = details.deliveryAddress;
      tableNumber = details.tableNumber;
      restaurantNotes = details.restaurantNotes;

      if (fulfillment === 'pickup') {
        typeString = 'Recoger en local';
        deliveryFeeApplied = 0;
      } else if (fulfillment === 'restaurant_delivery') {
        typeString = 'Domicilio';
        deliveryFeeApplied = currentTenant.deliveryFee || 0;
      } else if (fulfillment === 'table_service') {
        typeString = tableNumber ? `Mesa #${tableNumber}` : 'Servicio en Mesa';
        deliveryFeeApplied = 0;
      }
    } else {
      typeString = typeOrDetails;
      if (typeString.toLowerCase().includes('mesa')) {
        fulfillment = 'table_service';
        const match = typeString.match(/\d+/);
        if (match) tableNumber = match[0];
      } else if (typeString.toLowerCase().includes('domicilio')) {
        fulfillment = 'restaurant_delivery';
        deliveryFeeApplied = currentTenant.deliveryFee || 0;
      } else {
        fulfillment = 'pickup';
      }
    }

    const calculatedTotal = subtotal + deliveryFeeApplied;
    
    // Preparar el pedido base sin dependencias de demo
    const baseOrder: Order = {
      id: '',
      tenantId: currentTenant.id,
      type: typeString,
      items: cart.map(c => ({ id: c.product.id, name: c.product.name, qty: c.quantity, price: c.product.price })),
      subtotal,
      deliveryFeeApplied,
      total: calculatedTotal,
      status: 'pending',
      createdAt: Date.now(),
      paymentMethod: method,
      transactionId: '',
      fulfillment,
      customerId: currentUser?.email,
      customerName,
      customerPhone,
      deliveryAddress,
      tableNumber,
      restaurantNotes
    };

    if (authMode === 'remote') {
      const res = await createLiveOrder(baseOrder);
      setIsSubmittingOrder(false);
      
      if (!res.success || !res.orderId) {
        setOrderError('No fue posible confirmar el pedido. Revisa los datos e inténtalo nuevamente.');
        return { success: false };
      }
      
      const paymentRes = await createRemotePayment(res.orderId, 'sandbox');
      setIsSubmittingOrder(false);

      if (!paymentRes.success) {
        setOrderError(paymentRes.error || 'El pedido se creó, pero falló la inicialización del pago remoto.');
        return { success: false };
      }

      clearCart();
      playChime();
      showToast(`¡Pedido (${typeString}) enviado a ${currentTenant.name}! Completa el pago seguro en la URL provista.`);
      
      // En un futuro podríamos redirigir a paymentRes.sandboxUrl si está presente.
      if (paymentRes.sandboxUrl) {
        console.log('Redirecting to sandbox UI:', paymentRes.sandboxUrl);
      }

      return { 
        success: true, 
        isRemote: true, 
        orderId: res.orderId, 
        paymentId: paymentRes.paymentId, 
        sandboxUrl: paymentRes.sandboxUrl,
        wompiConfig: paymentRes.wompiConfig
      };
    } else {
      // Demo Mode
      if (!transaction) {
        setIsSubmittingOrder(false);
        return { success: false };
      }
      const platformFee = Math.round(calculatedTotal * currentTenant.commissionRate);
      const restaurantPayout = calculatedTotal - platformFee;

      const normalizedTransaction: Transaction = {
        ...transaction,
        amount: calculatedTotal,
        tenantId: currentTenant.id,
        orderId: transaction.orderId,
        platformFee,
        restaurantPayout
      };

      baseOrder.id = normalizedTransaction.orderId;
      baseOrder.transactionId = normalizedTransaction.id;

      setOrders(prev => [baseOrder, ...prev]);
      setTransactions(prev => [normalizedTransaction, ...prev]);
      clearCart();
      playChime();
      showToast(`¡Pedido (${typeString}) de $${calculatedTotal.toLocaleString('es-CO')} enviado a ${currentTenant.name}!`);
      setIsSubmittingOrder(false);
      return { success: true, isRemote: false };
    }
  };

  const updateOrderStatus = async (orderId: string, status: OrderStatus): Promise<boolean> => {
    const targetOrder = orders.find(o => o.id === orderId);
    if (!targetOrder) return false;

    const owner = isRestaurantOwner(currentUser);
    const staff = isRestaurantStaff(currentUser);

    if (!owner && !staff) {
      showToast('⚠️ No tienes autorización para modificar el estado de los pedidos.');
      return false;
    }

    if (currentUser?.tenantId !== targetOrder.tenantId) {
      showToast('⚠️ No tienes autorización para modificar pedidos de otro restaurante.');
      return false;
    }

    if (staff && !owner) {
      const isValidKitchenTransition =
        (targetOrder.status === 'pending' && status === 'accepted') ||
        (targetOrder.status === 'accepted' && status === 'preparing') ||
        (targetOrder.status === 'preparing' && status === 'ready');

      if (!isValidKitchenTransition) {
        showToast('⚠️ El personal de cocina sólo puede avanzar pedidos en fase de preparación.');
        return false;
      }
    }

    if (owner) {
      const validTransitions = getValidOrderTransitions(
        targetOrder.status,
        targetOrder.fulfillment,
        targetOrder.type,
        false
      ).map(t => t.status);

      if (!validTransitions.includes(status)) {
        showToast(`⚠️ Transición no permitida de ${targetOrder.status} a ${status}.`);
        return false;
      }
    }

    if (authMode === 'remote') {
      const res = await updateLiveOrderStatus(orderId, status);
      if (!res.success) {
        showToast(res.error || 'No fue posible actualizar el pedido.');
        return false;
      }
    }

    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o));
    showToast(`Pedido #${orderId.slice(0, 8)} actualizado a ${status.toUpperCase()}`);
    return true;
  };

  const toggleProductAvailability = (productId: string) => {
    const target = products.find(p => p.id === productId);
    if (!target) return;

    if (!isRestaurantOwner(currentUser) || !hasOwnershipOfTenant(currentUser, target.tenantId)) {
      showToast('⚠️ No tienes autorización para modificar productos de este restaurante.');
      return;
    }

    setProducts(prev => prev.map(p => {
      if (p.id === productId) {
        const updated = !p.available;
        showToast(`${p.name}: ${updated ? 'Disponible' : 'AGOTADO'}`);
        return { ...p, available: updated };
      }
      return p;
    }));
  };

  const addProduct = (newProd: Omit<Product, 'id' | 'tenantId'>) => {
    if (!isRestaurantOwner(currentUser) || !currentUser?.tenantId) {
      showToast('⚠️ No tienes autorización para agregar productos al menú.');
      return;
    }
    const targetTenantId = currentUser.tenantId;
    const prod: Product = { ...newProd, id: `p${Date.now()}`, tenantId: targetTenantId };
    setProducts(prev => [prod, ...prev]);
    showToast(`Producto creado: ${prod.name}`);
  };

  const assignDriverToOrder = (orderId: string, driverId: string) => {
    const targetOrder = orders.find(o => o.id === orderId);
    if (!targetOrder) return;

    if (!isRestaurantOwner(currentUser) || !hasOwnershipOfTenant(currentUser, targetOrder.tenantId)) {
      showToast('⚠️ No tienes autorización para asignar repartidores en este restaurante.');
      return;
    }
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, driverId } : o));
    setDrivers(prev => prev.map(d => d.id === driverId ? { ...d, status: 'busy', assignedOrderId: orderId } : d));
    showToast(`Domiciliario asignado al pedido #${orderId}`);
  };

  const triggerTestOrder = () => {
    if (!isRestaurantOwner(currentUser) && !isPlatformAdmin(currentUser)) {
      showToast('⚠️ No tienes autorización para generar pedidos de prueba.');
      return;
    }

    const targetTenantId = currentUser?.tenantId || (isPlatformAdmin(currentUser) ? currentTenant.id : null);
    if (!targetTenantId) {
      showToast('⚠️ No hay un restaurante asignado para generar el pedido de prueba.');
      return;
    }

    const targetTenant = tenants.find(t => t.id === targetTenantId);
    if (!targetTenant) return;

    const newId = Math.floor(200 + Math.random() * 700).toString();
    const testTx: Transaction = {
      id: `tx_${Date.now()}`,
      orderId: newId,
      tenantId: targetTenant.id,
      amount: 25000,
      restaurantPayout: 24250,
      platformFee: 750,
      paymentMethod: 'apple_pay',
      status: 'approved',
      authorizationCode: '918234',
      timestamp: Date.now()
    };

    const testOrder: Order = {
      id: newId,
      tenantId: targetTenant.id,
      type: 'Mesa #3',
      items: [{ id: 'p1', name: 'Pedido de Prueba', qty: 1, price: 25000 }],
      subtotal: 25000,
      deliveryFeeApplied: 0,
      total: 25000,
      status: 'pending',
      createdAt: Date.now(),
      paymentMethod: 'apple_pay',
      transactionId: testTx.id,
      fulfillment: 'table_service',
      tableNumber: '3'
    };

    setOrders(prev => [testOrder, ...prev]);
    setTransactions(prev => [testTx, ...prev]);
    playChime();
    showToast(`Simulado pedido pagado #${newId} para ${targetTenant.name}`);
  };

  const addComment = (postId: string, text: string, userName = 'Tú (Cliente)') => {
    setPosts(prev => prev.map(p => {
      if (p.id === postId) {
        const newComment = {
          id: `c_${Date.now()}`,
          postId,
          userName,
          userAvatar: '🥑',
          text,
          timeAgo: 'Justo ahora',
          likes: 0
        };
        const updatedComments = [newComment, ...(p.comments || [])];
        return {
          ...p,
          comments: updatedComments,
          commentsCount: updatedComments.length
        };
      }
      return p;
    }));
    showToast('💬 Comentario publicado');
  };

  const createPost = (postData: Omit<Post, 'id' | 'likes' | 'isLiked' | 'commentsCount' | 'viewCount' | 'ordersFromPost' | 'timeAgo'>) => {
    if (!isRestaurantOwner(currentUser) || !currentUser?.tenantId) {
      showToast('⚠️ No tienes autorización para publicar contenido.');
      return;
    }
    const targetTenantId = currentUser.tenantId;
    const targetTenant = tenants.find(t => t.id === targetTenantId);
    if (!targetTenant) {
      showToast('⚠️ Restaurante no encontrado.');
      return;
    }
    const newPost: Post = {
      ...postData,
      id: `post_${Date.now()}`,
      tenantId: targetTenant.id,
      tenantName: targetTenant.name,
      tenantCategory: targetTenant.category,
      tenantLogoEmoji: targetTenant.logoEmoji || '🍽️',
      tenantAddress: targetTenant.address,
      likes: 0,
      isLiked: false,
      commentsCount: 0,
      comments: [],
      viewCount: 1,
      ordersFromPost: 0,
      timeAgo: 'Hace un momento'
    };
    setPosts(prev => [newPost, ...prev]);
    showToast('✨ ¡Tu publicación ya está en vivo en el Feed!');
  };

  const deletePost = (postId: string) => {
    const target = posts.find(p => p.id === postId);
    if (!target) return;

    if (!isRestaurantOwner(currentUser) || !hasOwnershipOfTenant(currentUser, target.tenantId)) {
      showToast('⚠️ No tienes autorización para eliminar publicaciones de este restaurante.');
      return;
    }
    setPosts(prev => prev.filter(p => p.id !== postId));
    showToast('🗑️ Publicación eliminada correctamente');
  };

  const addDriver = (driverData: Omit<Driver, 'id' | 'tenantId' | 'status'>) => {
    if (!isRestaurantOwner(currentUser) || !currentUser?.tenantId) {
      showToast('⚠️ No tienes autorización para registrar repartidores.');
      return;
    }
    const targetTenantId = currentUser.tenantId;
    const newDriver: Driver = {
      ...driverData,
      id: `d_${Date.now()}`,
      tenantId: targetTenantId,
      status: 'available'
    };
    setDrivers(prev => [...prev, newDriver]);
    showToast(`🛵 Repartidor ${newDriver.name} registrado`);
  };

  const deleteProduct = (productId: string) => {
    const target = products.find(p => p.id === productId);
    if (!target) return;

    if (!isRestaurantOwner(currentUser) || !hasOwnershipOfTenant(currentUser, target.tenantId)) {
      showToast('⚠️ No tienes autorización para eliminar productos de este restaurante.');
      return;
    }
    setProducts(prev => prev.filter(p => p.id !== productId));
    showToast('🗑️ Producto eliminado del menú');
  };

  const addTenant = (tenantData: Omit<Tenant, 'id' | 'slug' | 'salesWeekly' | 'rating' | 'distanceKm' | 'isNew' | 'commissionRate' | 'tablesCount' | 'isOpen'>): Tenant => {
    if (!isPlatformAdmin(currentUser)) {
      showToast('⚠️ Únicamente el administrador de plataforma puede registrar nuevos restaurantes.');
      return tenants[0];
    }
    const slug = tenantData.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const id = `t_${Date.now()}`;
    const newTenant: Tenant = {
      ...tenantData,
      id,
      slug,
      salesWeekly: 0,
      rating: 5.0,
      distanceKm: 0.9,
      isNew: true,
      commissionRate: 0.03,
      tablesCount: 10,
      isOpen: true
    };
    setTenants(prev => [newTenant, ...prev]);
    setCurrentTenant(newTenant);
    showToast(`✨ ¡Restaurante "${newTenant.name}" registrado con éxito!`);
    return newTenant;
  };

  const updateEquityWeight = (weight: number) => {
    if (!isPlatformAdmin(currentUser)) {
      showToast('⚠️ Únicamente el administrador de plataforma puede modificar esta métrica.');
      return;
    }
    setEquityWeight(weight);
  };

  const submitRestaurantApplication = (
    applicationData: Omit<RestaurantApplication, 'id' | 'submittedAt' | 'status' | 'cityId'>
  ): boolean => {
    if (
      !applicationData.ownerName?.trim() ||
      !applicationData.ownerEmail?.trim() ||
      !applicationData.ownerPhone?.trim() ||
      !applicationData.restaurantName?.trim() ||
      !applicationData.category?.trim() ||
      !applicationData.zoneId?.trim() ||
      !applicationData.address?.trim() ||
      !applicationData.deliveryModes ||
      applicationData.deliveryModes.length === 0
    ) {
      showToast('⚠️ Por favor completa todos los campos requeridos y selecciona al menos una modalidad.');
      return false;
    }

    const normalizedEmail = applicationData.ownerEmail.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      showToast('⚠️ Ingresa un correo electrónico de contacto con formato válido.');
      return false;
    }

    const foundZone = zones.find(
      z => z.id === applicationData.zoneId && z.isActive && z.cityId === 'city_armenia_quindio'
    );
    if (!foundZone) {
      showToast('⚠️ La zona seleccionada no es válida o no está activa para Armenia.');
      return false;
    }

    const validModesSet: OrderFulfillment[] = ['pickup', 'restaurant_delivery', 'table_service'];
    const hasInvalidMode = applicationData.deliveryModes.some(m => !validModesSet.includes(m));
    if (hasInvalidMode) {
      showToast('⚠️ La modalidad de atención contiene opciones no válidas.');
      return false;
    }

    if (applicationData.minOrder !== undefined && (!Number.isFinite(applicationData.minOrder) || applicationData.minOrder < 0)) {
      showToast('⚠️ El pedido mínimo debe ser un número válido y no negativo.');
      return false;
    }

    const hasDelivery = applicationData.deliveryModes.includes('restaurant_delivery');
    let finalDeliveryFee = hasDelivery ? applicationData.deliveryFee : undefined;
    let finalDeliveryRadiusKm = hasDelivery ? applicationData.deliveryRadiusKm : undefined;

    if (hasDelivery) {
      if (finalDeliveryFee !== undefined && (!Number.isFinite(finalDeliveryFee) || finalDeliveryFee < 0)) {
        showToast('⚠️ La tarifa de entrega debe ser un número válido y no negativo.');
        return false;
      }
      if (finalDeliveryRadiusKm !== undefined && (!Number.isFinite(finalDeliveryRadiusKm) || finalDeliveryRadiusKm < 0)) {
        showToast('⚠️ El radio de entrega debe ser un número válido y no negativo.');
        return false;
      }
    }

    const newApp: RestaurantApplication = {
      ...applicationData,
      ownerName: applicationData.ownerName.trim(),
      ownerEmail: normalizedEmail,
      ownerPhone: applicationData.ownerPhone.trim(),
      restaurantName: applicationData.restaurantName.trim(),
      category: applicationData.category.trim(),
      address: applicationData.address.trim(),
      whatsapp: applicationData.whatsapp?.trim(),
      notes: applicationData.notes?.trim(),
      deliveryFee: finalDeliveryFee,
      deliveryRadiusKm: finalDeliveryRadiusKm,
      id: `app_${Date.now()}`,
      submittedAt: Date.now(),
      status: 'submitted',
      cityId: 'city_armenia_quindio'
    };

    setRestaurantApplications(prev => [newApp, ...prev]);

    if (isSupabaseConfigured) {
      submitLiveApplication(newApp).catch(err => {
        console.warn('⚠️ No se pudo enviar la solicitud a Supabase:', err);
      });
    }

    showToast('📝 ¡Solicitud recibida! Quedará pendiente de revisión antes de activar el restaurante.');
    return true;
  };

  const reviewRestaurantApplication = (
    applicationId: string,
    nextStatus: 'reviewing' | 'approved' | 'rejected',
    reviewNote?: string
  ): boolean => {
    if (!isPlatformAdmin(currentUser)) {
      showToast('⚠️ No tienes autorización para revisar solicitudes de restaurante.');
      return false;
    }

    const targetApp = restaurantApplications.find(a => a.id === applicationId);
    if (!targetApp) {
      showToast('⚠️ La solicitud especificada no existe.');
      return false;
    }

    if (targetApp.status === 'approved' || targetApp.status === 'rejected') {
      showToast('⚠️ No se puede modificar el estado de una solicitud ya finalizada (aprobada o rechazada).');
      return false;
    }

    if (targetApp.status === 'reviewing' && nextStatus === 'reviewing') {
      showToast('⚠️ La solicitud ya se encuentra en estado de revisión.');
      return false;
    }

    const reviewerEmail = currentUser.email;

    setRestaurantApplications(prev => prev.map(app => {
      if (app.id === applicationId) {
        return {
          ...app,
          status: nextStatus,
          reviewedAt: Date.now(),
          reviewedByEmail: reviewerEmail,
          reviewNote: reviewNote?.trim() || undefined
        };
      }
      return app;
    }));

    const statusLabel = nextStatus === 'approved' ? 'APROBADA' : nextStatus === 'rejected' ? 'RECHAZADA' : 'EN REVISIÓN';
    showToast(`📝 Solicitud de "${targetApp.restaurantName}" marcada como ${statusLabel}.`);
    return true;
  };

  const activateApprovedRestaurant = async (
    applicationId: string
  ): Promise<{ success: boolean; tenantId?: string; error?: string }> => {
    if (!isPlatformAdmin(currentUser)) {
      const err = '⚠️ No tienes autorización para activar restaurantes.';
      showToast(err);
      return { success: false, error: err };
    }

    const targetApp = restaurantApplications.find(a => a.id === applicationId);
    if (!targetApp) {
      const err = '⚠️ La solicitud especificada no existe.';
      showToast(err);
      return { success: false, error: err };
    }

    if (targetApp.status !== 'approved') {
      const err = '⚠️ Solo se pueden activar solicitudes con estado Aprobada.';
      showToast(err);
      return { success: false, error: err };
    }

    if (targetApp.activatedTenantId || targetApp.activatedAt) {
      const err = '⚠️ La solicitud ya ha sido activada previamente.';
      showToast(err);
      return { success: false, error: err };
    }

    showToast('⏳ Conectando con Supabase para crear restaurante y enviar invitación...');
    
    try {
      const { data, error } = await supabase!.functions.invoke('approve_restaurant', {
        body: { applicationId: targetApp.id }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const reviewerEmail = currentUser.email;

      setRestaurantApplications(prev => prev.map(app => {
        if (app.id === applicationId) {
          return {
            ...app,
            activatedAt: Date.now(),
            activatedByEmail: reviewerEmail,
            activatedTenantId: 'created_in_db'
          };
        }
        return app;
      }));

      const apiMsg = data?.message || `¡Restaurante "${targetApp.restaurantName}" creado exitosamente!`;
      showToast(`🎉 ${apiMsg}`);
      return { success: true, message: apiMsg };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al procesar la activación en la nube.';
      showToast(`⚠️ ${msg}`);
      return { success: false, error: msg };
    }
  };

  const activeTenants = authMode === 'remote' ? remoteTenants : tenants;
  const activeProducts = authMode === 'remote' ? remoteProducts : products;
  const activePosts = authMode === 'remote' ? remotePosts : posts;

  return (
    <AppContext.Provider value={{
      cities,
      zones,
      tenants: activeTenants,
      currentTenant,
      products: activeProducts,
      orders,
      transactions,
      posts: activePosts,
      stories,
      cart,
      drivers,
      equityWeight,
      authMode,
      isAuthLoading,
      isCatalogLoading,
      catalogError,
      isSubmittingOrder,
      orderError,
      remoteTenants,
      remoteProducts,
      remotePosts,
      userRole,
      currentUser,
      toast,
      restaurantApplications,
      loginWithCredentials,
      loginWithGoogle,
      registerAccount,
      sendPasswordReset,
      setCurrentTenantBySlug,
      toggleTenantOpenStatus,
      addTenant,
      updateTenant,
      toggleLikePost,
      addComment,
      createPost,
      deletePost,
      addDriver,
      deleteProduct,
      setEquityWeight: updateEquityWeight,
      addToCart,
      removeFromCart,
      clearCart,
      submitOrderWithPayment,
      retryRemotePayment,
      updateOrderStatus,
      toggleProductAvailability,
      addProduct,
      assignDriverToOrder,
      submitRestaurantApplication,
      reviewRestaurantApplication,
      activateApprovedRestaurant,
      showToast,
      triggerTestOrder,
      logout
    }}>
      {children}
    </AppContext.Provider>
  );
};


