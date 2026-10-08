import React, { useState, useEffect, useCallback } from 'react';
import {
  createSupportTicket,
  fetchRestaurantSupportTickets,
  fetchSupportTicket,
  createSupportMessage,
  updateSupportTicketStatus
} from '../../services/supportService';
import type { SupportTicket, SupportMessage, TicketCategory } from '../../services/supportService';
import {
  MessageSquare,
  Plus,
  ArrowLeft,
  Send,
  AlertTriangle,
  Sparkles,
  Check,
  FileText,
  Tag,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { safeFormatDate } from '../../utils/formatters';

interface Props {
  restaurantId: string;
  initialTicketId?: string | null;
}

const TICKET_CATEGORIES: Array<{ label: string; value: TicketCategory }> = [
  { label: '🏪 Mi Cuenta / Perfil', value: 'account' },
  { label: '💳 Pagos y Facturación', value: 'payment' },
  { label: '📦 Problema con un Pedido', value: 'order' },
  { label: '⏱️ Pedido Demorado', value: 'delayed_order' },
  { label: '🛵 Repartidor / Domicilio', value: 'delivery' },
  { label: '🍽️ Menú y Productos', value: 'menu' },
  { label: '⚙️ Error Técnico', value: 'technical' },
  { label: '🛡️ Reporte de Seguridad', value: 'safety' },
  { label: '💬 Otro Asunto', value: 'other' }
];

export const SupportTab: React.FC<Props> = ({ restaurantId, initialTicketId }) => {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeView, setActiveView] = useState<'list' | 'create' | 'conversation'>('list');

  const [category, setCategory] = useState<TicketCategory>('account');
  const [subcategory, setSubcategory] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [activeTicket, setActiveTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loadingConv, setLoadingConv] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const loadTickets = useCallback(() => {
    fetchRestaurantSupportTickets(restaurantId).then(({ data, error }) => {
      if (error) setError(error);
      else setTickets(data);
      setLoading(false);
    });
  }, [restaurantId]);

  useEffect(() => {
    supabase?.auth.getUser().then(({ data }) => {
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
    if (!subject.trim() || !description.trim()) {
      setError('El asunto y la descripción detallada son obligatorios.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const { data, error } = await createSupportTicket({
      category,
      subcategory: subcategory || undefined,
      subject: subject.trim(),
      description: description.trim(),
      restaurant_id: restaurantId,
      requester_type: 'restaurant_owner'
    });

    if (error || !data) {
      setError(error || 'Error al crear ticket');
    } else {
      setTickets([data, ...tickets]);
      setCategory('account');
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
      setError(error);
    } else if (data) {
      setMessages([...messages, data]);
      setNewMessage('');

      if (activeTicket.status === 'waiting_for_restaurant') {
        const { success } = await updateSupportTicketStatus(activeTicket.id, 'open');
        if (success) setActiveTicket({ ...activeTicket, status: 'open' });
      }
    }
    setIsSubmitting(false);
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'open':
        return 'Abierto';
      case 'in_review':
        return 'En Revisión';
      case 'waiting_for_customer':
        return 'Esperando al cliente';
      case 'waiting_for_restaurant':
        return 'Esperando tu respuesta';
      case 'waiting_for_payment_provider':
        return 'Espera Pago';
      case 'escalated':
        return 'Escalado';
      case 'resolved':
        return 'Resuelto';
      case 'closed':
        return 'Cerrado';
      default:
        return status;
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'resolved':
        return 'rpa-badge success';
      case 'in_review':
      case 'waiting_for_restaurant':
      case 'waiting_for_payment_provider':
        return 'rpa-badge warning';
      case 'escalated':
        return 'rpa-badge danger';
      case 'open':
        return 'rpa-badge primary';
      default:
        return 'rpa-badge neutral';
    }
  };

  const step1Done = Boolean(category && subject.trim().length >= 4);
  const step2Done = Boolean(description.trim().length >= 10);

  return (
    <div className="rpa-card">
      <div className="rpa-card-header">
        <div className="rpa-card-header-left">
          <div className="rpa-card-icon">
            <MessageSquare size={22} />
          </div>
          <div>
            <span className="pam-eyebrow" style={{ color: 'var(--primary)', marginBottom: '2px' }}>
              <Sparkles size={11} style={{ display: 'inline', verticalAlign: 'middle' }} /> Atención Prioritaria a Comercios
            </span>
            <h3 className="rpa-card-title">Centro de Soporte para Restaurantes</h3>
            <p className="rpa-card-subtitle">
              Comunicación directa con el equipo de operaciones de GastroSync.
            </p>
          </div>
        </div>

        {activeView === 'list' ? (
          <button
            type="button"
            onClick={() => setActiveView('create')}
            className="pam-btn-primary"
          >
            <Plus size={16} /> Crear Caso de Soporte
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setActiveView('list');
              setActiveTicket(null);
              setMessages([]);
            }}
            className="pam-btn-ghost"
          >
            <ArrowLeft size={16} /> Volver a mis casos
          </button>
        )}
      </div>

      <div className="rpa-card-body">
        {error && (
          <div className="pam-callout error">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {/* LIST VIEW */}
        {activeView === 'list' && (
          <AnimatePresence>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {loading ? (
                <div className="pam-section" style={{ alignItems: 'center', textAlign: 'center', padding: '2rem' }}>
                  <p style={{ color: 'var(--text-muted)', margin: 0 }}>Cargando tus casos de soporte...</p>
                </div>
              ) : tickets.length === 0 ? (
                <div className="pam-section" style={{ alignItems: 'center', textAlign: 'center', padding: '2.5rem 1.5rem' }}>
                  <MessageSquare size={40} style={{ color: 'var(--primary)', opacity: 0.6 }} />
                  <h4 style={{ margin: '6px 0 2px', color: 'var(--text-main)', fontWeight: 800 }}>
                    No tienes casos de soporte abiertos
                  </h4>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
                    Si necesitas ayuda con un pedido, liquidación o configuración, abre un caso arriba a la derecha.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {tickets.map(ticket => (
                    <div
                      key={ticket.id}
                      onClick={() => loadConversation(ticket.id)}
                      className="rpa-item-card"
                      style={{ cursor: 'pointer' }}
                    >
                      <div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
                          {ticket.priority === 'urgent' && <AlertTriangle size={15} color="#DC2626" />}
                          <strong style={{ fontWeight: 800, fontSize: '0.96rem', color: 'var(--text-main)' }}>
                            {ticket.subject}
                          </strong>
                        </div>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', margin: 0 }}>
                          Abierto el {new Date(ticket.created_at).toLocaleDateString('es-CO')}
                        </p>
                      </div>
                      <span className={getStatusBadgeClass(ticket.status)}>
                        {getStatusText(ticket.status)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        )}

        {/* CREATE TICKET VIEW */}
        {activeView === 'create' && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <form onSubmit={handleCreateTicket} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <section className="pam-section">
                <div className="pam-section-head">
                  <div className={`pam-step ${step1Done ? 'done' : ''}`}>
                    {step1Done ? <Check size={15} strokeWidth={3} /> : 1}
                  </div>
                  <div>
                    <h4>1. Categoría y Asunto del Caso</h4>
                    <p>Selecciona el área correspondiente para dirigir tu solicitud al especialista indicado.</p>
                  </div>
                </div>

                <div className="pam-field">
                  <label>
                    Categoría del Caso <em>*</em>
                  </label>
                  <div className="pam-chips">
                    {TICKET_CATEGORIES.map(cat => (
                      <button
                        key={cat.value}
                        type="button"
                        className={`pam-chip ${category === cat.value ? 'active' : ''}`}
                        onClick={() => setCategory(cat.value)}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pam-field">
                  <label>
                    Asunto / Resumen <em>*</em>
                  </label>
                  <div className="pam-input-wrap">
                    <Tag size={16} className="pam-icon" />
                    <input
                      type="text"
                      className="pam-input"
                      value={subject}
                      onChange={e => setSubject(e.target.value)}
                      required
                      placeholder="Ej. Ajuste en horario especial o consulta de pedido #104"
                      maxLength={250}
                    />
                  </div>
                </div>
              </section>

              <section className="pam-section">
                <div className="pam-section-head">
                  <div className={`pam-step ${step2Done ? 'done' : ''}`}>
                    {step2Done ? <Check size={15} strokeWidth={3} /> : 2}
                  </div>
                  <div>
                    <h4>2. Descripción Detallada</h4>
                    <p>Incluye número de pedido o detalles relevantes para darte solución inmediata.</p>
                  </div>
                </div>

                <div className="pam-field">
                  <label>
                    Mensaje para Soporte <em>*</em>
                  </label>
                  <div className="pam-input-wrap">
                    <FileText size={16} className="pam-icon top" />
                    <textarea
                      className="pam-input"
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      required
                      placeholder="Describe detalladamente en qué podemos ayudarte..."
                      rows={4}
                      maxLength={4000}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button
                    type="button"
                    className="pam-btn-ghost"
                    onClick={() => setActiveView('list')}
                  >
                    Cancelar
                  </button>
                  <button type="submit" className="pam-btn-primary" disabled={isSubmitting}>
                    <Send size={16} />
                    <span>{isSubmitting ? 'Enviando caso...' : 'Enviar Caso a Soporte'}</span>
                  </button>
                </div>
              </section>
            </form>
          </motion.div>
        )}

        {/* CONVERSATION VIEW */}
        {activeView === 'conversation' && activeTicket && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
          >
            <section className="pam-section">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                <div>
                  <h4 style={{ fontSize: '1.08rem', fontWeight: 800, color: 'var(--text-main)', margin: '0 0 4px' }}>
                    {activeTicket.subject}
                  </h4>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', margin: 0 }}>
                    Caso creado el {safeFormatDate(activeTicket.created_at)}
                  </p>
                </div>
                <span className={getStatusBadgeClass(activeTicket.status)}>
                  {getStatusText(activeTicket.status)}
                </span>
              </div>
              <p
                style={{
                  color: 'var(--text-main)',
                  background: 'var(--neutral-surface-alt)',
                  padding: '12px 14px',
                  borderRadius: '12px',
                  border: '1px solid var(--neutral-border)',
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.5,
                  fontSize: '0.88rem',
                  margin: 0
                }}
              >
                {activeTicket.description}
              </p>
            </section>

            <section className="pam-section">
              <div className="pam-section-head">
                <div>
                  <h4>Historial de Mensajes</h4>
                  <p>Respuestas en tiempo real con el equipo de soporte</p>
                </div>
              </div>

              {loadingConv ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Cargando mensajes...</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {messages.length === 0 && (
                    <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1rem', margin: 0, fontSize: '0.85rem' }}>
                      Un agente de soporte revisará tu caso muy pronto.
                    </p>
                  )}
                  {messages.map(msg => {
                    const isMine = msg.author_user_id === currentUserId;
                    return (
                      <div
                        key={msg.id}
                        style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start' }}
                      >
                        <div
                          style={{
                            background: isMine ? 'var(--primary)' : 'var(--neutral-surface-alt)',
                            color: isMine ? '#FFFFFF' : 'var(--text-main)',
                            border: isMine ? 'none' : '1px solid var(--neutral-border)',
                            padding: '10px 14px',
                            borderRadius: '14px',
                            borderBottomRightRadius: isMine ? '4px' : '14px',
                            borderBottomLeftRadius: !isMine ? '4px' : '14px',
                            maxWidth: '82%'
                          }}
                        >
                          <div style={{ fontSize: '0.72rem', opacity: 0.8, marginBottom: '3px', fontWeight: 700 }}>
                            {isMine ? 'Tú (Restaurante)' : 'Soporte GastroSync'}
                          </div>
                          <p style={{ whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.45, fontSize: '0.88rem' }}>
                            {msg.body}
                          </p>
                          <div style={{ fontSize: '0.66rem', opacity: 0.7, marginTop: '6px', textAlign: 'right' }}>
                            {new Date(msg.created_at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {activeTicket.status !== 'closed' && activeTicket.status !== 'resolved' && (
                <form
                  onSubmit={handleSendMessage}
                  style={{ display: 'flex', gap: '10px', marginTop: '8px' }}
                >
                  <div className="pam-input-wrap" style={{ flex: 1 }}>
                    <MessageSquare size={16} className="pam-icon" />
                    <input
                      type="text"
                      className="pam-input"
                      value={newMessage}
                      onChange={e => setNewMessage(e.target.value)}
                      placeholder="Escribe tu respuesta aquí..."
                      required
                      maxLength={3000}
                    />
                  </div>
                  <button
                    type="submit"
                    className="pam-btn-primary"
                    disabled={isSubmitting || !newMessage.trim()}
                    style={{ minWidth: 'auto', padding: '11px 18px' }}
                  >
                    <Send size={16} /> Enviar
                  </button>
                </form>
              )}
            </section>
          </motion.div>
        )}
      </div>
    </div>
  );
};
