import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { Tenant, Product, Post, RestaurantApplication } from '../types';

/**
 * Servicio de Sincronización en Tiempo Real con Supabase.
 * Permite cargar datos reales del servidor PostgreSQL sin depender de mocks inventados.
 */

export async function fetchLiveTenants(): Promise<Tenant[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  try {
    const { data, error } = await supabase
      .from('tenants')
      .select('*')
      .eq('status', 'active');

    if (error || !data) {
      console.warn('⚠️ Error al cargar restaurantes de Supabase:', error);
      return [];
    }

    return data.map((t: any) => ({
      id: t.id,
      slug: t.slug || t.id,
      name: t.name,
      category: t.category || 'General',
      logoEmoji: t.logo_emoji || '🍽️',
      bannerUrl: t.banner_url || 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80',
      description: t.description || '',
      address: t.address || 'Armenia, Quindío',
      deliveryTime: t.estimated_delivery_minutes || '20-30 min',
      priceRange: t.price_range || '$$',
      minOrder: t.min_order || 15000,
      specialties: t.specialties || [],
      promotionBadge: t.promotion_badge,
      salesWeekly: t.sales_weekly || 0,
      rating: t.rating || 5.0,
      distanceKm: t.distance_km || 1.0,
      isNew: t.is_new ?? true,
      commissionRate: t.commission_rate || 0.03,
      tablesCount: t.tables_count || 5,
      isOpen: t.is_open ?? true,
      cityId: t.city_id || 'city_armenia_quindio',
      zoneId: t.zone_id || 'zone_armenia_centro',
      status: t.status || 'active',
      deliveryModes: t.delivery_modes || ['pickup', 'restaurant_delivery'],
      phone: t.phone,
      whatsapp: t.whatsapp,
      deliveryFee: t.delivery_fee || 3000,
      deliveryRadiusKm: t.delivery_radius_km || 5
    }));
  } catch (err) {
    console.warn('⚠️ Excepción al consultar Supabase:', err);
    return [];
  }
}

export async function fetchLiveProducts(): Promise<Product[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('available', true);

    if (error || !data) return [];

    return data.map((p: any) => ({
      id: p.id,
      tenantId: p.tenant_id,
      name: p.name,
      desc: p.desc || '',
      price: p.price,
      category: p.category || 'General',
      emoji: p.emoji || '🍽️',
      available: p.available ?? true
    }));
  } catch {
    return [];
  }
}

export async function fetchLivePosts(): Promise<Post[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  try {
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error || !data) return [];

    return data.map((post: any) => ({
      id: post.id,
      tenantId: post.tenant_id,
      tenantName: post.tenant_name || 'Restaurante Aliado',
      tenantCategory: post.tenant_category || 'Gastronomía',
      tenantLogoEmoji: post.tenant_logo_emoji || '🍽️',
      tenantAddress: post.tenant_address || 'Armenia, Quindío',
      dishName: post.dish_name,
      dishEmoji: post.dish_emoji || '🍕',
      desc: post.desc || '',
      hashtags: post.hashtags || [],
      price: post.price,
      image: post.image,
      mediaType: post.media_type || 'photo',
      videoId: post.video_id,
      videoDuration: post.video_duration,
      likes: post.likes || 0,
      isLiked: false,
      commentsCount: post.comments_count || 0,
      comments: [],
      timeAgo: post.time_ago || 'Reciente',
      productId: post.product_id || ''
    }));
  } catch {
    return [];
  }
}

export async function submitLiveApplication(appData: Omit<RestaurantApplication, 'id' | 'submittedAt' | 'status'>): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false;
  try {
    const { error } = await supabase.from('restaurant_applications').insert([{
      owner_name: appData.ownerName,
      owner_email: appData.ownerEmail,
      owner_phone: appData.ownerPhone,
      restaurant_name: appData.restaurantName,
      category: appData.category,
      city_id: appData.cityId,
      zone_id: appData.zoneId,
      address: appData.address,
      whatsapp: appData.whatsapp,
      min_order: appData.minOrder,
      delivery_modes: appData.deliveryModes,
      delivery_fee: appData.deliveryFee,
      delivery_radius_km: appData.deliveryRadiusKm,
      notes: appData.notes,
      status: 'submitted'
    }]);

    return !error;
  } catch {
    return false;
  }
}
