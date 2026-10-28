import React, { useState, useEffect } from 'react';
import { BarChart3, Clock, CheckCircle, Ticket, Star } from 'lucide-react';
import { fetchSupportMetrics } from '../services/supportService';
import type { SupportMetrics } from '../services/supportService';

export const SupportMetricsPanel: React.FC = () => {
  const [metrics, setMetrics] = useState<SupportMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Basic filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    let isMounted = true;
    Promise.resolve().then(() => setLoading(true));
    fetchSupportMetrics({
      start_date: startDate || undefined,
      end_date: endDate || undefined,
    }).then(({ data, error }) => {
      if (!isMounted) return;
      if (error) {
        setError(error);
      } else {
        setMetrics(data);
      }
      setLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, [startDate, endDate]);

  if (loading && !metrics) {
    return <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando métricas...</div>;
  }

  if (error) {
    return <div style={{ padding: '32px', textAlign: 'center', color: 'var(--danger)' }}>{error}</div>;
  }

  if (!metrics) return null;

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
          <BarChart3 size={24} style={{ color: 'var(--primary)' }} /> 
          Métricas de Soporte
        </h2>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <input
            type="date"
            className="form-input"
            style={{ padding: '8px 12px', fontSize: '0.875rem', width: 'auto' }}
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
          />
          <input
            type="date"
            className="form-input"
            style={{ padding: '8px 12px', fontSize: '0.875rem', width: 'auto' }}
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '28px' }}>
        {/* KPI 1 */}
        <div className="card" style={{ background: 'var(--neutral-surface)', border: '1px solid var(--neutral-border)', borderRadius: 'var(--radius-lg)', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-md)', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
              <Ticket size={20} />
            </div>
            <h3 style={{ color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.875rem', margin: 0 }}>Tickets Totales</h3>
          </div>
          <p style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--text-main)', margin: 0 }}>{metrics.total_created}</p>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '8px' }}>
            <strong style={{ color: 'var(--primary)' }}>{metrics.total_open}</strong> abiertos actualmente
          </div>
        </div>

        {/* KPI 2 */}
        <div className="card" style={{ background: 'var(--neutral-surface)', border: '1px solid var(--neutral-border)', borderRadius: 'var(--radius-lg)', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-md)', background: 'var(--secondary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--secondary)' }}>
              <CheckCircle size={20} />
            </div>
            <h3 style={{ color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.875rem', margin: 0 }}>Resueltos / Cerrados</h3>
          </div>
          <p style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--text-main)', margin: 0 }}>{metrics.total_resolved + metrics.total_closed}</p>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '8px' }}>
            Tasa de resolución: <strong>{metrics.total_created > 0 ? Math.round(((metrics.total_resolved + metrics.total_closed) / metrics.total_created) * 100) : 0}%</strong>
          </div>
        </div>

        {/* KPI 3 */}
        <div className="card" style={{ background: 'var(--neutral-surface)', border: '1px solid var(--neutral-border)', borderRadius: 'var(--radius-lg)', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-md)', background: 'var(--warning-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--warning)' }}>
              <Star size={20} />
            </div>
            <h3 style={{ color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.875rem', margin: 0 }}>CSAT Promedio</h3>
          </div>
          <p style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--text-main)', margin: 0 }}>
            {Number(metrics.avg_rating ?? 0).toFixed(1)} <span style={{ fontSize: '1.05rem', color: 'var(--text-muted)', fontWeight: 600 }}>/ 5.0</span>
          </p>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '8px' }}>
            Basado en {metrics.total_ratings} calificaciones
          </div>
        </div>

        {/* KPI 4 */}
        <div className="card" style={{ background: 'var(--neutral-surface)', border: '1px solid var(--neutral-border)', borderRadius: 'var(--radius-lg)', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-md)', background: 'var(--tertiary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tertiary)' }}>
              <Clock size={20} />
            </div>
            <h3 style={{ color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.875rem', margin: 0 }}>Tiempo de Resolución</h3>
          </div>
          <p style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--text-main)', margin: 0 }}>
            {metrics.avg_resolution_seconds ? (metrics.avg_resolution_seconds / 3600).toFixed(1) : '-'} <span style={{ fontSize: '1.05rem', color: 'var(--text-muted)', fontWeight: 600 }}>hrs</span>
          </p>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '8px' }}>
            1ra respuesta: {metrics.avg_first_response_seconds ? (metrics.avg_first_response_seconds / 60).toFixed(0) : '-'} minutos
          </div>
        </div>
      </div>
      
      {/* Futuro: Gráficos con Recharts, exportar CSV, etc */}
      <div style={{ background: 'var(--neutral-surface-alt)', border: '1px dashed var(--neutral-border-strong)', borderRadius: 'var(--radius-lg)', padding: '28px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <p style={{ margin: 0, fontWeight: 600 }}>Más analíticas detalladas y exportación de reportes próximamente.</p>
      </div>
    </div>
  );
};
