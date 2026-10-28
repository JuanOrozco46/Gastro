import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://gastrosync.app',
  'https://www.gastrosync.app',
  'https://gastrosync.co',
  'https://www.gastrosync.co',
];

function getAllowedOrigins(): string[] {
  const envList = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  const singleUrls = [
    Deno.env.get('PUBLIC_APP_URL'),
    Deno.env.get('SITE_URL'),
  ]
    .map((o) => (o ?? '').trim().replace(/\/+$/, ''))
    .filter(Boolean);

  return Array.from(new Set([...DEFAULT_ALLOWED_ORIGINS, ...envList, ...singleUrls]));
}

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return true;
  const normalized = origin.trim().replace(/\/+$/, '');
  const allowedList = getAllowedOrigins();
  if (allowedList.includes('*') || allowedList.includes(normalized)) {
    return true;
  }
  try {
    const url = new URL(normalized);
    if (
      url.protocol === 'https:' &&
      (url.hostname.endsWith('.gastrosync.app') || url.hostname.endsWith('.gastrosync.co'))
    ) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin');
  const allowedOrigins = getAllowedOrigins();
  const resolvedOrigin = origin && isOriginAllowed(origin)
    ? origin.trim().replace(/\/+$/, '')
    : (allowedOrigins.find((o) => o.startsWith('https://')) ?? allowedOrigins[0]);

  return {
    'Access-Control-Allow-Origin': resolvedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

// Helper: Calculate SHA-256 hex string for Wompi Integrity Signature
async function calculateWompiIntegrity(
  reference: string,
  amountInCents: number,
  currency: string,
  integritySecret: string
): Promise<string> {
  const text = `${reference}${amountInCents}${currency}${integritySecret}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  if (!isOriginAllowed(req.headers.get('Origin'))) {
    return new Response(JSON.stringify({ error: 'Origen CORS no autorizado' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', 'Vary': 'Origin' },
    });
  }
  const corsHeaders = getCorsHeaders(req);
  // CORS options preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método no permitido' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const { orderId, provider = 'wompi', deviceId } = body ?? {};

    if (!orderId || typeof orderId !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Falta el parámetro requerido: orderId' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Initialize Supabase Client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Configuración de servidor incompleta.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Retrieve order first to determine whether it is an authenticated customer order or an anonymous QR table order
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('id, restaurant_id, customer_id, fulfillment, table_id, device_id, total_cop, status, delivery_fee_cop, subtotal_cop')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return new Response(
        JSON.stringify({ error: 'Pedido no encontrado en la base de datos.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    const isAnonymousTableOrder =
      order.fulfillment === 'table_service' &&
      order.customer_id === null &&
      Boolean(order.table_id) &&
      typeof order.device_id === 'string' &&
      order.device_id.trim().length >= 8;

    if (isAnonymousTableOrder) {
      const providedDeviceId = typeof deviceId === 'string' ? deviceId.trim() : '';
      if (!providedDeviceId || providedDeviceId !== order.device_id.trim()) {
        return new Response(
          JSON.stringify({ error: 'No autorizado. La sesión de mesa no coincide con el pedido.' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
        );
      }

      const { data: activeTable } = await supabaseAdmin
        .from('restaurant_tables')
        .select('id, is_active, archived_at')
        .eq('id', order.table_id)
        .eq('restaurant_id', order.restaurant_id)
        .maybeSingle();

      if (!activeTable || !activeTable.is_active || activeTable.archived_at !== null) {
        return new Response(
          JSON.stringify({ error: 'La mesa asociada al pedido no se encuentra activa.' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }
    } else {
      // Validate Auth user for all customer-owned orders
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) {
        return new Response(
          JSON.stringify({ error: 'No autorizado. Se requiere token JWT.' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
        );
      }

      const supabaseAuthClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') || '', {
        global: { headers: { Authorization: authHeader } }
      });

      const { data: userData, error: authError } = await supabaseAuthClient.auth.getUser();
      
      if (authError || !userData?.user) {
        return new Response(
          JSON.stringify({ error: 'No autorizado. Usuario no válido.' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
        );
      }

      if (order.customer_id !== userData.user.id) {
        return new Response(
          JSON.stringify({ error: 'El pedido no pertenece al usuario autenticado.' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
        );
      }
    }

    if (order.status !== 'pending') {
      return new Response(
        JSON.stringify({ error: 'El pedido no está en un estado válido para procesar pago.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Check existing payment attempts for this order
    const { data: existingPayments } = await supabaseAdmin
      .from('payments')
      .select('id, status, provider_reference')
      .eq('order_id', orderId);

    if (existingPayments && existingPayments.some(p => p.status === 'approved')) {
      return new Response(
        JSON.stringify({ error: 'Este pedido ya cuenta con un pago aprobado.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Void any previous pending payment intents for this order to prevent double-charge (P1 #1)
    if (existingPayments && existingPayments.some(p => p.status === 'pending')) {
      const { error: voidError } = await supabaseAdmin
        .from('payments')
        .update({ status: 'voided' })
        .eq('order_id', orderId)
        .eq('status', 'pending');

      if (voidError) {
        console.error('Error anulando intentos de pago previos:', voidError);
        return new Response(
          JSON.stringify({ error: 'No se pudo anular el intento de pago pendiente anterior.' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }
    }

    // Require Wompi credentials from environment — never fall back to hardcoded keys (P2 #3)
    const publicKey = Deno.env.get('WOMPI_PUBLIC_KEY')?.trim();
    const integritySecret = Deno.env.get('WOMPI_INTEGRITY_SECRET')?.trim();

    if (!publicKey || !integritySecret) {
      console.error('Faltan variables de entorno WOMPI_PUBLIC_KEY o WOMPI_INTEGRITY_SECRET');
      return new Response(
        JSON.stringify({ error: 'Pasarela de pagos no configurada en el servidor (faltan credenciales de Wompi).' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // Canonical calculations from PostgreSQL order data
    const canonicalTotal = Number(order.total_cop);
    const amountInCents = Math.round(canonicalTotal * 100);
    const currency = 'COP';

    // Generate unique controlled payment reference
    const cleanOrderId = orderId.replace(/-/g, '').slice(0, 8);
    const providerReference = `GS_PAY_${cleanOrderId}_${Date.now()}`;

    // Compute Wompi Integrity Signature on server
    const signature = await calculateWompiIntegrity(
      providerReference,
      amountInCents,
      currency,
      integritySecret
    );

    const { data: restaurantRow } = await supabaseAdmin
      .from('restaurants')
      .select('commission_rate')
      .eq('id', order.restaurant_id)
      .single();

    const commissionRate = restaurantRow?.commission_rate ? Number(restaurantRow.commission_rate) : 0.03;

    // 1. Comisión libre para GastroSync (3% exacto por defecto)
    const platformFee = Math.round(canonicalTotal * commissionRate);
    // 2. Costo de pasarela Wompi (2.65% + $700 COP + 19% IVA sobre la comisión de Wompi)
    const isCashProvider = String(provider).toLowerCase().trim() === 'cash';
    const rawWompiBase = isCashProvider ? 0 : canonicalTotal * 0.0265 + 700;
    const gatewayFee = isCashProvider ? 0 : Math.round(rawWompiBase * 1.19);
    const gatewayIva = isCashProvider ? 0 : Math.max(0, gatewayFee - Math.round(rawWompiBase));
    // 3. Neto del restaurante después de descontar el 3% de GastroSync y el costo de pasarela Wompi
    const restaurantPayout = Math.max(0, canonicalTotal - platformFee - gatewayFee);

    // Create payment intent record with status 'pending'
    const { data: paymentRecord, error: paymentError } = await supabaseAdmin
      .from('payments')
      .insert({
        order_id: orderId,
        provider: provider,
        provider_reference: providerReference,
        amount_cop: canonicalTotal,
        platform_fee_cop: platformFee,
        gateway_fee_cop: gatewayFee,
        gateway_iva_cop: gatewayIva,
        restaurant_payout_cop: restaurantPayout,
        status: 'pending'
      })
      .select()
      .single();

    if (paymentError || !paymentRecord) {
      console.error('Error insertando pago:', paymentError);
      return new Response(
        JSON.stringify({ error: 'No fue posible inicializar el intento de pago.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    const allowSandboxSimulation = Deno.env.get('ALLOW_SANDBOX_SIMULATION') === 'true';

    // Return ONLY public parameters to frontend
    return new Response(
      JSON.stringify({ 
        success: true, 
        paymentId: paymentRecord.id, 
        orderId: orderId,
        providerReference: providerReference,
        amountInCents: amountInCents,
        currency: currency,
        publicKey: publicKey,
        signature: signature,
        ...(allowSandboxSimulation ? { sandboxUrl: `#sandbox-simulate:${providerReference}` } : {})
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (err) {
    console.error('Excepción general en create-payment:', err);
    return new Response(
      JSON.stringify({ error: 'Error interno al procesar la solicitud de pago.' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
