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

  // 2. Validación de archivo (Tamaño máximo 50MB y tipo MIME permitido)
  const MAX_SIZE_BYTES = 50 * 1024 * 1024;
  if (file.size > MAX_SIZE_BYTES) {
    return { success: false, error: 'El archivo excede el tamaño máximo permitido de 50MB.' };
  }
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime'];
  if (!allowedMimeTypes.includes(file.type)) {
    return { success: false, error: 'El formato del archivo no está permitido.' };
  }


  try {
    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'png';
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
      return { success: false, error: 'Ocurrió un error al subir el archivo al servidor. Inténtalo de nuevo.' };
    }

    const { data } = supabase.storage
      .from('gastro-media')
      .getPublicUrl(filePath);

    return {
      success: true,
      publicUrl: data.publicUrl
    };
  } catch (err: unknown) {
    console.warn('⚠️ Excepción durante la subida a Supabase Storage:', err);
    return { success: false, error: 'Ocurrió un error inesperado al subir el archivo.' };
  }
}

