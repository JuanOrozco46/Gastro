import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  X,
  Search,
  CheckCircle2,
  Table,
  Lock,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { validateEmail } from '../../utils/formValidation';

interface ConfirmationDialogState {
  isOpen: boolean;
  action: 'resend' | 'suspend' | 'reactivate' | 'revoke';
  member: RestaurantMember | null;
  title: string;
  description: string;
  confirmLabel: string;
  isDestructive: boolean;
}

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
  const [showPermissionsMatrix, setShowPermissionsMatrix] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Custom confirmation modal (replaces window.confirm)
  const [confirmDialog, setConfirmDialog] = useState<ConfirmationDialogState>({
    isOpen: false,
    action: 'resend',
    member: null,
    title: '',
    description: '',
    confirmLabel: '',
    isDestructive: false
  });

  const isOwner =
    members.find(m => m.userId === currentUser?.id && m.status === 'active')?.role === 'owner' ||
    currentUser?.businessRole === 'restaurant_owner' ||
    currentUser?.role === 'admin' ||
    currentUser?.role === 'platform_admin';

  const loadMembers = useCallback(async () => {
    setLoading(true);
    const data = await fetchRestaurantMembers(tenant.id);
    setMembers(data);
    setLoading(false);
  }, [fetchRestaurantMembers, tenant.id]);

  useEffect(() => {
    let isMounted = true;
    fetchRestaurantMembers(tenant.id).then(data => {
      if (isMounted) {
        setMembers(data);
        setLoading(false);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [fetchRestaurantMembers, tenant.id]);

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

  const openConfirmation = (
    action: 'resend' | 'suspend' | 'reactivate' | 'revoke',
    member: RestaurantMember
  ) => {
    if (action === 'revoke') {
      setConfirmDialog({
        isOpen: true,
        action,
        member,
        title: 'Revocar Acceso Permanente',
        description: `¿Estás seguro de revocar el acceso de ${member.email}? Esta acción no se puede deshacer y el empleado perderá el acceso a KDS y pedidos.`,
        confirmLabel: 'Sí, revocar acceso',
        isDestructive: true
      });
    } else if (action === 'suspend') {
      setConfirmDialog({
        isOpen: true,
        action,
        member,
        title: 'Suspender Acceso Temporal',
        description: `¿Deseas suspender a ${member.email}? El colaborador no podrá ingresar al panel operativo hasta que reactives su cuenta.`,
        confirmLabel: 'Suspender colaborador',
        isDestructive: true
      });
    } else if (action === 'reactivate') {
      setConfirmDialog({
        isOpen: true,
        action,
        member,
        title: 'Reactivar Acceso',
        description: `¿Deseas reactivar el acceso de ${member.email}? Podrá volver a gestionar la cocina y mesas inmediatamente.`,
        confirmLabel: 'Reactivar colaborador',
        isDestructive: false
      });
    } else if (action === 'resend') {
      setConfirmDialog({
        isOpen: true,
        action,
        member,
        title: 'Reenviar Invitación',
        description: `Enviaremos nuevamente el correo de bienvenida a ${member.email} con el enlace de vinculación.`,
        confirmLabel: 'Reenviar correo',
        isDestructive: false
      });
    }
  };

  const executeConfirmedAction = async () => {
    const { action, member } = confirmDialog;
    if (!member) return;

    setProcessingId(member.id);
    setConfirmDialog(prev => ({ ...prev, isOpen: false }));

    let res: { success: boolean; error?: string } = { success: false };

    if (action === 'resend') res = await resendStaffInvitation(member.id);
    if (action === 'suspend') res = await suspendRestaurantMember(member.id);
    if (action === 'reactivate') res = await reactivateRestaurantMember(member.id);
    if (action === 'revoke') res = await revokeRestaurantMember(member.id);

    if (res.success) {
      showToast('Estado del colaborador actualizado correctamente.');
      await loadMembers();
    } else {
      showToast(`⚠️ Error: ${res.error}`);
    }
    setProcessingId(null);
  };

  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) return members;
    const q = searchQuery.toLowerCase();
    return members.filter(
      m => m.email.toLowerCase().includes(q) || m.role.toLowerCase().includes(q)
    );
  }, [members, searchQuery]);

  const activeMembers = filteredMembers.filter(m => m.status === 'active');
  const invitedMembers = filteredMembers.filter(m => m.status === 'invited');
  const otherMembers = filteredMembers.filter(m => m.status === 'suspended' || m.status === 'revoked');

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
            <h3 className="rpa-card-title">Equipo y Personal de {tenant.name}</h3>
            <p className="rpa-card-subtitle">
              Administra colaboradores operativos, permisos en cocina (KDS), pedidos en vivo y atención en salón.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="pam-btn-ghost"
            onClick={() => setShowPermissionsMatrix(!showPermissionsMatrix)}
          >
            <Table size={15} />
            <span>{showPermissionsMatrix ? 'Ocultar Permisos' : 'Ver Matriz de Roles'}</span>
            {showPermissionsMatrix ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

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
                  <X size={16} /> Cerrar
                </>
              ) : (
                <>
                  <UserPlus size={16} /> Invitar Colaborador
                </>
              )}
            </button>
          )}
        </div>
      </div>

      <div className="rpa-card-body">
        {/* KPI Summary Strip */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '12px',
            marginBottom: '1rem'
          }}
        >
          <div className="pam-section" style={{ padding: '12px 14px', margin: 0 }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
              Colaboradores Activos
            </span>
            <strong style={{ fontSize: '1.4rem', color: '#059669', fontWeight: 900, display: 'block', marginTop: '2px' }}>
              {members.filter(m => m.status === 'active').length}
            </strong>
          </div>

          <div className="pam-section" style={{ padding: '12px 14px', margin: 0 }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
              Invitaciones Pendientes
            </span>
            <strong style={{ fontSize: '1.4rem', color: '#D97706', fontWeight: 900, display: 'block', marginTop: '2px' }}>
              {members.filter(m => m.status === 'invited').length}
            </strong>
          </div>

          <div className="pam-section" style={{ padding: '12px 14px', margin: 0 }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
              Accesos Inactivos
            </span>
            <strong style={{ fontSize: '1.4rem', color: 'var(--text-muted)', fontWeight: 900, display: 'block', marginTop: '2px' }}>
              {members.filter(m => m.status === 'suspended' || m.status === 'revoked').length}
            </strong>
          </div>
        </div>

        {/* Permissions Comparison Matrix */}
        <AnimatePresence>
          {showPermissionsMatrix && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              style={{ overflow: 'hidden', marginBottom: '1.25rem' }}
            >
              <div className="pam-section" style={{ padding: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <ShieldCheck size={18} color="var(--primary)" />
                  <strong style={{ fontSize: '0.96rem', color: 'var(--text-main)' }}>
                    Matriz de Privilegios por Perfil
                  </strong>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table className="gs-permission-table">
                    <thead>
                      <tr>
                        <th>Módulo / Funcionalidad</th>
                        <th style={{ width: '180px' }}>👑 Propietario / Admin</th>
                        <th style={{ width: '180px' }}>👨‍🍳 Staff Operativo</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td><strong>Monitor de Cocina (KDS) & Tiempo Real</strong></td>
                        <td><CheckCircle2 size={16} color="#059669" /> Acceso Total</td>
                        <td><CheckCircle2 size={16} color="#059669" /> Acceso Total</td>
                      </tr>
                      <tr>
                        <td><strong>Gestión y Despacho de Pedidos</strong></td>
                        <td><CheckCircle2 size={16} color="#059669" /> Acceso Total</td>
                        <td><CheckCircle2 size={16} color="#059669" /> Acceso Total</td>
                      </tr>
                      <tr>
                        <td><strong>Atención de Mesas QR en Salón</strong></td>
                        <td><CheckCircle2 size={16} color="#059669" /> Acceso Total</td>
                        <td><CheckCircle2 size={16} color="#059669" /> Acceso Total</td>
                      </tr>
                      <tr>
                        <td><strong>Pausar / Habilitar Platos Inmediatamente</strong></td>
                        <td><CheckCircle2 size={16} color="#059669" /> Permitido</td>
                        <td><CheckCircle2 size={16} color="#059669" /> Permitido</td>
                      </tr>
                      <tr>
                        <td><strong>Crear y Editar Precios en la Carta</strong></td>
                        <td><CheckCircle2 size={16} color="#059669" /> Permitido</td>
                        <td><span style={{ color: 'var(--text-muted)' }}>⚠️ Solo Consulta</span></td>
                      </tr>
                      <tr>
                        <td><strong>Finanzas, Dispersión Wompi y Cuentas Bancarias</strong></td>
                        <td><CheckCircle2 size={16} color="#059669" /> Acceso Exclusivo</td>
                        <td><span style={{ color: '#DC2626', display: 'flex', alignItems: 'center', gap: '4px' }}><Lock size={13} /> Bloqueado</span></td>
                      </tr>
                      <tr>
                        <td><strong>Invitar, Suspender o Revocar Empleados</strong></td>
                        <td><CheckCircle2 size={16} color="#059669" /> Permitido</td>
                        <td><span style={{ color: '#DC2626', display: 'flex', alignItems: 'center', gap: '4px' }}><Lock size={13} /> Bloqueado</span></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Invite Form */}
        <AnimatePresence>
          {showInviteForm && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              style={{ marginBottom: '1.25rem' }}
            >
              <form onSubmit={handleInvite} noValidate>
                <section className="pam-section">
                  <div className="pam-section-head">
                    <div className={`pam-step ${emailValid ? 'done' : ''}`}>
                      {emailValid ? <Check size={15} strokeWidth={3} /> : 1}
                    </div>
                    <div>
                      <h4>Vincular Colaborador a la Operación</h4>
                      <p>
                        El colaborador recibirá un correo de acceso al panel de <strong>{tenant.name}</strong> para gestionar pedidos y cocina sin acceso a métricas bancarias.
                      </p>
                    </div>
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
                        Correo Electrónico del Colaborador <em>*</em>
                      </label>
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <div className="pam-input-wrap" style={{ flex: 1, minWidth: '240px' }}>
                          <Mail size={16} className="pam-icon" />
                          <input
                            type="email"
                            className={`pam-input ${emailError ? 'has-error' : ''}`}
                            placeholder="colaborador@correo.com"
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

        {/* Search Bar */}
        {members.length > 3 && (
          <div className="pam-input-wrap" style={{ marginBottom: '1rem', maxWidth: '360px' }}>
            <Search size={15} className="pam-icon" />
            <input
              type="text"
              className="pam-input"
              placeholder="Buscar colaborador por correo o rol..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        )}

        {/* Member Listings */}
        {loading ? (
          <div className="pam-section" style={{ alignItems: 'center', padding: '2.5rem', textAlign: 'center' }}>
            <RefreshCw size={24} className="spin" style={{ color: 'var(--primary)' }} />
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: '8px 0 0' }}>
              Cargando colaboradores de {tenant.name}...
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Active Members */}
            <section className="pam-section">
              <div className="pam-section-head" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <div className="pam-step done">
                    <Check size={14} strokeWidth={3} />
                  </div>
                  <div>
                    <h4>Colaboradores Activos ({activeMembers.length})</h4>
                    <p>Miembros con acceso operativo al restaurante</p>
                  </div>
                </div>
                <span className="rpa-badge success">{activeMembers.length} activos</span>
              </div>

              {activeMembers.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
                  {searchQuery ? 'No se encontraron colaboradores que coincidan con la búsqueda.' : 'Aún no hay colaboradores activos registrados.'}
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {activeMembers.map(m => (
                    <MemberRow
                      key={m.id}
                      member={m}
                      isOwner={isOwner}
                      onAction={openConfirmation}
                      processingId={processingId}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Pending Invitations */}
            {invitedMembers.length > 0 && (
              <section className="pam-section">
                <div className="pam-section-head" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h4>Invitaciones Pendientes ({invitedMembers.length})</h4>
                    <p>Colaboradores que aún no han aceptado su invitación por correo</p>
                  </div>
                  <span className="rpa-badge warning">{invitedMembers.length} pendientes</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {invitedMembers.map(m => (
                    <MemberRow
                      key={m.id}
                      member={m}
                      isOwner={isOwner}
                      onAction={openConfirmation}
                      processingId={processingId}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Inactive / Revoked */}
            {otherMembers.length > 0 && (
              <section className="pam-section">
                <div className="pam-section-head" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h4>Historial de Accesos Inactivos ({otherMembers.length})</h4>
                    <p>Colaboradores suspendidos temporalmente o con acceso revocado</p>
                  </div>
                  <span className="rpa-badge neutral">{otherMembers.length} inactivos</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {otherMembers.map(m => (
                    <MemberRow
                      key={m.id}
                      member={m}
                      isOwner={isOwner}
                      onAction={openConfirmation}
                      processingId={processingId}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {/* CUSTOM ANIMATED CONFIRMATION MODAL */}
        <AnimatePresence>
          {confirmDialog.isOpen && (
            <div className="gs-modal-backdrop" onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}>
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="gs-modal-card"
                onClick={e => e.stopPropagation()}
                style={{ maxWidth: '440px' }}
              >
                <div className="gs-modal-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      className="rpa-card-icon"
                      style={{
                        width: '32px',
                        height: '32px',
                        background: confirmDialog.isDestructive ? '#FEE2E2' : 'var(--primary-light)',
                        color: confirmDialog.isDestructive ? '#DC2626' : 'var(--primary)'
                      }}
                    >
                      {confirmDialog.isDestructive ? <AlertCircle size={18} /> : <Sparkles size={18} />}
                    </div>
                    <strong style={{ fontSize: '1rem', color: 'var(--text-main)' }}>
                      {confirmDialog.title}
                    </strong>
                  </div>
                  <button
                    type="button"
                    className="rpa-icon-btn"
                    onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
                    aria-label="Cerrar modal"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="gs-modal-body">
                  <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-main)', lineHeight: 1.5 }}>
                    {confirmDialog.description}
                  </p>
                </div>

                <div className="gs-modal-footer">
                  <button
                    type="button"
                    className="pam-btn-ghost"
                    onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className={confirmDialog.isDestructive ? 'pam-btn-danger' : 'pam-btn-primary'}
                    onClick={executeConfirmedAction}
                  >
                    {confirmDialog.confirmLabel}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
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
              <span className="rpa-badge primary">👑 Propietario</span>
            ) : (
              <span className="rpa-badge neutral">👨‍🍳 Staff Operativo</span>
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
