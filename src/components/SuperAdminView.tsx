import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '../context/useApp';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Globe, DollarSign, ShoppingBag, CreditCard,
  ShieldCheck, AlertCircle, FileText, Phone, Mail, MapPin,
  CheckCircle, Zap, Key, MessageSquare, BarChart3,
  Scale, Banknote, ArrowRightLeft, RefreshCw, Send, Download
} from 'lucide-react';
import type { RestaurantApplicationStatus, RestaurantSettlementRecord } from '../types';
import { formatCop, formatCopOrZero, safeFormatDate } from '../utils/formatters';
import { calculateOrderFinancialBreakdown, downloadSettlementReceiptHtml, generateSettlementRef } from '../utils/wompiFees';
import { ensureColombiaCityAndZone } from '../services/supabaseDataService';
import { ErrorBoundary } from './ErrorBoundary';

interface AdminRestaurantSettlementRow {
  restaurantId: string;
  restaurantName: string;
  restaurantSlug: string;
  commissionRate: number;
  acceptsCash: boolean;
  cashCommissionLimitCop: number;
  completedOrdersCount: number;
  cashOrdersCount: number;
  digitalOrdersCount: number;
  grossSalesCop: number;
  cashSalesCop: number;
  digitalSalesCop: number;
  cashCommissionCop: number;
  digitalCommissionCop: number;
  totalCommissionCop: number;
  wompiGatewayFeeCop: number;
  digitalNet97Cop: number;
  autoOffsetCop: number;
  totalPayoutsSentCop: number;
  totalPaymentsReceivedCop: number;
  livePendingPayoutToRestaurantCop: number;
  livePendingDebtToPlatformCop: number;
  payoutBankName?: string;
  payoutAccountType?: string;
  payoutAccountNumber?: string;
  payoutAccountHolder?: string;
  payoutDocumentType?: string;
  payoutDocumentNumber?: string;
  wompiMerchantId?: string;
}

const AdminSupportTickets = React.lazy(() => import('./AdminSupportTickets').then(m => ({ default: m.AdminSupportTickets })));
const SupportMetricsPanel = React.lazy(() => import('./SupportMetricsPanel').then(m => ({ default: m.SupportMetricsPanel })));

const FallbackLoader: React.FC<{ message: string }> = ({ message }) => (
  <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
    <div style={{ width: '24px', height: '24px', border: '2px solid', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 10px' }} />
    {message}
  </div>
);

const SuperAdminViewContent: React.FC = () => {
  const {
    currentUser, authMode, tenants, orders, transactions,
    restaurantApplications, reviewRestaurantApplication,
    activateApprovedRestaurant, cities, zones, refreshCities, refreshZones, showToast
  } = useApp();

  const [activeTab, setActiveTab] = useState<'applications' | 'settlement' | 'support' | 'metrics'>('applications');
  const [statusFilter, setStatusFilter] = useState<'all' | RestaurantApplicationStatus>('all');
  const [cityFilter, setCityFilter] = useState<string>('all');
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  // Quick City / Zone Creator State (SuperAdmin)
  const [showNewCityForm, setShowNewCityForm] = useState(false);
  const [newCityName, setNewCityName] = useState('');
  const [newZoneName, setNewZoneName] = useState('');
  const [isCreatingCity, setIsCreatingCity] = useState(false);

  const handleQuickCreateCityZone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCityName.trim()) {
      showToast('⚠️ Ingresa el nombre de la ciudad o municipio.');
      return;
    }
    setIsCreatingCity(true);
    try {
      const res = await ensureColombiaCityAndZone(newCityName.trim(), newZoneName.trim() || 'Centro');
      if (!res.success || !res.cityId) {
        showToast(`⚠️ ${res.error || 'No se pudo habilitar la ciudad.'}`);
        return;
      }
      await Promise.all([refreshCities(), refreshZones(res.cityId)]);
      showToast(`✅ Cobertura habilitada en ${res.cityName || newCityName.trim()} · Zona ${res.zoneName || newZoneName.trim() || 'Centro'}`);
      setNewCityName('');
      setNewZoneName('');
      setShowNewCityForm(false);
    } finally {
      setIsCreatingCity(false);
    }
  };

  // Activation State
  const [activatingAppId, setActivatingAppId] = useState<string | null>(null);
  const [activationError, setActivationError] = useState<string | null>(null);
  const [activationSuccessInfo, setActivationSuccessInfo] = useState<{
    restaurantName: string;
    ownerEmail: string;
    tenantId: string;
    message?: string;
  } | null>(null);

  const [isReviewing, setIsReviewing] = useState<string | null>(null);
  const [isActivating, setIsActivating] = useState<boolean>(false);

  // Settlement Engine State (SuperAdmin)
  const [remoteSettlementRows, setRemoteSettlementRows] = useState<AdminRestaurantSettlementRow[]>([]);
  const [settlementRecords, setSettlementRecords] = useState<RestaurantSettlementRecord[]>([]);
  const [loadingSettlements, setLoadingSettlements] = useState(false);
  const [settlingRestaurantId, setSettlingRestaurantId] = useState<string | null>(null);
  const [settlementModalRow, setSettlementModalRow] = useState<AdminRestaurantSettlementRow | null>(null);
  const [settlementChannelInput, setSettlementChannelInput] = useState<string>('wompi_split');
  const [settlementRefInput, setSettlementRefInput] = useState<string>('');
  const [settlementNotesInput, setSettlementNotesInput] = useState<string>('');
  const [downloadReceiptOnSave, setDownloadReceiptOnSave] = useState<boolean>(true);

  const fetchPlatformSettlements = useCallback(async () => {
    if (authMode === 'demo' || !supabase) return;
    setLoadingSettlements(true);
    try {
      const [overviewRes, recordsRes] = await Promise.all([
        supabase.rpc('get_all_restaurants_settlement_overview'),
        supabase
          .from('restaurant_settlements')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(30)
      ]);

      if (!overviewRes.error && overviewRes.data) {
        setRemoteSettlementRows(
          overviewRes.data.map((r: any) => ({
            restaurantId: r.restaurant_id,
            restaurantName: r.restaurant_name,
            restaurantSlug: r.restaurant_slug,
            commissionRate: Number(r.commission_rate || 0.03),
            acceptsCash: Boolean(r.accepts_cash ?? true),
            cashCommissionLimitCop: Number(r.cash_commission_limit_cop || 50000),
            completedOrdersCount: Number(r.completed_orders_count || 0),
            cashOrdersCount: Number(r.cash_orders_count || 0),
            digitalOrdersCount: Number(r.digital_orders_count || 0),
            grossSalesCop: Number(r.gross_sales_cop || 0),
            cashSalesCop: Number(r.cash_sales_cop || 0),
            digitalSalesCop: Number(r.digital_sales_cop || 0),
            cashCommissionCop: Number(r.cash_commission_cop || 0),
            digitalCommissionCop: Number(r.digital_commission_cop || 0),
            totalCommissionCop: Number(r.total_commission_cop || 0),
            wompiGatewayFeeCop: Number(r.wompi_gateway_fee_cop || 0),
            digitalNet97Cop: Number(r.digital_net_97_cop || 0),
            autoOffsetCop: Number(r.auto_offset_cop || 0),
            totalPayoutsSentCop: Number(r.total_payouts_sent_cop || 0),
            totalPaymentsReceivedCop: Number(r.total_payments_received_cop || 0),
            livePendingPayoutToRestaurantCop: Number(r.live_pending_payout_to_restaurant_cop || 0),
            livePendingDebtToPlatformCop: Number(r.live_pending_debt_to_platform_cop || 0),
            payoutBankName: r.payout_bank_name || undefined,
            payoutAccountType: r.payout_account_type || undefined,
            payoutAccountNumber: r.payout_account_number || undefined,
            payoutAccountHolder: r.payout_account_holder || undefined,
            payoutDocumentType: r.payout_document_type || undefined,
            payoutDocumentNumber: r.payout_document_number || undefined,
            wompiMerchantId: r.wompi_merchant_id || undefined
          }))
        );
      }

      if (!recordsRes.error && recordsRes.data) {
        setSettlementRecords(
          recordsRes.data.map((row: any) => ({
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
    } finally {
      setLoadingSettlements(false);
    }
  }, [authMode]);

  useEffect(() => {
    if (activeTab !== 'settlement') return;
    const timer = window.setTimeout(() => {
      void fetchPlatformSettlements();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeTab, fetchPlatformSettlements]);

  const computedNetworkSettlements = useMemo<AdminRestaurantSettlementRow[]>(() => {
    if (remoteSettlementRows.length > 0) return remoteSettlementRows;

    return tenants.map(tenant => {
      const rate = tenant.commissionRate || 0.03;
      const tenantCompleted = orders.filter(
        o =>
          o.tenantId === tenant.id &&
          o.status !== 'cancelled' &&
          (o.status === 'delivered' || o.paymentStatus === 'approved')
      );

      let cashSales = 0;
      let digitalSales = 0;
      let cashCnt = 0;
      let digCnt = 0;
      let cashFee = 0;
      let digFee = 0;
      let wompiFee = 0;
      let digNet = 0;

      for (const o of tenantCompleted) {
        const bd = calculateOrderFinancialBreakdown(o.total, o.paymentMethod || 'cash', rate);
        if ((o.paymentMethod || 'cash') === 'cash') {
          cashCnt++;
          cashSales += o.total;
          cashFee += bd.gastroSyncFeeCop;
        } else {
          digCnt++;
          digitalSales += o.total;
          digFee += bd.gastroSyncFeeCop;
          wompiFee += bd.wompiTotalFeeCop;
          digNet += bd.restaurantNetCop;
        }
      }

      const autoOffset = Math.min(digNet, cashFee);
      const pendingPayout = Math.max(0, digNet - cashFee);
      const pendingDebt = Math.max(0, cashFee - digNet);

      return {
        restaurantId: tenant.id,
        restaurantName: tenant.name,
        restaurantSlug: tenant.slug,
        commissionRate: rate,
        acceptsCash: tenant.acceptsCash ?? true,
        cashCommissionLimitCop: tenant.cashCommissionLimitCop ?? 50000,
        completedOrdersCount: tenantCompleted.length,
        cashOrdersCount: cashCnt,
        digitalOrdersCount: digCnt,
        grossSalesCop: cashSales + digitalSales,
        cashSalesCop: cashSales,
        digitalSalesCop: digitalSales,
        cashCommissionCop: cashFee,
        digitalCommissionCop: digFee,
        totalCommissionCop: cashFee + digFee,
        wompiGatewayFeeCop: wompiFee,
        digitalNet97Cop: digNet,
        autoOffsetCop: autoOffset,
        totalPayoutsSentCop: 0,
        totalPaymentsReceivedCop: 0,
        livePendingPayoutToRestaurantCop: pendingPayout,
        livePendingDebtToPlatformCop: pendingDebt,
        payoutBankName: tenant.payoutBankName,
        payoutAccountType: tenant.payoutAccountType,
        payoutAccountNumber: tenant.payoutAccountNumber,
        payoutAccountHolder: tenant.payoutAccountHolder,
        payoutDocumentType: tenant.payoutDocumentType,
        payoutDocumentNumber: tenant.payoutDocumentNumber,
        wompiMerchantId: tenant.wompiMerchantId
      };
    });
  }, [remoteSettlementRows, tenants, orders]);

  const openSettlementConfirmModal = (row: AdminRestaurantSettlementRow) => {
    const isPayout = row.livePendingPayoutToRestaurantCop > 0;
    const isDebt = row.livePendingDebtToPlatformCop > 0;
    if (!isPayout && !isDebt) return;

    setSettlementModalRow(row);
    setSettlementChannelInput(isPayout ? 'wompi_split' : 'transferencia_bancaria');
    setSettlementRefInput(generateSettlementRef('GS-ADM'));
    setSettlementNotesInput(
      isPayout
        ? `Dispersión neta (tras tarifa Wompi y cruce 3% efectivo) a ${row.restaurantName}`
        : `Recaudo conciliado de comisión 3% en efectivo de ${row.restaurantName}`
    );
    setDownloadReceiptOnSave(true);
  };

  const handleExecuteAdminSettlement = async (row: AdminRestaurantSettlementRow) => {
    if (settlingRestaurantId) return;
    const isPayout = row.livePendingPayoutToRestaurantCop > 0;
    const isDebt = row.livePendingDebtToPlatformCop > 0;
    if (!isPayout && !isDebt) return;

    const amount = isPayout
      ? row.livePendingPayoutToRestaurantCop
      : row.livePendingDebtToPlatformCop;
    const settlementType = isPayout
      ? 'platform_payout_to_restaurant'
      : 'restaurant_payment_to_platform';

    const refCode = settlementRefInput.trim() || generateSettlementRef('GS-ADM');
    const channel = settlementChannelInput || (isPayout ? 'wompi_split' : 'transferencia_bancaria');
    const notes =
      settlementNotesInput.trim() ||
      (isPayout
        ? `Dispersión neta (tras tarifa Wompi y cruce 3% efectivo) a ${row.restaurantName}`
        : `Recaudo conciliado de comisión 3% en efectivo de ${row.restaurantName}`);

    setSettlingRestaurantId(row.restaurantId);
    try {
      if (authMode === 'remote' && supabase) {
        const { error } = await supabase.rpc('record_restaurant_settlement', {
          p_restaurant_id: row.restaurantId,
          p_settlement_type: settlementType,
          p_net_amount_cop: amount,
          p_payment_channel: channel,
          p_reference_code: refCode,
          p_notes: notes,
          p_gross_sales_cop: row.grossSalesCop,
          p_cash_sales_cop: row.cashSalesCop,
          p_digital_sales_cop: row.digitalSalesCop,
          p_cash_commission_cop: row.cashCommissionCop,
          p_digital_commission_cop: row.digitalCommissionCop,
          p_auto_offset_cop: row.autoOffsetCop,
          p_wompi_gateway_fee_cop: row.wompiGatewayFeeCop
        });

        if (error) {
          showToast(`⚠️ Error registrando corte: ${error.message}`);
          return;
        }
        await fetchPlatformSettlements();
      } else {
        const nowIso = new Date().toISOString();
        setSettlementRecords(prev => [
          {
            id: `local-${refCode}`,
            restaurantId: row.restaurantId,
            settlementType,
            grossSalesCop: row.grossSalesCop,
            cashSalesCop: row.cashSalesCop,
            digitalSalesCop: row.digitalSalesCop,
            cashCommissionCop: row.cashCommissionCop,
            digitalCommissionCop: row.digitalCommissionCop,
            wompiGatewayFeeCop: row.wompiGatewayFeeCop,
            autoOffsetCop: row.autoOffsetCop,
            netAmountCop: amount,
            paymentChannel: channel,
            referenceCode: refCode,
            notes,
            status: 'completed',
            createdAt: nowIso,
            confirmedAt: nowIso
          },
          ...prev
        ]);
      }

      if (downloadReceiptOnSave) {
        downloadSettlementReceiptHtml({
          referenceCode: refCode,
          createdAt: new Date().toISOString(),
          restaurantName: row.restaurantName,
          settlementType,
          paymentChannel: channel,
          grossSalesCop: row.grossSalesCop,
          cashSalesCop: row.cashSalesCop,
          digitalSalesCop: row.digitalSalesCop,
          cashCommissionCop: row.cashCommissionCop,
          digitalCommissionCop: row.digitalCommissionCop,
          wompiGatewayFeeCop: row.wompiGatewayFeeCop,
          autoOffsetCop: row.autoOffsetCop,
          netAmountCop: amount,
          notes,
          bankDetails: row.payoutAccountNumber
            ? `${row.payoutBankName || 'Banco'} (${row.payoutAccountType || 'ahorros'}) · ${row.payoutAccountNumber} · Titular: ${row.payoutAccountHolder || row.restaurantName}`
            : undefined
        });
      }

      setSettlementModalRow(null);
      showToast(
        isPayout
          ? `✅ Dispersión de ${formatCop(amount)} a ${row.restaurantName} registrada (${refCode}).`
          : `✅ Cobro de comisión de ${formatCop(amount)} de ${row.restaurantName} conciliado (${refCode}).`
      );
    } finally {
      setSettlingRestaurantId(null);
    }
  };

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

  // Applications scoped by selected city (counters respect the city filter)
  const cityScopedApps = restaurantApplications.filter(a => cityFilter === 'all' || a.cityId === cityFilter);

  // Counters
  const submittedCount = cityScopedApps.filter(a => a.status === 'submitted').length;
  const reviewingCount = cityScopedApps.filter(a => a.status === 'reviewing').length;
  const approvedCount = cityScopedApps.filter(a => a.status === 'approved').length;
  const rejectedCount = cityScopedApps.filter(a => a.status === 'rejected').length;
  const pendingReviewTotal = restaurantApplications.filter(a => a.status === 'submitted' || a.status === 'reviewing').length;

  // Filtered applications
  const filteredApps = cityScopedApps
    .filter(a => statusFilter === 'all' || a.status === statusFilter)
    .sort((a, b) => b.submittedAt - a.submittedAt);

  const handleNoteChange = (appId: string, note: string) => {
    setReviewNotes(prev => ({ ...prev, [appId]: note }));
  };

  const handleReviewAction = async (appId: string, nextStatus: 'reviewing' | 'approved' | 'rejected') => {
    if (isReviewing !== null) return; // double-click protection
    setIsReviewing(appId);
    try {
      const note = reviewNotes[appId] || '';
      const ok = await reviewRestaurantApplication(appId, nextStatus, note);
      if (ok) {
        setReviewNotes(prev => {
          const copy = { ...prev };
          delete copy[appId];
          return copy;
        });
      }
    } finally {
      setIsReviewing(null);
    }
  };

  const handleConfirmActivation = async (appId: string) => {
    if (isActivating) return;
    setActivationError(null);
    setIsActivating(true);

    const app = restaurantApplications.find(a => a.id === appId);
    if (!app) {
      setIsActivating(false);
      return;
    }

    const res = await activateApprovedRestaurant(appId);
    if (res.success) {
      setActivationSuccessInfo({
        restaurantName: app.restaurantName,
        ownerEmail: app.ownerEmail,
        tenantId: res.tenantId || 'creado',
        message: res.message
      });
      setActivatingAppId(null);
    } else if (res.error) {
      setActivationError(res.error);
    }
    setIsActivating(false);
  };

  const networkGrossSales = Math.max(
    computedNetworkSettlements.reduce((sum, r) => sum + r.grossSalesCop, 0),
    transactions.reduce((sum, t) => sum + t.amount, 0)
  );
  const totalEthicalFees = Math.max(
    computedNetworkSettlements.reduce((sum, r) => sum + r.totalCommissionCop, 0),
    transactions.reduce((sum, t) => sum + t.platformFee, 0)
  );
  const totalWompiGatewayFees = Math.max(
    computedNetworkSettlements.reduce((sum, r) => sum + r.wompiGatewayFeeCop, 0),
    transactions.reduce((sum, t) => sum + (t.gatewayFee || 0), 0)
  );
  const totalRestaurantPayouts = Math.max(
    computedNetworkSettlements.reduce(
      (sum, r) => sum + Math.max(0, r.grossSalesCop - r.totalCommissionCop - r.wompiGatewayFeeCop),
      0
    ),
    transactions.reduce((sum, t) => sum + t.restaurantPayout, 0)
  );
  const totalAutoOffsetCop = computedNetworkSettlements.reduce((sum, r) => sum + r.autoOffsetCop, 0);
  const totalPendingPayoutsCop = computedNetworkSettlements.reduce((sum, r) => sum + r.livePendingPayoutToRestaurantCop, 0);
  const totalPendingDebtsCop = computedNetworkSettlements.reduce((sum, r) => sum + r.livePendingDebtToPlatformCop, 0);

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
        <div
          className="superadmin-tabs-bar"
          style={{
            display: 'flex',
            background: 'rgba(255,255,255,0.05)',
            padding: '4px',
            borderRadius: '14px',
            border: '1px solid rgba(255,255,255,0.1)',
            overflowX: 'auto',
            maxWidth: '100%'
          }}
        >
          <button
            onClick={() => setActiveTab('applications')}
            className={`btn ${activeTab === 'applications' ? 'btn-primary' : 'btn-outline'}`}
            style={{ padding: '8px 16px', fontSize: '0.82rem', fontWeight: 800, borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap', flexShrink: 0 }}
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
            style={{ padding: '8px 16px', fontSize: '0.82rem', fontWeight: 800, borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            <Globe size={16} />
            <span>Red & Liquidaciones</span>
          </button>
          <button
            onClick={() => setActiveTab('support')}
            className={`btn ${activeTab === 'support' ? 'btn-primary' : 'btn-outline'}`}
            style={{ padding: '8px 16px', fontSize: '0.82rem', fontWeight: 800, borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            <MessageSquare size={16} />
            <span>Centro de Soporte</span>
          </button>
          <button
            onClick={() => setActiveTab('metrics')}
            className={`btn ${activeTab === 'metrics' ? 'btn-primary' : 'btn-outline'}`}
            style={{ padding: '8px 16px', fontSize: '0.82rem', fontWeight: 800, borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            <BarChart3 size={16} />
            <span>Métricas de Soporte</span>
          </button>
        </div>
      </div>

      {/* ── TAB 1: SOLICITUDES DE ALIADOS ── */}
      {activeTab === 'applications' && (
        <div>
          {/* City Filter & Quick National City/Zone Creator */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <label htmlFor="admin-city-filter" style={{ fontSize: '0.8rem', fontWeight: 800, color: 'white' }}>
                <MapPin size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                Filtrar por ciudad ({cities.filter(c => c.isActive).length} activas):
              </label>
              <select
                id="admin-city-filter"
                value={cityFilter}
                onChange={e => setCityFilter(e.target.value)}
                style={{ fontSize: '0.82rem', padding: '6px 12px', borderRadius: '10px', minWidth: '200px' }}
              >
                <option value="all">🇨🇴 Todas las ciudades de Colombia</option>
                {cities.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setShowNewCityForm(v => !v)}
              style={{ padding: '6px 14px', fontSize: '0.78rem', fontWeight: 800, borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Globe size={14} />
              <span>{showNewCityForm ? 'Cerrar creador de ciudad' : '🇨🇴 + Habilitar Ciudad / Zona'}</span>
            </button>
          </div>

          {showNewCityForm && (
            <form
              onSubmit={handleQuickCreateCityZone}
              className="card"
              style={{
                marginBottom: '1.25rem',
                padding: '14px 18px',
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'flex-end',
                gap: '12px'
              }}
            >
              <div style={{ flex: '1 1 220px' }}>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 800, color: '#A7F3D0', marginBottom: '4px' }}>
                  Ciudad o Municipio de Colombia *
                </label>
                <input
                  type="text"
                  placeholder="Ej: Rionegro, Chía, Tuluá, Tunja, Popayán..."
                  value={newCityName}
                  onChange={e => setNewCityName(e.target.value)}
                  style={{ width: '100%', fontSize: '0.82rem', padding: '8px 12px', borderRadius: '10px' }}
                  required
                />
              </div>
              <div style={{ flex: '1 1 220px' }}>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 800, color: '#A7F3D0', marginBottom: '4px' }}>
                  Zona o Sector Inicial (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ej: Centro, Parque Principal, Zona Rosa..."
                  value={newZoneName}
                  onChange={e => setNewZoneName(e.target.value)}
                  style={{ width: '100%', fontSize: '0.82rem', padding: '8px 12px', borderRadius: '10px' }}
                />
              </div>
              <button
                type="submit"
                disabled={isCreatingCity}
                className="btn btn-primary"
                style={{ padding: '9px 18px', fontSize: '0.82rem', fontWeight: 800, borderRadius: '10px' }}
              >
                {isCreatingCity ? 'Habilitando...' : 'Habilitar Cobertura'}
              </button>
            </form>
          )}

          {/* Status Counter Bar */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <div className="card" onClick={() => setStatusFilter('all')} style={{ cursor: 'pointer', border: statusFilter === 'all' ? '1px solid var(--primary)' : undefined, background: 'var(--glass-medium)' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 700 }}>Total Solicitudes</div>
              <strong style={{ fontSize: '1.5rem', color: 'white', fontWeight: 900 }}>{cityScopedApps.length}</strong>
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
              Todas ({cityScopedApps.length})
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
                  const cityObj = cities.find(c => c.id === app.cityId);
                  const cityName = cityObj ? cityObj.name : 'Ciudad';
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
                            Categoría: <strong>{app.category}</strong> · Ubicación: <strong>Zona {zoneName} ({cityName})</strong>
                          </span>
                        </div>

                        <div style={{ textAlign: 'right', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          <div>Enviada el: <strong>{safeFormatDate(app.submittedAt)}</strong></div>
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
                              Pedido Mínimo: <strong style={{ color: 'white' }}>{formatCop(app.minOrder)}</strong>
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
                              {app.deliveryFee !== undefined && <div>Tarifa Domicilio: <strong style={{ color: 'white' }}>{formatCopOrZero(app.deliveryFee)}</strong></div>}
                              {app.deliveryRadiusKm !== undefined && <div>Radio Cobertura: <strong style={{ color: 'white' }}>{app.deliveryRadiusKm} Km</strong></div>}
                            </div>
                          )}
                        </div>

                      </div>

                      {/* Extended Business Profile */}
                      {(app.description || app.scheduleHours || app.estimatedDeliveryMinutes !== undefined || app.logoUrl || app.bannerUrl) && (
                        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', padding: '12px 14px', borderRadius: '14px', marginBottom: '1.25rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                            Perfil Comercial
                          </span>
                          {app.description && <div style={{ color: 'white', marginBottom: '4px' }}>{app.description}</div>}
                          {app.scheduleHours && <div>🕒 Horario: <strong style={{ color: 'white' }}>{app.scheduleHours}</strong></div>}
                          {app.estimatedDeliveryMinutes !== undefined && <div>⏱️ Tiempo estimado: <strong style={{ color: 'white' }}>{app.estimatedDeliveryMinutes} min</strong></div>}
                          {(app.logoUrl || app.bannerUrl) && (
                            <div style={{ display: 'flex', gap: '10px', marginTop: '8px', alignItems: 'center' }}>
                              {app.logoUrl && <img loading="lazy" decoding="async" src={app.logoUrl} alt={`Logo de ${app.restaurantName}`} style={{ width: '56px', height: '56px', objectFit: 'cover', borderRadius: '10px' }} />}
                              {app.bannerUrl && <img loading="lazy" decoding="async" src={app.bannerUrl} alt={`Portada de ${app.restaurantName}`} style={{ width: '140px', height: '56px', objectFit: 'cover', borderRadius: '10px' }} />}
                            </div>
                          )}
                        </div>
                      )}

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
                            🏁 Decisión tomada el <strong>{safeFormatDate(app.reviewedAt)}</strong> por <code style={{ color: 'white' }}>{app.reviewedByEmail}</code>.
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
                            <span>⚠️ Aprobar esta solicitud guarda la decisión interna pero NO activa automáticamente un restaurante en el feed ni crea una cuenta de dueño. La activación es un paso separado.</span>
                          </div>

                          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            {app.status === 'submitted' && (
                              <button
                                className="btn btn-outline"
                                style={{ padding: '8px 14px', fontSize: '0.8rem', fontWeight: 800, borderRadius: '10px', borderColor: 'rgba(56, 189, 248, 0.4)', color: '#38BDF8', opacity: isReviewing ? 0.5 : 1, cursor: isReviewing ? 'not-allowed' : 'pointer' }}
                                onClick={() => handleReviewAction(app.id, 'reviewing')}
                                disabled={isReviewing !== null}
                              >
                                🔍 Marcar En Revisión
                              </button>
                            )}

                            <button
                              className="btn btn-secondary"
                              style={{ padding: '8px 16px', fontSize: '0.8rem', fontWeight: 900, borderRadius: '10px', opacity: isReviewing ? 0.5 : 1, cursor: isReviewing ? 'not-allowed' : 'pointer' }}
                              onClick={() => handleReviewAction(app.id, 'approved')}
                              disabled={isReviewing !== null}
                            >
                              ✅ Aprobar Solicitud
                            </button>

                            <button
                              className="btn btn-outline"
                              style={{ padding: '8px 14px', fontSize: '0.8rem', fontWeight: 800, borderRadius: '10px', borderColor: 'rgba(239, 68, 68, 0.4)', color: '#EF4444', opacity: isReviewing ? 0.5 : 1, cursor: isReviewing ? 'not-allowed' : 'pointer' }}
                              onClick={() => handleReviewAction(app.id, 'rejected')}
                              disabled={isReviewing !== null}
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
                                Activado el: <strong>{app.activatedAt ? safeFormatDate(app.activatedAt) : 'Recientemente'}</strong> por <code style={{ color: 'white' }}>{app.activatedByEmail}</code> · ID Tenant: <code style={{ color: 'white' }}>{app.activatedTenantId}</code>
                              </div>
                            </div>
                          ) : activatingAppId === app.id ? (
                            <div style={{ background: 'rgba(139, 92, 246, 0.12)', border: '1px solid rgba(139, 92, 246, 0.35)', padding: '16px', borderRadius: '16px' }}>
                              <div style={{ fontWeight: 900, color: 'white', fontSize: '0.95rem', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Key size={18} style={{ color: '#8B5CF6' }} />
                                <span>Activar Restaurante Operativo Local</span>
                              </div>

                              <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.25)', padding: '10px 12px', borderRadius: '10px', fontSize: '0.78rem', color: '#FCD34D', marginBottom: '12px', lineHeight: 1.4 }}>
                                ⚠️ <strong>Aviso Importante:</strong> Al confirmar, se creará el restaurante en la base de datos y <strong>se enviará una invitación segura por correo</strong> a <code>{app.ownerEmail}</code> para que el dueño defina su propia contraseña. Nunca se generan ni se muestran contraseñas.
                              </div>

                              {activationError && (
                                <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#FCA5A5', padding: '8px 12px', borderRadius: '8px', fontSize: '0.78rem', marginBottom: '10px', fontWeight: 600 }}>
                                  {activationError}
                                </div>
                              )}

                              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                <button
                                  className="btn btn-primary"
                                  style={{ padding: '8px 16px', fontSize: '0.82rem', fontWeight: 900, borderRadius: '10px', background: '#8B5CF6', borderColor: '#8B5CF6', opacity: isActivating ? 0.5 : 1, cursor: isActivating ? 'not-allowed' : 'pointer' }}
                                  onClick={() => handleConfirmActivation(app.id)}
                                  disabled={isActivating}
                                >
                                  {isActivating ? '⏳ Procesando...' : '⚡ Confirmar y Activar Restaurante'}
                                </button>
                                <button
                                  className="btn btn-outline"
                                  style={{ padding: '8px 14px', fontSize: '0.82rem', borderRadius: '10px', opacity: isActivating ? 0.5 : 1, cursor: isActivating ? 'not-allowed' : 'pointer' }}
                                  onClick={() => { setActivatingAppId(null); setActivationError(null); }}
                                  disabled={isActivating}
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

      {/* ── TAB 2: RED DE RESTAURANTES & LIQUIDACIÓN BANCARIA (CRUCE EFECTIVO VS WOMPI) ── */}
      {activeTab === 'settlement' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* KPI Cards de Red y Cruce */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.1rem' }}>
            <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ width: '46px', height: '46px', borderRadius: '12px', background: 'rgba(56, 189, 248, 0.16)', color: '#38BDF8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <ShoppingBag size={22} />
              </div>
              <div>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Ventas Brutas Red ({computedNetworkSettlements.length} locales)</div>
                <strong style={{ fontSize: '1.3rem', color: 'white' }}>{formatCopOrZero(networkGrossSales)}</strong>
                <div style={{ fontSize: '0.72rem', color: '#10B981', fontWeight: 700 }}>
                  Neto Aliados: {formatCopOrZero(totalRestaurantPayouts)}
                </div>
              </div>
            </div>

            <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ width: '46px', height: '46px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.16)', color: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <DollarSign size={22} />
              </div>
              <div>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Utilidad Libre GastroSync (3% Neto)</div>
                <strong style={{ fontSize: '1.3rem', color: 'white' }}>{formatCopOrZero(totalEthicalFees)}</strong>
                <div style={{ fontSize: '0.71rem', color: '#94A3B8', fontWeight: 700 }}>
                  Pasarela Wompi (2.65%+700+IVA): {formatCopOrZero(totalWompiGatewayFees)}
                </div>
              </div>
            </div>

            <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ width: '46px', height: '46px', borderRadius: '12px', background: 'rgba(139, 92, 246, 0.16)', color: '#A78BFA', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <ArrowRightLeft size={22} />
              </div>
              <div>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Por Dispersar a Restaurantes</div>
                <strong style={{ fontSize: '1.3rem', color: '#10B981' }}>{formatCopOrZero(totalPendingPayoutsCop)}</strong>
                <div style={{ fontSize: '0.72rem', color: '#A78BFA', fontWeight: 700 }}>
                  Cruce auto. efectivo: {formatCopOrZero(totalAutoOffsetCop)}
                </div>
              </div>
            </div>

            <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ width: '46px', height: '46px', borderRadius: '12px', background: 'rgba(245, 158, 11, 0.16)', color: '#F59E0B', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Banknote size={22} />
              </div>
              <div>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Comisión Efectivo por Cobrar</div>
                <strong style={{ fontSize: '1.3rem', color: '#F59E0B' }}>{formatCopOrZero(totalPendingDebtsCop)}</strong>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  Protegido con tope de cupo automático
                </div>
              </div>
            </div>
          </div>

          {/* Matriz de Cruce de Saldos y Dispersión por Restaurante */}
          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Scale size={20} style={{ color: '#38BDF8' }} />
                  <span>Matriz de Liquidación y Cruce de Saldos por Restaurante (Efectivo vs. Wompi Digital)</span>
                </div>
                <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  GastroSync conserva el <strong>3% libre</strong> en todas las ventas: en pagos digitales se descuenta la tarifa Wompi (2.65% + $700 + IVA 19%) más tu 3%, y de ese neto digital se cruza automáticamente el 3% de las ventas en efectivo.
                </p>
              </div>

              <button
                type="button"
                className="btn btn-outline"
                onClick={() => void fetchPlatformSettlements()}
                disabled={loadingSettlements}
                style={{ padding: '7px 14px', fontSize: '0.78rem', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <RefreshCw size={14} className={loadingSettlements ? 'spin' : ''} />
                <span>Actualizar Saldos</span>
              </button>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--neutral-border)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '10px 8px' }}>Restaurante / Destino Dispersión</th>
                    <th style={{ padding: '10px 8px', textAlign: 'right' }}>Ventas Efectivo (Caja)</th>
                    <th style={{ padding: '10px 8px', textAlign: 'right' }}>Ventas Digitales (Wompi)</th>
                    <th style={{ padding: '10px 8px', textAlign: 'right' }}>Tu 3% Libre Total</th>
                    <th style={{ padding: '10px 8px', textAlign: 'right' }}>Cruce Automático</th>
                    <th style={{ padding: '10px 8px', textAlign: 'right' }}>Posición Neta Actual</th>
                    <th style={{ padding: '10px 8px', textAlign: 'right' }}>Acción Bancaria</th>
                  </tr>
                </thead>
                <tbody>
                  {computedNetworkSettlements.map(row => {
                    const hasPayout = row.livePendingPayoutToRestaurantCop > 0;
                    const hasDebt = row.livePendingDebtToPlatformCop > 0;
                    const isSettling = settlingRestaurantId === row.restaurantId;

                    return (
                      <tr key={row.restaurantId} style={{ borderBottom: '1px solid var(--neutral-border)' }}>
                        <td style={{ padding: '12px 8px' }}>
                          <div style={{ fontWeight: 800, color: 'white', fontSize: '0.86rem' }}>
                            {row.restaurantName}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            /r/{row.restaurantSlug} · {row.completedOrdersCount} pedidos efectivos
                          </div>
                          {row.payoutAccountNumber ? (
                            <div style={{ fontSize: '0.71rem', color: '#38BDF8', marginTop: '3px', fontWeight: 700 }}>
                              🏦 {row.payoutBankName} ({row.payoutAccountType}) · {row.payoutAccountNumber}
                              {row.wompiMerchantId ? ` · Wompi: ${row.wompiMerchantId}` : ''}
                            </div>
                          ) : (
                            <div style={{ fontSize: '0.7rem', color: '#F59E0B', marginTop: '3px' }}>
                              ⚠️ Sin cuenta de dispersión configurada
                            </div>
                          )}
                        </td>

                        <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                          <strong style={{ color: 'white', display: 'block' }}>{formatCopOrZero(row.cashSalesCop)}</strong>
                          <span style={{ fontSize: '0.7rem', color: '#F59E0B' }}>
                            3% Efec: {formatCopOrZero(row.cashCommissionCop)} ({row.cashOrdersCount} ped.)
                          </span>
                        </td>

                        <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                          <strong style={{ color: '#38BDF8', display: 'block' }}>{formatCopOrZero(row.digitalSalesCop)}</strong>
                          <span style={{ fontSize: '0.69rem', color: '#94A3B8', display: 'block' }}>
                            Wompi: -{formatCopOrZero(row.wompiGatewayFeeCop)} · 3%: -{formatCopOrZero(row.digitalCommissionCop)}
                          </span>
                          <span style={{ fontSize: '0.7rem', color: '#10B981', fontWeight: 700 }}>
                            Neto Digital: {formatCopOrZero(row.digitalNet97Cop)} ({row.digitalOrdersCount} ped.)
                          </span>
                        </td>

                        <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                          <strong style={{ color: '#10B981', display: 'block', fontSize: '0.88rem' }}>
                            {formatCopOrZero(row.totalCommissionCop)}
                          </strong>
                          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                            100% libre p/ ti
                          </span>
                        </td>

                        <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                          <strong style={{ color: '#A78BFA', display: 'block' }}>{formatCopOrZero(row.autoOffsetCop)}</strong>
                          <span style={{ fontSize: '0.69rem', color: 'var(--text-muted)' }}>
                            Cubierto por digital
                          </span>
                        </td>

                        <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                          {hasPayout ? (
                            <div>
                              <strong style={{ color: '#10B981', fontSize: '0.9rem', display: 'block' }}>
                                +{formatCop(row.livePendingPayoutToRestaurantCop)}
                              </strong>
                              <span style={{ fontSize: '0.69rem', color: '#10B981', fontWeight: 700 }}>
                                A dispersar al restaurante
                              </span>
                            </div>
                          ) : hasDebt ? (
                            <div>
                              <strong style={{ color: '#F59E0B', fontSize: '0.9rem', display: 'block' }}>
                                -{formatCop(row.livePendingDebtToPlatformCop)}
                              </strong>
                              <span style={{ fontSize: '0.69rem', color: '#F59E0B', fontWeight: 700 }}>
                                Debe a GastroSync (Cupo: {Math.min(100, Math.round((row.livePendingDebtToPlatformCop / row.cashCommissionLimitCop) * 100))}%)
                              </span>
                            </div>
                          ) : (
                            <span style={{ color: '#10B981', fontWeight: 800, fontSize: '0.78rem' }}>
                              ✓ Paz y Salvo ($0)
                            </span>
                          )}
                        </td>

                        <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                          {hasPayout ? (
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => openSettlementConfirmModal(row)}
                              disabled={isSettling}
                              style={{ padding: '6px 12px', fontSize: '0.74rem', fontWeight: 800, borderRadius: '8px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                            >
                              <Send size={13} />
                              <span>{isSettling ? 'Registrando...' : 'Dispersar Neto'}</span>
                            </button>
                          ) : hasDebt ? (
                            <button
                              type="button"
                              className="btn btn-outline"
                              onClick={() => openSettlementConfirmModal(row)}
                              disabled={isSettling}
                              style={{ padding: '6px 12px', fontSize: '0.74rem', fontWeight: 800, borderRadius: '8px', borderColor: 'rgba(245, 158, 11, 0.5)', color: '#F59E0B' }}
                            >
                              {isSettling ? 'Conciliando...' : 'Conciliar Cobro'}
                            </button>
                          ) : (
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Al día</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Historial de Cortes y Liquidaciones Conciliadas en Base de Datos */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <CreditCard size={20} /> Historial Auditado de Cortes, Dispersiones y Recaudos de Comisión
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--neutral-border)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '10px' }}>Referencia / Fecha</th>
                    <th style={{ padding: '10px' }}>Restaurante</th>
                    <th style={{ padding: '10px' }}>Tipo de Operación</th>
                    <th style={{ padding: '10px' }}>Canal</th>
                    <th style={{ padding: '10px', textAlign: 'right' }}>Cruce Aplicado</th>
                    <th style={{ padding: '10px', textAlign: 'right' }}>Monto Neto</th>
                    <th style={{ padding: '10px', textAlign: 'right' }}>Soporte</th>
                  </tr>
                </thead>
                <tbody>
                  {settlementRecords.length > 0 ? (
                    settlementRecords.map(rec => {
                      const restName =
                        tenants.find(t => t.id === rec.restaurantId)?.name ||
                        rec.restaurantId.slice(0, 8);
                      return (
                        <tr key={rec.id} style={{ borderBottom: '1px solid var(--neutral-border)' }}>
                          <td style={{ padding: '10px' }}>
                            <code style={{ color: '#38BDF8', fontSize: '0.75rem', fontWeight: 700 }}>{rec.referenceCode}</code>
                            <div style={{ fontSize: '0.69rem', color: 'var(--text-muted)' }}>
                              {new Date(rec.createdAt).toLocaleString('es-CO')}
                            </div>
                          </td>
                          <td style={{ padding: '10px', color: 'white', fontWeight: 700 }}>{restName}</td>
                          <td style={{ padding: '10px', color: 'white' }}>
                            {rec.settlementType === 'platform_payout_to_restaurant'
                              ? '🏦 Dispersión Neto al Restaurante'
                              : rec.settlementType === 'restaurant_payment_to_platform'
                              ? '⚡ Recaudo Comisión Efectivo (3%)'
                              : '🔄 Corte en Cero'}
                            {rec.notes && (
                              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                {rec.notes}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>
                            {rec.paymentChannel.toUpperCase()}
                          </td>
                          <td style={{ padding: '10px', textAlign: 'right', color: '#A78BFA', fontWeight: 700 }}>
                            {formatCopOrZero(rec.autoOffsetCop)}
                          </td>
                          <td style={{ padding: '10px', textAlign: 'right', color: '#10B981', fontWeight: 900 }}>
                            {formatCopOrZero(rec.netAmountCop)}
                          </td>
                          <td style={{ padding: '10px', textAlign: 'right' }}>
                            <button
                              type="button"
                              className="btn btn-outline"
                              onClick={() =>
                                downloadSettlementReceiptHtml({
                                  referenceCode: rec.referenceCode,
                                  createdAt: rec.createdAt,
                                  restaurantName: restName,
                                  settlementType: rec.settlementType,
                                  paymentChannel: rec.paymentChannel,
                                  grossSalesCop: rec.grossSalesCop,
                                  cashSalesCop: rec.cashSalesCop,
                                  digitalSalesCop: rec.digitalSalesCop,
                                  cashCommissionCop: rec.cashCommissionCop,
                                  digitalCommissionCop: rec.digitalCommissionCop,
                                  wompiGatewayFeeCop: rec.wompiGatewayFeeCop || 0,
                                  autoOffsetCop: rec.autoOffsetCop,
                                  netAmountCop: rec.netAmountCop,
                                  notes: rec.notes
                                })
                              }
                              style={{ padding: '4px 10px', fontSize: '0.72rem', fontWeight: 800, borderRadius: '8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            >
                              <Download size={12} />
                              <span>Acta</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  ) : transactions.length > 0 ? (
                    transactions.map(tx => {
                      const methodEmoji = tx.paymentMethod === 'apple_pay' ? '🍏 Apple Pay' : tx.paymentMethod === 'google_pay' ? '🌐 GPay' : tx.paymentMethod === 'card' ? '💳 Tarjeta' : '📱 Wompi';
                      return (
                        <tr key={tx.id} style={{ borderBottom: '1px solid var(--neutral-border)' }}>
                          <td style={{ padding: '10px' }}>
                            <code style={{ color: 'var(--tertiary)', fontSize: '0.75rem' }}>{tx.id}</code>
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Auth: #{tx.authorizationCode}</div>
                          </td>
                          <td style={{ padding: '10px', color: 'white', fontWeight: 600 }}>
                            {tenants.find(t => t.id === tx.tenantId)?.name || 'Restaurante'}
                          </td>
                          <td style={{ padding: '10px', color: 'white' }}>Split Automático Pasarela</td>
                          <td style={{ padding: '10px', color: 'white', fontWeight: 600 }}>{methodEmoji}</td>
                          <td style={{ padding: '10px', textAlign: 'right', color: 'var(--secondary)', fontWeight: 700 }}>{formatCop(tx.restaurantPayout)}</td>
                          <td style={{ padding: '10px', textAlign: 'right', color: 'var(--tertiary)', fontWeight: 700 }}>{formatCop(tx.platformFee)}</td>
                          <td style={{ padding: '10px', textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.72rem' }}>Auto</td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={7} style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                        Aún no se han registrado cortes de liquidación manuales o dispersiones en este periodo.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmación de Dispersión / Conciliación Bancaria con Referencia Real y Acta */}
      {settlementModalRow && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(8, 12, 20, 0.85)', backdropFilter: 'blur(10px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.25rem', overflowY: 'auto' }}>
          <motion.div
            initial={{ scale: 0.94, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            style={{ background: '#0F172A', border: '1px solid rgba(56, 189, 248, 0.35)', borderRadius: '22px', padding: '1.75rem', maxWidth: '560px', width: '100%', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.6)' }}
          >
            {(() => {
              const isPayout = settlementModalRow.livePendingPayoutToRestaurantCop > 0;
              const netAmount = isPayout
                ? settlementModalRow.livePendingPayoutToRestaurantCop
                : settlementModalRow.livePendingDebtToPlatformCop;
              const isBusy = settlingRestaurantId === settlementModalRow.restaurantId;

              return (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '1rem' }}>
                    <div>
                      <span style={{ fontSize: '0.72rem', fontWeight: 900, textTransform: 'uppercase', color: isPayout ? '#10B981' : '#F59E0B', letterSpacing: '0.5px' }}>
                        {isPayout ? '🏦 Dispersión Bancaria a Restaurante' : '⚡ Conciliación de Comisión en Efectivo'}
                      </span>
                      <h3 style={{ fontSize: '1.25rem', fontWeight: 900, color: 'white', margin: '4px 0 0' }}>
                        {settlementModalRow.restaurantName}
                      </h3>
                    </div>
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => setSettlementModalRow(null)}
                      style={{ padding: '4px 10px', fontSize: '0.75rem', borderRadius: '8px' }}
                    >
                      Cerrar
                    </button>
                  </div>

                  {/* Resumen Contable del Corte */}
                  <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '12px 14px', marginBottom: '1rem', fontSize: '0.8rem', lineHeight: 1.6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Ventas Efectivo ({settlementModalRow.cashOrdersCount} ped.):</span>
                      <strong style={{ color: 'white' }}>{formatCopOrZero(settlementModalRow.cashSalesCop)} (3%: {formatCopOrZero(settlementModalRow.cashCommissionCop)})</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Ventas Digitales ({settlementModalRow.digitalOrdersCount} ped.):</span>
                      <strong style={{ color: '#38BDF8' }}>{formatCopOrZero(settlementModalRow.digitalSalesCop)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Costo Pasarela Wompi (2.65% + $700 + IVA):</span>
                      <strong style={{ color: '#94A3B8' }}>-{formatCopOrZero(settlementModalRow.wompiGatewayFeeCop)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Tu Utilidad Libre GastroSync (3% Total):</span>
                      <strong style={{ color: '#10B981' }}>{formatCopOrZero(settlementModalRow.totalCommissionCop)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Cruce Automático Efectivo vs. Digital:</span>
                      <strong style={{ color: '#A78BFA' }}>{formatCopOrZero(settlementModalRow.autoOffsetCop)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: '6px', paddingTop: '6px', fontSize: '0.92rem' }}>
                      <strong style={{ color: 'white' }}>
                        {isPayout ? 'Monto Neto a Dispersar al Restaurante:' : 'Comisión Neta Recibida del Restaurante:'}
                      </strong>
                      <strong style={{ color: isPayout ? '#10B981' : '#F59E0B' }}>
                        {formatCop(netAmount)}
                      </strong>
                    </div>
                  </div>

                  {/* Datos Bancarios Destino */}
                  {isPayout && (
                    <div style={{ background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: '12px', padding: '10px 12px', marginBottom: '1rem', fontSize: '0.78rem' }}>
                      <div style={{ fontWeight: 800, color: '#38BDF8', marginBottom: '2px' }}>
                        🏦 Cuenta de Dispersión Registrada por el Aliado:
                      </div>
                      {settlementModalRow.payoutAccountNumber ? (
                        <div style={{ color: 'white' }}>
                          <strong>{settlementModalRow.payoutBankName}</strong> ({settlementModalRow.payoutAccountType}) · Nº <code>{settlementModalRow.payoutAccountNumber}</code> · Titular: {settlementModalRow.payoutAccountHolder || settlementModalRow.restaurantName} ({settlementModalRow.payoutDocumentType || 'NIT'} {settlementModalRow.payoutDocumentNumber || 'S/N'})
                        </div>
                      ) : (
                        <div style={{ color: '#FCD34D' }}>
                          ⚠️ Este restaurante aún no ha guardado número de cuenta bancaria en su pestaña Finanzas. Verifica con el dueño antes de transferir.
                        </div>
                      )}
                    </div>
                  )}

                  {/* Controles de Canal, Referencia Bancaria Real y Notas */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '10px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '4px' }}>
                        Canal Bancario / Pasarela
                      </label>
                      <select
                        value={settlementChannelInput}
                        onChange={e => setSettlementChannelInput(e.target.value)}
                        style={{ width: '100%', padding: '9px 10px', borderRadius: '10px', background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.14)', color: 'white', fontSize: '0.82rem' }}
                      >
                        <option value="wompi_split">Wompi Split / Dispersión</option>
                        <option value="bancolombia">Transferencia Bancolombia</option>
                        <option value="nequi_instant">Nequi / Bre-B</option>
                        <option value="transferencia_bancaria">ACH / Otra Entidad Bancaria</option>
                        <option value="wompi_pse">PSE Conciliado</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '4px' }}>
                        Nº Comprobante / Referencia Real
                      </label>
                      <input
                        type="text"
                        value={settlementRefInput}
                        onChange={e => setSettlementRefInput(e.target.value)}
                        placeholder="Ej: 009482716 o GS-ADM-..."
                        style={{ width: '100%', padding: '9px 10px', borderRadius: '10px', fontSize: '0.82rem' }}
                      />
                    </div>
                  </div>

                  <div style={{ marginBottom: '10px' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '4px' }}>
                      Nota Contable / Observación para el Acta
                    </label>
                    <input
                      type="text"
                      value={settlementNotesInput}
                      onChange={e => setSettlementNotesInput(e.target.value)}
                      placeholder="Detalle del corte o período liquidado"
                      style={{ width: '100%', padding: '9px 10px', borderRadius: '10px', fontSize: '0.82rem' }}
                    />
                  </div>

                  {/* Nota de Protección Tributaria 4x1000 (GMF) */}
                  <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.22)', borderRadius: '10px', padding: '8px 12px', marginBottom: '12px', fontSize: '0.73rem', color: '#A7F3D0', lineHeight: 1.45 }}>
                    💡 <strong>Recordatorio 4x1000 (GMF):</strong> Si dispersas desde cuenta bancaria propia en lugar de <em>Wompi Split</em>, asegúrate de usar tu cuenta empresarial marcada como exenta del 4x1000 (hasta 350 UVT/mes) para que el 0.4% bancario no reduzca tu 3% libre.
                  </div>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'white', cursor: 'pointer', marginBottom: '1.25rem' }}>
                    <input
                      type="checkbox"
                      checked={downloadReceiptOnSave}
                      onChange={e => setDownloadReceiptOnSave(e.target.checked)}
                    />
                    <span>Descargar <strong>Acta de Liquidación (.html / PDF)</strong> automáticamente al confirmar</span>
                  </label>

                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => setSettlementModalRow(null)}
                      disabled={isBusy}
                      style={{ padding: '10px 16px', fontSize: '0.82rem', borderRadius: '10px' }}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => void handleExecuteAdminSettlement(settlementModalRow)}
                      disabled={isBusy}
                      style={{ padding: '10px 18px', fontSize: '0.84rem', fontWeight: 900, borderRadius: '10px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                      <CheckCircle size={16} />
                      <span>{isBusy ? 'Procesando...' : 'Confirmar y Registrar Corte'}</span>
                    </button>
                  </div>
                </>
              );
            })()}
          </motion.div>
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
              {activationSuccessInfo.message && (
                <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed rgba(255,255,255,0.1)', color: '#10B981', fontWeight: 700, fontSize: '0.85rem' }}>
                  🔑 {activationSuccessInfo.message}
                </div>
              )}
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

      {/* ── TAB 3: CENTRO DE SOPORTE HUMANO ── */}
      {activeTab === 'support' && (
        <div style={{ marginTop: '1.5rem' }}>
        <React.Suspense fallback={<FallbackLoader message="Cargando soporte..." />}>
          <AdminSupportTickets />
        </React.Suspense>
        </div>
      )}

      {/* ── TAB 4: MÉTRICAS DE SOPORTE ── */}
      {activeTab === 'metrics' && (
        <div style={{ marginTop: '1.5rem' }}>
        <React.Suspense fallback={<FallbackLoader message="Cargando métricas de soporte..." />}>
          <SupportMetricsPanel />
        </React.Suspense>
        </div>
      )}
    </div>
  );
};

export const SuperAdminView: React.FC = () => (
  <ErrorBoundary fallbackMessage="Error general en la vista de Super Admin.">
    <SuperAdminViewContent />
  </ErrorBoundary>
);
