import { QrCodePix } from 'qrcode-pix';

export interface PixBrCodeInput {
  key: string;
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

export function buildPixBrCode(input: PixBrCodeInput): string {
  const qr = QrCodePix({
    version: '01',
    key: input.key,
    name: sanitize(input.holderName, 25),
    city: sanitize(input.city, 15),
    value: input.amountCents / 100,
    transactionId: sanitizeTxid(input.txid),
    message: input.message,
  });
  return qr.payload();
}
