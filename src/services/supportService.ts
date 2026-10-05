import { supabase } from '../lib/supabase';
import type { Order } from '../types';

export type TicketCategory = 'order' | 'missing_item' | 'wrong_item' | 'damaged_item' | 'delayed_order' | 'delivery' | 'payment' | 'refund_request' | 'restaurant' | 'account' | 'password' | 'menu' | 'technical' | 'safety' | 'other';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent' | 'critical';
export type TicketStatus = 'open' | 'in_review' | 'waiting_for_customer' | 'waiting_for_restaurant' | 'waiting_for_payment_provider' | 'escalated' | 'resolved' | 'closed';

export interface SupportTicket {
  id: string;
  requester_user_id: string;
  restaurant_id: string | null;
  city_id: string | null;
  category: TicketCategory;
  subject: string;
  description: string;
  priority: TicketPriority;
  status: TicketStatus;
  assigned_to: string | null;
  related_order_id: string | null;
  related_payment_id: string | null;
  requester_type: 'customer' | 'restaurant_owner' | 'restaurant_staff';
  subcategory: string | null;
  satisfaction_score: number | null;
  satisfaction_comment: string | null;
  last_customer_message_at: string | null;
  last_agent_message_at: string | null;
  created_at: string;
  updated_at: string;
  first_response_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
}

export interface SupportMessage {
  id: string;
  ticket_id: string;
  author_user_id: string;
  body: string;
  is_internal: boolean;
  created_at: string;
}

// ==========================================
// CLIENT & STAFF SERVICES
// ==========================================

export async function createSupportTicket(data: {
  category: TicketCategory;
  subcategory?: string;
  subject: string;
  description: string;
  restaurant_id?: string;
  city_id?: string;
  related_order_id?: string;
  related_payment_id?: string;
  requester_type?: 'customer' | 'restaurant_owner' | 'restaurant_staff';
}): Promise<{ data: SupportTicket | null, error: string | null }> {
  if (!data.subject.trim() || !data.description.trim()) {
    return { data: null, error: 'El asunto y la descripción son obligatorios.' };
  }
  
  if (data.subject.length > 255) return { data: null, error: 'El asunto es muy largo.' };
  if (data.description.length > 5000) return { data: null, error: 'La descripción es muy larga.' };

  try {
    const { data: user, error: userErr } = await supabase!.auth.getUser();
    if (userErr || !user.user) return { data: null, error: 'No estás autenticado.' };

    const { data: ticket, error } = await supabase!.from('support_tickets').insert({
      requester_user_id: user.user.id,
      requester_type: data.requester_type || 'customer',
      category: data.category,
      subcategory: data.subcategory || null,
      subject: data.subject.trim(),
      description: data.description.trim(),
      restaurant_id: data.restaurant_id || null,
      city_id: data.city_id || null,
      related_order_id: data.related_order_id || null,
      related_payment_id: data.related_payment_id || null
    }).select('*').single();

    if (error) {
      console.error('Error creating ticket', error);
      return { data: null, error: 'No se pudo crear el ticket. Intenta de nuevo más tarde.' };
    }
    
    return { data: ticket as SupportTicket, error: null };
  } catch (err: unknown) {
    console.error('Network err createSupportTicket', err);
    return { data: null, error: 'Error de red.' };
  }
}

export async function fetchMySupportTickets(): Promise<{ data: SupportTicket[], error: string | null }> {
  try {
    const { data: user } = await supabase!.auth.getUser();
    if (!user.user) return { data: [], error: 'No autorizado' };

    const { data, error } = await supabase!.from('support_tickets')
      .select('*')
      .eq('requester_user_id', user.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching my tickets', error);
      return { data: [], error: 'No se pudieron cargar tus tickets.' };
    }
    return { data: (data as SupportTicket[]) || [], error: null };
  } catch (e: unknown) {
    console.error(e);
    return { data: [], error: 'Error de conexión.' };
  }
}

export async function fetchRestaurantSupportTickets(restaurantId: string): Promise<{ data: SupportTicket[], error: string | null }> {
  try {
    const { data, error } = await supabase!.from('support_tickets')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching restaurant tickets', error);
      return { data: [], error: 'No se pudieron cargar los tickets del restaurante.' };
    }
    return { data: (data as SupportTicket[]) || [], error: null };
  } catch (e: unknown) {
    console.error(e);
    return { data: [], error: 'Error de red.' };
  }
}

export async function fetchSupportTicket(ticketId: string): Promise<{
  ticket: SupportTicket | null,
  messages: SupportMessage[],
  order?: Order | null,
  error: string | null 
}> {
  try {
    const { data: ticketData, error: ticketError } = await supabase!.from('support_tickets')
      .select('*')
      .eq('id', ticketId)
      .single();

    if (ticketError) {
      console.error('Error fetching ticket', ticketError);
      return { ticket: null, messages: [], error: 'Ticket no encontrado o sin acceso.' };
    }

    const { data: messagesData, error: msgsError } = await supabase!.from('support_messages')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });

    if (msgsError) {
      console.error('Error fetching messages', msgsError);
    }

    let orderData: Order | null = null;
    if (ticketData && ticketData.related_order_id) {
      const { data: ord } = await supabase!.from('orders').select('*').eq('id', ticketData.related_order_id).single();
      if (ord) {
        orderData = {
          id: ord.id,
          tenantId: ord.restaurant_id,
          createdAt: new Date(ord.created_at).getTime(),
          items: ord.items || [],
          total: ord.total,
          status: ord.status,
          customerName: ord.customer_name,
          customerPhone: ord.customer_phone,
          fulfillment: ord.fulfillment,
          type: ord.type || (ord.fulfillment === 'pickup' ? 'Recogida' : 'Domicilio'),
          paymentMethod: ord.payment_method
        } as Order;
      }
    }

    return { 
      ticket: ticketData as SupportTicket, 
      messages: (messagesData as SupportMessage[]) || [], 
      order: orderData,
      error: null 
    };
  } catch (e: unknown) {
    console.error(e);
    return { ticket: null, messages: [], error: 'Error de conexión al obtener el ticket.' };
  }
}

export async function createSupportMessage(ticketId: string, body: string): Promise<{ data: SupportMessage | null, error: string | null }> {
  if (!body.trim()) return { data: null, error: 'El mensaje no puede estar vacío.' };
  if (body.length > 3000) return { data: null, error: 'El mensaje excede el límite permitido.' };

  try {
    const { data: user } = await supabase!.auth.getUser();
    if (!user.user) return { data: null, error: 'No estás autenticado.' };

    const { data, error } = await supabase!.from('support_messages').insert({
      ticket_id: ticketId,
      author_user_id: user.user.id,
      body: body.trim(),
      is_internal: false
    }).select('*').single();

    if (error) {
      console.error('Error creating message', error);
      return { data: null, error: 'No se pudo enviar el mensaje.' };
    }

    return { data: data as SupportMessage, error: null };
  } catch (e: unknown) {
    console.error(e);
    return { data: null, error: 'Error de red.' };
  }
}

export async function updateSupportTicketStatus(ticketId: string, status: TicketStatus): Promise<{ success: boolean, error: string | null }> {
  try {
    const { error } = await supabase!.from('support_tickets')
      .update({ status })
      .eq('id', ticketId);
      
    if (error) {
      console.error('Error updating status', error);
      return { success: false, error: 'No se pudo cambiar el estado del ticket.' };
    }
    return { success: true, error: null };
  } catch (e: unknown) {
    console.error(e);
    return { success: false, error: 'Error de red.' };
  }
}

// ==========================================
// ADMIN ONLY SERVICES
// ==========================================

export async function fetchAllSupportTickets(): Promise<{ data: SupportTicket[], error: string | null }> {
  try {
    const { data, error } = await supabase!.from('support_tickets')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetchAllSupportTickets', error);
      return { data: [], error: 'Error al cargar los tickets.' };
    }
    return { data: (data as SupportTicket[]) || [], error: null };
  } catch (e: unknown) {
    console.error(e);
    return { data: [], error: 'Error de red.' };
  }
}

export async function assignSupportTicket(ticketId: string, agentId: string | null): Promise<{ success: boolean, error: string | null }> {
  try {
    const { error } = await supabase!.from('support_tickets')
      .update({ assigned_to: agentId })
      .eq('id', ticketId);
      
    if (error) {
      console.error('Error assigning', error);
      return { success: false, error: 'No se pudo asignar el ticket (verifique sus permisos de administrador).' };
    }
    return { success: true, error: null };
  } catch (e: unknown) {
    console.error(e);
    return { success: false, error: 'Error de red.' };
  }
}

export async function updateSupportPriority(ticketId: string, priority: TicketPriority): Promise<{ success: boolean, error: string | null }> {
  try {
    const { error } = await supabase!.from('support_tickets')
      .update({ priority })
      .eq('id', ticketId);
      
    if (error) {
      console.error('Error updating priority', error);
      return { success: false, error: 'No se pudo actualizar la prioridad.' };
    }
    return { success: true, error: null };
  } catch (e: unknown) {
    console.error(e);
    return { success: false, error: 'Error de red.' };
  }
}

export async function createInternalSupportNote(ticketId: string, body: string): Promise<{ data: SupportMessage | null, error: string | null }> {
  if (!body.trim()) return { data: null, error: 'La nota no puede estar vacía.' };
  
  try {
    const { data: user } = await supabase!.auth.getUser();
    if (!user.user) return { data: null, error: 'No autorizado' };

    const { data, error } = await supabase!.from('support_messages').insert({
      ticket_id: ticketId,
      author_user_id: user.user.id,
      body: body.trim(),
      is_internal: true
    }).select('*').single();

    if (error) {
      console.error('Error creating internal note', error);
      return { data: null, error: 'No se pudo crear la nota interna.' };
    }

    return { data: data as SupportMessage, error: null };
  } catch (e: unknown) {
    console.error(e);
    return { data: null, error: 'Error de red.' };
  }
}
