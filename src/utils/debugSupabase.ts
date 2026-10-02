/**
 * Utilidad de debug para verificar configuración de Supabase
 * Solo para desarrollo - eliminar en producción
 */

export function debugSupabaseConfig() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  
  console.group('🔍 Supabase Configuration Debug');
  
  console.log('Environment:', import.meta.env.MODE);
  console.log('Has VITE_SUPABASE_URL:', !!url);
  console.log('Has VITE_SUPABASE_PUBLISHABLE_KEY:', !!key);
  
  if (url) {
    console.log('URL starts with https:', url.startsWith('https://'));
    console.log('URL ends with supabase.co:', url.endsWith('.supabase.co'));
    console.log('URL length:', url.length);
    // No mostrar la URL completa por seguridad
  }
  
  if (key) {
    console.log('Key starts with eyJ:', key.startsWith('eyJ'));
    console.log('Key length:', key.length);
    console.log('Key first 20 chars:', key.substring(0, 20) + '...');
  }
  
  console.groupEnd();
}
