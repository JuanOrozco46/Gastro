import type { PaymentMethod, Transaction } from '../types';
import { calculateOrderFinancialBreakdown } from '../utils/wompiFees';

export interface ProcessPaymentParams {
  orderId: string;
  tenantId: string;
  totalAmount: number;
  commissionRate: number; // e.g., 0.03
  paymentMethod: PaymentMethod;
  cardDetails?: {
    number: string;
    expMonth: string;
    expYear: string;
    cvc: string;
    holder: string;
  };
}

export class PaymentSimulatorService {
  /**
   * Simulador local de pasarela de pagos.
   * NO ESCRIBE EN SUPABASE, la escritura de pagos remotos se reserva a Edge Functions o Webhooks.
   * La inserción directa desde el navegador (cliente) está explícitamente bloqueada por RLS.
   */
  public static processPayment(params: ProcessPaymentParams): Promise<Transaction> {
    return new Promise((resolve) => {
      setTimeout(() => {
        const breakdown = calculateOrderFinancialBreakdown(
          params.totalAmount,
          params.paymentMethod,
          params.commissionRate
        );
        const authCode = `WOMPI_${Math.floor(100000 + Math.random() * 900000)}`;

        const transaction: Transaction = {
          id: `tx_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          orderId: params.orderId,
          tenantId: params.tenantId,
          amount: params.totalAmount,
          restaurantPayout: breakdown.restaurantNetCop,
          platformFee: breakdown.gastroSyncFeeCop,
          gatewayFee: breakdown.wompiTotalFeeCop,
          paymentMethod: params.paymentMethod,
          status: 'approved',
          authorizationCode: authCode,
          timestamp: Date.now()
        };

        resolve(transaction);
      }, 1000);
    });
  }
}
