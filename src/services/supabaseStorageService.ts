import { supabase, isSupabaseConfigured } from '../lib/supabase';

export interface StorageUploadResult {
  success: boolean;
  publicUrl?: string;
  error?: string;
}

/**
 * Servicio de Almacenamiento de Archivos Multimedia (Imágenes y Videos) con Supabase Storage.
 * Sube archivos al bucket público 'gastro-media' y devuelve la URL CDN pública permanente.
 * Incluye un fallback automático a FileReader (Data URL) si Supabase no está disponible.
 */
export async function uploadMediaFile(
  file: File,
  folder: string = 'general'
): Promise<StorageUploadResult> {
  // 1. Fallback a Data URL local si Supabase no está configurado
  if (!isSupabaseConfigured || !supabase) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        resolve({ success: true, publicUrl: result });
      };
      reader.onerror = () => {
        resolve({ success: false, error: 'Error al leer el archivo en modo local.' });
      };
      reader.readAsDataURL(file);
    });
  }

  try {
    const fileExt = file.name.split('.').pop() || 'png';
    const cleanFolder = folder.replace(/[^a-zA-Z0-9_-]/g, '');
    const randomHash = Math.random().toString(36).substring(2, 8);
    const fileName = `${Date.now()}_${randomHash}.${fileExt}`;
    const filePath = `${cleanFolder}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('gastro-media')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true
      });

    if (uploadError) {
      console.warn('⚠️ Error al subir archivo a Supabase Storage:', uploadError);
      // Fallback a Data URL si la cuota o permiso falla
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const result = e.target?.result as string;
          resolve({ success: true, publicUrl: result });
        };
        reader.readAsDataURL(file);
      });
    }

    const { data } = supabase.storage
      .from('gastro-media')
      .getPublicUrl(filePath);

    return {
      success: true,
      publicUrl: data.publicUrl
    };
  } catch (err: any) {
    console.warn('⚠️ Excepción durante la subida a Supabase Storage:', err);
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        resolve({ success: true, publicUrl: result });
      };
      reader.readAsDataURL(file);
    });
  }
}
