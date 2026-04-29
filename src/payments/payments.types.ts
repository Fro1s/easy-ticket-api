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
}

export interface PaymentChargeInfo {
  provider: string;
  paymentId: string;
  method: PaymentMethod;
  status: 'PENDING' | 'PAID' | 'EXPIRED' | 'FAILED';
  /**
   * For PIX: the EMV "copy-paste" string the buyer scans/copies.
   * For CARD/BOLETO: provider-specific token or boleto digitable line.
   */
  copyPaste: string | null;
  /** UNIX-style ISO date when the payment session expires. */
  expiresAt: string;
}

export interface PaymentsProvider {
  readonly name: string;
  createCharge(input: CreatePaymentInput): Promise<PaymentChargeInfo>;
}
