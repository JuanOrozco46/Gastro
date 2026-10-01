import React, { useState } from 'react';
import { useApp } from '../context/useApp';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Globe, Building2, DollarSign, ShoppingBag, CreditCard,
  ShieldCheck, AlertCircle, FileText, Phone, Mail, MapPin,
  CheckCircle, Zap, Key
} from 'lucide-react';
import type { RestaurantApplicationStatus } from '../types';

export const SuperAdminView: React.FC = () => {
  const {
    currentUser, tenants, orders, transactions,
    restaurantApplications, reviewRestaurantApplication,
    activateApprovedRestaurant, zones
  } = useApp();

  const [activeTab, setActiveTab] = useState<'applications' | 'settlement'>('applications');
  const [statusFilter, setStatusFilter] = useState<'all' | RestaurantApplicationStatus>('all');
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  // Activation State
  const [activatingAppId, setActivatingAppId] = useState<string | null>(null);
  const [activationError, setActivationError] = useState<string | null>(null);
  const [activationSuccessInfo, setActivationSuccessInfo] = useState<{
    restaurantName: string;
    ownerEmail: string;
    tenantId: string;
  } | null>(null);

  // Access guard
  if (!currentUser || currentUser.businessRole !== 'platform_admin') {
    return (
      <div 
        style={{
          textAlign: 'center',
          padding: '4rem 2rem',
          background: 'var(--glass-medium)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '28px',
          maxWidth: '600px',
          margin: '2rem auto',
          color: 'var(--text-muted)'
        }}
      >
        <AlertCircle size={52} style={{ color: '#EF4444', marginBottom: '1rem' }} />
        <h3 style={{ fontSize: '1.4rem', color: 'white', fontWeight: 900, marginBottom: '8px' }}>
          Acceso Denegado
        </h3>
        <p style={{ fontSize: '0.9rem', lineHeight: 1.5 }}>
          Esta vista está reservada exclusivamente para el Administrador de Plataforma GastroSync.
        </p>
      </div>
    );
  }

  // Counters
  const submittedCount = restaurantApplications.filter(a => a.status === 'submitted').length;
  const reviewingCount = restaurantApplications.filter(a => a.status === 'reviewing').length;
  const approvedCount = restaurantApplications.filter(a => a.status === 'approved').length;
  const rejectedCount = restaurantApplications.filter(a => a.status === 'rejected').length;
  const pendingReviewTotal = submittedCount + reviewingCount;

  // Filtered applications
  const filteredApps = restaurantApplications
    .filter(a => statusFilter === 'all' || a.status === statusFilter)
    .sort((a, b) => b.submittedAt - a.submittedAt);

  const handleNoteChange = (appId: string, note: string) => {
    setReviewNotes(prev => ({ ...prev, [appId]: note }));
  };

  const handleReviewAction = (appId: string, nextStatus: 'reviewing' | 'approved' | 'rejected') => {
    const note = reviewNotes[appId] || '';
    const ok = reviewRestaurantApplication(appId, nextStatus, note);
    if (ok) {
      setReviewNotes(prev => {
        const copy = { ...prev };
        delete copy[appId];
        return copy;
      });
    }
  };

  const handleConfirmActivation = async (appId: string) => {
    setActivationError(null);

    const app = restaurantApplications.find(a => a.id === appId);
    if (!app) return;

    const res = await activateApprovedRestaurant(appId);
    if (res.success && res.tenantId) {
      setActivationSuccessInfo({
        restaurantName: app.restaurantName,
        ownerEmail: app.ownerEmail,
        tenantId: res.tenantId
      });
      setActivatingAppId(null);
    } else if (res.error) {
      setActivationError(res.error);
    }
  };

  const totalEthicalFees = transactions.reduce((sum, t) => sum + t.platformFee, 0);
  const totalRestaurantPayouts = transactions.reduce((sum, t) => sum + t.restaurantPayout, 0);

  const getStatusBadge = (status: RestaurantApplicationStatus) => {
    switch (status) {
      case 'submitted':
        return <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.2)', color: '#F59E0B', border: '1px solid rgba(245, 158, 11, 0.4)', fontWeight: 800 }}>📌 ENVIADA</span>;
      case 'reviewing':
        return <span className="badge" style={{ background: 'rgba(56, 189, 248, 0.2)', color: '#38BDF8', border: '1px solid rgba(56, 189, 248, 0.4)', fontWeight: 800 }}>🔍 EN REVISIÓN</span>;
      case 'approved':
        return <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#10B981', border: '1px solid rgba(16, 185, 129, 0.4)', fontWeight: 800 }}>✅ APROBADA</span>;
      case 'rejected':
        return <span className="badge" style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#EF4444', border: '1px solid rgba(239, 68, 68, 0.4)', fontWeight: 800 }}>❌ RECHAZADA</span>;
    }
  };

  return (
    <div className="tab-content active">
      {/* Platform Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <ShieldCheck size={18} style={{ color: 'var(--secondary)' }} />
            <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              ADMINISTRACIÓN DE PLATAFORMA GASTROSYNC
            </span>
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 900, color: 'white', margin: 0 }}>
            🛡️ Panel de Control del Administrador de Plataforma
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginTop: '4px', margin: 0 }}>
            Gestión interna de comercios, revisión de solicitudes de vinculación y liquidaciones de la red.
          </p>
        </div>

        {/* View Selector Tabs */}
        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', padding: '4px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.1)' }}>
          <button
            onClick={() => setActiveTab('applications')}
            className={`btn ${activeTab === 'applications' ? 'btn-primary' : 'btn-outline'}`}
            style={{ padding: '8px 16px', fontSize: '0.82rem', fontWeight: 800, borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <FileText size={16} />
            <span>Solicitudes de Aliados</span>
            {pendingReviewTotal > 0 && (
              <span style={{ background: '#F59E0B', color: '#0F172A', padding: '2px 6px', borderRadius: '10px', fontSize: '0.7rem', fontWeight: 900 }}>
                {pendingReviewTotal}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('settlement')}
            className={`btn ${activeTab === 'settlement' ? 'btn-primary' : 'btn-outline'}`}
            style={{ padding: '8px 16px', fontSize: '0.82rem', fontWeight: 800, borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Globe size={16} />
            <span>Red & Liquidaciones</span>
          </button>
        </div>
      </div>

      {/* ── TAB 1: SOLICITUDES DE ALIADOS ── */}
      {activeTab === 'applications' && (
        <div>
          {/* Status Counter Bar */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <div className="card" onClick={() => setStatusFilter('all')} style={{ cursor: 'pointer', border: statusFilter === 'all' ? '1px solid var(--primary)' : undefined, background: 'var(--glass-medium)' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 700 }}>Total Solicitudes</div>
              <strong style={{ fontSize: '1.5rem', color: 'white', fontWeight: 900 }}>{restaurantApplications.length}</strong>
            </div>

            <div className="card" onClick={() => setStatusFilter('submitted')} style={{ cursor: 'pointer', border: statusFilter === 'submitted' ? '1px solid #F59E0B' : undefined, background: 'rgba(245, 158, 11, 0.08)' }}>
              <div style={{ fontSize: '0.78rem', color: '#F59E0B', fontWeight: 700 }}>📌 Pendientes / Enviadas</div>
              <strong style={{ fontSize: '1.5rem', color: '#F59E0B', fontWeight: 900 }}>{submittedCount}</strong>
            </div>

            <div className="card" onClick={() => setStatusFilter('reviewing')} style={{ cursor: 'pointer', border: statusFilter === 'reviewing' ? '1px solid #38BDF8' : undefined, background: 'rgba(56, 189, 248, 0.08)' }}>
              <div style={{ fontSize: '0.78rem', color: '#38BDF8', fontWeight: 700 }}>🔍 En Revisión</div>
              <strong style={{ fontSize: '1.5rem', color: '#38BDF8', fontWeight: 900 }}>{reviewingCount}</strong>
            </div>

            <div className="card" onClick={() => setStatusFilter('approved')} style={{ cursor: 'pointer', border: statusFilter === 'approved' ? '1px solid #10B981' : undefined, background: 'rgba(16, 185, 129, 0.08)' }}>
              <div style={{ fontSize: '0.78rem', color: '#10B981', fontWeight: 700 }}>✅ Aprobadas</div>
              <strong style={{ fontSize: '1.5rem', color: '#10B981', fontWeight: 900 }}>{approvedCount}</strong>
            </div>

            <div className="card" onClick={() => setStatusFilter('rejected')} style={{ cursor: 'pointer', border: statusFilter === 'rejected' ? '1px solid #EF4444' : undefined, background: 'rgba(239, 68, 68, 0.08)' }}>
              <div style={{ fontSize: '0.78rem', color: '#EF4444', fontWeight: 700 }}>❌ Rechazadas</div>
              <strong style={{ fontSize: '1.5rem', color: '#EF4444', fontWeight: 900 }}>{rejectedCount}</strong>
            </div>
          </div>

          {/* Filter Pills */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '1.25rem', overflowX: 'auto', paddingBottom: '4px' }}>
            <button
              className={`btn ${statusFilter === 'all' ? 'btn-secondary' : 'btn-outline'}`}
              style={{ padding: '6px 14px', fontSize: '0.8rem', borderRadius: '12px' }}
              onClick={() => setStatusFilter('all')}
            >
              Todas ({restaurantApplications.length})
            </button>
            <button
              className={`btn ${statusFilter === 'submitted' ? 'btn-secondary' : 'btn-outline'}`}
              style={{ padding: '6px 14px', fontSize: '0.8rem', borderRadius: '12px' }}
              onClick={() => setStatusFilter('submitted')}
            >
              Enviadas ({submittedCount})
            </button>
            <button
              className={`btn ${statusFilter === 'reviewing' ? 'btn-secondary' : 'btn-outline'}`}
              style={{ padding: '6px 14px', fontSize: '0.8rem', borderRadius: '12px' }}
              onClick={() => setStatusFilter('reviewing')}
            >
              En Revisión ({reviewingCount})
            </button>
            <button
              className={`btn ${statusFilter === 'approved' ? 'btn-secondary' : 'btn-outline'}`}
              style={{ padding: '6px 14px', fontSize: '0.8rem', borderRadius: '12px' }}
              onClick={() => setStatusFilter('approved')}
            >
              Aprobadas ({approvedCount})
            </button>
            <button
              className={`btn ${statusFilter === 'rejected' ? 'btn-secondary' : 'btn-outline'}`}
              style={{ padding: '6px 14px', fontSize: '0.8rem', borderRadius: '12px' }}
              onClick={() => setStatusFilter('rejected')}
            >
              Rechazadas ({rejectedCount})
            </button>
          </div>

          {/* Applications List */}
          {filteredApps.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '3rem 1.5rem', background: 'var(--glass-medium)', color: 'var(--text-muted)' }}>
              <FileText size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
              <h4 style={{ color: 'white', margin: '0 0 6px', fontWeight: 800 }}>No hay solicitudes registradas en este estado</h4>
              <p style={{ fontSize: '0.85rem', margin: 0 }}>
                {statusFilter === 'all' 
                  ? 'Aún no se han enviado solicitudes de restaurante desde el portal público.' 
                  : `No se encontraron solicitudes con el filtro "${statusFilter}".`}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <AnimatePresence>
                {filteredApps.map(app => {
                  const zoneObj = zones.find(z => z.id === app.zoneId);
                  const zoneName = zoneObj ? zoneObj.name : app.zoneId;

                  return (
                    <motion.div
                      key={app.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="card"
                      style={{
                        background: 'var(--glass-dark)',
                        backdropFilter: 'blur(20px)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: '20px',
                        padding: '1.5rem'
                      }}
                    >
                      {/* Card Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '12px' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <h3 style={{ fontSize: '1.25rem', fontWeight: 900, color: 'white', margin: 0 }}>
                              {app.restaurantName}
                            </h3>
                            {getStatusBadge(app.status)}
                          </div>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginTop: '3px' }}>
                            Categoría: <strong>{app.category}</strong> · Zona: <strong>{zoneName} (Armenia)</strong>
                          </span>
                        </div>

                        <div style={{ textAlign: 'right', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          <div>Enviada el: <strong>{new Date(app.submittedAt).toLocaleString('es-CO')}</strong></div>
                          <code style={{ fontSize: '0.7rem', color: 'var(--tertiary)' }}>ID: {app.id}</code>
                        </div>
                      </div>

                      {/* Card Body - Details Grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem', marginBottom: '1.25rem' }}>
                        
                        {/* Contact Info */}
                        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px 14px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.06)' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                            Datos del Responsable
                          </span>
                          <div style={{ fontSize: '0.85rem', color: 'white', fontWeight: 700, marginBottom: '4px' }}>
                            👤 {app.ownerName}
                          </div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                            <Mail size={13} /> <code>{app.ownerEmail}</code>
                          </div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Phone size={13} /> {app.ownerPhone}
                          </div>
                          {app.whatsapp && (
                            <div style={{ fontSize: '0.78rem', color: '#10B981', marginTop: '4px', fontWeight: 600 }}>
                              💬 WhatsApp: {app.whatsapp}
                            </div>
                          )}
                        </div>

                        {/* Location & Commercial */}
                        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px 14px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.06)' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                            Ubicación & Referencia
                          </span>
                          <div style={{ fontSize: '0.83rem', color: 'white', display: 'flex', alignItems: 'flex-start', gap: '6px', marginBottom: '6px' }}>
                            <MapPin size={15} style={{ color: 'var(--secondary)', flexShrink: 0, marginTop: '2px' }} />
                            <span>{app.address}</span>
                          </div>
                          {app.minOrder !== undefined && (
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                              Pedido Mínimo: <strong style={{ color: 'white' }}>${app.minOrder.toLocaleString('es-CO')} COP</strong>
                            </div>
                          )}
                        </div>

                        {/* Delivery Modes & Rates */}
                        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px 14px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.06)' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--tertiary)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                            Modalidades Solicitadas
                          </span>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '6px' }}>
                            {app.deliveryModes.map(m => (
                              <span key={m} style={{ fontSize: '0.72rem', background: 'rgba(255,255,255,0.08)', color: 'white', padding: '3px 8px', borderRadius: '6px', fontWeight: 700 }}>
                                {m === 'pickup' ? '🛍️ Recogida' : m === 'restaurant_delivery' ? '🛵 Domicilio' : '🍽️ Mesa QR'}
                              </span>
                            ))}
                          </div>

                          {app.deliveryModes.includes('restaurant_delivery') && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '4px', marginTop: '4px' }}>
                              {app.deliveryFee !== undefined && <div>Tarifa Domicilio: <strong style={{ color: 'white' }}>${app.deliveryFee.toLocaleString('es-CO')} COP</strong></div>}
                              {app.deliveryRadiusKm !== undefined && <div>Radio Cobertura: <strong style={{ color: 'white' }}>{app.deliveryRadiusKm} Km</strong></div>}
                            </div>
                          )}
                        </div>

                      </div>

                      {/* Comments / Notes from Applicant */}
                      {app.notes && (
                        <div style={{ background: 'rgba(245, 158, 11, 0.06)', border: '1px solid rgba(245, 158, 11, 0.15)', padding: '10px 14px', borderRadius: '12px', marginBottom: '1.25rem', fontSize: '0.82rem', color: '#FCD34D' }}>
                          💬 <strong>Mensaje del Solicitante:</strong> "{app.notes}"
                        </div>
                      )}

                      {/* Review History / Decisions */}
                      {app.reviewedAt && (
                        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', padding: '10px 14px', borderRadius: '12px', marginBottom: '1.25rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          <div>
                            🏁 Decisión tomada el <strong>{new Date(app.reviewedAt).toLocaleString('es-CO')}</strong> por <code style={{ color: 'white' }}>{app.reviewedByEmail}</code>.
                          </div>
                          {app.reviewNote && (
                            <div style={{ marginTop: '4px', color: 'white', fontStyle: 'italic' }}>
                              📝 <strong>Nota de revisión interna:</strong> "{app.reviewNote}"
                            </div>
                          )}
                        </div>
                      )}

                      {/* Interactive Review Action Controls */}
                      {(app.status === 'submitted' || app.status === 'reviewing') && (
                        <div style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '14px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)' }}>
                          <div style={{ marginBottom: '10px' }}>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: 'white', marginBottom: '4px' }}>
                              Nota interna de revisión (opcional):
                            </label>
                            <input
                              type="text"
                              placeholder="Ej: Documentos preliminares verificados / Pendiente confirmación telefónica"
                              value={reviewNotes[app.id] || ''}
                              onChange={e => handleNoteChange(app.id, e.target.value)}
                              style={{ width: '100%', fontSize: '0.82rem' }}
                            />
                          </div>

                          {/* Non-promising Disclaimer before approving */}
                          <div style={{ fontSize: '0.75rem', color: '#FCD34D', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <AlertCircle size={14} style={{ flexShrink: 0 }} />
                            <span>⚠️ Aprobar esta solicitud guarda la decisión interna pero NO activa automáticamente un restaurante en el feed ni crea una cuenta de dueño.</span>
                          </div>

                          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            {app.status === 'submitted' && (
                              <button
                                className="btn btn-outline"
                                style={{ padding: '8px 14px', fontSize: '0.8rem', fontWeight: 800, borderRadius: '10px', borderColor: 'rgba(56, 189, 248, 0.4)', color: '#38BDF8' }}
                                onClick={() => handleReviewAction(app.id, 'reviewing')}
                              >
                                🔍 Marcar En Revisión
                              </button>
                            )}

                            <button
                              className="btn btn-secondary"
                              style={{ padding: '8px 16px', fontSize: '0.8rem', fontWeight: 900, borderRadius: '10px' }}
                              onClick={() => handleReviewAction(app.id, 'approved')}
                            >
                              ✅ Aprobar Solicitud
                            </button>

                            <button
                              className="btn btn-outline"
                              style={{ padding: '8px 14px', fontSize: '0.8rem', fontWeight: 800, borderRadius: '10px', borderColor: 'rgba(239, 68, 68, 0.4)', color: '#EF4444' }}
                              onClick={() => handleReviewAction(app.id, 'rejected')}
                            >
                              ❌ Rechazar Solicitud
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Activation Section for Approved Applications */}
                      {app.status === 'approved' && (
                        <div style={{ marginTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '1rem' }}>
                          {app.activatedTenantId ? (
                            <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '12px 16px', borderRadius: '14px', fontSize: '0.82rem', color: '#10B981' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 900, marginBottom: '4px' }}>
                                <CheckCircle size={18} />
                                <span>Restaurante activado</span>
                              </div>
                              <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                                Activado el: <strong>{app.activatedAt ? new Date(app.activatedAt).toLocaleString('es-CO') : 'Recientemente'}</strong> por <code style={{ color: 'white' }}>{app.activatedByEmail}</code> · ID Tenant: <code style={{ color: 'white' }}>{app.activatedTenantId}</code>
                              </div>
                            </div>
                          ) : activatingAppId === app.id ? (
                            <div style={{ background: 'rgba(139, 92, 246, 0.12)', border: '1px solid rgba(139, 92, 246, 0.35)', padding: '16px', borderRadius: '16px' }}>
                              <div style={{ fontWeight: 900, color: 'white', fontSize: '0.95rem', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Key size={18} style={{ color: '#8B5CF6' }} />
                                <span>Activar Restaurante Operativo Local</span>
                              </div>

                              <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.25)', padding: '10px 12px', borderRadius: '10px', fontSize: '0.78rem', color: '#FCD34D', marginBottom: '12px', lineHeight: 1.4 }}>
                                ⚠️ <strong>Aviso Importante:</strong> Al confirmar, se creará el restaurante en la base de datos y se enviará una <strong>Invitación Oficial</strong> al correo del dueño para que establezca su propia contraseña segura.
                              </div>

                              {activationError && (
                                <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#FCA5A5', padding: '8px 12px', borderRadius: '8px', fontSize: '0.78rem', marginBottom: '10px', fontWeight: 600 }}>
                                  {activationError}
                                </div>
                              )}

                              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                <button
                                  className="btn btn-primary"
                                  style={{ padding: '8px 16px', fontSize: '0.82rem', fontWeight: 900, borderRadius: '10px', background: '#8B5CF6', borderColor: '#8B5CF6' }}
                                  onClick={() => handleConfirmActivation(app.id)}
                                >
                                  ⚡ Confirmar y Activar Restaurante
                                </button>
                                <button
                                  className="btn btn-outline"
                                  style={{ padding: '8px 14px', fontSize: '0.82rem', borderRadius: '10px' }}
                                  onClick={() => { setActivatingAppId(null); setActivationError(null); }}
                                >
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              className="btn btn-primary"
                              style={{ padding: '10px 18px', fontSize: '0.85rem', fontWeight: 900, borderRadius: '12px', background: 'linear-gradient(135deg, #8B5CF6, #6366F1)', border: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}
                              onClick={() => { setActivatingAppId(app.id); setActivationError(null); }}
                            >
                              <Zap size={16} />
                              <span>Activar restaurante</span>
                            </button>
                          )}
                        </div>
                      )}

                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2: RED DE RESTAURANTES & LIQUIDACIÓN BANCARIA ── */}
      {activeTab === 'settlement' && (
        <div>
          {/* KPI Cards */}
          <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', marginBottom: '1.5rem' }}>
            <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Building2 size={24} />
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Comercios Afiliados Activos</div>
                <strong style={{ fontSize: '1.4rem', color: 'white' }}>{tenants.length} Restaurantes</strong>
              </div>
            </div>

            <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--secondary-light)', color: 'var(--secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ShoppingBag size={24} />
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Liquidado a Restaurantes (97%)</div>
                <strong style={{ fontSize: '1.4rem', color: 'white' }}>${totalRestaurantPayouts.toLocaleString('es-CO')} COP</strong>
              </div>
            </div>

            <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--tertiary-light)', color: 'var(--tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <DollarSign size={24} />
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Recaudación Ética (3%)</div>
                <strong style={{ fontSize: '1.4rem', color: 'white' }}>${totalEthicalFees.toLocaleString('es-CO')} COP</strong>
              </div>
            </div>
          </div>

          <div className="grid-2" style={{ marginBottom: '1.5rem' }}>
            {/* Tenants Network Table */}
            <div className="card">
              <div className="card-header">
                <div className="card-title"><Globe size={20} /> Red de Restaurantes Activos</div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.825rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--neutral-border)', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '10px' }}>Restaurante</th>
                      <th style={{ padding: '10px' }}>Comisión</th>
                      <th style={{ padding: '10px' }}>Ventas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenants.map(tenant => {
                      const tenantOrdersCount = orders.filter(o => o.tenantId === tenant.id).length;

                      return (
                        <tr key={tenant.id} style={{ borderBottom: '1px solid var(--neutral-border)' }}>
                          <td style={{ padding: '10px', fontWeight: 700, color: 'white' }}>
                            {tenant.name}
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                              /r/{tenant.slug}
                            </div>
                          </td>
                          <td style={{ padding: '10px', color: 'var(--secondary)', fontWeight: 700 }}>
                            {(tenant.commissionRate * 100).toFixed(1)}%
                          </td>
                          <td style={{ padding: '10px', color: 'white' }}>
                            {tenantOrdersCount} pedidos
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Transactions & Settlement Split Log Table */}
            <div className="card">
              <div className="card-header">
                <div className="card-title"><CreditCard size={20} /> Historial de Liquidaciones Bancarias</div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.825rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--neutral-border)', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '10px' }}>ID Transacción</th>
                      <th style={{ padding: '10px' }}>Método</th>
                      <th style={{ padding: '10px' }}>Monto Total</th>
                      <th style={{ padding: '10px' }}>Restaurante (97%)</th>
                      <th style={{ padding: '10px' }}>GastroSync (3%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map(tx => {
                      const methodEmoji = tx.paymentMethod === 'apple_pay' ? '🍏 Apple Pay' : tx.paymentMethod === 'google_pay' ? '🌐 GPay' : tx.paymentMethod === 'card' ? '💳 Tarjeta' : '📱 Wompi';

                      return (
                        <tr key={tx.id} style={{ borderBottom: '1px solid var(--neutral-border)' }}>
                          <td style={{ padding: '10px' }}>
                            <code style={{ color: 'var(--tertiary)', fontSize: '0.75rem' }}>{tx.id}</code>
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Auth: #{tx.authorizationCode}</div>
                          </td>
                          <td style={{ padding: '10px', color: 'white', fontWeight: 600 }}>{methodEmoji}</td>
                          <td style={{ padding: '10px', fontWeight: 700, color: 'white' }}>${tx.amount.toLocaleString('es-CO')}</td>
                          <td style={{ padding: '10px', color: 'var(--secondary)', fontWeight: 700 }}>${tx.restaurantPayout.toLocaleString('es-CO')}</td>
                          <td style={{ padding: '10px', color: 'var(--tertiary)', fontWeight: 700 }}>${tx.platformFee.toLocaleString('es-CO')}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Activation Success Confirmation Modal */}
      {activationSuccessInfo && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ background: '#0F172A', border: '1px solid rgba(16, 185, 129, 0.4)', borderRadius: '24px', padding: '2rem', maxWidth: '500px', width: '100%', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '16px', background: 'rgba(16, 185, 129, 0.2)', color: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
              <CheckCircle size={28} />
            </div>
            <h3 style={{ fontSize: '1.4rem', fontWeight: 900, color: 'white', margin: '0 0 8px' }}>
              🎉 Restaurante activado con éxito
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', lineHeight: 1.5, marginBottom: '1.25rem' }}>
              El restaurante <strong style={{ color: 'white' }}>{activationSuccessInfo.restaurantName}</strong> ya está registrado en la plataforma GastroSync.
            </p>
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '1rem', marginBottom: '1.5rem', fontSize: '0.82rem', lineHeight: 1.6 }}>
              <div style={{ marginBottom: '4px' }}>👤 Correo del dueño: <code style={{ color: '#38BDF8' }}>{activationSuccessInfo.ownerEmail}</code></div>
              <div style={{ marginBottom: '4px' }}>🏬 ID de Restaurante: <code style={{ color: 'white' }}>{activationSuccessInfo.tenantId}</code></div>
              <div>🔒 Estado inicial: <span style={{ color: '#F59E0B', fontWeight: 700 }}>Cerrado temporalmente (0 productos)</span></div>
            </div>
            <button
              className="btn btn-primary"
              style={{ width: '100%', padding: '12px', fontWeight: 800, borderRadius: '12px' }}
              onClick={() => setActivationSuccessInfo(null)}
            >
              Entendido
            </button>
          </motion.div>
        </div>
      )}
    </div>
  );
};
