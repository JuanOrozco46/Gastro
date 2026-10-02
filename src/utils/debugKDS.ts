/**
 * Utilidad de debug para KDS y permisos de actualización de pedidos
 */

import { supabase } from '../lib/supabase';

export async function debugOrderUpdatePermissions(orderId: string) {
  if (!supabase) {
    console.log('❌ Supabase not configured');
    return;
  }

  console.group('🔍 KDS Order Update Debug');
  
  try {
    // 1. Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      console.error('❌ User Error:', userError);
      console.groupEnd();
      return;
    }
    
    console.log('✅ User ID:', user.id);
    console.log('📧 User Email:', user.email);
    console.log('🔑 User Metadata:', user.user_metadata);
    
    // 2. Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, business_role, tenant_id')
      .eq('id', user.id)
      .maybeSingle();
    
    if (profileError) {
      console.error('❌ Profile Error:', profileError);
    } else if (!profile) {
      console.warn('⚠️ Profile NOT FOUND in database');
      console.log('💡 Solution: Run migration to create profile or insert manually');
    } else {
      console.log('✅ Profile Found:', profile);
      console.log('   - Business Role:', profile.business_role);
      console.log('   - Tenant ID:', profile.tenant_id);
    }
    
    // 3. Get order details
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, restaurant_id, status, fulfillment, customer_id')
      .eq('id', orderId)
      .maybeSingle();
    
    if (orderError) {
      console.error('❌ Order Error:', orderError);
    } else if (!order) {
      console.error('❌ Order NOT FOUND');
    } else {
      console.log('✅ Order Found:', order);
      console.log('   - Restaurant ID:', order.restaurant_id);
      console.log('   - Current Status:', order.status);
      console.log('   - Fulfillment:', order.fulfillment);
    }
    
    // 4. Check permission
    if (profile && order) {
      const hasPermission = profile.tenant_id === order.restaurant_id;
      const hasRole = ['restaurant_owner', 'restaurant_staff'].includes(profile.business_role);
      
      console.log('\n🔐 Permission Check:');
      console.log('   - User tenant matches order restaurant:', hasPermission ? '✅' : '❌');
      console.log('   - User has valid role:', hasRole ? '✅' : '❌');
      
      if (!hasPermission) {
        console.error(`❌ PERMISSION DENIED: User tenant (${profile.tenant_id}) != Order restaurant (${order.restaurant_id})`);
      }
      
      if (!hasRole) {
        console.error(`❌ INVALID ROLE: User has role "${profile.business_role}", needs "restaurant_owner" or "restaurant_staff"`);
      }
      
      if (hasPermission && hasRole) {
        console.log('✅ User has permission to update this order');
      }
    }
    
  } catch (err) {
    console.error('❌ Debug Error:', err);
  }
  
  console.groupEnd();
}

// Auto-call on window for easy debugging
if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as unknown as { debugKDS: unknown }).debugKDS = debugOrderUpdatePermissions;
  console.log('💡 Debug KDS available: window.debugKDS("order-id")');
}
