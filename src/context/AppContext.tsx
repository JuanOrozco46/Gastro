import React, { useState, useEffect } from 'react';
import type { Product, Order, Tenant, Driver, OrderStatus, PaymentMethod, Transaction, UserRole, Post, Story, UserAccount, UserRegistrationOptions, CheckoutDetails, OrderFulfillment, CustomerDeliveryAddress, RestaurantApplication, ProvisionedOwnerAccount } from '../types';
import { AppContext } from './AppContextObject';

import { getValidOrderTransitions } from '../utils/tenantHelpers';
import { normalizeUsername } from '../utils/formValidation';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { fetchLiveTenants, fetchLiveCities, fetchLiveZones, fetchLiveProducts, fetchLivePosts, submitLiveApplication, uploadApplicationAssets, fetchLiveApplications, updateLiveApplicationStatus, createLiveProduct, updateLiveProduct, deleteLiveProduct, createLivePost, deleteLivePost, updateLiveRestaurantOpenStatus, toggleRemoteLike, addRemoteComment, deleteRemoteComment, updateRemoteTenant, fetchRestaurantMembers as fetchRemoteMembers, inviteRestaurantStaff as inviteRemoteStaff, resendStaffInvitation as resendRemoteInvitation, suspendRestaurantMember as suspendRemoteMember, reactivateRestaurantMember as reactivateRemoteMember, revokeRestaurantMember as revokeRemoteMember, acceptRestaurantInvitation as acceptRemoteInvitation } from '../services/supabaseDataService';
import type { ApplicationAssetFiles } from '../services/supabaseDataService';
import { signInWithSupabase, signUpWithSupabase, signInWithGoogleOAuth, sendPasswordResetEmail, signOutFromSupabase, resolveSupabaseUserProfile, subscribeToSupabaseAuthChanges, getCurrentSupabaseSession, resendVerificationEmailAuth, updateSupabaseUserProfile, saveLocalProfileCache } from '../services/supabaseAuthService';
import { DEMO_LOGIN_ENABLED } from './demoGate';
import { DEFAULT_CITIES, DEFAULT_ZONES, EMPTY_TENANT, DEFAULT_TENANTS, DEFAULT_PRODUCTS, DEFAULT_POSTS, DEFAULT_STORIES, DEFAULT_ORDERS, DEFAULT_TRANSACTIONS, DEFAULT_DRIVERS } from './defaultData';
import { useLocationSlice } from './useLocationSlice';
import { useToastSlice } from './useToastSlice';
import { useCartSlice } from './useCartSlice';
import { createLiveOrder, fetchLiveOrdersForRestaurant, fetchLiveOrdersForCustomer, updateLiveOrderStatus, subscribeToRestaurantOrders, subscribeToCustomerOrders, createRemotePayment, confirmCashPayment as confirmCashPaymentRemote } from '../services/supabaseOrderService';
import { isRestaurantOwner, isRestaurantStaff, isPlatformAdmin, hasOwnershipOfTenant, validateAndGetProvisionedAccounts, validateCachedSession } from './authGuards';

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
const location = useLocationSlice();
  const {
    cities,
    setCities,
    zones,
    setZones,
    selectedCityId,
    selectedZoneId,
    setSelectedCityIdState,
    setSelectedZoneIdState,
    setSelectedCity,
    setSelectedZone,
    refreshCities,
    refreshZones,
    locationPreference,
    userLocationState,
    switchToManualLocation,
    clearUserLocation,
    resolveCityFromCoordinates,
    requestUserLocation
  } = location;


  const authMode: 'remote' | 'demo' = isSupabaseConfigured ? 'remote' : 'demo';
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(isSupabaseConfigured);
  const [isCatalogLoading, setIsCatalogLoading] = useState<boolean>(isSupabaseConfigured);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState<boolean>(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  
  const [remoteTenants, setRemoteTenants] = useState<Tenant[]>([]);
  const remoteTenantsRef = React.useRef<Tenant[]>([]);
  const likingPostsRef = React.useRef<Set<string>>(new Set());
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
  
  const [emailVerificationState, setEmailVerificationState] = useState<import('../types').EmailVerificationState>('not_required');
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<UserRole>(() => {
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/mesa/')) {
      return 'table_qr';
    }
    return initialSession ? initialSession.role : 'login';
  });

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

  const [orders, setOrders] = useState<Order[]>(() => {
    if (isSupabaseConfigured) {
      try {
        localStorage.removeItem('gs_orders_v5');
      } catch {}
      return [];
    }
    try {
      const saved = localStorage.getItem('gs_demo_orders_v1');
      return saved ? JSON.parse(saved) : DEFAULT_ORDERS;
    } catch {
      return DEFAULT_ORDERS;
    }
  });

  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    if (isSupabaseConfigured) {
      try {
        localStorage.removeItem('gs_transactions_v5');
      } catch {}
      return [];
    }
    try {
      const saved = localStorage.getItem('gs_demo_transactions_v1');
      return saved ? JSON.parse(saved) : DEFAULT_TRANSACTIONS;
    } catch {
      return DEFAULT_TRANSACTIONS;
    }
  });

  // Carga inicial de datos desde Supabase
  useEffect(() => {
    if (authMode === 'remote') {
      let isSubscribed = true;

      const initializeApp = async () => {
        try {
          const sessionResponse = await getCurrentSupabaseSession();
          let userAccount = null;

          if (sessionResponse.data.session?.user) {
            const user = sessionResponse.data.session.user;
            if (user.email_confirmed_at) {
              userAccount = await resolveSupabaseUserProfile(
                user.id,
                user.email || '',
                user.user_metadata?.needs_password_set
              );
              setEmailVerificationState('confirmed');
            } else {
              setEmailVerificationState('pending');
              setPendingVerificationEmail(user.email || null);
            }
          } else if (sessionResponse.data.session === null && supabase) {
            // Check if there's a user without a session (e.g. unverified)
            const { data: { user } } = await supabase.auth.getUser();
            if (user && !user.email_confirmed_at) {
              setEmailVerificationState('pending');
              setPendingVerificationEmail(user.email || null);
            }
          }

          const [liveTenants, liveProducts, livePosts, liveApps, liveCities, liveZones] = await Promise.all([
            fetchLiveTenants(),
            fetchLiveProducts(),
            fetchLivePosts(),
            fetchLiveApplications(),
            fetchLiveCities(),
            fetchLiveZones()
          ]);

          if (!isSubscribed) return;

          setRemoteTenants(liveTenants);
          remoteTenantsRef.current = liveTenants;
          setTenants(liveTenants);

          setRemoteProducts(liveProducts);
          setProducts(liveProducts);
          setRemotePosts(livePosts);
          setPosts(livePosts);
          setRestaurantApplications(liveApps);

          const activeCities = liveCities.length > 0 ? liveCities : DEFAULT_CITIES;
          const activeZones = liveZones.length > 0 ? liveZones : DEFAULT_ZONES;

          if (liveCities.length > 0) setCities(liveCities);
          if (liveZones.length > 0) setZones(liveZones);

          const activeRemoteTenants = liveTenants.filter(t => t.status === 'active');

          // Validate selected city ID exists and has active tenants if any exist
          setSelectedCityIdState(prev => {
            const exists = activeCities.some(c => c.id === prev && c.isActive);
            const hasTenantsInPrevCity =
              activeRemoteTenants.length === 0 || activeRemoteTenants.some(t => t.cityId === prev);
            if (exists && hasTenantsInPrevCity) return prev;
            const cityWithTenants = activeRemoteTenants[0]?.cityId;
            const fallback =
              (cityWithTenants && activeCities.some(c => c.id === cityWithTenants) ? cityWithTenants : null) ||
              activeCities[0]?.id ||
              DEFAULT_CITIES[0].id;
            try { localStorage.setItem('gs_selected_city_v1', fallback); } catch { /* ignore */ }
            return fallback;
          });

          // Validate selected zone ID exists and belongs to city (and doesn't hide all active tenants)
          setSelectedZoneIdState(prev => {
            if (!prev) return null;
            const exists = activeZones.some(z => z.id === prev && z.isActive);
            const hasTenantsInZone =
              activeRemoteTenants.length === 0 || activeRemoteTenants.some(t => t.zoneId === prev);
            if (exists && hasTenantsInZone) return prev;
            try { localStorage.removeItem('gs_selected_zone_v1'); } catch { /* ignore */ }
            return null;
          });

          setCurrentTenant(prev => {
            if ((prev.id === EMPTY_TENANT.id || !liveTenants.some(t => t.id === prev.id)) && liveTenants.length > 0) {
              return liveTenants[0];
            }
            return prev;
          });

          if (userAccount) {
            if (userAccount.tenantId) {
              const match = liveTenants.find(t => t.id === userAccount.tenantId);
              if (match) setCurrentTenant(match);
            }
            setCurrentUser(userAccount);
            setUserRole(userAccount.role);
          } else if (!sessionResponse.data.session?.user) {
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
          if (!session.user.email_confirmed_at) {
            setEmailVerificationState('pending');
            setPendingVerificationEmail(session.user.email || null);
            if (window.location.pathname.startsWith('/auth/callback')) {
              window.history.replaceState({}, document.title, '/');
            }
            return;
          }

          setEmailVerificationState('confirmed');
          // 1. Resolver el perfil (y aprovisionar el restaurante en BD si es un restaurante nuevo)
          const userAccount = await resolveSupabaseUserProfile(
            session.user.id,
            session.user.email || '',
            session.user.user_metadata?.needs_password_set
          );

          // 2. Recargar catálogo en vivo ANTES de cambiar la vista para que el restaurante recién creado ya esté en `tenants`
          const [livePosts, liveProducts, liveTenants] = await Promise.all([
            fetchLivePosts(),
            fetchLiveProducts(),
            fetchLiveTenants()
          ]);
          setRemotePosts(livePosts);
          setPosts(livePosts);
          setRemoteProducts(liveProducts);
          setProducts(liveProducts);
          if (liveTenants.length > 0) {
            setRemoteTenants(liveTenants);
            remoteTenantsRef.current = liveTenants;
            setTenants(liveTenants);
          }

          if (userAccount.tenantId) {
            const sourceTenants = liveTenants.length > 0 ? liveTenants : remoteTenantsRef.current;
            const match = sourceTenants.find(t => t.id === userAccount.tenantId);
            if (match) setCurrentTenant(match);
          }

          setCurrentUser(userAccount);
          setUserRole(userAccount.role);
          
          if (window.location.pathname.startsWith('/auth/callback')) {
            window.history.replaceState({}, document.title, '/');
          }
        } else if (event === 'SIGNED_OUT') {
          // Limpiar inmediatamente datos de sesión y pedidos del usuario anterior
          setCurrentUser(null);
          setUserRole('login');
          setOrders([]);
          setTransactions([]);
          try {
            localStorage.removeItem('gs_orders_v5');
            localStorage.removeItem('gs_transactions_v5');
          } catch {}
        }
      });

      return () => {
        isSubscribed = false;
        subscription.unsubscribe();
      };
    }
  }, [authMode, setCities, setZones, setSelectedCityIdState, setSelectedZoneIdState]);

  const [drivers, setDrivers] = useState<Driver[]>(DEFAULT_DRIVERS);
  const [equityWeight, setEquityWeight] = useState<number>(0.5);
  const { toast, showToast } = useToastSlice(authMode === 'remote');

  const catalogTenants = authMode === 'remote' ? remoteTenants : tenants;

  const {
    cart,
    setCart,
    cartConflict,
    setCartConflict,
    addToCart,
    clearCartAndAdd,
    removeFromCart,
    clearCart
  } = useCartSlice(catalogTenants, currentTenant, showToast);

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

  useEffect(() => {
    if (!isSupabaseConfigured) {
      try {
        localStorage.setItem('gs_demo_orders_v1', JSON.stringify(orders));
      } catch {}
    }
  }, [orders]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      try {
        localStorage.setItem('gs_demo_transactions_v1', JSON.stringify(transactions));
      } catch {}
    }
  }, [transactions]);

  // Carga y suscripción WebSockets en tiempo real para pedidos (aislamiento estricto por usuario / restaurante)
  useEffect(() => {
    if (isSupabaseConfigured) {
      let activeUnsub = () => {};
      let cancelled = false;

      const syncOrders = async () => {
        if (!currentUser) {
          setOrders([]);
          return;
        }

        const isRestaurantAccount = Boolean(
          currentUser.tenantId &&
          (currentUser.businessRole === 'restaurant_owner' ||
            currentUser.businessRole === 'restaurant_staff' ||
            currentUser.role === 'admin' ||
            currentUser.role === 'kitchen')
        );

        if (isRestaurantAccount && currentUser.tenantId) {
          const tenantId = currentUser.tenantId;
          const liveOrders = await fetchLiveOrdersForRestaurant(tenantId);
          if (!cancelled) {
            setOrders(liveOrders.filter(o => o.tenantId === tenantId));
          }
          activeUnsub = subscribeToRestaurantOrders(tenantId, async () => {
            const updated = await fetchLiveOrdersForRestaurant(tenantId);
            if (!cancelled) {
              setOrders(updated.filter(o => o.tenantId === tenantId));
              playChime();
              showToast('🔔 ¡Nueva comanda o actualización recibida en tiempo real!');
            }
          });
        } else if (currentUser.id) {
          const customerId = currentUser.id;
          const liveOrders = await fetchLiveOrdersForCustomer(customerId);
          if (!cancelled) {
            setOrders(liveOrders.filter(o => o.customerId === customerId));
          }
          activeUnsub = subscribeToCustomerOrders(customerId, async () => {
            const updated = await fetchLiveOrdersForCustomer(customerId);
            if (!cancelled) {
              setOrders(updated.filter(o => o.customerId === customerId));
              showToast('🚴 El estado de tu pedido ha sido actualizado por la cocina.');
            }
          });
        } else {
          setOrders([]);
        }
      };

      syncOrders();

      return () => {
        cancelled = true;
        activeUnsub();
      };
    }
  }, [currentUser, showToast]);

  const loginWithCredentials = async (email: string, pass: string): Promise<{ success: boolean; error?: string }> => {
    if (authMode === 'demo') {
      if (!DEMO_LOGIN_ENABLED) {
        return { success: false, error: 'El modo demo no está disponible en producción. Configura Supabase para iniciar sesión.' };
      }
      // Carga diferida: demoAccounts.ts (con las contraseñas) queda fuera del bundle de producción.
      const { DEMO_ACCOUNTS } = await import('./demoAccounts');
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
      let updatedTenants = tenants;
      if (isSupabaseConfigured) {
        const [liveTenants, livePosts, liveProducts] = await Promise.all([
          fetchLiveTenants(),
          fetchLivePosts(),
          fetchLiveProducts()
        ]);
        if (liveTenants.length > 0) {
          setTenants(liveTenants);
          setRemoteTenants(liveTenants);
          remoteTenantsRef.current = liveTenants;
          updatedTenants = liveTenants;
        }
        setRemotePosts(livePosts);
        setRemoteProducts(liveProducts);
      }
      if (!res.emailConfirmed) {
        setEmailVerificationState('pending');
        setPendingVerificationEmail(res.user.email);
        showToast('✉️ Tu correo aún no ha sido confirmado. Revisa tu bandeja de entrada.');
        return { success: true };
      }

      setCurrentUser(res.user);
      setUserRole(res.user.role);
      setEmailVerificationState('confirmed');

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

  const registerAccount = async (
    name: string,
    email: string,
    pass: string,
    _role?: UserRole,
    options?: UserRegistrationOptions
  ): Promise<{ success: boolean; error?: string }> => {
    const cleanUsername = options?.username ? normalizeUsername(options.username) : undefined;
    const cleanPhone = options?.phone?.trim() || undefined;
    const cleanAddress = options?.defaultAddress?.trim() || undefined;
    const cleanNotes = options?.defaultDeliveryNotes?.trim() || undefined;
    const avatarUrl = options?.avatarDataUrl || undefined;

    if (authMode === 'demo') {
      const normalizedEmail = email.trim().toLowerCase();
      const userAccount: UserAccount = {
        id: `demo_${Date.now()}`,
        email: normalizedEmail,
        name: name.trim(),
        username: cleanUsername,
        avatarUrl,
        phone: cleanPhone,
        defaultAddress: cleanAddress,
        defaultDeliveryNotes: cleanNotes,
        role: 'client_delivery',
        businessRole: 'customer'
      };
      setCurrentUser(userAccount);
      setUserRole('client_delivery');
      try { localStorage.setItem('gs_demo_session_v1', JSON.stringify(userAccount)); } catch {}
      saveLocalProfileCache([userAccount.id || '', normalizedEmail], {
        name: userAccount.name,
        username: cleanUsername,
        avatarUrl,
        phone: cleanPhone,
        defaultAddress: cleanAddress,
        defaultDeliveryNotes: cleanNotes
      });
      showToast(`🎉 ¡Cuenta creada exitosamente para @${cleanUsername || userAccount.name}!`);
      return { success: true };
    }

    const res = await signUpWithSupabase(email, pass, name, options);
    if (res.success && res.user) {
      if (res.emailConfirmed) {
        if (res.user.tenantId) {
          const liveTenants = await fetchLiveTenants();
          if (liveTenants && liveTenants.length > 0) {
            setTenants(liveTenants);
            setRemoteTenants(liveTenants);
            remoteTenantsRef.current = liveTenants;
            const matchedTenant = liveTenants.find(t => t.id === res.user?.tenantId);
            if (matchedTenant) setCurrentTenant(matchedTenant);
          }
        }
        setCurrentUser(res.user);
        setUserRole(res.user.role);
        setEmailVerificationState('confirmed');
        showToast(`🎉 ¡Cuenta creada exitosamente para ${res.user.username ? `@${res.user.username}` : res.user.name}!`);
      } else {
        setEmailVerificationState('pending');
        setPendingVerificationEmail(res.user.email);
        showToast('✉️ Revisa tu correo para confirmar la cuenta.');
      }
      return { success: true };
    }
    return { success: false, error: res.error || 'Error al crear la cuenta.' };
  };

  // Salvaguarda reactiva: si el usuario autenticado tiene un tenantId recién creado que aún no está en memoria, recargarlo de inmediato
  useEffect(() => {
    if (authMode !== 'remote' || !isSupabaseConfigured || !currentUser?.tenantId) return;
    const targetTenantId = currentUser.tenantId;
    if (remoteTenantsRef.current.some(t => t.id === targetTenantId)) return;

    let cancelled = false;
    fetchLiveTenants().then(liveTenants => {
      if (cancelled || liveTenants.length === 0) return;
      setTenants(liveTenants);
      setRemoteTenants(liveTenants);
      remoteTenantsRef.current = liveTenants;
      const matched = liveTenants.find(t => t.id === targetTenantId);
      if (matched) setCurrentTenant(matched);
    });
    return () => {
      cancelled = true;
    };
  }, [authMode, currentUser?.tenantId]);

  const updateUserProfile = async (
    updates: {
      name?: string;
      username?: string;
      phone?: string;
      defaultAddress?: string;
      defaultDeliveryNotes?: string;
      avatarUrl?: string;
    },
    avatarFile?: File | null
  ): Promise<{ success: boolean; error?: string }> => {
    if (!currentUser) {
      return { success: false, error: 'Debes iniciar sesión para actualizar tu perfil.' };
    }

    const cleanUsername = updates.username !== undefined ? normalizeUsername(updates.username) : currentUser.username;
    const res = await updateSupabaseUserProfile(
      currentUser.id || currentUser.email,
      currentUser.email,
      { ...updates, username: cleanUsername },
      avatarFile
    );

    if (!res.success) {
      return { success: false, error: res.error || 'No se pudo actualizar el perfil.' };
    }

    const nextUser: UserAccount = {
      ...currentUser,
      name: updates.name !== undefined ? updates.name.trim() : currentUser.name,
      username: cleanUsername || undefined,
      avatarUrl: res.avatarUrl !== undefined ? res.avatarUrl : currentUser.avatarUrl,
      phone: updates.phone !== undefined ? (updates.phone.trim() || undefined) : currentUser.phone,
      defaultAddress: updates.defaultAddress !== undefined ? (updates.defaultAddress.trim() || undefined) : currentUser.defaultAddress,
      defaultDeliveryNotes: updates.defaultDeliveryNotes !== undefined ? (updates.defaultDeliveryNotes.trim() || undefined) : currentUser.defaultDeliveryNotes
    };

    setCurrentUser(nextUser);
    try {
      if (authMode === 'demo') {
        localStorage.setItem('gs_demo_session_v1', JSON.stringify(nextUser));
      }
    } catch {}

    // Actualizar comentarios propios en memoria para reflejar el nuevo @ y foto al instante
    const updateCommentList = (list: Post[]) =>
      list.map(p => ({
        ...p,
        comments: (p.comments || []).map(c => {
          const isMine = (c.userId && nextUser.id && c.userId === nextUser.id) || c.userName === currentUser.name;
          if (!isMine) return c;
          return {
            ...c,
            userName: nextUser.name,
            userHandle: nextUser.username,
            userAvatar: nextUser.avatarUrl || c.userAvatar || '🥑',
            userAvatarUrl: nextUser.avatarUrl
          };
        })
      }));

    setPosts(prev => updateCommentList(prev));
    setRemotePosts(prev => updateCommentList(prev));

    return { success: true };
  };

  const resendVerificationEmail = async () => {
    if (!pendingVerificationEmail) return;
    const res = await resendVerificationEmailAuth(pendingVerificationEmail);
    if (res.success) {
      showToast('✉️ Correo reenviado correctamente.');
    } else {
      showToast(`⚠️ ${res.error || 'Error al reenviar el correo.'}`);
    }
  };

  const refreshEmailVerification = async () => {
    if (!supabase) return;
    const { data: { session }, error } = await supabase.auth.refreshSession();
    if (error || !session) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email_confirmed_at) {
        setEmailVerificationState('confirmed');
        const userAccount = await resolveSupabaseUserProfile(
          user.id,
          user.email || '',
          user.user_metadata?.needs_password_set
        );
        if (userAccount.tenantId) {
          const liveTenants = await fetchLiveTenants();
          if (liveTenants && liveTenants.length > 0) {
            setTenants(liveTenants);
            setRemoteTenants(liveTenants);
            remoteTenantsRef.current = liveTenants;
            const matchedTenant = liveTenants.find(t => t.id === userAccount.tenantId);
            if (matchedTenant) setCurrentTenant(matchedTenant);
          }
        }
        setCurrentUser(userAccount);
        setUserRole(userAccount.role);
        return;
      }
      setEmailVerificationState('error');
      return;
    }
    
    if (session.user.email_confirmed_at) {
      setEmailVerificationState('confirmed');
      const userAccount = await resolveSupabaseUserProfile(
        session.user.id,
        session.user.email || '',
        session.user.user_metadata?.needs_password_set
      );
      if (userAccount.tenantId) {
        const liveTenants = await fetchLiveTenants();
        if (liveTenants && liveTenants.length > 0) {
          setTenants(liveTenants);
          setRemoteTenants(liveTenants);
          remoteTenantsRef.current = liveTenants;
          const matchedTenant = liveTenants.find(t => t.id === userAccount.tenantId);
          if (matchedTenant) setCurrentTenant(matchedTenant);
        }
      }
      setCurrentUser(userAccount);
      setUserRole(userAccount.role);
    } else {
      setEmailVerificationState('error');
    }
  };

  const signOutUnverifiedUser = async () => {
    await signOutFromSupabase();
    setEmailVerificationState('not_required');
    setPendingVerificationEmail(null);
    setCurrentUser(null);
    setUserRole('login');
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

  const fetchRestaurantMembers = async (restaurantId: string) => {
    if (authMode === 'demo') {
      const saved = localStorage.getItem(`gs_demo_members_${restaurantId}`);
      if (saved) {
        try { return JSON.parse(saved); } catch {}
      }
      return [];
    }
    return await fetchRemoteMembers(restaurantId);
  };

  const inviteRestaurantStaff = async (restaurantId: string, email: string) => {
    if (authMode === 'demo') {
      const key = `gs_demo_members_${restaurantId}`;
      const saved = localStorage.getItem(key);
      let members: any[] = saved ? JSON.parse(saved) : [];
      if (members.find(m => m.email.toLowerCase() === email.toLowerCase() && m.status !== 'revoked')) {
        return { success: false, error: 'User already invited or active.' };
      }
      members.push({
        id: `m_${Date.now()}`,
        restaurantId,
        userId: null,
        email: email.toLowerCase(),
        role: 'staff',
        status: 'invited',
        invitedAt: new Date().toISOString(),
        createdAt: new Date().toISOString()
      });
      localStorage.setItem(key, JSON.stringify(members));
      return { success: true };
    }
    return await inviteRemoteStaff(restaurantId, email);
  };

  const resendStaffInvitation = async (memberId: string) => {
    if (authMode === 'demo') return { success: true };
    return await resendRemoteInvitation(memberId);
  };

  const suspendRestaurantMember = async (memberId: string) => {
    if (authMode === 'demo') {
      // Find in localStorage and update (simplified for demo)
      return { success: true };
    }
    return await suspendRemoteMember(memberId);
  };

  const reactivateRestaurantMember = async (memberId: string) => {
    if (authMode === 'demo') return { success: true };
    return await reactivateRemoteMember(memberId);
  };

  const revokeRestaurantMember = async (memberId: string) => {
    if (authMode === 'demo') return { success: true };
    return await revokeRemoteMember(memberId);
  };

  const acceptRestaurantInvitation = async (memberId: string) => {
    if (authMode === 'demo') return { success: true };
    return await acceptRemoteInvitation(memberId);
  };


  const logout = async () => {
    if (authMode === 'remote') {
      await signOutFromSupabase();
    }
    setUserRole('login');
    setCurrentUser(null);
    setOrders([]);
    setTransactions([]);
    setCart([]);
    try {
      localStorage.removeItem('gs_demo_session_v1');
      localStorage.removeItem('gs_cart_v5');
      localStorage.removeItem('gs_orders_v5');
      localStorage.removeItem('gs_transactions_v5');
    } catch {}
    showToast('Sesión cerrada correctamente');
  };

  const toggleLikePost = async (postId: string) => {
    if (likingPostsRef.current.has(postId)) return;
    likingPostsRef.current.add(postId);
    try {
      if (authMode === 'remote') {
        if (!currentUser?.id) {
          showToast('⚠️ Inicia sesión para dar like.');
          return;
        }
        const ok = await toggleRemoteLike(postId, currentUser.id);
        if (!ok) {
          console.error('⚠️ Falló toggleRemoteLike para el post:', postId);
          showToast('❌ Error al procesar like.');
          return;
        }
        setRemotePosts(prev => prev.map(p => {
          if (p.id === postId) {
            const nextLiked = !p.isLiked;
            return { ...p, isLiked: nextLiked, likes: nextLiked ? p.likes + 1 : p.likes - 1 };
          }
          return p;
        }));
        return;
      }
      // Modo demo
      setPosts(prev => prev.map(p => {
        if (p.id === postId) {
          const nextLiked = !p.isLiked;
          return { ...p, isLiked: nextLiked, likes: nextLiked ? p.likes + 1 : p.likes - 1 };
        }
        return p;
      }));
    } finally {
      likingPostsRef.current.delete(postId);
    }
  };

  const setCurrentTenantBySlug = (slug: string) => {
    const sourceTenants = authMode === 'remote' ? remoteTenants : tenants;
    const found = sourceTenants.find(t => t.slug === slug || t.id === slug);
    if (found) {
      setCurrentTenant(found);
    }
  };

  const toggleTenantOpenStatus = async (tenantId: string) => {
    if (!isRestaurantOwner(currentUser) || !hasOwnershipOfTenant(currentUser, tenantId)) {
      showToast('⚠️ No tienes autorización para administrar este restaurante.');
      return;
    }

    const sourceTenants = authMode === 'remote' ? remoteTenants : tenants;
    const tenant = sourceTenants.find(t => t.id === tenantId);
    if (!tenant) return;

    if (tenant.status !== 'active') {
      showToast('⚠️ Solo puedes cambiar el estado de restaurantes activos.');
      return;
    }

    const nextStatus = !tenant.isOpen;

    if (authMode === 'remote') {
      const success = await updateLiveRestaurantOpenStatus(tenantId, nextStatus);
      if (!success) {
        showToast('❌ No pudimos actualizar el estado del restaurante.');
        return;
      }
      setRemoteTenants(prev => prev.map(t => t.id === tenantId ? { ...t, isOpen: nextStatus } : t));
    }

    setTenants(prev => prev.map(t => {
      if (t.id === tenantId) {
        showToast(`${t.name}: ${nextStatus ? '¡ABIERTO Y RECIBIENDO PEDIDOS!' : 'CERRADO TEMPORALMENTE'}`);
        return { ...t, isOpen: nextStatus };
      }
      return t;
    }));
    if (currentTenant.id === tenantId) {
      setCurrentTenant(prev => ({ ...prev, isOpen: nextStatus }));
    }
  };

  const updateTenant = async (tenantId: string, updates: Partial<Tenant>) => {
    let remoteMerged: Partial<Tenant> = updates;
    if (authMode === 'remote') {
      const updatedTenant = await updateRemoteTenant(tenantId, updates);
      if (!updatedTenant) {
        showToast('⚠️ Hubo un error al guardar los cambios en el servidor.');
        return;
      }
      remoteMerged = { ...updates, ...updatedTenant };
      setRemoteTenants(prev => {
        const next = prev.map(t => (t.id === tenantId ? { ...t, ...remoteMerged } : t));
        remoteTenantsRef.current = next;
        return next;
      });
    }
    
    // Solo actualizar la UI tras confirmación remota
    setTenants(prev => prev.map(t => (t.id === tenantId ? { ...t, ...remoteMerged } : t)));
    if (currentTenant.id === tenantId) {
      setCurrentTenant(prev => ({ ...prev, ...remoteMerged }));
    }
    
    showToast('Perfil del restaurante actualizado con éxito');
  };

  const syncTenantRating = (tenantId: string, ratingAvg?: number, ratingCount?: number) => {
    if (!tenantId) return;
    const patch: Partial<Tenant> = {};
    if (typeof ratingAvg === 'number' && Number.isFinite(ratingAvg)) {
      patch.rating = Number(ratingAvg.toFixed(2));
    }
    if (typeof ratingCount === 'number' && Number.isFinite(ratingCount)) {
      patch.reviewsCount = Math.max(0, Math.round(ratingCount));
    }
    if (Object.keys(patch).length === 0) return;

    setRemoteTenants(prev => {
      const next = prev.map(t => (t.id === tenantId ? { ...t, ...patch } : t));
      remoteTenantsRef.current = next;
      return next;
    });
    setTenants(prev => prev.map(t => (t.id === tenantId ? { ...t, ...patch } : t)));
    if (currentTenant.id === tenantId) {
      setCurrentTenant(prev => ({ ...prev, ...patch }));
    }
  };

  const retryRemotePayment = async (orderId: string): Promise<{ success: boolean; paymentId?: string; sandboxUrl?: string; wompiConfig?: unknown }> => {
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

  const submitOrderWithPayment = async (typeOrDetails: string | CheckoutDetails, method: PaymentMethod, transaction?: Transaction): Promise<{ success: boolean; isRemote?: boolean; orderId?: string; paymentId?: string; sandboxUrl?: string; wompiConfig?: unknown }> => {
    if (cart.length === 0) return { success: false };

    if (authMode === 'remote' && !currentUser?.email) {
      setOrderError('Debes iniciar sesión para realizar un pedido.');
      return { success: false };
    }

    setIsSubmittingOrder(true);
    setOrderError(null);

    const sourceTenants = authMode === 'remote' ? remoteTenants : tenants;
    const cartTenantId = cart[0]?.product?.tenantId;
    const orderTenant = (cartTenantId ? sourceTenants.find(t => t.id === cartTenantId) : undefined) || currentTenant;

    const subtotal = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);

    let fulfillment: OrderFulfillment = 'pickup';
    let typeString = 'Recoger en local';
    let customerName = currentUser?.name || 'Cliente Demo';
    let customerPhone = '';
    let deliveryAddress: CustomerDeliveryAddress | undefined = undefined;
    let tableNumber: string | undefined = undefined;
    let tableId: string | undefined = undefined;
    let tableToken: string | undefined = undefined;
    let restaurantNotes: string | undefined = undefined;
    let deliveryFeeApplied = 0;

    if (typeof typeOrDetails === 'object') {
      const details = typeOrDetails;
      fulfillment = details.fulfillment;
      customerName = details.customerName || customerName;
      customerPhone = details.customerPhone;
      deliveryAddress = details.deliveryAddress;
      tableNumber = details.tableNumber;
      tableId = details.tableId;
      tableToken = details.tableToken;
      restaurantNotes = details.restaurantNotes;

      if (fulfillment === 'pickup') {
        typeString = 'Recoger en local';
        deliveryFeeApplied = 0;
      } else if (fulfillment === 'restaurant_delivery') {
        typeString = 'Domicilio';
        deliveryFeeApplied = orderTenant.deliveryFee || 0;
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
        deliveryFeeApplied = orderTenant.deliveryFee || 0;
      } else {
        fulfillment = 'pickup';
      }
    }

    const calculatedTotal = subtotal + deliveryFeeApplied;
    
    // Preparar el pedido vinculado estrictamente al restaurante de los productos y al cliente actual
    const baseOrder: Order = {
      id: '',
      tenantId: orderTenant.id,
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
      customerId: currentUser?.id || currentUser?.email,
      customerName,
      customerPhone,
      deliveryAddress,
      tableNumber,
      tableId,
      tableToken,
      restaurantNotes
    };

    if (authMode === 'remote') {
      const res = await createLiveOrder(baseOrder);
      setIsSubmittingOrder(false);
      
      if (!res.success || !res.orderId) {
        setOrderError('No fue posible confirmar el pedido. Revisa los datos e inténtalo nuevamente.');
        return { success: false };
      }

      // Actualizar inmediatamente los pedidos del cliente autenticado
      if (currentUser?.id) {
        const updatedCustomerOrders = await fetchLiveOrdersForCustomer(currentUser.id);
        setOrders(updatedCustomerOrders.filter(o => o.customerId === currentUser.id));
      }
      
      if (method === 'cash') {
        clearCart();
        playChime();
        showToast(`¡Pedido enviado a ${orderTenant.name}! Paga en efectivo al personal.`);
        return { success: true, isRemote: true, orderId: res.orderId };
      }

      const paymentRes = await createRemotePayment(res.orderId, 'sandbox');
      setIsSubmittingOrder(false);

      if (!paymentRes.success) {
        setOrderError(paymentRes.error || 'El pedido se creó, pero falló la inicialización del pago remoto.');
        return { success: false };
      }

      clearCart();
      playChime();
      showToast(`¡Pedido (${typeString}) enviado a ${orderTenant.name}! Completa el pago seguro en la URL provista.`);
      
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
      const platformFee = Math.round(calculatedTotal * orderTenant.commissionRate);
      const restaurantPayout = calculatedTotal - platformFee;

      const normalizedTransaction: Transaction = {
        ...transaction,
        amount: calculatedTotal,
        tenantId: orderTenant.id,
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
      showToast(`¡Pedido (${typeString}) de $${calculatedTotal.toLocaleString('es-CO')} enviado a ${orderTenant.name}!`);
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
      const res = await updateLiveOrderStatus(orderId, status, targetOrder.tableId);
      if (!res.success) {
        showToast(res.error || 'No fue posible actualizar el pedido.');
        return false;
      }
    }

    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o));
    showToast(`Pedido #${orderId.slice(0, 8)} actualizado a ${status.toUpperCase()}`);
    return true;
  };

  const confirmCashPayment = async (paymentId: string, orderId: string): Promise<{ success: boolean; error?: string }> => {
    if (authMode === 'remote') {
      const res = await confirmCashPaymentRemote(paymentId, orderId);
      if (res.success) {
        setOrders(prev => prev.map(o => {
          if (o.id === orderId) {
            return {
              ...o,
              paymentStatus: 'approved',
              payments: (o as any).payments?.map((p: any) => p.id === paymentId ? { ...p, status: 'approved' } : p)
            };
          }
          return o;
        }));
        showToast('Pago en efectivo confirmado.');
      } else {
        showToast(res.error || 'Error al confirmar pago.');
      }
      return res;
    }
    showToast('El modo local no soporta esta acción.');
    return { success: false, error: 'Local mode not supported' };
  };

  const toggleProductAvailability = async (productId: string) => {
    const target = products.find(p => p.id === productId);
    if (!target) return;

    if (!isRestaurantOwner(currentUser) || !hasOwnershipOfTenant(currentUser, target.tenantId)) {
      showToast('⚠️ No tienes autorización para modificar productos de este restaurante.');
      return;
    }

    const updated = !target.available;

    if (authMode === 'remote') {
      const success = await updateLiveProduct(productId, { available: updated });
      if (!success) {
        showToast('⚠️ Error al actualizar disponibilidad en el servidor.');
        return;
      }
      setRemoteProducts(prev => prev.map(p => p.id === productId ? { ...p, available: updated } : p));
    }

    setProducts(prev => prev.map(p => {
      if (p.id === productId) {
        showToast(`${p.name}: ${updated ? 'Disponible' : 'AGOTADO'}`);
        return { ...p, available: updated };
      }
      return p;
    }));
  };

  const addProduct = async (newProd: Omit<Product, 'id' | 'tenantId'>): Promise<boolean> => {
    if (!isRestaurantOwner(currentUser) || !currentUser?.tenantId) {
      showToast('⚠️ No tienes autorización para agregar productos al menú.');
      return false;
    }
    const targetTenantId = currentUser.tenantId;

    if (authMode === 'remote') {
      const savedProd = await createLiveProduct(targetTenantId, newProd);
      if (!savedProd) {
        showToast('⚠️ Error al crear producto en el servidor. Verifica nombre, precio y categoría.');
        return false;
      }
      setRemoteProducts(prev => [savedProd, ...prev]);
      setProducts(prev => [savedProd, ...prev]);
      showToast(`Producto creado exitosamente: ${savedProd.name}`);
      return true;
    }

    const prod: Product = { ...newProd, id: `p${Date.now()}`, tenantId: targetTenantId };
    setProducts(prev => [prod, ...prev]);
    showToast(`Producto creado: ${prod.name}`);
    return true;
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

  const addComment = async (postId: string, text: string, _userName = 'Tú (Cliente)'): Promise<boolean> => {
    if (!currentUser) {
      showToast('⚠️ Inicia sesión para comentar.');
      return false;
    }
    if (authMode === 'remote') {
      if (!currentUser.id) {
        showToast('⚠️ Inicia sesión para comentar.');
        return false;
      }
      const newComment = await addRemoteComment(postId, currentUser.id, text, {
        name: currentUser.name,
        username: currentUser.username,
        avatarUrl: currentUser.avatarUrl
      });
      if (!newComment) {
        showToast('❌ No se pudo guardar el comentario.');
        return false;
      }
      setRemotePosts(prev => prev.map(p => {
        if (p.id === postId) {
          const updatedComments = [newComment, ...(p.comments || [])];
          return { ...p, comments: updatedComments, commentsCount: updatedComments.length };
        }
        return p;
      }));
      showToast('💬 Comentario publicado');
      return true;
    }
    // Modo demo
    setPosts(prev => prev.map(p => {
      if (p.id === postId) {
        const newComment = {
          id: `c_${Date.now()}`,
          postId,
          userId: currentUser.id || currentUser.email,
          userName: currentUser.name,
          userHandle: currentUser.username,
          userAvatar: currentUser.avatarUrl || '🥑',
          userAvatarUrl: currentUser.avatarUrl,
          text,
          timeAgo: 'Justo ahora',
          likes: 0
        };
        const updatedComments = [newComment, ...(p.comments || [])];
        return { ...p, comments: updatedComments, commentsCount: updatedComments.length };
      }
      return p;
    }));
    showToast('💬 Comentario publicado');
    return true;
  };

  const deleteComment = async (postId: string, commentId: string) => {
    if (!currentUser) {
      showToast('⚠️ Inicia sesión para gestionar comentarios.');
      return;
    }

    const sourceList = authMode === 'remote' ? remotePosts : posts;
    const targetPost = sourceList.find(p => p.id === postId);
    const targetComment = targetPost?.comments?.find(c => c.id === commentId);

    const isCommentAuthor = Boolean(
      targetComment && (
        (targetComment.userId && (targetComment.userId === currentUser.id || targetComment.userId === currentUser.email)) ||
        (!targetComment.userId && (
          targetComment.userName === currentUser.name ||
          (targetComment.userHandle && currentUser.username && targetComment.userHandle === currentUser.username) ||
          targetComment.userName === 'Tú (Cliente)'
        ))
      )
    );

    const isPostRestaurant = Boolean(
      targetPost &&
      currentUser.tenantId &&
      currentUser.tenantId === targetPost.tenantId &&
      (currentUser.businessRole === 'restaurant_owner' ||
       currentUser.businessRole === 'restaurant_staff' ||
       currentUser.role === 'admin' ||
       currentUser.role === 'kitchen')
    );

    if (!isCommentAuthor && !isPostRestaurant) {
      showToast('❌ Solo el autor del comentario o el restaurante pueden eliminarlo.');
      return;
    }

    if (authMode === 'remote' && currentUser?.id) {
      const ok = await deleteRemoteComment(commentId, currentUser.id);
      if (!ok) {
        showToast('❌ No tienes permiso para eliminar este comentario.');
        return;
      }
      setRemotePosts(prev => prev.map(p => {
        if (p.id === postId) {
          const updatedComments = (p.comments || []).filter(c => c.id !== commentId);
          return { ...p, comments: updatedComments, commentsCount: updatedComments.length };
        }
        return p;
      }));
      showToast('🗑️ Comentario eliminado');
      return;
    }
    // Modo demo
    setPosts(prev => prev.map(p => {
      if (p.id === postId) {
        const updatedComments = (p.comments || []).filter(c => c.id !== commentId);
        return { ...p, comments: updatedComments, commentsCount: updatedComments.length };
      }
      return p;
    }));
    showToast('🗑️ Comentario eliminado');
  };

  const createPost = async (postData: Omit<Post, 'id' | 'likes' | 'isLiked' | 'commentsCount' | 'viewCount' | 'ordersFromPost' | 'timeAgo'>): Promise<boolean> => {
    if (!isRestaurantOwner(currentUser) || !currentUser?.tenantId) {
      showToast('⚠️ No tienes autorización para publicar contenido.');
      return false;
    }
    const targetTenantId = currentUser.tenantId;
    const targetTenant = tenants.find(t => t.id === targetTenantId);
    if (!targetTenant) {
      showToast('⚠️ Restaurante no encontrado.');
      return false;
    }

    if (authMode === 'remote') {
      const savedPost = await createLivePost(targetTenantId, postData.dishName, postData.desc, postData.price, postData.image || '', postData.mediaType || 'photo', postData.productId, postData.width, postData.height, postData.hashtags);
      if (!savedPost) {
        showToast('⚠️ Error al crear publicación en el servidor.');
        return false;
      }
      const fullPost: Post = {
        ...savedPost,
        tenantName: targetTenant.name,
        tenantCategory: targetTenant.category,
        tenantLogoEmoji: targetTenant.logoEmoji || '🍽️',
        tenantAddress: targetTenant.address,
        dishName: postData.dishName,
        dishEmoji: postData.dishEmoji || '🍽️',
        // mapDbPostToPost devuelve timeAgo ISO y sin comments: se corrigen para el render inmediato.
        timeAgo: 'Hace un momento',
        comments: []
      };
      setRemotePosts(prev => [fullPost, ...prev]);
      setPosts(prev => [fullPost, ...prev]);
      showToast('✨ ¡Tu publicación ya está en vivo en el Feed!');
      return true;
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
    return true;
  };

  const deletePost = async (postId: string) => {
    const target = posts.find(p => p.id === postId);
    if (!target) return;

    if (!isRestaurantOwner(currentUser) || !hasOwnershipOfTenant(currentUser, target.tenantId)) {
      showToast('⚠️ No tienes autorización para eliminar publicaciones de este restaurante.');
      return;
    }

    if (authMode === 'remote') {
      const res = await deleteLivePost(postId, target.tenantId);
      if (!res.success) {
        showToast(`⚠️ ${res.error || 'Error al eliminar publicación en el servidor.'}`);
        return;
      }
      setRemotePosts(prev => prev.filter(p => p.id !== postId));
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

  const updateProduct = async (productId: string, updates: Partial<Product>) => {
    const target = products.find(p => p.id === productId);
    if (!target) return;

    if (!isRestaurantOwner(currentUser) || !hasOwnershipOfTenant(currentUser, target.tenantId)) {
      showToast('⚠️ No tienes autorización para editar productos de este restaurante.');
      return;
    }

    if (authMode === 'remote') {
      const updatedProd = await updateLiveProduct(productId, updates);
      if (!updatedProd) {
        showToast('⚠️ Error al actualizar producto en el servidor.');
        return;
      }
      setRemoteProducts(prev => prev.map(p => p.id === productId ? updatedProd : p));
      setProducts(prev => prev.map(p => p.id === productId ? updatedProd : p));
      showToast(`Producto actualizado exitosamente.`);
      return;
    }

    setProducts(prev => prev.map(p => p.id === productId ? { ...p, ...updates } : p));
    showToast(`Producto actualizado localmente.`);
  };

  const deleteProduct = async (productId: string) => {
    const target = products.find(p => p.id === productId);
    if (!target) return;

    if (!isRestaurantOwner(currentUser) || !hasOwnershipOfTenant(currentUser, target.tenantId)) {
      showToast('⚠️ No tienes autorización para eliminar productos de este restaurante.');
      return;
    }

    if (authMode === 'remote') {
      const success = await deleteLiveProduct(productId);
      if (!success) {
        showToast('⚠️ Error al eliminar producto en el servidor.');
        return;
      }
      setRemoteProducts(prev => prev.filter(p => p.id !== productId));
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

  const submitRestaurantApplication = async (
    applicationData: Omit<RestaurantApplication, 'id' | 'submittedAt' | 'status'>,
    assets?: ApplicationAssetFiles
  ): Promise<boolean> => {
    if (applicationData.commissionRateAccepted === undefined) {
      showToast('⚠️ Debes aceptar los términos y la comisión de la plataforma para enviar la solicitud.');
      return false;
    }
    if (
      !applicationData.ownerName?.trim() ||
      !applicationData.ownerEmail?.trim() ||
      !applicationData.ownerPhone?.trim() ||
      !applicationData.restaurantName?.trim() ||
      !applicationData.category?.trim() ||
      !applicationData.cityId?.trim() ||
      !applicationData.zoneId?.trim() ||
      !applicationData.address?.trim() ||
      !applicationData.deliveryModes ||
      applicationData.deliveryModes.length === 0
    ) {
      showToast('⚠️ Por favor completa todos los campos requeridos y selecciona ciudad y zona válidas.');
      return false;
    }

    const normalizedEmail = applicationData.ownerEmail.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      showToast('⚠️ Ingresa un correo electrónico de contacto con formato válido.');
      return false;
    }

    const foundCity = cities.find(c => c.id === applicationData.cityId && c.isActive);
    if (!foundCity) {
      showToast('⚠️ La ciudad seleccionada no es válida o no está activa.');
      return false;
    }

    const foundZone = zones.find(
      z => z.id === applicationData.zoneId && z.isActive && z.cityId === applicationData.cityId
    );
    if (!foundZone) {
      showToast('⚠️ La zona seleccionada no es válida o no pertenece a la ciudad elegida.');
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
      cityId: applicationData.cityId,
      zoneId: applicationData.zoneId,
      whatsapp: applicationData.whatsapp?.trim(),
      notes: applicationData.notes?.trim(),
      deliveryFee: finalDeliveryFee,
      deliveryRadiusKm: finalDeliveryRadiusKm,
      id: `app_${Date.now()}`,
      submittedAt: Date.now(),
      status: 'submitted'
    };

    let assetWarning: string | undefined;

    if (isSupabaseConfigured) {
      try {
        const result = await submitLiveApplication(newApp);
        if (!result.ok) {
          showToast(`⚠️ ${result.message}`);
          return false; // Stop the flow, do not add fake app
        }

        const finalApp = result.application;

        // Imágenes (opcionales): se suben DESPUÉS de crear la solicitud, con URLs firmadas.
        // Si fallan, la solicitud ya es válida y solo se avisa al usuario.
        if (assets && (assets.logo || assets.banner)) {
          const assetResult = await uploadApplicationAssets(finalApp.id, assets);
          if (assetResult.error) assetWarning = assetResult.error;
        }

        // Success! Only save the real App
        setRestaurantApplications(prev => [finalApp, ...prev]);
      } catch (err) {
        console.warn('⚠️ No se pudo enviar la solicitud a Supabase:', err);
        showToast('⚠️ Hubo un error inesperado al conectar con el servidor.');
        return false;
      }
    } else {
      // Local demo mode
      setRestaurantApplications(prev => [newApp, ...prev]);
    }

    showToast(
      assetWarning
        ? `📝 Solicitud recibida, pero las imágenes no se guardaron: ${assetWarning}`
        : '📝 ¡Solicitud recibida! Quedará pendiente de revisión antes de activar el restaurante.'
    );
    return true;
  };

  const reviewRestaurantApplication = async (
    applicationId: string,
    nextStatus: 'reviewing' | 'approved' | 'rejected',
    reviewNote?: string
  ): Promise<boolean> => {
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

    if (authMode === 'remote' && isSupabaseConfigured && currentUser?.id) {
      // In remote mode, persist to Supabase FIRST
      const success = await updateLiveApplicationStatus(applicationId, nextStatus, currentUser.id, reviewNote);
      if (!success) {
        showToast('⚠️ Error al actualizar el estado en el servidor. Inténtalo nuevamente.');
        return false;
      }
    }

    const reviewerEmail = currentUser.email;
    const now = Date.now();

    setRestaurantApplications(prev => prev.map(app => {
      if (app.id === applicationId) {
        return {
          ...app,
          status: nextStatus,
          reviewedAt: now,
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
  ): Promise<{ success: boolean; tenantId?: string; error?: string; message?: string }> => {
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

    if (!supabase || !isSupabaseConfigured) {
      const err = '⚠️ La activación de restaurantes requiere conexión con Supabase (no disponible en modo demo).';
      showToast(err);
      return { success: false, error: err };
    }

    showToast('⏳ Conectando con Supabase para crear restaurante y activar acceso del propietario...');
    
    try {
      let activatedTenantId: string | undefined;
      let apiMsg: string | undefined;

      // 1) Intentar primero mediante el RPC atómico en PostgreSQL (crea restaurante + restaurant_members activo + perfil restaurant_owner)
      const { data: rpcRaw, error: rpcError } = await supabase.rpc('activate_approved_restaurant_rpc', {
        p_application_id: targetApp.id
      });

      const rpcData = rpcRaw as {
        success?: boolean;
        error?: string;
        tenantId?: string;
        message?: string;
        needs_invite?: boolean;
      } | null;

      if (!rpcError && rpcData?.success && rpcData.tenantId && !rpcData.needs_invite) {
        activatedTenantId = rpcData.tenantId;
        apiMsg = rpcData.message;
      } else {
        // 2) Si el propietario aún no tiene usuario en auth.users (needs_invite) o el RPC requiere Edge Function, invocar approve_restaurant
        const { data, error } = await supabase.functions.invoke('approve_restaurant', {
          body: { applicationId: targetApp.id }
        });

        if (error) {
          if (rpcData?.success && rpcData.tenantId) {
            activatedTenantId = rpcData.tenantId;
            apiMsg = rpcData.message;
          } else {
            throw error;
          }
        } else if (data?.error) {
          if (rpcData?.success && rpcData.tenantId) {
            activatedTenantId = rpcData.tenantId;
            apiMsg = rpcData.message;
          } else {
            throw new Error(data.error);
          }
        } else {
          activatedTenantId = data?.tenantId || rpcData?.tenantId;
          apiMsg = data?.message || rpcData?.message;
        }
      }

      const reviewerEmail = currentUser.email;

      setRestaurantApplications(prev => prev.map(app => {
        if (app.id === applicationId) {
          return {
            ...app,
            activatedAt: Date.now(),
            activatedByEmail: reviewerEmail,
            activatedTenantId: activatedTenantId || 'created_in_db'
          };
        }
        return app;
      }));

      const liveTenants = await fetchLiveTenants();
      if (liveTenants && liveTenants.length > 0) {
        setTenants(liveTenants);
        setRemoteTenants(liveTenants);
      }

      const finalMsg = apiMsg || `¡Restaurante "${targetApp.restaurantName}" creado exitosamente!`;
      showToast(`🎉 ${finalMsg}`);
      return { success: true, message: finalMsg, tenantId: activatedTenantId };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al procesar la activación en la nube.';
      showToast(`⚠️ ${msg}`);
      return { success: false, error: msg };
    }
  };

  const activeTenants = authMode === 'remote' ? remoteTenants : tenants;
  const activeProducts = authMode === 'remote' ? remoteProducts : products;
  const activePosts = authMode === 'remote' ? remotePosts : posts;
  const scopedOrders = !currentUser
    ? []
    : (currentUser.tenantId &&
        (currentUser.businessRole === 'restaurant_owner' ||
          currentUser.businessRole === 'restaurant_staff' ||
          currentUser.role === 'admin' ||
          currentUser.role === 'kitchen'))
      ? orders.filter(o => o.tenantId === currentUser.tenantId)
      : currentUser.businessRole === 'platform_admin'
        ? orders
        : orders.filter(
            o =>
              (Boolean(currentUser.id) && o.customerId === currentUser.id) ||
              (Boolean(currentUser.email) && o.customerId === currentUser.email)
          );

  return (
    <AppContext.Provider value={{
      cities,
      zones,
      selectedCityId,
      selectedZoneId,
      userLocationState,
      locationPreference,
      setSelectedCity,
      setSelectedZone,
      refreshCities,
      refreshZones,
      requestUserLocation,
      clearUserLocation,
      resolveCityFromCoordinates,
      switchToManualLocation,
      tenants: activeTenants,
      currentTenant,
      products: activeProducts,
      orders: scopedOrders,
      transactions,
      posts: activePosts,
      stories,
      cart,
      drivers,
      equityWeight,
      authMode,
      emailVerificationState,
      pendingVerificationEmail,
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
      updateUserProfile,
      resendVerificationEmail,
      refreshEmailVerification,
      signOutUnverifiedUser,
      sendPasswordReset,
      setCurrentTenantBySlug,
      toggleTenantOpenStatus,
      addTenant,
      updateTenant,
      syncTenantRating,
      toggleLikePost,
      addComment,
      createPost,
      deletePost,
      addDriver,
      deleteProduct,
      setEquityWeight: updateEquityWeight,
      addToCart,
      clearCartAndAdd,
      removeFromCart,
      clearCart,
      submitOrderWithPayment,
      retryRemotePayment,
      updateOrderStatus,
      confirmCashPayment,
      toggleProductAvailability,
      addProduct,
      updateProduct,
      assignDriverToOrder,
      submitRestaurantApplication,
      reviewRestaurantApplication,
      activateApprovedRestaurant,
      deleteComment,
      showToast,
      triggerTestOrder,
      fetchRestaurantMembers,
      inviteRestaurantStaff,
      resendStaffInvitation,
      suspendRestaurantMember,
      reactivateRestaurantMember,
      revokeRestaurantMember,
      acceptRestaurantInvitation,
      logout
    }}>
      {children}

      {cartConflict && (
        <div className="modal-overlay" style={{ zIndex: 99999 }}>
          <div className="modal-content" style={{ maxWidth: '400px', textAlign: 'center' }}>
            <h3 style={{ marginTop: 0, fontWeight: 900, color: 'var(--text-main)' }}>⚠️ Cambio de Restaurante</h3>
            <p style={{ color: 'var(--text-muted)' }}>
              Tu carrito actual tiene productos de <strong>{cartConflict.activeTenantName}</strong>. 
              <br /><br />
              ¿Deseas vaciar tu carrito actual para agregar productos de <strong>{tenants.find(t => t.id === cartConflict.pendingProduct?.tenantId)?.name}</strong>?
            </p>
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button 
                className="btn btn-outline" 
                style={{ flex: 1 }}
                onClick={() => setCartConflict(null)}
              >
                Cancelar
              </button>
              <button 
                className="btn btn-primary" 
                style={{ flex: 1, background: 'var(--danger)', color: 'white', border: 'none' }}
                onClick={() => {
                  if (cartConflict.pendingProduct) {
                    clearCartAndAdd(cartConflict.pendingProduct);
                    const newTenant = tenants.find(t => t.id === cartConflict.pendingProduct!.tenantId);
                    if (newTenant) setCurrentTenant(newTenant);
                  }
                  setCartConflict(null);
                }}
              >
                Vaciar y Agregar
              </button>
            </div>
          </div>
        </div>
      )}
    </AppContext.Provider>
  );
};


