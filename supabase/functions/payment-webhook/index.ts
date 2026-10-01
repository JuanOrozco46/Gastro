import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Helper: Calculate Wompi Event Checksum to validate webhook authenticity
async function verifyWompiChecksum(payload: any, eventsSecret: string): Promise<boolean> {
  if (!payload.signature || !payload.signature.properties || !payload.signature.checksum) {
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

    return calculatedChecksum.toLowerCase() === payload.signature.checksum.toLowerCase();
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
    // B. Fallback a firma simulada para testing interno local
    else if (sandboxSignature && webhookSecret && sandboxSignature === webhookSecret) {
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
    const amountInCents = transaction.amount_in_cents || payload.amount_in_cents;
    const currency = transaction.currency || payload.currency || 'COP';

    if (!providerReference || !incomingStatus) {
      return new Response(JSON.stringify({ error: 'Payload malformado' }), { status: 400 });
    }

    // 2. Setup Admin Client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 3. Buscar el pago existente
    const { data: payment, error: fetchError } = await supabaseAdmin
      .from('payments')
      .select('id, status, order_id, amount_cop')
      .eq('provider_reference', providerReference)
      .single();

    if (fetchError || !payment) {
      console.error('Pago no encontrado para referencia:', providerReference);
      return new Response(JSON.stringify({ error: 'Referencia no encontrada' }), { status: 404 });
    }

    // 4. Validar monto y moneda contra el registro seguro
    if (amountInCents) {
      const dbAmountInCents = Math.round(payment.amount_cop * 100);
      if (dbAmountInCents !== Number(amountInCents) || currency !== 'COP') {
        console.error('Monto o moneda alterados en el webhook:', { dbAmountInCents, amountInCents, currency });
        return new Response(JSON.stringify({ error: 'Monto o moneda no coinciden' }), { status: 400 });
      }
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
    
    // 7. Actualizar el pago
    const { error: updateError } = await supabaseAdmin
      .from('payments')
      .update({ status: finalStatus })
      .eq('id', payment.id);

    if (updateError) {
      console.error('Error actualizando estado de pago:', updateError);
      return new Response(JSON.stringify({ error: 'Fallo al actualizar base de datos' }), { status: 500 });
    }

    return new Response(
      JSON.stringify({ success: true, newStatus: finalStatus }), 
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('Excepción general en webhook:', err);
    return new Response(JSON.stringify({ error: 'Error interno del servidor' }), { status: 500 });
  }
});
