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
    return <div className="p-8 text-center text-gray-500">Cargando métricas...</div>;
  }

  if (error) {
    return <div className="p-8 text-center text-red-500">{error}</div>;
  }

  if (!metrics) return null;

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'white', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <BarChart3 size={24} style={{ color: 'var(--primary)' }} /> 
          Métricas de Soporte
        </h2>
        <div style={{ display: 'flex', gap: '16px' }}>
          <input
            type="date"
            className="form-input"
            style={{ padding: '8px', fontSize: '0.875rem' }}
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
          />
          <input
            type="date"
            className="form-input"
            style={{ padding: '8px', fontSize: '0.875rem' }}
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '24px', marginBottom: '32px' }}>
        {/* KPI 1 */}
        <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(59,130,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#60A5FA' }}>
              <Ticket size={20} />
            </div>
            <h3 style={{ color: '#94A3B8', fontWeight: 600, fontSize: '0.875rem', margin: 0 }}>Tickets Totales</h3>
          </div>
          <p style={{ fontSize: '1.875rem', fontWeight: 'bold', color: 'white', margin: 0 }}>{metrics.total_created}</p>
          <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '8px' }}>
            <span style={{ color: '#60A5FA' }}>{metrics.total_open}</span> abiertos actualmente
          </div>
        </div>

        {/* KPI 2 */}
        <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(16,185,129,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#34D399' }}>
              <CheckCircle size={20} />
            </div>
            <h3 style={{ color: '#94A3B8', fontWeight: 600, fontSize: '0.875rem', margin: 0 }}>Resueltos / Cerrados</h3>
          </div>
          <p style={{ fontSize: '1.875rem', fontWeight: 'bold', color: 'white', margin: 0 }}>{metrics.total_resolved + metrics.total_closed}</p>
          <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '8px' }}>
            Tasa de resolución: {metrics.total_created > 0 ? Math.round(((metrics.total_resolved + metrics.total_closed) / metrics.total_created) * 100) : 0}%
          </div>
        </div>

        {/* KPI 3 */}
        <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(245,158,11,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FBBF24' }}>
              <Star size={20} />
            </div>
            <h3 style={{ color: '#94A3B8', fontWeight: 600, fontSize: '0.875rem', margin: 0 }}>CSAT Promedio</h3>
          </div>
          <p style={{ fontSize: '1.875rem', fontWeight: 'bold', color: 'white', margin: 0 }}>{metrics.avg_rating.toFixed(1)} <span style={{ fontSize: '1.125rem', color: '#64748B' }}>/ 5.0</span></p>
          <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '8px' }}>
            Basado en {metrics.total_ratings} calificaciones
          </div>
        </div>

        {/* KPI 4 */}
        <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(139,92,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#A78BFA' }}>
              <Clock size={20} />
            </div>
            <h3 style={{ color: '#94A3B8', fontWeight: 600, fontSize: '0.875rem', margin: 0 }}>Tiempo de Resolución</h3>
          </div>
          <p style={{ fontSize: '1.875rem', fontWeight: 'bold', color: 'white', margin: 0 }}>
            {metrics.avg_resolution_seconds ? (metrics.avg_resolution_seconds / 3600).toFixed(1) : '-'} <span style={{ fontSize: '1.125rem', color: '#64748B' }}>hrs</span>
          </p>
          <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '8px' }}>
            1ra respuesta: {metrics.avg_first_response_seconds ? (metrics.avg_first_response_seconds / 60).toFixed(0) : '-'} minutos
          </div>
        </div>
      </div>
      
      {/* Futuro: Gráficos con Recharts, exportar CSV, etc */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '16px', padding: '32px', textAlign: 'center', color: '#94A3B8' }}>
        <p>Más analíticas detalladas y exportación de reportes próximamente.</p>
      </div>
    </div>
  );
};
