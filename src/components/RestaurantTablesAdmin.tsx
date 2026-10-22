import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  QrCode,
  Plus,
  Edit2,
  Trash2,
  Power,
  Download,
  Copy,
  CheckCircle,
  AlertCircle,
  Check,
  Users,
  Hash,
  MapPin,
  X,
  Save,
  Printer,
  RefreshCw
} from 'lucide-react';
import {
  fetchRestaurantTables,
  createRestaurantTable,
  updateRestaurantTable,
  archiveRestaurantTable,
  regenerateTableToken
} from '../services/supabaseDataService';
import type { RestaurantTable, Tenant } from '../types';

interface Props {
  tenant: Tenant;
}

interface ConfirmState {
  isOpen: boolean;
  type: 'archive' | 'regenerate';
  table: RestaurantTable | null;
  title: string;
  description: string;
  confirmLabel: string;
  isDestructive: boolean;
}

export const RestaurantTablesAdmin: React.FC<Props> = ({ tenant }) => {
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ tableNumber: '', displayName: '', capacity: '' });

  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Confirmation modal state
  const [confirmDialog, setConfirmDialog] = useState<ConfirmState>({
    isOpen: false,
    type: 'archive',
    table: null,
    title: '',
    description: '',
    confirmLabel: '',
    isDestructive: false
  });

  // Printable Tent Card Modal
  const [printingTable, setPrintingTable] = useState<RestaurantTable | null>(null);

  const loadTables = useCallback(async () => {
    const data = await fetchRestaurantTables(tenant.id);
    setTables(data);
    setIsLoading(false);
  }, [tenant.id]);

  useEffect(() => {
    let active = true;
    void fetchRestaurantTables(tenant.id).then((data) => {
      if (!active) return;
      setTables(data);
      setIsLoading(false);
    });
    return () => {
      active = false;
    };
  }, [tenant.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!formData.tableNumber.trim()) {
      setError('El número o identificador de la mesa es obligatorio.');
      return;
    }

    setIsSubmitting(true);
    const capacityNum = formData.capacity ? parseInt(formData.capacity) : undefined;
    let hadError = false;

    if (editingId) {
      const res = await updateRestaurantTable(editingId, {
        tableNumber: formData.tableNumber.trim(),
        displayName: formData.displayName.trim() || undefined,
        capacity: capacityNum
      });
      if (!res.success) {
        setError(res.error || 'Error al actualizar la mesa');
        hadError = true;
      }
    } else {
      const res = await createRestaurantTable({
        restaurantId: tenant.id,
        tableNumber: formData.tableNumber.trim(),
        displayName: formData.displayName.trim() || undefined,
        capacity: capacityNum
      });
      if (!res.success) {
        setError(res.error || 'Error al crear la mesa');
        hadError = true;
      }
    }

    setIsSubmitting(false);
    if (!hadError) {
      setShowForm(false);
      setEditingId(null);
      setFormData({ tableNumber: '', displayName: '', capacity: '' });
      loadTables();
    }
  };

  const handleEdit = (table: RestaurantTable) => {
    setFormData({
      tableNumber: table.tableNumber,
      displayName: table.displayName || '',
      capacity: table.capacity ? table.capacity.toString() : ''
    });
    setEditingId(table.id);
    setShowForm(true);
  };

  const handleToggleActive = async (table: RestaurantTable) => {
    await updateRestaurantTable(table.id, { isActive: !table.isActive });
    loadTables();
  };

  const openArchiveConfirm = (table: RestaurantTable) => {
    setConfirmDialog({
      isOpen: true,
      type: 'archive',
      table,
      title: 'Eliminar Mesa',
      description: `¿Estás seguro de que deseas eliminar la Mesa #${table.tableNumber}? Los pedidos anteriores se conservarán intactos.`,
      confirmLabel: 'Sí, eliminar mesa',
      isDestructive: true
    });
  };

  const openRegenerateConfirm = (table: RestaurantTable) => {
    setConfirmDialog({
      isOpen: true,
      type: 'regenerate',
      table,
      title: 'Regenerar Código QR',
      description: `¿Regenerar el código QR de la Mesa #${table.tableNumber}? El código QR actual impreso dejará de funcionar inmediatamente.`,
      confirmLabel: 'Regenerar nuevo QR',
      isDestructive: true
    });
  };

  const executeConfirmedAction = async () => {
    const { type, table } = confirmDialog;
    if (!table) return;

    setConfirmDialog(prev => ({ ...prev, isOpen: false }));

    if (type === 'archive') {
      await archiveRestaurantTable(table.id);
      loadTables();
    } else if (type === 'regenerate') {
      await regenerateTableToken(table.id);
      loadTables();
    }
  };

  const getQRUrl = (token: string) => {
    const baseUrl = window.location.origin;
    return `${baseUrl}/mesa/${token}`;
  };

  const copyUrl = (token: string, id: string) => {
    navigator.clipboard.writeText(getQRUrl(token));
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const downloadQR = (token: string) => {
    const url = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(getQRUrl(token))}`;
    window.open(url, '_blank');
  };

  const stepDone = Boolean(formData.tableNumber.trim());

  // Metrics
  const metrics = useMemo(() => {
    const total = tables.length;
    const active = tables.filter(t => t.isActive).length;
    const totalPax = tables.reduce((acc, t) => acc + (t.capacity || 0), 0);
    return { total, active, totalPax };
  }, [tables]);

  return (
    <div className="rpa-card">
      <div className="rpa-card-header">
        <div className="rpa-card-header-left">
          <div className="rpa-card-icon">
            <QrCode size={22} />
          </div>
          <div>
            <h3 className="rpa-card-title">Mesas y Códigos QR ({tables.length})</h3>
            <p className="rpa-card-subtitle">
              Tus comensales escanean el código en su mesa y ordenan directo a cocina sin esperas ni fricción.
            </p>
          </div>
        </div>

        <button
          type="button"
          className={showForm ? 'pam-btn-ghost' : 'pam-btn-primary'}
          onClick={() => {
            setShowForm(!showForm);
            setEditingId(null);
            setError(null);
            setFormData({ tableNumber: '', displayName: '', capacity: '' });
          }}
        >
          {showForm ? (
            <>
              <X size={16} /> Cerrar Formulario
            </>
          ) : (
            <>
              <Plus size={16} /> Registrar Mesa
            </>
          )}
        </button>
      </div>

      <div className="rpa-card-body">
        {/* Metric Badges */}
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
              Mesas Configuradas
            </span>
            <strong style={{ fontSize: '1.4rem', color: 'var(--text-main)', fontWeight: 900, display: 'block', marginTop: '2px' }}>
              {metrics.total}
            </strong>
          </div>

          <div className="pam-section" style={{ padding: '12px 14px', margin: 0 }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
              Mesas Habilitadas
            </span>
            <strong style={{ fontSize: '1.4rem', color: '#059669', fontWeight: 900, display: 'block', marginTop: '2px' }}>
              {metrics.active}
            </strong>
          </div>

          <div className="pam-section" style={{ padding: '12px 14px', margin: 0 }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
              Capacidad Total Salón
            </span>
            <strong style={{ fontSize: '1.4rem', color: 'var(--primary)', fontWeight: 900, display: 'block', marginTop: '2px' }}>
              {metrics.totalPax > 0 ? `${metrics.totalPax} personas` : 'Sin registrar'}
            </strong>
          </div>
        </div>

        {error && (
          <div className="pam-callout error" style={{ marginBottom: '12px' }}>
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {/* Create / Edit Form */}
        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              style={{ marginBottom: '1.25rem' }}
            >
              <form onSubmit={handleSubmit} noValidate>
                <section className="pam-section">
                  <div className="pam-section-head">
                    <div className={`pam-step ${stepDone ? 'done' : ''}`}>
                      {stepDone ? <Check size={15} strokeWidth={3} /> : 1}
                    </div>
                    <div>
                      <h4>{editingId ? 'Editar Mesa' : 'Registrar Nueva Mesa con QR'}</h4>
                      <p>Se generará automáticamente un enlace y código QR único para esta mesa.</p>
                    </div>
                  </div>

                  <div className="pam-grid">
                    <div className="pam-field">
                      <label>
                        Número o Identificador de Mesa <em>*</em>
                      </label>
                      <div className="pam-input-wrap">
                        <Hash size={16} className="pam-icon" />
                        <input
                          type="text"
                          className="pam-input"
                          value={formData.tableNumber}
                          onChange={e => setFormData({ ...formData, tableNumber: e.target.value })}
                          placeholder="Ej. 4 o VIP-1"
                          required
                        />
                      </div>
                    </div>

                    <div className="pam-field">
                      <label>
                        Capacidad <span className="pam-opt">Personas</span>
                      </label>
                      <div className="pam-input-wrap">
                        <Users size={16} className="pam-icon" />
                        <input
                          type="number"
                          min="1"
                          className="pam-input with-suffix"
                          value={formData.capacity}
                          onChange={e => setFormData({ ...formData, capacity: e.target.value })}
                          placeholder="4"
                        />
                        <span className="pam-suffix">pax</span>
                      </div>
                    </div>

                    <div className="pam-field pam-span-2">
                      <label>
                        Ubicación o Alias de la Mesa <span className="pam-opt">Opcional</span>
                      </label>
                      <div className="pam-input-wrap">
                        <MapPin size={16} className="pam-icon" />
                        <input
                          type="text"
                          className="pam-input"
                          value={formData.displayName}
                          onChange={e => setFormData({ ...formData, displayName: e.target.value })}
                          placeholder="Ej. Terraza Exterior, Salón Principal, Barra..."
                        />
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button
                      type="button"
                      className="pam-btn-ghost"
                      onClick={() => setShowForm(false)}
                    >
                      Cancelar
                    </button>
                    <button type="submit" className="pam-btn-primary" disabled={isSubmitting}>
                      <Save size={16} />
                      <span>{isSubmitting ? 'Guardando...' : editingId ? 'Actualizar Mesa' : 'Crear Mesa QR'}</span>
                    </button>
                  </div>
                </section>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        {isLoading ? (
          <div className="pam-section" style={{ alignItems: 'center', textAlign: 'center', padding: '2rem' }}>
            <RefreshCw size={24} className="spin" style={{ color: 'var(--primary)', marginBottom: '6px' }} />
            <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.85rem' }}>Cargando mesas configuradas...</p>
          </div>
        ) : tables.length === 0 ? (
          <div className="pam-section" style={{ alignItems: 'center', textAlign: 'center', padding: '2.5rem 1.5rem' }}>
            <QrCode size={42} style={{ color: 'var(--primary)', opacity: 0.55 }} />
            <h4 style={{ margin: '6px 0 2px', color: 'var(--text-main)', fontWeight: 800 }}>
              No tienes mesas registradas todavía
            </h4>
            <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-muted)' }}>
              Crea tu primera mesa arriba para descargar el código QR listo para imprimir.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
            {tables.map(table => {
              const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(getQRUrl(table.publicToken))}`;

              return (
                <div
                  key={table.id}
                  className="pam-section"
                  style={{ padding: '1.1rem', gap: '12px', justifyContent: 'space-between', margin: 0 }}
                >
                  <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                    <img
                      src={qrImageUrl}
                      alt={`QR Mesa ${table.tableNumber}`}
                      style={{
                        width: '88px',
                        height: '88px',
                        borderRadius: '12px',
                        background: '#FFFFFF',
                        padding: '6px',
                        border: '1px solid var(--neutral-border)',
                        flexShrink: 0
                      }}
                    />

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                        <strong style={{ fontSize: '1.08rem', fontWeight: 900, color: 'var(--text-main)' }}>
                          Mesa #{table.tableNumber}
                        </strong>
                        <span className={`rpa-badge ${table.isActive ? 'success' : 'neutral'}`}>
                          {table.isActive ? 'Activa' : 'Pausada'}
                        </span>
                      </div>

                      {table.displayName && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                          📍 {table.displayName}
                        </div>
                      )}
                      {table.capacity && (
                        <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                          👥 {table.capacity} personas
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                        <button
                          type="button"
                          className="rpa-icon-btn"
                          onClick={() => setPrintingTable(table)}
                          title="Ver tarjeta imprimible para mesa"
                        >
                          <Printer size={14} />
                        </button>
                        <button
                          type="button"
                          className="rpa-icon-btn"
                          onClick={() => downloadQR(table.publicToken)}
                          title="Descargar imagen QR"
                        >
                          <Download size={14} />
                        </button>
                        <button
                          type="button"
                          className="rpa-icon-btn"
                          onClick={() => copyUrl(table.publicToken, table.id)}
                          title="Copiar enlace directo"
                        >
                          {copiedId === table.id ? (
                            <CheckCircle size={14} color="#059669" />
                          ) : (
                            <Copy size={14} />
                          )}
                        </button>
                        <button
                          type="button"
                          className="rpa-icon-btn"
                          onClick={() => openRegenerateConfirm(table)}
                          title="Regenerar token QR"
                        >
                          <RefreshCw size={14} />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      gap: '6px',
                      paddingTop: '10px',
                      borderTop: '1px solid var(--neutral-border)'
                    }}
                  >
                    <button
                      type="button"
                      className="pam-chip"
                      style={{ flex: 1, justifyContent: 'center', padding: '6px 8px', fontSize: '0.75rem' }}
                      onClick={() => handleEdit(table)}
                    >
                      <Edit2 size={13} /> Editar
                    </button>
                    <button
                      type="button"
                      className="pam-chip"
                      style={{ flex: 1, justifyContent: 'center', padding: '6px 8px', fontSize: '0.75rem' }}
                      onClick={() => handleToggleActive(table)}
                    >
                      <Power size={13} color={table.isActive ? '#D97706' : '#059669'} />
                      {table.isActive ? 'Pausar' : 'Activar'}
                    </button>
                    <button
                      type="button"
                      className="rpa-icon-btn danger"
                      onClick={() => openArchiveConfirm(table)}
                      title="Eliminar mesa"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* PRINTABLE QR TENT CARD MODAL */}
        <AnimatePresence>
          {printingTable && (
            <div className="gs-modal-backdrop" onClick={() => setPrintingTable(null)}>
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="gs-modal-card gs-printable-sheet"
                onClick={e => e.stopPropagation()}
                style={{ maxWidth: '440px' }}
              >
                <div className="gs-modal-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Printer size={18} color="var(--primary)" />
                    <strong style={{ fontSize: '1rem', color: 'var(--text-main)' }}>
                      Tarjeta Imprimible para Mesa #{printingTable.tableNumber}
                    </strong>
                  </div>
                  <button
                    type="button"
                    className="rpa-icon-btn"
                    onClick={() => setPrintingTable(null)}
                    aria-label="Cerrar modal"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="gs-modal-body" style={{ background: '#F8F6F0', padding: '2rem 1.5rem' }}>
                  <div className="gs-qr-tent-preview">
                    <span style={{ fontSize: '0.78rem', letterSpacing: '2px', textTransform: 'uppercase', color: '#8B6F47', fontWeight: 800 }}>
                      {tenant.name}
                    </span>
                    <h2 style={{ fontSize: '1.65rem', fontWeight: 900, margin: '6px 0 14px', color: '#2C2520' }}>
                      Mesa #{printingTable.tableNumber}
                    </h2>

                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(getQRUrl(printingTable.publicToken))}`}
                      alt={`QR Mesa ${printingTable.tableNumber}`}
                      style={{
                        width: '160px',
                        height: '160px',
                        borderRadius: '12px',
                        padding: '8px',
                        background: '#FFFFFF',
                        border: '1px solid #EAE2D6',
                        margin: '0 auto 12px'
                      }}
                    />

                    <p style={{ margin: '0 0 6px', fontSize: '0.84rem', fontWeight: 700, color: '#2C2520' }}>
                      📱 Escanea para ver el menú y pedir
                    </p>
                    <span style={{ fontSize: '0.7rem', color: '#8B6F47' }}>
                      Powered by GastroSync
                    </span>
                  </div>
                </div>

                <div className="gs-modal-footer">
                  <button
                    type="button"
                    className="pam-btn-ghost"
                    onClick={() => setPrintingTable(null)}
                  >
                    Cerrar
                  </button>
                  <button
                    type="button"
                    className="pam-btn-primary"
                    onClick={() => window.print()}
                  >
                    <Printer size={15} />
                    <span>Imprimir Tarjeta</span>
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* CUSTOM CONFIRMATION MODAL */}
        <AnimatePresence>
          {confirmDialog.isOpen && (
            <div className="gs-modal-backdrop" onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}>
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="gs-modal-card"
                onClick={e => e.stopPropagation()}
                style={{ maxWidth: '420px' }}
              >
                <div className="gs-modal-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div className="rpa-card-icon" style={{ width: '32px', height: '32px', background: '#FEE2E2', color: '#DC2626' }}>
                      <AlertCircle size={16} />
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
                    className="pam-btn-danger"
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
