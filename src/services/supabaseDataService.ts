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
    const { data, error } = await supabase.from('cities').select('*').eq('is_active', true);
    if (error || !data) return [];
    return data.map(d => ({
      id: d.id,
      name: d.name,
      countryCode: d.country_code,
      currencyCode: d.currency_code,
      isActive: d.is_active
    }));
  } catch { return []; }
}

export async function fetchLiveZones(): Promise<Zone[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  try {
    const { data, error } = await supabase.from('zones').select('*').eq('is_active', true);
    if (error || !data) return [];
    return data.map(d => ({
      id: d.id,
      cityId: d.city_id,
      name: d.name,
      isActive: d.is_active
    }));
  } catch { return []; }
}

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
      .select(`id, restaurant_id, name, description, category, price_cop, available, image_url`)
      .eq('available', true);

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

export async function updateLiveProduct(productId: string, updates: Partial<{ name: string; desc: string; category: string; price: number; available: boolean; imageUrl: string }>): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false;
  try {
    const dbUpdates: Record<string, unknown> = {};
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
  estimated_delivery_minutes?: number;
  is_open?: boolean;
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
    
    if (typeof updates.estimatedDeliveryMinutes === 'number' && Number.isFinite(updates.estimatedDeliveryMinutes) && updates.estimatedDeliveryMinutes >= 0 && updates.estimatedDeliveryMinutes <= 1440) {
      dbUpdates.estimated_delivery_minutes = updates.estimatedDeliveryMinutes;
    }
    
    if (typeof updates.isOpen === 'boolean') dbUpdates.is_open = updates.isOpen;

    if (Object.keys(dbUpdates).length === 0) return null; // No updates

    const { data, error } = await supabase
      .from('restaurants')
      .update(dbUpdates)
      .eq('id', tenantId)
      .select()
      .single();

    if (error) throw error;
    
    return data ? mapDbRestaurantToTenant(data as import('./supabaseTypes').DbRestaurant) : null;
  } catch (err) {
    console.error('⚠️ Error updating remote tenant:', err);
    return null;
  }
}
