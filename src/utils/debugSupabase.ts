/**
 * Utilidad de debug para verificar configuración de Supabase
 * Solo para desarrollo - eliminar en producción
 */

export function debugSupabaseConfig() {
  if (!import.meta.env.DEV) return;

  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  console.group('🔍 Supabase Configuration Debug');
  console.log('Environment:', import.meta.env.MODE);
  console.log('Has VITE_SUPABASE_URL:', Boolean(url));
  console.log('Has VITE_SUPABASE_PUBLISHABLE_KEY:', Boolean(key));

  if (url) {
    console.log('URL starts with https:', url.startsWith('https://'));
    console.log('URL ends with supabase.co:', url.endsWith('.supabase.co'));
  }

  // Por seguridad nunca imprimimos fragmentos ni prefijos de claves en consola
  console.groupEnd();
}
