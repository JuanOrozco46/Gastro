import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useApp } from '../context/useApp';
import { 
  BarChart3, Calendar, AlertCircle, RefreshCw, Info, DollarSign, Wallet, Percent, 
  TrendingUp, TrendingDown, Clock, XCircle 
} from 'lucide-react';

export interface FinancialMetrics {
  grossSales: number;
  netRestaurant: number;
  platformCommission: number;
  paidOrdersCount: number;
  pendingOrdersCount: number;
  cancelledOrdersCount: number;
  refunds: number;
  savingsVs30: number;
  deliveryFees: number;
}

interface FinancialAnalyticsProps {
  tenantId: string;
}

type Period = 'today' | 'last_7_days' | 'this_month' | 'last_month' | 'custom';

const MetricCard = ({ title, value, icon, color, tooltip }: { title: string, value: string | number, icon: React.ReactNode, color: string, tooltip?: string }) => (
  <div style={{
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '16px', padding: '20px', position: 'relative', overflow: 'hidden'
  }}>
    <div style={{ position: 'absolute', top: '-15px', right: '-15px', opacity: 0.1, color: color }}>
      {icon}
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
      <span style={{ color: color }}>{icon}</span>
      <h4 style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 700 }}>{title}</h4>
    </div>
    <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'white' }}>
      {value}
    </div>
    {tooltip && (
      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '8px 0 0', lineHeight: 1.4 }}>
        {tooltip}
      </p>
    )}
  </div>
);

export const FinancialAnalytics: React.FC<FinancialAnalyticsProps> = ({ tenantId }) => {
  const { authMode, orders } = useApp();
  
  const [period, setPeriod] = useState<Period>('this_month');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  
  const [metrics, setMetrics] = useState<FinancialMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getPeriodDates = (p: Period) => {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    let start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

    if (p === 'last_7_days') {
      start.setDate(start.getDate() - 6);
    } else if (p === 'this_month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    } else if (p === 'last_month') {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      end.setTime(new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999).getTime());
    }
    return { start, end };
  };

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let queryStart: Date;
      let queryEnd: Date;
      
      if (period === 'custom') {
        if (!startDate || !endDate) {
          setLoading(false);
          return;
        }
        queryStart = new Date(`${startDate}T00:00:00`);
        queryEnd = new Date(`${endDate}T23:59:59.999`);
      } else {
        const dates = getPeriodDates(period);
        queryStart = dates.start;
        queryEnd = dates.end;
      }

      if (authMode === 'demo') {
        // Calculate from local orders
        const localOrders = orders.filter((o: import('../types').Order) => 
          o.tenantId === tenantId && 
          o.createdAt >= queryStart.getTime() && 
          o.createdAt <= queryEnd.getTime()
        );
        
        const m: FinancialMetrics = {
          grossSales: 0, netRestaurant: 0, platformCommission: 0,
          paidOrdersCount: 0, pendingOrdersCount: 0, cancelledOrdersCount: 0,
          refunds: 0, savingsVs30: 0, deliveryFees: 0
        };

        localOrders.forEach((o: import('../types').Order) => {
          if (o.status === 'cancelled') {
            m.cancelledOrdersCount++;
            if (o.paymentId) m.refunds += o.total; 
          } else if (o.status === 'pending') {
            m.pendingOrdersCount++;
          } else {
            m.paidOrdersCount++;
            m.grossSales += o.total;
            m.deliveryFees += o.deliveryFeeApplied || 0;
            const fee = o.total * 0.03; 
            m.platformCommission += fee;
            m.netRestaurant += (o.total - fee);
            m.savingsVs30 += ((o.total * 0.3) - fee);
          }
        });
        
        setMetrics(m);
      } else {
        if (!supabase) throw new Error('Supabase no conectado');
        const { data, error: rpcError } = await supabase.rpc('get_restaurant_financial_summary', {
          p_restaurant_id: tenantId,
          p_start_date: queryStart.toISOString(),
          p_end_date: queryEnd.toISOString()
        });
        
        if (rpcError) throw rpcError;
        
        if (data && data.length > 0) {
          const row = data[0];
          setMetrics({
            grossSales: Number(row.gross_sales || 0),
            netRestaurant: Number(row.net_restaurant || 0),
            platformCommission: Number(row.platform_commission || 0),
            paidOrdersCount: Number(row.paid_orders_count || 0),
            pendingOrdersCount: Number(row.pending_orders_count || 0),
            cancelledOrdersCount: Number(row.cancelled_orders_count || 0),
            refunds: Number(row.refunds || 0),
            savingsVs30: Number(row.savings_vs_30 || 0),
            deliveryFees: Number(row.delivery_fees || 0)
          });
        } else {
          setMetrics({
            grossSales: 0, netRestaurant: 0, platformCommission: 0,
            paidOrdersCount: 0, pendingOrdersCount: 0, cancelledOrdersCount: 0,
            refunds: 0, savingsVs30: 0, deliveryFees: 0
          });
        }
      }
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Error al cargar métricas financieras.');
    } finally {
      setLoading(false);
    }
  }, [authMode, period, startDate, endDate, tenantId, orders]);

  useEffect(() => {
    /*
     * Justificación:
     * 1. El efecto es necesario para sincronizar el estado del componente (data) con el backend de Supabase al montar o cambiar el periodo.
     * 2. No produce un bucle infinito porque 'fetchMetrics' está memoizado con useCallback y sus dependencias (period, fechas, tenant) son estables.
     * 3. No puede derivarse durante el render porque requiere una petición asíncrona a la red (RPC).
     */
    // eslint-disable-next-line react/set-state-in-effect
    fetchMetrics();
  }, [fetchMetrics]);



  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="card" style={{ background: 'var(--glass-medium)', backdropFilter: 'blur(20px)', borderColor: 'rgba(255, 255, 255, 0.1)', borderRadius: '24px', padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
          <div>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.25rem', color: 'white', fontWeight: 900 }}>
              <BarChart3 style={{ color: 'var(--primary)' }} /> Analítica Financiera Segura
            </h3>
            {authMode === 'demo' && (
              <span className="badge badge-secondary" style={{ marginTop: '8px', display: 'inline-block' }}>
                Modo Demo: Datos locales calculados de localStorage
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.3)', padding: '6px 12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
              <Calendar size={16} style={{ marginRight: '8px', color: 'var(--text-muted)' }} />
              <select 
                value={period} 
                onChange={e => setPeriod(e.target.value as Period)}
                style={{ background: 'transparent', border: 'none', color: 'white', outline: 'none', cursor: 'pointer', fontSize: '0.9rem' }}
              >
                <option value="today" style={{ color: '#000' }}>Hoy</option>
                <option value="last_7_days" style={{ color: '#000' }}>Últimos 7 días</option>
                <option value="this_month" style={{ color: '#000' }}>Este mes</option>
                <option value="last_month" style={{ color: '#000' }}>Mes anterior</option>
                <option value="custom" style={{ color: '#000' }}>Rango personalizado</option>
              </select>
            </div>
            
            {period === 'custom' && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ padding: '6px 10px', fontSize: '0.85rem' }} />
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ padding: '6px 10px', fontSize: '0.85rem' }} />
              </div>
            )}
            
            <button className="btn btn-outline" onClick={fetchMetrics} disabled={loading} style={{ padding: '8px 12px' }}>
              <RefreshCw size={16} className={loading ? 'spin' : ''} />
            </button>
          </div>
        </div>

        {error && (
          <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '16px', borderRadius: '12px', color: '#FCA5A5', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.5rem' }}>
            <AlertCircle size={20} />
            <div>
              <strong>No se pudo cargar el resumen.</strong>
              <div style={{ fontSize: '0.85rem', marginTop: '4px' }}>{error}</div>
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
            <RefreshCw size={32} className="spin" style={{ margin: '0 auto 1rem', color: 'var(--primary)' }} />
            <p>Calculando métricas de forma segura...</p>
          </div>
        ) : metrics ? (
          <>
            {metrics.paidOrdersCount === 0 && metrics.pendingOrdersCount === 0 && metrics.cancelledOrdersCount === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '16px', border: '1px dashed rgba(255,255,255,0.1)' }}>
                <Info size={40} style={{ margin: '0 auto 16px', color: 'var(--text-muted)' }} />
                <h4 style={{ color: 'white', fontSize: '1.1rem', margin: '0 0 8px' }}>No hay ventas registradas en este periodo</h4>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>Intenta seleccionando otro rango de fechas o promociona tu menú.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                
                {/* Main Metrics Row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
                  <MetricCard 
                    title="Ventas Brutas Aprobadas" 
                    value={`$${metrics.grossSales.toLocaleString('es-CO')}`} 
                    icon={<DollarSign size={24} />} 
                    color="#38BDF8"
                    tooltip="Suma total de los pedidos con pago aprobado (incluye domicilios si son del restaurante)."
                  />
                  <MetricCard 
                    title="Neto Estimado del Restaurante" 
                    value={`$${metrics.netRestaurant.toLocaleString('es-CO')}`} 
                    icon={<Wallet size={24} />} 
                    color="#10B981"
                    tooltip="Ventas brutas menos la comisión de plataforma. Pendiente de liquidación bancaria."
                  />
                  <MetricCard 
                    title="Comisión GastroSync" 
                    value={`$${metrics.platformCommission.toLocaleString('es-CO')}`} 
                    icon={<Percent size={24} />} 
                    color="#F59E0B"
                    tooltip="Cobro de la plataforma según la tarifa acordada al momento de la venta."
                  />
                </div>

                {/* Secondary Metrics Row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                  <MetricCard 
                    title="Pedidos Pagados" 
                    value={metrics.paidOrdersCount} 
                    icon={<TrendingUp size={24} />} 
                    color="#10B981"
                  />
                  <MetricCard 
                    title="Pedidos Pendientes" 
                    value={metrics.pendingOrdersCount} 
                    icon={<Clock size={24} />} 
                    color="#F59E0B"
                    tooltip="Órdenes creadas que aún no tienen pago confirmado o siguen en curso."
                  />
                  <MetricCard 
                    title="Pedidos Cancelados" 
                    value={metrics.cancelledOrdersCount} 
                    icon={<XCircle size={24} />} 
                    color="#EF4444"
                  />
                  <MetricCard 
                    title="Aprobados Cancelados" 
                    value={`$${metrics.refunds.toLocaleString('es-CO')}`} 
                    icon={<TrendingDown size={24} />} 
                    color="#EF4444"
                    tooltip="Monto de pedidos cancelados que ya tenían un pago aprobado."
                  />
                </div>

                {/* Savings Banner */}
                <div style={{ background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(5, 150, 105, 0.1))', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '16px', padding: '20px', display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
                  <div style={{ background: 'var(--primary)', color: 'white', padding: '12px', borderRadius: '50%', boxShadow: '0 4px 15px rgba(255,85,51,0.4)' }}>
                    <TrendingUp size={32} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, color: 'white', fontSize: '1.1rem', fontWeight: 900 }}>
                      Ahorro estimado frente a una comisión del 30%
                    </h4>
                    <p style={{ margin: '4px 0 0', color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem' }}>
                      En una app tradicional habrías pagado ${((metrics.grossSales) * 0.3).toLocaleString('es-CO')} en comisiones. 
                      Con GastroSync, has ahorrado este periodo:
                    </p>
                  </div>
                  <div style={{ marginLeft: 'auto', fontSize: '2rem', fontWeight: 900, color: '#10B981', textShadow: '0 2px 10px rgba(16, 185, 129, 0.2)' }}>
                    ${metrics.savingsVs30.toLocaleString('es-CO')}
                  </div>
                </div>

                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '1rem', opacity: 0.7 }}>
                  * Los valores mostrados son netamente informativos y basados en transacciones registradas. No constituyen un soporte contable final.
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
};
