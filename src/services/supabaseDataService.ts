import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { Tenant, Product, Post, RestaurantApplication, OrderFulfillment, City, Zone, RestaurantDeliveryMode, PostComment, RestaurantReview, Driver, RestaurantMember, RestaurantMemberRole, RestaurantMemberStatus } from '../types';
import type {
  DbRestaurant, DbProduct, DbPost
} from './supabaseTypes';
import {
  mapDbRestaurantToTenant,
  mapDbProductToProduct,
  mapDbPostToPost
} from './supabaseTypes';
import { reportDataError } from './dataErrors';

/**
 * Servicio de Sincronización en Tiempo Real con Supabase.
 * Permite cargar datos reales del servidor PostgreSQL sin depender de mocks inventados.
 */

export async function fetchLiveCities(): Promise<City[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  try {
    const { data, error } = await supabase.from('cities').select('*').eq('is_active', true).order('name');
    if (error || !data) {
      reportDataError('ciudades', 'No se pudieron cargar las ciudades.');
      return [];
    }
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
    if (error || !data) {
      reportDataError('zonas', 'No se pudieron cargar las zonas de cobertura.');
      return [];
    }
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
        rating_avg, rating_count, accepts_cash, table_service_enabled,
        payout_bank_name, payout_account_type, payout_account_number, payout_account_holder, payout_document_type, payout_document_number,
        wompi_merchant_id, cash_commission_limit_cop, auto_lock_cash_on_limit,
        restaurant_hours ( id, day_of_week, is_closed, open_time, close_time, interval_index )
      `);

    if (error || !data) {
      reportDataError('restaurantes', 'No se pudieron cargar los restaurantes.');
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
    console.warn('⚠️ Excepción al consultar Supabase (restaurantes):', err);
    reportDataError('restaurantes', 'No se pudieron cargar los restaurantes.');
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
      reportDataError('productos', 'No se pudieron cargar los productos.');
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
    reportDataError('productos', 'No se pudieron cargar los productos.');
    return [];
  }
}

interface CommentAuthorMeta {
  fullName: string;
  username?: string;
  avatarUrl?: string;
}

async function fetchProfilesMetaMap(userIds: string[]): Promise<Map<string, CommentAuthorMeta>> {
  const map = new Map<string, CommentAuthorMeta>();
  if (!isSupabaseConfigured || !supabase || userIds.length === 0) return map;

  const { data: rpcProfiles, error: rpcErr } = await supabase.rpc('get_public_profiles_by_ids', {
    p_user_ids: userIds
  });

  if (!rpcErr && Array.isArray(rpcProfiles)) {
    (rpcProfiles as Array<{ id: string; full_name: string | null; username?: string | null; avatar_url?: string | null }>).forEach((p) => {
      map.set(p.id, {
        fullName: p.full_name || 'Usuario',
        username: p.username || undefined,
        avatarUrl: p.avatar_url || undefined
      });
    });
    return map;
  }

  const { data: extProfiles, error: extErr } = await supabase
    .from('profiles')
    .select('id, full_name, username, avatar_url')
    .in('id', userIds);

  if (!extErr && extProfiles) {
    extProfiles.forEach((p: { id: string; full_name: string; username?: string | null; avatar_url?: string | null }) => {
      map.set(p.id, {
        fullName: p.full_name || 'Usuario',
        username: p.username || undefined,
        avatarUrl: p.avatar_url || undefined
      });
    });
    return map;
  }

  return map;
}

export async function fetchRemoteComments(postId: string): Promise<PostComment[]> {
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
    const profileMap = await fetchProfilesMetaMap(userIds);

    return comments.map((c: { id: string; post_id: string; user_id: string; content: string; created_at: string }) => {
      const meta = profileMap.get(c.user_id);
      return {
        id: c.id,
        postId: c.post_id,
        userId: c.user_id,
        userName: meta?.fullName || 'Usuario',
        userHandle: meta?.username,
        userAvatar: meta?.avatarUrl || '🥑',
        userAvatarUrl: meta?.avatarUrl,
        text: c.content,
        timeAgo: formatTimeAgo(c.created_at),
        likes: 0
      };
    });
  } catch (err) {
    console.error('⚠️ Excepción al cargar comentarios:', err);
    return [];
  }
}

export async function addRemoteComment(
  postId: string,
  userId: string,
  text: string,
  authorFallback?: { name?: string; username?: string; avatarUrl?: string }
): Promise<PostComment | null> {
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
    
    const profileMap = await fetchProfilesMetaMap([userId]);
    const meta = profileMap.get(userId);
    const finalName = meta?.fullName || authorFallback?.name || 'Usuario';
    const finalHandle = meta?.username || authorFallback?.username;
    const finalAvatarUrl = meta?.avatarUrl || authorFallback?.avatarUrl;
    
    return {
      id: data.id,
      postId: data.post_id,
      userId: data.user_id,
      userName: finalName,
      userHandle: finalHandle,
      userAvatar: finalAvatarUrl || '🥑',
      userAvatarUrl: finalAvatarUrl,
      text: data.content,
      timeAgo: formatTimeAgo(data.created_at),
      likes: 0
    };
  } catch (err) {
    console.error('⚠️ Excepción al insertar comentario:', err);
    return null;
  }
}

export async function deleteRemoteComment(commentId: string, _userId?: string): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false;
  try {
    // La política RLS post_comments_delete_author_or_restaurant valida si auth.uid()
    // es el autor del comentario o el dueño/staff del restaurante dueño del post.
    const { data, error } = await supabase
      .from('post_comments')
      .delete()
      .eq('id', commentId)
      .select('id');
    return !error && Array.isArray(data) && data.length > 0;
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

/** IDs de posts guardados por el usuario (para rehidratar el estado del feed al recargar). */
export async function fetchRemoteSavedPosts(userId: string): Promise<string[]> {
  if (!isSupabaseConfigured || !supabase || !userId) return [];
  try {
    const { data, error } = await supabase
      .from('saved_posts')
      .select('post_id')
      .eq('user_id', userId);
    if (error || !data) {
      console.warn('⚠️ Error cargando posts guardados:', error?.message);
      return [];
    }
    return data.map((r: { post_id: string }) => r.post_id);
  } catch {
    return [];
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

export async function fetchLivePosts(limit: number = 40, offset: number = 0): Promise<Post[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  try {
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const safeOffset = Math.max(0, offset);
    const currentUserId = (await supabase.auth.getUser()).data.user?.id;

    // Fetch paginated posts with aggregated counts and user's like status (P2 #2)
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
        is_archived,
        created_at,
        updated_at,
        restaurants!inner(name, category, slug, status)
      `)
      .eq('is_archived', false)
      .eq('restaurants.status', 'active')
      .order('created_at', { ascending: false })
      .range(safeOffset, safeOffset + safeLimit - 1);

    if (error) {
      reportDataError('publicaciones', 'No se pudieron cargar las publicaciones.');
      console.error('⚠️ Error RLS o BD al consultar Supabase (Posts):', error);
      return [];
    }
    if (!data || data.length === 0) return [];

    // Fetch likes and bounded comment previews for the current page of posts in parallel
    const postIds = data.map((p: { id: string }) => p.id);
    
    const [likesData, commentsData, userLikesData] = await Promise.all([
      supabase
        .from('post_likes')
        .select('post_id')
        .in('post_id', postIds)
        .limit(2000),
      
      supabase
        .from('post_comments')
        .select('id, post_id, user_id, content, created_at')
        .in('post_id', postIds)
        .order('created_at', { ascending: false })
        .limit(250),
      
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
      const profileMap = await fetchProfilesMetaMap(userIds);

      commentsData.data.forEach((comment: { id: string; post_id: string; user_id: string; content: string; created_at: string }) => {
        const postComments = commentsMap.get(comment.post_id) || [];
        const meta = profileMap.get(comment.user_id);
        postComments.push({
          id: comment.id,
          postId: comment.post_id,
          userId: comment.user_id,
          userName: meta?.fullName || 'Usuario',
          userHandle: meta?.username,
          userAvatar: meta?.avatarUrl || '🥑',
          userAvatarUrl: meta?.avatarUrl,
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

      // Los hashtags se persisten dentro de la descripción (sin columna propia):
      // se extraen para el render de tags y se limpian del caption.
      const rawDesc = dbPost.description || '';
      const extractedTags = Array.from(new Set(rawDesc.match(/#[\p{L}0-9_]+/gu) || []));
      const createdAtMs = new Date(dbPost.created_at).getTime();
      const storyTtlMs = 24 * 60 * 60 * 1000;

      // Las historias efímeras (#story24h) vencidas (>24h) no deben cargarse ni aparecer como activas
      if (
        extractedTags.includes('#story24h') &&
        (!Number.isFinite(createdAtMs) || Date.now() - createdAtMs >= storyTtlMs)
      ) {
        return null;
      }

      const cleanDesc = extractedTags.length > 0
        ? rawDesc.replace(/#[\p{L}0-9_]+/gu, '').replace(/\s{2,}/g, ' ').trim()
        : rawDesc;

      const post: Post = {
        id: dbPost.id,
        tenantId: dbPost.restaurant_id,
        tenantName: restaurant.name,
        tenantCategory: restaurant.category,
        tenantLogoEmoji: '🍽️',
        dishName: dbPost.title,
        dishEmoji: '🍽️',
        desc: cleanDesc,
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
        createdAt: createdAtMs,
        hashtags: extractedTags.length > 0 ? extractedTags : undefined
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
    reportDataError('publicaciones', 'No se pudieron cargar las publicaciones.');
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
  logoUrl?: string;
  bannerUrl?: string;
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
 * Sube logo/banner de una solicitud YA CREADA directamente al bucket público `gastro-media`
 * bajo `applications/{applicationId}/...` y sincroniza `logo_url` y `banner_url` en
 * `restaurant_applications` y `restaurants`. Si falla el bucket directo, intenta la Edge Function.
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
    let logoUrl: string | undefined;
    let bannerUrl: string | undefined;

    for (const { kind, file } of entries) {
      const rawExt = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
      const ext = ['jpg', 'jpeg', 'png', 'webp'].includes(rawExt) ? rawExt : 'jpg';
      const filePath = `applications/${applicationId}/${kind}_${Date.now()}.${ext}`;

      const { error: directErr } = await supabase.storage
        .from('gastro-media')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true,
          contentType: file.type
        });

      if (!directErr) {
        const { data: pubData } = supabase.storage.from('gastro-media').getPublicUrl(filePath);
        if (pubData?.publicUrl) {
          if (kind === 'logo') logoUrl = pubData.publicUrl;
          if (kind === 'banner') bannerUrl = pubData.publicUrl;
        }
      } else {
        console.warn(`⚠️ Subida directa a gastro-media (${kind}) falló:`, directErr.message);
      }
    }

    if (logoUrl || bannerUrl) {
      const { error: rpcAttachErr } = await supabase.rpc('attach_application_media_urls', {
        p_application_id: applicationId,
        p_logo_url: logoUrl || null,
        p_banner_url: bannerUrl || null
      });

      if (!rpcAttachErr) {
        return {
          logo: Boolean(logoUrl),
          banner: Boolean(bannerUrl),
          logoUrl,
          bannerUrl
        };
      }

      const dbPatch: Record<string, string> = {};
      if (logoUrl) dbPatch.logo_url = logoUrl;
      if (bannerUrl) dbPatch.banner_url = bannerUrl;

      await supabase
        .from('restaurant_applications')
        .update(dbPatch)
        .eq('id', applicationId);

      return {
        logo: Boolean(logoUrl),
        banner: Boolean(bannerUrl),
        logoUrl,
        bannerUrl
      };
    }

    // Fallback a Edge Function si el bucket directo no aceptó el archivo
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

    const result = fin.data as { logo?: boolean; banner?: boolean; logoUrl?: string; bannerUrl?: string; rejected?: string[] } | null;
    const rejected = result?.rejected ?? [];
    return {
      logo: !!result?.logo,
      banner: !!result?.banner,
      logoUrl: result?.logoUrl,
      bannerUrl: result?.bannerUrl,
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
      logo_url: appData.logoUrl || null,
      banner_url: appData.bannerUrl || null,
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
        logoUrl: appData.logoUrl,
        bannerUrl: appData.bannerUrl,
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

    if (error || !data) {
      reportDataError('solicitudes', 'No se pudieron cargar las solicitudes de restaurantes.');
      return [];
    }

    // Las imágenes pueden venir en logo_url/banner_url (bucket público gastro-media)
    // o en logo_path/banner_path (bucket privado application-assets con URL firmada).
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
      logoUrl: ((app.logo_url as string | null) || undefined) ?? await signPath(app.logo_path),
      bannerUrl: ((app.banner_url as string | null) || undefined) ?? await signPath(app.banner_path),
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
    reportDataError('solicitudes', 'No se pudieron cargar las solicitudes de restaurantes.');
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
    const safeMimeToExt: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'video/mp4': 'mp4',
      'video/webm': 'webm'
    };
    const safeExt = safeMimeToExt[file.type];
    if (!safeExt) {
      throw new Error('Formato de archivo no permitido (solo JPG, PNG, WebP, MP4 o WebM).');
    }
    const maxBytes = file.type.startsWith('video/') ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size <= 0 || file.size > maxBytes) {
      throw new Error('El tamaño del archivo supera el límite permitido.');
    }

    const uuid = crypto.randomUUID();
    const filePath = `restaurants/${tenantId}/${folder}/${uuid}.${safeExt}`;

    const { error } = await supabase.storage
      .from('gastro-media')
      .upload(filePath, file, {
        upsert: false,
        contentType: file.type === 'image/jpg' ? 'image/jpeg' : file.type
      });

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

export async function createLiveProduct(tenantId: string, newProd: Omit<Product, 'id' | 'tenantId'>): Promise<Product | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  try {
    const { data, error } = await supabase.from('products').insert({
      restaurant_id: tenantId,
      name: newProd.name,
      description: newProd.desc || null,
      category: newProd.category,
      price_cop: Math.round(newProd.price),
      available: newProd.available,
      image_url: newProd.image || null,
      tags: newProd.tags?.length ? newProd.tags : null,
      preparation_time_minutes: newProd.preparationTimeMinutes ?? null,
      ingredients: newProd.ingredients?.length ? newProd.ingredients : null,
      allergens: newProd.allergens?.length ? newProd.allergens : null,
      sort_order: newProd.sortOrder ?? 0
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
    const dbUpdates: Record<string, unknown> = {};
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
    const { data: existingProd } = await supabase
      .from('products')
      .select('image_url')
      .eq('id', productId)
      .maybeSingle();

    const imageUrlToClean = (existingProd as { image_url?: string | null } | null)?.image_url;

    const { error } = await supabase.from('products').delete().eq('id', productId);
    if (error) {
      console.warn('⚠️ Error deleting product, maybe foreign key violation. Archiving instead.');
      const { error: archiveError } = await supabase
        .from('products')
        .update({ is_archived: true, available: false })
        .eq('id', productId);
      return !archiveError;
    }

    if (imageUrlToClean) {
      await deleteMediaFile(imageUrlToClean);
    }
    return true;
  } catch (err) {
    console.warn('⚠️ Error deleting product:', err);
    return false;
  }
}

export async function createLivePost(tenantId: string, title: string, desc: string, price: number, mediaUrl: string, mediaType: 'photo' | 'video', productId?: string, width?: number, height?: number, hashtags?: string[]): Promise<Post | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  try {
    // La tabla posts no tiene columna de hashtags: se anexan a la descripción
    // para que sobrevivan a la recarga y sigan siendo buscables en el feed.
    const tags = (hashtags || []).filter(t => t.trim().length > 0);
    const fullDesc = tags.length > 0 ? `${desc || ''} ${tags.join(' ')}`.trim() : (desc || null);
    const isUuid = Boolean(productId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productId));
    const safeWidth = width && Number.isFinite(width) && width > 0 ? Math.round(width) : null;
    const safeHeight = height && Number.isFinite(height) && height > 0 ? Math.round(height) : null;

    const { data, error } = await supabase.from('posts').insert({
      restaurant_id: tenantId,
      title: title.trim(),
      description: fullDesc,
      price_cop: Math.max(0, Math.round(price)),
      media_url: mediaUrl,
      media_type: mediaType,
      is_published: true,
      product_id: isUuid ? productId : null,
      media_width: safeWidth,
      media_height: safeHeight,
      aspect_ratio: (safeWidth && safeHeight) ? Number((safeWidth / safeHeight).toFixed(4)) : null
    }).select().single();

    if (error || !data) throw error;
    const post = mapDbPostToPost(data as unknown as DbPost);
    return post;
  } catch (err) {
    console.warn('⚠️ Error creating live post:', err);
    return null;
  }
}

export async function deleteLivePost(postId: string, restaurantId: string): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured || !supabase) return { success: false, error: 'Supabase no está configurado.' };
  try {
    const { data, error } = await supabase.rpc('delete_restaurant_post', { 
      p_post_id: postId, 
      p_restaurant_id: restaurantId 
    });
    if (error) throw error;
    
    const resData = data as { action?: string; media_url?: string } | null;
    if (resData?.action === 'deleted' && resData?.media_url) {
      const bucketName = 'gastro-media';
      const marker = `/object/public/${bucketName}/`;
      const markerIndex = resData.media_url.indexOf(marker);
      if (markerIndex !== -1) {
        const filePath = resData.media_url.substring(markerIndex + marker.length);
        if (filePath) {
          await supabase.storage.from(bucketName).remove([filePath]);
        }
      }
    }
    
    return { success: true };
  } catch (err: unknown) {
    console.warn('⚠️ Error deleting live post:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Error al eliminar la publicación' };
  }
}

interface DBRestaurantUpdate {
  name?: string;
  description?: string;
  category?: string;
  phone?: string;
  whatsapp?: string;
  address?: string;
  city_id?: string;
  zone_id?: string | null;
  logo_url?: string;
  logo_emoji?: string;
  banner_url?: string;
  specialties?: string[];
  estimated_delivery_minutes?: number | string;
  is_open?: boolean;
  accepting_orders?: boolean;
  table_service_enabled?: boolean;
  accepts_cash?: boolean;
  delivery_fee?: number;
  min_order?: number;
  delivery_radius_km?: number;
  delivery_modes?: string[];
  payout_bank_name?: string | null;
  payout_account_type?: string | null;
  payout_account_number?: string | null;
  payout_account_holder?: string | null;
  payout_document_type?: string | null;
  payout_document_number?: string | null;
  wompi_merchant_id?: string | null;
  cash_commission_limit_cop?: number | null;
  auto_lock_cash_on_limit?: boolean | null;
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
    if (typeof updates.cityId === 'string' && updates.cityId) dbUpdates.city_id = updates.cityId;
    if (typeof updates.zoneId === 'string') dbUpdates.zone_id = updates.zoneId || null;
    if (typeof updates.logoUrl === 'string') dbUpdates.logo_url = updates.logoUrl;
    if (typeof updates.logoEmoji === 'string') dbUpdates.logo_emoji = updates.logoEmoji;
    if (typeof updates.bannerUrl === 'string') dbUpdates.banner_url = updates.bannerUrl;
    if (Array.isArray(updates.specialties)) dbUpdates.specialties = updates.specialties;
    
    if (typeof updates.estimatedDeliveryMinutes === 'number' || typeof updates.estimatedDeliveryMinutes === 'string') {
      dbUpdates.estimated_delivery_minutes = updates.estimatedDeliveryMinutes;
    }
    
    if (typeof updates.isOpen === 'boolean') dbUpdates.is_open = updates.isOpen;
    if (typeof updates.acceptingOrders === 'boolean') dbUpdates.accepting_orders = updates.acceptingOrders;
    if (typeof updates.tableServiceEnabled === 'boolean') dbUpdates.table_service_enabled = updates.tableServiceEnabled;
    if (typeof updates.acceptsCash === 'boolean') dbUpdates.accepts_cash = updates.acceptsCash;
    if (typeof updates.deliveryFee === 'number') dbUpdates.delivery_fee = updates.deliveryFee;
    if (typeof updates.minOrder === 'number') dbUpdates.min_order = updates.minOrder;
    if (typeof updates.deliveryRadiusKm === 'number') dbUpdates.delivery_radius_km = updates.deliveryRadiusKm;
    if (Array.isArray(updates.deliveryModes)) dbUpdates.delivery_modes = updates.deliveryModes;
    if (typeof updates.payoutBankName === 'string') dbUpdates.payout_bank_name = updates.payoutBankName.trim() || null;
    if (typeof updates.payoutAccountType === 'string') dbUpdates.payout_account_type = updates.payoutAccountType.trim() || null;
    if (typeof updates.payoutAccountNumber === 'string') dbUpdates.payout_account_number = updates.payoutAccountNumber.trim() || null;
    if (typeof updates.payoutAccountHolder === 'string') dbUpdates.payout_account_holder = updates.payoutAccountHolder.trim() || null;
    if (typeof updates.payoutDocumentType === 'string') dbUpdates.payout_document_type = updates.payoutDocumentType.trim() || null;
    if (typeof updates.payoutDocumentNumber === 'string') dbUpdates.payout_document_number = updates.payoutDocumentNumber.trim() || null;
    if (typeof updates.wompiMerchantId === 'string') dbUpdates.wompi_merchant_id = updates.wompiMerchantId.trim() || null;
    if (typeof updates.cashCommissionLimitCop === 'number') dbUpdates.cash_commission_limit_cop = updates.cashCommissionLimitCop;
    if (typeof updates.autoLockCashOnLimit === 'boolean') dbUpdates.auto_lock_cash_on_limit = updates.autoLockCashOnLimit;

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
      const hoursToUpsert: Array<{
        restaurant_id: string;
        day_of_week: number;
        interval_index: number;
        is_closed: boolean;
        open_time: string | null;
        close_time: string | null;
      }> = [];
      const secondIntervalsToDelete: number[] = [];

      for (const h of updates.hours) {
        hoursToUpsert.push({
          restaurant_id: tenantId,
          day_of_week: h.dayOfWeek,
          interval_index: 0,
          is_closed: !h.isOpen,
          open_time: h.isOpen && h.openTime ? h.openTime : null,
          close_time: h.isOpen && h.closeTime ? h.closeTime : null
        });

        if (h.isOpen && h.openTime2 && h.closeTime2) {
          hoursToUpsert.push({
            restaurant_id: tenantId,
            day_of_week: h.dayOfWeek,
            interval_index: 1,
            is_closed: false,
            open_time: h.openTime2,
            close_time: h.closeTime2
          });
        } else {
          secondIntervalsToDelete.push(h.dayOfWeek);
        }
      }

      const { error: hoursErr } = await supabase
        .from('restaurant_hours')
        .upsert(hoursToUpsert, { onConflict: 'restaurant_id,day_of_week,interval_index' });

      if (hoursErr) {
        console.warn('⚠️ Error guardando horarios del restaurante:', hoursErr.message);
      } else {
        if (secondIntervalsToDelete.length > 0) {
          await supabase
            .from('restaurant_hours')
            .delete()
            .eq('restaurant_id', tenantId)
            .eq('interval_index', 1)
            .in('day_of_week', secondIntervalsToDelete);
        }
        tenantUpdated = true;
      }
    }

    if (!tenantUpdated) return null; // No updates provided

    const { data, error } = await supabase
      .from('restaurants')
      .select(`
        *,
        restaurant_hours ( id, day_of_week, is_closed, open_time, close_time, interval_index )
      `)
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

interface DbRestaurantMemberRow {
  id: string;
  restaurant_id: string;
  user_id: string | null;
  email: string;
  role: RestaurantMemberRole;
  status: RestaurantMemberStatus;
  invited_by?: string | null;
  invited_at?: string | null;
  accepted_at?: string | null;
  revoked_at?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export async function fetchRestaurantMembers(restaurantId: string): Promise<RestaurantMember[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  try {
    const { data, error } = await supabase
      .from('restaurant_members')
      .select('*')
      .eq('restaurant_id', restaurantId);
    
    if (error) throw error;
    
    return ((data || []) as DbRestaurantMemberRow[]).map((db) => ({
      id: db.id,
      restaurantId: db.restaurant_id,
      userId: db.user_id,
      email: db.email,
      role: db.role,
      status: db.status,
      invitedBy: db.invited_by ?? undefined,
      invitedAt: db.invited_at ?? undefined,
      acceptedAt: db.accepted_at ?? undefined,
      revokedAt: db.revoked_at ?? undefined,
      createdAt: db.created_at,
      updatedAt: db.updated_at ?? undefined
    }));
  } catch (err) {
    console.error('⚠️ Error fetching restaurant members:', err);
    reportDataError('equipo', 'No se pudo cargar el equipo del restaurante.');
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
  } catch (err: unknown) {
    console.error('⚠️ Error inviting staff:', err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function resendStaffInvitation(memberId: string): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured || !supabase) return { success: false, error: 'No connection' };
  try {
    const { error } = await supabase.rpc('resend_restaurant_invitation', { p_member_id: memberId });
    if (error) throw error;
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function suspendRestaurantMember(memberId: string): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured || !supabase) return { success: false, error: 'No connection' };
  try {
    const { error } = await supabase.rpc('update_member_status', { p_member_id: memberId, p_new_status: 'suspended' });
    if (error) throw error;
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function reactivateRestaurantMember(memberId: string): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured || !supabase) return { success: false, error: 'No connection' };
  try {
    const { error } = await supabase.rpc('update_member_status', { p_member_id: memberId, p_new_status: 'active' });
    if (error) throw error;
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function revokeRestaurantMember(memberId: string): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured || !supabase) return { success: false, error: 'No connection' };
  try {
    const { error } = await supabase.rpc('update_member_status', { p_member_id: memberId, p_new_status: 'revoked' });
    if (error) throw error;
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function acceptRestaurantInvitation(memberId: string): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured || !supabase) return { success: false, error: 'No connection' };
  try {
    const { error } = await supabase.rpc('accept_restaurant_invitation', { p_member_id: memberId });
    if (error) throw error;
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ============================================================================
// 11. DRIVERS & KDS PERSISTENCE (P1-10)
// ============================================================================

interface DbRestaurantDriverRow {
  id: string;
  restaurant_id: string;
  name: string;
  phone: string;
  vehicle: string | null;
  status: 'available' | 'busy' | 'offline';
  is_active: boolean;
}

export async function fetchRestaurantDrivers(restaurantId: string): Promise<Driver[]> {
  if (!isSupabaseConfigured || !supabase || !restaurantId) return [];
  try {
    let { data, error } = await supabase
      .from('restaurant_drivers')
      .select('id, restaurant_id, name, phone, vehicle, status, is_active')
      .eq('restaurant_id', restaurantId)
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    if (error && error.message.includes('is_active')) {
      const fallback = await supabase
        .from('restaurant_drivers')
        .select('id, restaurant_id, name, phone, vehicle, status')
        .eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: true });
      data = (fallback.data || []).map(d => ({ ...d, is_active: true })) as typeof data;
      error = fallback.error;
    }

    if (error || !data) return [];
    return (data as DbRestaurantDriverRow[]).map((d) => ({
      id: d.id,
      tenantId: d.restaurant_id,
      name: d.name,
      phone: d.phone,
      vehicle: d.vehicle || 'Moto',
      status: d.status || 'available'
    }));
  } catch {
    return [];
  }
}

export async function createRestaurantDriver(
  restaurantId: string,
  payload: { name: string; phone: string; vehicle?: string }
): Promise<Driver | null> {
  if (!isSupabaseConfigured || !supabase || !restaurantId) return null;
  try {
    const { data, error } = await supabase
      .from('restaurant_drivers')
      .insert({
        restaurant_id: restaurantId,
        name: payload.name.trim(),
        phone: payload.phone.trim(),
        vehicle: (payload.vehicle || 'Moto').trim(),
        status: 'available',
        is_active: true
      })
      .select('id, restaurant_id, name, phone, vehicle, status, is_active')
      .single();

    if (error || !data) return null;
    const row = data as DbRestaurantDriverRow;
    return {
      id: row.id,
      tenantId: row.restaurant_id,
      name: row.name,
      phone: row.phone,
      vehicle: row.vehicle || 'Moto',
      status: row.status || 'available'
    };
  } catch {
    return null;
  }
}

export async function deleteRestaurantDriver(driverId: string): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase || !driverId) return false;
  try {
    const { error } = await supabase
      .from('restaurant_drivers')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', driverId);
    return !error;
  } catch {
    return false;
  }
}

export async function assignRemoteOrderDriver(orderId: string, driverId: string | null): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase || !orderId) return false;
  try {
    const { error } = await supabase.rpc('assign_order_driver', {
      p_order_id: orderId,
      p_driver_id: driverId
    });
    return !error;
  } catch {
    return false;
  }
}

export async function updateRemoteOrderKdsItems(
  orderId: string,
  checkedItems: Record<string, boolean>
): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase || !orderId) return false;
  try {
    const { error } = await supabase.rpc('update_order_kds_items', {
      p_order_id: orderId,
      p_checked_items: checkedItems
    });
    return !error;
  } catch {
    return false;
  }
}

// --- FASE 2 y 3: TABLE QR SERVICE ---
export async function fetchRestaurantTables(restaurantId: string) {
  if (!isSupabaseConfigured || !supabase) return [];
  try {
    const { data, error } = await supabase
      .from('restaurant_tables')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .is('archived_at', null)
      .order('table_number', { ascending: true });

    if (error) throw error;
    return data.map(db => ({
      id: db.id,
      restaurantId: db.restaurant_id,
      tableNumber: db.table_number,
      displayName: db.display_name,
      capacity: db.capacity,
      isActive: db.is_active,
      publicToken: db.public_token,
      createdAt: db.created_at
    }));
  } catch (err) {
    console.warn('⚠️ Error fetching tables:', err);
    reportDataError('mesas', 'No se pudieron cargar las mesas.');
    return [];
  }
}

export async function createRestaurantTable(payload: { restaurantId: string; tableNumber: string; displayName?: string; capacity?: number }) {
  if (!isSupabaseConfigured || !supabase) return { success: false, error: 'No connection' };
  try {
    const { data, error } = await supabase
      .from('restaurant_tables')
      .insert({
        restaurant_id: payload.restaurantId,
        table_number: payload.tableNumber,
        display_name: payload.displayName || null,
        capacity: payload.capacity || null
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function updateRestaurantTable(id: string, payload: { tableNumber?: string; displayName?: string; capacity?: number; isActive?: boolean }) {
  if (!isSupabaseConfigured || !supabase) return { success: false, error: 'No connection' };
  try {
    const { error } = await supabase
      .from('restaurant_tables')
      .update({
        table_number: payload.tableNumber,
        display_name: payload.displayName,
        capacity: payload.capacity,
        is_active: payload.isActive,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) throw error;
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function archiveRestaurantTable(id: string) {
  if (!isSupabaseConfigured || !supabase) return { success: false, error: 'No connection' };
  try {
    const { error } = await supabase
      .from('restaurant_tables')
      .update({ archived_at: new Date().toISOString(), is_active: false })
      .eq('id', id);

    if (error) throw error;
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function regenerateTableToken(tableId: string): Promise<{ success: boolean; token?: string; error?: string }> {
  if (!isSupabaseConfigured || !supabase) return { success: false, error: 'No connection' };
  try {
    const { data, error } = await supabase.rpc('regenerate_table_token', { p_table_id: tableId });
    if (error) throw error;
    return { success: true, token: data as string };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function resolveTableByToken(token: string) {
  if (!isSupabaseConfigured || !supabase) return { success: false, error: 'No connection' };
  try {
    const { data, error } = await supabase.rpc('resolve_table_by_token', { p_token: token });
    if (error) throw error;
    if (data && data.error) return { success: false, error: data.error as string };
    return { success: true, data };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ============================================================================
// 12. RESTAURANT REVIEWS & RATINGS
// ============================================================================

interface DbRestaurantReviewRow {
  id: string;
  restaurant_id: string;
  order_id?: string | null;
  user_id: string;
  rating: number;
  comment: string;
  tags?: string[] | null;
  review_image_url?: string | null;
  author_name?: string | null;
  author_username?: string | null;
  author_avatar_url?: string | null;
  owner_reply?: string | null;
  owner_replied_at?: string | null;
  created_at: string;
  updated_at?: string | null;
}

const REVIEW_SELECT_COLS =
  'id, restaurant_id, order_id, user_id, rating, comment, tags, review_image_url, author_name, author_username, author_avatar_url, owner_reply, owner_replied_at, created_at, updated_at';

export async function fetchRestaurantReviews(restaurantId: string): Promise<RestaurantReview[]> {
  if (!isSupabaseConfigured || !supabase || !restaurantId) return [];
  try {
    const { data, error } = await supabase
      .from('restaurant_reviews')
      .select(REVIEW_SELECT_COLS)
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false });

    if (error || !data) {
      if (error) console.warn('⚠️ Error cargando reseñas del restaurante:', error.message);
      return [];
    }

    const rows = data as DbRestaurantReviewRow[];
    const userIds = Array.from(new Set(rows.map(r => r.user_id).filter(Boolean)));
    const profileMap = await fetchProfilesMetaMap(userIds);

    return rows.map(r => {
      const meta = profileMap.get(r.user_id);
      return {
        id: r.id,
        restaurantId: r.restaurant_id,
        orderId: r.order_id || undefined,
        userId: r.user_id,
        userName: meta?.fullName || r.author_name || 'Cliente verificado',
        userHandle: meta?.username || r.author_username || undefined,
        userAvatarUrl: meta?.avatarUrl || r.author_avatar_url || undefined,
        rating: Number(r.rating) || 5,
        comment: r.comment || '',
        tags: Array.isArray(r.tags) ? r.tags : [],
        reviewImageUrl: r.review_image_url || undefined,
        ownerReply: r.owner_reply || undefined,
        ownerRepliedAt: r.owner_replied_at || undefined,
        createdAt: r.created_at,
        timeAgo: formatTimeAgo(r.created_at)
      };
    });
  } catch (err) {
    console.warn('⚠️ Excepción cargando reseñas del restaurante:', err);
    return [];
  }
}

export async function fetchCustomerOrderReviews(userId: string): Promise<Record<string, RestaurantReview>> {
  if (!isSupabaseConfigured || !supabase || !userId) return {};
  try {
    const { data, error } = await supabase
      .from('restaurant_reviews')
      .select(REVIEW_SELECT_COLS)
      .eq('user_id', userId)
      .not('order_id', 'is', null);

    if (error || !data) return {};

    const rows = data as DbRestaurantReviewRow[];
    const map: Record<string, RestaurantReview> = {};
    for (const r of rows) {
      if (!r.order_id) continue;
      map[r.order_id] = {
        id: r.id,
        restaurantId: r.restaurant_id,
        orderId: r.order_id,
        userId: r.user_id,
        userName: r.author_name || 'Tú',
        userHandle: r.author_username || undefined,
        userAvatarUrl: r.author_avatar_url || undefined,
        rating: Number(r.rating) || 5,
        comment: r.comment || '',
        tags: Array.isArray(r.tags) ? r.tags : [],
        reviewImageUrl: r.review_image_url || undefined,
        ownerReply: r.owner_reply || undefined,
        ownerRepliedAt: r.owner_replied_at || undefined,
        createdAt: r.created_at,
        timeAgo: formatTimeAgo(r.created_at)
      };
    }
    return map;
  } catch {
    return {};
  }
}

export async function submitRestaurantReview(payload: {
  restaurantId: string;
  orderId?: string;
  userId: string;
  rating: number;
  comment: string;
  tags?: string[];
  reviewImageUrl?: string;
  authorFallback?: { name?: string; username?: string; avatarUrl?: string };
}): Promise<{
  success: boolean;
  review?: RestaurantReview;
  ratingAvg?: number;
  ratingCount?: number;
  error?: string;
}> {
  if (!isSupabaseConfigured || !supabase) {
    return { success: false, error: 'Sin conexión a la base de datos.' };
  }

  const cleanRating = Math.min(5, Math.max(1, Math.round(Number(payload.rating) || 5)));
  const cleanComment = (payload.comment || '').trim();
  const cleanTags = Array.isArray(payload.tags) ? payload.tags.filter(Boolean) : [];
  const cleanImageUrl = payload.reviewImageUrl ? payload.reviewImageUrl.trim() : null;

  try {
    let savedRow: DbRestaurantReviewRow | null = null;

    if (payload.orderId) {
      const { data: existing } = await supabase
        .from('restaurant_reviews')
        .select('id')
        .eq('order_id', payload.orderId)
        .maybeSingle();

      if (existing?.id) {
        const updatePayload: Record<string, unknown> = {
          rating: cleanRating,
          comment: cleanComment,
          tags: cleanTags,
          author_name: payload.authorFallback?.name || null,
          author_username: payload.authorFallback?.username || null,
          author_avatar_url: payload.authorFallback?.avatarUrl || null,
          updated_at: new Date().toISOString()
        };
        if (payload.reviewImageUrl !== undefined) {
          updatePayload.review_image_url = cleanImageUrl;
        }

        const { data: updated, error: updErr } = await supabase
          .from('restaurant_reviews')
          .update(updatePayload)
          .eq('id', existing.id)
          .select(REVIEW_SELECT_COLS)
          .single();

        if (updErr) return { success: false, error: updErr.message };
        savedRow = updated as DbRestaurantReviewRow;
      }
    }

    if (!savedRow) {
      const { data: inserted, error: insErr } = await supabase
        .from('restaurant_reviews')
        .insert({
          restaurant_id: payload.restaurantId,
          order_id: payload.orderId || null,
          user_id: payload.userId,
          rating: cleanRating,
          comment: cleanComment,
          tags: cleanTags,
          review_image_url: cleanImageUrl,
          author_name: payload.authorFallback?.name || null,
          author_username: payload.authorFallback?.username || null,
          author_avatar_url: payload.authorFallback?.avatarUrl || null
        })
        .select(REVIEW_SELECT_COLS)
        .single();

      if (insErr) return { success: false, error: insErr.message };
      savedRow = inserted as DbRestaurantReviewRow;
    }

    const profileMap = await fetchProfilesMetaMap([payload.userId]);
    const meta = profileMap.get(payload.userId);

    const { data: restStats } = await supabase
      .from('restaurants')
      .select('rating_avg, rating_count')
      .eq('id', payload.restaurantId)
      .maybeSingle();

    const review: RestaurantReview = {
      id: savedRow.id,
      restaurantId: savedRow.restaurant_id,
      orderId: savedRow.order_id || undefined,
      userId: savedRow.user_id,
      userName: meta?.fullName || savedRow.author_name || payload.authorFallback?.name || 'Cliente verificado',
      userHandle: meta?.username || savedRow.author_username || payload.authorFallback?.username,
      userAvatarUrl: meta?.avatarUrl || savedRow.author_avatar_url || payload.authorFallback?.avatarUrl,
      rating: Number(savedRow.rating) || cleanRating,
      comment: savedRow.comment || '',
      tags: Array.isArray(savedRow.tags) ? savedRow.tags : [],
      reviewImageUrl: savedRow.review_image_url || undefined,
      ownerReply: savedRow.owner_reply || undefined,
      ownerRepliedAt: savedRow.owner_replied_at || undefined,
      createdAt: savedRow.created_at,
      timeAgo: formatTimeAgo(savedRow.created_at)
    };

    return {
      success: true,
      review,
      ratingAvg: restStats?.rating_avg !== undefined ? Number(restStats.rating_avg) : undefined,
      ratingCount: restStats?.rating_count !== undefined ? Number(restStats.rating_count) : undefined
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'No se pudo guardar la calificación.'
    };
  }
}

export async function replyToRestaurantReview(
  reviewId: string,
  replyText: string
): Promise<{
  success: boolean;
  ownerReply?: string;
  ownerRepliedAt?: string;
  error?: string;
}> {
  if (!isSupabaseConfigured || !supabase) {
    return { success: false, error: 'Sin conexión a la base de datos.' };
  }

  const cleanReply = replyText.trim();
  const repliedAt = cleanReply ? new Date().toISOString() : undefined;

  try {
    const { data: rpcRes, error: rpcErr } = await supabase.rpc('reply_to_restaurant_review', {
      p_review_id: reviewId,
      p_reply: cleanReply
    });

    if (!rpcErr && rpcRes && typeof rpcRes === 'object') {
      const parsed = rpcRes as {
        success?: boolean;
        owner_reply?: string | null;
        owner_replied_at?: string | null;
        error?: string;
      };
      if (parsed.success === false) {
        return { success: false, error: parsed.error || 'No se pudo guardar la respuesta.' };
      }
      return {
        success: true,
        ownerReply: parsed.owner_reply || undefined,
        ownerRepliedAt: parsed.owner_replied_at || undefined
      };
    }

    const { error: updErr } = await supabase
      .from('restaurant_reviews')
      .update({
        owner_reply: cleanReply || null,
        owner_replied_at: repliedAt || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', reviewId);

    if (updErr) {
      return { success: false, error: updErr.message };
    }

    return {
      success: true,
      ownerReply: cleanReply || undefined,
      ownerRepliedAt: repliedAt
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error guardando la respuesta del restaurante.'
    };
  }
}

export async function deleteRestaurantReview(
  reviewId: string,
  restaurantId: string
): Promise<{
  success: boolean;
  ratingAvg?: number;
  ratingCount?: number;
  error?: string;
}> {
  if (!isSupabaseConfigured || !supabase) {
    return { success: false, error: 'Sin conexión a la base de datos.' };
  }
  try {
    const { data, error } = await supabase
      .from('restaurant_reviews')
      .delete()
      .eq('id', reviewId)
      .select('id');

    if (error || !data || data.length === 0) {
      return { success: false, error: error?.message || 'No tienes permiso para eliminar esta reseña.' };
    }

    const { data: restStats } = await supabase
      .from('restaurants')
      .select('rating_avg, rating_count')
      .eq('id', restaurantId)
      .maybeSingle();

    return {
      success: true,
      ratingAvg: restStats?.rating_avg !== undefined ? Number(restStats.rating_avg) : undefined,
      ratingCount: restStats?.rating_count !== undefined ? Number(restStats.rating_count) : undefined
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error eliminando reseña.'
    };
  }
}

export async function ensureColombiaCityAndZone(
  cityName: string,
  zoneName = 'Centro'
): Promise<{
  success: boolean;
  cityId?: string;
  cityName?: string;
  zoneId?: string;
  zoneName?: string;
  error?: string;
}> {
  const cleanCity = cityName.trim();
  const cleanZone = zoneName.trim() || 'Centro';
  if (!cleanCity) {
    return { success: false, error: 'Ingresa el nombre de la ciudad o municipio.' };
  }

  if (!isSupabaseConfigured || !supabase) {
    return {
      success: true,
      cityId: `city_${cleanCity.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
      cityName: cleanCity,
      zoneId: `zone_${cleanZone.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
      zoneName: cleanZone
    };
  }

  try {
    const { data, error } = await supabase.rpc('ensure_colombia_city_and_zone', {
      p_city_name: cleanCity,
      p_zone_name: cleanZone
    });

    if (error || !data) {
      return {
        success: false,
        error: error?.message || 'No se pudo registrar la ciudad/zona en la base de datos.'
      };
    }

    const res = data as {
      city_id?: string;
      city_name?: string;
      zone_id?: string;
      zone_name?: string;
    };

    return {
      success: true,
      cityId: res.city_id,
      cityName: res.city_name || cleanCity,
      zoneId: res.zone_id,
      zoneName: res.zone_name || cleanZone
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error registrando ciudad o municipio.'
    };
  }
}

/**
 * Limpia los archivos en el bucket `gastro-media` usando la Storage API oficial de Supabase
 * (`supabase.storage.from('gastro-media').remove(paths)`), evitando el error de trigger
 * `Direct deletion from storage tables is not allowed. Use the Storage API instead.`
 */
async function purgeStorageObjectsFromRpcResponse(
  rpcPayload: { storage_paths?: unknown; media_urls?: unknown } | null | undefined
): Promise<void> {
  if (!isSupabaseConfigured || !supabase || !rpcPayload) return;

  try {
    const pathsSet = new Set<string>();

    if (Array.isArray(rpcPayload.storage_paths)) {
      for (const rawPath of rpcPayload.storage_paths) {
        if (typeof rawPath === 'string' && rawPath.trim().length > 0) {
          pathsSet.add(rawPath.trim().replace(/^\/+/, ''));
        }
      }
    }

    const basePublicUrl = supabase.storage
      .from('gastro-media')
      .getPublicUrl('').data.publicUrl.replace(/\/+$/, '');

    if (Array.isArray(rpcPayload.media_urls)) {
      for (const rawUrl of rpcPayload.media_urls) {
        if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) continue;
        const cleanUrl = rawUrl.trim();
        if (basePublicUrl && cleanUrl.startsWith(basePublicUrl + '/')) {
          const rel = cleanUrl.slice(basePublicUrl.length + 1).split('?')[0];
          if (rel) pathsSet.add(decodeURIComponent(rel));
        } else {
          const marker = '/storage/v1/object/public/gastro-media/';
          const idx = cleanUrl.indexOf(marker);
          if (idx !== -1) {
            const rel = cleanUrl.slice(idx + marker.length).split('?')[0];
            if (rel) pathsSet.add(decodeURIComponent(rel));
          }
        }
      }
    }

    const allPaths = Array.from(pathsSet).filter(Boolean);
    if (allPaths.length === 0) return;

    const chunkSize = 100;
    for (let i = 0; i < allPaths.length; i += chunkSize) {
      const batch = allPaths.slice(i, i + chunkSize);
      const { error } = await supabase.storage.from('gastro-media').remove(batch);
      if (error) {
        console.warn('⚠️ Aviso al limpiar archivos de Storage tras baja:', error.message);
      }
    }
  } catch (err) {
    console.warn('⚠️ Excepción no bloqueante limpiando objetos de Storage:', err);
  }
}

/**
 * Ejecuta la supresión de la cuenta personal del usuario autenticado y anonimiza sus pedidos históricos
 * conforme al Derecho de Supresión (Ley Estatutaria 1581 de 2012 - Habeas Data).
 */
export async function deleteMyUserAccountRemote(
  confirmText: string
): Promise<{ success: boolean; anonymizedOrders?: number; error?: string }> {
  const normalized = confirmText.trim().toUpperCase();
  if (normalized !== 'ELIMINAR MI CUENTA') {
    return {
      success: false,
      error: 'Debes escribir exactamente ELIMINAR MI CUENTA para confirmar la supresión.'
    };
  }

  if (!isSupabaseConfigured || !supabase) {
    return { success: true, anonymizedOrders: 0 };
  }

  try {
    const { data, error } = await supabase.rpc('delete_my_user_account', {
      p_confirm_text: normalized
    });

    if (error) {
      return {
        success: false,
        error: error.message || 'No se pudo completar la supresión de la cuenta.'
      };
    }

    const res = (data || {}) as {
      anonymized_orders?: number;
      storage_paths?: unknown;
      media_urls?: unknown;
    };

    await purgeStorageObjectsFromRpcResponse(res);

    return {
      success: true,
      anonymizedOrders: Number(res.anonymized_orders || 0)
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error inesperado al suprimir la cuenta.'
    };
  }
}

/**
 * Ejecuta la baja voluntaria de un restaurante aliado y purga sus datos comerciales y bancarios
 * conforme a la Ley Estatutaria 1581 de 2012.
 */
export async function deactivateAndPurgeRestaurantRemote(
  restaurantId: string,
  confirmText: string
): Promise<{ success: boolean; error?: string }> {
  const normalized = confirmText.trim().toUpperCase();
  if (normalized !== 'ELIMINAR RESTAURANTE') {
    return {
      success: false,
      error: 'Debes escribir exactamente ELIMINAR RESTAURANTE para confirmar la baja.'
    };
  }

  if (!restaurantId) {
    return {
      success: false,
      error: 'No se encontró el identificador del restaurante.'
    };
  }

  if (!isSupabaseConfigured || !supabase) {
    return { success: true };
  }

  try {
    const { data, error } = await supabase.rpc('deactivate_and_purge_my_restaurant', {
      p_restaurant_id: restaurantId,
      p_confirm_text: normalized
    });

    if (error) {
      return {
        success: false,
        error: error.message || 'No se pudo procesar la baja del restaurante.'
      };
    }

    const res = (data || {}) as {
      storage_paths?: unknown;
      media_urls?: unknown;
    };

    await purgeStorageObjectsFromRpcResponse(res);

    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error inesperado al dar de baja el restaurante.'
    };
  }
}


