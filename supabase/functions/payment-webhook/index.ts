import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Helper: Constant-time string comparison to prevent timing attacks on signatures (P3 #6)
function timingSafeEqualStrings(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  if (aBytes.length !== bBytes.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}

// Helper: Calculate Wompi Event Checksum to validate webhook authenticity
async function verifyWompiChecksum(payload: any, eventsSecret: string): Promise<boolean> {
  if (!payload.signature || !payload.signature.properties || typeof payload.signature.checksum !== 'string') {
    return false;
  }
  try {
    const props: string[] = payload.signature.properties;
    let concatenated = '';
    
    for (const propPath of props) {
      const parts = propPath.split('.');
      let val: any = payload.data;
      for (const part of parts) {
        val = val?.[part];
      }
      concatenated += String(val ?? '');
    }
    
    const timestamp = payload.timestamp ?? payload.sent_at ?? '';
    concatenated += String(timestamp);
    concatenated += eventsSecret;

    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(concatenated));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const calculatedChecksum = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    return timingSafeEqualStrings(
      calculatedChecksum.toLowerCase(),
      payload.signature.checksum.toLowerCase()
    );
  } catch (err) {
    console.error('Error calculando checksum del webhook:', err);
    return false;
  }
}

serve(async (req) => {
  try {
    const payload = await req.json();
    
    // 1. Validar firma del Webhook
    const wompiEventsSecret = Deno.env.get('WOMPI_EVENTS_SECRET');
    const sandboxSignature = req.headers.get('x-sandbox-signature');
    const webhookSecret = Deno.env.get('WEBHOOK_SECRET');

    let isValid = false;

    // A. Validar firma oficial de Wompi si el payload tiene la estructura
    if (payload.signature && wompiEventsSecret) {
      isValid = await verifyWompiChecksum(payload, wompiEventsSecret);
    } 
    // B. Fallback a firma simulada para testing interno local (comparación timing-safe)
    else if (sandboxSignature && webhookSecret && timingSafeEqualStrings(sandboxSignature, webhookSecret)) {
      isValid = true;
    }

    if (!isValid) {
      console.error('Firma de webhook inválida o ausente.');
      return new Response(JSON.stringify({ error: 'Firma inválida' }), { status: 401 });
    }

    // Identificar propiedades del evento Wompi
    const transaction = payload.data?.transaction || payload;
    const providerReference = transaction.reference || payload.reference;
    const incomingStatus = transaction.status || payload.status;
    const amountInCents = transaction.amount_in_cents ?? payload.amount_in_cents;
    const currency = transaction.currency || payload.currency || 'COP';
    const externalTransactionId = transaction.id ? String(transaction.id) : null;
    const providerPaymentMethod = transaction.payment_method_type
      ? String(transaction.payment_method_type).toUpperCase()
      : null;

    if (!providerReference || !incomingStatus) {
      return new Response(JSON.stringify({ error: 'Payload malformado' }), { status: 400 });
    }

    // Exigir siempre amount_in_cents válido en el webhook (P3 #7)
    const parsedAmountInCents = Number(amountInCents);
    if (amountInCents === undefined || amountInCents === null || !Number.isFinite(parsedAmountInCents) || parsedAmountInCents <= 0) {
      console.error('Webhook rechazado: amount_in_cents ausente o inválido:', amountInCents);
      return new Response(JSON.stringify({ error: 'Monto ausente o inválido en el evento' }), { status: 400 });
    }

    // 2. Setup Admin Client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 3. Buscar el pago existente
    const { data: payment, error: fetchError } = await supabaseAdmin
      .from('payments')
      .select('id, status, order_id, amount_cop, provider')
      .eq('provider_reference', providerReference)
      .single();

    if (fetchError || !payment) {
      console.error('Pago no encontrado para referencia:', providerReference);
      return new Response(JSON.stringify({ error: 'Referencia no encontrada' }), { status: 404 });
    }

    // 4. Validar monto y moneda contra el registro seguro de forma incondicional (P3 #7)
    const dbAmountInCents = Math.round(Number(payment.amount_cop) * 100);
    if (dbAmountInCents !== parsedAmountInCents || currency !== 'COP') {
      console.error('Monto o moneda alterados en el webhook:', { dbAmountInCents, parsedAmountInCents, currency });
      return new Response(JSON.stringify({ error: 'Monto o moneda no coinciden' }), { status: 400 });
    }

    // 5. Idempotencia: No procesar si ya estaba finalizado
    if (['approved', 'declined', 'failed', 'voided', 'refunded'].includes(payment.status)) {
      console.log('Webhook ignorado por idempotencia. Estado actual:', payment.status);
      return new Response(JSON.stringify({ success: true, note: 'Idempotency caught' }), { status: 200 });
    }

    // 6. Mapeo seguro de estados
    let finalStatus = 'pending';
    const upperStatus = String(incomingStatus).toUpperCase();
    
    if (upperStatus === 'APPROVED') finalStatus = 'approved';
    else if (upperStatus === 'DECLINED') finalStatus = 'declined';
    else if (upperStatus === 'FAILED' || upperStatus === 'ERROR') finalStatus = 'failed';
    else if (upperStatus === 'VOIDED') finalStatus = 'voided';
    
    // 7. Actualizar el pago con auditoría de transacción Wompi
    const updatePatch: Record<string, unknown> = {
      status: finalStatus
    };
    if (externalTransactionId) updatePatch.external_transaction_id = externalTransactionId;
    if (providerPaymentMethod) updatePatch.provider_payment_method = providerPaymentMethod;

    const { error: updateError } = await supabaseAdmin
      .from('payments')
      .update(updatePatch)
      .eq('id', payment.id);

    if (updateError) {
      // Si el índice único parcial idx_payments_one_approved_per_order rechazó un segundo cobro aprobado para el mismo pedido (P1 #1)
      if ((updateError as { code?: string }).code === '23505') {
        console.warn('Intento de doble aprobación detectado por índice único para order_id:', payment.order_id);
        await supabaseAdmin
          .from('payments')
          .update({ status: 'voided' })
          .eq('id', payment.id);
        return new Response(
          JSON.stringify({ success: true, note: 'Duplicate approved payment prevented and voided' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      console.error('Error actualizando estado de pago:', updateError);
      return new Response(JSON.stringify({ error: 'Fallo al actualizar base de datos' }), { status: 500 });
    }

    // 8. Si el pago fue aprobado, anular cualquier otro intento pendiente del mismo pedido y reevaluar el cupo
    if (finalStatus === 'approved' && payment.order_id) {
      await supabaseAdmin
        .from('payments')
        .update({ status: 'voided' })
        .eq('order_id', payment.order_id)
        .eq('status', 'pending')
        .neq('id', payment.id);

      const { data: orderData } = await supabaseAdmin
        .from('orders')
        .select('restaurant_id')
        .eq('id', payment.order_id)
        .single();

      if (orderData?.restaurant_id) {
        await supabaseAdmin.rpc('evaluate_restaurant_cash_limit_lock', {
          p_restaurant_id: orderData.restaurant_id
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        newStatus: finalStatus,
        externalTransactionId,
        providerPaymentMethod
      }), 
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('Excepción general en webhook:', err);
    return new Response(JSON.stringify({ error: 'Error interno del servidor' }), { status: 500 });
  }
});
