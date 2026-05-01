import { PaymentMethod } from '../common/enums/payment-method.enum';
import { PaymentProvider } from '../common/enums/payment-provider.enum';
import { PixKeyType } from '../common/enums/pix-key-type.enum';

export interface PaymentEventContext {
  id: string;
  paymentProvider: PaymentProvider;
  pixKey: string | null;
  pixKeyType: PixKeyType | null;
  pixHolderName: string | null;
  venueCity?: string | null;
}

export interface CreatePaymentInput {
  orderId: string;
  totalCents: number;
  method: PaymentMethod;
  buyerEmail: string;
  buyerName: string | null;
  buyerCpf: string | null;
  event: PaymentEventContext;
  /** Optional card token — reserved for future direct-card flows. */
  cardToken?: string;
  /** Optional override for hosted-checkout success redirect (e.g. AbacatePay card). */
  successUrl?: string;
  /** Optional override for hosted-checkout cancel/back redirect. */
  cancelUrl?: string;
}

export interface PaymentChargeInfo {
  provider: string;
  paymentId: string;
  method: PaymentMethod;
  status: 'PENDING' | 'PAID' | 'EXPIRED' | 'FAILED';
  /**
   * For PIX: the EMV "copy-paste" string the buyer scans/copies.
   * For CARD: null (buyer is redirected via redirectUrl).
   */
  copyPaste: string | null;
  /** UNIX-style ISO date when the payment session expires. */
  expiresAt: string;
  /** For hosted-checkout flows (e.g., card): URL the buyer should be redirected to. Null for inline PIX. */
  redirectUrl?: string | null;
}

export interface PaymentsProvider {
  readonly name: string;
  createCharge(input: CreatePaymentInput): Promise<PaymentChargeInfo>;
}
