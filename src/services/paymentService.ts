import type { PaymentMethod, Transaction } from '../types';

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

export class PaymentService {
  public static processPayment(params: ProcessPaymentParams): Promise<Transaction> {
    return new Promise((resolve) => {
      setTimeout(() => {
        const platformFee = Math.round(params.totalAmount * params.commissionRate);
        const restaurantPayout = params.totalAmount - platformFee;
        const authCode = Math.floor(100000 + Math.random() * 900000).toString();

        const transaction: Transaction = {
          id: `tx_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          orderId: params.orderId,
          tenantId: params.tenantId,
          amount: params.totalAmount,
          restaurantPayout,
          platformFee,
          paymentMethod: params.paymentMethod,
          status: 'approved',
          authorizationCode: authCode,
          timestamp: Date.now()
        };

        resolve(transaction);
      }, 1200);
    });
  }
}
