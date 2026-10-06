import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { QrCode, Plus, Edit2, Trash2, Power, Download, Copy, CheckCircle, AlertCircle } from 'lucide-react';
import { fetchRestaurantTables, createRestaurantTable, updateRestaurantTable, archiveRestaurantTable, regenerateTableToken } from '../services/supabaseDataService';
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
    if (!formData.tableNumber) return;

    setIsSubmitting(true);
    const capacityNum = formData.capacity ? parseInt(formData.capacity) : undefined;
    
    if (editingId) {
      const res = await updateRestaurantTable(editingId, {
        tableNumber: formData.tableNumber,
        displayName: formData.displayName || undefined,
        capacity: capacityNum
      });
      if (!res.success) setError(res.error || 'Error al actualizar la mesa');
    } else {
      const res = await createRestaurantTable({
        restaurantId: tenant.id,
        tableNumber: formData.tableNumber,
        displayName: formData.displayName || undefined,
        capacity: capacityNum
      });
      if (!res.success) setError(res.error || 'Error al crear la mesa');
    }

    setIsSubmitting(false);
    if (!error) {
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
    if (confirm('¿Estás seguro de que deseas eliminar esta mesa? Los pedidos anteriores se conservarán.')) {
      await archiveRestaurantTable(id);
      loadTables();
    }
  };

  const handleRegenerate = async (id: string) => {
    if (confirm('¿Regenerar el QR? El código QR anterior quedará invalidado y dejará de funcionar inmediatamente.')) {
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

  return (
    <div className="card" style={{ background: 'var(--glass-medium)', backdropFilter: 'blur(20px)', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div className="card-title" style={{ color: 'white', fontWeight: 900 }}>
          <QrCode size={22} style={{ color: 'var(--primary)' }} /> QR de Mesas
        </div>
        <button className="btn btn-primary" style={{ padding: '8px 14px', fontSize: '0.85rem' }} onClick={() => { setShowForm(!showForm); setEditingId(null); setFormData({ tableNumber: '', displayName: '', capacity: '' }); }}>
          {showForm ? 'Cancelar' : <><Plus size={16} /> Nueva Mesa</>}
        </button>
      </div>

      {error && (
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#EF4444', padding: '12px', borderRadius: '12px', marginBottom: '1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} style={{ background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: '16px', marginBottom: '1.5rem' }}>
          <h4 style={{ color: 'white', marginBottom: '1rem' }}>{editingId ? 'Editar Mesa' : 'Agregar Mesa'}</h4>
          <div className="grid-2" style={{ gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Número de Mesa *</label>
              <input type="text" value={formData.tableNumber} onChange={e => setFormData({ ...formData, tableNumber: e.target.value })} required style={{ width: '100%' }} placeholder="Ej: 4" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Nombre / Alias (Opcional)</label>
              <input type="text" value={formData.displayName} onChange={e => setFormData({ ...formData, displayName: e.target.value })} style={{ width: '100%' }} placeholder="Ej: Terraza 1" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Capacidad (Opcional)</label>
              <input type="number" min="1" value={formData.capacity} onChange={e => setFormData({ ...formData, capacity: e.target.value })} style={{ width: '100%' }} placeholder="Personas" />
            </div>
          </div>
          <button type="submit" className="btn btn-secondary" disabled={isSubmitting}>
            {isSubmitting ? 'Guardando...' : 'Guardar Mesa'}
          </button>
        </form>
      )}

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Cargando mesas...</div>
      ) : tables.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.02)', borderRadius: '16px' }}>
          <QrCode size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
          <p>No tienes mesas registradas. Crea tu primera mesa para generar el código QR.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
          {tables.map(table => {
            const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(getQRUrl(table.publicToken))}`;
            
            return (
              <motion.div key={table.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '20px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ display: 'flex', padding: '1.25rem', gap: '1rem', alignItems: 'center' }}>
                  <img src={qrImageUrl} alt="QR" style={{ width: '100px', height: '100px', borderRadius: '12px', background: 'white', padding: '6px' }} />
                  
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <h4 style={{ color: 'white', fontSize: '1.2rem', margin: '0 0 4px', fontWeight: 900 }}>Mesa #{table.tableNumber}</h4>
                      <span className={`badge ${table.isActive ? 'badge-primary' : ''}`} style={{ fontSize: '0.7rem', opacity: table.isActive ? 1 : 0.5, background: table.isActive ? '' : '#4B5563' }}>
                        {table.isActive ? 'Activa' : 'Inactiva'}
                      </span>
                    </div>
                    {table.displayName && <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0 0 4px' }}>{table.displayName}</p>}
                    {table.capacity && <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 8px' }}><small>Capacidad: {table.capacity} pax</small></p>}
                    
                    <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                      <button onClick={() => downloadQR(table.publicToken)} title="Descargar PNG" style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', padding: '6px', borderRadius: '8px', cursor: 'pointer' }}>
                        <Download size={14} />
                      </button>
                      <button onClick={() => copyUrl(table.publicToken, table.id)} title="Copiar URL" style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', padding: '6px', borderRadius: '8px', cursor: 'pointer' }}>
                        {copiedId === table.id ? <CheckCircle size={14} color="#10B981" /> : <Copy size={14} />}
                      </button>
                      <button onClick={() => handleRegenerate(table.id)} title="Regenerar QR" style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', padding: '6px', borderRadius: '8px', cursor: 'pointer' }}>
                        <QrCode size={14} />
                      </button>
                    </div>
                  </div>
                </div>
                
                <div style={{ display: 'flex', borderTop: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.2)' }}>
                  <button onClick={() => handleEdit(table)} style={{ flex: 1, padding: '10px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '0.8rem' }}>
                    <Edit2 size={14} /> Editar
                  </button>
                  <button onClick={() => handleToggleActive(table)} style={{ flex: 1, padding: '10px', background: 'transparent', border: 'none', borderLeft: '1px solid rgba(255,255,255,0.08)', borderRight: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '0.8rem' }}>
                    <Power size={14} color={table.isActive ? '#EF4444' : '#10B981'} /> {table.isActive ? 'Desactivar' : 'Activar'}
                  </button>
                  <button onClick={() => handleArchive(table.id)} style={{ flex: 1, padding: '10px', background: 'transparent', border: 'none', color: '#EF4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '0.8rem' }}>
                    <Trash2 size={14} /> Eliminar
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};
