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
    let deviceId = order.deviceId || '';
    if (!deviceId && typeof window !== 'undefined') {
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
      p_table_number: order.tableNumber || null,
      p_table_id: order.tableId || null,
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

const ORDER_EXTENDED_COLS = `
  id, restaurant_id, customer_id, fulfillment, status, customer_name, customer_phone, delivery_address, table_number, table_id, restaurant_notes, cancellation_reason, payment_method, subtotal_cop, delivery_fee_cop, total_cop, driver_id, driver_name, driver_phone, kds_checked_items, created_at, updated_at,
  order_items (
    id, order_id, product_id, product_name, unit_price_cop, quantity
  ),
  payments (
    id, status, provider
  )
`;

const ORDER_BASE_COLS = `
  id, restaurant_id, customer_id, fulfillment, status, customer_name, customer_phone, delivery_address, table_number, table_id, restaurant_notes, cancellation_reason, payment_method, subtotal_cop, delivery_fee_cop, total_cop, created_at, updated_at,
  order_items (
    id, order_id, product_id, product_name, unit_price_cop, quantity
  ),
  payments (
    id, status, provider
  )
`;

export async function fetchLiveOrdersForRestaurant(tenantId: string): Promise<Order[]> {
  if (!isSupabaseConfigured || !supabase || !tenantId) return [];

  try {
    let { data: dbOrders, error } = await supabase
      .from('orders')
      .select(ORDER_EXTENDED_COLS)
      .eq('restaurant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error && (error.message.includes('driver_') || error.message.includes('kds_checked_items'))) {
      const fallback = await supabase
        .from('orders')
        .select(ORDER_BASE_COLS)
        .eq('restaurant_id', tenantId)
        .order('created_at', { ascending: false });
      dbOrders = fallback.data as typeof dbOrders;
      error = fallback.error;
    }

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
    let { data: dbOrders, error } = await supabase
      .from('orders')
      .select(ORDER_EXTENDED_COLS)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });

    if (error && (error.message.includes('driver_') || error.message.includes('kds_checked_items'))) {
      const fallback = await supabase
        .from('orders')
        .select(ORDER_BASE_COLS)
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false });
      dbOrders = fallback.data as typeof dbOrders;
      error = fallback.error;
    }

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

function mapOrderStatusRpcError(message: string | undefined): string {
  const msg = message || '';
  if (msg.includes('No autorizado')) return 'No tienes permisos para actualizar este pedido.';
  if (msg.includes('Transición')) return 'Esta transición de estado no está permitida.';
  if (msg.includes('pedido finalizado')) return 'No se puede modificar un pedido finalizado.';
  if (msg.includes('Perfil de usuario no encontrado')) {
    return 'Tu perfil no está configurado correctamente. Contacta al administrador.';
  }
  return msg || 'No fue posible actualizar el pedido.';
}

function broadcastTableStatus(tableId: string | undefined, orderId: string, status: OrderStatus): void {
  if (!tableId || !supabase) return;
  try {
    const syncChannel = supabase.channel(`table_orders_sync_${tableId}`);
    syncChannel.subscribe((subStatus) => {
      if (subStatus === 'SUBSCRIBED') {
        void syncChannel
          .send({
            type: 'broadcast',
            event: 'status_changed',
            payload: { orderId, status }
          })
          .finally(() => {
            supabase?.removeChannel(syncChannel);
          });
      }
    });
  } catch {
    // Silently catch broadcast error
  }
}

type OrderStatusRpcResult = { success: boolean; error?: string; missingRpc?: boolean };

async function executeOrderStatusRpc(
  rpcName: 'update_order_status' | 'accept_and_start_order',
  params: Record<string, string>,
  orderId: string,
  finalStatus: OrderStatus,
  tableId?: string
): Promise<OrderStatusRpcResult> {
  if (!isSupabaseConfigured || !supabase) {
    return { success: false, error: 'Supabase no está configurado.' };
  }

  if (!isValidUUID(orderId)) {
    return { success: false, error: 'ID de pedido inválido.' };
  }

  try {
    const { error } = await supabase.rpc(rpcName, params);

    if (error) {
      // PGRST202 / 42883: la función no existe (migración aún no desplegada)
      const missingRpc = error.code === 'PGRST202' || error.code === '42883';
      if (!missingRpc) {
        console.error('❌ RPC Error:', { rpcName, message: error.message, code: error.code, hint: error.hint });
      }
      return { success: false, error: mapOrderStatusRpcError(error.message), missingRpc };
    }

    // Solo notificar a la mesa cuando el cambio realmente quedó guardado
    broadcastTableStatus(tableId, orderId, finalStatus);
    return { success: true };
  } catch (err: unknown) {
    console.warn('⚠️ Excepción técnica en actualización de pedido:', err instanceof Error ? err.message : String(err));
    return { success: false, error: 'No fue posible actualizar el pedido.' };
  }
}

export async function updateLiveOrderStatus(
  orderId: string,
  newStatus: OrderStatus,
  tableId?: string
): Promise<{ success: boolean; error?: string }> {
  const res = await executeOrderStatusRpc(
    'update_order_status',
    { p_order_id: orderId, p_next_status: newStatus },
    orderId,
    newStatus,
    tableId
  );
  return { success: res.success, error: res.error };
}

/**
 * Acepta un pedido pendiente y lo pasa a "En preparación" en UNA sola transacción
 * (RPC accept_and_start_order, migración 061). Si la migración aún no está
 * desplegada, cae al flujo de dos pasos para no romper el KDS.
 */
export async function acceptAndStartLiveOrder(
  orderId: string,
  tableId?: string
): Promise<{ success: boolean; error?: string }> {
  const res = await executeOrderStatusRpc(
    'accept_and_start_order',
    { p_order_id: orderId },
    orderId,
    'preparing',
    tableId
  );
  if (res.success || !res.missingRpc) {
    return { success: res.success, error: res.error };
  }

  const step1 = await updateLiveOrderStatus(orderId, 'accepted', tableId);
  if (!step1.success) return step1;
  return updateLiveOrderStatus(orderId, 'preparing', tableId);
}

export interface RealtimeOrderChangePayload {
  eventType?: string;
  orderId?: string;
  newStatus?: string;
  oldStatus?: string;
}

/**
 * Abre un canal WebSockets (Supabase Realtime) para escuchar comandas entrantes
 * y cambios de estado en el tablero KDS del restaurante.
 */
export function subscribeToRestaurantOrders(
  tenantId: string,
  onOrderChange: (payload?: RealtimeOrderChangePayload) => void
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
      (payload: { eventType?: string; new?: { id?: string; status?: string }; old?: { id?: string; status?: string } }) => {
        onOrderChange({
          eventType: payload?.eventType,
          orderId: payload?.new?.id || payload?.old?.id,
          newStatus: payload?.new?.status,
          oldStatus: payload?.old?.status
        });
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
    wompiMerchantId?: string | null;
    splitConfig?: {
      restaurantMerchantId?: string | null;
      restaurantPayoutCents: number;
      platformFeeCents: number;
      gatewayFeeCents: number;
    };
  };
}

/**
 * Invoca la Edge Function create-payment para inicializar un pago remoto seguro.
 */
export async function createRemotePayment(
  orderId: string,
  provider: string = 'wompi',
  deviceId?: string
): Promise<RemotePaymentResponse> {
  if (!isSupabaseConfigured || !supabase) return { success: false, error: 'Supabase no configurado' };

  try {
    let resolvedDeviceId = deviceId || '';
    if (!resolvedDeviceId && typeof window !== 'undefined') {
      resolvedDeviceId = localStorage.getItem('gs_device_id') || '';
    }

    const { data, error } = await supabase.functions.invoke('create-payment', {
      body: { orderId, provider, deviceId: resolvedDeviceId || undefined }
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
        signature: data.signature,
        wompiMerchantId: data.wompiMerchantId ?? null,
        splitConfig: data.splitConfig
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

  // Escuchamos tanto broadcasts emitidos por la cocina como cambios directos en PostgreSQL
  const channel = supabase
    .channel(`table_orders_sync_${tableId}`)
    .on(
      'broadcast',
      { event: 'status_changed' },
      () => {
        onUpdate();
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'orders',
        filter: `table_id=eq.${tableId}`
      },
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
