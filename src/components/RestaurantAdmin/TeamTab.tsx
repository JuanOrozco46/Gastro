import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/useApp';
import type { Tenant, RestaurantMember } from '../../types';
import { Users, Mail, RefreshCw, XCircle, PlayCircle, ShieldBan } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const TeamTab: React.FC<{ tenant: Tenant }> = ({ tenant }) => {
  const { 
    currentUser, 
    fetchRestaurantMembers, 
    inviteRestaurantStaff, 
    resendStaffInvitation, 
    suspendRestaurantMember, 
    reactivateRestaurantMember, 
    revokeRestaurantMember,
    showToast 
  } = useApp();

  const [members, setMembers] = useState<RestaurantMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const isOwner = members.find(m => m.userId === currentUser?.id)?.role === 'owner' || currentUser?.role === 'admin';

  const loadMembers = async () => {
    setLoading(true);
    const data = await fetchRestaurantMembers(tenant.id);
    setMembers(data);
    setLoading(false);
  };

  useEffect(() => {
    loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant.id]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;
    
    setInviting(true);
    const res = await inviteRestaurantStaff(tenant.id, inviteEmail);
    if (res.success) {
      showToast('Invitación enviada correctamente.');
      setInviteEmail('');
      setShowInviteForm(false);
      await loadMembers();
    } else {
      showToast(`⚠️ Error al invitar: ${res.error}`);
    }
    setInviting(false);
  };

  const handleAction = async (action: 'resend' | 'suspend' | 'reactivate' | 'revoke', member: RestaurantMember) => {
    let confirmMsg = '';
    if (action === 'revoke') confirmMsg = '¿Deseas revocar el acceso de forma permanente?';
    if (action === 'suspend') confirmMsg = '¿Deseas suspender a este miembro temporalmente?';
    if (action === 'resend') confirmMsg = '¿Deseas reenviar la invitación?';

    if (confirmMsg && !window.confirm(confirmMsg)) return;

    setProcessingId(member.id);
    let res: { success: boolean; error?: string } = { success: false };

    if (action === 'resend') res = await resendStaffInvitation(member.id);
    if (action === 'suspend') res = await suspendRestaurantMember(member.id);
    if (action === 'reactivate') res = await reactivateRestaurantMember(member.id);
    if (action === 'revoke') res = await revokeRestaurantMember(member.id);

    if (res.success) {
      showToast(`Acción completada.`);
      await loadMembers();
    } else {
      showToast(`⚠️ Error: ${res.error}`);
    }
    setProcessingId(null);
  };

  const activeMembers = members.filter(m => m.status === 'active');
  const invitedMembers = members.filter(m => m.status === 'invited');
  const otherMembers = members.filter(m => m.status === 'suspended' || m.status === 'revoked');

  return (
    <div className="card" style={{ background: 'var(--glass-medium)', backdropFilter: 'blur(20px)', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
      <div className="card-header" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <div className="card-title" style={{ color: 'white', fontWeight: 900, fontSize: '1.2rem' }}>
          <Users size={22} style={{ color: 'var(--primary)' }} /> Equipo de {tenant.name}
        </div>
        {isOwner && (
          <motion.button 
            whileHover={{ scale: 1.05 }} 
            whileTap={{ scale: 0.95 }} 
            className="btn btn-primary" 
            onClick={() => setShowInviteForm(!showInviteForm)}
          >
            <Mail size={16} /> {showInviteForm ? 'Cancelar' : 'Invitar Staff'}
          </motion.button>
        )}
      </div>

      <AnimatePresence>
        {showInviteForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden' }}>
            <form onSubmit={handleInvite} style={{ padding: '1.5rem', background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <h4 style={{ color: 'white', margin: '0 0 14px', fontWeight: 900 }}>Invitar nuevo miembro</h4>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '14px' }}>
                El usuario recibirá una invitación a su correo. Una vez acepte, tendrá acceso al panel operativo (KDS, Pedidos, etc.) sin ver información financiera ni configuración crítica.
              </p>
              <div style={{ display: 'flex', gap: '12px' }}>
                <input 
                  type="email" 
                  className="gf-input" 
                  placeholder="Correo electrónico" 
                  value={inviteEmail} 
                  onChange={e => setInviteEmail(e.target.value)} 
                  required 
                  style={{ flex: 1 }}
                />
                <button type="submit" className="btn btn-primary" disabled={inviting}>
                  {inviting ? 'Enviando...' : 'Enviar Invitación'}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <div style={{ padding: '1.5rem' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Cargando equipo...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            
            {/* ACTIVE MEMBERS */}
            <div>
              <h4 style={{ color: 'white', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                Miembros Activos <span className="badge badge-primary">{activeMembers.length}</span>
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {activeMembers.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No hay miembros activos.</p> : activeMembers.map(m => (
                  <MemberRow key={m.id} member={m} isOwner={isOwner} onAction={handleAction} processingId={processingId} />
                ))}
              </div>
            </div>

            {/* PENDING INVITES */}
            {invitedMembers.length > 0 && (
              <div>
                <h4 style={{ color: 'white', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  Invitaciones Pendientes <span className="badge badge-warning">{invitedMembers.length}</span>
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {invitedMembers.map(m => (
                    <MemberRow key={m.id} member={m} isOwner={isOwner} onAction={handleAction} processingId={processingId} />
                  ))}
                </div>
              </div>
            )}

            {/* SUSPENDED & REVOKED */}
            {otherMembers.length > 0 && (
              <div>
                <h4 style={{ color: 'white', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  Historial e Inactivos <span className="badge badge-secondary">{otherMembers.length}</span>
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {otherMembers.map(m => (
                    <MemberRow key={m.id} member={m} isOwner={isOwner} onAction={handleAction} processingId={processingId} />
                  ))}
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
};

const MemberRow: React.FC<{ 
  member: RestaurantMember, 
  isOwner: boolean, 
  onAction: (action: 'resend' | 'suspend' | 'reactivate' | 'revoke', member: RestaurantMember) => void,
  processingId: string | null 
}> = ({ member, isOwner, onAction, processingId }) => {
  const isProcessing = processingId === member.id;

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <strong style={{ color: 'white' }}>{member.email}</strong>
          {member.role === 'owner' && <span className="badge badge-primary" style={{ fontSize: '0.65rem' }}>Dueño</span>}
          {member.role === 'staff' && <span className="badge badge-secondary" style={{ fontSize: '0.65rem' }}>Staff</span>}
          
          {member.status === 'invited' && <span className="badge badge-warning" style={{ fontSize: '0.65rem' }}>Pendiente</span>}
          {member.status === 'suspended' && <span className="badge badge-danger" style={{ fontSize: '0.65rem', background: 'var(--danger)', color: 'white' }}>Suspendido</span>}
          {member.status === 'revoked' && <span className="badge badge-danger" style={{ fontSize: '0.65rem', background: 'var(--text-muted)', color: 'white' }}>Revocado</span>}
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {member.status === 'invited' ? `Invitado el ${new Date(member.invitedAt || member.createdAt).toLocaleDateString()}` : 
           member.status === 'active' ? `Activo desde ${new Date(member.acceptedAt || member.createdAt).toLocaleDateString()}` : 
           `Actualizado el ${new Date(member.updatedAt || member.createdAt).toLocaleDateString()}`}
        </div>
      </div>

      {isOwner && member.role !== 'owner' && (
        <div style={{ display: 'flex', gap: '8px' }}>
          {member.status === 'invited' && (
            <>
              <button disabled={isProcessing} className="btn btn-secondary" style={{ padding: '6px' }} title="Reenviar Invitación" onClick={() => onAction('resend', member)}><RefreshCw size={16} /></button>
              <button disabled={isProcessing} className="btn btn-secondary" style={{ padding: '6px', color: '#ef4444' }} title="Revocar Invitación" onClick={() => onAction('revoke', member)}><XCircle size={16} /></button>
            </>
          )}
          {member.status === 'active' && (
            <>
              <button disabled={isProcessing} className="btn btn-secondary" style={{ padding: '6px', color: '#f59e0b' }} title="Suspender Temporalmente" onClick={() => onAction('suspend', member)}><ShieldBan size={16} /></button>
              <button disabled={isProcessing} className="btn btn-secondary" style={{ padding: '6px', color: '#ef4444' }} title="Revocar Acceso" onClick={() => onAction('revoke', member)}><XCircle size={16} /></button>
            </>
          )}
          {member.status === 'suspended' && (
            <>
              <button disabled={isProcessing} className="btn btn-secondary" style={{ padding: '6px', color: '#10b981' }} title="Reactivar" onClick={() => onAction('reactivate', member)}><PlayCircle size={16} /></button>
              <button disabled={isProcessing} className="btn btn-secondary" style={{ padding: '6px', color: '#ef4444' }} title="Revocar Acceso" onClick={() => onAction('revoke', member)}><XCircle size={16} /></button>
            </>
          )}
        </div>
      )}
    </div>
  );
};
