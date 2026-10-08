import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useApp } from '../context/useApp';
import {
  BarChart3,
  Calendar,
  AlertCircle,
  RefreshCw,
  Info,
  DollarSign,
  Wallet,
  Percent,
  TrendingUp,
  TrendingDown,
  Clock,
  XCircle,
  Sparkles
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

const MetricCard = ({
  title,
  value,
  icon,
  color,
  tooltip
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  tooltip?: string;
}) => (
  <div
    className="pam-section"
    style={{
      padding: '1.1rem 1.2rem',
      gap: '6px',
      position: 'relative',
      overflow: 'hidden'
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <span
        style={{
          width: '32px',
          height: '32px',
          borderRadius: '10px',
          background: `${color}18`,
          color,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}
      >
        {icon}
      </span>
      <h4 style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 700 }}>
        {title}
      </h4>
    </div>
    <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--text-main)', marginTop: '2px' }}>
      {value}
    </div>
    {tooltip && (
      <p style={{ fontSize: '0.73rem', color: 'var(--text-muted)', margin: '2px 0 0', lineHeight: 1.4 }}>
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
        const localOrders = orders.filter(
          (o: import('../types').Order) =>
            o.tenantId === tenantId &&
            o.createdAt >= queryStart.getTime() &&
            o.createdAt <= queryEnd.getTime()
        );

        const m: FinancialMetrics = {
          grossSales: 0,
          netRestaurant: 0,
          platformCommission: 0,
          paidOrdersCount: 0,
          pendingOrdersCount: 0,
          cancelledOrdersCount: 0,
          refunds: 0,
          savingsVs30: 0,
          deliveryFees: 0
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
            m.netRestaurant += o.total - fee;
            m.savingsVs30 += o.total * 0.3 - fee;
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
            grossSales: 0,
            netRestaurant: 0,
            platformCommission: 0,
            paidOrdersCount: 0,
            pendingOrdersCount: 0,
            cancelledOrdersCount: 0,
            refunds: 0,
            savingsVs30: 0,
            deliveryFees: 0
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
    // eslint-disable-next-line react/set-state-in-effect
    fetchMetrics();
  }, [fetchMetrics]);

  return (
    <div className="rpa-card">
      <div className="rpa-card-header">
        <div className="rpa-card-header-left">
          <div className="rpa-card-icon">
            <BarChart3 size={22} />
          </div>
          <div>
            <span className="pam-eyebrow" style={{ color: 'var(--primary)', marginBottom: '2px' }}>
              <Sparkles size={11} style={{ display: 'inline', verticalAlign: 'middle' }} /> Reporte Financiero y Comisiones
            </span>
            <h3 className="rpa-card-title">Analítica Financiera Segura</h3>
            <p className="rpa-card-subtitle">
              Transparencia total en tus ventas, liquidación neta y ahorro con comisión ética del 3%.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="pam-input-wrap" style={{ minWidth: '190px' }}>
            <Calendar size={15} className="pam-icon" />
            <select
              value={period}
              onChange={e => setPeriod(e.target.value as Period)}
              className="pam-input"
              style={{ paddingTop: '8px', paddingBottom: '8px' }}
            >
              <option value="today">Hoy</option>
              <option value="last_7_days">Últimos 7 días</option>
              <option value="this_month">Este mes</option>
              <option value="last_month">Mes anterior</option>
              <option value="custom">Rango personalizado</option>
            </select>
          </div>

          {period === 'custom' && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="date"
                className="pam-input no-icon"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                style={{ padding: '7px 10px' }}
              />
              <input
                type="date"
                className="pam-input no-icon"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                style={{ padding: '7px 10px' }}
              />
            </div>
          )}

          <button
            type="button"
            className="rpa-icon-btn"
            onClick={fetchMetrics}
            disabled={loading}
            title="Actualizar métricas"
          >
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      <div className="rpa-card-body">
        {error && (
          <div className="pam-callout error">
            <AlertCircle size={18} />
            <div>
              <strong>No se pudo cargar el resumen financiero</strong>
              <div>{error}</div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="pam-section" style={{ alignItems: 'center', textAlign: 'center', padding: '2.5rem' }}>
            <RefreshCw size={28} className="spin" style={{ color: 'var(--primary)' }} />
            <p style={{ color: 'var(--text-muted)', margin: 0 }}>Calculando métricas de forma segura...</p>
          </div>
        ) : metrics ? (
          metrics.paidOrdersCount === 0 &&
          metrics.pendingOrdersCount === 0 &&
          metrics.cancelledOrdersCount === 0 ? (
            <div className="pam-section" style={{ alignItems: 'center', textAlign: 'center', padding: '2.5rem 1.5rem' }}>
              <Info size={36} style={{ color: 'var(--primary)', opacity: 0.6 }} />
              <h4 style={{ color: 'var(--text-main)', fontSize: '1.05rem', margin: '6px 0 2px', fontWeight: 800 }}>
                No hay ventas registradas en este periodo
              </h4>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.84rem', margin: 0 }}>
                Prueba seleccionando otro rango de fechas o publica un nuevo plato en el feed.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '12px' }}>
                <MetricCard
                  title="Ventas Brutas Aprobadas"
                  value={`$${metrics.grossSales.toLocaleString('es-CO')}`}
                  icon={<DollarSign size={18} />}
                  color="#0284C7"
                  tooltip="Suma total de los pedidos con pago aprobado."
                />
                <MetricCard
                  title="Neto Estimado del Restaurante"
                  value={`$${metrics.netRestaurant.toLocaleString('es-CO')}`}
                  icon={<Wallet size={18} />}
                  color="#059669"
                  tooltip="Ventas brutas menos la comisión ética de plataforma (3%)."
                />
                <MetricCard
                  title="Comisión GastroSync (3%)"
                  value={`$${metrics.platformCommission.toLocaleString('es-CO')}`}
                  icon={<Percent size={18} />}
                  color="#D97706"
                  tooltip="Tarifa ética aplicada únicamente sobre pedidos completados."
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px' }}>
                <MetricCard
                  title="Pedidos Pagados"
                  value={metrics.paidOrdersCount}
                  icon={<TrendingUp size={18} />}
                  color="#059669"
                />
                <MetricCard
                  title="Pedidos Pendientes"
                  value={metrics.pendingOrdersCount}
                  icon={<Clock size={18} />}
                  color="#D97706"
                  tooltip="Órdenes en curso o pendientes de confirmación."
                />
                <MetricCard
                  title="Pedidos Cancelados"
                  value={metrics.cancelledOrdersCount}
                  icon={<XCircle size={18} />}
                  color="#DC2626"
                />
                <MetricCard
                  title="Reembolsos / Cancelados"
                  value={`$${metrics.refunds.toLocaleString('es-CO')}`}
                  icon={<TrendingDown size={18} />}
                  color="#DC2626"
                />
              </div>

              {/* Savings Banner */}
              <div
                className="urm-hero-card"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '16px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '14px',
                      background: 'rgba(16, 185, 129, 0.2)',
                      border: '1px solid rgba(16, 185, 129, 0.4)',
                      color: '#34D399',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}
                  >
                    <TrendingUp size={24} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, color: '#FFFFFF', fontSize: '1.05rem', fontWeight: 800 }}>
                      Ahorro frente a apps tradicionales (30% de comisión)
                    </h4>
                    <p style={{ margin: '3px 0 0', color: 'rgba(255,255,255,0.75)', fontSize: '0.82rem' }}>
                      En una plataforma tradicional habrías pagado ${(metrics.grossSales * 0.3).toLocaleString('es-CO')} COP.
                    </p>
                  </div>
                </div>
                <div style={{ fontSize: '1.65rem', fontWeight: 900, color: '#34D399' }}>
                  +${metrics.savingsVs30.toLocaleString('es-CO')} COP
                </div>
              </div>
            </div>
          )
        ) : null}
      </div>
    </div>
  );
};
