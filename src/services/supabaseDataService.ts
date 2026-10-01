import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { Tenant, Product, Post, RestaurantApplication } from '../types';
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
      .select(`id, slug, name, category, description, address, phone, whatsapp, city_id, zone_id, status, is_open, delivery_modes, min_order, delivery_fee, delivery_radius_km, commission_rate`)
      .eq('status', 'active');

    if (error || !data) {
      console.warn('⚠️ Error al cargar restaurantes de Supabase:', error);
      return [];
    }

    const validModes = ['pickup', 'restaurant_delivery', 'table_service'];
    
    return (data as unknown as DbRestaurant[]).map(mapDbRestaurantToTenant).filter(t => {
      // Filter out tenants with no valid delivery modes or missing required fields
      if (!t.name || !t.id || !t.cityId || !t.zoneId) {
        console.warn(`⚠️ Omitiendo restaurante inválido (datos faltantes): ${t.id || 'desconocido'}`);
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
  } catch (err: unknown) {
    console.warn('⚠️ Excepción al insertar aplicacion en Supabase:', err);
    return false;
  }
}
