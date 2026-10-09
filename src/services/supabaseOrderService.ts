import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { Order, OrderStatus } from '../types';
import type { DbOrder } from './supabaseTypes';
import { mapDbOrderToOrder } from './supabaseTypes';
import { reportDataError } from './dataErrors';

/**
 * Servicio de Pedidos en Tiempo Real con Supabase (PostgreSQL + WebSockets).
 * Sincroniza la creación, cambio de estado y transmisión en vivo de comanda KDS.
 */

function isValidUUID(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

export async function createLiveOrder(
  order: Omit<Order, 'id' | 'createdAt'>
): Promise<{ success: boolean; orderId?: string; error?: string }> {
  if (!isSupabaseConfigured || !supabase) {
    return { success: false, error: 'Supabase no está configurado.' };
  }

  if (!order.items || order.items.length === 0) {
    return { success: false, error: 'El pedido no puede estar vacío.' };
  }

  for (const item of order.items) {
    if (!item.id || item.id.trim() === '') {
      return { success: false, error: 'Un producto en el pedido tiene un ID inválido.' };
    }
    if (!Number.isInteger(item.qty) || item.qty <= 0) {
      return { success: false, error: 'La cantidad de los productos debe ser un entero positivo.' };
    }
  }

  try {
    let deviceId = '';
    if (typeof window !== 'undefined') {
      let stored = localStorage.getItem('gs_device_id');
      if (!stored) {
        stored = crypto.randomUUID();
        localStorage.setItem('gs_device_id', stored);
      }
      deviceId = stored;
    }

    const payload = {
      p_restaurant_id: order.tenantId,
      p_fulfillment: order.fulfillment || 'restaurant_delivery',
      p_customer_name: order.customerName || 'Cliente',
      p_customer_phone: order.customerPhone || '0000000000',
      p_delivery_address: order.deliveryAddress || null,
      p_table_number: (order as any).tableNumber || null,
      p_table_id: (order as any).tableId || null,
      p_table_token: order.tableToken || null,
      p_device_id: deviceId,
      p_restaurant_notes: order.restaurantNotes || null,
      p_payment_method: order.paymentMethod || 'wompi',
      p_items: order.items.map(item => ({
        product_id: item.id,
        quantity: item.qty
      }))
    };

    const { data, error } = await supabase.rpc('create_order_with_items', payload);

    if (error) {
      console.warn('⚠️ Detalle técnico al crear pedido vía RPC:', error.message);
      return { success: false, error: 'No fue posible procesar el pedido. Revisa los datos e inténtalo nuevamente.' };
    }

    if (typeof data !== 'string' || data.trim() === '') {
      console.warn('⚠️ La RPC devolvió un formato inesperado:', data);
      return { success: false, error: 'No fue posible procesar el pedido. Revisa los datos e inténtalo nuevamente.' };
    }

    if (!isValidUUID(data)) {
      console.warn('⚠️ La RPC devolvió un ID inválido:', data);
      return { success: false, error: 'No fue posible procesar el pedido. Revisa los datos e inténtalo nuevamente.' };
    }

    return { success: true, orderId: data };
  } catch (err: unknown) {
    console.warn('⚠️ Excepción técnica en checkout:', err instanceof Error ? err.message : String(err));
    return { success: false, error: 'No fue posible procesar el pedido. Revisa los datos e inténtalo nuevamente.' };
  }
}

export async function fetchLiveOrdersForRestaurant(tenantId: string): Promise<Order[]> {
  if (!isSupabaseConfigured || !supabase || !tenantId) return [];

  try {
    const { data: dbOrders, error } = await supabase
      .from('orders')
      .select(`
        id, restaurant_id, customer_id, fulfillment, status, customer_name, customer_phone, delivery_address, table_number, restaurant_notes, cancellation_reason, payment_method, subtotal_cop, delivery_fee_cop, total_cop, created_at, updated_at,
        order_items (
          id, order_id, product_id, product_name, unit_price_cop, quantity
        ),
        payments (
          id, status, provider
        )
      `)
      .eq('restaurant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error || !dbOrders) {
      console.warn('⚠️ Error al cargar pedidos de restaurante:', error);
      reportDataError('pedidos', 'No se pudieron cargar los pedidos del restaurante.');
      return [];
    }

    return (dbOrders as unknown as DbOrder[]).map(mapDbOrderToOrder);
  } catch (err: unknown) {
    console.warn('⚠️ Excepción al consultar pedidos:', err);
    reportDataError('pedidos', 'No se pudieron cargar los pedidos del restaurante.');
    return [];
  }
}

export async function fetchLiveOrdersForCustomer(customerId: string): Promise<Order[]> {
  if (!isSupabaseConfigured || !supabase || !customerId) return [];

  try {
    const { data: dbOrders, error } = await supabase
      .from('orders')
      .select(`
        id, restaurant_id, customer_id, fulfillment, status, customer_name, customer_phone, delivery_address, table_number, restaurant_notes, cancellation_reason, payment_method, subtotal_cop, delivery_fee_cop, total_cop, created_at, updated_at,
        order_items (
          id, order_id, product_id, product_name, unit_price_cop, quantity
        ),
        payments (
          id, status, provider
        )
      `)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });

    if (error || !dbOrders) {
      reportDataError('pedidos', 'No se pudieron cargar tus pedidos.');
      return [];
    }

    return (dbOrders as unknown as DbOrder[]).map(mapDbOrderToOrder);
  } catch (err: unknown) {
    console.warn('⚠️ Excepción al consultar pedidos de cliente:', err);
    reportDataError('pedidos', 'No se pudieron cargar tus pedidos.');
    return [];
  }
}

export async function updateLiveOrderStatus(
  orderId: string,
  newStatus: OrderStatus,
  tableId?: string
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured || !supabase) {
    return { success: false, error: 'Supabase no está configurado.' };
  }

  if (!isValidUUID(orderId)) {
    return { success: false, error: 'ID de pedido inválido.' };
  }

  try {
    const { data, error } = await supabase.rpc('update_order_status', {
      p_order_id: orderId,
      p_next_status: newStatus
    });

    if (tableId) {
      // Emitir broadcast para que la mesa reciba actualizaciones sin depender de RLS de SELECT
      supabase.channel(`table_orders_sync_${tableId}`).send({
        type: 'broadcast',
        event: 'status_changed',
        payload: { orderId, status: newStatus }
      });
    }

    if (error) {
      console.error('❌ RPC Error:', error);
      console.error('   - Message:', error.message);
      console.error('   - Details:', error.details);
      console.error('   - Hint:', error.hint);
      console.error('   - Code:', error.code);
      
      // Extraer mensaje específico del RPC
      let userMessage = error.message;
      
      // Si el mensaje contiene una excepción de PostgreSQL, extraerla
      if (error.message && error.message.includes('No autorizado')) {
        userMessage = 'No tienes permisos para actualizar este pedido.';
      } else if (error.message && error.message.includes('Transición')) {
        userMessage = 'Esta transición de estado no está permitida.';
      } else if (error.message && error.message.includes('pedido finalizado')) {
        userMessage = 'No se puede modificar un pedido finalizado.';
      } else if (error.message && error.message.includes('Perfil de usuario no encontrado')) {
        userMessage = 'Tu perfil no está configurado correctamente. Contacta al administrador.';
      }
      
      return { success: false, error: userMessage };
    }

    console.log('✅ Order status updated successfully:', { orderId, newStatus, result: data });
    return { success: true };
  } catch (err: unknown) {
    console.warn('⚠️ Excepción técnica en actualización de pedido:', err instanceof Error ? err.message : String(err));
    return { success: false, error: 'No fue posible actualizar el pedido.' };
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
  if (!isSupabaseConfigured || !supabase || !tenantId) return () => {};

  const channelName = `kds_orders_${tenantId}_${Date.now()}_${Math.random().toString(36).substring(2,9)}`;
  const channel = supabase
    .channel(channelName)
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

  const channelName = `customer_orders_${customerId}_${Date.now()}_${Math.random().toString(36).substring(2,9)}`;
  const channel = supabase
    .channel(channelName)
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
export interface RemotePaymentResponse {
  success: boolean;
  paymentId?: string;
  sandboxUrl?: string;
  error?: string;
  wompiConfig?: {
    paymentId: string;
    orderId: string;
    providerReference: string;
    amountInCents: number;
    currency: string;
    publicKey: string;
    signature: string;
  };
}

/**
 * Invoca la Edge Function create-payment para inicializar un pago remoto seguro.
 */
export async function createRemotePayment(
  orderId: string,
  provider: string = 'wompi'
): Promise<RemotePaymentResponse> {
  if (!isSupabaseConfigured || !supabase) return { success: false, error: 'Supabase no configurado' };

  try {
    const { data, error } = await supabase.functions.invoke('create-payment', {
      body: { orderId, provider }
    });

    if (error) {
      console.warn('⚠️ Error al invocar create-payment:', error);
      return { success: false, error: 'No fue posible iniciar el pago.' };
    }

    if (!data.success) {
      console.warn('⚠️ Respuesta de error desde create-payment:', data.error);
      return { success: false, error: data.error || 'No fue posible iniciar el pago.' };
    }

    return { 
      success: true, 
      paymentId: data.paymentId, 
      sandboxUrl: data.sandboxUrl,
      wompiConfig: data.signature ? {
        paymentId: data.paymentId,
        orderId: data.orderId,
        providerReference: data.providerReference,
        amountInCents: data.amountInCents,
        currency: data.currency,
        publicKey: data.publicKey,
        signature: data.signature
      } : undefined
    };
  } catch (err: unknown) {
    console.warn('⚠️ Excepción al invocar create-payment:', err);
    return { success: false, error: 'Error técnico al conectar con el servidor de pagos.' };
  }
}

export async function fetchLiveOrdersForTable(tableId: string): Promise<Order[]> {
  if (!isSupabaseConfigured || !supabase || !tableId) return [];

  let deviceId = '';
  if (typeof window !== 'undefined') {
    deviceId = localStorage.getItem('gs_device_id') || '';
  }
  if (!deviceId) return [];

  try {
    const { data: dbOrders, error } = await supabase.rpc('get_table_orders_for_session', {
      p_table_id: tableId,
      p_session_id: deviceId
    });

    if (error || !dbOrders) return [];

    return (dbOrders as unknown as DbOrder[]).map(mapDbOrderToOrder);
  } catch (err: unknown) {
    console.warn('⚠️ Excepción al consultar pedidos de mesa seguros:', err);
    return [];
  }
}

export function subscribeToTableOrders(tableId: string, onUpdate: () => void): () => void {
  if (!isSupabaseConfigured || !supabase || !tableId) return () => {};

  // Escuchamos broadcasts emitidos por la cocina cuando cambian el estado del pedido
  const channel = supabase
    .channel(`table_orders_sync_${tableId}`)
    .on(
      'broadcast',
      { event: 'status_changed' },
      () => {
        onUpdate();
      }
    )
    .subscribe();

  return () => {
    supabase?.removeChannel(channel);
  };
}

export async function confirmCashPayment(paymentId: string, orderId: string): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured || !supabase) {
    return { success: false, error: 'Supabase no está configurado.' };
  }
  try {
    const { error } = await supabase.rpc('confirm_cash_payment', {
      p_payment_id: paymentId,
      p_order_id: orderId
    });
    if (error) {
      console.error('Error confirming cash payment:', error);
      return { success: false, error: 'No se pudo confirmar el pago. Asegúrate de tener permisos y que el pago esté pendiente.' };
    }
    return { success: true };
  } catch (err: unknown) {
    console.error('Exception confirming cash payment:', err);
    return { success: false, error: 'Error técnico al confirmar el pago.' };
  }
}
