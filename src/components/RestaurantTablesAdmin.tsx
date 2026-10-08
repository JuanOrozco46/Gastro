import React, { useState, useEffect } from 'react';
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
  Sparkles,
  Check,
  Users,
  Hash,
  MapPin,
  X,
  Save
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

export const RestaurantTablesAdmin: React.FC<Props> = ({ tenant }) => {
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ tableNumber: '', displayName: '', capacity: '' });

  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadTables = async () => {
    setIsLoading(true);
    const data = await fetchRestaurantTables(tenant.id);
    setTables(data);
    setIsLoading(false);
  };

  useEffect(() => {
    loadTables();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const handleArchive = async (id: string) => {
    if (window.confirm('¿Estás seguro de que deseas eliminar esta mesa? Los pedidos anteriores se conservarán.')) {
      await archiveRestaurantTable(id);
      loadTables();
    }
  };

  const handleRegenerate = async (id: string) => {
    if (window.confirm('¿Regenerar el QR? El código QR anterior quedará invalidado y dejará de funcionar inmediatamente.')) {
      await regenerateTableToken(id);
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

  return (
    <div className="rpa-card">
      <div className="rpa-card-header">
        <div className="rpa-card-header-left">
          <div className="rpa-card-icon">
            <QrCode size={22} />
          </div>
          <div>
            <span className="pam-eyebrow" style={{ color: 'var(--primary)', marginBottom: '2px' }}>
              <Sparkles size={11} style={{ display: 'inline', verticalAlign: 'middle' }} /> Servicio en Mesa Digital
            </span>
            <h3 className="rpa-card-title">Mesas y Códigos QR ({tables.length})</h3>
            <p className="rpa-card-subtitle">
              Tus clientes escanean el QR en su mesa y ordenan directo a cocina sin esperas.
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
              <X size={16} /> Cancelar
            </>
          ) : (
            <>
              <Plus size={16} /> Nueva Mesa QR
            </>
          )}
        </button>
      </div>

      <div className="rpa-card-body">
        {error && (
          <div className="pam-callout error">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
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
                        Número de Mesa <em>*</em>
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
                        Ubicación / Alias de la Mesa <span className="pam-opt">Opcional</span>
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
            <p style={{ color: 'var(--text-muted)', margin: 0 }}>Cargando mesas configuradas...</p>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: '12px' }}>
            {tables.map(table => {
              const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(getQRUrl(table.publicToken))}`;

              return (
                <div
                  key={table.id}
                  className="pam-section"
                  style={{ padding: '1rem', gap: '12px', justifyContent: 'space-between' }}
                >
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
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
                        <strong style={{ fontSize: '1.05rem', fontWeight: 900, color: 'var(--text-main)' }}>
                          Mesa #{table.tableNumber}
                        </strong>
                        <span className={`rpa-badge ${table.isActive ? 'success' : 'neutral'}`}>
                          {table.isActive ? 'Activa' : 'Inactiva'}
                        </span>
                      </div>

                      {table.displayName && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                          📍 {table.displayName}
                        </div>
                      )}
                      {table.capacity && (
                        <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                          👥 Capacidad: {table.capacity} personas
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                        <button
                          type="button"
                          className="rpa-icon-btn"
                          onClick={() => downloadQR(table.publicToken)}
                          title="Descargar QR en alta resolución"
                        >
                          <Download size={14} />
                        </button>
                        <button
                          type="button"
                          className="rpa-icon-btn"
                          onClick={() => copyUrl(table.publicToken, table.id)}
                          title="Copiar enlace directo de la mesa"
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
                          onClick={() => handleRegenerate(table.id)}
                          title="Regenerar token QR"
                        >
                          <QrCode size={14} />
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
                      onClick={() => handleArchive(table.id)}
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
      </div>
    </div>
  );
};
