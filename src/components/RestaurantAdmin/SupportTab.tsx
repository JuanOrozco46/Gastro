import React, { useState, useEffect } from 'react';
import { 
  createSupportTicket, 
  fetchRestaurantSupportTickets, 
  fetchSupportTicket, 
  createSupportMessage,
  updateSupportTicketStatus
} from '../../services/supportService';
import type { SupportTicket, SupportMessage, TicketCategory } from '../../services/supportService';
import { MessageSquare, Plus, ArrowLeft, Send, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { safeFormatDate } from '../../utils/formatters';

interface Props {
  restaurantId: string;
}

export const SupportTab: React.FC<Props> = ({ restaurantId }) => {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeView, setActiveView] = useState<'list' | 'create' | 'conversation'>('list');
  
  // Create ticket state
  const [category, setCategory] = useState<TicketCategory>('restaurant');
  const [subcategory, setSubcategory] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Conversation state
  const [activeTicket, setActiveTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loadingConv, setLoadingConv] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase!.auth.getUser().then(({ data }) => {
      if (data.user) setCurrentUserId(data.user.id);
    });
    loadTickets();
  }, [restaurantId]);

  const loadTickets = async () => {
    setLoading(true);
    const { data, error } = await fetchRestaurantSupportTickets(restaurantId);
    if (error) setError(error);
    else setTickets(data);
    setLoading(false);
  };

  const loadConversation = async (ticketId: string) => {
    setLoadingConv(true);
    setError(null);
    const { ticket, messages, error } = await fetchSupportTicket(ticketId);
    if (error) {
      setError(error);
    } else {
      setActiveTicket(ticket);
      setMessages(messages);
      setActiveView('conversation');
    }
    setLoadingConv(false);
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    
    const { data, error } = await createSupportTicket({
      category,
      subcategory: subcategory || undefined,
      subject,
      description,
      restaurant_id: restaurantId,
      requester_type: 'restaurant_owner'
    });

    if (error || !data) {
      setError(error || 'Error al crear ticket');
    } else {
      setTickets([data, ...tickets]);
      setCategory('restaurant');
      setSubcategory('');
      setSubject('');
      setDescription('');
      setActiveView('list');
    }
    setIsSubmitting(false);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeTicket) return;
    
    setIsSubmitting(true);
    const { data, error } = await createSupportMessage(activeTicket.id, newMessage);
    if (error) {
      alert(error);
    } else if (data) {
      setMessages([...messages, data]);
      setNewMessage('');
      
      // If the ticket was waiting for restaurant, mark it open again.
      if (activeTicket.status === 'waiting_for_restaurant') {
        const { success } = await updateSupportTicketStatus(activeTicket.id, 'open');
        if (success) setActiveTicket({ ...activeTicket, status: 'open' });
      }
    }
    setIsSubmitting(false);
  };

  const getStatusText = (status: string) => {
    switch(status) {
      case 'open': return 'Abierto';
      case 'in_review': return 'En Revisión';
      case 'waiting_for_customer': return 'Esperando al cliente';
      case 'waiting_for_restaurant': return 'Esperando tu respuesta';
      case 'waiting_for_payment_provider': return 'Espera Pago';
      case 'escalated': return 'Escalado';
      case 'resolved': return 'Resuelto';
      case 'closed': return 'Cerrado';
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'open': return '#3B82F6';
      case 'in_review': return '#F59E0B';
      case 'waiting_for_customer': return '#EC4899';
      case 'waiting_for_restaurant': return '#8B5CF6';
      case 'waiting_for_payment_provider': return '#6366F1';
      case 'escalated': return '#EF4444';
      case 'resolved': return '#10B981';
      case 'closed': return '#6B7280';
      default: return '#9CA3AF';
    }
  };

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '10px' }}>
          <MessageSquare style={{ color: 'var(--primary)' }} />
          Soporte para Restaurantes
        </h1>
        {activeView === 'list' && (
          <button 
            onClick={() => setActiveView('create')}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={18} /> Crear Caso de Soporte
          </button>
        )}
      </div>

      {error && (
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#EF4444', padding: '12px', borderRadius: '8px', marginBottom: '16px' }}>
          {error}
        </div>
      )}

      {/* TICKET LIST */}
      {activeView === 'list' && (
        <AnimatePresence>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {loading ? (
              <p>Cargando tickets...</p>
            ) : tickets.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', background: 'var(--glass-overlay)', borderRadius: '16px' }}>
                <MessageSquare size={48} style={{ color: '#64748b', margin: '0 auto 16px' }} />
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '8px' }}>No hay casos abiertos</h3>
                <p style={{ color: '#94a3b8', fontSize: '0.95rem' }}>Si necesitas ayuda con tu restaurante, facturación o cuenta, puedes crear un ticket.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {tickets.map(ticket => (
                  <div 
                    key={ticket.id} 
                    onClick={() => loadConversation(ticket.id)}
                    style={{ 
                      background: 'var(--glass-medium)', padding: '16px', borderRadius: '16px', 
                      cursor: 'pointer', border: '1px solid rgba(255,255,255,0.05)',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
                        {ticket.priority === 'urgent' && <AlertTriangle size={14} color="#EF4444" />}
                        <h4 style={{ fontWeight: 700, fontSize: '1.1rem', margin: 0 }}>{ticket.subject}</h4>
                      </div>
                      <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Creado el {new Date(ticket.created_at).toLocaleDateString()}</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ background: getStatusColor(ticket.status) + '20', color: getStatusColor(ticket.status), padding: '6px 12px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 800 }}>
                        {getStatusText(ticket.status)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      )}

      {/* CREATE TICKET */}
      {activeView === 'create' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card" style={{ padding: '24px' }}>
          <button onClick={() => setActiveView('list')} style={{ background: 'none', border: 'none', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '16px', cursor: 'pointer', padding: 0 }}>
            <ArrowLeft size={16} /> Volver a mis tickets
          </button>
          
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '20px' }}>Nuevo Caso de Soporte</h2>
          
          <form onSubmit={handleCreateTicket} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '0.9rem' }}>Categoría</label>
              <select className="form-input" value={category} onChange={e => setCategory(e.target.value as TicketCategory)} required>
                <option value="account">Mi Cuenta / Perfil</option>
                <option value="payment">Pagos y Facturación</option>
                <option value="order">Problema con un Pedido de un cliente</option>
                <option value="delayed_order">Pedido muy Demorado</option>
                <option value="delivery">Problema con un Repartidor</option>
                <option value="menu">Menú y Productos</option>
                <option value="technical">Error Técnico</option>
                <option value="safety">Reporte de Seguridad</option>
                <option value="other">Otro asunto</option>
              </select>
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '0.9rem' }}>Asunto</label>
              <input type="text" className="form-input" value={subject} onChange={e => setSubject(e.target.value)} required placeholder="Breve resumen del problema" maxLength={250} />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '0.9rem' }}>Descripción detallada</label>
              <textarea 
                className="form-input" 
                value={description} 
                onChange={e => setDescription(e.target.value)} 
                required 
                placeholder="Por favor, describe detalladamente qué ocurrió..." 
                rows={5}
                maxLength={4000}
              />
            </div>

            <button type="submit" className="btn btn-primary" disabled={isSubmitting} style={{ padding: '12px', fontSize: '1rem' }}>
              {isSubmitting ? 'Enviando...' : 'Crear Caso'}
            </button>
          </form>
        </motion.div>
      )}

      {/* CONVERSATION VIEW */}
      {activeView === 'conversation' && activeTicket && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <button onClick={() => { setActiveView('list'); setActiveTicket(null); setMessages([]); }} style={{ background: 'none', border: 'none', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', padding: 0 }}>
              <ArrowLeft size={16} /> Volver
            </button>
            <div style={{ background: getStatusColor(activeTicket.status) + '20', color: getStatusColor(activeTicket.status), padding: '6px 12px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 800 }}>
              {getStatusText(activeTicket.status)}
            </div>
          </div>

          <div className="card" style={{ padding: '20px', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '8px' }}>{activeTicket.subject}</h2>
            <p style={{ color: '#E2E8F0', whiteSpace: 'pre-wrap', lineHeight: 1.5, fontSize: '0.95rem' }}>{activeTicket.description}</p>
            <div style={{ marginTop: '16px', fontSize: '0.8rem', color: '#94a3b8' }}>
              Ticket creado el {safeFormatDate(activeTicket.created_at)}
            </div>
          </div>

          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '16px' }}>Conversación</h3>
          
          {loadingConv ? (
            <p>Cargando mensajes...</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
              {messages.length === 0 && (
                <p style={{ color: '#94a3b8', textAlign: 'center', padding: '20px' }}>Un agente de soporte revisará tu caso pronto.</p>
              )}
              {messages.map(msg => {
                const isMine = msg.author_user_id === currentUserId;
                return (
                  <div key={msg.id} style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      background: isMine ? 'var(--primary)' : 'rgba(255,255,255,0.1)',
                      color: 'white',
                      padding: '12px 16px',
                      borderRadius: '16px',
                      borderBottomRightRadius: isMine ? '4px' : '16px',
                      borderBottomLeftRadius: !isMine ? '4px' : '16px',
                      maxWidth: '85%'
                    }}>
                      <div style={{ fontSize: '0.75rem', opacity: 0.8, marginBottom: '4px', fontWeight: 600 }}>
                        {isMine ? 'Tú (Restaurante)' : 'Soporte GastroSync'}
                      </div>
                      <p style={{ whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.4, fontSize: '0.95rem' }}>{msg.body}</p>
                      <div style={{ fontSize: '0.65rem', opacity: 0.6, marginTop: '8px', textAlign: 'right' }}>
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {activeTicket.status !== 'closed' && activeTicket.status !== 'resolved' && (
            <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: '10px' }}>
              <input
                type="text"
                className="form-input"
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
                placeholder="Escribe tu respuesta aquí..."
                required
                maxLength={3000}
                style={{ flex: 1 }}
              />
              <button type="submit" className="btn btn-primary" disabled={isSubmitting || !newMessage.trim()} style={{ padding: '0 20px' }}>
                <Send size={18} />
              </button>
            </form>
          )}

        </motion.div>
      )}
    </div>
  );
};
