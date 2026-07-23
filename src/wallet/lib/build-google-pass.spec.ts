import { buildGoogleWalletPayload } from './build-google-pass';

const input = {
  issuerId: '338800001234',
  ticketId: 'tick1',
  eventId: 'ev1',
  eventTitle: 'Arraiá Cama de Gato',
  eventArtist: 'Cama de Gato',
  startsAtIso: '2026-08-01T22:00:00-03:00',
  venueName: 'República',
  venueCity: 'Bauru',
  sectorName: 'Pista',
  shortCode: 'ET-ABC123XYZ',
  qrToken: 'et:o1:tok1',
  holderName: 'Ana Lima',
};

describe('buildGoogleWalletPayload', () => {
  it('builds class + object with issuer-prefixed ids', () => {
    const p = buildGoogleWalletPayload(input);
    expect(p.eventTicketClasses).toHaveLength(1);
    expect(p.eventTicketObjects).toHaveLength(1);
    const cls = p.eventTicketClasses[0] as { id: string };
    const obj = p.eventTicketObjects[0] as { id: string; classId: string };
    expect(cls.id).toBe('338800001234.easy-ticket-ev1');
    expect(obj.id).toBe('338800001234.tick1');
    expect(obj.classId).toBe(cls.id);
  });

  it('puts the raw qrToken in the QR barcode with shortCode as alt text', () => {
    const obj = buildGoogleWalletPayload(input).eventTicketObjects[0] as {
      barcode: { type: string; value: string; alternateText: string };
      state: string;
    };
    expect(obj.barcode).toEqual({
      type: 'QR_CODE',
      value: 'et:o1:tok1',
      alternateText: 'ET-ABC123XYZ',
    });
    expect(obj.state).toBe('ACTIVE');
  });
});
