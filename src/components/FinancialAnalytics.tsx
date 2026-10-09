import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useApp } from '../context/useApp';
import { getFulfillmentBadgeText } from '../utils/tenantHelpers';
import { calculateOrderFinancialBreakdown, downloadSettlementReceiptHtml } from '../utils/wompiFees';
import type { Order, RestaurantSettlementRecord } from '../types';
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
  Utensils,
  CreditCard,
  Banknote,
  CheckCircle2,
  Search,
  Scale,
  ShieldCheck,
  Building2,
  ArrowRightLeft,
  Lock,
  Unlock,
  Send,
  FileCheck2
} from 'lucide-react';

export interface FinancialMetrics {
  grossSales: number;
  netRestaurant: number;
  platformCommission: number;
  wompiGatewayFees: number;
  paidOrdersCount: number;
  pendingOrdersCount: number;
  cancelledOrdersCount: number;
  refunds: number;
  savingsVs30: number;
  deliveryFees: number;
}

interface SettlementBalanceRpc {
  periodGrossSalesCop: number;
  periodCashSalesCop: number;
  periodDigitalSalesCop: number;
  periodCashOrdersCount: number;
  periodDigitalOrdersCount: number;
  periodCashCommissionCop: number;
  periodDigitalCommissionCop: number;
  periodWompiGatewayFeeCop: number;
  periodWompiGatewayIvaCop: number;
  periodDigitalNet97Cop: number;
  periodAutoOffsetCop: number;
  periodNetPayoutToRestaurantCop: number;
  periodNetDebtToPlatformCop: number;
  allTimeCashSalesCop: number;
  allTimeDigitalSalesCop: number;
  allTimeCashCommissionCop: number;
  allTimeDigitalCommissionCop: number;
  allTimeWompiGatewayFeeCop: number;
  allTimeDigitalNet97Cop: number;
  allTimeAutoOffsetCop: number;
  totalPayoutsSentToRestaurantCop: number;
  totalPaymentsReceivedFromRestaurantCop: number;
  livePendingPayoutToRestaurantCop: number;
  livePendingDebtToPlatformCop: number;
  cashCommissionLimitCop: number;
  autoLockCashOnLimit: boolean;
  acceptsCash: boolean;
  isCashLockedByLimit: boolean;
  payoutBankName: string;
  payoutAccountType: string;
  payoutAccountNumber: string;
  payoutAccountHolder: string;
  payoutDocumentType: string;
  payoutDocumentNumber: string;
  wompiMerchantId: string;
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
  const { authMode, orders, tenants, showToast } = useApp();

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
  const [settlementRpc, setSettlementRpc] = useState<SettlementBalanceRpc | null>(null);
  const [settlementHistory, setSettlementHistory] = useState<RestaurantSettlementRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Estados para configurar cuenta de dispersión segura (sin datos sensibles)
  const [showPayoutConfig, setShowPayoutConfig] = useState(false);
  const [bankName, setBankName] = useState(currentRestaurant?.payoutBankName || 'Bancolombia');
  const [accountType, setAccountType] = useState(currentRestaurant?.payoutAccountType || 'ahorros');
  const [accountNumber, setAccountNumber] = useState(currentRestaurant?.payoutAccountNumber || '');
  const [accountHolder, setAccountHolder] = useState(currentRestaurant?.payoutAccountHolder || '');
  const [documentType, setDocumentType] = useState(currentRestaurant?.payoutDocumentType || 'NIT');
  const [documentNumber, setDocumentNumber] = useState(currentRestaurant?.payoutDocumentNumber || '');
  const [wompiMerchantId, setWompiMerchantId] = useState(currentRestaurant?.wompiMerchantId || '');
  const [autoLockCash, setAutoLockCash] = useState<boolean>(currentRestaurant?.autoLockCashOnLimit ?? true);
  const [savingPayoutConfig, setSavingPayoutConfig] = useState(false);

  // Estados para pagar/conciliar comisión en efectivo pendiente
  const [showPayDebtModal, setShowPayDebtModal] = useState(false);
  const [paymentChannel, setPaymentChannel] = useState<'wompi_pse' | 'nequi_instant' | 'bre_b' | 'transferencia_bancaria'>('wompi_pse');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [submittingSettlement, setSubmittingSettlement] = useState(false);

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

  const restaurantAllTimeOrders = useMemo(() => {
    if (!tenantId) return [];
    return orders.filter(o => o.tenantId === tenantId);
  }, [orders, tenantId]);

  const restaurantPeriodOrders = useMemo(() => {
    if (!tenantId || !activeRange) return [];
    const startMs = activeRange.start.getTime();
    const endMs = activeRange.end.getTime();

    return restaurantAllTimeOrders
      .filter(o => o.createdAt >= startMs && o.createdAt <= endMs)
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [restaurantAllTimeOrders, tenantId, activeRange]);

  // Cálculo local determinístico con fórmula exacta:
  // - Efectivo: 3% GastroSync + $0 Pasarela
  // - Digital Wompi: 3% GastroSync + (2.65% + $700 COP + 19% IVA) Pasarela Wompi
  const computedLocalMetrics = useMemo(() => {
    let grossSales = 0;
    let netRestaurant = 0;
    let platformCommission = 0;
    let wompiGatewayFees = 0;
    let paidOrdersCount = 0;
    let pendingOrdersCount = 0;
    let inProgressSales = 0;
    let inProgressNet = 0;
    let cancelledOrdersCount = 0;
    let refunds = 0;
    let savingsVs30 = 0;
    let deliveryFees = 0;

    let completedCashSales = 0;
    let completedDigitalSales = 0;
    let completedCashOrdersCount = 0;
    let completedDigitalOrdersCount = 0;
    let completedCashCommission = 0;
    let completedDigitalCommission = 0;
    let completedWompiFee = 0;
    let completedWompiIva = 0;
    let completedDigitalNet = 0;

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
      const breakdown = calculateOrderFinancialBreakdown(o.total, o.paymentMethod, commissionRate);

      if (o.status === 'cancelled') {
        cancelledOrdersCount++;
        refunds += o.total;
        continue;
      }

      if (isOrderCompletedSale(o)) {
        paidOrdersCount++;
        grossSales += o.total;
        platformCommission += breakdown.gastroSyncFeeCop;
        wompiGatewayFees += breakdown.wompiTotalFeeCop;
        netRestaurant += breakdown.restaurantNetCop;
        deliveryFees += o.deliveryFeeApplied || 0;
        savingsVs30 += Math.max(0, Math.round(o.total * 0.3) - breakdown.totalDeductionCop);

        if (breakdown.isCash) {
          completedCashOrdersCount++;
          completedCashSales += o.total;
          completedCashCommission += breakdown.gastroSyncFeeCop;
        } else {
          completedDigitalOrdersCount++;
          completedDigitalSales += o.total;
          completedDigitalCommission += breakdown.gastroSyncFeeCop;
          completedWompiFee += breakdown.wompiTotalFeeCop;
          completedWompiIva += breakdown.wompiIvaCop;
          completedDigitalNet += breakdown.restaurantNetCop;
        }
      } else {
        pendingOrdersCount++;
        inProgressSales += o.total;
        inProgressNet += breakdown.restaurantNetCop;
      }

      const chKey =
        o.fulfillment === 'table_service'
          ? 'table_service'
          : o.fulfillment === 'pickup'
          ? 'pickup'
          : 'restaurant_delivery';
      byChannel[chKey].count++;
      byChannel[chKey].total += o.total;

      const payKey = breakdown.isCash ? 'cash' : 'digital';
      byPayment[payKey].count++;
      byPayment[payKey].total += o.total;

      for (const item of o.items || []) {
        const prev = dishMap.get(item.name) || { name: item.name, qty: 0, revenue: 0 };
        prev.qty += item.qty;
        prev.revenue += item.qty * item.price;
        dishMap.set(item.name, prev);
      }
    }

    let allTimeCashSales = 0;
    let allTimeDigitalSales = 0;
    let allTimeCashCommission = 0;
    let allTimeDigitalCommission = 0;
    let allTimeWompiFee = 0;
    let allTimeDigitalNet = 0;

    for (const o of restaurantAllTimeOrders) {
      if (!isOrderCompletedSale(o)) continue;
      const b = calculateOrderFinancialBreakdown(o.total, o.paymentMethod, commissionRate);
      if (b.isCash) {
        allTimeCashSales += o.total;
        allTimeCashCommission += b.gastroSyncFeeCop;
      } else {
        allTimeDigitalSales += o.total;
        allTimeDigitalCommission += b.gastroSyncFeeCop;
        allTimeWompiFee += b.wompiTotalFeeCop;
        allTimeDigitalNet += b.restaurantNetCop;
      }
    }

    const topDishes = Array.from(dishMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    return {
      grossSales,
      netRestaurant,
      platformCommission,
      wompiGatewayFees,
      paidOrdersCount,
      pendingOrdersCount,
      inProgressSales,
      inProgressNet,
      cancelledOrdersCount,
      refunds,
      savingsVs30,
      deliveryFees,
      completedCashSales,
      completedDigitalSales,
      completedCashOrdersCount,
      completedDigitalOrdersCount,
      completedCashCommission,
      completedDigitalCommission,
      completedWompiFee,
      completedWompiIva,
      completedDigitalNet,
      allTimeCashSales,
      allTimeDigitalSales,
      allTimeCashCommission,
      allTimeDigitalCommission,
      allTimeWompiFee,
      allTimeDigitalNet,
      byChannel,
      byPayment,
      topDishes
    };
  }, [restaurantPeriodOrders, restaurantAllTimeOrders, commissionRate]);

  const fetchMetrics = useCallback(async () => {
    if (!activeRange || !tenantId) return;
    setLoading(true);
    setError(null);
    try {
      if (authMode === 'demo' || !supabase) {
        setRpcMetrics(null);
        setSettlementRpc(null);
        return;
      }

      const [summaryRes, settlementRes, historyRes] = await Promise.all([
        supabase.rpc('get_restaurant_financial_summary', {
          p_restaurant_id: tenantId,
          p_start_date: activeRange.start.toISOString(),
          p_end_date: activeRange.end.toISOString()
        }),
        supabase.rpc('get_restaurant_settlement_balance', {
          p_restaurant_id: tenantId,
          p_start_date: activeRange.start.toISOString(),
          p_end_date: activeRange.end.toISOString()
        }),
        supabase
          .from('restaurant_settlements')
          .select('*')
          .eq('restaurant_id', tenantId)
          .order('created_at', { ascending: false })
          .limit(20)
      ]);

      if (!summaryRes.error && summaryRes.data && summaryRes.data.length > 0) {
        const row = summaryRes.data[0];
        setRpcMetrics({
          grossSales: Number(row.gross_sales || 0),
          netRestaurant: Number(row.net_restaurant || 0),
          platformCommission: Number(row.platform_commission || 0),
          wompiGatewayFees: Number(row.wompi_gateway_fees || 0),
          paidOrdersCount: Number(row.paid_orders_count || 0),
          pendingOrdersCount: Number(row.pending_orders_count || 0),
          cancelledOrdersCount: Number(row.cancelled_orders_count || 0),
          refunds: Number(row.refunds || 0),
          savingsVs30: Number(row.savings_vs_30 || 0),
          deliveryFees: Number(row.delivery_fees || 0)
        });
      }

      if (!settlementRes.error && settlementRes.data && settlementRes.data.length > 0) {
        const s = settlementRes.data[0];
        const parsed: SettlementBalanceRpc = {
          periodGrossSalesCop: Number(s.period_gross_sales_cop || 0),
          periodCashSalesCop: Number(s.period_cash_sales_cop || 0),
          periodDigitalSalesCop: Number(s.period_digital_sales_cop || 0),
          periodCashOrdersCount: Number(s.period_cash_orders_count || 0),
          periodDigitalOrdersCount: Number(s.period_digital_orders_count || 0),
          periodCashCommissionCop: Number(s.period_cash_commission_cop || 0),
          periodDigitalCommissionCop: Number(s.period_digital_commission_cop || 0),
          periodWompiGatewayFeeCop: Number(s.period_wompi_gateway_fee_cop || 0),
          periodWompiGatewayIvaCop: Number(s.period_wompi_gateway_iva_cop || 0),
          periodDigitalNet97Cop: Number(s.period_digital_net_97_cop || 0),
          periodAutoOffsetCop: Number(s.period_auto_offset_cop || 0),
          periodNetPayoutToRestaurantCop: Number(s.period_net_payout_to_restaurant_cop || 0),
          periodNetDebtToPlatformCop: Number(s.period_net_debt_to_platform_cop || 0),
          allTimeCashSalesCop: Number(s.all_time_cash_sales_cop || 0),
          allTimeDigitalSalesCop: Number(s.all_time_digital_sales_cop || 0),
          allTimeCashCommissionCop: Number(s.all_time_cash_commission_cop || 0),
          allTimeDigitalCommissionCop: Number(s.all_time_digital_commission_cop || 0),
          allTimeWompiGatewayFeeCop: Number(s.all_time_wompi_gateway_fee_cop || 0),
          allTimeDigitalNet97Cop: Number(s.all_time_digital_net_97_cop || 0),
          allTimeAutoOffsetCop: Number(s.all_time_auto_offset_cop || 0),
          totalPayoutsSentToRestaurantCop: Number(s.total_payouts_sent_to_restaurant_cop || 0),
          totalPaymentsReceivedFromRestaurantCop: Number(s.total_payments_received_from_restaurant_cop || 0),
          livePendingPayoutToRestaurantCop: Number(s.live_pending_payout_to_restaurant_cop || 0),
          livePendingDebtToPlatformCop: Number(s.live_pending_debt_to_platform_cop || 0),
          cashCommissionLimitCop: Number(s.cash_commission_limit_cop || 50000),
          autoLockCashOnLimit: Boolean(s.auto_lock_cash_on_limit ?? true),
          acceptsCash: Boolean(s.accepts_cash ?? true),
          isCashLockedByLimit: Boolean(s.is_cash_locked_by_limit ?? false),
          payoutBankName: s.payout_bank_name || '',
          payoutAccountType: s.payout_account_type || 'ahorros',
          payoutAccountNumber: s.payout_account_number || '',
          payoutAccountHolder: s.payout_account_holder || '',
          payoutDocumentType: s.payout_document_type || 'NIT',
          payoutDocumentNumber: s.payout_document_number || '',
          wompiMerchantId: s.wompi_merchant_id || ''
        };
        setSettlementRpc(parsed);
        if (parsed.payoutBankName) setBankName(parsed.payoutBankName);
        if (parsed.payoutAccountType) setAccountType(parsed.payoutAccountType);
        if (parsed.payoutAccountNumber) setAccountNumber(parsed.payoutAccountNumber);
        if (parsed.payoutAccountHolder) setAccountHolder(parsed.payoutAccountHolder);
        if (parsed.payoutDocumentType) setDocumentType(parsed.payoutDocumentType);
        if (parsed.payoutDocumentNumber) setDocumentNumber(parsed.payoutDocumentNumber);
        if (parsed.wompiMerchantId) setWompiMerchantId(parsed.wompiMerchantId);
        setAutoLockCash(parsed.autoLockCashOnLimit);
      }

      if (!historyRes.error && historyRes.data) {
        setSettlementHistory(
          historyRes.data.map((row: any) => ({
            id: row.id,
            restaurantId: row.restaurant_id,
            settlementType: row.settlement_type,
            grossSalesCop: Number(row.gross_sales_cop || 0),
            cashSalesCop: Number(row.cash_sales_cop || 0),
            digitalSalesCop: Number(row.digital_sales_cop || 0),
            cashCommissionCop: Number(row.cash_commission_cop || 0),
            digitalCommissionCop: Number(row.digital_commission_cop || 0),
            wompiGatewayFeeCop: Number(row.wompi_gateway_fee_cop || 0),
            autoOffsetCop: Number(row.auto_offset_cop || 0),
            netAmountCop: Number(row.net_amount_cop || 0),
            paymentChannel: row.payment_channel || 'transferencia_bancaria',
            referenceCode: row.reference_code || '',
            notes: row.notes || undefined,
            status: row.status || 'completed',
            createdAt: row.created_at,
            confirmedAt: row.confirmed_at || undefined
          }))
        );
      }
    } catch (err: unknown) {
      console.warn('⚠️ Error consultando resumen financiero remoto:', err);
    } finally {
      setLoading(false);
    }
  }, [authMode, activeRange, tenantId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchMetrics();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchMetrics, orders.length]);

  const finalMetrics = useMemo(() => {
    const grossSales = Math.max(computedLocalMetrics.grossSales, rpcMetrics?.grossSales || 0);
    const platformCommission = Math.max(computedLocalMetrics.platformCommission, rpcMetrics?.platformCommission || 0);
    const wompiGatewayFees = Math.max(computedLocalMetrics.wompiGatewayFees, rpcMetrics?.wompiGatewayFees || 0);
    const netRestaurant = Math.max(
      computedLocalMetrics.netRestaurant,
      rpcMetrics?.netRestaurant || Math.max(0, grossSales - platformCommission - wompiGatewayFees)
    );
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
      wompiGatewayFees,
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

  // Motor unificado de Cruce de Saldos (Efectivo vs Digital con tarifa exacta de Wompi)
  const unifiedSettlement = useMemo(() => {
    const cashSales = Math.max(computedLocalMetrics.completedCashSales, settlementRpc?.periodCashSalesCop || 0);
    const digitalSales = Math.max(computedLocalMetrics.completedDigitalSales, settlementRpc?.periodDigitalSalesCop || 0);
    const cashOrdersCount = Math.max(computedLocalMetrics.completedCashOrdersCount, settlementRpc?.periodCashOrdersCount || 0);
    const digitalOrdersCount = Math.max(computedLocalMetrics.completedDigitalOrdersCount, settlementRpc?.periodDigitalOrdersCount || 0);
    const cashCommission = Math.max(computedLocalMetrics.completedCashCommission, settlementRpc?.periodCashCommissionCop || 0);
    const digitalCommission = Math.max(computedLocalMetrics.completedDigitalCommission, settlementRpc?.periodDigitalCommissionCop || 0);
    const wompiGatewayFee = Math.max(computedLocalMetrics.completedWompiFee, settlementRpc?.periodWompiGatewayFeeCop || 0);
    const wompiGatewayIva = Math.max(computedLocalMetrics.completedWompiIva, settlementRpc?.periodWompiGatewayIvaCop || 0);
    const digitalNetAfterFees = Math.max(computedLocalMetrics.completedDigitalNet, settlementRpc?.periodDigitalNet97Cop || 0);

    // Cruce automático del periodo: cuánto del 3% de efectivo se cubre con el neto digital (ya descontado Wompi + 3% digital)
    const periodAutoOffset = Math.min(digitalNetAfterFees, cashCommission);
    const periodNetPayout = Math.max(0, digitalNetAfterFees - cashCommission);
    const periodNetDebt = Math.max(0, cashCommission - digitalNetAfterFees);

    const allTimeCashFee = Math.max(computedLocalMetrics.allTimeCashCommission, settlementRpc?.allTimeCashCommissionCop || 0);
    const allTimeDigitalNet = Math.max(computedLocalMetrics.allTimeDigitalNet, settlementRpc?.allTimeDigitalNet97Cop || 0);
    const payoutsSent = settlementRpc?.totalPayoutsSentToRestaurantCop || 0;
    const paymentsReceived = settlementRpc?.totalPaymentsReceivedFromRestaurantCop || 0;

    const liveNetPosition = (allTimeDigitalNet - allTimeCashFee) - payoutsSent + paymentsReceived;
    const livePendingPayout = settlementRpc
      ? settlementRpc.livePendingPayoutToRestaurantCop
      : Math.max(0, liveNetPosition);
    const livePendingDebt = settlementRpc
      ? settlementRpc.livePendingDebtToPlatformCop
      : Math.max(0, -liveNetPosition);

    const limitCop = settlementRpc?.cashCommissionLimitCop || currentRestaurant?.cashCommissionLimitCop || 50000;
    const quotaUsedPct = limitCop > 0 ? Math.min(100, Math.round((livePendingDebt / limitCop) * 100)) : 0;
    const isCashLocked = settlementRpc?.isCashLockedByLimit || (limitCop > 0 && livePendingDebt >= limitCop);
    const acceptsCash = settlementRpc ? settlementRpc.acceptsCash : (currentRestaurant?.acceptsCash ?? true);

    return {
      cashSales,
      digitalSales,
      cashOrdersCount,
      digitalOrdersCount,
      cashCommission,
      digitalCommission,
      wompiGatewayFee,
      wompiGatewayIva,
      digitalNetAfterFees,
      periodAutoOffset,
      periodNetPayout,
      periodNetDebt,
      payoutsSent,
      paymentsReceived,
      livePendingPayout,
      livePendingDebt,
      limitCop,
      quotaUsedPct,
      isCashLocked,
      acceptsCash
    };
  }, [computedLocalMetrics, settlementRpc, currentRestaurant]);

  const handleSavePayoutSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) return;
    if (!accountNumber.trim() || !accountHolder.trim()) {
      showToast('⚠️ Ingresa el número de cuenta/billetera y el nombre del titular.');
      return;
    }

    setSavingPayoutConfig(true);
    try {
      if (authMode === 'remote' && supabase) {
        const { error: rpcErr } = await supabase.rpc('update_restaurant_payout_settings', {
          p_restaurant_id: tenantId,
          p_payout_bank_name: bankName.trim(),
          p_payout_account_type: accountType,
          p_payout_account_number: accountNumber.trim(),
          p_payout_account_holder: accountHolder.trim(),
          p_payout_document_type: documentType,
          p_payout_document_number: documentNumber.trim() || null,
          p_wompi_merchant_id: wompiMerchantId.trim() || null,
          p_cash_commission_limit_cop: null,
          p_auto_lock_cash_on_limit: autoLockCash
        });

        if (rpcErr) {
          showToast(`⚠️ Error guardando configuración: ${rpcErr.message}`);
          return;
        }
        await fetchMetrics();
      }
      showToast('✅ Datos de dispersión bancaria y Wompi guardados de forma segura.');
      setShowPayoutConfig(false);
    } finally {
      setSavingPayoutConfig(false);
    }
  };

  const handlePayCashCommissionDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId || unifiedSettlement.livePendingDebt <= 0) return;

    setSubmittingSettlement(true);
    try {
      const refCode =
        paymentReference.trim() ||
        `WOMPI-PSE-${Date.now().toString().slice(-6)}`;

      if (authMode === 'remote' && supabase) {
        const { error: rpcErr } = await supabase.rpc('record_restaurant_settlement', {
          p_restaurant_id: tenantId,
          p_settlement_type: 'restaurant_payment_to_platform',
          p_net_amount_cop: unifiedSettlement.livePendingDebt,
          p_payment_channel: paymentChannel,
          p_reference_code: refCode,
          p_notes: paymentNotes.trim() || 'Pago de comisión acumulada de ventas en efectivo',
          p_gross_sales_cop: finalMetrics.grossSales,
          p_cash_sales_cop: unifiedSettlement.cashSales,
          p_digital_sales_cop: unifiedSettlement.digitalSales,
          p_cash_commission_cop: unifiedSettlement.cashCommission,
          p_digital_commission_cop: unifiedSettlement.digitalCommission,
          p_auto_offset_cop: unifiedSettlement.periodAutoOffset,
          p_wompi_gateway_fee_cop: unifiedSettlement.wompiGatewayFee
        });

        if (rpcErr) {
          showToast(`⚠️ No fue posible registrar el abono: ${rpcErr.message}`);
          return;
        }
        await fetchMetrics();
      } else {
        const mockRecord: RestaurantSettlementRecord = {
          id: `local-liq-${Date.now()}`,
          restaurantId: tenantId,
          settlementType: 'restaurant_payment_to_platform',
          grossSalesCop: finalMetrics.grossSales,
          cashSalesCop: unifiedSettlement.cashSales,
          digitalSalesCop: unifiedSettlement.digitalSales,
          cashCommissionCop: unifiedSettlement.cashCommission,
          digitalCommissionCop: unifiedSettlement.digitalCommission,
          wompiGatewayFeeCop: unifiedSettlement.wompiGatewayFee,
          autoOffsetCop: unifiedSettlement.periodAutoOffset,
          netAmountCop: unifiedSettlement.livePendingDebt,
          paymentChannel,
          referenceCode: refCode,
          notes: paymentNotes.trim() || 'Pago de comisión en efectivo',
          status: 'completed',
          createdAt: new Date().toISOString(),
          confirmedAt: new Date().toISOString()
        };
        setSettlementHistory(prev => [mockRecord, ...prev]);
      }

      showToast(`✅ ¡Comisión de $${unifiedSettlement.livePendingDebt.toLocaleString('es-CO')} COP conciliada! Tu cupo de efectivo está al 100%.`);
      setShowPayDebtModal(false);
      setPaymentReference('');
      setPaymentNotes('');
    } finally {
      setSubmittingSettlement(false);
    }
  };

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
      'Costo Pasarela Wompi (2.65%+$700+IVA) COP',
      'Neto Restaurante COP'
    ];

    const rows = restaurantPeriodOrders.map(o => {
      const b = calculateOrderFinancialBreakdown(o.total, o.paymentMethod, commissionRate);
      const fee = o.status === 'cancelled' ? 0 : b.gastroSyncFeeCop;
      const wompiFee = o.status === 'cancelled' ? 0 : b.wompiTotalFeeCop;
      const net = o.status === 'cancelled' ? 0 : b.restaurantNetCop;
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
        b.isCash ? 'Efectivo' : 'Digital Wompi',
        o.status,
        liqState,
        o.subtotal || o.total,
        o.deliveryFeeApplied || 0,
        o.total,
        fee,
        wompiFee,
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
                En efectivo solo pagas el <strong>{(commissionRate * 100).toFixed(0)}% de GastroSync</strong> ($0 pasarela). En pagos digitales se descuenta el {(commissionRate * 100).toFixed(0)}% de GastroSync + el costo bancario de Wompi (2.65% + $700 + IVA).
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

              {/* Fila 1: KPIs Principales de Ingresos y Desglose de Tarifas */}
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
                  title="Ingreso Neto Restaurante"
                  value={`$${finalMetrics.netRestaurant.toLocaleString('es-CO')}`}
                  subValue={
                    finalMetrics.inProgressNet > 0
                      ? `+ $${finalMetrics.inProgressNet.toLocaleString('es-CO')} neto en curso`
                      : '97% en efectivo · Libre tras Wompi en digital'
                  }
                  icon={<Wallet size={18} />}
                  color="#059669"
                  tooltip="Ganancia real del restaurante tras descontar el 3% de GastroSync (y la pasarela Wompi solo en pedidos digitales)."
                />
                <MetricCard
                  title="Comisión GastroSync (3% Fijo)"
                  value={`$${finalMetrics.platformCommission.toLocaleString('es-CO')}`}
                  subValue="3.0% único de plataforma"
                  icon={<Percent size={18} />}
                  color="#D97706"
                  tooltip="Comisión ética fija del 3% para GastroSync en efectivo y digital."
                />
                <MetricCard
                  title="Costo Pasarela Wompi (+IVA)"
                  value={`$${finalMetrics.wompiGatewayFees.toLocaleString('es-CO')}`}
                  subValue={
                    unifiedSettlement.digitalOrdersCount > 0
                      ? `2.65% + $700 + IVA (${unifiedSettlement.digitalOrdersCount} ped. digitales)`
                      : '$0 COP en pedidos en efectivo'
                  }
                  icon={<CreditCard size={18} />}
                  color="#7C3AED"
                  tooltip="Tarifa bancaria de Wompi (2.65% + $700 COP + 19% IVA). Solo aplica cuando el cliente paga por medios digitales."
                />
              </div>

              {/* Fila 2: Estado Operativo de Órdenes */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px' }}>
                <MetricCard
                  title="Pedidos Liquidados / Entregados"
                  value={finalMetrics.paidOrdersCount}
                  subValue={`Ticket prom.: $${finalMetrics.avgTicket.toLocaleString('es-CO')}`}
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
                      <strong>${Math.round(totalActiveAndCompletedCop * 0.3).toLocaleString('es-CO')} COP</strong>. Incluso descontando la pasarela bancaria Wompi en pagos digitales, ahorras más del 80% en comisiones.
                    </p>
                  </div>
                </div>
                <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#34D399' }}>
                  +${finalMetrics.savingsVs30.toLocaleString('es-CO')} COP
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
                            Efectivo en Caja (Solo 3% · $0 Pasarela)
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
                            Pagos Digitales Wompi (3% + Pasarela)
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

      {/* ============================================================================
          MOTOR BANCARIO DE CRUCE DE SALDOS (EFECTIVO VS PASARELA DIGITAL WOMPI)
         ============================================================================ */}
      <div className="rpa-card" style={{ border: '1px solid rgba(56, 189, 248, 0.28)' }}>
        <div className="rpa-card-header">
          <div className="rpa-card-header-left">
            <div className="rpa-card-icon" style={{ background: 'rgba(2, 132, 199, 0.14)', color: '#0284C7' }}>
              <Scale size={22} />
            </div>
            <div>
              <span className="pam-eyebrow" style={{ color: '#0284C7', marginBottom: '2px' }}>
                <ShieldCheck size={11} style={{ display: 'inline', verticalAlign: 'middle' }} /> Liquidación Exacta: 3% GastroSync + Pasarela Wompi (2.65% + $700 + IVA)
              </span>
              <h3 className="rpa-card-title">Centro de Liquidación y Cruce de Saldos (Efectivo vs. Digital)</h3>
              <p className="rpa-card-subtitle">
                En efectivo solo se causa el 3% de GastroSync. En pagos digitales se descuenta la tarifa de Wompi (2.65% + $700 + IVA 19%) y el 3% de GastroSync, cruzando automáticamente tus comisiones de efectivo.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="pam-btn-ghost"
              onClick={() => setShowPayoutConfig(prev => !prev)}
              style={{ padding: '8px 14px', fontSize: '0.8rem' }}
            >
              <Building2 size={15} /> {accountNumber ? 'Editar Cuenta de Dispersión' : 'Configurar Cuenta Bancaria / Wompi'}
            </button>

            {unifiedSettlement.livePendingDebt > 0 && (
              <button
                type="button"
                className="pam-btn-primary"
                onClick={() => setShowPayDebtModal(true)}
                style={{ padding: '8px 14px', fontSize: '0.8rem', minWidth: 'auto' }}
              >
                <Send size={15} /> Pagar Comisión Pendiente (${unifiedSettlement.livePendingDebt.toLocaleString('es-CO')})
              </button>
            )}
          </div>
        </div>

        <div className="rpa-card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Formulario colapsable de Cuenta de Dispersión (Cero Datos Sensibles / PCI-DSS Safe) */}
          {showPayoutConfig && (
            <form
              onSubmit={handleSavePayoutSettings}
              className="pam-section"
              style={{
                background: 'var(--neutral-surface-alt)',
                border: '1px solid rgba(2, 132, 199, 0.3)',
                gap: '12px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-main)' }}>
                    🏦 Destino de Dispersión para Recibir tu Saldo Neto (Wompi Split / Transferencia)
                  </h4>
                  <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    🔒 <strong>Seguridad PCI-DSS:</strong> GastroSync jamás solicita ni almacena números de tarjeta, CVV ni claves bancarias. Solo guardamos el identificador público para transferirte tus ganancias.
                  </p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>
                    Entidad Bancaria o Billetera
                  </label>
                  <select
                    className="pam-input no-icon"
                    value={bankName}
                    onChange={e => setBankName(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px' }}
                  >
                    <option value="Bancolombia">Bancolombia</option>
                    <option value="Nequi">Nequi</option>
                    <option value="Daviplata">Daviplata</option>
                    <option value="Llave Bre-B">Llave Bre-B (Banco de la República)</option>
                    <option value="Davivienda">Davivienda</option>
                    <option value="Banco de Bogotá">Banco de Bogotá</option>
                    <option value="BBVA Colombia">BBVA Colombia</option>
                    <option value="Scotiabank Colpatria">Scotiabank Colpatria</option>
                    <option value="Banco Popular">Banco Popular</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>
                    Tipo de Producto
                  </label>
                  <select
                    className="pam-input no-icon"
                    value={accountType}
                    onChange={e => setAccountType(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px' }}
                  >
                    <option value="ahorros">Cuenta de Ahorros</option>
                    <option value="corriente">Cuenta Corriente</option>
                    <option value="billetera_digital">Depósito de Bajo Monto (Nequi / Daviplata)</option>
                    <option value="llave_breb">Llave Bre-B Inmediata</option>
                    <option value="wompi_split">Cuenta Comercio Wompi Split</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>
                    Número de Cuenta / Celular / Llave Bre-B *
                  </label>
                  <input
                    type="text"
                    className="pam-input no-icon"
                    placeholder="Ej: 3001234567 o 012-345678-90"
                    value={accountNumber}
                    onChange={e => setAccountNumber(e.target.value)}
                    required
                    style={{ width: '100%', padding: '8px 10px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>
                    Nombre del Titular o Razón Social *
                  </label>
                  <input
                    type="text"
                    className="pam-input no-icon"
                    placeholder="Nombre completo o empresa"
                    value={accountHolder}
                    onChange={e => setAccountHolder(e.target.value)}
                    required
                    style={{ width: '100%', padding: '8px 10px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>
                    Tipo y Número de Documento (NIT / CC)
                  </label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <select
                      className="pam-input no-icon"
                      value={documentType}
                      onChange={e => setDocumentType(e.target.value)}
                      style={{ width: '82px', padding: '8px 6px' }}
                    >
                      <option value="NIT">NIT</option>
                      <option value="CC">CC</option>
                      <option value="CE">CE</option>
                    </select>
                    <input
                      type="text"
                      className="pam-input no-icon"
                      placeholder="Ej: 901234567-8"
                      value={documentNumber}
                      onChange={e => setDocumentNumber(e.target.value)}
                      style={{ flex: 1, padding: '8px 10px' }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>
                    ID Público de Comercio Wompi (Opcional)
                  </label>
                  <input
                    type="text"
                    className="pam-input no-icon"
                    placeholder="Ej: merch_prod_xxx (para Split)"
                    value={wompiMerchantId}
                    onChange={e => setWompiMerchantId(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', paddingTop: '6px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--text-main)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={autoLockCash}
                    onChange={e => setAutoLockCash(e.target.checked)}
                  />
                  <span>Pausar automáticamente pedidos en efectivo si la deuda de comisión supera el cupo de seguridad (${unifiedSettlement.limitCop.toLocaleString('es-CO')} COP)</span>
                </label>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="pam-btn-ghost"
                    onClick={() => setShowPayoutConfig(false)}
                    style={{ padding: '7px 14px', fontSize: '0.8rem' }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="pam-btn-primary"
                    disabled={savingPayoutConfig}
                    style={{ padding: '7px 16px', fontSize: '0.8rem', minWidth: 'auto' }}
                  >
                    {savingPayoutConfig ? 'Guardando...' : 'Guardar Cuenta de Dispersión'}
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Ecuación Visual de 4 Pasos: Caja Efectivo -> Recaudo Digital Wompi -> Cruce Automático -> Posición Neta */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '12px' }}>
            {/* Paso 1: Caja Efectivo */}
            <div className="pam-section" style={{ borderLeft: '4px solid #059669', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.73rem', fontWeight: 800, color: '#059669', textTransform: 'uppercase' }}>
                  1. Caja Física (Efectivo)
                </span>
                <Banknote size={17} style={{ color: '#059669' }} />
              </div>
              <div style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--text-main)' }}>
                ${unifiedSettlement.cashSales.toLocaleString('es-CO')}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                Recaudado en tu caja ({unifiedSettlement.cashOrdersCount} ped.) · Pasarela: <strong>$0</strong>
                <br />
                Comisión GastroSync (3%):{' '}
                <strong style={{ color: '#D97706' }}>
                  ${unifiedSettlement.cashCommission.toLocaleString('es-CO')} COP
                </strong>
              </div>
            </div>

            {/* Paso 2: Pasarela Digital Wompi */}
            <div className="pam-section" style={{ borderLeft: '4px solid #0284C7', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.73rem', fontWeight: 800, color: '#0284C7', textTransform: 'uppercase' }}>
                  2. Pasarela Digital (Wompi)
                </span>
                <CreditCard size={17} style={{ color: '#0284C7' }} />
              </div>
              <div style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--text-main)' }}>
                ${unifiedSettlement.digitalSales.toLocaleString('es-CO')}
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                Wompi (2.65%+$700+IVA): <strong>-${unifiedSettlement.wompiGatewayFee.toLocaleString('es-CO')}</strong>
                <br />
                GastroSync (3%): <strong>-${unifiedSettlement.digitalCommission.toLocaleString('es-CO')}</strong>
                <br />
                Neto digital a tu favor:{' '}
                <strong style={{ color: '#0284C7' }}>
                  ${unifiedSettlement.digitalNetAfterFees.toLocaleString('es-CO')} COP
                </strong>
              </div>
            </div>

            {/* Paso 3: Cruce Automático */}
            <div className="pam-section" style={{ borderLeft: '4px solid #7C3AED', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.73rem', fontWeight: 800, color: '#7C3AED', textTransform: 'uppercase' }}>
                  3. Cruce Automático (Netting)
                </span>
                <ArrowRightLeft size={17} style={{ color: '#7C3AED' }} />
              </div>
              <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#7C3AED' }}>
                ${unifiedSettlement.periodAutoOffset.toLocaleString('es-CO')}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                El 3% de tus ventas en efectivo se descuenta automáticamente de tu Neto Digital sin cobros manuales.
              </div>
            </div>

            {/* Paso 4: Saldo Final en Vivo */}
            <div
              className="pam-section"
              style={{
                borderLeft: `4px solid ${
                  unifiedSettlement.livePendingPayout > 0
                    ? '#059669'
                    : unifiedSettlement.livePendingDebt > 0
                    ? '#D97706'
                    : '#10B981'
                }`,
                background:
                  unifiedSettlement.livePendingPayout > 0
                    ? 'rgba(5, 150, 105, 0.06)'
                    : unifiedSettlement.livePendingDebt > 0
                    ? 'rgba(217, 119, 6, 0.07)'
                    : 'rgba(16, 185, 129, 0.06)',
                gap: '6px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span
                  style={{
                    fontSize: '0.73rem',
                    fontWeight: 800,
                    color:
                      unifiedSettlement.livePendingPayout > 0
                        ? '#059669'
                        : unifiedSettlement.livePendingDebt > 0
                        ? '#D97706'
                        : '#059669',
                    textTransform: 'uppercase'
                  }}
                >
                  4. {unifiedSettlement.livePendingPayout > 0
                    ? 'Saldo a Transferirte'
                    : unifiedSettlement.livePendingDebt > 0
                    ? 'Saldo por Abonar a GastroSync'
                    : 'Estado de Liquidación'}
                </span>
                <Wallet size={17} style={{ color: unifiedSettlement.livePendingDebt > 0 ? '#D97706' : '#059669' }} />
              </div>

              <div
                style={{
                  fontSize: '1.35rem',
                  fontWeight: 900,
                  color:
                    unifiedSettlement.livePendingPayout > 0
                      ? '#059669'
                      : unifiedSettlement.livePendingDebt > 0
                      ? '#D97706'
                      : '#059669'
                }}
              >
                {unifiedSettlement.livePendingPayout > 0
                  ? `+$${unifiedSettlement.livePendingPayout.toLocaleString('es-CO')}`
                  : unifiedSettlement.livePendingDebt > 0
                  ? `$${unifiedSettlement.livePendingDebt.toLocaleString('es-CO')}`
                  : '$0 COP (Paz y Salvo)'}
              </div>

              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                {unifiedSettlement.livePendingPayout > 0 ? (
                  <>
                    Libre de pasarela Wompi y del 3% de GastroSync. Se dispersará a{' '}
                    <strong>{accountNumber ? `${bankName} (${accountNumber})` : 'tu cuenta bancaria'}</strong>.
                  </>
                ) : unifiedSettlement.livePendingDebt > 0 ? (
                  <>
                    Comisión de efectivo pendiente tras cruzar tus pagos digitales. Se cubre sola con nuevos pagos Wompi o puedes abonarla.
                  </>
                ) : (
                  <>100% de tus comisiones y costos de pasarela están conciliados.</>
                )}
              </div>
            </div>
          </div>

          {/* Barra de Cupo de Comisión en Efectivo ("Tope de Seguridad Efectivo") */}
          <div
            className="pam-section"
            style={{
              padding: '14px 16px',
              background: 'var(--neutral-surface-alt)',
              gap: '8px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {unifiedSettlement.isCashLocked ? (
                  <Lock size={16} style={{ color: '#DC2626' }} />
                ) : (
                  <Unlock size={16} style={{ color: '#059669' }} />
                )}
                <strong style={{ fontSize: '0.84rem', color: 'var(--text-main)' }}>
                  Cupo de Comisión en Efectivo (Tope de Seguridad: ${unifiedSettlement.limitCop.toLocaleString('es-CO')} COP)
                </strong>
                <span
                  className={`rpa-badge ${
                    unifiedSettlement.isCashLocked
                      ? 'danger'
                      : unifiedSettlement.quotaUsedPct >= 75
                      ? 'warning'
                      : 'success'
                  }`}
                >
                  {unifiedSettlement.isCashLocked
                    ? 'EFECTIVO PAUSADO POR CUPO'
                    : unifiedSettlement.acceptsCash
                    ? 'EFECTIVO HABILITADO'
                    : 'SOLO PAGOS DIGITALES'}
                </span>
              </div>

              <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-main)' }}>
                Usado: ${unifiedSettlement.livePendingDebt.toLocaleString('es-CO')} / ${unifiedSettlement.limitCop.toLocaleString('es-CO')} COP ({unifiedSettlement.quotaUsedPct}%)
              </div>
            </div>

            <div style={{ height: '9px', borderRadius: '999px', background: 'rgba(148,163,184,0.2)', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${unifiedSettlement.quotaUsedPct}%`,
                  height: '100%',
                  borderRadius: '999px',
                  transition: 'width 0.3s ease',
                  background:
                    unifiedSettlement.quotaUsedPct >= 90
                      ? '#DC2626'
                      : unifiedSettlement.quotaUsedPct >= 70
                      ? '#D97706'
                      : '#059669'
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              <span>
                Equivale a recibir hasta <strong>${Math.round(unifiedSettlement.limitCop / commissionRate).toLocaleString('es-CO')} COP</strong> en ventas 100% en efectivo sin cruzar. Cada pedido pagado con Wompi libera cupo automáticamente.
              </span>
              {accountNumber && (
                <span>
                  🏦 Cuenta activa: <strong>{bankName} · {accountType.toUpperCase()} · {accountNumber}</strong>
                </span>
              )}
            </div>
          </div>

          {/* Modal / Panel para Pagar o Conciliar Deuda de Comisión en Efectivo */}
          {showPayDebtModal && unifiedSettlement.livePendingDebt > 0 && (
            <form
              onSubmit={handlePayCashCommissionDebt}
              className="pam-section"
              style={{
                border: '1px solid rgba(217, 119, 6, 0.45)',
                background: 'rgba(245, 158, 11, 0.06)',
                gap: '12px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-main)' }}>
                    ⚡ Conciliar Comisión de Efectivo Pendiente (${unifiedSettlement.livePendingDebt.toLocaleString('es-CO')} COP)
                  </h4>
                  <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    Paga en línea con PSE / Wompi o registra la referencia de tu transferencia para liberar el 100% de tu cupo de efectivo de inmediato.
                  </p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>
                    Medio de Pago
                  </label>
                  <select
                    className="pam-input no-icon"
                    value={paymentChannel}
                    onChange={e => setPaymentChannel(e.target.value as any)}
                    style={{ width: '100%', padding: '8px 10px' }}
                  >
                    <option value="wompi_pse">⚡ Pasarela Wompi / PSE (Conciliación Instantánea)</option>
                    <option value="nequi_instant">📱 Nequi Comercial GastroSync</option>
                    <option value="bre_b">🔑 Llave Bre-B Inmediata</option>
                    <option value="transferencia_bancaria">🏦 Transferencia Bancolombia</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>
                    Referencia / Comprobante (Opcional en PSE)
                  </label>
                  <input
                    type="text"
                    className="pam-input no-icon"
                    placeholder="Autogenerado si usas Wompi PSE"
                    value={paymentReference}
                    onChange={e => setPaymentReference(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>
                    Nota contable
                  </label>
                  <input
                    type="text"
                    className="pam-input no-icon"
                    placeholder="Ej: Corte semanal de caja"
                    value={paymentNotes}
                    onChange={e => setPaymentNotes(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  className="pam-btn-ghost"
                  onClick={() => setShowPayDebtModal(false)}
                  style={{ padding: '7px 14px', fontSize: '0.8rem' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="pam-btn-primary"
                  disabled={submittingSettlement}
                  style={{ padding: '7px 16px', fontSize: '0.8rem', minWidth: 'auto' }}
                >
                  {submittingSettlement
                    ? 'Procesando...'
                    : `Confirmar Pago de $${unifiedSettlement.livePendingDebt.toLocaleString('es-CO')} COP`}
                </button>
              </div>
            </form>
          )}

          {/* Historial de Cortes y Liquidaciones Conciliadas */}
          {settlementHistory.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <h4 style={{ margin: 0, fontSize: '0.86rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <FileCheck2 size={16} style={{ color: '#059669' }} /> Historial de Cortes y Liquidaciones Conciliadas ({settlementHistory.length})
              </h4>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.79rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--neutral-border)', textAlign: 'left', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '8px' }}>Referencia / Fecha</th>
                      <th style={{ padding: '8px' }}>Tipo de Corte</th>
                      <th style={{ padding: '8px' }}>Canal</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>Cruce Automático</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>Monto Liquidado</th>
                      <th style={{ padding: '8px' }}>Estado</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>Soporte</th>
                    </tr>
                  </thead>
                  <tbody>
                    {settlementHistory.map(item => (
                      <tr key={item.id} style={{ borderBottom: '1px solid var(--neutral-border)' }}>
                        <td style={{ padding: '8px' }}>
                          <strong style={{ color: 'var(--text-main)', display: 'block' }}>{item.referenceCode}</strong>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            {new Date(item.createdAt).toLocaleString('es-CO')}
                          </span>
                        </td>
                        <td style={{ padding: '8px', color: 'var(--text-main)', fontWeight: 700 }}>
                          {item.settlementType === 'platform_payout_to_restaurant'
                            ? '🏦 Dispersión a tu Cuenta'
                            : item.settlementType === 'restaurant_payment_to_platform'
                            ? '⚡ Abono de Comisión Efectivo (3%)'
                            : '🔄 Corte en Cero (Cruce Exacto)'}
                        </td>
                        <td style={{ padding: '8px', color: 'var(--text-muted)' }}>
                          {item.paymentChannel.toUpperCase()}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right', color: '#7C3AED', fontWeight: 700 }}>
                          ${item.autoOffsetCop.toLocaleString('es-CO')}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right', fontWeight: 900, color: '#059669' }}>
                          ${item.netAmountCop.toLocaleString('es-CO')}
                        </td>
                        <td style={{ padding: '8px' }}>
                          <span className="rpa-badge success">✓ CONCILIADO</span>
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>
                          <button
                            type="button"
                            className="pam-btn-ghost"
                            onClick={() =>
                              downloadSettlementReceiptHtml({
                                referenceCode: item.referenceCode,
                                createdAt: item.createdAt,
                                restaurantName: currentRestaurant?.name || 'Restaurante',
                                settlementType: item.settlementType,
                                paymentChannel: item.paymentChannel,
                                grossSalesCop: item.grossSalesCop,
                                cashSalesCop: item.cashSalesCop,
                                digitalSalesCop: item.digitalSalesCop,
                                cashCommissionCop: item.cashCommissionCop,
                                digitalCommissionCop: item.digitalCommissionCop,
                                wompiGatewayFeeCop: item.wompiGatewayFeeCop || 0,
                                autoOffsetCop: item.autoOffsetCop,
                                netAmountCop: item.netAmountCop,
                                notes: item.notes,
                                bankDetails: accountNumber
                                  ? `${bankName} (${accountType}) · ${accountNumber} · Titular: ${accountHolder}`
                                  : undefined
                              })
                            }
                            style={{ padding: '4px 10px', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          >
                            <Download size={12} /> Acta
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
                  Desglose pedido por pedido con subtotal, envío, comisión GastroSync (3%), pasarela Wompi (2.65%+$700+IVA en digital) y neto del local.
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
                  <th style={{ padding: '10px 8px', textAlign: 'right' }}>GastroSync (3%)</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right' }}>Pasarela Wompi (+IVA)</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right' }}>Neto Local</th>
                </tr>
              </thead>
              <tbody>
                {filteredLedgerOrders.map(order => {
                  const isCancelled = order.status === 'cancelled';
                  const isCompleted = isOrderCompletedSale(order);
                  const b = calculateOrderFinancialBreakdown(order.total, order.paymentMethod, commissionRate);
                  const fee = isCancelled ? 0 : b.gastroSyncFeeCop;
                  const wompiFee = isCancelled ? 0 : b.wompiTotalFeeCop;
                  const net = isCancelled ? 0 : b.restaurantNetCop;

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
                          {b.isCash ? '💵 Efectivo' : '💳 Digital Wompi'}
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
                      <td style={{ padding: '12px 8px', textAlign: 'right', color: b.isCash ? 'var(--text-muted)' : '#7C3AED', fontWeight: 700 }}>
                        {b.isCash ? '$0 (Efectivo)' : `-$${wompiFee.toLocaleString('es-CO')}`}
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
