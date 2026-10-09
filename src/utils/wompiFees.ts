/**
 * Motor de Cálculo Financiero Exacto (GastroSync 3% Neto + Pasarela Wompi 2.65% + $700 + IVA 19%)
 * Todos los cálculos se realizan en pesos colombianos enteros (COP) sin errores de punto flotante.
 */

export const GASTROSYNC_NET_RATE = 0.03; // 3.00% libre para GastroSync
export const WOMPI_BASE_PERCENT = 0.0265; // 2.65% comisión base Wompi
export const WOMPI_FIXED_COP = 700; // $700 COP comisión fija por transacción Wompi
export const COLOMBIA_IVA_RATE = 0.19; // 19% IVA sobre la comisión de pasarela Wompi
export const MIN_DIGITAL_PAYMENT_COP = 10000; // $10.000 COP monto mínimo para habilitar pasarela digital (protege al restaurante del cargo fijo de $700 + IVA)

export interface OrderFeeBreakdown {
  isCash: boolean;
  grossTotalCop: number;
  /** Comisión neta 100% libre para GastroSync (3%) */
  gastroSyncFeeCop: number;
  /** Comisión base de Wompi antes de IVA (2.65% + $700 COP en pagos digitales; $0 en efectivo) */
  wompiBaseFeeCop: number;
  /** IVA del 19% sobre la comisión de Wompi ($0 en efectivo) */
  wompiIvaCop: number;
  /** Costo total de pasarela Wompi con IVA incluido: ROUND((total * 0.0265 + 700) * 1.19) */
  wompiTotalFeeCop: number;
  /** Total descontado de la orden (3% GastroSync + Costo Wompi con IVA si es digital) */
  totalDeductionCop: number;
  /** Neto líquido que le queda al restaurante por esta orden */
  restaurantNetCop: number;
}

/**
 * Calcula el costo total de pasarela Wompi (2.65% + $700 COP + 19% IVA) para un monto dado.
 * Si el método de pago es efectivo ('cash') o el monto es <= 0, devuelve 0.
 */
export function calculateWompiGatewayFee(
  amountCop: number,
  paymentMethod?: string | null
): { baseFeeCop: number; ivaCop: number; totalGatewayFeeCop: number } {
  const normalizedMethod = (paymentMethod || 'cash').toLowerCase().trim();
  if (normalizedMethod === 'cash' || amountCop <= 0) {
    return { baseFeeCop: 0, ivaCop: 0, totalGatewayFeeCop: 0 };
  }

  const rawBase = amountCop * WOMPI_BASE_PERCENT + WOMPI_FIXED_COP;
  const baseFeeCop = Math.round(rawBase);
  const totalGatewayFeeCop = Math.round(rawBase * (1 + COLOMBIA_IVA_RATE));
  const ivaCop = Math.max(0, totalGatewayFeeCop - baseFeeCop);

  return {
    baseFeeCop,
    ivaCop,
    totalGatewayFeeCop
  };
}

/**
 * Desglosa exactamente cuánto gana GastroSync (3% libre), cuánto cobra Wompi (2.65% + $700 + IVA)
 * y cuánto recibe neto el restaurante en cualquier pedido.
 */
export function calculateOrderFinancialBreakdown(
  totalCop: number,
  paymentMethod?: string | null,
  commissionRate: number = GASTROSYNC_NET_RATE
): OrderFeeBreakdown {
  if (totalCop <= 0) {
    return {
      isCash: (paymentMethod || 'cash') === 'cash',
      grossTotalCop: 0,
      gastroSyncFeeCop: 0,
      wompiBaseFeeCop: 0,
      wompiIvaCop: 0,
      wompiTotalFeeCop: 0,
      totalDeductionCop: 0,
      restaurantNetCop: 0
    };
  }

  const normalizedMethod = (paymentMethod || 'cash').toLowerCase().trim();
  const isCash = normalizedMethod === 'cash';

  // 1. Comisión libre para GastroSync (3% exacto)
  const gastroSyncFeeCop = Math.round(totalCop * commissionRate);

  // 2. Costo de pasarela Wompi (solo aplica a pagos digitales: 2.65% + $700 + IVA 19%)
  const { baseFeeCop, ivaCop, totalGatewayFeeCop } = calculateWompiGatewayFee(totalCop, normalizedMethod);

  // 3. Deducción total y neto del restaurante
  const totalDeductionCop = gastroSyncFeeCop + totalGatewayFeeCop;
  const restaurantNetCop = Math.max(0, totalCop - totalDeductionCop);

  return {
    isCash,
    grossTotalCop: totalCop,
    gastroSyncFeeCop,
    wompiBaseFeeCop: baseFeeCop,
    wompiIvaCop: ivaCop,
    wompiTotalFeeCop: totalGatewayFeeCop,
    totalDeductionCop,
    restaurantNetCop
  };
}

export interface SettlementReceiptData {
  referenceCode: string;
  createdAt: string;
  restaurantName: string;
  settlementType: 'platform_payout_to_restaurant' | 'restaurant_payment_to_platform' | 'auto_netted_zero_cut';
  paymentChannel: string;
  grossSalesCop: number;
  cashSalesCop: number;
  digitalSalesCop: number;
  cashCommissionCop: number;
  digitalCommissionCop: number;
  wompiGatewayFeeCop: number;
  autoOffsetCop: number;
  netAmountCop: number;
  notes?: string;
  bankDetails?: string;
}

/**
 * Genera y descarga un Acta de Liquidación y Cruce de Saldos en formato HTML imprimible a PDF
 * para soporte contable del restaurante y de GastroSync.
 */
export function downloadSettlementReceiptHtml(data: SettlementReceiptData): void {
  const fmt = (n: number) => `$${Math.round(n || 0).toLocaleString('es-CO')} COP`;
  const typeLabel =
    data.settlementType === 'platform_payout_to_restaurant'
      ? 'DISPERSIÓN BANCARIA AL RESTAURANTE (NETO TRAS CRUCE)'
      : data.settlementType === 'restaurant_payment_to_platform'
      ? 'RECAUDO DE COMISIÓN EN EFECTIVO (3% GASTROSYNC)'
      : 'CORTE CONCILIADO EN CERO ($0)';

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Acta de Liquidación ${data.referenceCode} - ${data.restaurantName}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; color: #0f172a; padding: 32px; }
    .sheet { max-width: 720px; margin: 0 auto; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 16px; padding: 32px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 20px; }
    .brand { font-size: 22px; font-weight: 900; color: #0f172a; }
    .badge { display: inline-block; background: #dcfce7; color: #166534; font-weight: 800; font-size: 12px; padding: 4px 10px; border-radius: 999px; }
    table { width: 100%; border-collapse: collapse; margin: 18px 0; font-size: 14px; }
    th, td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; text-align: left; }
    th { background: #f1f5f9; font-weight: 700; color: #334155; }
    .right { text-align: right; }
    .total-box { background: #0f172a; color: #ffffff; padding: 18px 20px; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; margin-top: 20px; }
    .note { margin-top: 18px; font-size: 12px; color: #475569; line-height: 1.5; background: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0; }
    @media print { body { background: #fff; padding: 0; } .sheet { box-shadow: none; border: none; } }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="header">
      <div>
        <div class="brand">GASTROSYNC COLOMBIA · ACTA DE LIQUIDACIÓN</div>
        <div style="font-size: 13px; color: #475569; margin-top: 4px;">Soporte Contable de Cruce Automático (Efectivo vs. Pasarela Wompi)</div>
      </div>
      <div style="text-align: right;">
        <span class="badge">CONCILIADO</span>
        <div style="font-size: 13px; font-weight: 800; margin-top: 6px;">Ref: ${data.referenceCode}</div>
        <div style="font-size: 12px; color: #64748b;">Fecha: ${new Date(data.createdAt).toLocaleString('es-CO')}</div>
      </div>
    </div>

    <div style="font-size: 14px; line-height: 1.6; margin-bottom: 16px;">
      <div><strong>Restaurante Aliado:</strong> ${data.restaurantName}</div>
      <div><strong>Tipo de Operación:</strong> ${typeLabel}</div>
      <div><strong>Canal Bancario / Pasarela:</strong> ${data.paymentChannel.toUpperCase()}</div>
      ${data.bankDetails ? `<div><strong>Cuenta Destino Registrada:</strong> ${data.bankDetails}</div>` : ''}
      ${data.notes ? `<div><strong>Observaciones / Comprobante:</strong> ${data.notes}</div>` : ''}
    </div>

    <table>
      <thead>
        <tr>
          <th>Concepto Contable</th>
          <th class="right">Valor (COP)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Ventas Brutas Totales del Periodo</td>
          <td class="right"><strong>${fmt(data.grossSalesCop)}</strong></td>
        </tr>
        <tr>
          <td>├─ Ventas en Efectivo (Cobradas en caja por el restaurante)</td>
          <td class="right">${fmt(data.cashSalesCop)}</td>
        </tr>
        <tr>
          <td>└─ Ventas Digitales (Recaudadas vía Pasarela Wompi)</td>
          <td class="right">${fmt(data.digitalSalesCop)}</td>
        </tr>
        <tr>
          <td>(-) Costo Pasarela Wompi en Ventas Digitales (2.65% + $700 + IVA 19%)</td>
          <td class="right">-${fmt(data.wompiGatewayFeeCop)}</td>
        </tr>
        <tr>
          <td>(-) Comisión GastroSync 3.0% sobre Ventas Digitales</td>
          <td class="right">-${fmt(data.digitalCommissionCop)}</td>
        </tr>
        <tr>
          <td>(-) Comisión GastroSync 3.0% sobre Ventas en Efectivo</td>
          <td class="right">-${fmt(data.cashCommissionCop)}</td>
        </tr>
        <tr>
          <td><strong>Cruce Automático Aplicado (Efectivo descontado del recaudo digital)</strong></td>
          <td class="right"><strong>${fmt(data.autoOffsetCop)}</strong></td>
        </tr>
      </tbody>
    </table>

    <div class="total-box">
      <div>
        <div style="font-size: 12px; text-transform: uppercase; color: #94a3b8; font-weight: 700;">Monto Neto Liquidado en esta Operación</div>
        <div style="font-size: 13px; color: #cbd5e1;">Comisión Total Libre GastroSync (3%): ${fmt(data.cashCommissionCop + data.digitalCommissionCop)}</div>
      </div>
      <div style="font-size: 24px; font-weight: 900; color: #4ade80;">${fmt(data.netAmountCop)}</div>
    </div>

    <div class="note">
      <strong>Nota Legal y Tributaria (Colombia):</strong> En pedidos en efectivo aplica únicamente el 3.0% de comisión tecnológica GastroSync. En pedidos digitales procesados por Wompi (Bancolombia) aplica la tarifa de pasarela (2.65% + $700 COP + IVA del 19%) más el 3.0% de comisión libre de GastroSync. Para optimizar el 4x1000 (GMF), se recomienda mantener la cuenta bancaria empresarial marcada como exenta de GMF (hasta 350 UVT/mes) o dispersar directamente vía Wompi Split Payments.
    </div>
  </div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `acta-liquidacion-${data.referenceCode.toLowerCase()}.html`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Genera una referencia única de liquidación para cortes administrativos o pagos de comisión.
 */
export function generateSettlementRef(prefix = 'GS-ADM'): string {
  return `${prefix}-${Date.now().toString().slice(-6)}`;
}
