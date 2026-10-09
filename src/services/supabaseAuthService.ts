export { isSupabaseConfigured } from '../lib/supabase';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { UserAccount, UserRegistrationOptions } from '../types';
import { normalizeUsername } from '../utils/formValidation';

export type SupabaseAuthMode = 'remote' | 'demo';
export type AuthUser = UserAccount;
export type AuthError = unknown;

export interface AuthActionResult {
  success: boolean;
  user?: AuthUser;
  error?: string;
  sessionExists?: boolean;
  emailConfirmed?: boolean;
}

const LOCAL_PROFILES_CACHE_KEY = 'gs_user_profiles_cache_v1';

interface CachedProfileExtras {
  name?: string;
  username?: string;
  avatarUrl?: string;
  phone?: string;
  defaultAddress?: string;
  defaultDeliveryNotes?: string;
}

export function getLocalProfileCache(key: string): CachedProfileExtras | null {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(LOCAL_PROFILES_CACHE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, CachedProfileExtras>;
    return map[key.toLowerCase()] || null;
  } catch {
    return null;
  }
}

export function saveLocalProfileCache(keys: string[], extras: CachedProfileExtras): void {
  try {
    const raw = localStorage.getItem(LOCAL_PROFILES_CACHE_KEY);
    const map: Record<string, CachedProfileExtras> = raw ? JSON.parse(raw) : {};
    for (const k of keys) {
      if (!k) continue;
      const norm = k.toLowerCase();
      map[norm] = { ...(map[norm] || {}), ...extras };
    }
    localStorage.setItem(LOCAL_PROFILES_CACHE_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage quota errors
  }
}

export async function uploadUserAvatarToStorage(userId: string, file: File): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase || !userId) return null;
  try {
    const ext = file.name.split('.').pop() || 'webp';
    const path = `avatars/${userId}/avatar_${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('gastro-media')
      .upload(path, file, { upsert: true, contentType: file.type || 'image/webp' });
    if (uploadError) {
      console.warn('⚠️ No se pudo subir el avatar al bucket gastro-media:', uploadError.message);
      return null;
    }
    const { data } = supabase.storage.from('gastro-media').getPublicUrl(path);
    return data?.publicUrl || null;
  } catch (err) {
    console.warn('⚠️ Excepción subiendo avatar:', err);
    return null;
  }
}

/**
 * Servicio de Autenticación de Producción con Supabase Auth.
 * Proporciona métodos para inicio de sesión, registro, OAuth de Google,
 * recuperación de contraseña y resolución de roles desde la base de datos PostgreSQL.
 */

/**
 * Traduce mensajes de error estándar de Supabase al español para una mejor UX.
 */
export function translateAuthError(errMessage: string): string {
  const msg = errMessage.toLowerCase();
  if (msg.includes('invalid login credentials') || msg.includes('invalid credentials')) {
    return 'Correo o contraseña incorrectos.';
  }
  if (msg.includes('user already registered') || msg.includes('already exists') || msg.includes('already been registered')) {
    return 'Ya existe una cuenta con este correo. Inicia sesión.';
  }
  if (msg.includes('idx_profiles_username_lower_unique') || msg.includes('profiles_username')) {
    return 'Ese usuario @ ya está en uso. Elige otro distinto.';
  }
  if (msg.includes('email not confirmed')) {
    return 'Confirma tu correo antes de entrar.';
  }
  if (msg.includes('password should be at least') || msg.includes('weak password') || msg.includes('password is known to be weak')) {
    return 'La contraseña es demasiado débil. Usa al menos 8 caracteres combinando letras y números.';
  }
  if (msg.includes('unable to validate email address') || msg.includes('invalid email')) {
    return 'El formato de correo electrónico no es válido.';
  }
  if (msg.includes('email rate limit exceeded') || msg.includes('over_email_send_rate_limit') || msg.includes('for security purposes, you can only request this')) {
    return 'Se ha superado el límite de envíos de correo. Intenta de nuevo en unos minutos.';
  }
  if (msg.includes('too many requests') || msg.includes('rate limit')) {
    return 'Demasiados intentos seguidos. Espera un momento antes de volver a intentar.';
  }
  if (msg.includes('user not found')) {
    return 'No encontramos una cuenta asociada a este correo.';
  }
  if (msg.includes(' signup is disabled') || msg.includes('signups not allowed')) {
    return 'El registro de nuevas cuentas está deshabilitado temporalmente.';
  }
  if (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('network request failed')) {
    return 'Error de conexión. Verifica tu internet e inténtalo de nuevo.';
  }
  return errMessage || 'Ocurrió un error inesperado al procesar la autenticación.';
}

/**
 * Consulta las tablas `public.profiles` y `public.restaurant_members`
 * para determinar el rol y datos de perfil (@username, avatar, teléfono, dirección) del usuario.
 */
export async function resolveSupabaseUserProfile(userId: string, email: string, needsPasswordSet?: boolean): Promise<UserAccount> {
  const cached = getLocalProfileCache(userId) || getLocalProfileCache(email);

  if (!isSupabaseConfigured || !supabase) {
    return {
      id: userId,
      email,
      name: cached?.name || email.split('@')[0],
      username: cached?.username,
      avatarUrl: cached?.avatarUrl,
      phone: cached?.phone,
      defaultAddress: cached?.defaultAddress,
      defaultDeliveryNotes: cached?.defaultDeliveryNotes,
      role: 'client_delivery',
      businessRole: 'customer',
      needsPasswordSet
    };
  }

  try {
    // 0. Leer metadatos del usuario autenticado (fallback inmediato)
    const { data: authUserData } = await supabase.auth.getUser();
    const meta = authUserData?.user?.id === userId ? (authUserData.user.user_metadata || {}) : {};

    // 0b. Sincronizar / aprovisionar membresía de restaurante vía RPC SECURITY DEFINER
    interface OwnerProvisionRpcResult {
      is_member?: boolean;
      tenant_id?: string;
      member_role?: string;
      business_role?: string;
      full_name?: string;
    }
    let rpcMemberInfo: OwnerProvisionRpcResult | null = null;
    try {
      const { data: rpcData } = await supabase.rpc('resolve_or_provision_restaurant_owner');
      if (rpcData && typeof rpcData === 'object') {
        rpcMemberInfo = rpcData as OwnerProvisionRpcResult;
      }
    } catch {
      // Continuar con las consultas directas si el RPC no está disponible
    }

    // 1. Obtener perfil general (con columnas extendidas de las migraciones 015 y 042)
    let profile: {
      full_name?: string;
      platform_role?: string;
      business_role?: string | null;
      tenant_id?: string | null;
      username?: string | null;
      avatar_url?: string | null;
      phone?: string | null;
      default_address?: string | null;
      default_delivery_notes?: string | null;
    } | null = null;

    const { data: extProfile, error: extErr } = await supabase
      .from('profiles')
      .select('full_name, platform_role, business_role, tenant_id, username, avatar_url, phone, default_address, default_delivery_notes')
      .eq('id', userId)
      .maybeSingle();

    if (!extErr) {
      profile = extProfile;
    } else {
      const { data: basicProfile } = await supabase
        .from('profiles')
        .select('full_name, platform_role, business_role, tenant_id')
        .eq('id', userId)
        .maybeSingle();
      profile = basicProfile;
    }

    const rawProfileName = profile?.full_name && !profile.full_name.includes('@') ? profile.full_name : undefined;
    const fullName =
      rawProfileName ||
      rpcMemberInfo?.full_name ||
      (typeof meta.full_name === 'string' && meta.full_name.trim() ? meta.full_name : '') ||
      profile?.full_name ||
      cached?.name ||
      email.split('@')[0];
    const platformRole = profile?.platform_role || 'customer';
    const username = profile?.username || (typeof meta.username === 'string' ? meta.username : undefined) || cached?.username;
    const avatarUrl = profile?.avatar_url || (typeof meta.avatar_url === 'string' ? meta.avatar_url : undefined) || cached?.avatarUrl;
    const phone = profile?.phone || (typeof meta.phone === 'string' ? meta.phone : undefined) || cached?.phone;
    const defaultAddress = profile?.default_address || (typeof meta.default_address === 'string' ? meta.default_address : undefined) || cached?.defaultAddress;
    const defaultDeliveryNotes = profile?.default_delivery_notes || (typeof meta.default_delivery_notes === 'string' ? meta.default_delivery_notes : undefined) || cached?.defaultDeliveryNotes;

    const commonExtras = {
      name: fullName,
      username: username || undefined,
      avatarUrl: avatarUrl || undefined,
      phone: phone || undefined,
      defaultAddress: defaultAddress || undefined,
      defaultDeliveryNotes: defaultDeliveryNotes || undefined
    };

    saveLocalProfileCache([userId, email], commonExtras);

    if (platformRole === 'platform_admin') {
      return {
        id: userId,
        email,
        ...commonExtras,
        role: 'platform_admin',
        businessRole: 'platform_admin',
        needsPasswordSet
      };
    }

    // 2. Verificar si es miembro de algún restaurante (Dueño / Staff)
    if (rpcMemberInfo?.is_member && rpcMemberInfo.tenant_id) {
      const isOwner = rpcMemberInfo.member_role === 'owner' || rpcMemberInfo.business_role === 'restaurant_owner';
      return {
        id: userId,
        email,
        ...commonExtras,
        role: isOwner ? 'admin' : 'kitchen',
        businessRole: isOwner ? 'restaurant_owner' : 'restaurant_staff',
        tenantId: rpcMemberInfo.tenant_id,
        needsPasswordSet
      };
    }

    const { data: members } = await supabase
      .from('restaurant_members')
      .select('restaurant_id, role, status')
      .eq('user_id', userId)
      .or('status.eq.active,status.is.null')
      .order('created_at', { ascending: false })
      .limit(5);

    const member = members?.find(m => m.role === 'owner') || members?.[0] || null;

    if (member && member.restaurant_id) {
      if (member.role === 'owner') {
        return {
          id: userId,
          email,
          ...commonExtras,
          role: 'admin',
          businessRole: 'restaurant_owner',
          tenantId: member.restaurant_id,
          needsPasswordSet
        };
      } else {
        return {
          id: userId,
          email,
          ...commonExtras,
          role: 'kitchen',
          businessRole: 'restaurant_staff',
          tenantId: member.restaurant_id,
          needsPasswordSet
        };
      }
    }

    // 3. Fallback: Verificar si es dueño directo en public.restaurants o en public.profiles
    const { data: ownedRestaurants } = await supabase
      .from('restaurants')
      .select('id')
      .eq('owner_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1);

    const ownedTenantId = ownedRestaurants?.[0]?.id || (profile?.business_role === 'restaurant_owner' ? profile.tenant_id : null);
    if (ownedTenantId) {
      return {
        id: userId,
        email,
        ...commonExtras,
        role: 'admin',
        businessRole: 'restaurant_owner',
        tenantId: ownedTenantId,
        needsPasswordSet
      };
    }

    if (profile?.business_role === 'restaurant_staff' && profile.tenant_id) {
      return {
        id: userId,
        email,
        ...commonExtras,
        role: 'kitchen',
        businessRole: 'restaurant_staff',
        tenantId: profile.tenant_id,
        needsPasswordSet
      };
    }

    // Default: Cliente final de entregas
    return {
      id: userId,
      email,
      ...commonExtras,
      role: 'client_delivery',
      businessRole: 'customer',
      needsPasswordSet
    };
  } catch (err: unknown) {
    console.warn('⚠️ Error al resolver perfil de Supabase:', err);
    return {
      id: userId,
      email,
      name: cached?.name || email.split('@')[0],
      username: cached?.username,
      avatarUrl: cached?.avatarUrl,
      phone: cached?.phone,
      defaultAddress: cached?.defaultAddress,
      defaultDeliveryNotes: cached?.defaultDeliveryNotes,
      role: 'client_delivery',
      businessRole: 'customer',
      needsPasswordSet
    };
  }
}

/**
 * Inicia sesión con correo y contraseña en Supabase Auth.
 */
export async function signInWithSupabase(email: string, pass: string): Promise<AuthActionResult> {
  if (!isSupabaseConfigured || !supabase) {
    return { success: false, error: 'Supabase no está configurado.' };
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password: pass
    });

    if (error || !data.user) {
      return { success: false, error: translateAuthError(error?.message || '') };
    }

    const userAccount = await resolveSupabaseUserProfile(data.user.id, data.user.email || email, data.user.user_metadata?.needs_password_set);
    return { 
      success: true, 
      user: userAccount,
      sessionExists: !!data.session,
      emailConfirmed: !!data.user.email_confirmed_at
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: translateAuthError(msg) };
  }
}

/**
 * Registra un nuevo usuario cliente en Supabase Auth y crea su perfil enriquecido en `public.profiles`.
 */
export async function signUpWithSupabase(
  email: string,
  pass: string,
  fullName: string,
  options?: UserRegistrationOptions
): Promise<AuthActionResult> {
  if (!isSupabaseConfigured || !supabase) {
    return { success: false, error: 'Supabase no está configurado.' };
  }

  try {
    const normalizedEmail = email.trim().toLowerCase();
    const cleanName = fullName.trim() || 'Cliente GastroSync';
    const cleanUsername = options?.username ? normalizeUsername(options.username) : undefined;
    const cleanPhone = options?.phone?.trim() || undefined;
    const cleanAddress = options?.defaultAddress?.trim() || undefined;
    const cleanNotes = options?.defaultDeliveryNotes?.trim() || undefined;
    let finalAvatarUrl = options?.avatarDataUrl || undefined;

    // Verificar disponibilidad del @username si se especificó
    if (cleanUsername) {
      const { data: existingHandle } = await supabase
        .from('profiles')
        .select('id')
        .ilike('username', cleanUsername)
        .maybeSingle();

      if (existingHandle) {
        return {
          success: false,
          error: `El usuario @${cleanUsername} ya está registrado. Prueba con otro @.`
        };
      }
    }

    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password: pass,
      options: {
        data: {
          full_name: cleanName,
          username: cleanUsername || null,
          avatar_url: finalAvatarUrl || null,
          phone: cleanPhone || null,
          default_address: cleanAddress || null,
          default_delivery_notes: cleanNotes || null
        }
      }
    });

    if (error || !data.user) {
      return { success: false, error: translateAuthError(error?.message || '') };
    }

    // Si hay sesión activa y archivo de avatar, subir al bucket gastro-media
    if (data.session && options?.avatarFile) {
      const uploadedUrl = await uploadUserAvatarToStorage(data.user.id, options.avatarFile);
      if (uploadedUrl) {
        finalAvatarUrl = uploadedUrl;
      }
    }

    // Upsert en public.profiles (si hay sesión activa)
    const { error: upsertErr } = await supabase.from('profiles').upsert({
      id: data.user.id,
      full_name: cleanName,
      username: cleanUsername || null,
      avatar_url: finalAvatarUrl || null,
      phone: cleanPhone || null,
      default_address: cleanAddress || null,
      default_delivery_notes: cleanNotes || null,
      platform_role: 'customer'
    });

    if (upsertErr) {
      // Fallback en caso de que la tabla no acepte algún campo opcional
      await supabase.from('profiles').upsert({
        id: data.user.id,
        full_name: cleanName,
        platform_role: 'customer'
      });
    }

    saveLocalProfileCache([data.user.id, normalizedEmail], {
      name: cleanName,
      username: cleanUsername,
      avatarUrl: finalAvatarUrl,
      phone: cleanPhone,
      defaultAddress: cleanAddress,
      defaultDeliveryNotes: cleanNotes
    });

    const userAccount: UserAccount = data.session
      ? await resolveSupabaseUserProfile(data.user.id, normalizedEmail)
      : {
          id: data.user.id,
          email: normalizedEmail,
          name: cleanName,
          username: cleanUsername,
          avatarUrl: finalAvatarUrl,
          phone: cleanPhone,
          defaultAddress: cleanAddress,
          defaultDeliveryNotes: cleanNotes,
          role: 'client_delivery',
          businessRole: 'customer'
        };

    return { 
      success: true, 
      user: userAccount,
      sessionExists: !!data.session,
      emailConfirmed: !!data.user.email_confirmed_at
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: translateAuthError(msg) };
  }
}

/**
 * Actualiza los datos de perfil del usuario (@username, avatar, teléfono, dirección habitual).
 */
export async function updateSupabaseUserProfile(
  userId: string,
  email: string,
  updates: {
    name?: string;
    username?: string;
    phone?: string;
    defaultAddress?: string;
    defaultDeliveryNotes?: string;
    avatarUrl?: string;
  },
  avatarFile?: File | null
): Promise<{ success: boolean; avatarUrl?: string; error?: string }> {
  const cleanUsername = updates.username !== undefined ? normalizeUsername(updates.username) : undefined;
  let finalAvatarUrl = updates.avatarUrl;

  if (isSupabaseConfigured && supabase && userId) {
    try {
      if (cleanUsername) {
        const { data: existingHandle } = await supabase
          .from('profiles')
          .select('id')
          .ilike('username', cleanUsername)
          .neq('id', userId)
          .maybeSingle();

        if (existingHandle) {
          return {
            success: false,
            error: `El usuario @${cleanUsername} ya está en uso por otra cuenta.`
          };
        }
      }

      if (avatarFile) {
        const uploaded = await uploadUserAvatarToStorage(userId, avatarFile);
        if (uploaded) {
          finalAvatarUrl = uploaded;
        }
      }

      const dbPayload: Record<string, unknown> = {
        updated_at: new Date().toISOString()
      };
      if (updates.name !== undefined) dbPayload.full_name = updates.name.trim();
      if (cleanUsername !== undefined) dbPayload.username = cleanUsername || null;
      if (finalAvatarUrl !== undefined) dbPayload.avatar_url = finalAvatarUrl || null;
      if (updates.phone !== undefined) dbPayload.phone = updates.phone.trim() || null;
      if (updates.defaultAddress !== undefined) dbPayload.default_address = updates.defaultAddress.trim() || null;
      if (updates.defaultDeliveryNotes !== undefined) dbPayload.default_delivery_notes = updates.defaultDeliveryNotes.trim() || null;

      const { data: updatedRows, error } = await supabase
        .from('profiles')
        .update(dbPayload)
        .eq('id', userId)
        .select('id');

      if (error) {
        return { success: false, error: translateAuthError(error.message) };
      }

      if (!updatedRows || updatedRows.length === 0) {
        const { error: upsertErr } = await supabase
          .from('profiles')
          .upsert({
            id: userId,
            full_name: updates.name?.trim() || email.split('@')[0],
            platform_role: 'customer',
            ...dbPayload
          });
        if (upsertErr) {
          return { success: false, error: translateAuthError(upsertErr.message) };
        }
      }

      // Sincronizar snapshot de autor en reseñas previas del usuario
      const reviewAuthorPatch: Record<string, unknown> = {};
      if (updates.name !== undefined) reviewAuthorPatch.author_name = updates.name.trim() || null;
      if (cleanUsername !== undefined) reviewAuthorPatch.author_username = cleanUsername || null;
      if (finalAvatarUrl !== undefined) reviewAuthorPatch.author_avatar_url = finalAvatarUrl || null;
      if (Object.keys(reviewAuthorPatch).length > 0) {
        await supabase
          .from('restaurant_reviews')
          .update(reviewAuthorPatch)
          .eq('user_id', userId);
      }

      await supabase.auth.updateUser({
        data: {
          ...(updates.name !== undefined ? { full_name: updates.name.trim() } : {}),
          ...(cleanUsername !== undefined ? { username: cleanUsername || null } : {}),
          ...(finalAvatarUrl !== undefined ? { avatar_url: finalAvatarUrl || null } : {}),
          ...(updates.phone !== undefined ? { phone: updates.phone.trim() || null } : {}),
          ...(updates.defaultAddress !== undefined ? { default_address: updates.defaultAddress.trim() || null } : {}),
          ...(updates.defaultDeliveryNotes !== undefined ? { default_delivery_notes: updates.defaultDeliveryNotes.trim() || null } : {})
        }
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: translateAuthError(msg) };
    }
  }

  saveLocalProfileCache([userId, email], {
    ...(updates.name !== undefined ? { name: updates.name.trim() } : {}),
    ...(cleanUsername !== undefined ? { username: cleanUsername } : {}),
    ...(finalAvatarUrl !== undefined ? { avatarUrl: finalAvatarUrl } : {}),
    ...(updates.phone !== undefined ? { phone: updates.phone.trim() } : {}),
    ...(updates.defaultAddress !== undefined ? { defaultAddress: updates.defaultAddress.trim() } : {}),
    ...(updates.defaultDeliveryNotes !== undefined ? { defaultDeliveryNotes: updates.defaultDeliveryNotes.trim() } : {})
  });

  return { success: true, avatarUrl: finalAvatarUrl };
}

/**
 * Inicia el flujo OAuth con Google a través de Supabase.
 */
export async function signInWithGoogleOAuth(): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured || !supabase) {
    return { success: false, error: 'Supabase no está configurado.' };
  }

  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    });

    if (error) {
      return { success: false, error: translateAuthError(error.message) };
    }

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: translateAuthError(msg) };
  }
}

/**
 * Reenvía el correo de verificación.
 */
export async function resendVerificationEmailAuth(email: string): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured || !supabase) {
    return { success: false, error: 'Supabase no está configurado.' };
  }

  try {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim().toLowerCase()
    });

    if (error) {
      return { success: false, error: translateAuthError(error.message) };
    }

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: translateAuthError(msg) };
  }
}


/**
 * Envía un correo electrónico para restablecer la contraseña a través de Supabase.
 */
export async function sendPasswordResetEmail(email: string): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured || !supabase) {
    return { success: false, error: 'Supabase no está configurado.' };
  }

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/reset-password`
    });

    if (error) {
      return { success: false, error: translateAuthError(error.message) };
    }

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: translateAuthError(msg) };
  }
}

/**
 * Cierra la sesión activa en Supabase Auth.
 */
export async function signOutFromSupabase(): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.auth.signOut();
    } catch (err: unknown) {
      console.warn('⚠️ Error al cerrar sesión en Supabase:', err);
    }
  }
}

export async function getCurrentSupabaseSession() {
  if (!isSupabaseConfigured || !supabase) return { data: { session: null } };
  try {
    return await supabase.auth.getSession();
  } catch (err: unknown) {
    console.warn('⚠️ Error al obtener sesión actual:', err);
    return { data: { session: null } };
  }
}

export function subscribeToSupabaseAuthChanges(callback: (event: string, session: import('@supabase/supabase-js').Session | null) => void) {
  if (!isSupabaseConfigured || !supabase) {
    return { data: { subscription: { unsubscribe: () => {} } } };
  }
  return supabase.auth.onAuthStateChange(callback);
}
