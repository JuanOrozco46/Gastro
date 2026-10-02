import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { Tenant, Product, Post, RestaurantApplication, OrderFulfillment } from '../types';
import type {
  DbRestaurant, DbProduct, DbPost
} from './supabaseTypes';
import {
  mapDbRestaurantToTenant,
  mapDbProductToProduct,
  mapDbPostToPost
} from './supabaseTypes';

/**
 * Servicio de Sincronización en Tiempo Real con Supabase.
 * Permite cargar datos reales del servidor PostgreSQL sin depender de mocks inventados.
 */

export async function fetchLiveTenants(): Promise<Tenant[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  try {
    const { data, error } = await supabase
      .from('restaurants')
      .select(`id, slug, name, category, description, address, phone, whatsapp, city_id, zone_id, status, is_open, delivery_modes, min_order, delivery_fee, delivery_radius_km, commission_rate`);

    if (error || !data) {
      console.warn('⚠️ Error al cargar restaurantes de Supabase:', error);
      return [];
    }

    const validModes = ['pickup', 'restaurant_delivery', 'table_service'];
    
    return (data as unknown as DbRestaurant[]).map(mapDbRestaurantToTenant).filter(t => {
      // Filter out tenants with no valid delivery modes or missing required fields
      if (!t.name || !t.id) {
        console.warn(`⚠️ Omitiendo restaurante inválido (sin ID o nombre): ${t.id || 'desconocido'}`);
        return false;
      }
      
      const validDeliveryModes = (t.deliveryModes || []).filter(m => validModes.includes(m));
      if (validDeliveryModes.length !== (t.deliveryModes || []).length) {
        console.warn(`⚠️ Limpiando deliveryModes inválidos para restaurante: ${t.id}`);
        t.deliveryModes = validDeliveryModes as any;
      }
      return true;
    });
  } catch (err: unknown) {
    console.warn('⚠️ Excepción al consultar Supabase:', err);
    return [];
  }
}

export async function fetchLiveProducts(): Promise<Product[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  try {
    const { data, error } = await supabase
      .from('products')
      .select(`id, restaurant_id, name, description, category, price_cop, available`)
      .eq('available', true);

    if (error || !data) return [];

    const validCategories = ['Platos Principales', 'Bebidas', 'Postres', 'Entradas'];

    return (data as unknown as DbProduct[]).map(mapDbProductToProduct).filter(p => {
      if (!p.tenantId || !p.id || !p.name) {
        console.warn(`⚠️ Omitiendo producto inválido (datos faltantes): ${p.id || 'desconocido'}`);
        return false;
      }
      if (p.price < 0 || p.price === null || isNaN(p.price)) {
        console.warn(`⚠️ Omitiendo producto con precio inválido: ${p.id}`);
        return false;
      }
      if (!validCategories.includes(p.category)) {
        console.warn(`⚠️ Omitiendo producto con categoría desconocida: ${p.category} (${p.id})`);
        return false;
      }
      return true;
    });
  } catch (err: unknown) {
    console.warn('⚠️ Excepción al consultar Supabase (Products):', err);
    return [];
  }
}

export async function fetchLivePosts(): Promise<Post[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  try {
    const { data, error } = await supabase
      .from('posts')
      .select(`id, restaurant_id, product_id, title, description, media_url, media_type, price_cop, is_published, created_at`)
      .order('created_at', { ascending: false });

    if (error || !data) return [];

    return (data as unknown as DbPost[]).map(mapDbPostToPost).filter(p => {
      if (!p.tenantId || !p.id || !p.dishName) {
        console.warn(`⚠️ Omitiendo publicación inválida (datos faltantes): ${p.id || 'desconocido'}`);
        return false;
      }
      if (p.price < 0 || p.price === null || isNaN(p.price)) {
        console.warn(`⚠️ Omitiendo publicación con precio inválido: ${p.id}`);
        return false;
      }
      return true;
    });
  } catch (err: unknown) {
    console.warn('⚠️ Excepción al consultar Supabase (Posts):', err);
    return [];
  }
}

export async function submitLiveApplication(appData: Omit<RestaurantApplication, 'id' | 'submittedAt' | 'status'>): Promise<RestaurantApplication | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  try {
    // Transform local IDs into Supabase slugs to get the real UUIDs
    const citySlug = appData.cityId.replace('city_', '').replace(/_/g, '-'); // e.g. 'armenia-quindio'
    const zoneSlug = appData.zoneId.replace('zone_', '').replace(/_/g, '-'); // e.g. 'armenia-centro'

    const [{ data: cityData }, { data: zoneData }] = await Promise.all([
      supabase.from('cities').select('id').eq('slug', citySlug).single(),
      supabase.from('zones').select('id').eq('slug', zoneSlug).single()
    ]);

    if (!cityData || !zoneData) {
      console.warn('⚠️ No se encontraron los UUIDs reales para la ciudad o zona especificada.');
      return null;
    }

    const newId = crypto.randomUUID();
    const { error } = await supabase.from('restaurant_applications').insert([{
      id: newId,
      owner_name: appData.ownerName,
      owner_email: appData.ownerEmail,
      owner_phone: appData.ownerPhone,
      restaurant_name: appData.restaurantName,
      category: appData.category,
      city_id: cityData.id,
      zone_id: zoneData.id,
      address: appData.address,
      whatsapp: appData.whatsapp,
      min_order: appData.minOrder,
      delivery_modes: appData.deliveryModes,
      delivery_fee: appData.deliveryFee,
      delivery_radius_km: appData.deliveryRadiusKm,
      notes: appData.notes,
      status: 'submitted'
    }]);

    if (error) {
      console.warn('⚠️ Error al insertar la solicitud en Supabase:', error);
      return null;
    }

    return {
      id: newId,
      ownerName: appData.ownerName,
      ownerEmail: appData.ownerEmail,
      ownerPhone: appData.ownerPhone,
      restaurantName: appData.restaurantName,
      category: appData.category,
      cityId: cityData.id,
      zoneId: zoneData.id,
      address: appData.address,
      whatsapp: appData.whatsapp,
      minOrder: appData.minOrder,
      deliveryModes: appData.deliveryModes,
      deliveryFee: appData.deliveryFee,
      deliveryRadiusKm: appData.deliveryRadiusKm,
      notes: appData.notes,
      status: 'submitted',
      submittedAt: Date.now(),
    } as RestaurantApplication;
  } catch (err: unknown) {
    console.warn('⚠️ Excepción al insertar aplicacion en Supabase:', err);
    return null;
  }
}

export async function fetchLiveApplications(): Promise<RestaurantApplication[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  try {
    const { data, error } = await supabase
      .from('restaurant_applications')
      .select('*')
      .order('created_at', { ascending: false });

    if (error || !data) return [];

    return data.map((app: Record<string, unknown>) => ({
      id: app.id as string,
      ownerName: app.owner_name as string,
      ownerEmail: app.owner_email as string,
      ownerPhone: app.owner_phone as string,
      restaurantName: app.restaurant_name as string,
      category: app.category as string,
      cityId: app.city_id as string,
      zoneId: app.zone_id as string,
      address: app.address as string,
      whatsapp: app.whatsapp as string | undefined,
      minOrder: app.min_order as number | undefined,
      deliveryModes: app.delivery_modes as OrderFulfillment[],
      deliveryFee: app.delivery_fee as number | undefined,
      deliveryRadiusKm: app.delivery_radius_km as number | undefined,
      notes: app.notes as string | undefined,
      status: app.status as RestaurantApplication['status'],
      submittedAt: new Date(app.created_at as string).getTime(),
      reviewedAt: app.reviewed_at ? new Date(app.reviewed_at as string).getTime() : undefined,
      reviewNote: app.review_note as string | undefined,
      activatedAt: app.activated_at ? new Date(app.activated_at as string).getTime() : undefined,
      activatedTenantId: app.activated_restaurant_id as string | undefined,
    }));
  } catch (err: unknown) {
    console.warn('⚠️ Excepción al consultar aplicaciones en Supabase:', err);
    return [];
  }
}

/**
 * Persiste un cambio de estado de revisión (reviewing/approved/rejected) en Supabase.
 * Retorna true si la actualización fue exitosa, false en caso contrario.
 */
export async function updateLiveApplicationStatus(
  applicationId: string,
  nextStatus: 'reviewing' | 'approved' | 'rejected',
  reviewerId: string,
  reviewNote?: string
): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false;
  try {
    const isAppUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(applicationId);
    if (!isAppUuid) {
      console.info('ℹ️ ID de solicitud local/mock, omitiendo persistencia remota:', applicationId);
      return true;
    }

    const isReviewerUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reviewerId);

    const { error } = await supabase
      .from('restaurant_applications')
      .update({
        status: nextStatus,
        review_note: reviewNote?.trim() || null,
        reviewed_at: new Date().toISOString(),
        reviewed_by: isReviewerUuid ? reviewerId : null
      })
      .eq('id', applicationId);

    if (error) {
      console.warn('⚠️ Error al actualizar estado de solicitud en Supabase:', error.message);
      return false;
    }
    return true;
  } catch (err: unknown) {
    console.warn('⚠️ Excepción al actualizar estado de solicitud:', err);
    return false;
  }
}

export async function uploadMediaFile(
  tenantId: string,
  folder: 'products' | 'posts' | 'thumbnails',
  file: File
): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  try {
    const ext = file.name.split('.').pop() || '';
    const uuid = crypto.randomUUID();
    const filePath = `${tenantId}/${folder}/${uuid}.${ext}`;

    const { error } = await supabase.storage
      .from('gastro-media')
      .upload(filePath, file, { upsert: false });

    if (error) throw error;

    const { data } = supabase.storage
      .from('gastro-media')
      .getPublicUrl(filePath);

    return data.publicUrl;
  } catch (err) {
    console.warn('⚠️ Error uploading media file:', err);
    return null;
  }
}

export async function deleteMediaFile(publicUrl: string): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase || !publicUrl) return false;
  try {
    const baseUrl = supabase.storage.from('gastro-media').getPublicUrl('').data.publicUrl;
    if (!publicUrl.startsWith(baseUrl)) return true;

    const filePath = publicUrl.replace(baseUrl + '/', '');
    const { error } = await supabase.storage.from('gastro-media').remove([filePath]);
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('⚠️ Error deleting media file:', err);
    return false;
  }
}

export async function createLiveProduct(tenantId: string, name: string, desc: string, category: string, price: number, available: boolean, imageUrl?: string): Promise<Product | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  try {
    const { data, error } = await supabase.from('products').insert({
      restaurant_id: tenantId,
      name,
      description: desc || null,
      category,
      price_cop: price,
      available,
      image_url: imageUrl || null
    }).select().single();

    if (error || !data) throw error;
    return mapDbProductToProduct(data as unknown as DbProduct);
  } catch (err) {
    console.warn('⚠️ Error creating live product:', err);
    return null;
  }
}

export async function updateLiveProduct(productId: string, updates: Partial<{ name: string; desc: string; category: string; price: number; available: boolean; imageUrl: string }>): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false;
  try {
    const dbUpdates: any = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.desc !== undefined) dbUpdates.description = updates.desc || null;
    if (updates.category !== undefined) dbUpdates.category = updates.category;
    if (updates.price !== undefined) dbUpdates.price_cop = updates.price;
    if (updates.available !== undefined) dbUpdates.available = updates.available;
    if (updates.imageUrl !== undefined) dbUpdates.image_url = updates.imageUrl || null;

    const { error } = await supabase.from('products').update(dbUpdates).eq('id', productId);
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('⚠️ Error updating live product:', err);
    return false;
  }
}

export async function deleteLiveProduct(productId: string): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false;
  try {
    const { error } = await supabase.from('products').delete().eq('id', productId);
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('⚠️ Error deleting live product:', err);
    return false;
  }
}

export async function createLivePost(tenantId: string, title: string, desc: string, price: number, mediaUrl: string, mediaType: 'photo' | 'video'): Promise<Post | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  try {
    const { data, error } = await supabase.from('posts').insert({
      restaurant_id: tenantId,
      title,
      description: desc || null,
      price_cop: price,
      media_url: mediaUrl,
      media_type: mediaType,
      is_published: true
    }).select().single();

    if (error || !data) throw error;
    const post = mapDbPostToPost(data as unknown as DbPost);
    // Tenant info is needed in Post but mapDbPostToPost sets placeholders.
    return post;
  } catch (err) {
    console.warn('⚠️ Error creating live post:', err);
    return null;
  }
}

export async function deleteLivePost(postId: string): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false;
  try {
    const { error } = await supabase.from('posts').delete().eq('id', postId);
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('⚠️ Error deleting live post:', err);
    return false;
  }
}
