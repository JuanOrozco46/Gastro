import React, { useState, useEffect } from 'react';
import { 
  fetchAllSupportTickets, 
  fetchSupportTicket, 
  createSupportMessage,
  createInternalSupportNote,
  updateSupportTicketStatus,
  assignSupportTicket,
  updateSupportPriority
} from '../services/supportService';
import type { SupportTicket, SupportMessage, TicketStatus, TicketPriority } from '../services/supportService';
import type { Order } from '../types';
import { MessageSquare, Send, Search, User, AlertTriangle, Lock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatCop, safeFormatDate } from '../utils/formatters';
import { ErrorBoundary } from './ErrorBoundary';
import { useCallback } from 'react';

const AdminSupportTicketsContent: React.FC = () => {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTicket, setActiveTicket] = useState<SupportTicket | null>(null);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [loadingConv, setLoadingConv] = useState(false);
  
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterAssignee, setFilterAssignee] = useState<string>('all'); // 'all', 'me', 'unassigned'
  const [searchQuery, setSearchQuery] = useState('');

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const loadTickets = useCallback(() => {
    fetchAllSupportTickets().then(({ data, error }) => {
      if (error) setError(error);
      else setTickets(data);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    supabase?.auth.getUser().then(({ data }) => {
      if (data.user) setCurrentUserId(data.user.id);
    });
    loadTickets();
  }, [loadTickets]);

  const loadConversation = async (ticket: SupportTicket) => {
    setLoadingConv(true);
    setError(null);
    setActiveTicket(ticket);
    const { messages, order, error } = await fetchSupportTicket(ticket.id);
    if (error) {
      setError(error);
    } else {
      setMessages(messages);
      setActiveOrder(order || null);
    }
    setLoadingConv(false);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeTicket) return;
    
    setLoadingConv(true);
    setError(null);
    let result;
    if (isInternal) {
      result = await createInternalSupportNote(activeTicket.id, newMessage);
    } else {
      result = await createSupportMessage(activeTicket.id, newMessage);
    }

    if (result.error) {
      setError(result.error);
    } else if (result.data) {
      setMessages([...messages, result.data]);
      setNewMessage('');
      
      // Auto assign if not assigned and replying
      if (!activeTicket.assigned_to && currentUserId) {
        await handleAssign(currentUserId);
      }
    }
    setLoadingConv(false);
  };

  const handleChangeStatus = async (newStatus: TicketStatus) => {
    if (!activeTicket) return;
    setError(null);
    const { success, error } = await updateSupportTicketStatus(activeTicket.id, newStatus);
    if (success) {
      setActiveTicket({ ...activeTicket, status: newStatus });
      setTickets(tickets.map(t => t.id === activeTicket.id ? { ...t, status: newStatus } : t));
    } else {
      setError(error || 'Error al actualizar');
    }
  };

  const handleChangePriority = async (newPriority: TicketPriority) => {
    if (!activeTicket) return;
    setError(null);
    const { success, error } = await updateSupportPriority(activeTicket.id, newPriority);
    if (success) {
      setActiveTicket({ ...activeTicket, priority: newPriority });
      setTickets(tickets.map(t => t.id === activeTicket.id ? { ...t, priority: newPriority } : t));
    } else {
      setError(error || 'Error al actualizar');
    }
  };

  const handleAssign = async (agentId: string | null) => {
    if (!activeTicket) return;
    setError(null);
    const { success, error } = await assignSupportTicket(activeTicket.id, agentId);
    if (success) {
      setActiveTicket({ ...activeTicket, assigned_to: agentId });
      setTickets(tickets.map(t => t.id === activeTicket.id ? { ...t, assigned_to: agentId } : t));
    } else {
      setError(error || 'Error al asignar');
    }
  };

  const getStatusText = (status: string) => {
    switch(status) {
      case 'open': return 'Abierto';
      case 'in_review': return 'En Revisión';
      case 'waiting_for_customer': return 'Espera Cliente';
      case 'waiting_for_restaurant': return 'Espera Rest.';
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

  const filteredTickets = tickets.filter(t => {
    if (filterStatus !== 'all') {
      if (filterStatus === 'active' && (t.status === 'resolved' || t.status === 'closed')) return false;
      if (filterStatus !== 'active' && t.status !== filterStatus) return false;
    }
    if (filterAssignee !== 'all') {
      if (filterAssignee === 'me' && t.assigned_to !== currentUserId) return false;
      if (filterAssignee === 'unassigned' && t.assigned_to !== null) return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!t.subject.toLowerCase().includes(q) && !t.id.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', minHeight: 'calc(100vh - 150px)', background: 'var(--neutral-surface)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', border: '1px solid var(--neutral-border)', boxShadow: 'var(--shadow-card)' }}>
      
      {/* LEFT PANEL: Ticket List */}
      <div style={{ flex: '1 1 320px', maxWidth: '100%', borderRight: '1px solid var(--neutral-border)', display: 'flex', flexDirection: 'column', background: 'var(--neutral-surface)' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid var(--neutral-border)' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <MessageSquare size={20} color="var(--primary)" /> Tickets
          </h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Buscar ticket o ID..."
                className="form-input"
                style={{ paddingLeft: '36px', height: '40px' }}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <select className="form-input" value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ flex: 1, height: '36px', fontSize: '0.85rem' }}>
                <option value="all">Todos los estados</option>
                <option value="active">Solo Activos</option>
                <option value="open">Nuevos (Abiertos)</option>
                <option value="in_review">En Revisión</option>
                <option value="resolved">Resueltos</option>
              </select>
              <select className="form-input" value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)} style={{ flex: 1, height: '36px', fontSize: '0.85rem' }}>
                <option value="all">Cualquier agente</option>
                <option value="me">Asignados a mí</option>
                <option value="unassigned">Sin asignar</option>
              </select>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '10px', maxHeight: '70vh' }}>
          {loading ? (
            <p style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>Cargando...</p>
          ) : filteredTickets.length === 0 ? (
            <p style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>No se encontraron tickets.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filteredTickets.map(t => (
                <div 
                  key={t.id}
                  onClick={() => loadConversation(t)}
                  style={{
                    padding: '12px',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    background: activeTicket?.id === t.id ? 'var(--primary-light)' : 'var(--neutral-surface-alt)',
                    border: activeTicket?.id === t.id ? '1px solid var(--primary)' : '1px solid var(--neutral-border)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>#{t.id.slice(0,6)}</span>
                    <span style={{ fontSize: '0.75rem', color: getStatusColor(t.status), fontWeight: 800 }}>{getStatusText(t.status)}</span>
                  </div>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {t.subject}
                  </h4>
                  <div style={{ display: 'flex', gap: '8px', fontSize: '0.75rem' }}>
                    {t.priority === 'urgent' && <span style={{ color: 'var(--danger)', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '3px' }}><AlertTriangle size={10} /> Urgente</span>}
                    {t.priority === 'high' && <span style={{ color: 'var(--warning)', fontWeight: 800 }}>Alta</span>}
                    {t.assigned_to === currentUserId && <span style={{ color: 'var(--primary)', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '3px' }}><User size={10} /> Mío</span>}
                    {!t.assigned_to && <span style={{ color: 'var(--text-muted)' }}>Sin Asignar</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT PANEL: Ticket Details & Conversation */}
      <div style={{ flex: '2 1 440px', display: 'flex', flexDirection: 'column', background: 'var(--neutral-bg)' }}>
        {!activeTicket ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', flexDirection: 'column', gap: '16px', padding: '40px' }}>
            <MessageSquare size={48} style={{ color: 'var(--text-light)' }} />
            <p style={{ margin: 0, fontWeight: 600 }}>Selecciona un ticket para ver los detalles</p>
          </div>
        ) : (
          <>
            <div style={{ padding: '20px', borderBottom: '1px solid var(--neutral-border)', background: 'var(--neutral-surface)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap' }}>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>{activeTicket.subject}</h3>
                  <div style={{ background: getStatusColor(activeTicket.status) + '18', color: getStatusColor(activeTicket.status), padding: '4px 10px', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 800 }}>
                    {getStatusText(activeTicket.status)}
                  </div>
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  <span>ID: {activeTicket.id}</span>
                  <span>Cat: {activeTicket.category}</span>
                  <span>Creado: {safeFormatDate(activeTicket.created_at)}</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <select 
                  className="form-input" 
                  style={{ width: 'auto', height: '36px', fontSize: '0.85rem', padding: '0 30px 0 10px' }}
                  value={activeTicket.status}
                  onChange={e => handleChangeStatus(e.target.value as TicketStatus)}
                >
                  <option value="open">Abierto</option>
                  <option value="in_review">En Revisión</option>
                  <option value="waiting_for_customer">Espera Cliente</option>
                  <option value="waiting_for_restaurant">Espera Rest.</option>
                  <option value="waiting_for_payment_provider">Espera Pago</option>
                  <option value="escalated">Escalado</option>
                  <option value="resolved">Resuelto</option>
                  <option value="closed">Cerrado</option>
                </select>

                <select 
                  className="form-input" 
                  style={{ width: 'auto', height: '36px', fontSize: '0.85rem', padding: '0 30px 0 10px' }}
                  value={activeTicket.priority}
                  onChange={e => handleChangePriority(e.target.value as TicketPriority)}
                >
                  <option value="low">Prioridad: Baja</option>
                  <option value="normal">Prioridad: Normal</option>
                  <option value="high">Prioridad: Alta</option>
                  <option value="urgent">Prioridad: Urgente</option>
                  <option value="critical">Prioridad: Crítica</option>
                </select>

                {activeTicket.assigned_to === currentUserId ? (
                  <button onClick={() => handleAssign(null)} className="btn btn-outline" style={{ height: '36px', fontSize: '0.85rem', padding: '0 12px' }}>
                    Desasignarme
                  </button>
                ) : (
                  <button onClick={() => handleAssign(currentUserId)} className="btn btn-primary" style={{ height: '36px', fontSize: '0.85rem', padding: '0 12px' }}>
                    Asignarme
                  </button>
                )}
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '20px', maxHeight: '60vh' }}>
              {error && (
                <div style={{ background: 'var(--danger-light)', border: '1px solid rgba(185, 28, 28, 0.25)', color: 'var(--danger)', padding: '12px', borderRadius: 'var(--radius-md)', marginBottom: '16px', fontSize: '0.85rem', fontWeight: 600 }}>
                  {error}
                </div>
              )}

              {/* Contexto del Pedido si existe */}
              {activeOrder && (
                <div style={{ background: 'var(--neutral-surface)', border: '1px solid var(--neutral-border)', padding: '16px', borderRadius: 'var(--radius-md)', marginBottom: '16px' }}>
                  <h4 style={{ fontSize: '0.9rem', color: 'var(--primary)', fontWeight: 800, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Search size={14} /> Contexto del Pedido Asociado
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', fontSize: '0.85rem' }}>
                    <div>
                      <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Cliente</span>
                      <strong style={{ color: 'var(--text-main)' }}>{activeOrder.customerName}</strong> <span style={{ color: 'var(--text-muted)' }}>({activeOrder.customerPhone})</span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Total y Pago</span>
                      <strong style={{ color: 'var(--text-main)' }}>{formatCop(activeOrder.total)}</strong> · <span style={{ color: 'var(--text-muted)' }}>{activeOrder.paymentMethod || 'N/A'}</span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Estado</span>
                      <span className="badge badge-secondary" style={{ display: 'inline-block', fontSize: '0.75rem' }}>{activeOrder.status}</span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Tipo</span>
                      <strong style={{ color: 'var(--text-main)' }}>{activeOrder.type}</strong>
                    </div>
                  </div>
                  {activeOrder.items && activeOrder.items.length > 0 && (
                    <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--neutral-border)', fontSize: '0.8rem', color: 'var(--text-main)' }}>
                      <strong style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Ítems del pedido:</strong>
                      {activeOrder.items.map((it, idx) => (
                        <div key={`${it.id}_${idx}`}>
                          {it.qty}x {it.name} ({formatCop(it.price * it.qty)})
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div style={{ background: 'var(--neutral-surface)', padding: '16px', borderRadius: 'var(--radius-md)', marginBottom: '24px', border: '1px solid var(--neutral-border)' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 700 }}>Descripción original:</div>
                <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5, fontSize: '0.95rem', color: 'var(--text-main)', margin: 0 }}>{activeTicket.description}</p>
                {activeTicket.related_order_id && (
                  <div style={{ marginTop: '12px', padding: '8px 10px', background: 'var(--neutral-surface-alt)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', color: 'var(--text-main)' }}>
                    <span style={{ fontWeight: 700 }}>Pedido relacionado:</span> {activeTicket.related_order_id}
                  </div>
                )}
              </div>

              {loadingConv ? (
                <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Cargando mensajes...</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {messages.map(msg => {
                    const isInternal = msg.is_internal;
                    const isSystemOrMe = isInternal || msg.author_user_id === currentUserId;
                    
                    return (
                      <div key={msg.id} style={{ display: 'flex', justifyContent: isSystemOrMe ? 'flex-end' : 'flex-start' }}>
                        <div style={{
                          background: isInternal ? 'var(--warning-light)' : (isSystemOrMe ? 'var(--primary)' : 'var(--neutral-surface)'),
                          border: isInternal ? '1px solid rgba(180, 83, 9, 0.3)' : (isSystemOrMe ? 'none' : '1px solid var(--neutral-border)'),
                          color: isInternal ? 'var(--warning)' : (isSystemOrMe ? '#FFFFFF' : 'var(--text-main)'),
                          padding: '12px 16px',
                          borderRadius: 'var(--radius-lg)',
                          borderBottomRightRadius: isSystemOrMe ? '4px' : 'var(--radius-lg)',
                          borderBottomLeftRadius: !isSystemOrMe ? '4px' : 'var(--radius-lg)',
                          maxWidth: '85%',
                          boxShadow: 'var(--shadow-card)'
                        }}>
                          <div style={{ fontSize: '0.75rem', opacity: 0.85, marginBottom: '4px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {isInternal && <Lock size={10} />}
                            {isInternal ? 'Nota Interna (Oculta)' : (isSystemOrMe ? 'Nosotros (Soporte)' : 'Usuario / Restaurante')}
                          </div>
                          <p style={{ whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.45, fontSize: '0.95rem' }}>{msg.body}</p>
                          <div style={{ fontSize: '0.68rem', opacity: 0.7, marginTop: '8px', textAlign: 'right' }}>
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ padding: '20px', borderTop: '1px solid var(--neutral-border)', background: 'var(--neutral-surface)' }}>
              <form onSubmit={handleSendMessage}>
                <div style={{ display: 'flex', gap: '16px', marginBottom: '12px', flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer', color: 'var(--text-main)', fontWeight: 600 }}>
                    <input type="radio" checked={!isInternal} onChange={() => setIsInternal(false)} />
                    Respuesta al usuario (Pública)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer', color: 'var(--warning)', fontWeight: 700 }}>
                    <input type="radio" checked={isInternal} onChange={() => setIsInternal(true)} />
                    <Lock size={12} /> Nota Interna (Solo Admins)
                  </label>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <textarea
                    className="form-input"
                    value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                    placeholder={isInternal ? "Escribe una nota interna para el equipo..." : "Escribe una respuesta para el usuario..."}
                    required
                    style={{ flex: 1, minHeight: '60px', resize: 'none' }}
                  />
                  <button type="submit" className="btn btn-primary" disabled={loadingConv || !newMessage.trim()} style={{ padding: '0 24px' }}>
                    <Send size={20} />
                  </button>
                </div>
              </form>
            </div>
          </>
        )}
      </div>

    </div>
  );
};

export const AdminSupportTickets: React.FC = () => (
  <ErrorBoundary fallbackMessage="Error al cargar la interfaz de soporte de administrador.">
    <AdminSupportTicketsContent />
  </ErrorBoundary>
);
