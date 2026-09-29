import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { Order, OrderStatus, OrderFulfillment } from '../types';

/**
 * Servicio de Pedidos en Tiempo Real con Supabase (PostgreSQL + WebSockets).
 * Sincroniza la creación, cambio de estado y transmisión en vivo de comanda KDS.
 */

function mapDbFulfillmentToType(fulfillment: OrderFulfillment, tableNumber?: string): string {
  if (fulfillment === 'table_service') {
    return `Mesa #${tableNumber || '1'}`;
  }
  if (fulfillment === 'restaurant_delivery') {
    return 'Domicilio';
  }
  return 'Recoger en local';
}

function mapTypeToDbFulfillment(type: string): OrderFulfillment {
  const lower = type.toLowerCase();
  if (lower.includes('mesa')) return 'table_service';
  if (lower.includes('domicilio')) return 'restaurant_delivery';
  return 'pickup';
}

export async function createLiveOrder(
  order: Omit<Order, 'id' | 'createdAt'>,
  userId?: string
): Promise<{ success: boolean; orderId?: string; error?: string }> {
  if (!isSupabaseConfigured || !supabase) {
    return { success: false, error: 'Supabase no está configurado.' };
  }

  try {
    const fulfillment: OrderFulfillment = order.fulfillment || mapTypeToDbFulfillment(order.type);

    const { data: insertedOrder, error: orderErr } = await supabase
      .from('orders')
      .insert([
        {
          restaurant_id: order.tenantId,
          customer_id: order.customerId || userId || null,
          fulfillment,
          status: order.status || 'pending',
          customer_name: order.customerName || 'Cliente GastroSync',
          customer_phone: order.customerPhone || '3000000000',
          delivery_address: order.deliveryAddress ? JSON.stringify(order.deliveryAddress) : null,
          table_number: order.tableNumber || null,
          restaurant_notes: order.restaurantNotes || null,
          subtotal_cop: order.subtotal || order.total,
          delivery_fee_cop: order.deliveryFeeApplied || 0,
          total_cop: order.total
        }
      ])
      .select('id')
      .single();

    if (orderErr || !insertedOrder) {
      console.warn('⚠️ Error al crear pedido en Supabase:', orderErr);
      return { success: false, error: orderErr?.message || 'Error al registrar el pedido.' };
    }

    const orderId = insertedOrder.id;

    if (order.items && order.items.length > 0) {
      const itemsToInsert = order.items.map(item => ({
        order_id: orderId,
        product_name: item.name,
        unit_price_cop: item.price,
        quantity: item.qty
      }));

      const { error: itemsErr } = await supabase
        .from('order_items')
        .insert(itemsToInsert);

      if (itemsErr) {
        console.warn('⚠️ Advertencia al guardar ítems del pedido:', itemsErr);
      }
    }

    return { success: true, orderId };
  } catch (err: any) {
    console.warn('⚠️ Excepción al crear pedido en Supabase:', err);
    return { success: false, error: err?.message || 'Error al conectar con la base de datos.' };
  }
}

export async function fetchLiveOrdersForRestaurant(tenantId: string): Promise<Order[]> {
  if (!isSupabaseConfigured || !supabase) return [];

  try {
    const { data: dbOrders, error } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (*)
      `)
      .eq('restaurant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error || !dbOrders) {
      console.warn('⚠️ Error al cargar pedidos de restaurante:', error);
      return [];
    }

    return dbOrders.map((o: any) => {
      const fulfillment: OrderFulfillment = o.fulfillment || 'pickup';
      const parsedAddress = o.delivery_address
        ? typeof o.delivery_address === 'string'
          ? JSON.parse(o.delivery_address)
          : o.delivery_address
        : undefined;

      const items = (o.order_items || []).map((it: any) => ({
        id: it.id,
        name: it.product_name,
        qty: it.quantity,
        price: it.unit_price_cop
      }));

      return {
        id: o.id,
        tenantId: o.restaurant_id,
        type: mapDbFulfillmentToType(fulfillment, o.table_number),
        items,
        subtotal: o.subtotal_cop,
        deliveryFeeApplied: o.delivery_fee_cop,
        total: o.total_cop,
        status: o.status as OrderStatus,
        createdAt: new Date(o.created_at).getTime(),
        customerName: o.customer_name,
        customerPhone: o.customer_phone,
        fulfillment,
        customerId: o.customer_id,
        deliveryAddress: parsedAddress,
        tableNumber: o.table_number,
        restaurantNotes: o.restaurant_notes,
        cancellationReason: o.cancellation_reason
      };
    });
  } catch (err) {
    console.warn('⚠️ Excepción al consultar pedidos:', err);
    return [];
  }
}

export async function fetchLiveOrdersForCustomer(customerId: string): Promise<Order[]> {
  if (!isSupabaseConfigured || !supabase || !customerId) return [];

  try {
    const { data: dbOrders, error } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (*)
      `)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });

    if (error || !dbOrders) return [];

    return dbOrders.map((o: any) => {
      const fulfillment: OrderFulfillment = o.fulfillment || 'pickup';
      const items = (o.order_items || []).map((it: any) => ({
        id: it.id,
        name: it.product_name,
        qty: it.quantity,
        price: it.unit_price_cop
      }));

      return {
        id: o.id,
        tenantId: o.restaurant_id,
        type: mapDbFulfillmentToType(fulfillment, o.table_number),
        items,
        subtotal: o.subtotal_cop,
        deliveryFeeApplied: o.delivery_fee_cop,
        total: o.total_cop,
        status: o.status as OrderStatus,
        createdAt: new Date(o.created_at).getTime(),
        customerName: o.customer_name,
        customerPhone: o.customer_phone,
        fulfillment,
        customerId: o.customer_id,
        tableNumber: o.table_number,
        restaurantNotes: o.restaurant_notes
      };
    });
  } catch {
    return [];
  }
}

export async function updateLiveOrderStatus(
  orderId: string,
  newStatus: OrderStatus
): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false;

  try {
    const { error } = await supabase
      .from('orders')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId);

    if (error) {
      console.warn('⚠️ Error al actualizar estado de pedido en Supabase:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.warn('⚠️ Excepción al actualizar estado:', err);
    return false;
  }
}

/**
 * Abre un canal WebSockets (Supabase Realtime) para escuchar comandas entrantes
 * y cambios de estado en el tablero KDS del restaurante.
 */
export function subscribeToRestaurantOrders(
  tenantId: string,
  onOrderChange: () => void
) {
  if (!isSupabaseConfigured || !supabase) return () => {};

  const channel = supabase
    .channel(`kds_orders_${tenantId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'orders',
        filter: `restaurant_id=eq.${tenantId}`
      },
      () => {
        onOrderChange();
      }
    )
    .subscribe();

  return () => {
    if (supabase) {
      supabase.removeChannel(channel);
    }
  };
}

/**
 * Abre un canal WebSockets para que el cliente reciba en tiempo real los cambios de estado de su pedido.
 */
export function subscribeToCustomerOrders(
  customerId: string,
  onOrderChange: () => void
) {
  if (!isSupabaseConfigured || !supabase || !customerId) return () => {};

  const channel = supabase
    .channel(`customer_orders_${customerId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'orders',
        filter: `customer_id=eq.${customerId}`
      },
      () => {
        onOrderChange();
      }
    )
    .subscribe();

  return () => {
    if (supabase) {
      supabase.removeChannel(channel);
    }
  };
}
