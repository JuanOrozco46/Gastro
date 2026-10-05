import React, { useState, useEffect, useCallback } from 'react';
import { 
  createSupportTicket, 
  fetchMySupportTickets, 
  fetchSupportTicket, 
  createSupportMessage,
  updateSupportTicketStatus
} from '../services/supportService';
import type { SupportTicket, SupportMessage, TicketCategory } from '../services/supportService';
import { MessageSquare, Plus, ArrowLeft, Send, CheckCircle, RefreshCcw, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { safeFormatDate } from '../utils/formatters';
import { SupportFeedbackForm } from './SupportFeedbackForm';

interface SupportCenterProps {
  initialOrderId?: string | null;
  initialTicketId?: string | null;
}

export const SupportCenter: React.FC<SupportCenterProps> = ({ initialOrderId, initialTicketId }) => {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeView, setActiveView] = useState<'list' | 'create' | 'conversation'>(initialTicketId ? 'conversation' : (initialOrderId ? 'create' : 'list'));
  const [, setSelectedTicketId] = useState<string | null>(null);
  
  // Create ticket state
  const [category, setCategory] = useState<TicketCategory>('order');
  const [subcategory, setSubcategory] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [relatedOrderId, setRelatedOrderId] = useState(initialOrderId || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Conversation state
  const [activeTicket, setActiveTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loadingConv, setLoadingConv] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [prevInitialOrderId, setPrevInitialOrderId] = useState(initialOrderId);
  if (initialOrderId !== prevInitialOrderId) {
    setPrevInitialOrderId(initialOrderId);
    if (initialOrderId) {
      setActiveView('create');
      setCategory('order');
      setRelatedOrderId(initialOrderId);
    }
  }

  const loadTickets = useCallback(() => {
    fetchMySupportTickets().then(({ data, error }) => {
      if (error) setError(error);
      else setTickets(data);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    supabase!.auth.getUser().then(({ data }) => {
      if (data.user) setCurrentUserId(data.user.id);
    });
    loadTickets();
  }, [loadTickets]);

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
      setSelectedTicketId(ticketId);
    }
    setLoadingConv(false);
  };

  const [prevInitialTicketId, setPrevInitialTicketId] = useState(initialTicketId);
  useEffect(() => {
    if (initialTicketId && initialTicketId !== prevInitialTicketId) {
      Promise.resolve().then(() => {
        setPrevInitialTicketId(initialTicketId);
        setActiveView('conversation');
        loadConversation(initialTicketId);
      });
    }
  }, [initialTicketId, prevInitialTicketId]);

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    
    const { data, error } = await createSupportTicket({
      category,
      subcategory: subcategory || undefined,
      subject,
      description,
      related_order_id: relatedOrderId || undefined
    });

    if (error || !data) {
      setError(error || 'Error al crear ticket');
    } else {
      setTickets([data, ...tickets]);
      setCategory('order');
      setSubject('');
      setDescription('');
      setSubcategory('');
      setRelatedOrderId('');
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
      
      // If ticket was waiting_for_customer, we could auto-reopen or set open, but the user is replying.
      if (activeTicket.status === 'waiting_for_customer') {
        const { success } = await updateSupportTicketStatus(activeTicket.id, 'open');
        if (success) setActiveTicket({ ...activeTicket, status: 'open' });
      }
    }
    setIsSubmitting(false);
  };

  const handleChangeStatus = async (newStatus: 'closed' | 'open') => {
    if (!activeTicket) return;
    setIsSubmitting(true);
    const { success, error } = await updateSupportTicketStatus(activeTicket.id, newStatus);
    if (success) {
      setActiveTicket({ ...activeTicket, status: newStatus });
      setTickets(tickets.map(t => t.id === activeTicket.id ? { ...t, status: newStatus } : t));
    } else {
      alert(error || 'Error al actualizar el ticket');
    }
    setIsSubmitting(false);
  };

  const getStatusText = (status: string) => {
    switch(status) {
      case 'open': return 'Abierto';
      case 'in_review': return 'En Revisión';
      case 'waiting_for_customer': return 'Esperando al equipo';
      case 'waiting_for_restaurant': return 'Esperando al restaurante';
      case 'waiting_for_payment_provider': return 'Espera de Pago';
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
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px', minHeight: '100vh', paddingBottom: '100px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '10px' }}>
          <MessageSquare style={{ color: 'var(--primary)' }} />
          Centro de Soporte Humano
        </h1>
        {activeView === 'list' && (
          <button 
            onClick={() => setActiveView('create')}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={18} /> Crear Solicitud
          </button>
        )}
      </div>

      <div style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '12px', borderRadius: '12px', marginBottom: '24px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
        <Info size={24} style={{ color: '#3B82F6', flexShrink: 0 }} />
        <p style={{ fontSize: '0.9rem', color: '#E2E8F0', lineHeight: 1.5 }}>
          <strong>Atención Real y Transparente.</strong> Nuestro equipo revisa cada caso personalmente. No usamos respuestas automáticas para cerrar solicitudes. Si tu caso requiere revisión, te responderemos dentro de nuestro horario de atención habitual.
        </p>
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
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '8px' }}>No tienes tickets activos</h3>
                <p style={{ color: '#94a3b8', fontSize: '0.95rem' }}>Si necesitas ayuda, puedes abrir una solicitud en cualquier momento.</p>
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
                      <h4 style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '4px' }}>{ticket.subject}</h4>
                      <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Creado el {new Date(ticket.created_at).toLocaleDateString()}</p>
                    </div>
                    <div style={{ background: getStatusColor(ticket.status) + '20', color: getStatusColor(ticket.status), padding: '6px 12px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 800 }}>
                      {getStatusText(ticket.status)}
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
          
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '20px' }}>Cuéntanos qué ocurrió</h2>
          
          <form onSubmit={handleCreateTicket} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '0.9rem' }}>Categoría</label>
              <select className="form-input" value={category} onChange={e => setCategory(e.target.value as TicketCategory)} required>
                <option value="order">Problema general con Pedido</option>
                <option value="missing_item">Artículo Faltante</option>
                <option value="wrong_item">Artículo Equivocado</option>
                <option value="damaged_item">Pedido en Mal Estado</option>
                <option value="delayed_order">Pedido muy Demorado</option>
                <option value="delivery">Problema con Repartidor</option>
                <option value="payment">Problema de Pago / Cobros</option>
                <option value="refund_request">Solicitud de Reembolso</option>
                <option value="restaurant">Queja sobre Restaurante</option>
                <option value="account">Problema con mi Cuenta</option>
                <option value="password">Recuperación de Contraseña</option>
                <option value="menu">Error en Menú o Precios</option>
                <option value="technical">Error Técnico en la App</option>
                <option value="safety">Reporte de Seguridad</option>
                <option value="other">Otro asunto</option>
              </select>
            </div>

            {relatedOrderId && (
              <div style={{ background: 'rgba(56, 189, 248, 0.1)', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(56, 189, 248, 0.2)' }}>
                <span style={{ fontSize: '0.85rem', color: '#38BDF8', fontWeight: 700 }}>Asociado al Pedido #{relatedOrderId.slice(0, 8)}</span>
                <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>Este ticket se vinculará directamente a tu pedido para una revisión más rápida.</p>
              </div>
            )}
            
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
                placeholder="Por favor, describe exactamente qué pasó para poder ayudarte de manera precisa..." 
                rows={5}
                maxLength={4000}
              />
            </div>

            <button type="submit" className="btn btn-primary" disabled={isSubmitting} style={{ padding: '12px', fontSize: '1rem' }}>
              {isSubmitting ? 'Enviando...' : 'Enviar Solicitud'}
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
                <p style={{ color: '#94a3b8', textAlign: 'center', padding: '20px' }}>Tu caso está siendo revisado. Aún no hay respuestas.</p>
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
                        {isMine ? 'Tú' : 'Agente de Soporte'}
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
                placeholder="Puedes responder en esta conversación..."
                required
                maxLength={3000}
                style={{ flex: 1 }}
              />
              <button type="submit" className="btn btn-primary" disabled={isSubmitting || !newMessage.trim()} style={{ padding: '0 20px' }}>
                <Send size={18} />
              </button>
            </form>
          )}

          {(activeTicket.status === 'resolved' || activeTicket.status === 'closed') ? (
            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '20px', borderRadius: '12px', textAlign: 'center', marginTop: '20px' }}>
              <p style={{ marginBottom: '16px', color: '#E2E8F0' }}>Este caso ha sido marcado como {activeTicket.status === 'resolved' ? 'resuelto' : 'cerrado'}.</p>
              <button onClick={() => handleChangeStatus('open')} className="btn btn-secondary" disabled={isSubmitting}>
                <RefreshCcw size={16} style={{ marginRight: '8px' }} />
                Reabrir si el problema continúa
              </button>
              
              <div style={{ marginTop: '30px', textAlign: 'left' }}>
                <SupportFeedbackForm ticketId={activeTicket.id} />
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', marginTop: '24px' }}>
              <button onClick={() => handleChangeStatus('closed')} className="btn btn-secondary" disabled={isSubmitting} style={{ background: 'transparent', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.1)' }}>
                <CheckCircle size={16} style={{ marginRight: '6px' }} />
                Cerrar Ticket (Mi problema se solucionó)
              </button>
            </div>
          )}

        </motion.div>
      )}

    </div>
  );
};
