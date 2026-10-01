import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
  // CORS options preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { orderId, provider = 'wompi' } = await req.json();

    if (!orderId) {
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

    // Validate Auth user
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

    const userId = userData.user.id;

    // Retrieve order and validate ownership & status
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('id, customer_id, total_cop, status, delivery_fee_cop, subtotal_cop')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return new Response(
        JSON.stringify({ error: 'Pedido no encontrado en la base de datos.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    if (order.customer_id !== userId) {
      return new Response(
        JSON.stringify({ error: 'El pedido no pertenece al usuario autenticado.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      );
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

    // Canonical calculations from PostgreSQL order data
    const canonicalTotal = Number(order.total_cop);
    const amountInCents = Math.round(canonicalTotal * 100);
    const currency = 'COP';

    // Generate unique controlled payment reference
    const cleanOrderId = orderId.replace(/-/g, '').slice(0, 8);
    const providerReference = `GS_PAY_${cleanOrderId}_${Date.now()}`;

    // Wompi keys & integrity secret
    const publicKey = Deno.env.get('WOMPI_PUBLIC_KEY') || 'pub_test_Q5y1F3WwWLu1G2A1z0y3Z5';
    const integritySecret = Deno.env.get('WOMPI_INTEGRITY_SECRET') || 'test_integrity_secret_placeholder';

    // Compute Wompi Integrity Signature on server
    const signature = await calculateWompiIntegrity(
      providerReference,
      amountInCents,
      currency,
      integritySecret
    );

    // Platform fee (3%) and payout
    const subtotal = Number(order.subtotal_cop || canonicalTotal);
    const platformFee = Math.floor(subtotal * 0.03);
    const restaurantPayout = canonicalTotal - platformFee;

    // Create payment intent record with status 'pending'
    const { data: paymentRecord, error: paymentError } = await supabaseAdmin
      .from('payments')
      .insert({
        order_id: orderId,
        provider: provider,
        provider_reference: providerReference,
        amount_cop: canonicalTotal,
        platform_fee_cop: platformFee,
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
        sandboxUrl: `/sandbox-payment?ref=${providerReference}` 
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
