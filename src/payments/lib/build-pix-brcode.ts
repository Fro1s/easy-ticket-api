import { QrCodePix } from 'qrcode-pix';
import { PixKeyType } from '../../common/enums/pix-key-type.enum';

export interface PixBrCodeInput {
  key: string;
  keyType?: PixKeyType | null;
  holderName: string;
  city: string;
  amountCents: number;
  txid: string;
  message?: string;
}

const sanitize = (raw: string, maxLen: number): string =>
  raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .toUpperCase()
    .slice(0, maxLen);

const sanitizeTxid = (raw: string): string =>
  raw.replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || 'EASYTICKET';

/**
 * Normalize a PIX key to the format the Bacen EMV spec expects so the resulting
 * BR-Code is parseable by every bank app. Without this, e.g. a CPF with dots
 * ("123.456.789-00") or an uppercase UUID would produce an invalid copy-paste.
 */
function normalizeKey(raw: string, keyType?: PixKeyType | null): string {
  const trimmed = raw.trim();
  if (!keyType) {
    // Heuristic fallback: lowercase if it looks like a UUID/email, else digits.
    if (/^[0-9a-f-]+$/i.test(trimmed) && trimmed.includes('-')) {
      return trimmed.toLowerCase();
    }
    if (trimmed.includes('@')) return trimmed.toLowerCase();
    return trimmed;
  }
  switch (keyType) {
    case PixKeyType.CPF:
    case PixKeyType.CNPJ:
      return trimmed.replace(/\D/g, '');
    case PixKeyType.PHONE: {
      const digits = trimmed.replace(/\D/g, '');
      // BR phones in E.164: +55XXXXXXXXXXX. If the user already typed +55, keep it; else add it.
      return digits.startsWith('55') ? `+${digits}` : `+55${digits}`;
    }
    case PixKeyType.EMAIL:
      return trimmed.toLowerCase();
    case PixKeyType.RANDOM:
      return trimmed.toLowerCase();
    default:
      return trimmed;
  }
}

export function buildPixBrCode(input: PixBrCodeInput): string {
  const qr = QrCodePix({
    version: '01',
    key: normalizeKey(input.key, input.keyType),
    name: sanitize(input.holderName, 25),
    city: sanitize(input.city, 15),
    value: input.amountCents / 100,
    transactionId: sanitizeTxid(input.txid),
    message: input.message,
  });
  return qr.payload();
}
