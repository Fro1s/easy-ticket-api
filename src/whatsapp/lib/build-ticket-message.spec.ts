import { buildTicketMessage } from './build-ticket-message';

const base = {
  buyerFirstName: 'Ana',
  eventArtist: 'Cama de Gato',
  eventTitle: 'Arraiá Cama de Gato',
  eventStartsAt: new Date('2026-08-01T22:00:00-03:00'),
  venueName: 'República',
  venueCity: 'Bauru',
  tickets: [
    { shortCode: 'ET-ABC123XYZ', sectorName: 'Pista', url: 'https://x.test/i/ET-ABC123XYZ' },
  ],
};

describe('buildTicketMessage', () => {
  it('includes greeting, event, venue, link and shortCode', () => {
    const msg = buildTicketMessage(base);
    expect(msg).toContain('Olá, Ana!');
    expect(msg).toContain('Cama de Gato');
    expect(msg).toContain('República, Bauru');
    expect(msg).toContain('https://x.test/i/ET-ABC123XYZ');
    expect(msg).toContain('ET-ABC123XYZ');
  });

  it('pluralizes for multiple tickets and lists every link', () => {
    const msg = buildTicketMessage({
      ...base,
      tickets: [
        { shortCode: 'ET-A', sectorName: 'Pista', url: 'https://x.test/i/ET-A' },
        { shortCode: 'ET-B', sectorName: 'Pista', url: 'https://x.test/i/ET-B' },
      ],
    });
    expect(msg).toContain('ingressos');
    expect(msg).toContain('https://x.test/i/ET-A');
    expect(msg).toContain('https://x.test/i/ET-B');
  });

  it('falls back to neutral greeting without first name', () => {
    const msg = buildTicketMessage({ ...base, buyerFirstName: null });
    expect(msg).toContain('Olá!');
  });
});
