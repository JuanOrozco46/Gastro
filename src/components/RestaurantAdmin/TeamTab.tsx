import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/useApp';
import type { Tenant, RestaurantMember } from '../../types';
import {
  Users,
  Mail,
  RefreshCw,
  XCircle,
  PlayCircle,
  ShieldBan,
  Sparkles,
  Check,
  UserPlus,
  ShieldCheck,
  AlertCircle,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { validateEmail } from '../../utils/formValidation';

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
  const [emailError, setEmailError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const isOwner =
    members.find(m => m.userId === currentUser?.id)?.role === 'owner' ||
    currentUser?.role === 'admin' ||
    currentUser?.role === 'platform_admin' ||
    currentUser?.tenantId === tenant.id;

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
    const err = validateEmail(inviteEmail);
    if (err) {
      setEmailError(err);
      return;
    }

    setEmailError(null);
    setInviting(true);
    const res = await inviteRestaurantStaff(tenant.id, inviteEmail.trim());
    if (res.success) {
      showToast('✨ Invitación enviada correctamente al empleado.');
      setInviteEmail('');
      setShowInviteForm(false);
      await loadMembers();
    } else {
      setEmailError(res.error || 'No se pudo enviar la invitación.');
      showToast(`⚠️ Error al invitar: ${res.error}`);
    }
    setInviting(false);
  };

  const handleAction = async (
    action: 'resend' | 'suspend' | 'reactivate' | 'revoke',
    member: RestaurantMember
  ) => {
    let confirmMsg = '';
    if (action === 'revoke') confirmMsg = '¿Deseas revocar el acceso de este empleado de forma permanente?';
    if (action === 'suspend') confirmMsg = '¿Deseas suspender temporalmente el acceso de este empleado?';
    if (action === 'resend') confirmMsg = '¿Deseas reenviar la invitación a su correo?';

    if (confirmMsg && !window.confirm(confirmMsg)) return;

    setProcessingId(member.id);
    let res: { success: boolean; error?: string } = { success: false };

    if (action === 'resend') res = await resendStaffInvitation(member.id);
    if (action === 'suspend') res = await suspendRestaurantMember(member.id);
    if (action === 'reactivate') res = await reactivateRestaurantMember(member.id);
    if (action === 'revoke') res = await revokeRestaurantMember(member.id);

    if (res.success) {
      showToast('Estado del miembro actualizado.');
      await loadMembers();
    } else {
      showToast(`⚠️ Error: ${res.error}`);
    }
    setProcessingId(null);
  };

  const activeMembers = members.filter(m => m.status === 'active');
  const invitedMembers = members.filter(m => m.status === 'invited');
  const otherMembers = members.filter(m => m.status === 'suspended' || m.status === 'revoked');

  const emailValid = Boolean(inviteEmail.trim() && !validateEmail(inviteEmail));

  return (
    <div className="rpa-card">
      {/* Header Editorial */}
      <div className="rpa-card-header">
        <div className="rpa-card-header-left">
          <div className="rpa-card-icon">
            <Users size={22} />
          </div>
          <div>
            <span className="pam-eyebrow" style={{ color: 'var(--primary)', marginBottom: '2px' }}>
              <Sparkles size={11} style={{ display: 'inline', verticalAlign: 'middle' }} /> Gestión de Personal y Accesos
            </span>
            <h3 className="rpa-card-title">Equipo y Empleados de {tenant.name}</h3>
            <p className="rpa-card-subtitle">
              Administra quién tiene acceso operativo a pedidos, cocina (KDS) y atención en mesas.
            </p>
          </div>
        </div>

        {isOwner && (
          <button
            type="button"
            className={showInviteForm ? 'pam-btn-ghost' : 'pam-btn-primary'}
            onClick={() => {
              setShowInviteForm(!showInviteForm);
              setEmailError(null);
            }}
          >
            {showInviteForm ? (
              <>
                <X size={16} /> Cancelar
              </>
            ) : (
              <>
                <UserPlus size={16} /> Vincular Empleado
              </>
            )}
          </button>
        )}
      </div>

      <div className="rpa-card-body">
        {/* Formulario de Invitación con formato .pam-* */}
        <AnimatePresence>
          {showInviteForm && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
            >
              <form onSubmit={handleInvite} noValidate>
                <section className="pam-section">
                  <div className="pam-section-head">
                    <div className={`pam-step ${emailValid ? 'done' : ''}`}>
                      {emailValid ? <Check size={15} strokeWidth={3} /> : 1}
                    </div>
                    <div>
                      <h4>Invitar Empleado / Staff Operativo</h4>
                      <p>
                        El colaborador recibirá acceso inmediato al panel operativo de <strong>{tenant.name}</strong> sin ver métricas financieras sensibles.
                      </p>
                    </div>
                  </div>

                  {/* Permisos del rol Staff */}
                  <div className="pam-chips">
                    <span className="rpa-badge success">
                      <Check size={11} /> Gestión de Pedidos en Vivo
                    </span>
                    <span className="rpa-badge success">
                      <Check size={11} /> Monitor de Cocina (KDS)
                    </span>
                    <span className="rpa-badge success">
                      <Check size={11} /> Mesas QR y Repartidores
                    </span>
                    <span className="rpa-badge neutral">
                      <ShieldCheck size={11} /> Sin acceso a Finanzas Críticas
                    </span>
                  </div>

                  {emailError && (
                    <div className="pam-callout error">
                      <AlertCircle size={17} />
                      <span>{emailError}</span>
                    </div>
                  )}

                  <div className="pam-grid">
                    <div className="pam-field pam-span-2">
                      <label>
                        Correo Electrónico del Empleado <em>*</em>
                      </label>
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <div className="pam-input-wrap" style={{ flex: 1, minWidth: '240px' }}>
                          <Mail size={16} className="pam-icon" />
                          <input
                            type="email"
                            className={`pam-input ${emailError ? 'has-error' : ''}`}
                            placeholder="empleado@correo.com"
                            value={inviteEmail}
                            onChange={e => {
                              setInviteEmail(e.target.value);
                              setEmailError(null);
                            }}
                            required
                          />
                        </div>
                        <button type="submit" className="pam-btn-primary" disabled={inviting}>
                          <UserPlus size={16} />
                          <span>{inviting ? 'Enviando invitación...' : 'Enviar Invitación'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </section>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Listado de Miembros */}
        {loading ? (
          <div className="pam-section" style={{ alignItems: 'center', padding: '2.5rem', textAlign: 'center' }}>
            <RefreshCw size={24} className="spin" style={{ color: 'var(--primary)' }} />
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: 0 }}>
              Cargando equipo de {tenant.name}...
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Miembros Activos */}
            <section className="pam-section">
              <div className="pam-section-head" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <div className="pam-step done">
                    <Check size={14} strokeWidth={3} />
                  </div>
                  <div>
                    <h4>Colaboradores Activos ({activeMembers.length})</h4>
                    <p>Miembros con acceso habilitado al restaurante</p>
                  </div>
                </div>
                <span className="rpa-badge success">{activeMembers.length} activos</span>
              </div>

              {activeMembers.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
                  Aún no hay miembros activos registrados.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {activeMembers.map(m => (
                    <MemberRow
                      key={m.id}
                      member={m}
                      isOwner={isOwner}
                      onAction={handleAction}
                      processingId={processingId}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Invitaciones Pendientes */}
            {invitedMembers.length > 0 && (
              <section className="pam-section">
                <div className="pam-section-head" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h4>Invitaciones Pendientes ({invitedMembers.length})</h4>
                    <p>Colaboradores que aún no han aceptado su invitación</p>
                  </div>
                  <span className="rpa-badge warning">{invitedMembers.length} pendientes</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {invitedMembers.map(m => (
                    <MemberRow
                      key={m.id}
                      member={m}
                      isOwner={isOwner}
                      onAction={handleAction}
                      processingId={processingId}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Suspendidos o Revocados */}
            {otherMembers.length > 0 && (
              <section className="pam-section">
                <div className="pam-section-head" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h4>Historial de Accesos Inactivos ({otherMembers.length})</h4>
                    <p>Miembros suspendidos temporalmente o con acceso revocado</p>
                  </div>
                  <span className="rpa-badge neutral">{otherMembers.length} inactivos</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {otherMembers.map(m => (
                    <MemberRow
                      key={m.id}
                      member={m}
                      isOwner={isOwner}
                      onAction={handleAction}
                      processingId={processingId}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const MemberRow: React.FC<{
  member: RestaurantMember;
  isOwner: boolean;
  onAction: (
    action: 'resend' | 'suspend' | 'reactivate' | 'revoke',
    member: RestaurantMember
  ) => void;
  processingId: string | null;
}> = ({ member, isOwner, onAction, processingId }) => {
  const isProcessing = processingId === member.id;
  const initials = (member.email || 'EM').slice(0, 2).toUpperCase();

  return (
    <div className="rpa-item-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div
          className="urm-avatar-preview"
          style={{ width: '44px', height: '44px', fontSize: '0.9rem' }}
        >
          <span>{initials}</span>
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <strong style={{ color: 'var(--text-main)', fontSize: '0.92rem' }}>
              {member.email}
            </strong>
            {member.role === 'owner' ? (
              <span className="rpa-badge primary">Propietario</span>
            ) : (
              <span className="rpa-badge neutral">Staff Operativo</span>
            )}

            {member.status === 'active' && <span className="rpa-badge success">Activo</span>}
            {member.status === 'invited' && <span className="rpa-badge warning">Invitado</span>}
            {member.status === 'suspended' && <span className="rpa-badge danger">Suspendido</span>}
            {member.status === 'revoked' && <span className="rpa-badge neutral">Revocado</span>}
          </div>
          <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '3px' }}>
            {member.status === 'invited'
              ? `Invitado el ${new Date(member.invitedAt || member.createdAt).toLocaleDateString('es-CO')}`
              : member.status === 'active'
                ? `Activo desde ${new Date(member.acceptedAt || member.createdAt).toLocaleDateString('es-CO')}`
                : `Actualizado el ${new Date(member.updatedAt || member.createdAt).toLocaleDateString('es-CO')}`}
          </div>
        </div>
      </div>

      {isOwner && member.role !== 'owner' && (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {member.status === 'invited' && (
            <>
              <button
                type="button"
                disabled={isProcessing}
                className="pam-chip"
                onClick={() => onAction('resend', member)}
                title="Reenviar invitación por correo"
              >
                <RefreshCw size={13} /> Reenviar
              </button>
              <button
                type="button"
                disabled={isProcessing}
                className="rpa-icon-btn danger"
                onClick={() => onAction('revoke', member)}
                title="Revocar invitación"
              >
                <XCircle size={16} />
              </button>
            </>
          )}
          {member.status === 'active' && (
            <>
              <button
                type="button"
                disabled={isProcessing}
                className="pam-chip"
                onClick={() => onAction('suspend', member)}
                title="Suspender acceso temporalmente"
              >
                <ShieldBan size={13} /> Suspender
              </button>
              <button
                type="button"
                disabled={isProcessing}
                className="rpa-icon-btn danger"
                onClick={() => onAction('revoke', member)}
                title="Revocar acceso permanente"
              >
                <XCircle size={16} />
              </button>
            </>
          )}
          {member.status === 'suspended' && (
            <>
              <button
                type="button"
                disabled={isProcessing}
                className="pam-chip"
                onClick={() => onAction('reactivate', member)}
                title="Reactivar acceso"
              >
                <PlayCircle size={13} /> Reactivar
              </button>
              <button
                type="button"
                disabled={isProcessing}
                className="rpa-icon-btn danger"
                onClick={() => onAction('revoke', member)}
                title="Revocar acceso permanente"
              >
                <XCircle size={16} />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};
