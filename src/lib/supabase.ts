import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { debugSupabaseConfig } from '../utils/debugSupabase';

/**
 * Supabase se activa en un módulo posterior de migración multiusuario.
 * Esta inicialización es pasiva y segura: si las variables de entorno faltan,
 * exporta `supabase = null` e `isSupabaseConfigured = false` sin interrumpir
 * el MVP local ni lanzar excepciones en tiempo de ejecución.
 */

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const isSupabaseConfigured: boolean = Boolean(
  supabaseUrl &&
  supabaseUrl.trim() !== '' &&
  supabasePublishableKey &&
  supabasePublishableKey.trim() !== ''
);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl!.trim(), supabasePublishableKey!.trim(), {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;

if (import.meta.env.DEV) {
  debugSupabaseConfig();
  if (isSupabaseConfigured) {
    console.info('⚡ [GastroSync] Supabase configurado y listo para sincronización remota.');
  } else {
    console.info('📦 [GastroSync] Supabase no configurado. Operando en modo local seguro (localStorage).');
  }
}

