import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Falta el token de autorización');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    // Cliente con Service Role para operaciones seguras (nunca exponer a frontend)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    // Cliente normal con el token del usuario para validar permisos
    const supabaseUser = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      throw new Error('No autorizado');
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('platform_role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.platform_role !== 'platform_admin') {
      throw new Error('Permisos insuficientes');
    }

    const body = await req.json();
    const applicationId = body.applicationId || body.application?.id;
    
    if (!applicationId) {
      throw new Error('Falta el ID de la solicitud');
    }

    // Obtener solicitud
    const { data: application, error: appError } = await supabaseAdmin
      .from('restaurant_applications')
      .select('*')
      .eq('id', applicationId)
      .single();

    if (appError || !application) {
      throw new Error(`Solicitud no encontrada. Detalles: ${appError?.message || 'Ninguno'}. ID buscado: ${applicationId}`);
    }

    if (application.status === 'rejected') {
      throw new Error('La solicitud fue rechazada y no puede activarse');
    }

    if (application.activated_restaurant_id || application.activated_at) {
      return new Response(
        JSON.stringify({ success: true, message: 'La solicitud ya estaba activada.', tenantId: application.activated_restaurant_id ?? undefined }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // La activación solo es válida sobre solicitudes aprobadas explícitamente.
    if (application.status !== 'approved') {
      throw new Error('La solicitud debe estar aprobada antes de activarse');
    }

    // 0. RECLAMO ATÓMICO: evita que dos activaciones concurrentes (doble clic,
    //    dos administradores) creen dos restaurantes. Solo una fila-update gana.
    const claimTs = new Date().toISOString();
    const { data: claimed, error: claimError } = await supabaseAdmin
      .from('restaurant_applications')
      .update({ activated_at: claimTs })
      .eq('id', applicationId)
      .eq('status', 'approved')
      .is('activated_at', null)
      .is('activated_restaurant_id', null)
      .select('id');

    if (claimError) throw new Error('No se pudo reservar la activación: ' + claimError.message);
    if (!claimed || claimed.length === 0) {
      throw new Error('La activación de esta solicitud ya está en curso o fue completada');
    }

    const releaseClaim = async () => {
      await supabaseAdmin.from('restaurant_applications')
        .update({ activated_at: null })
        .eq('id', applicationId)
        .is('activated_restaurant_id', null);
    };

    let createdRestaurantId: string | null = null;
    try {
      // 1. Crear Usuario o Vincular Existente (comparación sin distinguir mayúsculas, con paginación)
      const ownerEmail = application.owner_email.trim().toLowerCase();
      let newOwnerId = '';
      let successMsg = '';

      let existingUserId: string | null = null;
      for (let page = 1; page <= 10 && !existingUserId; page++) {
        const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
        if (listError) throw new Error('No se pudo verificar si el usuario ya existe: ' + listError.message);
        const users = listData?.users ?? [];
        const found = users.find(u => (u.email ?? '').trim().toLowerCase() === ownerEmail);
        if (found) existingUserId = found.id;
        if (users.length < 1000) break;
      }

      if (existingUserId) {
        newOwnerId = existingUserId;
        successMsg = 'Restaurante activado y vinculado a la cuenta existente del usuario.';
      } else {
        // Si no existe, lo invitamos: el dueño define su propia contraseña (nunca se genera ni se muestra una)
        const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(ownerEmail);
        if (inviteError) {
          throw new Error('Error al enviar invitación al usuario: ' + inviteError.message);
        }

        newOwnerId = inviteData.user.id;

        // Marcar al usuario para que cambie la contraseña obligatoriamente al iniciar sesión
        await supabaseAdmin.auth.admin.updateUserById(newOwnerId, {
          user_metadata: { needs_password_set: true }
        });

        successMsg = `Restaurante activado. Se ha enviado un correo de invitación al dueño.`;
      }

      // 2. Generar un slug único (reintenta ante colisión)
      const baseSlug = application.restaurant_name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'restaurante';

      // 3. Crear el restaurante
      let restaurantId: string | null = null;
      let lastInsertError: string | undefined;
      for (let attempt = 0; attempt < 5 && !restaurantId; attempt++) {
        const uniqueSlug = baseSlug + '-' + Math.floor(Math.random() * 100000).toString();
        const { data: restaurantData, error: restaurantError } = await supabaseAdmin.from('restaurants').insert({
          owner_user_id: newOwnerId,
          name: application.restaurant_name.trim(),
          slug: uniqueSlug,
          category: application.category.trim(),
          description: application.description ?? null,
          address: application.address,
          status: 'active',
          is_open: false,
          city_id: application.city_id,
          zone_id: application.zone_id,
          phone: application.owner_phone,
          whatsapp: application.whatsapp,
          min_order: application.min_order ?? null,
          estimated_delivery_minutes: application.estimated_delivery_minutes ?? null,
          delivery_modes: application.delivery_modes || ['pickup', 'restaurant_delivery'],
          delivery_fee: application.delivery_fee || 0,
          delivery_radius_km: application.delivery_radius_km || 5
        }).select('id').single();

        if (!restaurantError && restaurantData) {
          restaurantId = restaurantData.id;
        } else {
          lastInsertError = restaurantError?.message;
          if (restaurantError?.code !== '23505') break; // solo reintentar colisiones de slug
        }
      }

      if (!restaurantId) throw new Error('Error al crear el restaurante.' + (lastInsertError ? ` (${lastInsertError})` : ''));
      createdRestaurantId = restaurantId;

      // 4. Vincular al usuario como dueño activo
      const { error: memberError } = await supabaseAdmin.from('restaurant_members').insert({
        restaurant_id: restaurantId,
        user_id: newOwnerId,
        email: ownerEmail,
        role: 'owner',
        status: 'active',
        accepted_at: new Date().toISOString()
      });

      if (memberError) {
        throw new Error('Error al vincular el usuario al restaurante: ' + memberError.message);
      }

      // 4b. Sincronizar perfil del propietario con rol de restaurante y datos de la solicitud
      await supabaseAdmin.from('profiles').upsert({
        id: newOwnerId,
        full_name: application.owner_name?.trim() || ownerEmail,
        phone: application.owner_phone?.trim() || null,
        default_address: application.address?.trim() || null,
        platform_role: 'customer',
        business_role: 'restaurant_owner',
        tenant_id: restaurantId,
        updated_at: new Date().toISOString()
      });

      // 5. Marcar la solicitud como activada (verificando el resultado)
      const { error: finalError } = await supabaseAdmin.from('restaurant_applications').update({
        status: 'approved',
        reviewed_at: application.reviewed_at || new Date().toISOString(),
        reviewed_by: application.reviewed_by || user.id,
        activated_at: new Date().toISOString(),
        activated_restaurant_id: restaurantId,
        activated_by: user.id
      }).eq('id', applicationId);

      if (finalError) {
        throw new Error('No se pudo registrar la activación en la solicitud: ' + finalError.message);
      }

      return new Response(
        JSON.stringify({ success: true, message: successMsg, tenantId: restaurantId }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    } catch (innerError: unknown) {
      // Compensación: deshacer lo creado y liberar el reclamo para poder reintentar.
      if (createdRestaurantId) {
        await supabaseAdmin.from('restaurant_members').delete().eq('restaurant_id', createdRestaurantId);
        await supabaseAdmin.from('restaurants').delete().eq('id', createdRestaurantId);
      }
      await releaseClaim();
      throw innerError;
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: msg }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  }
})
