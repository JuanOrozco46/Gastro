import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  FileText,
  Tag,
  AlertCircle,
  Search,
  CheckCircle2,
  Clock,
  ShieldCheck,
  X,
  HelpCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { safeFormatDate } from '../../utils/formatters';

interface Props {
  restaurantId: string;
  initialTicketId?: string | null;
}

const TICKET_CATEGORIES: Array<{ label: string; value: TicketCategory; icon: string }> = [
  { label: 'Mi Cuenta / Perfil', value: 'account', icon: '🏪' },
  { label: 'Pagos y Facturación', value: 'payment', icon: '💳' },
  { label: 'Problema con un Pedido', value: 'order', icon: '📦' },
  { label: 'Pedido Demorado', value: 'delayed_order', icon: '⏱️' },
  { label: 'Repartidor / Domicilio', value: 'delivery', icon: '🛵' },
  { label: 'Menú y Productos', value: 'menu', icon: '🍽️' },
  { label: 'Error Técnico', value: 'technical', icon: '⚙️' },
  { label: 'Reporte de Seguridad', value: 'safety', icon: '🛡️' },
  { label: 'Otro Asunto', value: 'other', icon: '💬' }
];

type StatusFilter = 'all' | 'open' | 'waiting' | 'resolved';

const QUICK_SUPPORT_TEMPLATES = [
  'Ya realizamos la verificación en cocina y todo está listo.',
  'Adjunto mayor información sobre el pedido en curso.',
  '¿Cuál es el tiempo estimado para la dispersión de este saldo?',
  'El cliente ya recibió su orden sin inconvenientes, gracias.'
];

export const SupportTab: React.FC<Props> = ({ restaurantId, initialTicketId }) => {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & search
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected ticket / conversation
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(initialTicketId || null);
  const [activeTicket, setActiveTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loadingConv, setLoadingConv] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Modal create ticket
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [category, setCategory] = useState<TicketCategory>('account');
  const [subcategory, setSubcategory] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Mobile navigation
  const [isMobileDetailOpen, setIsMobileDetailOpen] = useState(false);

  const loadTickets = useCallback(() => {
    fetchRestaurantSupportTickets(restaurantId).then(({ data, error }) => {
      if (error) {
        setError(error);
      } else {
        setTickets(data);
        if (data.length > 0 && !selectedTicketId && window.innerWidth >= 900) {
          setSelectedTicketId(data[0].id);
        }
      }
      setLoading(false);
    });
  }, [restaurantId, selectedTicketId]);

  useEffect(() => {
    supabase?.auth.getUser().then(({ data }) => {
      if (data.user) setCurrentUserId(data.user.id);
    });
    loadTickets();
  }, [loadTickets]);

  useEffect(() => {
    if (!selectedTicketId) return;
    let isCurrent = true;
    fetchSupportTicket(selectedTicketId).then(({ ticket, messages, error }) => {
      if (!isCurrent) return;
      if (error) {
        setError(error);
      } else {
        setActiveTicket(ticket);
        setMessages(messages.filter(m => !m.is_internal));
      }
      setLoadingConv(false);
    });
    return () => {
      isCurrent = false;
    };
  }, [selectedTicketId]);

  // Handle external initialTicketId change during render
  const [prevInitialId, setPrevInitialId] = useState(initialTicketId);
  if (initialTicketId && initialTicketId !== prevInitialId) {
    setPrevInitialId(initialTicketId);
    setSelectedTicketId(initialTicketId);
    setIsMobileDetailOpen(true);
  }

  const handleSelectTicket = (ticketId: string) => {
    setLoadingConv(true);
    setSelectedTicketId(ticketId);
    setIsMobileDetailOpen(true);
  };

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
      const updatedTickets = [data, ...tickets];
      setTickets(updatedTickets);
      setSelectedTicketId(data.id);
      setIsMobileDetailOpen(true);
      setShowCreateModal(false);
      setCategory('account');
      setSubcategory('');
      setSubject('');
      setDescription('');
    }
    setIsSubmitting(false);
  };

  const handleSendMessage = async (e?: React.FormEvent, directText?: string) => {
    if (e) e.preventDefault();
    const textToSend = (directText ?? newMessage).trim();
    if (!textToSend || !activeTicket) return;

    setIsSubmitting(true);
    const { data, error } = await createSupportMessage(activeTicket.id, textToSend);
    if (error) {
      setError(error);
    } else if (data) {
      setMessages(prev => [...prev, data]);
      if (!directText) setNewMessage('');

      if (activeTicket.status === 'waiting_for_restaurant') {
        const { success } = await updateSupportTicketStatus(activeTicket.id, 'open');
        if (success) {
          const updated = { ...activeTicket, status: 'open' as const };
          setActiveTicket(updated);
          setTickets(prev => prev.map(t => (t.id === updated.id ? updated : t)));
        }
      }
    }
    setIsSubmitting(false);
  };

  const handleResolveTicket = async () => {
    if (!activeTicket) return;
    setIsSubmitting(true);
    const { success, error } = await updateSupportTicketStatus(activeTicket.id, 'resolved');
    if (success) {
      const updated = { ...activeTicket, status: 'resolved' as const };
      setActiveTicket(updated);
      setTickets(prev => prev.map(t => (t.id === updated.id ? updated : t)));
    } else {
      setError(error || 'No se pudo resolver el ticket.');
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
      case 'closed':
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

  const getCategoryMeta = (cat: TicketCategory) => {
    return TICKET_CATEGORIES.find(c => c.value === cat) || { label: cat, value: cat, icon: '📋' };
  };

  // Filtered tickets
  const filteredTickets = useMemo(() => {
    return tickets.filter(t => {
      if (statusFilter === 'open' && (t.status === 'resolved' || t.status === 'closed')) return false;
      if (statusFilter === 'waiting' && t.status !== 'waiting_for_restaurant' && t.status !== 'in_review') return false;
      if (statusFilter === 'resolved' && t.status !== 'resolved' && t.status !== 'closed') return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchSubj = t.subject.toLowerCase().includes(q);
        const matchDesc = t.description.toLowerCase().includes(q);
        const matchId = t.id.toLowerCase().includes(q);
        return matchSubj || matchDesc || matchId;
      }
      return true;
    });
  }, [tickets, statusFilter, searchQuery]);

  const step1Done = Boolean(category && subject.trim().length >= 4);
  const step2Done = Boolean(description.trim().length >= 10);

  return (
    <div className="rpa-card">
      {/* Editorial Header */}
      <div className="rpa-card-header">
        <div className="rpa-card-header-left">
          <div className="rpa-card-icon">
            <MessageSquare size={22} />
          </div>
          <div>
            <h3 className="rpa-card-title">Mesa de Ayuda y Soporte Operativo</h3>
            <p className="rpa-card-subtitle">
              Canal de alta prioridad con el equipo de soporte de GastroSync. Seguimiento a pedidos, incidentes y pagos.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="pam-btn-primary"
        >
          <Plus size={16} /> Crear Caso de Soporte
        </button>
      </div>

      <div className="rpa-card-body" style={{ padding: '1rem' }}>
        {error && (
          <div className="pam-callout error" style={{ marginBottom: '12px' }}>
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {/* Master-Detail Split View */}
        <div className="gs-support-split">
          {/* LEFT COLUMN: Ticket Index & Filters */}
          <div
            className="gs-support-sidebar"
            style={{
              display: isMobileDetailOpen && window.innerWidth < 900 ? 'none' : 'flex'
            }}
          >
            {/* Search Input */}
            <div className="pam-input-wrap">
              <Search size={15} className="pam-icon" />
              <input
                type="text"
                className="pam-input"
                placeholder="Buscar por asunto o folio..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Filter Pills */}
            <div className="pam-chips" style={{ gap: '6px' }}>
              <button
                type="button"
                className={`pam-chip ${statusFilter === 'all' ? 'active' : ''}`}
                onClick={() => setStatusFilter('all')}
              >
                Todos ({tickets.length})
              </button>
              <button
                type="button"
                className={`pam-chip ${statusFilter === 'open' ? 'active' : ''}`}
                onClick={() => setStatusFilter('open')}
              >
                Abiertos
              </button>
              <button
                type="button"
                className={`pam-chip ${statusFilter === 'waiting' ? 'active' : ''}`}
                onClick={() => setStatusFilter('waiting')}
              >
                Esperando
              </button>
              <button
                type="button"
                className={`pam-chip ${statusFilter === 'resolved' ? 'active' : ''}`}
                onClick={() => setStatusFilter('resolved')}
              >
                Resueltos
              </button>
            </div>

            {/* Ticket List */}
            <div className="gs-support-list">
              {loading ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  <p style={{ margin: 0, fontSize: '0.85rem' }}>Cargando casos...</p>
                </div>
              ) : filteredTickets.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)' }}>
                  <HelpCircle size={32} style={{ opacity: 0.5, marginBottom: '6px' }} />
                  <p style={{ fontWeight: 700, margin: '4px 0', fontSize: '0.9rem', color: 'var(--text-main)' }}>
                    No hay casos de soporte
                  </p>
                  <p style={{ margin: 0, fontSize: '0.78rem' }}>
                    {searchQuery ? 'Ningún caso coincide con tu búsqueda.' : 'Crea un caso para solicitar asistencia.'}
                  </p>
                </div>
              ) : (
                filteredTickets.map(ticket => {
                  const meta = getCategoryMeta(ticket.category);
                  const isSelected = selectedTicketId === ticket.id;

                  return (
                    <button
                      key={ticket.id}
                      type="button"
                      onClick={() => handleSelectTicket(ticket.id)}
                      className={`gs-support-item ${isSelected ? 'active' : ''}`}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                          {meta.icon} {meta.label}
                        </span>
                        <span className={getStatusBadgeClass(ticket.status)} style={{ fontSize: '0.68rem', padding: '2px 7px' }}>
                          {getStatusText(ticket.status)}
                        </span>
                      </div>

                      <strong
                        style={{
                          fontSize: '0.9rem',
                          fontWeight: 800,
                          color: 'var(--text-main)',
                          lineHeight: 1.3,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden'
                        }}
                      >
                        {ticket.priority === 'urgent' && (
                          <AlertTriangle size={13} color="#DC2626" style={{ display: 'inline', marginRight: '4px' }} />
                        )}
                        {ticket.subject}
                      </strong>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        <span>#{ticket.id.slice(0, 8)}</span>
                        <span>{new Date(ticket.created_at).toLocaleDateString('es-CO')}</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: Conversation Thread */}
          <div
            className="gs-support-main"
            style={{
              display: !isMobileDetailOpen && window.innerWidth < 900 ? 'none' : 'flex'
            }}
          >
            {activeTicket ? (
              <>
                {/* Thread Header */}
                <div className="gs-support-main-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    {/* Mobile Back Button */}
                    <button
                      type="button"
                      className="pam-btn-ghost"
                      style={{ padding: '6px 8px' }}
                      onClick={() => setIsMobileDetailOpen(false)}
                      aria-label="Volver a lista"
                    >
                      <ArrowLeft size={16} />
                    </button>

                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          {getCategoryMeta(activeTicket.category).icon} Caso #{activeTicket.id.slice(0, 8)}
                        </span>
                        <span className={getStatusBadgeClass(activeTicket.status)}>
                          {getStatusText(activeTicket.status)}
                        </span>
                      </div>
                      <h4
                        style={{
                          margin: '2px 0 0',
                          fontSize: '1rem',
                          fontWeight: 800,
                          color: 'var(--text-main)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}
                      >
                        {activeTicket.subject}
                      </h4>
                    </div>
                  </div>

                  {activeTicket.status !== 'resolved' && activeTicket.status !== 'closed' && (
                    <button
                      type="button"
                      className="pam-btn-ghost"
                      style={{ fontSize: '0.78rem', padding: '6px 12px', color: '#059669' }}
                      onClick={handleResolveTicket}
                      disabled={isSubmitting}
                      title="Marcar este caso como solucionado"
                    >
                      <CheckCircle2 size={14} />
                      <span>Dar por resuelto</span>
                    </button>
                  )}
                </div>

                {/* Messages & Context Area */}
                <div className="gs-support-messages">
                  {/* Initial Case Description Box */}
                  <div
                    style={{
                      background: 'var(--neutral-surface)',
                      border: '1px solid var(--neutral-border)',
                      borderRadius: '12px',
                      padding: '12px 14px',
                      marginBottom: '8px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Descripción inicial del restaurante
                      </span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        {safeFormatDate(activeTicket.created_at)}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-main)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                      {activeTicket.description}
                    </p>
                  </div>

                  {loadingConv ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                      <Clock size={20} className="spin" style={{ marginBottom: '6px' }} />
                      <p style={{ margin: 0, fontSize: '0.85rem' }}>Cargando conversación...</p>
                    </div>
                  ) : messages.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>
                      <ShieldCheck size={28} style={{ opacity: 0.6, marginBottom: '6px' }} />
                      <p style={{ margin: 0, fontSize: '0.84rem' }}>
                        Un agente de soporte de GastroSync revisará tu caso y te responderá en este hilo.
                      </p>
                    </div>
                  ) : (
                    messages.map(msg => {
                      const isMine = msg.author_user_id === currentUserId;
                      return (
                        <div
                          key={msg.id}
                          style={{
                            display: 'flex',
                            justifyContent: isMine ? 'flex-end' : 'flex-start'
                          }}
                        >
                          <div
                            style={{
                              background: isMine ? 'var(--primary)' : 'var(--neutral-surface)',
                              color: isMine ? '#FFFFFF' : 'var(--text-main)',
                              border: isMine ? 'none' : '1px solid var(--neutral-border)',
                              padding: '10px 14px',
                              borderRadius: '14px',
                              borderBottomRightRadius: isMine ? '3px' : '14px',
                              borderBottomLeftRadius: !isMine ? '3px' : '14px',
                              maxWidth: '82%',
                              boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
                            }}
                          >
                            <div style={{ fontSize: '0.7rem', opacity: 0.85, marginBottom: '3px', fontWeight: 800 }}>
                              {isMine ? 'Tú (Restaurante)' : 'Equipo GastroSync'}
                            </div>
                            <p style={{ whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.45, fontSize: '0.88rem' }}>
                              {msg.body}
                            </p>
                            <div style={{ fontSize: '0.66rem', opacity: 0.75, marginTop: '5px', textAlign: 'right' }}>
                              {new Date(msg.created_at).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Composer */}
                {activeTicket.status !== 'closed' && activeTicket.status !== 'resolved' ? (
                  <div className="gs-support-composer">
                    {/* Quick Suggestions Chips */}
                    <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
                      {QUICK_SUPPORT_TEMPLATES.map((tmpl, idx) => (
                        <button
                          key={idx}
                          type="button"
                          className="pam-chip"
                          style={{ fontSize: '0.72rem', whiteSpace: 'nowrap', padding: '4px 8px' }}
                          onClick={() => setNewMessage(tmpl)}
                        >
                          {tmpl}
                        </button>
                      ))}
                    </div>

                    <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <div className="pam-input-wrap" style={{ flex: 1 }}>
                        <MessageSquare size={16} className="pam-icon" />
                        <input
                          type="text"
                          className="pam-input"
                          value={newMessage}
                          onChange={e => setNewMessage(e.target.value)}
                          placeholder="Escribe tu mensaje a soporte..."
                          required
                          maxLength={3000}
                        />
                      </div>
                      <button
                        type="submit"
                        className="pam-btn-primary"
                        disabled={isSubmitting || !newMessage.trim()}
                        style={{ minWidth: 'auto', padding: '10px 16px' }}
                      >
                        <Send size={15} />
                        <span>Enviar</span>
                      </button>
                    </form>
                  </div>
                ) : (
                  <div style={{ padding: '12px 18px', textAlign: 'center', background: 'var(--neutral-surface-alt)', borderTop: '1px solid var(--neutral-border)' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Este caso ha sido marcado como <strong>{getStatusText(activeTicket.status)}</strong>. Si necesitas asistencia adicional, abre un nuevo caso.
                    </span>
                  </div>
                )}
              </>
            ) : (
              <div className="gs-support-empty-state">
                <MessageSquare size={48} style={{ opacity: 0.35, marginBottom: '12px' }} />
                <h4 style={{ fontWeight: 800, margin: '4px 0', color: 'var(--text-main)', fontSize: '1.05rem' }}>
                  Selecciona un caso para ver la conversación
                </h4>
                <p style={{ margin: '0 0 16px', fontSize: '0.84rem', maxWidth: '340px' }}>
                  Consulta las respuestas del equipo de operaciones de GastroSync o crea una nueva consulta.
                </p>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(true)}
                  className="pam-btn-primary"
                >
                  <Plus size={15} /> Abrir Nuevo Caso
                </button>
              </div>
            )}
          </div>
        </div>

        {/* CREATE TICKET MODAL */}
        <AnimatePresence>
          {showCreateModal && (
            <div className="gs-modal-backdrop" onClick={() => setShowCreateModal(false)}>
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="gs-modal-card"
                onClick={e => e.stopPropagation()}
              >
                <div className="gs-modal-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div className="rpa-card-icon" style={{ width: '32px', height: '32px' }}>
                      <Sparkles size={16} />
                    </div>
                    <strong style={{ fontSize: '1rem', color: 'var(--text-main)' }}>
                      Nuevo Caso de Soporte
                    </strong>
                  </div>
                  <button
                    type="button"
                    className="rpa-icon-btn"
                    onClick={() => setShowCreateModal(false)}
                    aria-label="Cerrar modal"
                  >
                    <X size={16} />
                  </button>
                </div>

                <form onSubmit={handleCreateTicket} noValidate>
                  <div className="gs-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {/* Step 1: Category */}
                    <div className="pam-field">
                      <label>
                        Área de la Solicitud <em>*</em>
                      </label>
                      <div className="pam-chips" style={{ maxHeight: '110px', overflowY: 'auto' }}>
                        {TICKET_CATEGORIES.map(cat => (
                          <button
                            key={cat.value}
                            type="button"
                            className={`pam-chip ${category === cat.value ? 'active' : ''}`}
                            onClick={() => setCategory(cat.value)}
                          >
                            <span>{cat.icon}</span>
                            <span>{cat.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Subject */}
                    <div className="pam-field">
                      <label>
                        Asunto / Resumen Breve <em>*</em>
                      </label>
                      <div className="pam-input-wrap">
                        <Tag size={16} className="pam-icon" />
                        <input
                          type="text"
                          className="pam-input"
                          value={subject}
                          onChange={e => setSubject(e.target.value)}
                          required
                          placeholder="Ej. Liquidación de saldo semanal o ajuste de horario"
                          maxLength={250}
                        />
                      </div>
                    </div>

                    {/* Description */}
                    <div className="pam-field">
                      <label>
                        Detalle de la Solicitud <em>*</em>
                      </label>
                      <div className="pam-input-wrap">
                        <FileText size={16} className="pam-icon top" />
                        <textarea
                          className="pam-input"
                          value={description}
                          onChange={e => setDescription(e.target.value)}
                          required
                          placeholder="Por favor incluye números de orden, capturas o fechas específicas..."
                          rows={4}
                          maxLength={4000}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="gs-modal-footer">
                    <button
                      type="button"
                      className="pam-btn-ghost"
                      onClick={() => setShowCreateModal(false)}
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="pam-btn-primary"
                      disabled={isSubmitting || !step1Done || !step2Done}
                    >
                      <Send size={15} />
                      <span>{isSubmitting ? 'Registrando...' : 'Enviar a Soporte'}</span>
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
