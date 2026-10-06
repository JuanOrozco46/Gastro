import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { Tenant, Product, Post, RestaurantApplication, OrderFulfillment, City, Zone, RestaurantDeliveryMode, PostComment } from '../types';
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

export async function fetchLiveCities(): Promise<City[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  try {
    const { data, error } = await supabase.from('cities').select('*').eq('is_active', true).order('name');
    if (error || !data) return [];
    return data.map(d => ({
      id: d.id,
      slug: d.slug,
      name: d.name,
      countryCode: d.country_code,
      currencyCode: d.currency_code,
      isActive: d.is_active
    }));
  } catch { return []; }
}

export async function fetchLiveZones(cityId?: string): Promise<Zone[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  try {
    let query = supabase.from('zones').select('*').eq('is_active', true);
    if (cityId) {
      query = query.eq('city_id', cityId);
    }
    const { data, error } = await query.order('name');
    if (error || !data) return [];
    return data.map(d => ({
      id: d.id,
      cityId: d.city_id,
      name: d.name,
      slug: d.slug,
      isActive: d.is_active
    }));
  } catch { return []; }
}

export async function updateRemoteRestaurantLocation(
  restaurantId: string,
  cityId: string,
  zoneId?: string | null
): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase || !restaurantId || !cityId) return false;
  try {
    const { error } = await supabase
      .from('restaurants')
      .update({
        city_id: cityId,
        zone_id: zoneId || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', restaurantId);

    if (error) {
      console.error('⚠️ Error actualizando ubicación del restaurante en Supabase:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('⚠️ Excepción actualizando ubicación del restaurante:', err);
    return false;
  }
}

export async function fetchLiveTenants(): Promise<Tenant[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  try {
    const { data, error } = await supabase
      .from('restaurants')
      .select(`
        id, slug, name, category, description, address, phone, whatsapp, city_id, zone_id, status, is_open, 
        delivery_modes, min_order, delivery_fee, delivery_radius_km, commission_rate,
        logo_url, banner_url, logo_emoji, specialties, accepting_orders, estimated_delivery_minutes, owner_user_id,
        restaurant_hours ( id, day_of_week, is_open, open_time, close_time, open_time2, close_time2 )
      `);

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
        t.deliveryModes = validDeliveryModes as RestaurantDeliveryMode[];
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
      .select(`id, restaurant_id, name, description, category, price_cop, available, image_url, is_archived, sort_order, tags, preparation_time_minutes, ingredients, allergens`);

    if (error) {
      console.error('⚠️ Error RLS o BD al consultar Supabase (Products):', error);
      return [];
    }
    if (!data) return [];

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

export async function fetchRemoteComments(postId: string) {
  if (!isSupabaseConfigured || !supabase) return [];
  try {
    const { data: comments, error } = await supabase
      .from('post_comments')
      .select('id, post_id, user_id, content, created_at')
      .eq('post_id', postId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('⚠️ Error cargando comentarios:', error.message);
      return [];
    }
    if (!comments || comments.length === 0) return [];

    const userIds = Array.from(new Set(comments.map((c: { user_id: string }) => c.user_id)));
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', userIds);

    const profileMap = new Map();
    if (profiles) {
      profiles.forEach((p: { id: string, full_name: string }) => profileMap.set(p.id, p.full_name));
    }

    return comments.map((c: { id: string, post_id: string, user_id: string, content: string, created_at: string }) => ({
      id: c.id,
      postId: c.post_id,
      userName: profileMap.get(c.user_id) || 'Usuario',
      userAvatar: '🥑',
      text: c.content,
      timeAgo: formatTimeAgo(c.created_at),
      likes: 0
    }));
  } catch (err) {
    console.error('⚠️ Excepción al cargar comentarios:', err);
    return [];
  }
}

export async function addRemoteComment(postId: string, userId: string, text: string) {
  if (!isSupabaseConfigured || !supabase) return null;
  
  const trimmed = text.trim();
  if (!trimmed || trimmed.length === 0 || trimmed.length > 500) {
    console.warn('⚠️ Comentario inválido: vacío o supera 500 caracteres');
    return null;
  }
  
  try {
    const { data, error } = await supabase.from('post_comments').insert([{ 
      post_id: postId, 
      user_id: userId, 
      content: trimmed 
    }]).select('id, post_id, user_id, content, created_at').single();
    
    if (error || !data) {
      console.error('⚠️ Error al insertar comentario:', error?.message);
      return null;
    }
    
    // Obtener profile separado
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .maybeSingle();
    
    return {
      id: data.id,
      postId: data.post_id,
      userName: profile?.full_name || 'Usuario',
      userAvatar: '🥑',
      text: data.content,
      timeAgo: formatTimeAgo(data.created_at),
      likes: 0
    };
  } catch (err) {
    console.error('⚠️ Excepción al insertar comentario:', err);
    return null;
  }
}

export async function deleteRemoteComment(commentId: string, userId: string): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false;
  try {
    const { error } = await supabase.from('post_comments').delete().eq('id', commentId).eq('user_id', userId);
    return !error;
  } catch {
    return false;
  }
}

export async function toggleRemoteLike(postId: string, userId: string): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false;
  try {
    // Ya no usamos RPC porque el 404 indica que la DB remota de Vercel no tiene la función
    // y no queremos romper el frontend especulando. Usaremos transacciones read-then-write seguras.

    // Check if like exists
    const { data, error: selectError } = await supabase
      .from('post_likes')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .maybeSingle();
    
    if (selectError) {
      console.error('⚠️ Error al verificar like:', selectError.message);
      return false;
    }
    
    if (data) {
      // Unlike: remove existing like
      const { error: deleteError } = await supabase
        .from('post_likes')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', userId);
      
      if (deleteError) {
        console.error('⚠️ Error al remover like:', deleteError.message);
        return false;
      }
      return true;
    } else {
      // Like: insert new like
      const { error: insertError } = await supabase
        .from('post_likes')
        .insert([{ post_id: postId, user_id: userId }]);
      
      if (insertError) {
        console.error('⚠️ Error al insertar like:', insertError.message);
        return false;
      }
      return true;
    }
  } catch (err) {
    console.error('⚠️ Excepción al togglear like:', err);
    return false;
  }
}

export async function toggleRemoteSave(postId: string, userId: string): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false;
  try {
    const { data } = await supabase.from('saved_posts').select('id').eq('post_id', postId).eq('user_id', userId).single();
    if (data) {
      const { error } = await supabase.from('saved_posts').delete().eq('post_id', postId).eq('user_id', userId);
      return !error;
    } else {
      const { error } = await supabase.from('saved_posts').insert([{ post_id: postId, user_id: userId }]);
      return !error;
    }
  } catch {
    return false;
  }
}

export async function fetchLivePosts(): Promise<Post[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  try {
    const currentUserId = (await supabase.auth.getUser()).data.user?.id;

    // Fetch posts with aggregated counts and user's like status
    const { data, error } = await supabase
      .from('posts')
      .select(`
        id, 
        restaurant_id, 
        product_id, 
        title, 
        description, 
        media_url, 
        media_type, 
        price_cop, 
        is_published, 
        created_at,
        updated_at,
        restaurants!inner(name, category, slug, status)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('⚠️ Error RLS o BD al consultar Supabase (Posts):', error);
      return [];
    }
    if (!data || data.length === 0) return [];

    // Fetch all likes count and user's likes in parallel
    const postIds = data.map((p: { id: string }) => p.id);
    
    const [likesData, commentsData, userLikesData] = await Promise.all([
      // Get likes count per post
      supabase
        .from('post_likes')
        .select('post_id', { count: 'exact', head: false })
        .in('post_id', postIds),
      
      // Get full comments per post
      supabase
        .from('post_comments')
        .select('id, post_id, user_id, content, created_at')
        .in('post_id', postIds)
        .order('created_at', { ascending: false }),
      
      // Get current user's likes (if authenticated)
      currentUserId
        ? supabase
            .from('post_likes')
            .select('post_id')
            .eq('user_id', currentUserId)
            .in('post_id', postIds)
        : Promise.resolve({ data: [], error: null })
    ]);

    if (likesData.error) console.error('⚠️ Error cargando likes:', likesData.error.message);
    if (commentsData.error) console.error('⚠️ Error cargando comentarios:', commentsData.error.message);
    if (userLikesData.error) console.error('⚠️ Error cargando user likes:', userLikesData.error.message);

    // Build lookup maps for counts and comments
    const likesMap = new Map<string, number>();
    const commentsMap = new Map<string, PostComment[]>();
    const userLikesSet = new Set<string>();

    if (likesData.data) {
      likesData.data.forEach((like: { post_id: string }) => {
        const count = likesMap.get(like.post_id) || 0;
        likesMap.set(like.post_id, count + 1);
      });
    }

    if (commentsData.data && commentsData.data.length > 0) {
      // Get profiles for all comment authors
      const userIds = Array.from(new Set(commentsData.data.map((c: { user_id: string }) => c.user_id)));
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds);
        
      const profileMap = new Map();
      if (profiles) {
        profiles.forEach((p: { id: string, full_name: string }) => profileMap.set(p.id, p.full_name));
      }

      commentsData.data.forEach((comment: { id: string; post_id: string; user_id: string; content: string; created_at: string }) => {
        const postComments = commentsMap.get(comment.post_id) || [];
        postComments.push({
          id: comment.id,
          postId: comment.post_id,
          userName: profileMap.get(comment.user_id) || 'Usuario',
          userAvatar: '🥑',
          text: comment.content,
          timeAgo: formatTimeAgo(comment.created_at),
          likes: 0
        });
        commentsMap.set(comment.post_id, postComments);
      });
    }

    if (userLikesData.data) {
      userLikesData.data.forEach((like: { post_id: string }) => {
        userLikesSet.add(like.post_id);
      });
    }

    return data.map((dbPost: import('./supabaseTypes').DbPost & { restaurants: { name: string; category: string; slug: string; status: string; } | { name: string; category: string; slug: string; status: string; }[] }) => {
      const restaurant = Array.isArray(dbPost.restaurants) ? dbPost.restaurants[0] : dbPost.restaurants;
      
      if (!restaurant || restaurant.status !== 'active') {
        return null;
      }

      const post: Post = {
        id: dbPost.id,
        tenantId: dbPost.restaurant_id,
        tenantName: restaurant.name,
        tenantCategory: restaurant.category,
        tenantLogoEmoji: '🍽️',
        dishName: dbPost.title,
        dishEmoji: '🍽️',
        desc: dbPost.description || '',
        price: dbPost.price_cop,
        image: dbPost.media_url || '',
        mediaUrl: dbPost.media_url || undefined,
        mediaType: dbPost.media_type,
        likes: likesMap.get(dbPost.id) || 0,
        isLiked: userLikesSet.has(dbPost.id),
        comments: commentsMap.get(dbPost.id) || [],
        commentsCount: (commentsMap.get(dbPost.id) || []).length,
        timeAgo: formatTimeAgo(dbPost.created_at),
        productId: dbPost.product_id || dbPost.id,
        hasValidProduct: !!dbPost.product_id, // Flag to indicate if product exists in catalog
        status: dbPost.is_published ? 'published' : 'draft',
        createdAt: new Date(dbPost.created_at).getTime()
      };

      return post;
    }).filter((p): p is Post => {
      if (!p) return false;
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

function formatTimeAgo(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'Justo ahora';
  if (diffMins < 60) return `Hace ${diffMins} min`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `Hace ${diffHours}h`;
  
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `Hace ${diffDays}d`;
  
  return `Hace ${Math.floor(diffDays / 7)}sem`;
}

/**
 * Tasa de comisión de plataforma que el restaurante acepta al solicitar su vinculación.
 * Se persiste en restaurant_applications.commission_rate_accepted.
 */
export const PLATFORM_COMMISSION_RATE = 0.03;

export type SubmitApplicationFailure =
  | 'duplicate_email'
  | 'duplicate_name'
  | 'invalid_location'
  | 'invalid_data'
  | 'unknown';

export type SubmitApplicationResult =
  | { ok: true; application: RestaurantApplication }
  | { ok: false; reason: SubmitApplicationFailure; message: string };

export interface ApplicationAssetFiles {
  logo?: File | null;
  banner?: File | null;
}

export interface ApplicationAssetResult {
  logo: boolean;
  banner: boolean;
  /** Mensaje legible si alguna imagen no pudo subirse o fue rechazada. */
  error?: string;
}

const APPLICATION_ASSET_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const APPLICATION_ASSET_MAX_BYTES = 5 * 1024 * 1024;

/** Extrae el mensaje {error} de una respuesta no-2xx de una Edge Function. */
async function readFunctionError(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body: unknown = await error.context.json();
      if (typeof body === 'object' && body !== null && 'error' in body) {
        return String((body as { error: unknown }).error);
      }
    } catch {
      /* cuerpo no JSON */
    }
  }
  return error instanceof Error ? error.message : 'Error desconocido';
}

/**
 * Sube logo/banner de una solicitud YA CREADA usando URLs firmadas emitidas por la Edge
 * Function `application-assets` (bucket privado, validación de MIME/tamaño/bytes en servidor).
 * Nunca lanza: si falla, la solicitud sigue siendo válida (las imágenes son opcionales).
 */
export async function uploadApplicationAssets(
  applicationId: string,
  files: ApplicationAssetFiles
): Promise<ApplicationAssetResult> {
  const empty: ApplicationAssetResult = { logo: false, banner: false };
  if (!isSupabaseConfigured || !supabase) return empty;

  const entries: Array<{ kind: 'logo' | 'banner'; file: File }> = [];
  if (files.logo) entries.push({ kind: 'logo', file: files.logo });
  if (files.banner) entries.push({ kind: 'banner', file: files.banner });
  if (entries.length === 0) return empty;

  for (const { kind, file } of entries) {
    if (!APPLICATION_ASSET_MIME.includes(file.type)) {
      return { ...empty, error: `El ${kind} debe ser JPG, PNG o WEBP.` };
    }
    if (file.size > APPLICATION_ASSET_MAX_BYTES) {
      return { ...empty, error: `El ${kind} supera el máximo de 5 MB.` };
    }
  }

  try {
    const sign = await supabase.functions.invoke('application-assets', {
      body: {
        action: 'sign',
        applicationId,
        files: entries.map(e => ({ kind: e.kind, contentType: e.file.type, size: e.file.size }))
      }
    });
    if (sign.error) return { ...empty, error: await readFunctionError(sign.error) };

    const signed = sign.data as { bucket?: string; uploads?: Array<{ kind: 'logo' | 'banner'; path: string; token: string }> } | null;
    if (!signed?.uploads || !signed.bucket) return { ...empty, error: 'Respuesta inválida del servidor de subidas.' };

    for (const up of signed.uploads) {
      const entry = entries.find(e => e.kind === up.kind);
      if (!entry) continue;
      const { error: upErr } = await supabase.storage
        .from(signed.bucket)
        .uploadToSignedUrl(up.path, up.token, entry.file, { contentType: entry.file.type });
      if (upErr) return { ...empty, error: `No se pudo subir el ${up.kind}: ${upErr.message}` };
    }

    const fin = await supabase.functions.invoke('application-assets', {
      body: { action: 'finalize', applicationId }
    });
    if (fin.error) return { ...empty, error: await readFunctionError(fin.error) };

    const result = fin.data as { logo?: boolean; banner?: boolean; rejected?: string[] } | null;
    const rejected = result?.rejected ?? [];
    return {
      logo: !!result?.logo,
      banner: !!result?.banner,
      error: rejected.length > 0 ? `Imágenes rechazadas: ${rejected.join('; ')}` : undefined
    };
  } catch (err: unknown) {
    console.warn('⚠️ Excepción subiendo imágenes de la solicitud:', err);
    return { ...empty, error: 'No se pudieron subir las imágenes.' };
  }
}

export async function submitLiveApplication(
  appData: Omit<RestaurantApplication, 'id' | 'submittedAt' | 'status'>
): Promise<SubmitApplicationResult> {
  if (!isSupabaseConfigured || !supabase) {
    return { ok: false, reason: 'unknown', message: 'Supabase no está configurado.' };
  }
  try {
    let realCityId = appData.cityId;
    let realZoneId = appData.zoneId;

    const isUuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!isUuidRegex.test(realCityId)) {
      const citySlug = appData.cityId.replace('city_', '').replace(/_/g, '-');
      const { data: cityData } = await supabase.from('cities').select('id').eq('slug', citySlug).single();
      if (cityData) realCityId = cityData.id;
    }
    if (!isUuidRegex.test(realZoneId)) {
      const zoneSlug = appData.zoneId.replace('zone_', '').replace(/_/g, '-');
      const { data: zoneData } = await supabase.from('zones').select('id').eq('slug', zoneSlug).single();
      if (zoneData) realZoneId = zoneData.id;
    }

    const newId = crypto.randomUUID();
    const normalizedEmail = appData.ownerEmail.trim().toLowerCase();
    // Los visitantes anónimos NO pueden leer la tabla (RLS), por eso no se usa .select():
    // la unicidad de pendientes la garantizan los índices únicos parciales de la migración 022.
    const { error } = await supabase.from('restaurant_applications').insert([{
      id: newId,
      owner_name: appData.ownerName,
      owner_email: normalizedEmail,
      owner_phone: appData.ownerPhone,
      restaurant_name: appData.restaurantName,
      category: appData.category,
      city_id: realCityId,
      zone_id: realZoneId,
      address: appData.address,
      description: appData.description,
      whatsapp: appData.whatsapp,
      min_order: appData.minOrder,
      delivery_modes: appData.deliveryModes,
      delivery_fee: appData.deliveryFee,
      delivery_radius_km: appData.deliveryRadiusKm,
      estimated_delivery_minutes: appData.estimatedDeliveryMinutes,
      schedule_hours: appData.scheduleHours,
      notes: appData.notes,
      commission_rate_accepted: appData.commissionRateAccepted,
      terms_version: appData.termsVersion,
      status: 'submitted'
    }]);

    if (error) {
      console.warn('⚠️ Error al insertar la solicitud en Supabase:', error);
      const msg = error.message ?? '';
      if (error.code === '23505' && msg.includes('uq_restaurant_apps_pending_email')) {
        return { ok: false, reason: 'duplicate_email', message: 'Ya existe una solicitud pendiente con este correo electrónico.' };
      }
      if (error.code === '23505' && msg.includes('uq_restaurant_apps_pending_name_city')) {
        return { ok: false, reason: 'duplicate_name', message: 'Ya existe una solicitud pendiente con este nombre de restaurante en esa ciudad.' };
      }
      if (error.code === '42501' || error.code === '23503') {
        return { ok: false, reason: 'invalid_location', message: 'La ciudad o zona seleccionada no es válida, o faltó aceptar los términos.' };
      }
      if (error.code === '23514') {
        return { ok: false, reason: 'invalid_data', message: 'Algún dato excede el largo permitido o tiene un formato inválido.' };
      }
      return { ok: false, reason: 'unknown', message: 'No se pudo registrar la solicitud. Inténtalo nuevamente.' };
    }

    return {
      ok: true,
      application: {
        id: newId,
        ownerName: appData.ownerName,
        ownerEmail: normalizedEmail,
        ownerPhone: appData.ownerPhone,
        restaurantName: appData.restaurantName,
        category: appData.category,
        cityId: realCityId,
        zoneId: realZoneId,
        address: appData.address,
        description: appData.description,
        whatsapp: appData.whatsapp,
        minOrder: appData.minOrder,
        deliveryModes: appData.deliveryModes,
        deliveryFee: appData.deliveryFee,
        deliveryRadiusKm: appData.deliveryRadiusKm,
        estimatedDeliveryMinutes: appData.estimatedDeliveryMinutes,
        scheduleHours: appData.scheduleHours,
        notes: appData.notes,
        commissionRateAccepted: appData.commissionRateAccepted,
        termsVersion: appData.termsVersion,
        status: 'submitted',
        submittedAt: Date.now(),
      }
    };
  } catch (err: unknown) {
    console.warn('⚠️ Excepción al insertar aplicacion en Supabase:', err);
    return { ok: false, reason: 'unknown', message: 'Error inesperado al conectar con el servidor.' };
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

    // Las imágenes viven en un bucket PRIVADO: se resuelven a URLs firmadas de corta vida.
    // Solo el platform_admin pasa la política de lectura; para otros usuarios no habrá URL.
    const client = supabase;
    const signPath = async (path: unknown): Promise<string | undefined> => {
      if (typeof path !== 'string' || !path) return undefined;
      const { data: signed } = await client.storage.from('application-assets').createSignedUrl(path, 3600);
      return signed?.signedUrl;
    };

    return await Promise.all(data.map(async (app: Record<string, unknown>): Promise<RestaurantApplication> => ({
      id: app.id as string,
      ownerName: app.owner_name as string,
      ownerEmail: app.owner_email as string,
      ownerPhone: app.owner_phone as string,
      restaurantName: app.restaurant_name as string,
      category: app.category as string,
      cityId: app.city_id as string,
      zoneId: app.zone_id as string,
      address: app.address as string,
      description: (app.description as string | null) ?? undefined,
      whatsapp: app.whatsapp as string | undefined,
      minOrder: app.min_order as number | undefined,
      deliveryModes: app.delivery_modes as OrderFulfillment[],
      deliveryFee: app.delivery_fee as number | undefined,
      deliveryRadiusKm: app.delivery_radius_km as number | undefined,
      estimatedDeliveryMinutes: (app.estimated_delivery_minutes as number | null) ?? undefined,
      scheduleHours: (app.schedule_hours as string | null) ?? undefined,
      logoUrl: await signPath(app.logo_path),
      bannerUrl: await signPath(app.banner_path),
      commissionRateAccepted: app.commission_rate_accepted !== null && app.commission_rate_accepted !== undefined ? Number(app.commission_rate_accepted) : undefined,
      termsAcceptedAt: app.terms_accepted_at ? new Date(app.terms_accepted_at as string).getTime() : undefined,
      termsVersion: (app.terms_version as string | null) ?? undefined,
      notes: app.notes as string | undefined,
      status: app.status as RestaurantApplication['status'],
      submittedAt: new Date(app.created_at as string).getTime(),
      reviewedAt: app.reviewed_at ? new Date(app.reviewed_at as string).getTime() : undefined,
      reviewNote: app.review_note as string | undefined,
      activatedAt: app.activated_at ? new Date(app.activated_at as string).getTime() : undefined,
      activatedTenantId: app.activated_restaurant_id as string | undefined,
    })));
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

export async function updateLiveRestaurantOpenStatus(tenantId: string, isOpen: boolean): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false;
  try {
    const { error } = await supabase
      .from('restaurants')
      .update({ is_open: isOpen })
      .eq('id', tenantId);
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('⚠️ Error updating restaurant open status:', err);
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

export async function updateLiveProduct(productId: string, updates: Partial<Product>): Promise<Product | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  try {
    const dbUpdates: any = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.desc !== undefined) dbUpdates.description = updates.desc || null;
    if (updates.category !== undefined) dbUpdates.category = updates.category;
    if (updates.price !== undefined) dbUpdates.price_cop = updates.price;
    if (updates.available !== undefined) dbUpdates.available = updates.available;
    if (updates.image !== undefined) dbUpdates.image_url = updates.image || null;
    if (updates.isArchived !== undefined) dbUpdates.is_archived = updates.isArchived;
    if (updates.sortOrder !== undefined) dbUpdates.sort_order = updates.sortOrder;
    if (updates.tags !== undefined) dbUpdates.tags = updates.tags;
    if (updates.preparationTimeMinutes !== undefined) dbUpdates.preparation_time_minutes = updates.preparationTimeMinutes;
    if (updates.ingredients !== undefined) dbUpdates.ingredients = updates.ingredients;
    if (updates.allergens !== undefined) dbUpdates.allergens = updates.allergens;

    if (Object.keys(dbUpdates).length === 0) return null;

    const { data, error } = await supabase
      .from('products')
      .update(dbUpdates)
      .eq('id', productId)
      .select()
      .single();

    if (error || !data) throw error;
    return mapDbProductToProduct(data as unknown as import('./supabaseTypes').DbProduct);
  } catch (err) {
    console.warn('⚠️ Error updating live product:', err);
    return null;
  }
}

export async function deleteLiveProduct(productId: string): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false;
  try {
    const { error } = await supabase.from('products').delete().eq('id', productId);
    if (error) {
      console.warn('⚠️ Error deleting product, maybe foreign key violation. Archiving instead.');
      const { error: archiveError } = await supabase.from('products').update({ is_archived: true, available: false }).eq('id', productId);
      return !archiveError;
    }
    return true;
  } catch (err) {
    console.warn('⚠️ Error deleting product:', err);
    return false;
  }
}

export async function createLivePost(tenantId: string, title: string, desc: string, price: number, mediaUrl: string, mediaType: 'photo' | 'video', productId?: string, width?: number, height?: number): Promise<Post | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  try {
    const { data, error } = await supabase.from('posts').insert({
      restaurant_id: tenantId,
      title,
      description: desc || null,
      price_cop: price,
      media_url: mediaUrl,
      media_type: mediaType,
      is_published: true,
      product_id: productId || null,
      media_width: width || null,
      media_height: height || null,
      aspect_ratio: (width && height) ? Number((width / height).toFixed(4)) : null
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

interface DBRestaurantUpdate {
  name?: string;
  description?: string;
  category?: string;
  phone?: string;
  whatsapp?: string;
  address?: string;
  logo_url?: string;
  logo_emoji?: string;
  banner_url?: string;
  specialties?: string[];
  estimated_delivery_minutes?: number | string;
  is_open?: boolean;
  accepting_orders?: boolean;
  delivery_fee?: number;
  min_order?: number;
  delivery_radius_km?: number;
  delivery_modes?: string[];
}

export async function updateRemoteTenant(tenantId: string, updates: Partial<Tenant>): Promise<Tenant | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  try {
    const dbUpdates: DBRestaurantUpdate = {};
    if (typeof updates.name === 'string') dbUpdates.name = updates.name;
    if (typeof updates.description === 'string') dbUpdates.description = updates.description;
    if (typeof updates.category === 'string') dbUpdates.category = updates.category;
    if (typeof updates.phone === 'string') dbUpdates.phone = updates.phone;
    if (typeof updates.whatsapp === 'string') dbUpdates.whatsapp = updates.whatsapp;
    if (typeof updates.address === 'string') dbUpdates.address = updates.address;
    if (typeof updates.logoUrl === 'string') dbUpdates.logo_url = updates.logoUrl;
    if (typeof updates.logoEmoji === 'string') dbUpdates.logo_emoji = updates.logoEmoji;
    if (typeof updates.bannerUrl === 'string') dbUpdates.banner_url = updates.bannerUrl;
    if (Array.isArray(updates.specialties)) dbUpdates.specialties = updates.specialties;
    
    if (typeof updates.estimatedDeliveryMinutes === 'number' || typeof updates.estimatedDeliveryMinutes === 'string') {
      dbUpdates.estimated_delivery_minutes = updates.estimatedDeliveryMinutes;
    }
    
    if (typeof updates.isOpen === 'boolean') dbUpdates.is_open = updates.isOpen;
    if (typeof updates.acceptingOrders === 'boolean') dbUpdates.accepting_orders = updates.acceptingOrders;
    if (typeof updates.deliveryFee === 'number') dbUpdates.delivery_fee = updates.deliveryFee;
    if (typeof updates.minOrder === 'number') dbUpdates.min_order = updates.minOrder;
    if (typeof updates.deliveryRadiusKm === 'number') dbUpdates.delivery_radius_km = updates.deliveryRadiusKm;
    if (Array.isArray(updates.deliveryModes)) dbUpdates.delivery_modes = updates.deliveryModes;

    let tenantUpdated = false;
    
    if (Object.keys(dbUpdates).length > 0) {
      const { error } = await supabase
        .from('restaurants')
        .update(dbUpdates)
        .eq('id', tenantId);

      if (error) throw error;
      tenantUpdated = true;
    }

    if (updates.hours && Array.isArray(updates.hours)) {
      const hoursToUpsert = updates.hours.map(h => ({
        restaurant_id: tenantId,
        day_of_week: h.dayOfWeek,
        is_open: h.isOpen,
        open_time: h.openTime || null,
        close_time: h.closeTime || null,
        open_time2: h.openTime2 || null,
        close_time2: h.closeTime2 || null
      }));
      
      const { error } = await supabase
        .from('restaurant_hours')
        .upsert(hoursToUpsert, { onConflict: 'restaurant_id,day_of_week' });
        
      if (error) throw error;
      tenantUpdated = true;
    }

    if (!tenantUpdated) return null; // No updates provided

    const { data, error } = await supabase
      .from('restaurants')
      .select()
      .eq('id', tenantId)
      .single();

    if (error) throw error;
    
    return data ? mapDbRestaurantToTenant(data as import('./supabaseTypes').DbRestaurant) : null;
  } catch (err) {
    console.error('⚠️ Error updating remote tenant:', err);
    return null;
  }
}

// ============================================================================
// 10. TEAM MEMBERS MANAGEMENT
// ============================================================================

import type { RestaurantMember } from '../types';

export async function fetchRestaurantMembers(restaurantId: string): Promise<RestaurantMember[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  try {
    const { data, error } = await supabase
      .from('restaurant_members')
      .select('*')
      .eq('restaurant_id', restaurantId);
    
    if (error) throw error;
    
    return (data || []).map((db: any) => ({
      id: db.id,
      restaurantId: db.restaurant_id,
      userId: db.user_id,
      email: db.email,
      role: db.role,
      status: db.status,
      invitedBy: db.invited_by,
      invitedAt: db.invited_at,
      acceptedAt: db.accepted_at,
      revokedAt: db.revoked_at,
      createdAt: db.created_at,
      updatedAt: db.updated_at
    }));
  } catch (err) {
    console.error('⚠️ Error fetching restaurant members:', err);
    return [];
  }
}

export async function inviteRestaurantStaff(restaurantId: string, email: string): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured || !supabase) return { success: false, error: 'No connection' };
  try {
    const { error } = await supabase.rpc('invite_restaurant_staff', {
      p_restaurant_id: restaurantId,
      p_email: email
    });
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    console.error('⚠️ Error inviting staff:', err);
    return { success: false, error: err.message };
  }
}

export async function resendStaffInvitation(memberId: string): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured || !supabase) return { success: false, error: 'No connection' };
  try {
    const { error } = await supabase.rpc('resend_restaurant_invitation', { p_member_id: memberId });
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function suspendRestaurantMember(memberId: string): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured || !supabase) return { success: false, error: 'No connection' };
  try {
    const { error } = await supabase.rpc('update_member_status', { p_member_id: memberId, p_new_status: 'suspended' });
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function reactivateRestaurantMember(memberId: string): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured || !supabase) return { success: false, error: 'No connection' };
  try {
    const { error } = await supabase.rpc('update_member_status', { p_member_id: memberId, p_new_status: 'active' });
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function revokeRestaurantMember(memberId: string): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured || !supabase) return { success: false, error: 'No connection' };
  try {
    const { error } = await supabase.rpc('update_member_status', { p_member_id: memberId, p_new_status: 'revoked' });
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function acceptRestaurantInvitation(memberId: string): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured || !supabase) return { success: false, error: 'No connection' };
  try {
    const { error } = await supabase.rpc('accept_restaurant_invitation', { p_member_id: memberId });
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
