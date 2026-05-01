/**
 * Wrapper contract types for AbacatePay — fully decoupled from SDK internals.
 *
 * SDK notes (abacatepay-nodejs-sdk@1.6.0):
 *   - pixQrCode.create does NOT accept externalId; callers must persist the
 *     returned `id` → orderId mapping themselves.
 *   - billing.create for card uses products[].externalId as the product ref.
 *   - All amounts are in cents (same as our contract).
 *   - taxId accepts raw digits (CPF "12345678900") or formatted — SDK passes it
 *     through to AbacatePay as-is.
 */

export type AbacateChargeStatus =
  | 'PENDING'
  | 'PAID'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'FAILED';

export interface AbacateCustomer {
  name: string;
  email: string;
  /** CPF digits only or formatted — SDK passes through as-is */
  taxId?: string;
  cellphone?: string;
}

// ---------------------------------------------------------------------------
// PIX
// ---------------------------------------------------------------------------

export interface PixChargeRequest {
  /** Amount in cents */
  amount: number;
  /**
   * Our internal order ID.
   * NOTE: AbacatePay pixQrCode endpoint does not store externalId — the caller
   * must persist the returned `id` → externalId mapping.
   */
  externalId: string;
  description: string;
  /** Seconds until the QR code expires */
  expiresIn: number;
  customer: AbacateCustomer;
}

export interface PixChargeResponse {
  /** AbacatePay charge ID (e.g. "pix_char_abc123") */
  id: string;
  /** EMV copy-paste string */
  brCode: string;
  /** Base64-encoded QR code image */
  brCodeBase64?: string;
  status: AbacateChargeStatus;
  /** ISO 8601 expiration timestamp */
  expiresAt: string;
}

// ---------------------------------------------------------------------------
// Card (hosted checkout)
// ---------------------------------------------------------------------------

export interface CardCheckoutRequest {
  /** Amount in cents */
  amount: number;
  /** Our internal order ID — used as products[0].externalId in the billing call */
  externalId: string;
  description: string;
  customer: AbacateCustomer;
  /** Where AbacatePay redirects when buyer clicks "Back" */
  returnUrl: string;
  /** Where AbacatePay redirects after successful payment */
  completionUrl?: string;
}

export interface CardCheckoutResponse {
  /** AbacatePay billing ID */
  id: string;
  /** Browser should be redirected here to complete payment */
  redirectUrl: string;
  status: AbacateChargeStatus;
}
