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
        JSON.stringify({ success: true, message: 'La solicitud ya estaba activada.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // 1. Crear Usuario o Vincular Existente
    let newOwnerId = '';
    let successMsg = '';
    
    // Primero, verificamos si el usuario ya existe
    const { data: listData } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    const existingUser = listData?.users.find(u => u.email === application.owner_email.trim());
    
    if (existingUser) {
      newOwnerId = existingUser.id;
      successMsg = 'Restaurante activado y vinculado a la cuenta existente del usuario.';
    } else {
      // Si no existe, lo invitamos y forzamos el cambio de contraseña
      const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
        application.owner_email.trim()
      );

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

    // 2. Generar un slug único
    const baseSlug = application.restaurant_name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'restaurante';
    const uniqueSlug = baseSlug + '-' + Math.floor(Math.random() * 10000).toString();

    // 3. Crear el restaurante
    const { data: restaurantData, error: restaurantError } = await supabaseAdmin.from('restaurants').insert({
      owner_user_id: newOwnerId,
      name: application.restaurant_name.trim(),
      slug: uniqueSlug,
      category: application.category.trim(),
      address: application.address,
      status: 'active',
      is_open: false,
      city_id: application.city_id,
      zone_id: application.zone_id,
      phone: application.owner_phone,
      whatsapp: application.whatsapp,
      delivery_modes: application.delivery_modes || ['pickup', 'restaurant_delivery'],
      delivery_fee: application.delivery_fee || 0,
      delivery_radius_km: application.delivery_radius_km || 5
    }).select('id').single();

    if (restaurantError) throw new Error('Error al crear el restaurante.');

    // 4. Vincular al usuario como dueño
    const { error: memberError } = await supabaseAdmin.from('restaurant_members').insert({
      restaurant_id: restaurantData.id,
      user_id: newOwnerId,
      role: 'owner'
    });

    if (memberError) {
      // Compensación manual si falla la vinculación (idealmente usar RPC transaccional)
      await supabaseAdmin.from('restaurants').delete().eq('id', restaurantData.id);
      throw new Error('Error al vincular el usuario al restaurante.');
    }

    // 5. Marcar solicitud como aprobada y activada
    await supabaseAdmin.from('restaurant_applications').update({
      status: 'approved',
      reviewed_at: application.reviewed_at || new Date().toISOString(),
      reviewed_by: application.reviewed_by || user.id,
      activated_at: new Date().toISOString(),
      activated_restaurant_id: restaurantData.id,
      activated_by: user.id
    }).eq('id', applicationId);

    return new Response(
      JSON.stringify({ success: true, message: successMsg, tenantId: restaurantData.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: msg }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  }
})
