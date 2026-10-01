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
}

/**
 * Servicio de Autenticación de Producción con Supabase Auth.
 * Proporciona métodos para inicio de sesión, registro, OAuth de Google,
 * recuperación de contraseña y resolución de roles desde la base de datos PostgreSQL.
 */

/**
 * Traduce mensajes de error estándar de Supabase al español para una mejor UX.
 */
function translateAuthError(errMessage: string): string {
  const msg = errMessage.toLowerCase();
  if (msg.includes('invalid login credentials') || msg.includes('invalid credentials')) {
    return 'Correo electrónico o contraseña incorrectos.';
  }
  if (msg.includes('user already registered') || msg.includes('already exists')) {
    return 'Este correo electrónico ya se encuentra registrado.';
  }
  if (msg.includes('password should be at least')) {
    return 'La contraseña debe tener al menos 6 caracteres.';
  }
  if (msg.includes('unable to validate email address') || msg.includes('invalid email')) {
    return 'El formato de correo electrónico no es válido.';
  }
  if (msg.includes('email rate limit exceeded')) {
    return 'Se ha superado el límite de intentos de correo. Intenta de nuevo en unos minutos.';
  }
  return errMessage || 'Ocurrió un error inesperado al procesar la autenticación.';
}

/**
 * Consulta las tablas `public.profiles` y `public.restaurant_members`
 * para determinar el rol del usuario autenticado en la plataforma.
 */
export async function resolveSupabaseUserProfile(userId: string, email: string): Promise<UserAccount> {
  if (!isSupabaseConfigured || !supabase) {
    return {
      email,
      name: email.split('@')[0],
      role: 'client_delivery',
      businessRole: 'customer'
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
        email,
        name: fullName,
        role: 'platform_admin',
        businessRole: 'platform_admin'
      };
    }

    // 2. Verificar si es miembro de algún restaurante (Dueño / Staff)
    const { data: member } = await supabase
      .from('restaurant_members')
      .select('restaurant_id, role')
      .eq('user_id', userId)
      .maybeSingle();

    if (member) {
      if (member.role === 'owner') {
        return {
          email,
          name: fullName,
          role: 'admin',
          businessRole: 'restaurant_owner',
          tenantId: member.restaurant_id
        };
      } else {
        return {
          email,
          name: fullName,
          role: 'kitchen',
          businessRole: 'restaurant_staff',
          tenantId: member.restaurant_id
        };
      }
    }

    // Default: Cliente final de entregas
    return {
      email,
      name: fullName,
      role: 'client_delivery',
      businessRole: 'customer'
    };
  } catch (err: unknown) {
    console.warn('⚠️ Error al resolver perfil de Supabase:', err);
    return {
      email,
      name: email.split('@')[0],
      role: 'client_delivery',
      businessRole: 'customer'
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

    const userAccount = await resolveSupabaseUserProfile(data.user.id, data.user.email || email);
    return { success: true, user: userAccount };
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
      email: normalizedEmail,
      name: cleanName,
      role: 'client_delivery',
      businessRole: 'customer'
    };

    return { success: true, user: userAccount };
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

export function subscribeToSupabaseAuthChanges(callback: (event: string, session: any) => void) {
  if (!isSupabaseConfigured || !supabase) {
    return { data: { subscription: { unsubscribe: () => {} } } };
  }
  return supabase.auth.onAuthStateChange(callback);
}
