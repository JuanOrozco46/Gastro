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

export const AdminSupportTickets: React.FC = () => {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setError] = useState<string | null>(null);

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

  useEffect(() => {
    supabase!.auth.getUser().then(({ data }) => {
      if (data.user) setCurrentUserId(data.user.id);
    });
    loadTickets();
  }, []);

  const loadTickets = async () => {
    setLoading(true);
    const { data, error } = await fetchAllSupportTickets();
    if (error) setError(error);
    else setTickets(data);
    setLoading(false);
  };

  const loadConversation = async (ticket: SupportTicket) => {
    setLoadingConv(true);
    setActiveTicket(ticket);
    const { messages, order, error } = await fetchSupportTicket(ticket.id);
    if (error) {
      alert(error);
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
    let result;
    if (isInternal) {
      result = await createInternalSupportNote(activeTicket.id, newMessage);
    } else {
      result = await createSupportMessage(activeTicket.id, newMessage);
    }

    if (result.error) {
      alert(result.error);
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
    const { success, error } = await updateSupportTicketStatus(activeTicket.id, newStatus);
    if (success) {
      setActiveTicket({ ...activeTicket, status: newStatus });
      setTickets(tickets.map(t => t.id === activeTicket.id ? { ...t, status: newStatus } : t));
    } else {
      alert(error || 'Error al actualizar');
    }
  };

  const handleChangePriority = async (newPriority: TicketPriority) => {
    if (!activeTicket) return;
    const { success, error } = await updateSupportPriority(activeTicket.id, newPriority);
    if (success) {
      setActiveTicket({ ...activeTicket, priority: newPriority });
      setTickets(tickets.map(t => t.id === activeTicket.id ? { ...t, priority: newPriority } : t));
    } else {
      alert(error || 'Error al actualizar');
    }
  };

  const handleAssign = async (agentId: string | null) => {
    if (!activeTicket) return;
    const { success, error } = await assignSupportTicket(activeTicket.id, agentId);
    if (success) {
      setActiveTicket({ ...activeTicket, assigned_to: agentId });
      setTickets(tickets.map(t => t.id === activeTicket.id ? { ...t, assigned_to: agentId } : t));
    } else {
      alert(error || 'Error al asignar');
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
    <div style={{ display: 'flex', height: 'calc(100vh - 150px)', background: 'var(--bg-color)', borderRadius: '16px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)' }}>
      
      {/* LEFT PANEL: Ticket List */}
      <div style={{ width: '400px', borderRight: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <MessageSquare size={20} color="var(--primary)" /> Tickets
          </h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
              <input
                type="text"
                placeholder="Buscar ticket o ID..."
                className="form-input"
                style={{ paddingLeft: '36px', height: '40px' }}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            
            <div style={{ display: 'flex', gap: '8px' }}>
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

        <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
          {loading ? (
            <p style={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>Cargando...</p>
          ) : filteredTickets.length === 0 ? (
            <p style={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>No se encontraron tickets.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filteredTickets.map(t => (
                <div 
                  key={t.id}
                  onClick={() => loadConversation(t)}
                  style={{
                    padding: '12px',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    background: activeTicket?.id === t.id ? 'var(--glass-overlay)' : 'transparent',
                    border: activeTicket?.id === t.id ? '1px solid var(--primary)' : '1px solid transparent'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>#{t.id.slice(0,6)}</span>
                    <span style={{ fontSize: '0.75rem', color: getStatusColor(t.status), fontWeight: 800 }}>{getStatusText(t.status)}</span>
                  </div>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {t.subject}
                  </h4>
                  <div style={{ display: 'flex', gap: '8px', fontSize: '0.75rem' }}>
                    {t.priority === 'urgent' && <span style={{ color: '#EF4444', fontWeight: 800 }}><AlertTriangle size={10} /> Urgente</span>}
                    {t.priority === 'high' && <span style={{ color: '#F59E0B', fontWeight: 800 }}>Alta</span>}
                    {t.assigned_to === currentUserId && <span style={{ color: 'var(--primary)', fontWeight: 800 }}><User size={10} /> Mío</span>}
                    {!t.assigned_to && <span style={{ color: '#64748b' }}>Sin Asignar</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT PANEL: Ticket Details & Conversation */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.2)' }}>
        {!activeTicket ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', flexDirection: 'column', gap: '16px' }}>
            <MessageSquare size={48} />
            <p>Selecciona un ticket para ver los detalles</p>
          </div>
        ) : (
          <>
            <div style={{ padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'var(--glass-medium)', display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '8px' }}>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>{activeTicket.subject}</h3>
                  <div style={{ background: getStatusColor(activeTicket.status) + '20', color: getStatusColor(activeTicket.status), padding: '4px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 800 }}>
                    {getStatusText(activeTicket.status)}
                  </div>
                </div>
                <div style={{ fontSize: '0.85rem', color: '#94a3b8', display: 'flex', gap: '16px' }}>
                  <span>ID: {activeTicket.id}</span>
                  <span>Cat: {activeTicket.category}</span>
                  <span>Creado: {new Date(activeTicket.created_at).toLocaleString()}</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
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

            <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
              
              {/* Contexto del Pedido si existe */}
              {activeOrder && (
                <div style={{ background: 'rgba(56, 189, 248, 0.05)', border: '1px solid rgba(56, 189, 248, 0.2)', padding: '16px', borderRadius: '12px', marginBottom: '16px' }}>
                  <h4 style={{ fontSize: '0.9rem', color: '#38BDF8', fontWeight: 800, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Search size={14} /> Contexto del Pedido Asociado
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '0.85rem' }}>
                    <div>
                      <span style={{ color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Cliente</span>
                      <strong style={{ color: 'white' }}>{activeOrder.customerName}</strong> ({activeOrder.customerPhone})
                    </div>
                    <div>
                      <span style={{ color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Total y Pago</span>
                      <strong style={{ color: 'white' }}>${(activeOrder.total || 0).toLocaleString('es-CO')}</strong> · {activeOrder.paymentMethod || 'N/A'}
                    </div>
                    <div>
                      <span style={{ color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Estado</span>
                      <span className="badge badge-secondary" style={{ display: 'inline-block', fontSize: '0.75rem' }}>{activeOrder.status}</span>
                    </div>
                    <div>
                      <span style={{ color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Tipo</span>
                      <strong style={{ color: 'white' }}>{activeOrder.type}</strong>
                    </div>
                  </div>
                </div>
              )}

              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '12px', marginBottom: '24px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '8px', fontWeight: 600 }}>Descripción original:</div>
                <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5, fontSize: '0.95rem' }}>{activeTicket.description}</p>
                {activeTicket.related_order_id && (
                  <div style={{ marginTop: '12px', padding: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', fontSize: '0.85rem' }}>
                    <span style={{ fontWeight: 600 }}>Pedido relacionado:</span> {activeTicket.related_order_id}
                  </div>
                )}
              </div>

              {loadingConv ? (
                <p style={{ textAlign: 'center', color: '#64748b' }}>Cargando mensajes...</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {messages.map(msg => {
                    const isInternal = msg.is_internal;
                    const isSystemOrMe = isInternal || msg.author_user_id === currentUserId;
                    
                    return (
                      <div key={msg.id} style={{ display: 'flex', justifyContent: isSystemOrMe ? 'flex-end' : 'flex-start' }}>
                        <div style={{
                          background: isInternal ? 'rgba(245, 158, 11, 0.15)' : (isSystemOrMe ? 'var(--primary)' : 'rgba(255,255,255,0.1)'),
                          border: isInternal ? '1px solid rgba(245, 158, 11, 0.3)' : 'none',
                          color: isInternal ? '#FCD34D' : 'white',
                          padding: '12px 16px',
                          borderRadius: '16px',
                          borderBottomRightRadius: isSystemOrMe ? '4px' : '16px',
                          borderBottomLeftRadius: !isSystemOrMe ? '4px' : '16px',
                          maxWidth: '85%'
                        }}>
                          <div style={{ fontSize: '0.75rem', opacity: 0.8, marginBottom: '4px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {isInternal && <Lock size={10} />}
                            {isInternal ? 'Nota Interna (Oculta)' : (isSystemOrMe ? 'Nosotros (Soporte)' : 'Usuario / Restaurante')}
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
            </div>

            <div style={{ padding: '20px', borderTop: '1px solid rgba(255,255,255,0.05)', background: 'var(--glass-medium)' }}>
              <form onSubmit={handleSendMessage}>
                <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
                    <input type="radio" checked={!isInternal} onChange={() => setIsInternal(false)} />
                    Respuesta al usuario (Pública)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer', color: '#FCD34D' }}>
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
