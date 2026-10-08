export { isSupabaseConfigured } from '../lib/supabase';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { UserAccount } from '../types';

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
 * para determinar el rol del usuario autenticado en la plataforma.
 */
export async function resolveSupabaseUserProfile(userId: string, email: string, needsPasswordSet?: boolean): Promise<UserAccount> {
  if (!isSupabaseConfigured || !supabase) {
    return {
      id: userId,
      email,
      name: email.split('@')[0],
      role: 'client_delivery',
      businessRole: 'customer',
      needsPasswordSet
    };
  }

  try {
    // 1. Obtener perfil general
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, platform_role')
      .eq('id', userId)
      .maybeSingle();

    const fullName = profile?.full_name || email.split('@')[0];
    const platformRole = profile?.platform_role || 'customer';

    if (platformRole === 'platform_admin') {
      return {
        id: userId,
        email,
        name: fullName,
        role: 'platform_admin',
        businessRole: 'platform_admin',
        needsPasswordSet
      };
    }

    // 2. Verificar si es miembro de algún restaurante (Dueño / Staff)
    const { data: member } = await supabase
      .from('restaurant_members')
      .select('restaurant_id, role')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();

    if (member) {
      if (member.role === 'owner') {
        return {
          id: userId,
          email,
          name: fullName,
          role: 'admin',
          businessRole: 'restaurant_owner',
          tenantId: member.restaurant_id,
          needsPasswordSet
        };
      } else {
        return {
          id: userId,
          email,
          name: fullName,
          role: 'kitchen',
          businessRole: 'restaurant_staff',
          tenantId: member.restaurant_id,
          needsPasswordSet
        };
      }
    }

    // Default: Cliente final de entregas
    return {
      id: userId,
      email,
      name: fullName,
      role: 'client_delivery',
      businessRole: 'customer',
      needsPasswordSet
    };
  } catch (err: unknown) {
    console.warn('⚠️ Error al resolver perfil de Supabase:', err);
    return {
      id: userId,
      email,
      name: email.split('@')[0],
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
 * Registra un nuevo usuario cliente en Supabase Auth y crea su perfil en `public.profiles`.
 */
export async function signUpWithSupabase(email: string, pass: string, fullName: string): Promise<AuthActionResult> {
  if (!isSupabaseConfigured || !supabase) {
    return { success: false, error: 'Supabase no está configurado.' };
  }

  try {
    const normalizedEmail = email.trim().toLowerCase();
    const cleanName = fullName.trim() || 'Cliente GastroSync';

    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password: pass,
      options: {
        data: {
          full_name: cleanName
        }
      }
    });

    if (error || !data.user) {
      return { success: false, error: translateAuthError(error?.message || '') };
    }

    // Insertar en la tabla public.profiles si no existe
    await supabase.from('profiles').upsert({
      id: data.user.id,
      full_name: cleanName,
      platform_role: 'customer'
    });

    const userAccount: UserAccount = {
      id: data.user.id,
      email: normalizedEmail,
      name: cleanName,
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
