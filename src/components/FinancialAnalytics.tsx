import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useApp } from '../context/useApp';
import { getFulfillmentBadgeText } from '../utils/tenantHelpers';
import type { Order } from '../types';
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
  Sparkles,
  Download,
  ShoppingBag,
  Utensils,
  CreditCard,
  Banknote,
  CheckCircle2,
  Search
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

type Period = 'today' | 'last_7_days' | 'this_month' | 'last_month' | 'all_time' | 'custom';
type LedgerFilter = 'all' | 'completed' | 'in_progress' | 'cancelled';

const MetricCard = ({
  title,
  value,
  subValue,
  icon,
  color,
  tooltip
}: {
  title: string;
  value: string | number;
  subValue?: string;
  icon: React.ReactNode;
  color: string;
  tooltip?: string;
}) => (
  <div
    className="pam-section"
    style={{
      padding: '1.1rem 1.2rem',
      gap: '5px',
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
      <h4 style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.78rem', fontWeight: 700 }}>
        {title}
      </h4>
    </div>
    <div style={{ fontSize: '1.45rem', fontWeight: 900, color: 'var(--text-main)', marginTop: '2px' }}>
      {value}
    </div>
    {subValue && (
      <div style={{ fontSize: '0.76rem', fontWeight: 700, color }}>
        {subValue}
      </div>
    )}
    {tooltip && (
      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '2px 0 0', lineHeight: 1.35 }}>
        {tooltip}
      </p>
    )}
  </div>
);

const isOrderCompletedSale = (o: Order): boolean => {
  if (o.status === 'cancelled') return false;
  return o.status === 'delivered' || o.paymentStatus === 'approved';
};

export const FinancialAnalytics: React.FC<FinancialAnalyticsProps> = ({ tenantId }) => {
  const { authMode, orders, tenants } = useApp();

  const currentRestaurant = useMemo(
    () => tenants.find(t => t.id === tenantId),
    [tenants, tenantId]
  );
  const commissionRate = currentRestaurant?.commissionRate || 0.03;

  const [period, setPeriod] = useState<Period>('this_month');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [ledgerFilter, setLedgerFilter] = useState<LedgerFilter>('all');
  const [ledgerSearch, setLedgerSearch] = useState('');

  const [rpcMetrics, setRpcMetrics] = useState<FinancialMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getPeriodDates = useCallback((p: Period) => {
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
    } else if (p === 'all_time') {
      start = new Date(2024, 0, 1, 0, 0, 0, 0);
    }
    return { start, end };
  }, []);

  const activeRange = useMemo(() => {
    if (period === 'custom') {
      if (!startDate || !endDate) return null;
      return {
        start: new Date(`${startDate}T00:00:00`),
        end: new Date(`${endDate}T23:59:59.999`)
      };
    }
    return getPeriodDates(period);
  }, [period, startDate, endDate, getPeriodDates]);

  // Estrictamente filtrado por el restaurante asignado (tenantId) y el rango de fechas
  const restaurantPeriodOrders = useMemo(() => {
    if (!tenantId || !activeRange) return [];
    const startMs = activeRange.start.getTime();
    const endMs = activeRange.end.getTime();

    return orders
      .filter(
        o =>
          o.tenantId === tenantId &&
          o.createdAt >= startMs &&
          o.createdAt <= endMs
      )
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [orders, tenantId, activeRange]);

  // Cálculo local determinístico basado en los pedidos reales del restaurante asignado
  const computedLocalMetrics = useMemo(() => {
    let grossSales = 0;
    let netRestaurant = 0;
    let platformCommission = 0;
    let paidOrdersCount = 0;
    let pendingOrdersCount = 0;
    let inProgressSales = 0;
    let cancelledOrdersCount = 0;
    let refunds = 0;
    let savingsVs30 = 0;
    let deliveryFees = 0;

    const byChannel = {
      restaurant_delivery: { count: 0, total: 0, label: '🛵 Domicilio' },
      table_service: { count: 0, total: 0, label: '🪑 Servicio en Mesa' },
      pickup: { count: 0, total: 0, label: '🛍️ Recoger en Local' }
    };

    const byPayment = {
      cash: { count: 0, total: 0, label: '💵 Efectivo' },
      digital: { count: 0, total: 0, label: '💳 Pago Digital / Wompi' }
    };

    const dishMap = new Map<string, { name: string; qty: number; revenue: number }>();

    for (const o of restaurantPeriodOrders) {
      const fee = Math.round(o.total * commissionRate);
      const net = Math.max(0, o.total - fee);

      if (o.status === 'cancelled') {
        cancelledOrdersCount++;
        refunds += o.total;
        continue;
      }

      if (isOrderCompletedSale(o)) {
        paidOrdersCount++;
        grossSales += o.total;
        platformCommission += fee;
        netRestaurant += net;
        deliveryFees += o.deliveryFeeApplied || 0;
        savingsVs30 += Math.round(o.total * 0.3) - fee;
      } else {
        pendingOrdersCount++;
        inProgressSales += o.total;
      }

      // Desglose por canal (incluye pedidos completados y en curso no cancelados)
      const chKey =
        o.fulfillment === 'table_service'
          ? 'table_service'
          : o.fulfillment === 'pickup'
          ? 'pickup'
          : 'restaurant_delivery';
      byChannel[chKey].count++;
      byChannel[chKey].total += o.total;

      // Desglose por método de pago
      const payKey = o.paymentMethod === 'cash' ? 'cash' : 'digital';
      byPayment[payKey].count++;
      byPayment[payKey].total += o.total;

      // Top platos vendidos
      for (const item of o.items || []) {
        const prev = dishMap.get(item.name) || { name: item.name, qty: 0, revenue: 0 };
        prev.qty += item.qty;
        prev.revenue += item.qty * item.price;
        dishMap.set(item.name, prev);
      }
    }

    const topDishes = Array.from(dishMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    const inProgressCommission = Math.round(inProgressSales * commissionRate);
    const inProgressNet = Math.max(0, inProgressSales - inProgressCommission);

    return {
      grossSales,
      netRestaurant,
      platformCommission,
      paidOrdersCount,
      pendingOrdersCount,
      inProgressSales,
      inProgressNet,
      cancelledOrdersCount,
      refunds,
      savingsVs30,
      deliveryFees,
      byChannel,
      byPayment,
      topDishes
    };
  }, [restaurantPeriodOrders, commissionRate]);

  const fetchMetrics = useCallback(async () => {
    if (!activeRange || !tenantId) return;
    setLoading(true);
    setError(null);
    try {
      if (authMode === 'demo' || !supabase) {
        setRpcMetrics(null);
        return;
      }

      const { data, error: rpcError } = await supabase.rpc('get_restaurant_financial_summary', {
        p_restaurant_id: tenantId,
        p_start_date: activeRange.start.toISOString(),
        p_end_date: activeRange.end.toISOString()
      });

      if (rpcError) {
        console.warn('⚠️ RPC get_restaurant_financial_summary aviso:', rpcError.message);
        setRpcMetrics(null);
        return;
      }

      if (data && data.length > 0) {
        const row = data[0];
        setRpcMetrics({
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
        setRpcMetrics(null);
      }
    } catch (err: unknown) {
      console.warn('⚠️ Error consultando resumen financiero remoto:', err);
      setRpcMetrics(null);
    } finally {
      setLoading(false);
    }
  }, [authMode, activeRange, tenantId]);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      if (!activeRange || !tenantId) return;
      if (authMode === 'demo' || !supabase) return;
      setLoading(true);
      try {
        const { data, error: rpcError } = await supabase.rpc('get_restaurant_financial_summary', {
          p_restaurant_id: tenantId,
          p_start_date: activeRange.start.toISOString(),
          p_end_date: activeRange.end.toISOString()
        });
        if (!mounted) return;
        if (!rpcError && data && data.length > 0) {
          const row = data[0];
          setRpcMetrics({
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
        }
      } catch {
        // Fallback silencioso a las métricas calculadas desde las órdenes en vivo del restaurante
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void run();
    return () => {
      mounted = false;
    };
  }, [authMode, activeRange, tenantId, orders.length]);

  // Unificar métricas: tomamos el máximo entre el RPC y las órdenes en vivo del restaurante
  // para garantizar que ningún pedido recién procesado quede oculto.
  const finalMetrics = useMemo(() => {
    const grossSales = Math.max(computedLocalMetrics.grossSales, rpcMetrics?.grossSales || 0);
    const netRestaurant = Math.max(computedLocalMetrics.netRestaurant, rpcMetrics?.netRestaurant || 0);
    const platformCommission = Math.max(computedLocalMetrics.platformCommission, rpcMetrics?.platformCommission || 0);
    const paidOrdersCount = Math.max(computedLocalMetrics.paidOrdersCount, rpcMetrics?.paidOrdersCount || 0);
    const pendingOrdersCount = computedLocalMetrics.pendingOrdersCount;
    const cancelledOrdersCount = Math.max(computedLocalMetrics.cancelledOrdersCount, rpcMetrics?.cancelledOrdersCount || 0);
    const refunds = Math.max(computedLocalMetrics.refunds, rpcMetrics?.refunds || 0);
    const savingsVs30 = Math.max(computedLocalMetrics.savingsVs30, rpcMetrics?.savingsVs30 || 0);
    const deliveryFees = Math.max(computedLocalMetrics.deliveryFees, rpcMetrics?.deliveryFees || 0);
    const avgTicket = paidOrdersCount > 0 ? Math.round(grossSales / paidOrdersCount) : 0;

    return {
      grossSales,
      netRestaurant,
      platformCommission,
      paidOrdersCount,
      pendingOrdersCount,
      inProgressSales: computedLocalMetrics.inProgressSales,
      inProgressNet: computedLocalMetrics.inProgressNet,
      cancelledOrdersCount,
      refunds,
      savingsVs30,
      deliveryFees,
      avgTicket
    };
  }, [computedLocalMetrics, rpcMetrics]);

  const filteredLedgerOrders = useMemo(() => {
    const q = ledgerSearch.trim().toLowerCase();
    return restaurantPeriodOrders.filter(o => {
      if (ledgerFilter === 'completed' && !isOrderCompletedSale(o)) return false;
      if (ledgerFilter === 'in_progress' && (o.status === 'cancelled' || isOrderCompletedSale(o))) return false;
      if (ledgerFilter === 'cancelled' && o.status !== 'cancelled') return false;

      if (q) {
        const matchId = o.id.toLowerCase().includes(q);
        const matchCustomer = (o.customerName || '').toLowerCase().includes(q);
        const matchItem = o.items.some(i => i.name.toLowerCase().includes(q));
        return matchId || matchCustomer || matchItem;
      }
      return true;
    });
  }, [restaurantPeriodOrders, ledgerFilter, ledgerSearch]);

  const handleExportCsv = () => {
    if (restaurantPeriodOrders.length === 0) return;
    const headers = [
      'ID Pedido',
      'Fecha',
      'Cliente',
      'Canal',
      'Metodo Pago',
      'Estado Orden',
      'Estado Liquidacion',
      'Subtotal COP',
      'Domicilio COP',
      'Total Bruto COP',
      'Comision GastroSync 3% COP',
      'Neto Restaurante 97% COP'
    ];

    const rows = restaurantPeriodOrders.map(o => {
      const fee = o.status === 'cancelled' ? 0 : Math.round(o.total * commissionRate);
      const net = o.status === 'cancelled' ? 0 : Math.max(0, o.total - fee);
      const liqState =
        o.status === 'cancelled'
          ? 'Cancelado'
          : isOrderCompletedSale(o)
          ? 'Liquidado / Efectivo'
          : 'En Curso';

      return [
        o.id,
        new Date(o.createdAt).toLocaleString('es-CO'),
        `"${(o.customerName || 'Cliente').replace(/"/g, '""')}"`,
        getFulfillmentBadgeText(o.fulfillment, o.type),
        o.paymentMethod === 'cash' ? 'Efectivo' : 'Digital',
        o.status,
        liqState,
        o.subtotal || o.total,
        o.deliveryFeeApplied || 0,
        o.total,
        fee,
        net
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `finanzas_${currentRestaurant?.slug || tenantId.slice(0, 8)}_${period}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const hasAnyActivity =
    finalMetrics.paidOrdersCount > 0 ||
    finalMetrics.pendingOrdersCount > 0 ||
    finalMetrics.cancelledOrdersCount > 0 ||
    restaurantPeriodOrders.length > 0;

  const totalActiveAndCompletedCop = finalMetrics.grossSales + finalMetrics.inProgressSales;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="rpa-card">
        <div className="rpa-card-header">
          <div className="rpa-card-header-left">
            <div className="rpa-card-icon">
              <BarChart3 size={22} />
            </div>
            <div>
              <span className="pam-eyebrow" style={{ color: 'var(--primary)', marginBottom: '2px' }}>
                <Sparkles size={11} style={{ display: 'inline', verticalAlign: 'middle' }} /> Contabilidad Exclusiva ·{' '}
                {currentRestaurant?.name || 'Tu Restaurante'}
              </span>
              <h3 className="rpa-card-title">Finanzas, Ventas y Liquidación Neta</h3>
              <p className="rpa-card-subtitle">
                Datos financieros reales y aislados únicamente para <strong>{currentRestaurant?.name || 'tu local'}</strong> con comisión ética del {(commissionRate * 100).toFixed(0)}%.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="pam-input-wrap" style={{ minWidth: '185px' }}>
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
                <option value="all_time">Todo el historial</option>
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

            {restaurantPeriodOrders.length > 0 && (
              <button
                type="button"
                className="pam-btn-ghost"
                onClick={handleExportCsv}
                style={{ padding: '8px 14px', fontSize: '0.8rem' }}
                title="Descargar reporte en Excel / CSV"
              >
                <Download size={15} /> Exportar CSV
              </button>
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
                <strong>Aviso al sincronizar métricas</strong>
                <div>{error}</div>
              </div>
            </div>
          )}

          {loading && !hasAnyActivity ? (
            <div className="pam-section" style={{ alignItems: 'center', textAlign: 'center', padding: '2.5rem' }}>
              <RefreshCw size={28} className="spin" style={{ color: 'var(--primary)' }} />
              <p style={{ color: 'var(--text-muted)', margin: 0 }}>Calculando métricas financieras del restaurante...</p>
            </div>
          ) : !hasAnyActivity ? (
            <div className="pam-section" style={{ alignItems: 'center', textAlign: 'center', padding: '2.5rem 1.5rem' }}>
              <Info size={36} style={{ color: 'var(--primary)', opacity: 0.6 }} />
              <h4 style={{ color: 'var(--text-main)', fontSize: '1.05rem', margin: '6px 0 2px', fontWeight: 800 }}>
                Sin pedidos registrados en este periodo para {currentRestaurant?.name || 'este restaurante'}
              </h4>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.84rem', margin: '0 0 12px' }}>
                Prueba cambiando el filtro a «Todo el historial» o recibe tu primer pedido desde el directorio o menú QR.
              </p>
              {period !== 'all_time' && (
                <button
                  type="button"
                  className="pam-btn-ghost"
                  onClick={() => setPeriod('all_time')}
                  style={{ padding: '8px 16px', fontSize: '0.82rem' }}
                >
                  Ver todo el historial
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Alerta informativa si hay pedidos en curso en cocina */}
              {finalMetrics.pendingOrdersCount > 0 && (
                <div
                  style={{
                    background: 'rgba(245, 158, 11, 0.1)',
                    border: '1px solid rgba(245, 158, 11, 0.35)',
                    borderRadius: '14px',
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    flexWrap: 'wrap'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Clock size={18} style={{ color: '#D97706', flexShrink: 0 }} />
                    <div style={{ fontSize: '0.84rem', color: 'var(--text-main)' }}>
                      Tienes <strong>{finalMetrics.pendingOrdersCount} pedido{finalMetrics.pendingOrdersCount !== 1 ? 's' : ''} en curso</strong> por{' '}
                      <strong>${finalMetrics.inProgressSales.toLocaleString('es-CO')} COP</strong> (Neto estimado:{' '}
                      <strong>${finalMetrics.inProgressNet.toLocaleString('es-CO')} COP</strong>). Al marcarlos como{' '}
                      <strong>Entregado</strong> en el KDS, pasarán automáticamente a Ventas Efectivas.
                    </div>
                  </div>
                </div>
              )}

              {/* Fila 1: KPIs Principales de Ingresos */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                <MetricCard
                  title="Ventas Brutas Efectivas"
                  value={`$${finalMetrics.grossSales.toLocaleString('es-CO')}`}
                  subValue={
                    finalMetrics.inProgressSales > 0
                      ? `+ $${finalMetrics.inProgressSales.toLocaleString('es-CO')} en preparación`
                      : `${finalMetrics.paidOrdersCount} pedido${finalMetrics.paidOrdersCount !== 1 ? 's' : ''} completado${finalMetrics.paidOrdersCount !== 1 ? 's' : ''}`
                  }
                  icon={<DollarSign size={18} />}
                  color="#0284C7"
                  tooltip="Total recaudado en pedidos entregados o con pago confirmado."
                />
                <MetricCard
                  title="Ingreso Neto Restaurante (97%)"
                  value={`$${finalMetrics.netRestaurant.toLocaleString('es-CO')}`}
                  subValue={
                    finalMetrics.inProgressNet > 0
                      ? `+ $${finalMetrics.inProgressNet.toLocaleString('es-CO')} neto en curso`
                      : 'Libre para tu restaurante'
                  }
                  icon={<Wallet size={18} />}
                  color="#059669"
                  tooltip="Ganancia neta del restaurante después de descontar el 3% de GastroSync."
                />
                <MetricCard
                  title="Comisión Ética GastroSync (3%)"
                  value={`$${finalMetrics.platformCommission.toLocaleString('es-CO')}`}
                  subValue="Tarifa justa del 3%"
                  icon={<Percent size={18} />}
                  color="#D97706"
                  tooltip="Única comisión de plataforma sobre órdenes efectivas."
                />
                <MetricCard
                  title="Ticket Promedio"
                  value={`$${finalMetrics.avgTicket.toLocaleString('es-CO')}`}
                  subValue={
                    finalMetrics.deliveryFees > 0
                      ? `Incluye $${finalMetrics.deliveryFees.toLocaleString('es-CO')} en envíos`
                      : 'Valor promedio por orden'
                  }
                  icon={<ShoppingBag size={18} />}
                  color="#7C3AED"
                  tooltip="Gasto promedio de tus clientes por cada pedido completado."
                />
              </div>

              {/* Fila 2: Estado Operativo de Órdenes */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px' }}>
                <MetricCard
                  title="Pedidos Liquidados / Entregados"
                  value={finalMetrics.paidOrdersCount}
                  icon={<CheckCircle2 size={18} />}
                  color="#059669"
                />
                <MetricCard
                  title="Pedidos en Curso (Cocina / Ruta)"
                  value={finalMetrics.pendingOrdersCount}
                  subValue={
                    finalMetrics.inProgressSales > 0
                      ? `$${finalMetrics.inProgressSales.toLocaleString('es-CO')} COP en tránsito`
                      : undefined
                  }
                  icon={<Clock size={18} />}
                  color="#D97706"
                />
                <MetricCard
                  title="Pedidos Cancelados"
                  value={finalMetrics.cancelledOrdersCount}
                  icon={<XCircle size={18} />}
                  color="#DC2626"
                />
                <MetricCard
                  title="Valor Cancelado / Reembolsos"
                  value={`$${finalMetrics.refunds.toLocaleString('es-CO')}`}
                  icon={<TrendingDown size={18} />}
                  color="#DC2626"
                />
              </div>

              {/* Banner de Ahorro frente a Apps del 30% */}
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
                    <h4 style={{ margin: 0, color: '#FFFFFF', fontSize: '1.02rem', fontWeight: 800 }}>
                      Ahorro Real frente a Plataformas Tradicionales (30% de comisión)
                    </h4>
                    <p style={{ margin: '3px 0 0', color: 'rgba(255,255,255,0.78)', fontSize: '0.82rem' }}>
                      En apps tradicionales habrías pagado{' '}
                      <strong>${Math.round(totalActiveAndCompletedCop * 0.3).toLocaleString('es-CO')} COP</strong> en comisiones. Con GastroSync conservas el 97% de tu trabajo.
                    </p>
                  </div>
                </div>
                <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#34D399' }}>
                  +${Math.max(finalMetrics.savingsVs30, Math.round(totalActiveAndCompletedCop * 0.27)).toLocaleString('es-CO')} COP
                </div>
              </div>

              {/* Desglose por Canal, Método de Pago y Top Platos */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
                {/* Por Canal */}
                <div className="pam-section" style={{ gap: '10px' }}>
                  <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-main)' }}>
                    Distribución por Canal de Venta
                  </h4>
                  {Object.values(computedLocalMetrics.byChannel).map(ch => {
                    const pct =
                      totalActiveAndCompletedCop > 0
                        ? Math.round((ch.total / totalActiveAndCompletedCop) * 100)
                        : 0;
                    return (
                      <div key={ch.label} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                          <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>
                            {ch.label} ({ch.count})
                          </span>
                          <strong style={{ color: 'var(--text-main)' }}>
                            ${ch.total.toLocaleString('es-CO')} ({pct}%)
                          </strong>
                        </div>
                        <div style={{ height: '7px', borderRadius: '999px', background: 'rgba(148,163,184,0.18)', overflow: 'hidden' }}>
                          <div
                            style={{
                              width: `${pct}%`,
                              height: '100%',
                              borderRadius: '999px',
                              background: 'linear-gradient(90deg, #FF5533, #F59E0B)'
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Por Método de Pago */}
                <div className="pam-section" style={{ gap: '10px' }}>
                  <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-main)' }}>
                    Recaudo por Medio de Pago
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '10px 12px',
                        borderRadius: '12px',
                        background: 'var(--neutral-surface-alt)',
                        border: '1px solid var(--neutral-border)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Banknote size={18} style={{ color: '#059669' }} />
                        <div>
                          <strong style={{ fontSize: '0.83rem', color: 'var(--text-main)', display: 'block' }}>
                            Efectivo en Caja / Entrega
                          </strong>
                          <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
                            {computedLocalMetrics.byPayment.cash.count} pedido{computedLocalMetrics.byPayment.cash.count !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                      <strong style={{ fontSize: '0.95rem', color: '#059669', fontWeight: 900 }}>
                        ${computedLocalMetrics.byPayment.cash.total.toLocaleString('es-CO')}
                      </strong>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '10px 12px',
                        borderRadius: '12px',
                        background: 'var(--neutral-surface-alt)',
                        border: '1px solid var(--neutral-border)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <CreditCard size={18} style={{ color: '#0284C7' }} />
                        <div>
                          <strong style={{ fontSize: '0.83rem', color: 'var(--text-main)', display: 'block' }}>
                            Pagos Digitales / Wompi
                          </strong>
                          <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
                            {computedLocalMetrics.byPayment.digital.count} pedido{computedLocalMetrics.byPayment.digital.count !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                      <strong style={{ fontSize: '0.95rem', color: '#0284C7', fontWeight: 900 }}>
                        ${computedLocalMetrics.byPayment.digital.total.toLocaleString('es-CO')}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Top Platos Más Vendidos */}
                <div className="pam-section" style={{ gap: '8px' }}>
                  <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Utensils size={15} style={{ color: 'var(--primary)' }} /> Platos Estrella del Periodo
                  </h4>
                  {computedLocalMetrics.topDishes.length === 0 ? (
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                      Aún no hay detalle de platos en este rango.
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {computedLocalMetrics.topDishes.map((dish, idx) => (
                        <div
                          key={dish.name}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: '0.8rem',
                            padding: '6px 8px',
                            borderRadius: '8px',
                            background: 'var(--neutral-surface-alt)'
                          }}
                        >
                          <span style={{ color: 'var(--text-main)', fontWeight: 700 }}>
                            #{idx + 1} {dish.name}{' '}
                            <span style={{ color: 'var(--primary)', fontWeight: 800 }}>({dish.qty} uds)</span>
                          </span>
                          <strong style={{ color: 'var(--text-main)' }}>
                            ${dish.revenue.toLocaleString('es-CO')}
                          </strong>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Libro Mayor de Pedidos y Liquidación Individual del Restaurante */}
      {restaurantPeriodOrders.length > 0 && (
        <div className="rpa-card">
          <div className="rpa-card-header">
            <div className="rpa-card-header-left">
              <div className="rpa-card-icon">
                <Wallet size={20} />
              </div>
              <div>
                <h3 className="rpa-card-title">Libro Mayor de Pedidos de {currentRestaurant?.name}</h3>
                <p className="rpa-card-subtitle">
                  Desglose pedido por pedido con subtotal, envío, comisión ética (3%) y liquidación neta (97%).
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="pam-input-wrap" style={{ minWidth: '210px' }}>
                <Search size={14} className="pam-icon" />
                <input
                  type="text"
                  className="pam-input"
                  placeholder="Buscar por #ID, cliente o plato..."
                  value={ledgerSearch}
                  onChange={e => setLedgerSearch(e.target.value)}
                  style={{ paddingTop: '7px', paddingBottom: '7px', fontSize: '0.8rem' }}
                />
              </div>

              {(['all', 'completed', 'in_progress', 'cancelled'] as const).map(f => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setLedgerFilter(f)}
                  className={ledgerFilter === f ? 'pam-btn-primary' : 'pam-btn-ghost'}
                  style={{ padding: '7px 12px', fontSize: '0.76rem', minWidth: 'auto' }}
                >
                  {f === 'all' && `Todos (${restaurantPeriodOrders.length})`}
                  {f === 'completed' && `Liquidados (${computedLocalMetrics.paidOrdersCount})`}
                  {f === 'in_progress' && `En Curso (${computedLocalMetrics.pendingOrdersCount})`}
                  {f === 'cancelled' && `Cancelados (${computedLocalMetrics.cancelledOrdersCount})`}
                </button>
              ))}
            </div>
          </div>

          <div className="rpa-card-body" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--neutral-border)', textAlign: 'left', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '10px 8px' }}>Pedido / Fecha</th>
                  <th style={{ padding: '10px 8px' }}>Cliente / Canal</th>
                  <th style={{ padding: '10px 8px' }}>Detalle</th>
                  <th style={{ padding: '10px 8px' }}>Estado</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right' }}>Total Bruto</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right' }}>Comisión (3%)</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right' }}>Neto Local (97%)</th>
                </tr>
              </thead>
              <tbody>
                {filteredLedgerOrders.map(order => {
                  const isCancelled = order.status === 'cancelled';
                  const isCompleted = isOrderCompletedSale(order);
                  const fee = isCancelled ? 0 : Math.round(order.total * commissionRate);
                  const net = isCancelled ? 0 : Math.max(0, order.total - fee);

                  return (
                    <tr
                      key={order.id}
                      style={{
                        borderBottom: '1px solid var(--neutral-border)',
                        opacity: isCancelled ? 0.6 : 1
                      }}
                    >
                      <td style={{ padding: '12px 8px' }}>
                        <strong style={{ color: 'var(--text-main)', display: 'block' }}>
                          #{order.id.slice(0, 8)}
                        </strong>
                        <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
                          {new Date(order.createdAt).toLocaleString('es-CO', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </td>
                      <td style={{ padding: '12px 8px' }}>
                        <strong style={{ color: 'var(--text-main)', display: 'block' }}>
                          {order.customerName || 'Cliente'}
                        </strong>
                        <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
                          {getFulfillmentBadgeText(order.fulfillment, order.type)} ·{' '}
                          {order.paymentMethod === 'cash' ? '💵 Efectivo' : '💳 Digital'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 8px', maxWidth: '240px' }}>
                        <span style={{ color: 'var(--text-main)' }}>
                          {order.items.map(i => `${i.qty}x ${i.name}`).join(', ')}
                        </span>
                      </td>
                      <td style={{ padding: '12px 8px' }}>
                        <span
                          className={`rpa-badge ${
                            isCancelled ? 'danger' : isCompleted ? 'success' : 'warning'
                          }`}
                        >
                          {isCancelled
                            ? 'CANCELADO'
                            : isCompleted
                            ? '✓ LIQUIDADO'
                            : `EN CURSO (${order.status.toUpperCase()})`}
                        </span>
                      </td>
                      <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 700, color: 'var(--text-main)' }}>
                        ${order.total.toLocaleString('es-CO')}
                      </td>
                      <td style={{ padding: '12px 8px', textAlign: 'right', color: '#D97706', fontWeight: 700 }}>
                        -${fee.toLocaleString('es-CO')}
                      </td>
                      <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 900, color: '#059669' }}>
                        ${net.toLocaleString('es-CO')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
